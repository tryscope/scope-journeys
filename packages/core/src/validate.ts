import { validateDeclaration as declarationFn, validatePolicy as policyFn, validateRequest as requestFn, type ValidateFunction, type ValidationError } from "./generated/validators.js";
import { RULE_KINDS } from "./policy.js";
import { POLICY_SCHEMA } from "./record.js";

export interface Finding {
  path: string;
  message: string;
}

export interface Validation {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
}

const findingOf = (e: ValidationError): Finding => ({ path: e.instancePath || "/", message: `${e.message ?? e.keyword}${e.params && "additionalProperty" in e.params ? ` (${String(e.params.additionalProperty)})` : ""}` });

function run(fn: ValidateFunction, document: unknown): Finding[] {
  if (fn(document)) return [];
  return (fn.errors ?? []).map(findingOf);
}

/** An absent `schema` is assumed, as the compiler assumes it. */
const withSchema = (document: unknown): unknown => (document && typeof document === "object" && !Array.isArray(document) && !("schema" in document) ? { schema: POLICY_SCHEMA, ...(document as Record<string, unknown>) } : document);

const SECRET_PREFIX = /^(sjk|sk|key|token|secret|bearer|rk|ghp|xoxb)[-_]/i;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./;
const SECRET_FIELD = /key|secret|token|password/i;
const LONG_RUN = /[A-Za-z0-9_-]{32,}/;

/**
 * Every string in a document that looks like a secret: a known key prefix, a JWT, or a long
 * base64url run under a field whose name says key, secret, token or password. The policy is
 * public and may hold none; the CLI, the ingest and the privacy test all
 * refuse on a finding.
 */
export function findSecretShapedValues(document: unknown, path = ""): Finding[] {
  const findings: Finding[] = [];
  const visit = (value: unknown, at: string, name: string | null): void => {
    if (typeof value === "string") {
      if (SECRET_PREFIX.test(value)) findings.push({ path: at, message: "holds a secret-shaped value (a key prefix)" });
      else if (JWT.test(value)) findings.push({ path: at, message: "holds a secret-shaped value (a JWT)" });
      else if (name && SECRET_FIELD.test(name) && LONG_RUN.test(value)) findings.push({ path: at, message: "holds a secret-shaped value (a long run under a secret-named field)" });
      return;
    }
    if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${at}/${i}`, name));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, `${at}/${k}`, k);
  };
  visit(document, path, null);
  return findings;
}

/** The policy against schemas/policy.json plus the secret scanner; an absent `schema` is tolerated as a warning (the lab's documents). */
export function validatePolicy(document: unknown): Validation {
  const candidate = withSchema(document);
  const warnings: Finding[] = candidate === document ? [] : [{ path: "/schema", message: `absent, assumed ${POLICY_SCHEMA}` }];
  const errors = run(policyFn, candidate);
  for (const finding of findSecretShapedValues(candidate)) errors.push(finding);
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * What refuses a fetched document at runtime: a value of the wrong type, other than null, in a
 * section the sensor reads or a rule of a kind it implements. The compiler absorbs the rest
 * (DEPRECATION.md: a newer schema's fields, kinds and values are ignored or run dry, a missing
 * section or a null takes its default), and a secret-shaped value is the authoring tools' refusal.
 */
export function policyRefusals(document: unknown): Finding[] {
  const candidate = withSchema(document);
  if (policyFn(candidate)) return [];
  const errors = policyFn.errors ?? [];
  // A value that has one branch's type but failed that branch for another reason is a newer shape, not a wrong type.
  const oneOfPaths = new Set(errors.filter((e) => e.keyword === "oneOf").map((e) => e.instancePath));
  const reshaped = new Set(errors.filter((e) => e.keyword !== "type" && e.keyword !== "oneOf" && oneOfPaths.has(e.instancePath)).map((e) => e.instancePath));
  const at = (path: string): unknown => path.split("/").slice(1).reduce<unknown>((value, key) => (value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), candidate);
  return errors
    .filter((e) => {
      if (e.keyword !== "type" || reshaped.has(e.instancePath) || !/^\/(routes|surfaces|secrets|headers|forward\/headers|record_bodies|observe\/bodies\/allow_fields|rules|assertion|signers)(\/|$)/.test(e.instancePath) || at(e.instancePath) === null) return false;
      const rule = /^\/rules\/(\d+)\//.exec(e.instancePath);
      const kind = rule ? at(`/rules/${rule[1]}/kind`) : null;
      return !rule || (RULE_KINDS as readonly unknown[]).includes(kind);
    })
    .map(findingOf);
}

/** A record against schemas/request.json or schemas/declaration.json by its `schema` field. */
export function validateRecord(record: unknown): Validation {
  const schema = record && typeof record === "object" ? (record as { schema?: unknown }).schema : undefined;
  if (schema === "scope.request/1") return { ok: requestFn(record), errors: run(requestFn, record), warnings: [] };
  if (schema === "scope.declaration/1") return { ok: declarationFn(record), errors: run(declarationFn, record), warnings: [] };
  return { ok: false, errors: [{ path: "/schema", message: `unknown schema ${String(schema)}` }], warnings: [] };
}
