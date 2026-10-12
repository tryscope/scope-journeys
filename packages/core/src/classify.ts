import type { PlatformBot } from "./io.js";
import type { CompiledPolicy, CompiledSurfaces, Face, Route } from "./policy.js";
import type { ScopeRequest1 } from "./generated/request.js";

export type Reader = ScopeRequest1["scope.reader"];

export interface RouteInfo {
  route: Route;
  /** Bodies are read on observed routes and nowhere else. */
  observed: boolean;
  /** A documentation path the map names: a reference is minted per serve, the inject rules apply, a 404 is helpful. A path the map does not name is never a page, whatever the origin serves. */
  content: boolean;
  /** Whether the policy named this path; a path it did not name is `other`: not observed, not content, changed by no rule. */
  known: boolean;
  /** The hook id a catch path carried, when the surface map's catch pattern captured one. */
  hookId: string | null;
}

const OBSERVED_ROLES: ReadonlySet<Route> = new Set<Route>(["api", "mcp", "oauth.register", "oauth.authorize", "oauth.token", "oauth.approve", "device.start", "device.poll", "device.approve", "signup", "hooks.create", "hooks.catch", "credentials", "trial", "cli.init", "cli.beacon", "finder"]);

const result = (route: Route, observed: boolean, hookId: string | null = null, known = true): RouteInfo => ({ route, observed, content: route === "docs" || route === "docs_root", known, hookId });

/**
 * The surface role of a path (architecture §7.4, decision 13). Two forms: the regular-expression
 * form the lab ran (four expressions, no roles beyond content and observed) and the surface map,
 * whose precedence is fixed, first match wins: passthrough, the customer's custom list in order,
 * finder, mcp, the OAuth endpoints, the device flow, hooks, credentials, trial, the CLI's init and
 * beacon, signup, download, api, the root map and the docs root, the docs paths, else other (not
 * observed, not known).
 */
export function classifyRoute(path: string, policy: CompiledPolicy): RouteInfo {
  if (policy.form === "routes" && policy.routes) {
    const r = policy.routes;
    if (r.passthrough.test(path)) return result("passthrough", false);
    const content = !r.notContent.test(path);
    const observed = r.observed.test(path);
    if (content) return result(r.textFaces?.test(path) ? "docs_root" : "docs", false);
    return result(observed ? "api" : "other", observed);
  }
  const s = policy.surfaces;
  if (!s) return result("other", false, null, false);
  if (s.passthrough.some((re) => re.test(path))) return result("passthrough", false);
  for (const entry of s.custom) if (entry.re.test(path)) return result(entry.role, entry.role === "passthrough" ? false : entry.observed, null);
  if (s.finder?.test(path)) return result("finder", true);
  if (s.mcp?.test(path)) return result("mcp", true);
  if (s.oauth.metadata?.test(path) || s.oauth.resource_metadata?.test(path)) return result("api", true);
  if (s.oauth.register?.test(path)) return result("oauth.register", true);
  if (s.oauth.authorize?.test(path)) return result("oauth.authorize", true);
  if (s.oauth.token?.test(path)) return result("oauth.token", true);
  if (s.oauth.approve?.test(path)) return result("oauth.approve", true);
  if (s.device.start?.test(path)) return result("device.start", true);
  if (s.device.poll?.test(path)) return result("device.poll", true);
  if (s.device.approve?.test(path)) return result("device.approve", true);
  if (s.hooks.create?.test(path)) return result("hooks.create", true);
  const caught = s.hooks.catch?.exec(path);
  if (caught) return result("hooks.catch", true, caught[1] ?? null);
  if (s.credentials.path?.test(path)) return result("credentials", true);
  if (s.trial.path?.test(path)) return result("trial", true);
  if (s.cli.init?.test(path)) return result("cli.init", true);
  if (s.cli.beacon?.test(path)) return result("cli.beacon", true);
  if (s.signup.path?.test(path)) return result("signup", true);
  if (s.download.some((re) => re.test(path))) return result("download", false);
  if (s.api.paths.some((re) => re.test(path))) return result("api", true);
  if (s.docsLlms?.test(path) || s.docsRoot?.test(path)) return result("docs_root", false);
  if (s.docsPaths.some((re) => re.test(path))) return result("docs", false);
  return result("other", false, null, false);
}

