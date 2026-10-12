import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

// The OpenTelemetry schema files of the OTLP export (the schema_url every exported record and span carries), served at
// /schemas/<version> with the YAML media type from docs/schemas/<version>.yaml; the export relay
// stamps the same URL on every log record and span as its schema_url.
const VERSION = /^\d+\.\d+\.\d+$/;

export function GET(_request: Request, context: { params: Promise<{ version: string }> }): Promise<Response> {
  return context.params.then(({ version }) => {
    if (!VERSION.test(version)) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    const path = join(process.cwd(), "schemas", `${version}.yaml`);
    if (!existsSync(path)) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response(readFileSync(path, "utf8"), { headers: { "content-type": "application/yaml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  });
}
