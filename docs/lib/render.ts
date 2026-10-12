import { marked } from "marked";

import { GROUPS, PAGES, htmlPath, mdPath, type Page } from "./pages";

const CSS = `
:root { --ink: #16181d; --muted: #5d6470; --line: #e3e6eb; --accent: #1f6feb; --code-bg: #f4f6f8; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
header, main, footer { max-width: 860px; margin: 0 auto; padding: 16px; }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; border-bottom: 1px solid var(--line); }
header > a:first-child { font-weight: 700; color: var(--ink); text-decoration: none; margin-right: auto; }
a { color: var(--accent); }
footer { border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
pre { overflow-x: auto; padding: 12px; background: var(--code-bg); border-radius: 6px; }
code { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { padding: 6px 10px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); }
nav.pages { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 24px; margin: 8px 0 16px; }
nav.pages h2 { grid-column: 1 / -1; font-size: 14px; color: var(--muted); margin: 8px 0 0; text-transform: uppercase; letter-spacing: .04em; }
`;

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const markdownToHtml = (markdown: string): string => marked.parse(markdown, { async: false, gfm: true });

function nav(current: Page | null): string {
  const groups = GROUPS.map((group) => [`<h2>${group}</h2>`, ...PAGES.filter((p) => p.group === group).map((p) => (current && p.slug === current.slug ? `<span>${escape(p.title)}</span>` : `<a href="${htmlPath(p)}">${escape(p.title)}</a>`))].join(""));
  return `<nav class="pages">${groups.join("")}</nav>`;
}

export function htmlDocument(options: { page: Page | null; title: string; content: string; status?: number }): string {
  const { page, title, content } = options;
  const twin = page ? mdPath(page) : null;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(title)} | Scope Journeys</title>`,
    `<meta name="description" content="${escape(page?.description ?? "The docs for Scope Journeys.")}">`,
    twin ? `<link rel="alternate" type="text/markdown" href="${twin}">` : "",
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    "<header>",
    '<a href="/">Scope Journeys</a>',
    '<a href="/llms.txt">llms.txt</a>',
    '<a href="/SKILL.md">SKILL.md</a>',
    twin ? `<a href="${twin}">this page as markdown</a>` : "",
    "</header>",
    "<main>",
    `<article>${content}</article>`,
    nav(page),
    "</main>",
    "<footer>",
    "Every page is available as markdown: append <code>.md</code> to its URL or send <code>Accept: text/markdown</code>. The sensor documented here runs in front of this host.",
    "</footer>",
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}
