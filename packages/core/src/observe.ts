import { classifyReader, classifyRoute, type RouteInfo } from "./classify.js";
import { outboundHeaders } from "./gateway.js";
import type { Facts, Io, SensorRecord } from "./io.js";
import type { ScopeDeclaration1 } from "./generated/declaration.js";
import type { ScopeRequest1 } from "./generated/request.js";
import { bodyKeys, mcpFacts, oauthFacts } from "./keys.js";
import type { CompiledPolicy, CompiledRule } from "./policy.js";
import { DECLARATION_SCHEMA, RECORD_SCHEMA, iso, readBody, uuidv4, uuidv7, type ReadBody } from "./record.js";
import { allowedFields, redact, redactString } from "./redact.js";
import { findReference, isReference, mintReference } from "./references.js";
import { finderAnswer, finderText } from "./rules/finder.js";
import { gateRequest, refuseDeclarations, type JsonRpcMessage } from "./rules/gate.js";
import { decide, errored, isLive, type Decision } from "./rules/runner.js";
import { verifyWebBotAuth } from "./webbotauth.js";
import { AGENT_HEADER, ASSERTION_HEADER, assertionClaims, signAssertion } from "./assertion.js";

/** Everything the response side needs from the request side. */
export interface State {
  io: Io;
  policy: CompiledPolicy;
  facts: Facts;
  startedAt: number;
  returnedAt: number;
  url: URL;
  host: string;
  path: string;
  prefix: string;
  method: string;
  accept: string | null;
  route: RouteInfo;
  record: ScopeRequest1;
  declarations: ScopeDeclaration1[];
  decisions: Decision[];
  requestBody: ReadBody | null;
  messages: JsonRpcMessage[] | null;
  batch: boolean;
  gate: CompiledRule | null;
  gateLive: boolean;
  locals: unknown[];
  gateReasons: string[];
  passthrough: boolean;
  answered: boolean;
}

export type Observation =
  | { kind: "forward"; request: Request; state: State }
  | { kind: "answer"; response: Response; state: State; records: Promise<SensorRecord[]> };

export const hashedOrNull = async (value: string | null, io: Io): Promise<string | null> => (value ? io.hash(value) : null);

/**
 * The probe `journeys doctor` sends: answered by the sensor itself with 204 and
 * `x-journeys-probe: received`, never forwarded, recorded as a passthrough request with the query
 * kept, under the forward-only default as under any other policy, so doctor works before any
 * policy is promoted.
 */
export const PROBE_PATH = "/.well-known/journeys-probe";
export const PROBE_HEADER = "x-journeys-probe";
const PROBE_ROUTE: RouteInfo = { route: "passthrough", observed: false, content: false, known: true, hookId: null };

/** The sensor's own answer to the probe: `received`, or `no-salt` from a sensor that records nothing. Null for any other request. */
export function probeAnswer(method: string, path: string, status: "received" | "no-salt"): Response | null {
  if (method !== "GET" || path !== PROBE_PATH) return null;
  return new Response(null, { status: 204, headers: { [PROBE_HEADER]: status, "cache-control": "no-store" } });
}

let warnedNoAssertionKey = false;

/**
 * The signed assertion and the agent header on the hop to the origin, when the policy
 * asks for them for this host. Without a key the headers are omitted and the decision log carries
 * one `errored` decision for the pseudo-rule `assertion`, once per isolate, so a misconfigured
 * install is visible in the Debugger and not silent.
 */
async function assertionHeaders(state: State, headers: Headers): Promise<Headers> {
  const { policy, facts, record, io } = state;
  if (!policy.assertion.enabled) return headers;
  if (policy.assertion.audience && !policy.assertion.audience.includes(state.host)) return headers;
  if (!facts.assertion) {
    if (!warnedNoAssertionKey) {
      warnedNoAssertionKey = true;
      state.decisions.push({ rule: "assertion", kind: "observe", mode: "live", outcome: "errored", reason: "no key" });
      io.log("warn", "journeys: the policy asks for the assertion and JOURNEYS_ASSERTION_KEY is not set; forwarding without it (run journeys init, or journeys rotate-assertion-key)");
    }
    return headers;
  }
  record.id ||= uuidv7(io);
  const claims = assertionClaims(record, state.decisions, facts.assertion.issuer, state.host, io.now());
  headers.set(ASSERTION_HEADER, await signAssertion(claims, facts.assertion.key, facts.assertion.kid));
  headers.set(AGENT_HEADER, `${claims.agent.name};${claims.agent.named_by}`);
  return headers;
}

