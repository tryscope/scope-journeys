import type { CompiledRule } from "../policy.js";

/**
 * The docs finder: a route the policy names, answered by the sensor. The agent posts (or asks by
 * query) one sentence about its task and gets the guide links for it, chosen by the rule's keyword
 * map, each carrying a reference minted for this answer; the sentence is a declaration against
 * that reference, so the reads that follow join it (architecture §9, Program 9).
 */
export function finderAnswer(rule: CompiledRule, text: string, host: string, prefix: string, token: string): { task: string; guides: string[] } {
  const links: string[] = [];
  for (const a of rule.answers) if (new RegExp(a.match, "i").test(text)) for (const l of a.links) if (!links.includes(l)) links.push(l);
  const chosen = links.length ? links : rule.default_links;
  return { task: text, guides: chosen.map((l) => `https://${host}${prefix}${l}?ref=${token}`) };
}

/** The sentence a finder call carries: a body field or a query parameter, the first that is a non-empty string. */
export function finderText(body: unknown, url: URL): string {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  return [b.task, b.intent, b.q, b.query, url.searchParams.get("task"), url.searchParams.get("q"), url.searchParams.get("query")].find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? "";
}
