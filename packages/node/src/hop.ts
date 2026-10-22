import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { hopUrl, neverSent } from "scope-journeys";

const agents = { http: new HttpAgent({ keepAlive: true }), https: new HttpsAgent({ keepAlive: true }) };

/** The headers that describe a hop rather than a message (RFC 9110 section 7.6.1); a raw forward drops them so Node frames its own hop. */
export const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "host"];

export interface HopOptions {
  /** The server the hop connects to: scheme, host and port; a path on it prefixes the request's. */
  target: URL;
  /** The Host header the hop carries: the app's own on a mount, the origin's on the standalone proxy. */
  host: string;
  /** The longest the origin may stay silent before the hop is given up. */
  timeoutMs: number;
}

/** A Node message's headers as a Headers: set-cookie entries appended one by one, the rest as the parser joined them. */
export function headersOf(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (typeof value === "string") headers.set(name, value);
  }
  return headers;
}

/**
 * The hop to the origin over `node:http`: exactly the headers the core built, nothing of this
 * process's own (no accept-encoding, no user agent, so the hop is uncompressed and the origin sees
 * the client's agent string), the body sent with its length (the core buffered it already; an
 * origin that refuses a chunked request body still gets it), the answer's body streamed down as it
 * arrives, a redirect returned as received and never followed.
 */
export async function hop(outbound: Request, options: HopOptions): Promise<Response> {
  const body = outbound.body ? Buffer.from(await outbound.arrayBuffer()) : null;
  const target = hopUrl(options.target, new URL(outbound.url));
  const headers: Record<string, string> = {};
  outbound.headers.forEach((value, name) => {
    headers[name] = value;
  });
  headers.host = options.host;
  const secure = target.protocol === "https:";
  const send = (pooled: boolean): Promise<Response> =>
    new Promise((resolve, reject) => {
      let answered = false;
      const request = (secure ? httpsRequest : httpRequest)(target, { method: outbound.method, headers, agent: pooled ? (secure ? agents.https : agents.http) : false, timeout: options.timeoutMs }, (answer) => {
        answered = true;
        const status = answer.statusCode ?? 502;
        // A status without a body, and a HEAD's answer: Response refuses a body there and Node delivers none.
        if (status === 204 || status === 304 || outbound.method === "HEAD") {
          answer.resume();
          resolve(new Response(null, { status, headers: headersOf(answer) }));
          return;
        }
        resolve(new Response(Readable.toWeb(answer) as ReadableStream<Uint8Array>, { status, headers: headersOf(answer) }));
      });
      request.once("timeout", () => request.destroy(new DOMException(`the origin did not answer within ${options.timeoutMs} ms`, "TimeoutError")));
      request.once("error", (error: Error) => {
        // An idle kept-alive connection the origin closed: only an idempotent request goes again, once, on a fresh connection
        // (RFC 9110 section 9.2.2). A retry that never left reports the first error, which may have reached the origin.
        if (!answered && request.reusedSocket && "code" in error && error.code === "ECONNRESET" && ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(outbound.method)) send(false).then(resolve, (retryError: unknown) => reject(neverSent(retryError) ? error : retryError));
        else reject(error);
      });
      request.end(body);
    });
  return send(true);
}
