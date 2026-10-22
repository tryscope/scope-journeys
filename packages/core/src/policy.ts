import type { Environment } from "./io.js";
import type { ScopePolicy1 } from "./generated/policy.js";

export type Face = "html" | "md" | "txt";
export type Route = ScopePolicy1["surfaces"] extends infer S ? S extends { custom?: Array<{ role: infer R }> } ? R : never : never;
export type RuleKind = "inject" | "gate" | "finder" | "notfound" | "error" | "face";
export const RULE_KINDS: readonly RuleKind[] = ["inject", "gate", "finder", "notfound", "error", "face"];
/** The sections of scope.policy/1 this sensor reads; any other is ignored and named in the notices (DEPRECATION.md). */
export const POLICY_SECTIONS: readonly string[] = ["schema", "version", "about", "origin", "report", "routes", "surfaces", "secrets", "headers", "forward", "record_bodies", "observe", "rules", "assertion", "signers", "destinations", "retention_days", "salt_epoch"];
export type Mode = "dry_run" | "live";

export class PolicyError extends Error {
  override name = "PolicyError";
}

export interface FaceRewrite {
  pattern: string;
  replacement: string;
}

export interface CompiledRule {
  index: number;
  id: string;
  /** `unknown` for a kind this sensor version does not implement: it runs dry and records `skipped` (DEPRECATION.md). */
  kind: RuleKind | "unknown";
  unknown_kind: string | null;
  mode: Mode;
  environments: Environment[];
  on_error: "open" | "closed";
  label: string;
  faces: Record<string, FaceRewrite | string> | null;
  route: string | null;
  form: "tool" | "instructions" | "descriptions";
  tool: { name: string; description?: string; inputSchema?: unknown } | null;
  acknowledgement: string;
  instructions: string | null;
  description_suffix: string | null;
  answers: Array<{ match: string; links: string[] }>;
  default_links: string[];
  links: Record<string, string>;
  suffix: string;
}

/** The body field names a door's keys live in, by key kind; a name or a list of names to try in order. */
export type FieldNames = Record<string, string[]>;

export interface BodyMatch {
  field: string;
  value: unknown;
}

export interface CompiledSurfaces {
  passthrough: RegExp[];
  custom: Array<{ re: RegExp; role: Route; observed: boolean }>;
  finder: RegExp | null;
  mcp: RegExp | null;
  oauth: { metadata: RegExp | null; resource_metadata: RegExp | null; register: RegExp | null; authorize: RegExp | null; token: RegExp | null; approve: RegExp | null; fields: FieldNames };
  device: { start: RegExp | null; poll: RegExp | null; approve: RegExp | null; pollApproved: BodyMatch | null; fields: FieldNames };
  hooks: { create: RegExp | null; catch: RegExp | null; fields: FieldNames };
  credentials: { path: RegExp | null; fields: FieldNames };
  trial: { path: RegExp | null; fields: FieldNames };
  signup: { path: RegExp | null; fields: FieldNames };
  cli: { init: RegExp | null; beacon: RegExp | null; fields: FieldNames };
  /** The customer's own CLI and SDK by user-agent pattern: the reader family vendor-client. */
  clients: { cli: RegExp | null; sdk: RegExp | null };
  download: RegExp[];
  api: { paths: RegExp[]; actions: RegExp[]; actionSuccess: BodyMatch | null };
  docsLlms: RegExp | null;
  docsRoot: RegExp | null;
  docsPaths: RegExp[];
  facesMd: RegExp[];
  facesTxt: RegExp[];
}

