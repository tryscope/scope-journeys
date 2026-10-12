import { PAGES, installParam, mdPath, originOf, pageBySlug, pageMarkdown } from "@/lib/pages";

export const dynamic = "force-dynamic";

// The markdown face: the page's source, the reader's install id filled in. Reached through
// `/<path>.md` or `Accept: text/markdown` (the proxy rewrites both here).
export async function GET(request: Request, context: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug = [] } = await context.params;
  const page = pageBySlug(slug.join("/"));
  const headers: Record<string, string> = { "content-type": "text/markdown; charset=utf-8", vary: "Accept", "cache-control": "public, max-age=60" };
  if (!page) {
    const origin = originOf(request);
    return new Response(`# Not found\n\nThe pages:\n\n${PAGES.map((p) => `- [${p.title}](${origin}${mdPath(p)}): ${p.description}`).join("\n")}\n`, { status: 404, headers });
  }
  const markdown = pageMarkdown(page, installParam(new URL(request.url)));
  if (markdown === null) return new Response(`# ${page.title}\n\nNot generated: run the docs build.\n`, { status: 503, headers });
  headers["x-markdown-tokens"] = String(Math.ceil(markdown.length / 4));
  return new Response(`${markdown}\n`, { headers });
}
