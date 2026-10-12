import { withJourneys } from "scope-journeys-next";
import { NextResponse, type NextRequest } from "next/server";

import { acceptPrefersMarkdown } from "@/lib/negotiate";

// The faces of a page: `/<path>.md` and `Accept: text/markdown` are served by the markdown route,
// everything else by the HTML route. The sensor in front of this host observes the outer pass and
// hands the inner one here.
const NOT_CONTENT = /^\/(md|_next|llms\.txt|llms-full\.txt|SKILL\.md|favicon\.ico|robots\.txt|\.well-known)(\/|$)/;

function twins(request: NextRequest): Response {
  const url = request.nextUrl;
  const path = url.pathname;
  if (NOT_CONTENT.test(path)) return NextResponse.next();
  const dotMd = path.endsWith(".md");
  if (!dotMd && !acceptPrefersMarkdown(request.headers.get("accept") ?? "")) return NextResponse.next();
  const canonical = dotMd ? path.slice(0, -3) || "/" : path;
  const destination = url.clone();
  destination.pathname = canonical === "/" || canonical === "/index" ? "/md" : `/md${canonical}`;
  return NextResponse.rewrite(destination);
}

export default withJourneys({ next: twins });

// Next reads the matcher statically: the literal the adapter recommends, not its exported constant.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
