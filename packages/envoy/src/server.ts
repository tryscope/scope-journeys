import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { createHash, randomBytes } from "node:crypto";

import { DEFAULT_API_URL, VERSION, assertionFromEnv, loadPolicy, secureUrl, classifyRoute, effectiveMode, isTextFace, observe, observeResponse, type CompiledPolicy, type Environment, type Io, type LogLevel, type Observation, type Responded, type ScopeDecision1, type SensorRecord, type State } from "scope-journeys";

import { memoryCache } from "./cache.js";
import { deliver, droppedSoFar } from "./deliver.js";
import { platformFacts } from "./facts.js";

// The wire messages (proto/envoy/..., trimmed from Envoy's api tree): the fields this processor reads and writes.
export interface HeaderValue {
  key: string;
  value?: string;
  raw_value?: Buffer | Uint8Array;
}
export interface HeaderMap {
  headers?: HeaderValue[];
}
export interface HttpHeaders {
  headers?: HeaderMap;
  end_of_stream?: boolean;
}
export interface HttpBody {
  body?: Buffer | Uint8Array;
  end_of_stream?: boolean;
}
export interface ProcessingRequest {
  request?: "request_headers" | "response_headers" | "request_body" | "response_body" | "request_trailers" | "response_trailers";
  request_headers?: HttpHeaders;
  response_headers?: HttpHeaders;
  request_body?: HttpBody;
  response_body?: HttpBody;
  request_trailers?: { trailers?: HeaderMap };
  response_trailers?: { trailers?: HeaderMap };
  observability_mode?: boolean;
}
export interface HeaderValueOption {
  header: HeaderValue;
  append_action?: number;
}
export interface HeaderMutation {
  set_headers?: HeaderValueOption[];
  remove_headers?: string[];
}
export interface CommonResponse {
  status?: number;
  header_mutation?: HeaderMutation;
  body_mutation?: { body?: Buffer; clear_body?: boolean };
}
export interface ProcessingMode {
  request_body_mode?: number;
  response_body_mode?: number;
}
export interface ProcessingResponse {
  request_headers?: { response: CommonResponse };
  response_headers?: { response: CommonResponse };
  request_body?: { response: CommonResponse };
  response_body?: { response: CommonResponse };
  request_trailers?: Record<string, never>;
  response_trailers?: Record<string, never>;
  immediate_response?: { status: { code: number }; headers?: HeaderMutation; body?: Buffer };
  mode_override?: ProcessingMode;
}

/** ProcessingMode.BodySendMode and HeaderValueOption.HeaderAppendAction, as upstream numbers them. */
export const BODY_MODE = { NONE: 0, STREAMED: 1, BUFFERED: 2 } as const;
const OVERWRITE_IF_EXISTS_OR_ADD = 2;
const CONTINUE = 0;

const PROTO_ROOT = new URL("../proto/", import.meta.url).pathname;
const definition = protoLoader.loadSync("envoy/service/ext_proc/v3/external_processor.proto", { includeDirs: [PROTO_ROOT], keepCase: true, defaults: false, oneofs: true, longs: String });
const loaded = grpc.loadPackageDefinition(definition) as unknown as { envoy: { service: { ext_proc: { v3: { ExternalProcessor: grpc.ServiceClientConstructor } } } } };
/** The service definition, for the server here and for a client that speaks to it (the tests' Envoy stand-in). */
export const ExternalProcessor = loaded.envoy.service.ext_proc.v3.ExternalProcessor;

/** Headers the processor never asks Envoy to change: the pseudo headers, the hop's framing (Envoy's), and Envoy's own. */
const PROTECTED = new Set(["host", "content-length", "transfer-encoding", "connection", "keep-alive", "te", "trailer", "upgrade", "proxy-connection"]);
const protectedName = (name: string): boolean => name.startsWith(":") || name.startsWith("x-envoy-") || PROTECTED.has(name);

const valueOf = (h: HeaderValue): string => (h.raw_value !== undefined ? Buffer.from(h.raw_value).toString("latin1") : (h.value ?? ""));

