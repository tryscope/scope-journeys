import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { DEFAULT_API_URL, VERSION, assertionFromEnv, failedHop, forwardObserved, forwardedUrl, isHost, loadPolicy, observe, originUrl, passHeaders, probeAnswer, secureUrl, type Environment, type LogLevel } from "scope-journeys";

import { memoryCache } from "./cache.js";
import { droppedSoFar } from "./deliver.js";
import { canonicalAddress, forwardedAddress, platformFacts, socketFacts, type SocketFacts } from "./facts.js";
import { HOP_BY_HOP, headersOf, hop } from "./hop.js";
import { createNodeIo } from "./io.js";

/** The header a mount adds on the hop to its own listener; a request carrying it is the inner pass and is never observed twice. */
export const INNER_HEADER = "x-journeys-inner";

export interface NodeOptions {
  /** Observe only this host (JOURNEYS_HOST); other hosts are passed on untouched. */
  host?: string;
  /** Where the hop goes (JOURNEYS_ORIGIN): a mount defaults to the app's own listener on 127.0.0.1; the proxy requires it. */
  origin?: string;
  /** The Via pseudonym (JOURNEYS_NAME). */
  name?: string;
  apiUrl?: string;
  policyUrl?: string;
  installId?: string;
  environment?: Environment;
  /** `true` reads the client's address and scheme from x-forwarded-for and x-forwarded-proto, and on a mount the host from x-forwarded-host (JOURNEYS_TRUST_PROXY=1); the socket's and the Host header's otherwise. */
  trustProxy?: boolean;
  /**
   * `mount` (the default) sits inside the app: the hop returns to the app's own listener with the
   * inner marker and the request's own Host. `proxy` fronts another server: the hop carries the
   * origin's Host and no marker.
   */
  form?: "mount" | "proxy";
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  /** Called with every delivery the sensor starts, so a drain can wait for them (the proxy's SIGTERM). */
  track?: (pending: Promise<void>) => void;
  log?: (level: LogLevel, line: string) => void;
}

/** One request as the sensor sees it, whatever framework carried it. */
export interface Exchange {
  request: Request;
  socket: SocketFacts;
  /** The port the request arrived on: a mount's default hop target. */
  localPort: number | null;
  /** Runs the work once the response has gone out to the client (the shipment); at once when the transport cannot say. */
  afterResponse: (work: () => void) => void;
}

export interface Sensor {
  form: "mount" | "proxy";
  trustProxy: boolean;
  /** Whether x-forwarded-host names the request: a mount behind a trusted proxy. The standalone proxy is a gateway and names the host it serves, the Host it receives. */
  forwardedHost: boolean;
  /** Whether the request is the sensor's to observe: not the inner pass, and a host, the observed one. */
  observes(inner: string | null, host: string | null): boolean;
  /** The response to send. Throws when the sensor could not run or its hop never left, and the caller passes the request on untouched. */
  sense(exchange: Exchange): Promise<Response>;
  /** The hop with nothing of the sensor's on it (the marker aside, so a mount's app sees it once): the fail-open path. */
  untouched(exchange: Exchange): Promise<Response>;
  log: (level: LogLevel, line: string) => void;
}

const stderr = (level: LogLevel, line: string): void => {
  process.stderr.write(`${level === "info" ? "" : `${level}: `}${line}\n`);
};

