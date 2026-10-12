// Writes packages/core/TELEMETRY.md from schemas/request.json and schemas/declaration.json, so the
// document that says what the sensor records cannot go stale: a field the grouping map below does
// not know fails the script, and the privacy test regenerates and diffs the committed file.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = join(here, "..", "packages", "core");
const request = JSON.parse(readFileSync(join(core, "schemas", "request.json"), "utf8"));
const declaration = JSON.parse(readFileSync(join(core, "schemas", "declaration.json"), "utf8"));
const policy = JSON.parse(readFileSync(join(core, "schemas", "policy.json"), "utf8"));

// Every field of scope.request/1, by group. A new field must be placed here before it can ship.
export const GROUPS = {
  identity: ["schema", "id", "ts", "observed_ts", "install", "source", "observer", "request_id"],
  "request and response": ["http.request.method", "server.address", "url.path", "url.query", "http.response.status_code", "scope.route", "http.request.header.content-type", "http.response.header.content-type", "scope.request.bytes", "scope.response.bytes", "scope.cache", "scope.timing"],
  client: ["scope.client.address_hash", "scope.client.address_family", "scope.client.asn", "scope.client.as_org", "scope.client.country", "scope.client.colo", "user_agent.original", "scope.client.accept", "scope.client.fetch_metadata", "tls.protocol.version", "network.protocol.version", "scope.client.ja4", "scope.client.tls_ext_sha1", "scope.client.tls_hello_len"],
  "agent evidence": ["scope.signature", "scope.platform_bot", "scope.reader"],
  "keys and carriers": ["scope.key.credential", "scope.key.install", "scope.key.device_code", "scope.key.user_code", "scope.key.oauth_client", "mcp.session.id", "scope.key.hook", "scope.key.reference", "scope.key.setup_header", "scope.key.agent_header", "scope.key.client_header", "scope.key.intent_header"],
  "MCP and OAuth": ["mcp.protocol.version", "mcp.method.name", "scope.mcp.tools", "scope.mcp.client", "scope.oauth"],
  bodies: ["scope.body.request", "scope.body.response", "scope.body.truncated", "scope.response.headers"],
  "page and rules": ["scope.page", "scope.reference_minted", "scope.decision", "scope.gateway"],
  observer: ["scope.observer.errors", "scope.observer.dropped"],
};

const WHEN = {
  identity: "every record",
  "request and response": "every record",
  client: "every record (the network facts when the platform exposes them)",
  "agent evidence": "when the request carries a signature, when the zone has bot management; the reader on every record",
  "keys and carriers": "when the request carries the header, query parameter or body field",
  "MCP and OAuth": "on the MCP and OAuth routes, in every form",
  bodies: "only on observed routes, only when the policy records bodies",
  "page and rules": "on page reads and wherever a rule matched",
  observer: "every record",
};

const placed = new Set(Object.values(GROUPS).flat());
const unknown = Object.keys(request.properties).filter((name) => !placed.has(name));
const missing = [...placed].filter((name) => !(name in request.properties));
if (unknown.length) throw new Error(`fields in schemas/request.json with no group in telemetry-doc.mjs: ${unknown.join(", ")}`);
if (missing.length) throw new Error(`fields in telemetry-doc.mjs that are not in schemas/request.json: ${missing.join(", ")}`);

