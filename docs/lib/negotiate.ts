/** The markdown face wins when the client lists text/markdown with a weight at least equal to text/html. */
export function acceptPrefersMarkdown(accept: string): boolean {
  let md = -1;
  let html = -1;
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? Number(qParam.trim().slice(2)) : 1;
    if (!Number.isFinite(q)) continue;
    if (type === "text/markdown") md = Math.max(md, q);
    if (type === "text/html") html = Math.max(html, q);
  }
  return md > 0 && md >= html;
}
