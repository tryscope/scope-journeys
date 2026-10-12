import { fill, type CompiledRule } from "../policy.js";

/** The helpful 404: the rule's page of real guides for the face, each link carrying the reference minted for this answer; the status stays 404. */
export function notfoundPage(rule: CompiledRule, face: "md" | "html", host: string, prefix: string, token: string): { body: string; contentType: string } | null {
  const faces = rule.faces ?? {};
  const template = faces[face] ?? faces.md;
  if (typeof template !== "string") return null;
  return { body: fill(template, { host, prefix, token }), contentType: face === "md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8" };
}