/** The sensor behind every mount and the proxy: the configuration read once, the policy cached, one io per request. */
export function createSensor(options: NodeOptions = {}): Sensor {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? stderr;
  const track = options.track ?? (() => undefined);
  const form = options.form ?? "mount";
  const trustProxy = options.trustProxy ?? env.JOURNEYS_TRUST_PROXY === "1";
  const observeHost = options.host ?? env.JOURNEYS_HOST ?? null;
  const name = options.name ?? env.JOURNEYS_NAME ?? "scope-journeys";
  const installId = options.installId ?? env.JOURNEYS_INSTALL_ID ?? null;
  const apiUrl = secureUrl(options.apiUrl ?? env.JOURNEYS_API_URL ?? DEFAULT_API_URL, "JOURNEYS_API_URL", (line) => log("warn", line));
  const key = env.JOURNEYS_INSTALL_KEY ?? null;
  const salt = env.JOURNEYS_SALT ?? null;
  const origin = options.origin ?? env.JOURNEYS_ORIGIN ?? null;
  const hopOrigin = origin ? originUrl(origin) : null;
  if (form === "proxy" && !hopOrigin) throw new Error("journeys: the proxy needs an http or https origin with no credentials to forward to (--origin or JOURNEYS_ORIGIN)");
  const policyUrl = options.policyUrl ?? env.JOURNEYS_POLICY_URL ?? (apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}/policy` : null);
  const issuer = apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}` : null;
  const cache = memoryCache(now);
  let warnedNoInstall = false;
  let warnedNoSalt = false;

  const targetFor = (exchange: Exchange): URL => {
    if (hopOrigin) return hopOrigin;
    if (origin) throw new Error("journeys: the origin to forward to (JOURNEYS_ORIGIN or the origin option) is not an http or https URL with no credentials");
    if (form === "proxy" || exchange.localPort === null) throw new Error("journeys: no origin to forward to (set JOURNEYS_ORIGIN)");
    return new URL(`http://127.0.0.1:${exchange.localPort}`);
  };
  const hopHeaders = (request: Request): Record<string, string> => (form === "mount" ? { [INNER_HEADER]: "1", "x-forwarded-proto": new URL(request.url).protocol.slice(0, -1) } : {});

  return {
    form,
    trustProxy,
    forwardedHost: trustProxy && form === "mount",
    log,
    observes: (inner, host) => !inner && host !== null && (!observeHost || host === observeHost),
    async sense(exchange) {
      const { request, socket } = exchange;
      const url = new URL(request.url);
      const warn = (line: string): void => log("warn", line);
      if (!installId && !policyUrl && !warnedNoInstall) {
        warnedNoInstall = true;
        warn("journeys: JOURNEYS_INSTALL_ID is not set; forwarding every request untouched under the default policy (run `npx scope-journeys init --node`)");
      }
      if (!salt) {
        // Without a salt nothing can be hashed, so nothing is recorded: the request goes on untouched, the probe says why.
        if (!warnedNoSalt) {
          warnedNoSalt = true;
          warn("journeys: JOURNEYS_SALT is not set; recording nothing and forwarding every request untouched (run `npx scope-journeys init --node`)");
        }
        return probeAnswer(request.method, url.pathname, "no-salt") ?? this.untouched(exchange);
      }
      const loaded = await loadPolicy({ url: policyUrl, installId, credential: key, fetch: fetchFn, now: now(), cache, log: warn });
      const { policy } = loaded;
      const target = targetFor(exchange);
      const identity = { install: installId, name, environment: (loaded.environment ?? options.environment ?? env.JOURNEYS_ENVIRONMENT ?? "production") as Environment, saltEpoch: loaded.saltEpoch ?? 1, dropped: droppedSoFar(), version: VERSION, assertion: await assertionFromEnv(env.JOURNEYS_ASSERTION_KEY, issuer) };
      const facts = platformFacts(socket, request.headers.get("x-request-id"), identity);
      // A mount's hop carries the Host as received (the forwarded host is the record's, not the app's view); the proxy's carries the origin's.
      const io = createNodeIo({ salt, host: url.host, target, hopHost: form === "proxy" ? target.host : (request.headers.get("host") ?? url.host), hopHeaders: hopHeaders(request), forwardedFor: socket.peer, key, apiUrl, cache, fetch: fetchFn, now, afterResponse: exchange.afterResponse, track, log });
      const observed = await observe(request, policy, facts, io);
      if (observed.kind === "answer") return observed.response;
      return (await forwardObserved(observed.request, observed.state)).response;
    },
    async untouched(exchange) {
      const { request, socket } = exchange;
      const target = targetFor(exchange);
      const headers = new Headers(request.headers);
      for (const name of HOP_BY_HOP) headers.delete(name);
      for (const [name, value] of Object.entries(hopHeaders(request))) headers.set(name, value);
      if (socket.peer) headers.append("x-forwarded-for", socket.peer);
      const bodyless = request.method === "GET" || request.method === "HEAD";
      let upstream: Response;
      try {
        upstream = await hop(new Request(request.url, { method: request.method, headers, body: bodyless ? null : request.body, redirect: "manual", ...(bodyless ? {} : { duplex: "half" }) } as RequestInit), { target, host: form === "proxy" ? target.host : (request.headers.get("host") ?? new URL(request.url).host), timeoutMs: 30_000 });
      } catch (error) {
        return failedHop(error, log);
      }
      // This hop asks with the client's accept-encoding and hands the body on as encoded, so the encoding stays named.
      const answered = passHeaders(upstream.headers);
      const encoding = upstream.headers.get("content-encoding");
      if (encoding) answered.set("content-encoding", encoding);
      return new Response(upstream.body, { status: upstream.status, headers: answered });
    },
  };
}