export interface CompiledPolicy {
  document: ScopePolicy1;
  version: number;
  form: "routes" | "surfaces";
  /** A path prefix with two capture groups, stripped before classification and restored as {prefix}. */
  runPrefix: RegExp | null;
  routes: { passthrough: RegExp; notContent: RegExp; observed: RegExp; textFaces: RegExp | null } | null;
  surfaces: CompiledSurfaces | null;
  shapes: RegExp[];
  secretFields: Set<string>;
  uriFields: Map<string, RegExp>;
  headers: { credential: string; session: string; reference: string[]; install: string | null; setup: string | null; agent: string | null; client: string | null; intent: string | null; signature: string };
  forward: { headers: Record<string, string> };
  recordBodies: boolean;
  /** The Web Bot Auth signers whose key directories the sensor fetches: exact https origins. */
  signers: string[];
  /** The signed assertion on the hop to the origin: off by default; `audience` null means every host this sensor fronts. */
  assertion: { enabled: boolean; audience: string[] | null };
  rules: CompiledRule[];
  /** What the compiler noticed and tolerated: an absent schema field, an ignored routes section, a section or a rule kind it does not know (DEPRECATION.md). */
  notices: string[];
}

const ENVIRONMENTS: Environment[] = ["production", "preview", "development"];
export const isEnvironment = (value: unknown): value is Environment => ENVIRONMENTS.includes(value as Environment);

/** The embedded forward-only default (version 0): nothing hashed by shape, nothing rewritten, every request recorded. */
export const defaultPolicy: ScopePolicy1 = Object.freeze({
  schema: "scope.policy/1",
  version: 0,
  about: "The embedded default: observe and forward only. The sensor runs this before its first policy fetch and whenever the fetch fails with nothing good cached.",
  surfaces: { passthrough: [] },
  secrets: { fields: [], shapes: [], uri_fields: {} },
  headers: { credential: "authorization", session: "mcp-session-id", reference: [], install: null, setup: null, agent: null, client: null, intent: null, signature: "signature-agent" },
  forward: { headers: {} },
  record_bodies: false,
  rules: [],
}) as ScopePolicy1;

/**
 * Whether `source` repeats a group (`*`, `+` or `{`) that itself holds a repeat, as `(a+)+` or
 * `(\w*\s?)*`: the shape that can take exponential time on a crafted path or page.
 */
function repeatsRepeat(source: string): boolean {
  const open: boolean[] = [];
  let inClass = false;
  const repeat = (at: number): boolean => source[at] === "*" || source[at] === "+" || source[at] === "{";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\\") i += 1;
    else if (inClass) inClass = char !== "]";
    else if (char === "[") inClass = true;
    else if (char === "(") open.push(false);
    else if (char === ")") {
      const held = open.pop() ?? false;
      if (held && repeat(i + 1)) return true;
      if (held && open.length) open[open.length - 1] = true;
    } else if (repeat(i) && open.length) open[open.length - 1] = true;
  }
  return false;
}

/** Why the sensor will not run a pattern, or null. */
const patternProblem = (pattern: string): string | null => {
  try {
    new RegExp(pattern);
  } catch {
    return "does not compile";
  }
  return repeatsRepeat(pattern) ? "repeats a group that holds a repeat" : null;
};

const regex = (pattern: string, flags?: string): RegExp => {
  const problem = patternProblem(pattern);
  if (problem) throw new PolicyError(`the pattern ${JSON.stringify(pattern)} ${problem}`);
  return new RegExp(pattern, flags);
};
const anchored = (pattern: string): RegExp => regex(pattern.startsWith("^") ? pattern : `^${pattern}`);
const optional = (pattern: unknown): RegExp | null => (typeof pattern === "string" && pattern.length > 0 ? anchored(pattern) : null);
const list = (patterns: unknown): RegExp[] => (Array.isArray(patterns) ? patterns.filter((p): p is string => typeof p === "string" && p.length > 0).map(anchored) : []);
const loose = (pattern: unknown): RegExp | null => (typeof pattern === "string" && pattern.length > 0 ? regex(pattern) : null);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A door's `fields` map with every value as a list of names. */
function fields(raw: unknown): FieldNames {
  const out: FieldNames = {};
  if (!isRecord(raw)) return out;
  for (const [kind, names] of Object.entries(raw)) {
    if (typeof names === "string") out[kind] = [names];
    else if (Array.isArray(names)) out[kind] = names.filter((n): n is string => typeof n === "string");
  }
  return out;
}