export const isObservedRole = (route: Route): boolean => OBSERVED_ROLES.has(route);

/** Whether a plain-text answer on this path is a page (the root map): text_faces in the routes form, docs.faces.txt and docs.llms in the map. */
export function isTextFace(path: string, policy: CompiledPolicy): boolean {
  if (policy.form === "routes") return Boolean(policy.routes?.textFaces?.test(path));
  const s = policy.surfaces;
  return Boolean(s && (s.facesTxt.some((re) => re.test(path)) || s.docsLlms?.test(path)));
}

/** The face a page request asks for, from the path's extension then Accept (used for the helpful 404). */
export function requestedFace(path: string, accept: string | null, policy: CompiledPolicy): "md" | "html" {
  if (path.endsWith(".md")) return "md";
  if (/text\/markdown/.test(accept ?? "")) return "md";
  if (policy.surfaces?.facesMd.some((re) => re.test(path))) return "md";
  return "html";
}

/** The face of a served page, from the origin's content type (the authority on what it sent). */
export function servedFace(contentType: string): Face {
  return /text\/html/.test(contentType) ? "html" : /text\/markdown/.test(contentType) ? "md" : "txt";
}

export interface FetchMetadata {
  sec_ch_ua: boolean;
  sec_fetch_dest: string | null;
  sec_fetch_mode: string | null;
  upgrade_insecure: boolean;
}

/** The reader families the agent string alone decides, in the order they are tried. */
export const READER_TABLE: ReadonlyArray<{ family: Reader; agent: RegExp }> = Object.freeze([
  { family: "claude-code", agent: /claude-code\// },
  { family: "claude-ai", agent: /Claude-User/ },
  { family: "openai", agent: /ChatGPT-User|OAI-SearchBot/ },
  { family: "shell", agent: /^(curl|python|node|undici|wget|go-http|axios)/i },
]);

/**
 * Who read the page (architecture §11.2, the lab's `readerOf`): Exa's signature, any other
 * signature, Claude Code's own fetcher, Claude's assistant fetcher, OpenAI's pool, Cursor's own
 * fetcher (a Chrome-on-Windows string without fetch metadata and a markdown-first Accept), the
 * customer's own CLI or SDK by the policy's `clients` patterns (vendor-client), a browser (fetch
 * metadata present), a shell or runtime client, else unknown.
 */
export function classifyReader(userAgent: string, accept: string | null, fetchMetadata: FetchMetadata, signatureAgent: string | null, platformBot: PlatformBot | null, clients: CompiledSurfaces["clients"] | null = null): Reader {
  const browserSignals = Boolean(fetchMetadata.sec_ch_ua || fetchMetadata.sec_fetch_dest === "document" || fetchMetadata.upgrade_insecure);
  if (signatureAgent && /exa\.ai/.test(signatureAgent)) return "exa";
  if (signatureAgent) return "signed";
  if (platformBot?.verified && platformBot.signed_agent && /exa\.ai/.test(platformBot.signed_agent)) return "exa";
  if (/claude-code\//.test(userAgent)) return "claude-code";
  if (/Claude-User/.test(userAgent)) return "claude-ai";
  if (/ChatGPT-User|OAI-SearchBot/.test(userAgent)) return "openai";
  if (/Windows NT 10\.0.*Chrome/.test(userAgent) && !browserSignals && /^text\/markdown/.test(accept ?? "")) return "cursor";
  if (clients?.cli?.test(userAgent) || clients?.sdk?.test(userAgent)) return "vendor-client";
  if (browserSignals) return "browser";
  if (/^(curl|python|node|undici|wget|go-http|axios)/i.test(userAgent) || userAgent === "node") return "shell";
  return "unknown";
}

export const AGENT_READERS: ReadonlySet<Reader> = new Set<Reader>(["claude-code", "claude-ai", "openai", "exa", "cursor"]);