function declaration(state: State, source: ScopeDeclaration1["source"], text: string, extra: Partial<ScopeDeclaration1>): ScopeDeclaration1 {
  return {
    schema: DECLARATION_SCHEMA,
    id: "",
    ts: iso(state.io.now()),
    install: state.facts.install,
    request: "",
    source,
    text,
    task: null,
    found_via: null,
    agent: null,
    "scope.client.address_hash": state.record["scope.client.address_hash"],
    "scope.key.credential": state.record["scope.key.credential"] ?? null,
    "mcp.session.id": null,
    "scope.key.reference": state.record["scope.key.reference"] ?? null,
    "scope.reference_minted": null,
    ...extra,
  };
}

/** The record's last fields, then the shipment: one call to io.ship with the request and its declarations. */
export async function finish(state: State): Promise<SensorRecord[]> {
  const { record, io, policy } = state;
  const now = io.now();
  // The id is minted last, after every reference and session the request minted, so the entropy
  // the rules consumed is the same the lab's sensor consumed and the fixtures compare exactly
  // (an assertion on the hop to the origin names the record, so it minted the id earlier).
  record.id ||= uuidv7(io);
  for (const d of state.declarations) {
    d.id = uuidv7(io);
    d.request = record.id;
  }
  record["scope.timing"] = { origin_ms: record["scope.timing"]?.origin_ms ?? null, total_ms: now - state.startedAt };
  record.observed_ts = iso(now);
  // A rule of a kind this sensor does not implement ran dry: say so on every observed request, so the console shows it waiting on a newer sensor.
  for (const rule of policy.rules) if (rule.kind === "unknown") state.decisions.push({ rule: rule.id, kind: "observe", mode: "dry_run", outcome: "skipped", reason: `unsupported_kind:${rule.unknown_kind}` });
  // The embedded default and Scope's own default document are both version 0: a record says which ran.
  if (policy.fallback) state.decisions.push({ rule: "policy", kind: "observe", mode: "live", outcome: "errored", reason: `built-in default: ${policy.fallback}` });
  record["scope.decision"] = [...state.decisions].sort((a, b) => ruleIndex(policy, a.rule) - ruleIndex(policy, b.rule));
  if (state.gate && state.gateReasons.length) {
    const reason = [...new Set(state.gateReasons)].join("; ");
    decide(record["scope.decision"], state.gate, state.facts.environment, state.gateLive ? "applied" : "would_apply", reason);
  }
  const requestBody = state.requestBody?.parsed ?? null;
  const responseBody = record["scope.body.response"] ?? null;
  // Redacted as a body's client_id is, so the client is keyed the same on every route.
  const authorizeQuery = state.route.route === "oauth.authorize" ? state.url.searchParams.get("client_id") : null;
  const authorizeClient = authorizeQuery ? await redactString(authorizeQuery, policy, io) : null;
  const keys = await bodyKeys(state.route.route, policy.surfaces, requestBody, responseBody, authorizeClient, state.route.hookId, io);
  record["scope.key.device_code"] = keys.device_code;
  record["scope.key.user_code"] = keys.user_code;
  record["scope.key.oauth_client"] = keys.oauth_client;
  record["scope.key.hook"] = keys.hook;
  if (!policy.recordBodies) {
    // The lightest form: bodies are read where a rule needs them and nothing of them leaves,
    // the keys read out of them included.
    record["scope.body.request"] = null;
    record["scope.body.response"] = null;
    if (state.route.route !== "oauth.authorize") record["scope.key.oauth_client"] = null;
    record["scope.key.device_code"] = null;
    record["scope.key.user_code"] = null;
    if (!state.route.hookId) record["scope.key.hook"] = null;
  } else {
    // Cut after the keys above were read: they come from the whole redacted body.
    record["scope.body.request"] = allowedFields(record["scope.body.request"], policy.allowFields) as ScopeRequest1["scope.body.request"];
    record["scope.body.response"] = allowedFields(record["scope.body.response"], policy.allowFields) as ScopeRequest1["scope.body.response"];
  }
  const records: SensorRecord[] = [record, ...state.declarations];
  io.ship(records);
  return records;
}

