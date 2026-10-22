import { fill, type CompiledPolicy } from "./policy.js";

/** The hop-by-hop headers and the client's length end here (RFC 9110 section 7.6.1); the gate may have shortened the body. */
const HOP_BY_HOP = ["host", "connection", "keep-alive", "transfer-encoding", "te", "content-length"];

/** The origin's headers on a response rebuilt here: the length, encoding and framing describe the origin's bytes and its hop, not these. */
const REBUILT_DROPS = ["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"];

/**
 * What leaves for the origin: the client's headers, the Via a gateway
 * must add (RFC 9110 section 7.6.3), no accept-encoding (the hop is uncompressed: bodies are read
 * and rewritten here, the platform compresses the answer to the client), the hop-by-hop headers
 * and the client's content-length removed, the policy's forward headers with {host} filled.
 */
export function outboundHeaders(request: Request, policy: CompiledPolicy, name: string, host: string): Headers {
  const h = new Headers(request.headers);
  h.append("via", `1.1 ${name}`);
  h.delete("accept-encoding");
  for (const n of HOP_BY_HOP) h.delete(n);
  for (const [k, v] of Object.entries(policy.forward.headers)) h.set(k, fill(v, { host }));
  return h;
}

export function passHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const n of REBUILT_DROPS) out.delete(n);
  return out;
}

/** A host as a proxy names it in x-forwarded-host or a client in Host: a name or an address literal, with a port or without. Anything else is not a host. */
const HOST_SHAPE = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(:\d{1,5})?$/i;

/** Whether `value` is a host in that shape that the URL parser also takes (a port past 65535 or a label it refuses is not). */
export function isHost(value: string): boolean {
  return HOST_SHAPE.test(value) && URL.canParse(`http://${value}`);
}

/**
 * The URL the agent spoke to, as the proxy in front named it: the host from the first
 * x-forwarded-host entry, else the Host header, else the URL's own (a server builds that one from
 * its listen address: Next under `next start` says localhost:<port>); the scheme from the first
 * x-forwarded-proto entry when it is http or https, else the URL's. For an adapter behind a proxy
 * it trusts; an adapter at the edge keeps its URL, whose host is the zone's own.
 */
export function forwardedUrl(url: URL, headers: Headers): URL {
  const first = (name: string): string => (headers.get(name) ?? "").split(",")[0]?.trim() ?? "";
  const proto = first("x-forwarded-proto").toLowerCase();
  const scheme = proto === "https" || proto === "http" ? proto : url.protocol.slice(0, -1);
  for (const host of [first("x-forwarded-host"), headers.get("host")?.trim() ?? ""]) if (isHost(host)) return new URL(`${scheme}://${host}${url.pathname}${url.search}`);
  return new URL(`${scheme}://${url.host}${url.pathname}${url.search}`);
}
