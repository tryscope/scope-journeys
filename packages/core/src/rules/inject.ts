import { escapeRe, fill, type CompiledRule, type Face, type FaceRewrite } from "../policy.js";

export interface Rewrite {
  body: string;
  applied: Array<{ rule: CompiledRule; label: string }>;
  /** The rules left out because they would grow the page past twice its size and 64 KiB. */
  capped: CompiledRule[];
}

/**
 * Where offsets of an HTML page fall, read as a browser reads them: inside a tag, comment or
 * declaration, or inside an element whose content is text only (script, style, title, textarea and the like).
 * Where the reading is unsure, the offset is inside.
 */
function placesOf(html: string): (offset: number) => { tag: boolean; raw: boolean } {
  const tags: Array<[number, number]> = [];
  const raw: Array<[number, number]> = [];
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i + 1)) {
    const next = html[i + 1] ?? "";
    let end: number;
    if (html.startsWith("<!--", i)) {
      end = html.indexOf("-->", i + 4);
      end = end === -1 ? html.length : end + 2;
    } else if (/[a-z]/i.test(next) || (next === "/" && /[a-z]/i.test(html[i + 2] ?? ""))) {
      // A quote opens a value only right after `=`; anywhere else in a tag it is a plain character.
      end = i + 1;
      let quote: string | null = null;
      let afterEquals = false;
      for (; end < html.length; end += 1) {
        const char = html[end] ?? "";
        if (quote) {
          if (char === quote) quote = null;
        } else if (char === ">") break;
        else if (afterEquals && (char === '"' || char === "'")) quote = char;
        if (!quote) afterEquals = char === "=" || (afterEquals && /\s/.test(char));
      }
    } else if (next === "!" || next === "?" || next === "/") {
      end = html.indexOf(">", i + 1);
      if (end === -1) end = html.length;
    } else continue;
    tags.push([i, end]);
    const element = /^<(script|style|title|textarea|xmp|iframe|noembed|noframes|noscript|plaintext)(?=[\t\n\f\r />]|$)/i.exec(html.slice(i, i + 12))?.[1]?.toLowerCase();
    let after = end + 1;
    if (element) {
      // Without the u flag, i folds ASCII only, so `</SCRIPT` closes a script and no other letter does.
      const closer = new RegExp(`</${element}(?=[\\t\\n\\f\\r />])${element === "script" ? "|<!--|-->|<script(?=[\\t\\n\\f\\r />])" : ""}`, "gi");
      closer.lastIndex = after;
      // In a script, `<!--` up to `-->` is escaped: there `<script` opens a stretch whose first `</script` does not end the script.
      let escaped = false;
      let doubled = false;
      let stop = html.length;
      for (let m = closer.exec(html); m; m = closer.exec(html)) {
        if (m[0] === "<!--") {
          escaped = true;
          closer.lastIndex = m.index + 2;
        } else if (m[0] === "-->") escaped = doubled = false;
        else if (m[0][1] !== "/") doubled ||= escaped;
        else if (doubled) doubled = false;
        else {
          stop = m.index;
          break;
        }
      }
      raw.push([after, stop]);
      after = stop;
    }
    i = after - 1;
  }
  // Text placed at a tag's `<` lands before the tag; text placed at a script's first character lands inside it.
  const within = (ranges: Array<[number, number]>, offset: number, fromStart: boolean): boolean => {
    let lo = 0;
    let hi = ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const start = ranges[mid]?.[0] ?? 0;
      if (start < offset || (fromStart && start === offset)) lo = mid + 1;
      else hi = mid;
    }
    const range = ranges[lo - 1];
    return range !== undefined && offset <= range[1];
  };
  return (offset) => ({ tag: within(tags, offset, false), raw: within(raw, offset, true) });
}

