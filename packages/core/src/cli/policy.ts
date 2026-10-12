import { readFileSync } from "node:fs";

import { compilePolicy, PolicyError } from "../policy.js";
import { validatePolicy } from "../validate.js";

export interface PolicyReport {
  file: string;
  ok: boolean;
  summary: string;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

/** `journeys policy validate <file>`: the schema, the secret scanner, the compiler; never a value, only paths. */
export function validateFile(file: string): PolicyReport {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { file, ok: false, summary: "not a JSON document", errors: [{ path: "/", message: error instanceof Error ? error.message : String(error) }], warnings: [] };
  }
  const result = validatePolicy(document);
  const errors = result.errors.map((e) => (/secret-shaped/.test(e.message) ? { path: e.path, message: "holds a secret-shaped value" } : e));
  const warnings = [...result.warnings];
  let summary = "";
  if (errors.length === 0) {
    try {
      const compiled = compilePolicy(document);
      summary = `valid: scope.policy/1 version ${compiled.version}, ${compiled.rules.length} rules`;
      for (const notice of compiled.notices) warnings.push({ path: "/", message: notice });
      for (const rule of compiled.rules) if (rule.kind === "face") warnings.push({ path: `/rules/${rule.index}`, message: "kind face is not implemented by this sensor version; it records a skipped decision" });
    } catch (error) {
      errors.push({ path: "/", message: error instanceof PolicyError ? error.message : String(error) });
    }
  }
  return { file, ok: errors.length === 0, summary: errors.length ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : summary, errors, warnings };
}
