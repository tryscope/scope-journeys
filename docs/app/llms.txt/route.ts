import { llmsTxt, originOf } from "@/lib/pages";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return new Response(`${llmsTxt(originOf(request))}\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } });
}