/** Envoy's header map as a Headers plus the pseudo headers, kept apart. */
export function parseHeaders(map: HeaderMap | undefined): { headers: Headers; pseudo: Record<string, string> } {
  const headers = new Headers();
  const pseudo: Record<string, string> = {};
  for (const h of map?.headers ?? []) {
    const key = h.key.toLowerCase();
    if (key.startsWith(":")) pseudo[key] = valueOf(h);
    else headers.append(key, valueOf(h));
  }
  return { headers, pseudo };
}

const setHeader = (name: string, value: string): HeaderValueOption => ({ header: { key: name, raw_value: Buffer.from(value, "latin1") }, append_action: OVERWRITE_IF_EXISTS_OR_ADD });

/** What Envoy must change so the message leaves as the core built it: the headers whose value differs, the ones the core dropped. */
export function mutationBetween(incoming: Headers, outbound: Headers): HeaderMutation | undefined {
  const set_headers: HeaderValueOption[] = [];
  const remove_headers: string[] = [];
  outbound.forEach((value, name) => {
    if (protectedName(name)) return;
    if (incoming.get(name) !== value) set_headers.push(setHeader(name, value));
  });
  incoming.forEach((_value, name) => {
    if (protectedName(name)) return;
    if (!outbound.has(name)) remove_headers.push(name);
  });
  if (set_headers.length === 0 && remove_headers.length === 0) return undefined;
  return { ...(set_headers.length ? { set_headers } : {}), ...(remove_headers.length ? { remove_headers } : {}) };
}

export interface ProcessorOptions {
  env?: Record<string, string | undefined>;
  name?: string;
  apiUrl?: string;
  policyUrl?: string;
  installId?: string;
  environment?: Environment;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (level: LogLevel, line: string) => void;
  /** Called with every delivery the processor starts, so a drain can wait for them. */
  track?: (pending: Promise<void>) => void;
}

interface Loaded {
  policy: CompiledPolicy;
  environment: Environment;
  saltEpoch: number;
}

export interface Processor {
  /** One Envoy stream (one HTTP request) handled: the messages in, the responses out. */
  process(call: grpc.ServerDuplexStream<ProcessingRequest, ProcessingResponse>): void;
}

const stderr = (level: LogLevel, line: string): void => {
  process.stderr.write(`${level === "info" ? "" : `${level}: `}${line}\n`);
};

/**
 * The core as an external processor: `observe` runs when the request's body message
 * arrives (or the headers message when the route needs no body), `observeResponse` when the
 * response's body message arrives; a forward outcome becomes a header (and body) mutation, an
 * answer outcome an immediate response. A server-sent event stream is forwarded as it arrives and
 * never rewritten; the gate's decision says so (`skipped`, `streamed_body`).
 */