const ruleIndex = (policy: CompiledPolicy, id: string): number => policy.rules.find((r) => r.id === id)?.index ?? Number.MAX_SAFE_INTEGER;

function emptyRecord(state: Omit<State, "record">, io: Io, facts: Facts, policy: CompiledPolicy, addressHash: string): ScopeRequest1 {
  return {
    schema: RECORD_SCHEMA,
    id: "",
    ts: iso(state.startedAt),
    observed_ts: iso(state.startedAt),
    install: facts.install,
    source: facts.source,
    observer: { package: facts.observer.package, version: facts.observer.version, adapter: facts.observer.adapter, policy_version: policy.version, salt_epoch: facts.salt_epoch, name: facts.observer.name },
    request_id: facts.platform_request_id,
    "http.request.method": state.method,
    "server.address": state.host,
    "url.path": "",
    "url.query": null,
    "http.response.status_code": null,
    "scope.route": state.route.route,
    "http.request.header.content-type": null,
    "http.response.header.content-type": null,
    "scope.request.bytes": null,
    "scope.response.bytes": null,
    "scope.cache": null,
    "scope.timing": { origin_ms: null, total_ms: null },
    "scope.client.address_hash": addressHash,
    "scope.client.address_family": facts.family,
    "scope.client.asn": facts.asn,
    "scope.client.as_org": facts.as_org,
    "scope.client.country": facts.country,
    "scope.client.colo": facts.colo,
    "user_agent.original": "",
    "scope.client.accept": null,
    "scope.client.fetch_metadata": { sec_ch_ua: false, sec_fetch_dest: null, sec_fetch_mode: null, upgrade_insecure: false },
    "tls.protocol.version": facts.tls_protocol_version,
    "network.protocol.version": facts.network_protocol_version,
    "scope.client.ja4": facts.ja4,
    "scope.client.tls_ext_sha1": facts.tls_ext_sha1,
    "scope.client.tls_hello_len": facts.tls_hello_len,
    "scope.signature": null,
    "scope.platform_bot": facts.platform_bot,
    "scope.reader": "unknown",
    "scope.key.credential": null,
    "scope.key.install": null,
    "scope.key.device_code": null,
    "scope.key.user_code": null,
    "scope.key.oauth_client": null,
    "mcp.session.id": null,
    "scope.key.hook": null,
    "scope.key.reference": null,
    "scope.key.setup_header": null,
    "scope.key.agent_header": null,
    "scope.key.client_header": null,
    "scope.key.intent_header": null,
    "mcp.protocol.version": null,
    "mcp.method.name": [],
    "scope.mcp.tools": [],
    "scope.mcp.client": null,
    "scope.oauth": null,
    "scope.body.request": null,
    "scope.body.response": null,
    "scope.body.truncated": false,
    "scope.response.headers": null,
    "scope.page": null,
    "scope.reference_minted": null,
    "scope.decision": [],
    "scope.gateway": null,
    "scope.observer.errors": [],
    // The shipper writes the count on the one record of a shipment that carries it.
    "scope.observer.dropped": 0,
  };
}

/**
 * The request side: routing, the record's facts, the body on observed routes, the intent header,
 * the finder, the gate, the outbound request. Never throws to the adapter: a bug forwards the
 * request untouched and the record carries the error's class.
 */