/** The names to try for a key kind: the policy's, else the defaults. */
export function fieldNames(map: FieldNames, kind: string, defaults: readonly string[]): readonly string[] {
  const named = map[kind];
  return named && named.length ? named : defaults;
}

function bodyMatch(raw: unknown): BodyMatch | null {
  return isRecord(raw) && typeof raw.field === "string" ? { field: raw.field, value: raw.value } : null;
}

/** A door written as a pattern or as `{path, fields}`. */
function door(raw: unknown): { path: RegExp | null; fields: FieldNames } {
  if (typeof raw === "string") return { path: optional(raw), fields: {} };
  if (isRecord(raw)) return { path: optional(raw.path), fields: fields(raw.fields) };
  return { path: null, fields: {} };
}

function compileSurfaces(raw: Record<string, unknown>): CompiledSurfaces {
  const docs = isRecord(raw.docs) ? raw.docs : {};
  const faces = isRecord(docs.faces) ? docs.faces : {};
  const oauth = isRecord(raw.oauth) ? raw.oauth : {};
  const device = isRecord(raw.device) ? raw.device : {};
  const hooks = isRecord(raw.hooks) ? raw.hooks : {};
  const cli = isRecord(raw.cli) ? raw.cli : {};
  const clients = isRecord(raw.clients) ? raw.clients : {};
  const api = isRecord(raw.api) ? raw.api : {};
  const custom: CompiledSurfaces["custom"] = [];
  if (Array.isArray(raw.custom)) {
    for (const entry of raw.custom) {
      if (!isRecord(entry) || typeof entry.pattern !== "string" || typeof entry.role !== "string") throw new PolicyError("surfaces.custom entries need a pattern and a role");
      custom.push({ re: anchored(entry.pattern), role: entry.role as Route, observed: entry.observed !== false });
    }
  }
  return {
    passthrough: list(raw.passthrough),
    custom,
    finder: optional(raw.finder),
    mcp: isRecord(raw.mcp) ? optional(raw.mcp.path) : null,
    oauth: { metadata: optional(oauth.metadata), resource_metadata: optional(oauth.resource_metadata), register: optional(oauth.register), authorize: optional(oauth.authorize), token: optional(oauth.token), approve: optional(oauth.approve), fields: fields(oauth.fields) },
    device: { start: optional(device.start), poll: optional(device.poll), approve: optional(device.approve), pollApproved: bodyMatch(device.poll_approved), fields: fields(device.fields) },
    hooks: { create: optional(hooks.create), catch: optional(hooks.catch), fields: fields(hooks.fields) },
    credentials: door(raw.credentials),
    trial: door(raw.trial),
    signup: door(raw.signup),
    cli: { init: optional(cli.init), beacon: optional(cli.beacon), fields: fields(cli.fields) },
    clients: { cli: loose(clients.cli), sdk: loose(clients.sdk) },
    download: isRecord(raw.download) ? list(raw.download.paths) : [],
    api: { paths: list(api.paths), actions: list(api.actions), actionSuccess: bodyMatch(api.action_success) },
    docsLlms: optional(docs.llms),
    docsRoot: optional(docs.root),
    docsPaths: list(docs.paths),
    facesMd: list(faces.md),
    facesTxt: list(faces.txt),
  };
}