export function createProcessor(options: ProcessorOptions = {}): Processor {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? stderr;
  const track = options.track ?? (() => undefined);
  const name = options.name ?? env.JOURNEYS_NAME ?? "scope-journeys";
  const installId = options.installId ?? env.JOURNEYS_INSTALL_ID ?? null;
  const apiUrl = secureUrl(options.apiUrl ?? env.JOURNEYS_API_URL ?? DEFAULT_API_URL, "JOURNEYS_API_URL", (line) => log("warn", line));
  const key = env.JOURNEYS_INSTALL_KEY ?? null;
  const salt = env.JOURNEYS_SALT ?? null;
  const policyUrl = options.policyUrl ?? env.JOURNEYS_POLICY_URL ?? (apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}/policy` : null);
  const issuer = apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}` : null;
  const cache = memoryCache(now);
  const warn = (line: string): void => log("warn", line);
  let warnedNoInstall = false;
  let warnedNoSalt = false;

  const load = async (): Promise<Loaded> => {
    if (!installId && !policyUrl && !warnedNoInstall) {
      warnedNoInstall = true;
      warn("journeys: JOURNEYS_INSTALL_ID is not set; forwarding every request untouched under the default policy (run `npx scope-journeys init --envoy`)");
    }
    const state = await loadPolicy({ url: policyUrl, credential: key, fetch: fetchFn, now: now(), cache, log: warn });
    let policy = state.policy;
    if (!salt) {
      if (!warnedNoSalt) {
        warnedNoSalt = true;
        warn("journeys: JOURNEYS_SALT is not set; running the forward-only default policy (run `npx scope-journeys init --envoy`)");
      }
      policy = (await loadPolicy({ url: null, credential: null, fetch: fetchFn, now: now(), cache: null, log: () => undefined })).policy;
    }
    return { policy, environment: (state.environment ?? options.environment ?? env.JOURNEYS_ENVIRONMENT ?? "production") as Environment, saltEpoch: state.saltEpoch ?? 1 };
  };

  const io = (host: string): Io => ({
    now,
    random: (bytes) => new Uint8Array(randomBytes(bytes)),
    hash: async (value) => createHash("sha256").update(`${salt ?? ""}:${value}`).digest("hex").slice(0, 12),
    // The hop is Envoy's: the core never asks this io to forward, except for a signer's key directory on another host.
    forward: async (outbound) => {
      if (new URL(outbound.url).host === host) throw new Error("journeys: the processor does not forward; Envoy does");
      return fetchFn(outbound.url, { method: outbound.method, headers: outbound.headers, redirect: "manual", signal: AbortSignal.timeout(2_000) });
    },
    cache,
    ship: (records: readonly SensorRecord[]) => {
      track(deliver(records, { apiUrl, key, fetch: fetchFn, log: warn }).catch((error: unknown) => warn(`journeys: shipment failed (${error instanceof Error ? error.message : String(error)})`)));
    },
    log,
  });

  return {
    process(call) {
      const exchange = new Exchange({ load, io, name, installId, issuer, env, log, write: (response) => call.write(response) });
      call.on("data", (message: ProcessingRequest) => exchange.push(message));
      call.on("end", () => {
        void exchange.settled().then(() => call.end());
      });
      call.on("error", (error: Error) => {
        if (!/cancelled/i.test(error.message)) log("warn", `journeys: the stream from Envoy failed: ${error.message}`);
        exchange.abort();
      });
    },
  };
}

interface ExchangeDeps {
  load: () => Promise<Loaded>;
  io: (host: string) => Io;
  name: string;
  installId: string | null;
  issuer: string | null;
  env: Record<string, string | undefined>;
  log: (level: LogLevel, line: string) => void;
  write: (response: ProcessingResponse) => void;
}

const bodyless = (method: string): boolean => method === "GET" || method === "HEAD";

/** The messages of one HTTP request, handled in order; a failure in any of them answers CONTINUE so Envoy proceeds untouched. */
class Exchange {
  private queue: Promise<void> = Promise.resolve();
  private method = "GET";
  private url: URL | null = null;
  private requestHeaders = new Headers();
  private requestChunks: Buffer[] = [];
  private loaded: Loaded | null = null;
  private state: State | null = null;
  private forwardedBody: Buffer | null = null;
  private responseStatus = 200;
  private responseHeaders = new Headers();
  private responseChunks: Buffer[] = [];
  private responseMode: "none" | "buffered" | "streamed" = "none";
  private streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private aborted = false;

  constructor(private readonly deps: ExchangeDeps) {}

  push(message: ProcessingRequest): void {
    this.queue = this.queue.then(() => this.handle(message)).catch((error: unknown) => {
      this.deps.log("error", `journeys: the processor failed on ${message.request ?? "a message"}, continuing untouched: ${error instanceof Error ? error.message : String(error)}`);
      this.write(continueFor(message));
    });
  }

  settled(): Promise<void> {
    return this.queue;
  }

  abort(): void {
    this.aborted = true;
    try {
      this.streamController?.close();
    } catch {
      // Already closed.
    }
  }

  private write(response: ProcessingResponse): void {
    if (!this.aborted) this.deps.write(response);
  }