export interface NodeHandler {
  (req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<void>;
  /** Whether this request is the sensor's to observe; a Fastify hook asks before it hijacks the reply. */
  observes(req: IncomingMessage): boolean;
}

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** The request's host as the sensor names it: the Host header (a proxy in front preserves it), else the listener itself; with `forwardedHost`, the host a trusted proxy named in x-forwarded-host. Null for a Host that is not a host: that request is not the sensor's to observe. */
export function requestHost(req: IncomingMessage, forwardedHost = false): string | null {
  const header = req.headers.host;
  if (header && !isHost(header)) return null;
  const own = header || (req.socket?.localPort ? `127.0.0.1:${req.socket.localPort}` : null);
  return forwardedHost && own ? forwardedUrl(new URL(`http://${own}`), headersOf(req)).host : own;
}

/** A Node request as a Request: the scheme from the socket (or the trusted x-forwarded-proto), the host from the Host header (or, with `forwardedHost`, x-forwarded-host), the headers as received, the body as a stream the core clones where it reads it. */
export function toRequest(req: IncomingMessage, trustProxy: boolean, forwardedHost = false): Request {
  const socket = req.socket;
  const encrypted = socket && "encrypted" in socket && Boolean((socket as TLSSocket).encrypted);
  const forwardedProto = trustProxy ? first(req.headers["x-forwarded-proto"])?.split(",")[0]?.trim() : null;
  const scheme = encrypted ? "https" : forwardedProto === "https" ? "https" : "http";
  const host = requestHost(req) ?? "127.0.0.1";
  // An absolute target keeps only its path: the host is the Host header's, the one observes() checked.
  const path = (req.url ?? "/").replace(/^https?:\/\/[^/?#]*/i, "");
  const headers = headersOf(req);
  const own = new URL(`${scheme}://${host}${path.startsWith("/") ? path : `/${path}`}`);
  const url = forwardedHost ? forwardedUrl(own, headers) : own;
  const bodyless = req.method === "GET" || req.method === "HEAD";
  return new Request(url, { method: req.method ?? "GET", headers, body: bodyless ? null : (Readable.toWeb(req) as ReadableStream<Uint8Array>), redirect: "manual", ...(bodyless ? {} : { duplex: "half" }) } as RequestInit);
}

/** Runs the work once, when the response has finished or the client went away; at once when it already has. */
export function afterResponse(res: ServerResponse): (work: () => void) => void {
  return (work) => {
    if (res.writableFinished || res.destroyed) {
      work();
      return;
    }
    let fired = false;
    const once = (): void => {
      if (fired) return;
      fired = true;
      work();
    };
    res.once("finish", once);
    res.once("close", once);
  };
}

/** The Response written to the Node response: the status, the headers (cookies one by one), the body streamed; Node frames it. A client that went away ends the stream quietly. */
export async function send(res: ServerResponse, response: Response): Promise<void> {
  for (const [name, value] of response.headers) if (name !== "set-cookie") res.setHeader(name, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.statusCode = response.status;
  if (!response.body) {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(response.body as never), res);
  } catch (error) {
    if (!res.destroyed) res.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * The Node form of the sensor: the request as a Request, the facts from the socket, the policy from
 * the cache, the hop (to the app's own listener on a mount, to the origin on the proxy), the answer
 * written back, the shipment after the response. The inner pass and a host the install does not
 * observe go to `next` untouched; so does every failure of the sensor before its hop left
 * (the hop itself, when there is no `next` to hand the request to).
 */
export function createNodeHandler(options: NodeOptions = {}): NodeHandler {
  const sensor = createSensor(options);
  // The fetch API refuses TRACE (CONNECT and TRACK never reach a request handler on node:http): never observed.
  const observes = (req: IncomingMessage): boolean => req.method !== "TRACE" && sensor.observes(first(req.headers[INNER_HEADER]), requestHost(req, sensor.forwardedHost));
  const handler = async (req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<void> => {
    // Decided before the request is built: building it starts reading the body, which `next` must get whole.
    const observed = observes(req);
    if (!observed && next) return next();
    // The proxy's hop is a Request, which cannot carry TRACE either.
    if (req.method === "TRACE") return send(res, new Response("Not Implemented", { status: 501, headers: { "content-type": "text/plain" } }));
    let exchange: Exchange;
    try {
      exchange = { request: toRequest(req, sensor.trustProxy, sensor.forwardedHost), socket: socketFacts(req, sensor.trustProxy), localPort: req.socket?.localPort ?? null, afterResponse: afterResponse(res) };
    } catch (error) {
      sensor.log("error", `journeys: the request could not be read: ${error instanceof Error ? error.message : String(error)}`);
      if (next) return next();
      return send(res, new Response("Bad Request", { status: 400, headers: { "content-type": "text/plain" } }));
    }
    let response: Response | null = null;
    if (observed) {
      try {
        response = await sensor.sense(exchange);
      } catch (error) {
        sensor.log("error", `journeys: the sensor failed, passing the request on untouched: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!response) {
      if (next) return next();
      try {
        response = await sensor.untouched(exchange);
      } catch (hopError) {
        sensor.log("error", `journeys: the origin could not be reached: ${hopError instanceof Error ? hopError.message : String(hopError)}`);
        response = new Response("Bad Gateway", { status: 502, headers: { "content-type": "text/plain" } });
      }
    }
    await send(res, response);
  };
  return Object.assign(handler, { observes });
}

export { canonicalAddress, forwardedAddress };