/** A character reference, which a link target or an attribute decodes: `&#47;` or `&sol;` spells a slash. */
const CHARACTER_REFERENCE = /&(?:#|[A-Za-z][A-Za-z0-9]*;)/;

/** A link that stays on the customer's site: `https://{host}`, optionally `{prefix}`, then a path, query or fragment; or a plain path. */
const onCustomerSite = (url: string): boolean => {
  // A character reference could spell a slash or a scheme inside an attribute; a plain `&` between query parameters cannot.
  if (/[\s\\\u0000-\u001f\u007f]/.test(url) || CHARACTER_REFERENCE.test(url)) return false;
  if (url.startsWith("https://{host}")) return /^(\{prefix\})?([/?#]|$)/.test(url.slice("https://{host}".length));
  return /^\/(?![/\\])/.test(url) && !url.includes("{prefix}");
};

/**
 * Why text would send a reader off the customer's site, or run or hide something, or null. Markdown
 * or text may be rendered as HTML and any word in it may become a link, so outside HTML it holds no
 * scheme, character reference, control character (links drop or decode both) or running markup.
 */
function textProblem(text: string, html: boolean): string | null {
  // Markdown drops a backslash before punctuation (`javascript\:` is a scheme), so outside HTML the text is read both ways.
  for (const form of html ? [text] : [text, text.replace(/\\([!-/:-@[-`{-~])/g, "$1")]) {
    const rest = form.replace(/(?<![A-Za-z0-9+.-])https:\/\/\{host\}(?:\{prefix\})?(?=[/?#\s"'`)\]<>,;!]|[.:](?:\s|$))/g, " ");
    if (/[\\/]{2}(?=\S)/.test(rest)) return "a link off https://{host}";
    if (/\{(?:host|prefix)\}/.test(rest)) return "{host} or {prefix} outside https://{host}{prefix}";
    if (/(?<![A-Za-z0-9-])www\./i.test(rest) || /[A-Za-z0-9._%+-]@[A-Za-z0-9-]+\.[A-Za-z]/.test(rest)) return "a www or mail address";
    if (html) return markupProblem(text);
    if (/(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]*:(?=\S)/.test(rest)) return "a link off https://{host}";
    if (CHARACTER_REFERENCE.test(rest)) return "a character reference";
    if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(rest)) return "a control character";
    if (/<[/!?]|<[A-Za-z][A-Za-z0-9+.-]*:|<[A-Za-z][^<>\s]*@|<[A-Za-z][^<>]*[=/"'`\\]|<(?:script|style|iframe|frame|frameset|object|embed|applet|svg|math|template|textarea|title|xmp|plaintext|listing|noscript|noembed|noframes|dialog|details|datalist|select|video|audio|canvas)(?![A-Za-z0-9-])/i.test(rest)) return "markup a renderer would run";
  }
  return null;
}

/**
 * Why a stretch of HTML would be unsafe to serve, or null: every `<` opens a whole tag from a short
 * list, closed in the same stretch, with no attribute but an `a`'s on-site href and a meta's utf-8
 * charset; no `>` stands alone. One pass with indexOf, so a hostile document costs linear time.
 */
function markupProblem(html: string): string | null {
  let at = 0;
  for (;;) {
    const open = html.indexOf("<", at);
    const stray = html.indexOf(">", at);
    if (stray !== -1 && (open === -1 || stray < open)) return "a stray >";
    if (open === -1) return null;
    const close = html.indexOf(">", open + 1);
    const nested = html.indexOf("<", open + 1);
    if (close === -1 || (nested !== -1 && nested < close)) return "an unclosed tag";
    const inner = html.slice(open + 1, close).trim();
    const closing = inner.startsWith("/");
    const body = closing ? inner.slice(1).trimStart() : inner;
    const name = (/^[!A-Za-z][A-Za-z0-9-]*/.exec(body)?.[0] ?? "").toLowerCase();
    let rest = body.slice(name.length).replace(/\/$/, "").trim();
    if (name === "!doctype" && !closing && rest.toLowerCase() === "html") rest = "";
    else if (!["a", "blockquote", "body", "code", "h1", "head", "html", "li", "meta", "p", "pre", "title", "ul"].includes(name)) return `the tag <${name || inner}> is not allowed`;
    else if (closing && rest) return `attributes on </${name}>`;
    while (rest) {
      const attr = /^([A-Za-z-]+)\s*=\s*"([^"]*)"\s*/.exec(rest);
      if (!attr) return `an attribute on <${name}> could not be read`;
      const attrName = (attr[1] ?? "").toLowerCase();
      const value = attr[2] ?? "";
      if (name === "a" && attrName === "href") {
        if (!onCustomerSite(value)) return "a link off the customer's site";
      } else if (!(name === "meta" && attrName === "charset" && value.toLowerCase() === "utf-8")) return `the attribute ${attrName} on <${name}> is not allowed`;
      rest = rest.slice(attr[0].length);
    }
    at = close + 1;
  }
}

/** Whether `fill` supplies every placeholder in `template` from `vars`. */
const fillable = (template: string, vars: Parameters<typeof fill>[1]): boolean => {
  try {
    fill(template, vars);
    return true;
  } catch {
    return false;
  }
};

/**
 * Why a rule's content would be unsafe to serve, or null: a rewrite is a pattern and a replacement
 * that refers only to $1 to $9, a 404 face is a page, every text passes textProblem (a 404's md page
 * shown to a browser is escaped into plain text), the error and finder links are paths on
 * the customer's site, and a gate's text and tool pass as markdown.
 */
function contentProblem(raw: Record<string, unknown>, kind: RuleKind): string | null {
  const faces = isRecord(raw.faces) ? raw.faces : {};
  const texts: Array<{ text: string; html: boolean }> = [];
  for (const [face, value] of Object.entries(faces)) {
    if (kind === "inject") {
      if (!isRecord(value) || typeof value.pattern !== "string" || typeof value.replacement !== "string") return `the ${face} face is not a pattern and a replacement`;
      if (!fillable(value.pattern, { host: "x" })) return `the ${face} face's pattern holds a placeholder other than {host}`;
      const unrun = patternProblem(fill(value.pattern, { host: "x" }));
      if (unrun) return `the ${face} face's pattern ${unrun}`;
      if (!fillable(value.replacement, { host: "x", token: "x", prefix: "x" })) return "a replacement holds a placeholder a page cannot fill";
      if (/\$(?![1-9])/.test(value.replacement)) return "a replacement refers to something other than $1 to $9";
      const refs = [...value.replacement.matchAll(/\$([1-9])/g)].map((m) => Number(m[1]));
      if (refs.some((ref, i) => ref <= (refs[i - 1] ?? 0))) return "a replacement uses a group out of order or twice";
      // Each piece, and the pieces side by side as a group that matches nothing leaves them.
      for (const literal of new Set([...value.replacement.split(/\$[1-9]/), value.replacement.replace(/\$[1-9]/g, "")])) texts.push({ text: literal, html: face === "html" });
    }
    if (kind === "notfound") {
      if (typeof value !== "string") return `the ${face} face is not a page`;
      texts.push({ text: value, html: face === "html" });
    }
  }
  const strings = (value: unknown): string[] => (typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : isRecord(value) ? Object.values(value).flatMap(strings) : []);
  if (kind === "error") {
    const unrun = typeof raw.route === "string" ? patternProblem(raw.route) : null;
    if (unrun) return `the route ${unrun}`;
    texts.push({ text: typeof raw.suffix === "string" ? raw.suffix : "", html: false });
  }
  if (kind === "finder" && Array.isArray(raw.answers) && raw.answers.some((a) => !isRecord(a) || typeof a.match !== "string" || patternProblem(a.match) !== null)) return "an answer's match is not a pattern the sensor runs";
  if (kind === "gate") for (const text of strings([raw.tool, raw.instructions, raw.description_suffix, raw.acknowledgement])) texts.push({ text, html: false });
  for (const { text, html } of texts) {
    const problem = textProblem(text, html);
    if (problem) return problem;
  }
  const links = kind === "error" ? Object.values(isRecord(raw.links) ? raw.links : {}) : kind === "finder" ? [...(Array.isArray(raw.default_links) ? raw.default_links : []), ...(Array.isArray(raw.answers) ? raw.answers.flatMap((a) => (isRecord(a) && Array.isArray(a.links) ? a.links : [null])) : [])] : [];
  for (const link of links) if (typeof link !== "string" || !link.startsWith("/") || !onCustomerSite(link)) return `the link ${JSON.stringify(link)} is not a path on the customer's site`;
  return null;
}

function compileRule(raw: unknown, index: number, notices: string[]): CompiledRule {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.kind !== "string") throw new PolicyError(`rules[${index}]: a rule needs an id and a kind`);
  const known = (RULE_KINDS as readonly string[]).includes(raw.kind);
  const kind: CompiledRule["kind"] = known ? (raw.kind as RuleKind) : "unknown";
  const problem = known ? contentProblem(raw, raw.kind as RuleKind) : null;
  if (!known) notices.push(`rule ${raw.id}: kind ${raw.kind} is not implemented by this sensor; it runs dry`);
  if (problem) notices.push(`rule ${raw.id}: ${problem}; it runs dry`);
  // An unknown kind or unsafe content runs dry whatever the document says, so a newer policy never changes the wire through an older sensor.
  const mode: Mode = known && !problem && raw.mode === "live" ? "live" : "dry_run";
  const environments = Array.isArray(raw.environments) ? raw.environments.filter(isEnvironment) : [...ENVIRONMENTS];
  const onError = raw.on_error === "closed" ? "closed" : "open";
  if (onError === "closed" && kind !== "gate") throw new PolicyError(`rules[${index}] ${raw.id}: on_error "closed" is honoured by a gate only`);
  return {
    index,
    id: raw.id,
    kind,
    unknown_kind: known ? null : raw.kind,
    mode,
    environments,
    on_error: onError,
    label: typeof raw.label === "string" ? raw.label : raw.id,
    faces: isRecord(raw.faces) && !(kind === "inject" && problem) ? (raw.faces as Record<string, FaceRewrite | string>) : null,
    // An error route is compiled on every error answer: one the sensor will not run is no route.
    route: typeof raw.route === "string" && (kind !== "error" || patternProblem(raw.route) === null) ? raw.route : null,
    form: raw.form === "instructions" || raw.form === "descriptions" ? raw.form : "tool",
    tool: isRecord(raw.tool) && typeof raw.tool.name === "string" ? (raw.tool as CompiledRule["tool"]) : null,
    acknowledgement: typeof raw.acknowledgement === "string" ? raw.acknowledgement : "",
    instructions: typeof raw.instructions === "string" ? raw.instructions : null,
    description_suffix: typeof raw.description_suffix === "string" ? raw.description_suffix : null,
    answers: Array.isArray(raw.answers) && !(kind === "finder" && problem) ? (raw.answers as CompiledRule["answers"]) : [],
    default_links: Array.isArray(raw.default_links) ? (raw.default_links as string[]) : [],
    links: isRecord(raw.links) ? (raw.links as Record<string, string>) : {},
    suffix: typeof raw.suffix === "string" ? raw.suffix : "",
  };
}

/**
 * The policy document to the shape the core runs: regular expressions compiled once, the surface
 * map or the four route expressions, the rule table with its defaults. Pure: the adapter fetches
 * and caches the document; a malformed document throws a PolicyError the adapter catches, keeping
 * its last good policy or the embedded default.
 */
export function compilePolicy(raw: unknown): CompiledPolicy {
  if (!isRecord(raw)) throw new PolicyError("a policy is a JSON object");
  const notices: string[] = [];
  if (raw.schema === undefined) notices.push("schema absent: assumed scope.policy/1");
  else if (raw.schema !== "scope.policy/1") throw new PolicyError(`unknown policy schema ${String(raw.schema)}`);
  const version = typeof raw.version === "number" && Number.isInteger(raw.version) ? raw.version : 0;
  const routesRaw = isRecord(raw.routes) ? raw.routes : null;
  const surfacesRaw = isRecord(raw.surfaces) ? raw.surfaces : null;
  if (!routesRaw && !surfacesRaw) throw new PolicyError("a policy names its routes or its surfaces");
  const form: CompiledPolicy["form"] = surfacesRaw ? "surfaces" : "routes";
  if (surfacesRaw && routesRaw && Object.keys(routesRaw).some((k) => k !== "run_prefix")) notices.push("routes ignored: surfaces present");
  if (!surfacesRaw && routesRaw) notices.push("routes form: move to surfaces");
  for (const section of Object.keys(raw)) if (!POLICY_SECTIONS.includes(section)) notices.push(`section ignored: ${section}`);
  const runPrefix = routesRaw ? optional(routesRaw.run_prefix) : null;
  const secrets = isRecord(raw.secrets) ? raw.secrets : {};
  const headers = isRecord(raw.headers) ? raw.headers : {};
  const forward = isRecord(raw.forward) ? raw.forward : {};
  const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
  const nullable = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  // Whoever serves the document never chooses where traffic, records or the install key go.
  if (typeof raw.origin === "string") notices.push("origin ignored: the sensor forwards to the origin in its own configuration");
  if (raw.report !== undefined && raw.report !== null) notices.push("report ignored: records go to the API url in the sensor's own configuration");
  if (nullable(forward.key_header)) notices.push("forward.key_header ignored: the install key never goes to the origin");
  // A name that is not a header name makes every read of it throw; one that says credential, or
  // names the policy's own credential headers, would put a secret into the record raw.
  const headerName = (field: string, name: string | null): string | null => {
    if (name === null || /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return name;
    notices.push(`headers.${field} ignored: ${JSON.stringify(name)} is not a header name`);
    return null;
  };
  const credential = headerName("credential", str(headers.credential, "authorization")) ?? "authorization";
  const apiCredential = isRecord(surfacesRaw?.api) && typeof surfacesRaw.api.credential_header === "string" ? surfacesRaw.api.credential_header.toLowerCase() : null;
  const carriesCredential = (name: string): boolean => /auth|cookie|token|secret|passw|credential|key|jwt|assertion|oidc|signature|bypass|dpop|proof|hmac|csrf|xsrf/i.test(name) || name.toLowerCase() === credential.toLowerCase() || name.toLowerCase() === apiCredential;
  const recorded = (field: string, name: string | null): string | null => {
    const valid = headerName(field, name);
    if (valid === null || !carriesCredential(valid)) return valid;
    notices.push(`headers.${field} ignored: ${JSON.stringify(valid)} carries a credential`);
    return null;
  };
  const rules = Array.isArray(raw.rules) ? raw.rules.map((rule, index) => compileRule(rule, index, notices)) : [];
  let signers = ["https://crawler.exa.ai", "https://chatgpt.com"];
  if (Array.isArray(raw.signers)) {
    signers = [];
    for (const entry of raw.signers) {
      let origin: string | null = null;
      if (typeof entry === "string" && entry.startsWith("https://")) {
        try {
          origin = new URL(entry).origin;
        } catch {
          origin = null;
        }
      }
      if (origin !== null && origin === entry) signers.push(origin);
      else notices.push(`signers entry ignored: ${JSON.stringify(entry)} is not an exact https origin`);
    }
  } else if (raw.signers !== undefined) notices.push("signers ignored: not a list");
  return {
    document: raw as unknown as ScopePolicy1,
    version,
    assertion: { enabled: isRecord(raw.assertion) && raw.assertion.enabled === true, audience: isRecord(raw.assertion) && Array.isArray(raw.assertion.audience) ? raw.assertion.audience.filter((h): h is string => typeof h === "string") : null },
    form,
    runPrefix,
    routes: form === "routes" && routesRaw
      ? {
          passthrough: anchored(str(routesRaw.passthrough, "^$")),
          notContent: anchored(str(routesRaw.not_content, "^$")),
          observed: anchored(str(routesRaw.observed, "^$")),
          textFaces: optional(routesRaw.text_faces),
        }
      : null,
    surfaces: surfacesRaw ? compileSurfaces(surfacesRaw) : null,
    shapes: Array.isArray(secrets.shapes) ? secrets.shapes.filter((s): s is string => typeof s === "string").map((s) => regex(s, "g")) : [],
    secretFields: new Set(Array.isArray(secrets.fields) ? secrets.fields.filter((f): f is string => typeof f === "string") : []),
    uriFields: new Map(Object.entries(isRecord(secrets.uri_fields) ? secrets.uri_fields : {}).filter((e): e is [string, string] => typeof e[1] === "string").map(([field, param]) => [field, new RegExp(`(?<=(?:^|[?&#])${escapeRe(param)}=)[^&#]+`, "g")])),
    headers: {
      credential,
      session: recorded("session", str(headers.session, "mcp-session-id")) ?? "mcp-session-id",
      reference: Array.isArray(headers.reference) ? headers.reference.filter((r): r is string => typeof r === "string") : [],
      install: headerName("install", nullable(headers.install)),
      setup: recorded("setup", nullable(headers.setup)),
      agent: recorded("agent", nullable(headers.agent)),
      client: recorded("client", nullable(headers.client)),
      intent: recorded("intent", nullable(headers.intent)),
      signature: headerName("signature", str(headers.signature, "signature-agent")) ?? "signature-agent",
    },
    forward: {
      // Only the policy's own x- headers reach the hop, as one line of latin-1: nothing that frames the request,
      // names its host or client, steers the origin's framework, speaks for the sensor, or carries a credential.
      headers: Object.fromEntries(
        Object.entries(isRecord(forward.headers) ? forward.headers : {}).filter((e): e is [string, string] => {
          if (typeof e[1] !== "string") return false;
          // {host} is the only placeholder outboundHeaders can fill; any other would throw on the hop.
          if (!fillable(e[1], { host: "x" })) {
            notices.push(`forward.headers ignored: ${JSON.stringify(e[0])} holds a value the sensor cannot fill on the hop`);
            return false;
          }
          if (/^[\t\x20-\x7e\x80-\xff]*$/.test(e[1]) && /^x-[a-z0-9-]+$/i.test(e[0]) && !/^x-(forwarded(-|$)|real-ip$|client-ip$|cluster-client-ip$|originating-ip$|host$|original-|rewrite-url$|http-method$|http-method-override$|method-override$|middleware-|invoke-|matched-path$|prerender-|vercel-|nextjs-|journeys-|scope-|envoy-)/i.test(e[0]) && !carriesCredential(e[0])) return true;
          notices.push(`forward.headers ignored: ${JSON.stringify(e[0])} is not a header the policy may set on the hop`);
          return false;
        }),
      ),
    },
    recordBodies: raw.record_bodies === true,
    signers,
    rules,
    notices,
  };
}

/** The effective mode of a rule on an install: live only in the environments it lists. */
export function effectiveMode(rule: CompiledRule, environment: Environment): Mode {
  return rule.mode === "live" && rule.environments.includes(environment) ? "live" : "dry_run";
}

/** `{host}`, `{token}`, `{prefix}` and `{session}` in a template. */
/**
 * The carriers' placeholders filled in. A template that asks for a value its rule cannot supply
 * (a gate acknowledgement naming `{token}`) is a malformed rule: it throws here, the runner records
 * `errored` and the original answer is served, instead of a blank going out on the wire. Any other
 * `{name}` (the error rule's `{link}`) belongs to the rule that fills it and is left as it is.
 */
export function fill(template: string, vars: Partial<Record<"host" | "token" | "prefix" | "session", string>>): string {
  return template.replace(/\{(host|token|prefix|session)\}/g, (_, k: "host" | "token" | "prefix" | "session") => {
    const value = vars[k];
    if (value === undefined) throw new TypeError(`template asks for {${k}}, which this rule cannot fill`);
    return value;
  });
}

export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