  private async handle(message: ProcessingRequest): Promise<void> {
    switch (message.request) {
      case "request_headers":
        return this.onRequestHeaders(message.request_headers ?? {});
      case "request_body":
        return this.onRequestBody(message.request_body ?? {});
      case "response_headers":
        return this.onResponseHeaders(message.response_headers ?? {});
      case "response_body":
        return this.onResponseBody(message.response_body ?? {});
      case "request_trailers":
        return this.write({ request_trailers: {} });
      case "response_trailers":
        return this.write({ response_trailers: {} });
      default:
        return undefined;
    }
  }

  private async onRequestHeaders(message: HttpHeaders): Promise<void> {
    const { headers, pseudo } = parseHeaders(message.headers);
    this.method = pseudo[":method"] ?? "GET";
    this.requestHeaders = headers;
    const authority = pseudo[":authority"] ?? headers.get("host") ?? "localhost";
    this.url = new URL(`${pseudo[":scheme"] ?? "http"}://${authority}${pseudo[":path"] ?? "/"}`);
    this.loaded = await this.deps.load();
    if (message.end_of_stream || bodyless(this.method)) return this.observeNow(null, "request_headers");
    // The route decides whether the body is read: observed routes (the API, the MCP server, the
    // finder) are buffered; everything else flows to the origin without a message here.
    const policy = this.loaded.policy;
    const path = this.url.pathname;
    const prefixed = policy.runPrefix?.exec(path);
    const route = classifyRoute(prefixed ? (prefixed[2] ?? "") || "/" : path, policy);
    if (!route.observed) return this.observeNow(null, "request_headers");
    this.write({ request_headers: { response: { status: CONTINUE } }, mode_override: { request_body_mode: BODY_MODE.BUFFERED } });
  }

  private async onRequestBody(message: HttpBody): Promise<void> {
    if (message.body?.length) this.requestChunks.push(Buffer.from(message.body));
    if (!message.end_of_stream) return this.write({ request_body: { response: { status: CONTINUE } } });
    return this.observeNow(Buffer.concat(this.requestChunks), "request_body");
  }

  private async observeNow(body: Buffer | null, answerAs: "request_headers" | "request_body"): Promise<void> {
    const loaded = this.loaded ?? (await this.deps.load());
    const url = this.url ?? new URL("http://localhost/");
    const policy = loaded.policy;
    const io = this.deps.io(url.host);
    const identity = { install: this.deps.installId, name: this.deps.name, environment: loaded.environment, saltEpoch: loaded.saltEpoch, dropped: droppedSoFar(), version: VERSION, assertion: await assertionFromEnv(this.deps.env.JOURNEYS_ASSERTION_KEY, this.deps.issuer) };
    const facts = platformFacts(this.requestHeaders, identity);
    const request = new Request(url, { method: this.method, headers: this.requestHeaders, body: body && !bodyless(this.method) ? new Uint8Array(body) : null, redirect: "manual" });
    const observed: Observation = await observe(request, policy, facts, io);
    this.state = observed.state;
    if (observed.kind === "answer") {
      const response = observed.response;
      const set_headers: HeaderValueOption[] = [];
      response.headers.forEach((value, name) => set_headers.push(setHeader(name, value)));
      const bytes = Buffer.from(await response.arrayBuffer());
      this.write({ immediate_response: { status: { code: response.status }, ...(set_headers.length ? { headers: { set_headers } } : {}), ...(bytes.length ? { body: bytes } : {}) } });
      return;
    }
    const outbound = new Headers(observed.request.headers);
    const header_mutation = mutationBetween(this.requestHeaders, outbound);
    const common: CommonResponse = { status: CONTINUE, ...(header_mutation ? { header_mutation } : {}) };
    if (body && observed.request.body) {
      const forwarded = Buffer.from(await observed.request.arrayBuffer());
      if (!forwarded.equals(body)) {
        // Envoy refuses a mutated body whose length disagrees with content-length, so the header follows the body.
        this.forwardedBody = forwarded;
        common.body_mutation = { body: forwarded };
        if (this.requestHeaders.has("content-length")) common.header_mutation = { ...(common.header_mutation ?? {}), set_headers: [...(common.header_mutation?.set_headers ?? []), setHeader("content-length", String(forwarded.length))] };
      }
    }
    this.write(answerAs === "request_body" ? { request_body: { response: common } } : { request_headers: { response: common } });
  }

