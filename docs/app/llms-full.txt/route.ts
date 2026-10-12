import { llmsFull, originOf } from "@/lib/pages";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return new Response(`${llmsFull(originOf(request))}\n`, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=60" } });
}
