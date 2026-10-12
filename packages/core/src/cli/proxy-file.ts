/**
 * The proxy file `init` writes or wraps (plan J2.1 step 4). The wrap is conservative on purpose:
 * it handles the two default-export shapes a Next proxy file has (`export default function name`
 * and `export default <expression>` on one statement) and a `config.matcher` array literal, and
 * refuses everything else so the person edits by hand (exit 3) rather than trusting a rewrite of
 * a file the CLI did not understand. The shipped core carries no parser dependency.
 */
export const JOURNEYS_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";
export const IMPORT_LINE = 'import { withJourneys } from "scope-journeys-next"';
export const PREVIOUS_NAME = "journeysPrevious";

export function createProxySource(): string {
  return [IMPORT_LINE, "", "export default withJourneys()", "", "export const config = {", `  matcher: [${JSON.stringify(JOURNEYS_MATCHER)}],`, "}", ""].join("\n");
}

export interface Wrapped {
  ok: boolean;
  source: string;
  /** The binding the customer's own default export now has; `next` is called with it. */
  previous: string | null;
  reason: string | null;
  /** The two lines to add by hand when the wrap refused. */
  manual: string[];
}

const manualLines = (): string[] => [`${IMPORT_LINE}  // at the top of the file`, `export default withJourneys({ next: <your previous default export> })  // in place of your default export; add ${JSON.stringify(JOURNEYS_MATCHER)} to config.matcher`];

/** The string literals of a matcher array literal, in order. */
function matcherEntries(literal: string): string[] | null {
  const entries: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(literal))) entries.push(m[1] ?? m[2] ?? "");
  const stripped = literal.replace(re, "").replace(/[\s,]/g, "");
  return stripped.length === 0 ? entries : null;
}

export function wrapProxySource(source: string): Wrapped {
  if (source.includes("withJourneys(")) return { ok: true, source, previous: null, reason: "already wrapped", manual: [] };
  let out = source;
  let previous: string | null = null;

  const named = /^export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/m.exec(out);
  if (named) {
    previous = named[2] ?? null;
    out = out.replace(named[0], `${named[1] ?? ""}function ${named[2]}(`);
  } else {
    const expression = /^export\s+default\s+(?!function\b|async\s+function\b|class\b)([^\n]+?);?\s*$/m.exec(out);
    if (!expression || !expression[1]) return { ok: false, source, previous: null, reason: "no default export the wrap understands (a named function or a one-line expression)", manual: manualLines() };
    const expr = expression[1].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
      previous = expr;
      out = out.replace(expression[0], "");
    } else {
      previous = PREVIOUS_NAME;
      out = out.replace(expression[0], `const ${PREVIOUS_NAME} = ${expr}`);
    }
  }

  const config = /export\s+const\s+config\s*=\s*\{([\s\S]*?)\}\s*;?\s*$/m.exec(out);
  if (config) {
    const matcher = /matcher\s*:\s*\[([\s\S]*?)\]/.exec(config[0]);
    if (!matcher) return { ok: false, source, previous: null, reason: "config has no matcher array literal", manual: manualLines() };
    const entries = matcherEntries(matcher[1] ?? "");
    if (entries === null) return { ok: false, source, previous: null, reason: "config.matcher is not an array of string literals", manual: manualLines() };
    if (!entries.includes(JOURNEYS_MATCHER)) entries.push(JOURNEYS_MATCHER);
    const rewritten = config[0].replace(matcher[0], `matcher: [${entries.map((e) => JSON.stringify(e)).join(", ")}]`);
    out = out.replace(config[0], rewritten);
  } else if (/export\s+const\s+config\b/.test(out)) {
    return { ok: false, source, previous: null, reason: "config is not an object literal", manual: manualLines() };
  }

  const lines = [IMPORT_LINE, "", out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, ""), "", `export default withJourneys({ next: ${previous} })`];
  if (!config) lines.push("", "export const config = {", `  matcher: [${JSON.stringify(JOURNEYS_MATCHER)}],`, "}");
  return { ok: true, source: `${lines.join("\n")}\n`, previous, reason: null, manual: [] };
}

/** The reverse of `wrapProxySource` for `uninstall`: the import and the appended export go, the previous export returns. */
export function unwrapProxySource(source: string, previous: string): string {
  let out = source.replace(`${IMPORT_LINE}\n\n`, "").replace(`${IMPORT_LINE}\n`, "");
  out = out.replace(new RegExp(`\\n*export default withJourneys\\(\\{ next: ${previous} \\}\\)\\n?`), "\n");
  const named = new RegExp(`^(async\\s+)?function ${previous}\\(`, "m");
  if (named.test(out)) out = out.replace(named, (m) => `export default ${m}`);
  else if (previous === PREVIOUS_NAME) out = out.replace(new RegExp(`^const ${PREVIOUS_NAME} = `, "m"), "export default ");
  else out = `${out.replace(/\n+$/, "")}\n\nexport default ${previous}\n`;
  return out.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}

export const INSTRUMENTATION_EXPORT = 'export { onRequestError } from "scope-journeys-next/instrumentation"';

export function instrumentationSource(): string {
  return `${INSTRUMENTATION_EXPORT}\n`;
}

/** Adds the export to an existing instrumentation file when it has no onRequestError; null when the person must call ours from theirs. */
export function addInstrumentationExport(source: string): { source: string; added: boolean; manual: string | null } {
  if (source.includes("scope-journeys-next/instrumentation")) return { source, added: false, manual: null };
  if (/onRequestError/.test(source)) return { source, added: false, manual: `your instrumentation.ts already exports onRequestError: import { onRequestError as journeysOnRequestError } from "scope-journeys-next/instrumentation" and call it from yours` };
  return { source: `${source.replace(/\n+$/, "")}\n\n${INSTRUMENTATION_EXPORT}\n`, added: true, manual: null };
}