  private async onResponseHeaders(message: HttpHeaders): Promise<void> {
    const { headers, pseudo } = parseHeaders(message.headers);
    this.responseStatus = Number(pseudo[":status"]) || 200;
    this.responseHeaders = headers;
    const state = this.state;
    if (!state || state.passthrough) {
      if (state) this.finishResponse(new Response(null, { status: this.responseStatus, headers })); // nothing recorded for a passthrough route
      return this.write({ response_headers: { response: { status: CONTINUE } } });
    }
    if (message.end_of_stream || bodyless(this.method) && this.method === "HEAD" || this.responseStatus === 204 || this.responseStatus === 304) {
      this.finishResponse(new Response(null, { status: this.responseStatus, headers }));
      return this.write({ response_headers: { response: { status: CONTINUE } } });
    }
    const resType = headers.get("content-type") ?? "";
    const policy = state.policy;
    if (/text\/event-stream/.test(resType)) {
      // The stream is forwarded as it arrives and never rewritten: the gate's amendment and the
      // appended local answers are not applied on this form, and the decision says so.
      if (state.gate) {
        const decision: ScopeDecision1 = { rule: state.gate.id, kind: "gate", mode: effectiveMode(state.gate, state.facts.environment), outcome: "skipped", reason: "streamed_body" };
        state.decisions.push(decision);
        state.gate = null;
        state.locals = [];
      }
      this.responseMode = "streamed";
      const stream = new ReadableStream<Uint8Array>({ start: (controller) => (this.streamController = controller) });
      this.finishResponse(new Response(stream, { status: this.responseStatus, headers }));
      return this.write({ response_headers: { response: { status: CONTINUE } }, mode_override: { response_body_mode: BODY_MODE.STREAMED } });
    }
    const content = state.route.content;
    const isGet = state.method === "GET";
    const page = content && isGet && this.responseStatus === 200 && (/text\/(html|markdown)/.test(resType) || (isTextFace(state.path, policy) && /text\/plain/.test(resType)));
    const notfound = content && isGet && this.responseStatus === 404 && policy.rules.some((r) => r.kind === "notfound");
    const observedAnswer = (state.route.observed || this.responseStatus >= 400) && /json|text\/plain|html/.test(resType);
    if (page || notfound || observedAnswer) {
      this.responseMode = "buffered";
      return this.write({ response_headers: { response: { status: CONTINUE } }, mode_override: { response_body_mode: BODY_MODE.BUFFERED } });
    }
    this.responseMode = "none";
    this.finishResponse(new Response(null, { status: this.responseStatus, headers }));
    this.write({ response_headers: { response: { status: CONTINUE } } });
  }

  private async onResponseBody(message: HttpBody): Promise<void> {
    if (this.responseMode === "streamed") {
      if (message.body?.length) this.streamController?.enqueue(new Uint8Array(message.body));
      if (message.end_of_stream) {
        try {
          this.streamController?.close();
        } catch {
          // Already closed by an abort.
        }
      }
      return this.write({ response_body: { response: { status: CONTINUE } } });
    }
    if (message.body?.length) this.responseChunks.push(Buffer.from(message.body));
    if (!message.end_of_stream) return this.write({ response_body: { response: { status: CONTINUE } } });
    const state = this.state;
    const original = Buffer.concat(this.responseChunks);
    if (!state) return this.write({ response_body: { response: { status: CONTINUE } } });
    const responded = this.finishResponse(new Response(new Uint8Array(original), { status: this.responseStatus, headers: this.responseHeaders }));
    const out = Buffer.from(await responded.response.arrayBuffer());
    const common: CommonResponse = { status: CONTINUE };
    const header_mutation = mutationBetween(this.responseHeaders, responded.response.headers);
    if (!out.equals(original)) {
      common.body_mutation = { body: out };
      const remove = ["content-length", "content-encoding", "transfer-encoding"].filter((n) => this.responseHeaders.has(n));
      const mutation: HeaderMutation = { ...(header_mutation ?? {}) };
      if (remove.length) mutation.remove_headers = [...new Set([...(mutation.remove_headers ?? []), ...remove])];
      if (mutation.set_headers?.length || mutation.remove_headers?.length) common.header_mutation = mutation;
    } else if (header_mutation) common.header_mutation = header_mutation;
    this.write({ response_body: { response: common } });
  }

