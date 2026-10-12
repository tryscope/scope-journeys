import { fill, type CompiledRule } from "../policy.js";

/**
 * The error link: the product's own error message on a status the rule names gains "Guide: <link>"
 * with a reference minted here and recorded against this call's credential, so a read of that
 * guide joins this journey exactly (architecture §9, Program 8).
 */
export function errorLink(rule: CompiledRule, json: unknown, status: number, host: string, prefix: string, token: string): string | null {
  const link = rule.links[String(status)];
  if (!link || !json || typeof json !== "object" || !("error" in json)) return null;
  const doc = json as { error: unknown };
  const suffix = fill(rule.suffix.replace("{link}", `https://${host}${prefix}${link}`), { host, prefix, token });
  if (doc.error && typeof doc.error === "object" && typeof (doc.error as { message?: unknown }).message === "string") {
    (doc.error as { message: string }).message += suffix;
    return JSON.stringify(doc);
  }
  if (typeof doc.error === "string") {
    doc.error += suffix;
    return JSON.stringify(doc);
  }
  return null;
}
