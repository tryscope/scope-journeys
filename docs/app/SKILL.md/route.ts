import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

// The install recipe for a coding agent, in the Agent Skills format, served at the root so
// `npx skills add https://<this host>` installs it. The docs build copies it from the package
// (`packages/core/SKILL.md`); the two are the same file.
export function GET(): Response {
  const path = join(process.cwd(), "content", "generated", "SKILL.md");
  if (!existsSync(path)) return new Response("Not generated: run the docs build.\n", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(readFileSync(path, "utf8"), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=60" } });
}
