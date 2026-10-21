import { validateDeclaration as declarationFn, validatePolicy as policyFn, validateRequest as requestFn, type ValidateFunction } from "./generated/validators.js";
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

function run(fn: ValidateFunction, document: unknown): Finding[] {
  if (fn(document)) return [];
  return (fn.errors ?? []).map((e) => ({ path: e.instancePath || "/", message: `${e.message ?? e.keyword}${e.params && "additionalProperty" in e.params ? ` (${String(e.params.additionalProperty)})` : ""}` }));
}

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
  const warnings: Finding[] = [];
  let candidate = document;
  if (document && typeof document === "object" && !Array.isArray(document) && !("schema" in document)) {
    warnings.push({ path: "/schema", message: `absent, assumed ${POLICY_SCHEMA}` });
    candidate = { schema: POLICY_SCHEMA, ...(document as Record<string, unknown>) };
  }
  const errors = run(policyFn, candidate);
  for (const finding of findSecretShapedValues(candidate)) errors.push(finding);
  return { ok: errors.length === 0, errors, warnings };
}

/** A record against schemas/request.json or schemas/declaration.json by its `schema` field. */
export function validateRecord(record: unknown): Validation {
  const schema = record && typeof record === "object" ? (record as { schema?: unknown }).schema : undefined;
  if (schema === "scope.request/1") return { ok: requestFn(record), errors: run(requestFn, record), warnings: [] };
  if (schema === "scope.declaration/1") return { ok: declarationFn(record), errors: run(declarationFn, record), warnings: [] };
  return { ok: false, errors: [{ path: "/schema", message: `unknown schema ${String(schema)}` }], warnings: [] };
}
