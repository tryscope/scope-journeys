import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import pages from "./pages.json";

export type Group = "Install" | "Verify" | "Reference" | "Policy";

export interface Page {
  /** The path without the leading slash; "" is the root. */
  slug: string;
  title: string;
  group: Group;
  description: string;
  /** `content/<file>`, or `content/generated/<file>` when the docs build derives it from the repository. */
  source: { kind: "content" | "generated"; file: string };
}

// One registry (`pages.json`) read here, by the docs build (`scripts/generate.mjs`) and by the smoke test.
export const PAGES: readonly Page[] = pages as Page[];

export const GROUPS: readonly Group[] = ["Install", "Verify", "Reference", "Policy"];

/** The value every snippet shows until `?install=jin_...` names the reader's own install. */
export const PLACEHOLDER = "jin_your_install_id";
const INSTALL_ID = /^jin_[A-Za-z0-9_-]{20,64}$/;

export const htmlPath = (page: Page): string => (page.slug === "" ? "/" : `/${page.slug}`);
export const mdPath = (page: Page): string => (page.slug === "" ? "/index.md" : `/${page.slug}.md`);

export function pageBySlug(slug: string): Page | null {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return PAGES.find((p) => p.slug === (clean === "index" ? "" : clean)) ?? null;
}

/** The install id from the page's URL when it has the shape of one; anything else leaves the placeholder. */
export function installParam(url: URL): string | null {
  const value = url.searchParams.get("install");
  return value && INSTALL_ID.test(value) ? value : null;
}

const CONTENT = join(process.cwd(), "content");

/** The page's markdown, the reader's own install id filled in; null when the docs build has not generated it. */
export function pageMarkdown(page: Page, install: string | null): string | null {
  const path = page.source.kind === "generated" ? join(CONTENT, "generated", page.source.file) : join(CONTENT, page.source.file);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8").replace(/\s+$/, "");
  return install ? text.replaceAll(PLACEHOLDER, install) : text;
}

/** The root map in the llms.txt convention: a title, one line of purpose, the pages grouped, each a link to its markdown twin. */
export function llmsTxt(origin: string): string {
  const lines = ["# Scope Journeys", "", "> A small observer in front of your documentation host and your API and MCP host that shows how coding agents find, install, sign in to and use your product. Install with one command, verify with one command, claim with one click.", ""];
  for (const group of GROUPS) {
    lines.push(`## ${group}`, "");
    for (const page of PAGES.filter((p) => p.group === group)) lines.push(`- [${page.title}](${origin}${mdPath(page)}): ${page.description}`);
    lines.push("");
  }
  lines.push("- [SKILL.md](" + origin + "/SKILL.md): the install recipe for a coding agent (`npx skills add " + origin + "`)", "", "Every page is available as markdown: append `.md` to its URL or send `Accept: text/markdown`.");
  return lines.join("\n");
}

/** Every page in one file, each preceded by a marker naming its path. */
export function llmsFull(origin: string): string {
  const parts: string[] = [];
  for (const page of PAGES) {
    const markdown = pageMarkdown(page, null);
    parts.push(`<!-- page: ${origin}${htmlPath(page)} (markdown: ${origin}${mdPath(page)}) -->`, markdown ?? `# ${page.title}\n\n(not generated)`, "");
  }
  return parts.join("\n");
}

/** The host the request was addressed to, as the platform reports it. */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
