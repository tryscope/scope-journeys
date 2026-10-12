// The lab-visible projection of a record: the fields the lab's sensor recorded, read from a lab
// record (the `mw_request` and `mw_intent` shapes) or from a scope.request/1 record, so the two
// implementations can be diffed field by field. Fields the lab never had (the surface role, the
// MCP facts, the body keys, the family, the observer, the decisions' modes) are proven by the
// fixtures' expectations instead, not here.
import { REFERENCE } from "../../src/references.js";
import type { ScopeDeclaration1 } from "../../src/generated/declaration.js";
import type { ScopeRequest1 } from "../../src/generated/request.js";

export interface LabRecord {
  kind: string;
  method?: string;
  host?: string;
  path?: string;
  search?: string;
  ua?: string;
  accept?: string;
  contentType?: string | null;
  fetchMeta?: { secChUa: boolean; secFetchDest: string | null; secFetchMode: string | null; upgradeInsecure: boolean };
  signatureAgent?: string | null;
  addrHash?: string;
  asn?: number | null;
  asOrg?: string | null;
  country?: string | null;
  colo?: string | null;
  tls?: { version: string | null; extSha1: string | null; helloLen: number | null; http: string | null; ja4: string | null };
  bearerHash?: string | null;
  installHash?: string | null;
  setupHeader?: string | null;
  agentHeader?: string | null;
  intentHeader?: string | null;
  clientHeader?: string | null;
  refQuery?: string | null;
  mcpSessionId?: string | null;
  reqBody?: unknown;
  resBody?: unknown;
  resHeaders?: unknown;
  status?: number | null;
  page?: { canonical: string; face: string; token: string | null; injected: string[]; bytes: number; cache?: string | null } | null;
  rewrote?: string[];
  gateway?: { intents?: number; declared?: number; forwarded: number } | null;
  mintedRef?: string | null;
  declared?: { intent?: string; task?: string; found_via?: string; agent?: string; source?: string };
}

export interface Projection {
  method: string;
  host: string;
  path: string;
  query: string | null;
  status: number | null;
  ua: string;
  accept: string | null;
  contentType: string | null;
  fetchMeta: { sec_ch_ua: boolean; sec_fetch_dest: string | null; sec_fetch_mode: string | null; upgrade_insecure: boolean };
  signatureAgent: string | null;
  addrHash: string;
  asn: number | null;
  asOrg: string | null;
  country: string | null;
  colo: string | null;
  tls: { version: string | null; http: string | null; ja4: string | null; extSha1: string | null; helloLen: number | null };
  bearerHash: string | null;
  installHash: string | null;
  setupHeader: string | null;
  agentHeader: string | null;
  clientHeader: string | null;
  intentHeader: string | null;
  refQuery: string | null;
  mcpSessionId: string | null;
  reqBody: unknown;
  resBody: unknown;
  resHeaders: unknown;
  page: { canonical: string; face: string; injected: string[]; bytes: number; reference_minted: string | null } | null;
  mintedRef: string | null;
  gateway: { declared: number; forwarded: number } | null;
  applied: string[];
}

export interface DeclarationProjection {
  source: string;
  text: string;
  task: string | null;
  found_via: string | null;
  agent: string | null;
  addrHash: string;
  bearerHash: string | null;
  mcpSessionId: string | null;
  refQuery: string | null;
  mintedRef: string | null;
}

// The second intended deviation: the lab's `refQuery` holds the first value of any reference
// parameter as sent (a device user code in `code=` on the sign-in page included); the product
// records a reference only when its shape and check character hold, so the lab's raw code is
// projected as null here and the two sides compare.
const refOrNull = (value: string | null | undefined): string | null => (value && REFERENCE.test(value) ? value : null);