  /** The core's response path on what Envoy showed; the record finishes and ships from inside the core. A streamed body is drained so the tee never backs up. */
  private finishResponse(upstream: Response): Responded {
    const state = this.state as State;
    const responded = observeResponse(upstream, state);
    if (this.responseMode === "streamed" && responded.response.body) void responded.response.body.pipeTo(new WritableStream()).catch(() => undefined);
    return responded;
  }
}

/** The answer that lets Envoy proceed untouched for whatever message failed. */
function continueFor(message: ProcessingRequest): ProcessingResponse {
  switch (message.request) {
    case "request_headers":
      return { request_headers: { response: { status: CONTINUE } } };
    case "request_body":
      return { request_body: { response: { status: CONTINUE } } };
    case "response_headers":
      return { response_headers: { response: { status: CONTINUE } } };
    case "response_body":
      return { response_body: { response: { status: CONTINUE } } };
    case "request_trailers":
      return { request_trailers: {} };
    default:
      return { response_trailers: {} };
  }
}

export interface ServerOptions extends ProcessorOptions {
  /** `host:port` (`JOURNEYS_EXT_PROC_LISTEN`; `0.0.0.0:9000` by default). */
  listen?: string;
  /** Install the SIGTERM and SIGINT handlers that drain and exit (the binary does; a test does not). */
  signals?: boolean;
  drainMs?: number;
}

export interface RunningServer {
  address: string;
  port: number;
  close(): Promise<void>;
  closed: Promise<void>;
}

/** The gRPC server on `JOURNEYS_EXT_PROC_LISTEN`: one `Process` stream per HTTP request. */
export async function serveExtProc(options: ServerOptions = {}): Promise<RunningServer> {
  const pending = new Set<Promise<void>>();
  const log = options.log ?? stderr;
  const processor = createProcessor({ ...options, log, track: (p) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  } });
  const server = new grpc.Server({ "grpc.max_receive_message_length": 16 * 1024 * 1024, "grpc.max_send_message_length": 16 * 1024 * 1024 });
  server.addService(ExternalProcessor.service, { Process: (call: grpc.ServerDuplexStream<ProcessingRequest, ProcessingResponse>) => processor.process(call) });
  const listen = options.listen ?? options.env?.JOURNEYS_EXT_PROC_LISTEN ?? process.env.JOURNEYS_EXT_PROC_LISTEN ?? "0.0.0.0:9000";
  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync(listen, grpc.ServerCredentials.createInsecure(), (error, bound) => (error ? reject(error) : resolve(bound)));
  });
  const host = listen.replace(/:\d+$/, "");
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      const deadline = Date.now() + (options.drainMs ?? 10_000);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          server.forceShutdown();
          resolve();
        }, options.drainMs ?? 10_000);
        server.tryShutdown(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      await Promise.race([Promise.allSettled([...pending]), new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())))]);
      if (pending.size > 0) log("warn", `journeys-ext-proc: ${pending.size} shipment(s) still pending at the drain's end; dropped`);
      resolveClosed();
    })();
    return closing;
  };
  if (options.signals) {
    const onSignal = (signal: NodeJS.Signals): void => {
      log("info", `journeys-ext-proc: ${signal}, draining for up to ${(options.drainMs ?? 10_000) / 1000} s`);
      void close().then(() => process.exit(0));
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  }
  return { address: `${host}:${port}`, port, close, closed };
}