export async function observe(request: Request, policy: CompiledPolicy, facts: Facts, io: Io, head = false): Promise<Observation> {
  const startedAt = io.now();
  const url = new URL(request.url);
  const host = url.host;
  let path = url.pathname;
  let prefix = "";
  const prefixed = policy.runPrefix?.exec(path);
  if (prefixed) {
    // The prefix is what is stripped: the path up to the rest group, however the document's first
    // group is drawn (`(/t/x)(/.*)?` or `/t/(x)(/.*)?` both restore `/t/x` in rewritten links).
    const rest = prefixed[2] ?? "";
    prefix = url.pathname.slice(0, url.pathname.length - rest.length);
    path = rest || "/";
  }
  const method = request.method;
  const bodyless = method === "GET" || method === "HEAD";
  const probed = probeAnswer(method, path, "received");
  const probe = probed !== null;
  const route = probe ? PROBE_ROUTE : classifyRoute(path, policy);
  const base: Omit<State, "record"> = {
    io,
    policy,
    facts,
    startedAt,
    returnedAt: startedAt,
    url,
    host,
    path,
    prefix,
    method,
    accept: request.headers.get("accept"),
    route,
    declarations: [],
    decisions: [],
    requestBody: null,
    messages: null,
    batch: false,
    gate: null,
    gateLive: false,
    locals: [],
    gateReasons: [],
    passthrough: route.route === "passthrough" && !probe,
    answered: false,
  };
  const forwardAsIs = async (): Promise<Request> =>
    new Request(url, { method, headers: outboundHeaders(request, policy, facts.observer.name, host), body: bodyless ? undefined : await request.clone().arrayBuffer(), redirect: "manual" });

  if (base.passthrough) {
    const state: State = { ...base, record: emptyRecord(base, io, facts, policy, "") };
    state.returnedAt = io.now();
    return { kind: "forward", request: await forwardAsIs(), state };
  }

  const record = emptyRecord(base, io, facts, policy, await io.hash(facts.address ?? ""));
  const state: State = { ...base, record };
  try {
    const H = policy.headers;
    const said = async (value: unknown): Promise<string | null> => (typeof value === "string" ? redactString(value, policy, io) : null);
    const ua = request.headers.get("user-agent") ?? "";
    const reqType = request.headers.get("content-type") ?? "";
    const bearer = request.headers.get(H.credential)?.replace(/^Bearer\s+/i, "") ?? null;
    const install = H.install ? request.headers.get(H.install) : null;
    const rawReference = findReference(url, H.reference);
    const reference = rawReference ? await redactString(rawReference, policy, io) : "";
    const signatureAgent = H.signature ? request.headers.get(H.signature) : null;
    const fetchMetadata = { sec_ch_ua: request.headers.has("sec-ch-ua"), sec_fetch_dest: request.headers.get("sec-fetch-dest"), sec_fetch_mode: request.headers.get("sec-fetch-mode"), upgrade_insecure: request.headers.has("upgrade-insecure-requests") };
    record["url.path"] = await redactString(url.pathname, policy, io);
    record["url.query"] = url.search ? await redactString(url.search.slice(1), policy, io) : null;
    record["user_agent.original"] = ua;
    record["scope.client.accept"] = state.accept || null;
    record["scope.client.fetch_metadata"] = fetchMetadata;
    record["http.request.header.content-type"] = reqType || null;
    // Verified against the host the agent spoke to, which behind this sensor is this host; the
    // forwarded-host header a proxy in front set is the one candidate for an authority mismatch.
    record["scope.signature"] = signatureAgent ? await verifyWebBotAuth(request.headers, method, host, policy.signers, io, [request.headers.get("x-forwarded-host") ?? ""]) : null;
    record["scope.reader"] = classifyReader(ua, state.accept, fetchMetadata, signatureAgent, facts.platform_bot, policy.surfaces?.clients ?? null);
    record["scope.key.credential"] = await hashedOrNull(bearer, io);
    record["scope.key.install"] = await hashedOrNull(install, io);
    // The setup header carries the session id the gate handed out, hashed alike so the two join; a reference code stays readable.
    const setup = H.setup ? request.headers.get(H.setup) : null;
    record["scope.key.setup_header"] = setup && !isReference(setup) ? await io.hash(setup) : setup;
    record["scope.key.agent_header"] = H.agent ? request.headers.get(H.agent) : null;
    record["scope.key.intent_header"] = await said(H.intent ? request.headers.get(H.intent) : null);
    record["scope.key.client_header"] = H.client ? request.headers.get(H.client) : null;
    record["scope.key.reference"] = reference && isReference(reference) ? reference : null;
    record["mcp.session.id"] = await hashedOrNull(request.headers.get(H.session), io);

    if (probe) {
      record["http.response.status_code"] = 204;
      state.answered = true;
      state.returnedAt = io.now();
      const records = finish(state);
      return { kind: "answer", response: probed, state, records };
    }

    // `head`: built from its head alone, the request left its body unread for the app; nothing is read or answered from it.
    if (route.observed && !bodyless && !head) {
      const text = await request.clone().text();
      state.requestBody = await readBody(text, reqType, policy, io, "request");
      record["scope.body.request"] = state.requestBody.parsed as ScopeRequest1["scope.body.request"];
      record["scope.body.truncated"] = state.requestBody.truncated;
      record["scope.request.bytes"] = state.requestBody.bytes;
      if (/json/.test(reqType)) {
        try {
          const raw: unknown = JSON.parse(text);
          state.messages = (Array.isArray(raw) ? raw : [raw]) as JsonRpcMessage[];
          state.batch = Array.isArray(raw);
        } catch {
          state.messages = null;
        }
      }
      const mcp = state.messages ? mcpFacts(state.messages) : null;
      if (mcp && mcp.methods.length) {
        record["mcp.protocol.version"] = mcp.protocol_version;
        record["mcp.method.name"] = mcp.methods;
        record["scope.mcp.tools"] = mcp.tools;
        record["scope.mcp.client"] = mcp.client;
      }
      if (route.route !== "oauth.authorize") record["scope.oauth"] = oauthFacts(route.route, state.requestBody.parsed, url.searchParams);
    }
    if (route.route === "oauth.authorize") {
      // The authorize query is read as sent: the URLs it names are redacted like url.query.
      const oauth = oauthFacts(route.route, null, url.searchParams);
      record["scope.oauth"] = oauth && { ...oauth, client_id_url: await said(oauth.client_id_url), resource: await said(oauth.resource) };
    }

    // An intent header on a call (the API samples show one) is a declaration against the call's credential.
    const intentHeader = record["scope.key.intent_header"];
    if (intentHeader && !/^<|one sentence/i.test(intentHeader)) {
      state.declarations.push(declaration(state, "header", intentHeader, { agent: record["scope.key.agent_header"] ?? null }));
    }

    // The docs finder answers here and forwards nothing; a GET with the task in the query serves
    // the agents whose fetch tool cannot POST.
    const finder = policy.rules.find((r) => r.kind === "finder" && r.route === path && (method === "POST" || method === "GET"));
    if (finder) {
      // The finder answers a JSON task as sent, not its redacted copy; only the declaration is redacted.
      const text = finderText(state.messages && !state.batch ? state.messages[0] : (state.requestBody?.parsed ?? {}), url).trim();
      if (head && !text) decide(state.decisions, finder, facts.environment, "skipped", "the body was left unread for the app");
      else {
        const token = mintReference(io);
        const guides = text ? finderAnswer(finder, text, host, prefix, token) : null;
        const answer: unknown = guides ?? { error: { code: "missing_task", message: "Post a JSON object with a one-sentence task." } };
        const reason = guides ? `finder answered ${guides.guides.length} links` : "finder refused: missing task";
        if (isLive(finder, facts.environment)) {
          decide(state.decisions, finder, facts.environment, "applied", reason);
          record["http.response.status_code"] = text ? 200 : 400;
          record["scope.reference_minted"] = text ? token : null;
          record["scope.gateway"] = { declared: text ? 1 : 0, forwarded: 0 };
          if (text) state.declarations.push(declaration(state, "finder", await redactString(text, policy, io), { "scope.reference_minted": token }));
          state.answered = true;
          state.returnedAt = io.now();
          const records = finish(state);
          return { kind: "answer", response: Response.json(answer, { status: record["http.response.status_code"] ?? 200 }), state, records };
        }
        decide(state.decisions, finder, facts.environment, "would_apply", reason);
      }
    }

    const gate = policy.rules.find((r) => r.kind === "gate" && r.route === path && r.tool !== null) ?? null;
    let forwardBody: BodyInit | undefined = bodyless ? undefined : await request.clone().arrayBuffer();
    if (gate && head) decide(state.decisions, gate, facts.environment, "skipped", "the body was left unread for the app");
    if (gate && state.messages) {
      state.gate = gate;
      state.gateLive = isLive(gate, facts.environment);
      const session = request.headers.get(H.session) ?? uuidv4(io);
      try {
        const split = gateRequest(state.messages, gate, session);
        if (split.declared.length) state.gateReasons.push("declaration answered");
        if (state.gateLive) {
          state.locals = split.local;
          for (const declared of split.declared) {
            // What the agent declared is redacted like any body before it is recorded: an agent may paste a key into it.
            const text = typeof declared.intent === "string" ? await redactString(declared.intent, policy, io) : JSON.stringify(await redact(declared, policy, io, "request"));
            state.declarations.push(declaration(state, "gate", text, { task: await said(declared.task), found_via: await said(declared.found_via), agent: await said(declared.agent), "mcp.session.id": await io.hash(session) }));
          }
          record["scope.gateway"] = { declared: split.declared.length, forwarded: split.forward.length };
          if (split.forward.length === 0) {
            record["http.response.status_code"] = 200;
            state.answered = true;
            state.returnedAt = io.now();
            const records = finish(state);
            return { kind: "answer", response: Response.json(state.batch ? state.locals : (state.locals[0] ?? null), { headers: { [H.session]: session } }), state, records };
          }
          forwardBody = JSON.stringify(state.batch ? split.forward : split.forward[0]);
        } else {
          record["scope.gateway"] = { declared: 0, forwarded: state.messages.length };
        }
      } catch (error) {
        state.gateReasons = [];
        if (gate.on_error === "closed" && state.gateLive) {
          // A closed gate refuses the declaration calls it could not answer and forwards the rest of
          // the batch; the tools list still goes out amended when the response path manages it.
          errored(state.decisions, gate, facts.environment, error, "on_error closed: declaration refused");
          const split = refuseDeclarations(state.messages, gate);
          state.locals = split.local;
          record["scope.gateway"] = { declared: 0, forwarded: split.forward.length };
          if (split.forward.length === 0) {
            record["http.response.status_code"] = 200;
            state.answered = true;
            state.returnedAt = io.now();
            const records = finish(state);
            return { kind: "answer", response: Response.json(state.batch ? state.locals : (state.locals[0] ?? null), { headers: { [H.session]: session } }), state, records };
          }
          forwardBody = JSON.stringify(state.batch ? split.forward : split.forward[0]);
        } else {
          errored(state.decisions, gate, facts.environment, error);
          state.gate = null;
          state.locals = [];
        }
      }
    }
    const forward = new Request(url, { method, headers: await assertionHeaders(state, outboundHeaders(request, policy, facts.observer.name, host)), body: forwardBody, redirect: "manual" });
    state.returnedAt = io.now();
    return { kind: "forward", request: forward, state };
  } catch (error) {
    (record["scope.observer.errors"] ??= []).push(error instanceof Error ? error.name : "Error");
    io.log("error", `journeys: observe failed, forwarding untouched: ${error instanceof Error ? error.message : String(error)}`);
    state.returnedAt = io.now();
    return { kind: "forward", request: await forwardAsIs(), state };
  }
}