/** A page rule: a pattern and a replacement per face, with {host}, {prefix} and {token} filled in. */
export function rewritePage(body: string, rules: readonly CompiledRule[], vars: { host: string; token: string; face: Face; prefix: string }): Rewrite {
  const applied: Rewrite["applied"] = [];
  const capped: CompiledRule[] = [];
  const limit = body.length * 2 + 65536;
  // Built once and kept while no rule changes the body: the offsets hold until a replacement moves them.
  let places: ReturnType<typeof placesOf> | null = null;
  // Inside a tag or script, rule text continues a link only in characters that end no attribute, string or
  // statement; on a text face (meets below) in any character a link holds that markdown does not read as syntax.
  const linkEnd = new RegExp(`https://${escapeRe(vars.host)}(?:[/?][A-Za-z0-9._~%/?=&-]*)?$`);
  const site = `https://${vars.host}`;
  for (const rule of rules) {
    if (rule.kind !== "inject" || !rule.faces) continue;
    const face = rule.faces[vars.face];
    if (!face || typeof face === "string") continue;
    const rewrite: FaceRewrite = face;
    const re = new RegExp(fill(rewrite.pattern, { host: escapeRe(vars.host) }), "gd");
    // Split before filling, so a $ in a filled value stays text.
    const segments: Array<{ text: string } | { group: number }> = [];
    let last = 0;
    for (const ref of rewrite.replacement.matchAll(/\$([1-9])/g)) {
      segments.push({ text: fill(rewrite.replacement.slice(last, ref.index), vars) }, { group: Number(ref[1]) });
      last = ref.index + ref[0].length;
    }
    segments.push({ text: fill(rewrite.replacement.slice(last), vars) });
    let out = "";
    let read = 0;
    let replaced = 0;
    // The last `keep` characters written (the HTML face reads only the last), and where in the page the
    // page text written last ends, or null after rule text.
    const keep = vars.face === "html" ? 1 : 256;
    let tail = "";
    let joined: number | null = 0;
    for (const match of body.matchAll(re)) {
      const indices = match.indices;
      if (!indices) continue;
      const placeOf = vars.face === "html" ? (places ??= placesOf(body)) : null;
      // Groups lie in the match in page order. On the HTML face the page's own bytes keep their meaning: text
      // the replacement drops is plain text, and inside a tag or text-only element rule text only extends a
      // link to this site (a ?ref= code). Any other match keeps the page's text.
      const end = match.index + match[0].length;
      const drops: Array<[number, number]> = [];
      let cursor = match.index;
      let before = "";
      let safe = true;
      const pieces: string[] = [];
      tail = (tail + body.slice(Math.max(read, match.index - keep), match.index)).slice(-keep);
      if (read !== match.index) joined = match.index;
      // Text that did not stand side by side in the page (rule text, or page text the replacement brings
      // together) never opens a tag after a bare `<`, and on a text face meets inside a word only to
      // continue a link to this site past its host: a path, query or fragment such as a ?ref= code.
      const meets = (next: string, from: number | null): boolean => {
        if (!next || (from !== null && from === joined)) return true;
        const left = tail + pieces.join("");
        if (left.endsWith("<") && /^[A-Za-z/!?]/.test(next)) return false;
        if (placeOf) return true;
        if (!/^[\w.~%+@:/\\&#;<>!?=()[\]\u0080-\uffff-]{2}$/.test(left.slice(-1) + next[0])) return true;
        const at = left.lastIndexOf(site);
        if (at === -1 || /[A-Za-z0-9+.-]/.test(left[at - 1] ?? "")) return false;
        const path = left.slice(at + site.length);
        return path ? /^[/?#][^\s<>"'`()[\]{}\\|^]*$/.test(path) : /^[/?#]/.test(next);
      };
      for (const segment of segments) {
        if ("group" in segment) {
          const span = indices[segment.group];
          before = span ? match[segment.group] ?? "" : "";
          if (span) {
            if (span[0] < cursor || span[1] > end || (before && !meets(before, span[0]))) {
              safe = false;
              break;
            }
            drops.push([cursor, span[0]]);
            cursor = span[1];
            if (before) joined = span[1];
          }
          pieces.push(before);
        } else {
          const place = segment.text ? placeOf?.(cursor) : null;
          if (place && (place.tag || place.raw)) {
            // Rule text may only extend a link to this site that starts in the page's own bytes, and add
            // no `&` that could name an entity inside an attribute.
            const link = linkEnd.exec(before + segment.text);
            if (!(link && link.index < before.length && !segment.text.includes("&"))) {
              safe = false;
              break;
            }
          }
          if (!meets(segment.text, null)) {
            safe = false;
            break;
          }
          before = "";
          pieces.push(segment.text);
          if (segment.text) joined = null;
        }
      }
      if (safe && !meets(body.slice(end, end + 1), end)) safe = false;
      drops.push([cursor, end]);
      if (placeOf && drops.some(([from, to]) => {
        if (from >= to) return false;
        const place = placeOf(from);
        return place.tag || place.raw || /[<>"'`]/.test(body.slice(from, to));
      })) safe = false;
      const written = safe ? pieces.join("") : match[0];
      out += body.slice(read, match.index) + written;
      tail = (tail + written).slice(-keep);
      if (!safe) joined = end;
      read = end;
      // Only a broken or hostile rule grows a page this far: it is left out, and the page keeps what the rules before it did.
      if (out.length + body.length - read > limit) {
        capped.push(rule);
        replaced = 0;
        break;
      }
      if (safe) replaced += 1;
    }
    if (!replaced) continue;
    body = out + body.slice(read);
    places = null;
    if (!applied.some((a) => a.label === rule.label)) applied.push({ rule, label: rule.label });
  }
  return { body, applied, capped };
}