export function labProjection(r: LabRecord): Projection {
  return {
    method: r.method ?? "",
    host: r.host ?? "",
    path: r.path ?? "",
    query: r.search ? r.search.slice(1) : null,
    status: r.status ?? null,
    ua: r.ua ?? "",
    accept: r.accept || null,
    contentType: r.contentType ?? null,
    fetchMeta: { sec_ch_ua: Boolean(r.fetchMeta?.secChUa), sec_fetch_dest: r.fetchMeta?.secFetchDest ?? null, sec_fetch_mode: r.fetchMeta?.secFetchMode ?? null, upgrade_insecure: Boolean(r.fetchMeta?.upgradeInsecure) },
    signatureAgent: r.signatureAgent ?? null,
    addrHash: r.addrHash ?? "",
    asn: r.asn ?? null,
    asOrg: r.asOrg ?? null,
    country: r.country ?? null,
    colo: r.colo ?? null,
    tls: { version: r.tls?.version ?? null, http: r.tls?.http ?? null, ja4: r.tls?.ja4 ?? null, extSha1: r.tls?.extSha1 ?? null, helloLen: r.tls?.helloLen ?? null },
    bearerHash: r.bearerHash ?? null,
    installHash: r.installHash ?? null,
    setupHeader: r.setupHeader ?? null,
    agentHeader: r.agentHeader ?? null,
    clientHeader: r.clientHeader ?? null,
    intentHeader: r.intentHeader ?? null,
    refQuery: refOrNull(r.refQuery),
    mcpSessionId: r.mcpSessionId ?? null,
    reqBody: r.reqBody ?? null,
    resBody: r.resBody ?? null,
    resHeaders: r.resHeaders ?? null,
    page: r.page ? { canonical: r.page.canonical, face: r.page.face, injected: r.page.injected, bytes: r.page.bytes, reference_minted: r.page.token ?? null } : null,
    mintedRef: r.mintedRef ?? null,
    gateway: r.gateway ? { declared: r.gateway.intents ?? r.gateway.declared ?? 0, forwarded: r.gateway.forwarded } : null,
    applied: [...(r.rewrote ?? [])].sort(),
  };
}

export function recordProjection(r: ScopeRequest1): Projection {
  const sse = Boolean(r["scope.body.response"] && typeof r["scope.body.response"] === "object" && "sse" in r["scope.body.response"]);
  const applied: string[] = [];
  for (const d of r["scope.decision"] ?? []) {
    if (d.outcome !== "applied") continue;
    // A page's rewrites (inject rules, the helpful 404) are the labels of scope.page.injected below.
    if (d.kind === "inject" || d.kind === "notfound") continue;
    if (d.kind === "gate") {
      // The lab marked a gate "rewrote" only when it changed an answer going out: every stream
      // through the gate, a tools list amended, local answers appended to a forwarded batch. The
      // decision here also covers a batch answered without the origin, which the lab left unmarked.
      const reasons = d.reason ?? "";
      const forwarded = r["scope.gateway"]?.forwarded ?? 0;
      if (sse) applied.push("gateway-sse");
      else if (/tools\/list amended/.test(reasons) || (/declaration answered/.test(reasons) && forwarded > 0)) applied.push("gateway");
    } else if (d.kind === "finder") applied.push("finder");
    else if (d.kind === "error") applied.push("error-link");
  }
  for (const label of r["scope.page"]?.injected ?? []) applied.push(label);
  const h = r["scope.response.headers"] as Record<string, unknown> | null | undefined;
  return {
    method: r["http.request.method"],
    host: r["server.address"],
    path: r["url.path"],
    query: r["url.query"] ?? null,
    status: r["http.response.status_code"] ?? null,
    ua: r["user_agent.original"],
    accept: r["scope.client.accept"] ?? null,
    contentType: r["http.request.header.content-type"] ?? null,
    fetchMeta: { sec_ch_ua: Boolean(r["scope.client.fetch_metadata"]?.sec_ch_ua), sec_fetch_dest: r["scope.client.fetch_metadata"]?.sec_fetch_dest ?? null, sec_fetch_mode: r["scope.client.fetch_metadata"]?.sec_fetch_mode ?? null, upgrade_insecure: Boolean(r["scope.client.fetch_metadata"]?.upgrade_insecure) },
    signatureAgent: r["scope.signature"]?.agent ?? null,
    addrHash: r["scope.client.address_hash"],
    asn: r["scope.client.asn"] ?? null,
    asOrg: r["scope.client.as_org"] ?? null,
    country: r["scope.client.country"] ?? null,
    colo: r["scope.client.colo"] ?? null,
    tls: { version: r["tls.protocol.version"] ?? null, http: r["network.protocol.version"] ?? null, ja4: r["scope.client.ja4"] ?? null, extSha1: r["scope.client.tls_ext_sha1"] ?? null, helloLen: r["scope.client.tls_hello_len"] ?? null },
    bearerHash: r["scope.key.credential"] ?? null,
    installHash: r["scope.key.install"] ?? null,
    setupHeader: r["scope.key.setup_header"] ?? null,
    agentHeader: r["scope.key.agent_header"] ?? null,
    clientHeader: r["scope.key.client_header"] ?? null,
    intentHeader: r["scope.key.intent_header"] ?? null,
    refQuery: r["scope.key.reference"] ?? null,
    mcpSessionId: r["mcp.session.id"] ?? null,
    reqBody: r["scope.body.request"] ?? null,
    resBody: r["scope.body.response"] ?? null,
    resHeaders: h ?? null,
    page: r["scope.page"] ? { canonical: r["scope.page"].canonical ?? "", face: r["scope.page"].face ?? "", injected: [...(r["scope.page"].injected ?? [])], bytes: r["scope.page"].bytes ?? 0, reference_minted: r["scope.page"].reference_minted ?? null } : null,
    mintedRef: r["scope.reference_minted"] ?? null,
    gateway: r["scope.gateway"] ? { declared: r["scope.gateway"].declared ?? 0, forwarded: r["scope.gateway"].forwarded ?? 0 } : null,
    applied: applied.sort(),
  };
}