const typeOf = (p) => {
  if (p.const !== undefined) return `const ${JSON.stringify(p.const)}`;
  if (p.enum) return p.enum.map((v) => (v === null ? "null" : String(v))).join(" | ");
  if (p.oneOf) return p.oneOf.map((o) => (o.$ref ? o.$ref.split("/").pop() : typeOf(o))).join(" | ");
  if (p.$ref) return p.$ref.split("/").pop();
  if (Array.isArray(p.type)) return p.type.join(" | ");
  if (p.type === "array") return `array of ${p.items?.$ref ? p.items.$ref.split("/").pop() : p.items?.type ?? "value"}`;
  return p.type ?? "value";
};
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const lines = [];
lines.push("# What Scope Journeys records");
lines.push("");
lines.push("Generated from `schemas/request.json` and `schemas/declaration.json` by `scripts/telemetry-doc.mjs`; a field cannot ship without appearing here, and the privacy test fails when this file is stale.");
lines.push("");
lines.push("**What it records.** For each request: method, host, path and query string, status, timing, the client's user agent, Accept and fetch-metadata headers, the network facts your platform exposes (AS number, country, TLS version, JA4), a one-way hash of the client's address, a one-way hash of any credential (bearer token, device code, install id), the MCP session id, the reference code if one was carried, and what the observer did. It never records a raw address or a raw credential; the hash is salted per installation and rotated on your request. It never records a text or HTML body. It records request and response bodies only on the routes you list, only the fields you allow, only up to 64 KB, with your secret value shapes hashed wherever they appear; in its lightest form it records no bodies at all. It never records cookies, the `Authorization` value or `Set-Cookie`.");
lines.push("");
lines.push("**What it holds.** No secret of yours: the observer's own credential is an installation key you can rotate or revoke at any time, or, on Vercel, your project's OIDC identity with no key at all. Its configuration is a public document with no secret in it. It stores nothing on your infrastructure.");
lines.push("");
lines.push("**How it fails.** Open, always: if the observer cannot reach Scope, cannot load its configuration, or encounters an error, your request is forwarded unchanged and your origin's answer is returned as it was. It never retries a report more than once and never delays a response to report.");
lines.push("");
lines.push("**Where the data goes and for how long.** To Scope's ingest over HTTPS, batched after the response, signed; stored in your tenant for 90 days by default, with the raw batches kept append-only as the audit trail; exportable to your own OpenTelemetry collector as log records and traces; deletable with your tenant.");
lines.push("");
lines.push("**The salt.** Every hash is `sha256(salt + \":\" + value)` cut to twelve hexadecimal characters, with a salt you generate at install and Scope never receives. A hash is a join key inside your salt epoch and nothing else: Scope cannot reverse it, and you can re-hash a value you know to find it in your own records.");
lines.push("");
lines.push("**Signatures.** A request carrying a Web Bot Auth signature (`Signature-Agent`, `Signature-Input`, `Signature`) is verified by the sensor itself against the host the agent spoke to (`server.address`), with the signer's public key fetched from the directory the agent names (`/.well-known/http-message-signatures-directory`) and cached for an hour; that fetch is the only outbound request the sensor makes beside the hop to your origin and the shipment to Scope, it never delays a request beyond two seconds, and a directory that could not be fetched is retried after a minute. The record carries `scope.signature` with `valid` and the reason: `verified`, `expired`, `not_yet_valid`, `unknown_key`, `directory_unreachable`, `bad_signature`, `unsupported_alg`, or `authority_mismatch` (a good signature for a host this sensor does not serve).");
lines.push("");
lines.push("**Rules and decisions.** Every rule in your policy is `dry_run` when installed: the sensor computes what the rule would have done, records the decision with `outcome: would_apply` and the reason it would have had live, and changes nothing on the wire. A rule you flip to `live` records `applied` with the same reason. You can read every decision in the console's Debugger.");
lines.push("");
lines.push("## The request record, `scope.request/1`");
lines.push("");
for (const [group, names] of Object.entries(GROUPS)) {
  lines.push(`### ${group}`);
  lines.push("");
  lines.push(`Present: ${WHEN[group]}.`);
  lines.push("");
  lines.push("| field | type | description |");
  lines.push("|---|---|---|");
  for (const name of names) {
    const p = request.properties[name];
    lines.push(`| \`${name}\` | ${cell(typeOf(p))} | ${cell(p.description)} |`);
    if (p.properties) {
      for (const [sub, sp] of Object.entries(p.properties)) lines.push(`| \`${name}.${sub}\` | ${cell(typeOf(sp))} | ${cell(sp.description)} |`);
    }
  }
  lines.push("");
}
lines.push("## The declaration record, `scope.declaration/1`");
lines.push("");
lines.push(declaration.description);
lines.push("");
lines.push("| field | type | description |");
lines.push("|---|---|---|");
for (const [name, p] of Object.entries(declaration.properties)) lines.push(`| \`${name}\` | ${cell(typeOf(p))} | ${cell(p.description)} |`);
lines.push("");
lines.push("## The policy, `scope.policy/1`");
lines.push("");
lines.push(policy.description);
lines.push("");
lines.push("| section | what it may contain |");
lines.push("|---|---|");
for (const [name, p] of Object.entries(policy.properties)) lines.push(`| \`${name}\` | ${cell(p.description ?? typeOf(p))} |`);
lines.push("");
lines.push("## The hashes and the references");
lines.push("");
lines.push("A hash (`hash12`) is twelve lowercase hexadecimal characters. A reference is eight characters of the base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`: three encode the minting minute, four are random, one is a check character; it is minted per serve of a page and carries no information about the reader.");
lines.push("");

const target = join(core, "TELEMETRY.md");
const text = lines.join("\n");
if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== text) {
    console.error("TELEMETRY.md is stale: run npm run generate in packages/core");
    process.exit(1);
  }
  console.log("TELEMETRY.md current");
} else {
  writeFileSync(target, text);
  console.log("wrote packages/core/TELEMETRY.md");
}
