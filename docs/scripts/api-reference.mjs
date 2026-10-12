// The API page, generated from the Journeys subset of the public API's OpenAPI document that the
// CLI is pinned to (`packages/core/src/cli/openapi.journeys.json`). The build fails when that
// document is older than the version the CLI's client was generated against, and, with
// `--published`, older than the CLI on the registry.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
export const OPENAPI = join(ROOT, "packages/core/src/cli/openapi.journeys.json");
const CLIENT = join(ROOT, "packages/core/src/cli/client.ts");

const semver = (v) => v.split(".").map(Number);
export const olderThan = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
};

/** The contract version the CLI's client was generated against, read from its source. */
export function pinnedContractVersion(source = readFileSync(CLIENT, "utf8")) {
  const m = /CONTRACT_VERSION_VENDORED\s*=\s*"([^"]+)"/.exec(source);
  if (!m) throw new Error("CONTRACT_VERSION_VENDORED not found in packages/core/src/cli/client.ts");
  return m[1];
}

/** The contract version pinned by the CLI published as `scope-journeys@latest` (the registry is read; nothing is written); null while the package is not on the registry. */
export function publishedContractVersion() {
  const dir = mkdtempSync(join(tmpdir(), "journeys-published-"));
  try {
    let out;
    try {
      out = execFileSync("npm", ["pack", "scope-journeys@latest", "--pack-destination", dir, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      if (/E404/.test(String(error.stderr ?? error.message))) return null;
      throw error;
    }
    const [packed] = JSON.parse(out);
    execFileSync("tar", ["-xzf", join(dir, packed.filename), "-C", dir]);
    return pinnedContractVersion(readFileSync(join(dir, "package", "dist", "cli", "client.js"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const code = (s) => `\`${s}\``;
const anchor = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function typeOf(schema, components, depth) {
  if (!schema) return "unknown";
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return `[${name}](#${anchor(name)})`;
  }
  if (schema.const !== undefined) return code(JSON.stringify(schema.const));
  if (schema.enum) return schema.enum.map((v) => code(JSON.stringify(v))).join(" or ");
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf).map((s) => typeOf(s, components, depth)).join(" or ");
  if (schema.allOf) return schema.allOf.map((s) => typeOf(s, components, depth)).join(" and ");
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  if (schema.type === "array") return `array of ${typeOf(schema.items, components, depth)}`;
  if (schema.type === "object" || schema.properties) return depth > 0 ? "object (fields below)" : "object";
  if (schema.type === "string" && schema.format) return `string (${schema.format})`;
  if (schema.type === "string" && schema.pattern) return `string matching ${code(schema.pattern)}`;
  return schema.type ?? "unknown";
}

function constraints(schema) {
  const out = [];
  if (schema.minimum !== undefined) out.push(`min ${schema.minimum}`);
  if (schema.maximum !== undefined) out.push(`max ${schema.maximum}`);
  if (schema.minLength !== undefined) out.push(`at least ${schema.minLength} characters`);
  if (schema.maxLength !== undefined) out.push(`at most ${schema.maxLength} characters`);
  if (schema.minItems !== undefined) out.push(`at least ${schema.minItems} items`);
  if (schema.maxItems !== undefined) out.push(`at most ${schema.maxItems} items`);
  if (schema.default !== undefined) out.push(`default ${code(JSON.stringify(schema.default))}`);
  if (schema.nullable) out.push("nullable");
  return out.join(", ");
}

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

/** An object schema's fields as a table; nested objects one level deeper, prefixed with the parent's name. */
function fieldsTable(schema, components, prefix = "", depth = 0) {
  if (!schema || !schema.properties) return "";
  const required = new Set(schema.required ?? []);
  const rows = [];
  const nested = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    const full = prefix ? `${prefix}.${name}` : name;
    rows.push(`| ${code(full)} | ${typeOf(prop, components, depth)} | ${required.has(name) ? "yes" : "no"} | ${cell([prop.description, constraints(prop)].filter(Boolean).join("; "))} |`);
    if (prop.properties && depth < 2) nested.push(fieldsTable(prop, components, full, depth + 1));
    if (prop.type === "array" && prop.items?.properties && depth < 2) nested.push(fieldsTable(prop.items, components, `${full}[]`, depth + 1));
  }
  return ["| field | type | required | meaning |", "|---|---|---|---|", ...rows, "", ...nested.filter(Boolean)].join("\n");
}

export function render(doc) {
  const components = doc.components?.schemas ?? {};
  const vendored = doc.info?.["x-journeys-vendored-from"]?.contract_version ?? doc.info?.version;
  const out = [];
  out.push("# API", "", `The Journeys resources of Scope's public API, contract version ${vendored}, generated from the OpenAPI document the \`journeys\` CLI is pinned to. Every route is under \`https://api.tryscope.com/v1/\`. Requests carry \`Content-Type: application/json\`; a sensor authenticates with its install key (\`Authorization: Bearer sjk_...\`) or, on Vercel, the project's OIDC token; the console's session and tenant API keys reach the reads. Errors are \`{code, message, request_id, fields[]}\` (the \`ErrorEnvelope\` schema below). Mutating routes take a stable UUIDv4 \`Idempotency-Key\` header: the same key replays the same answer.`, "");
  const paths = Object.keys(doc.paths).sort();
  out.push("## Routes", "");
  for (const path of paths) {
    for (const [method, op] of Object.entries(doc.paths[path])) {
      if (!op || typeof op !== "object" || !op.operationId) continue;
      out.push(`- ${code(`${method.toUpperCase()} ${path}`)}: ${op.summary ?? op.operationId} ([${op.operationId}](#${anchor(op.operationId)}))`);
    }
  }
  out.push("");
  for (const path of paths) {
    for (const [method, op] of Object.entries(doc.paths[path])) {
      if (!op || typeof op !== "object" || !op.operationId) continue;
      out.push(`## ${op.operationId}`, "", `${code(`${method.toUpperCase()} ${path}`)}${op.summary ? `: ${op.summary}` : ""}`, "");
      if (op.security?.length) out.push(`Auth: ${op.security.map((s) => Object.keys(s).join(" and ") || "none").join(", or ")}.`, "");
      // The contract's own sections (Use when, Preconditions, Durable effect, ...) sit one level under the operation.
      if (op.description) out.push(op.description.trim(), "");
      const params = (op.parameters ?? []).filter((p) => p.name !== "x-scope-contract-version");
      if (params.length) {
        out.push("### Parameters", "", "| name | in | required | type | meaning |", "|---|---|---|---|---|");
        for (const p of params) out.push(`| ${code(p.name)} | ${p.in} | ${p.required ? "yes" : "no"} | ${typeOf(p.schema, components, 0)} | ${cell([p.description, p.schema ? constraints(p.schema) : ""].filter(Boolean).join("; "))} |`);
        out.push("");
      }
      const body = op.requestBody?.content?.["application/json"]?.schema;
      if (body) {
        out.push("### Request body", "", `${typeOf(body, components, 0)}${op.requestBody.required ? " (required)" : ""}`, "");
        if (!body.$ref) out.push(fieldsTable(body, components), "");
      }
      out.push("### Responses", "", "| status | body | meaning |", "|---|---|---|");
      for (const [status, response] of Object.entries(op.responses ?? {})) {
        const schema = response.content?.["application/json"]?.schema;
        out.push(`| ${status} | ${schema ? typeOf(schema, components, 0) : "none"} | ${cell(response.description)} |`);
      }
      out.push("");
    }
  }
  out.push("## Schemas", "");
  for (const name of Object.keys(components).sort()) {
    const schema = components[name];
    out.push(`### ${name}`, "");
    if (schema.description) out.push(schema.description.trim(), "");
    if (schema.properties) out.push(fieldsTable(schema, components), "");
    else out.push(typeOf(schema, components, 0), "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function apiReference(options = {}) {
  const doc = JSON.parse(readFileSync(OPENAPI, "utf8"));
  const vendored = doc.info?.["x-journeys-vendored-from"]?.contract_version ?? doc.info?.version;
  const pinned = pinnedContractVersion();
  if (olderThan(vendored, pinned)) throw new Error(`openapi.journeys.json is contract ${vendored}, older than the CLI's pinned ${pinned}; run scripts/vendor-openapi.mjs`);
  if (options.published) {
    const published = publishedContractVersion();
    if (published === null) console.error("api: scope-journeys is not on the registry yet; the published check is skipped");
    else if (olderThan(vendored, published)) throw new Error(`openapi.journeys.json is contract ${vendored}, older than the published CLI's ${published}`);
  }
  return render(doc);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  process.stdout.write(`${apiReference({ published: process.argv.includes("--published") })}\n`);
}
