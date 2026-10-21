import { escapeRe, fill, type CompiledRule, type Face, type FaceRewrite } from "../policy.js";

export interface Rewrite {
  body: string;
  applied: Array<{ rule: CompiledRule; label: string }>;
}

/** A page rule: a pattern and a replacement per face, with {host}, {prefix} and {token} filled in. */
export function rewritePage(body: string, rules: readonly CompiledRule[], vars: { host: string; token: string; face: Face; prefix: string }): Rewrite {
  const applied: Rewrite["applied"] = [];
  for (const rule of rules) {
    if (rule.kind !== "inject" || !rule.faces) continue;
    const face = rule.faces[vars.face];
    if (!face || typeof face === "string") continue;
    const rewrite: FaceRewrite = face;
    const re = new RegExp(fill(rewrite.pattern, { host: escapeRe(vars.host) }), "g");
    if (!re.test(body)) continue;
    if (!applied.some((a) => a.label === rule.label)) applied.push({ rule, label: rule.label });
    body = body.replace(re, fill(rewrite.replacement, { token: vars.token, host: vars.host, prefix: vars.prefix }));
  }
  return { body, applied };
}
