import { fill, type CompiledRule } from "../policy.js";

/** The helpful 404: the rule's page of real guides for the face, each link carrying the reference minted for this answer; the status stays 404. */
export function notfoundPage(rule: CompiledRule, face: "md" | "html", host: string, prefix: string, token: string): { body: string; contentType: string } | null {
  const faces = rule.faces ?? {};
  const template = faces[face] ?? faces.md;
  if (typeof template !== "string") return null;
  const page = fill(template, { host, prefix, token });
  if (face === "html" && typeof faces.html !== "string") {
    // A markdown page shown to a browser is plain text: escaped, nothing in it is read as a tag.
    const text = page.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return { body: `<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head><body><pre>${text}</pre></body></html>`, contentType: "text/html; charset=utf-8" };
  }
  return { body: page, contentType: face === "md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8" };
}
