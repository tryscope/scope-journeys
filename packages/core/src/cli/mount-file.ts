import type { NodeFramework } from "./project.js";

/**
 * The mount `init --node` writes into the app's entry file (plan J5.1 step 5). As conservative as
 * the Next wrap: it understands one line, the one that creates the app (`const app = express()`,
 * `const fastify = Fastify(...)`, `const app = new Hono()`), adds the mount on the line after it
 * and the import at the top, and refuses everything else so the person adds the two lines by hand
 * (exit 3). The shipped core carries no parser dependency.
 */
export const NODE_PACKAGE = "scope-journeys-node";

interface Mount {
  binding: string;
  line: (app: string) => string;
  creates: RegExp;
  described: string;
}

const MOUNTS: Record<NodeFramework, Mount> = {
  express: { binding: "journeys", line: (app) => `${app}.use(journeys())`, creates: /^([ \t]*)(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*express\(\)[ \t]*;?[ \t]*$/m, described: "const app = express()" },
  fastify: { binding: "fastifyJourneys", line: (app) => `${app}.register(fastifyJourneys)`, creates: /^([ \t]*)(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*[Ff]astify\([^\n]*\)[ \t]*;?[ \t]*$/m, described: "const fastify = Fastify()" },
  hono: { binding: "honoJourneys", line: (app) => `${app}.use(honoJourneys())`, creates: /^([ \t]*)(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*new[ \t]+Hono(?:<[^>\n]*>)?\([^\n]*\)[ \t]*;?[ \t]*$/m, described: "const app = new Hono()" },
};

export const importLine = (framework: NodeFramework, style: "esm" | "cjs", semicolon: string): string => {
  const { binding } = MOUNTS[framework];
  return style === "esm" ? `import { ${binding} } from "${NODE_PACKAGE}"${semicolon}` : `const { ${binding} } = require("${NODE_PACKAGE}")${semicolon}`;
};

/** The two lines to add by hand when the entry file is unknown or its shape is not understood. */
export function manualLines(framework: NodeFramework, style: "esm" | "cjs"): string[] {
  const mount = MOUNTS[framework];
  const place = framework === "express" ? "before every other app.use and route" : framework === "fastify" ? "before every route, awaited" : "before every route";
  return [`${importLine(framework, style, "")}  // at the top of the file that creates the app`, `${mount.line(framework === "fastify" ? "fastify" : "app")}  // right after ${mount.described}, ${place}`];
}

export interface Mounted {
  ok: boolean;
  source: string;
  reason: string | null;
  manual: string[];
}

/** The import after a shebang and a "use strict" directive, before everything else. */
function withImport(source: string, line: string): string {
  const lines = source.split("\n");
  let at = 0;
  if (lines[0]?.startsWith("#!")) at = 1;
  if (/^\s*["']use strict["'];?\s*$/.test(lines[at] ?? "")) at += 1;
  lines.splice(at, 0, line);
  return lines.join("\n");
}

export function mountSource(source: string, framework: NodeFramework, style: "esm" | "cjs"): Mounted {
  if (source.includes(NODE_PACKAGE)) return { ok: true, source, reason: "already mounted", manual: [] };
  const mount = MOUNTS[framework];
  const match = mount.creates.exec(source);
  const app = match?.[2];
  if (!match || !app) return { ok: false, source, reason: `no \`${mount.described}\` line the mount understands`, manual: manualLines(framework, style) };
  const semicolon = /;[ \t]*$/.test(match[0]) ? ";" : "";
  const inserted = source.replace(match[0], `${match[0]}\n${match[1] ?? ""}${mount.line(app)}${semicolon}`);
  return { ok: true, source: withImport(inserted, importLine(framework, style, semicolon)), reason: null, manual: [] };
}