export function labDeclaration(r: LabRecord): DeclarationProjection {
  const d = r.declared ?? {};
  return {
    source: d.source ?? "gate",
    text: d.intent ?? "",
    task: d.task ?? null,
    found_via: d.found_via ?? null,
    agent: d.agent ?? null,
    addrHash: r.addrHash ?? "",
    bearerHash: r.bearerHash ?? null,
    mcpSessionId: r.mcpSessionId ?? null,
    refQuery: refOrNull(r.refQuery),
    mintedRef: r.mintedRef ?? null,
  };
}

export function declarationProjection(r: ScopeDeclaration1): DeclarationProjection {
  return {
    source: r.source,
    text: r.text,
    task: r.task ?? null,
    found_via: r.found_via ?? null,
    agent: r.agent ?? null,
    addrHash: r["scope.client.address_hash"],
    bearerHash: r["scope.key.credential"] ?? null,
    mcpSessionId: r["mcp.session.id"] ?? null,
    // The lab's gate declaration carried no page reference (an omission: its header and finder
    // declarations do); the core records the MCP url's reference on every declaration, so a gate
    // declaration's reference is outside the lab-visible projection.
    refQuery: r.source === "gate" ? null : (r["scope.key.reference"] ?? null),
    mintedRef: r["scope.reference_minted"] ?? null,
  };
}

/**
 * The four route expressions the lab's sensor reads, derived from a surface map, so the lab's
 * sensor can run a surfaces-form policy for the oracle. The lab's rule was "content is whatever
 * not_content does not name"; the core's is "content is the documentation paths the map names and
 * nothing else", so not_content names every non-content surface (an observed role, a download, a
 * passthrough, a custom entry that is not docs) and, through a negative lookahead, every path the
 * docs patterns do not match: a path the map does not know is not content on either side.
 */
export function routesFromSurfaces(surfaces: Record<string, unknown>, runPrefix: string | undefined): Record<string, string> {
  const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : typeof v === "string" ? [v] : []);
  const doorPath = (v: unknown): unknown => (typeof v === "string" ? v : rec(v).path);
  const docs = rec(surfaces.docs);
  const oauth = rec(surfaces.oauth);
  const device = rec(surfaces.device);
  const hooks = rec(surfaces.hooks);
  const cli = rec(surfaces.cli);
  const customs = Array.isArray(surfaces.custom) ? surfaces.custom.map(rec) : [];
  const passthrough = [...strs(surfaces.passthrough), ...customs.filter((c) => c.role === "passthrough").map((c) => String(c.pattern))];
  const observed = [
    ...customs.filter((c) => c.role !== "passthrough" && c.observed !== false).map((c) => String(c.pattern)),
    ...strs(surfaces.finder),
    ...strs(rec(surfaces.mcp).path),
    ...strs(oauth.metadata),
    ...strs(oauth.resource_metadata),
    ...strs(oauth.register),
    ...strs(oauth.authorize),
    ...strs(oauth.token),
    ...strs(oauth.approve),
    ...strs(device.start),
    ...strs(device.poll),
    ...strs(device.approve),
    ...strs(hooks.create),
    ...strs(hooks.catch),
    ...strs(doorPath(surfaces.credentials)),
    ...strs(doorPath(surfaces.trial)),
    ...strs(cli.init),
    ...strs(cli.beacon),
    ...strs(doorPath(surfaces.signup)),
    ...strs(rec(surfaces.api).paths),
  ];
  const download = strs(rec(surfaces.download).paths);
  const customOther = customs.filter((c) => c.role !== "passthrough" && c.role !== "docs" && c.role !== "docs_root").map((c) => String(c.pattern));
  const content = [...customs.filter((c) => c.role === "docs" || c.role === "docs_root").map((c) => String(c.pattern)), ...strs(docs.llms), ...strs(docs.root), ...strs(docs.paths)];
  const alt = (list: string[]): string => (list.length ? `(?:${list.join("|")})` : "^$");
  const out: Record<string, string> = {
    passthrough: alt(passthrough),
    not_content: alt([...observed, ...download, ...passthrough, ...customOther, `^(?!${alt(content)})`]),
    observed: alt(observed),
    text_faces: alt([...strs(docs.llms), ...strs(rec(docs.faces).txt)]),
  };
  if (runPrefix) out.run_prefix = runPrefix;
  return out;
}
