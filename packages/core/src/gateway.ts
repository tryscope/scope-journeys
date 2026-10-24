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

/** Whether a Via header holds this sensor's own entry, the one `outboundHeaders` appends. */
export function namesSensor(via: string | null, name: string): boolean {
  const entry = `1.1 ${name}`;
  return (via ?? "").split(",").some((received) => received.trim() === entry);
}

export function passHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const n of REBUILT_DROPS) out.delete(n);
  return out;
}

/** An origin the hop may go to: an http or https URL with no credentials in it (fetch refuses those before sending, the Node hop drops them). Anything else is null. */
export function originUrl(value: string): URL | null {
  const url = URL.parse(value);
  return url && (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url : null;
}

/** The URL a hop to `origin` goes to: the request's path and query under the origin's own path. */
export function hopUrl(origin: URL, url: URL): URL {
  return new URL(`${origin.origin}${origin.pathname.replace(/\/$/, "")}${url.pathname}${url.search}`);
}

const UNSENT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * Whether a failed hop proves the origin never received the request: refused, a host that does not
 * resolve, or Node's fetch timing out the connect (node:http puts the code on the error, fetch on its
 * cause). Any other failure may have reached it.
 */
export function neverSent(error: unknown): boolean {
  return error instanceof Error && [error, error.cause].some((e) => e instanceof Error && "code" in e && typeof e.code === "string" && UNSENT.has(e.code));
}

/** A host as a proxy names it in x-forwarded-host or a client in Host: a name or an address literal, with a port or without. Anything else is not a host. */
const HOST_SHAPE = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(:\d{1,5})?$/i;

/** Whether `value` is a host in that shape that the URL parser also takes (a port past 65535 or a label it refuses is not). */
export function isHost(value: string): boolean {
  return HOST_SHAPE.test(value) && URL.canParse(`http://${value}`);
}

/** JOURNEYS_TRUST_PROXY: how many proxies of the customer's sit in front of the sensor, each appending to x-forwarded-for; null when unset or not a whole number from 1 to 99. */
export function trustedProxies(value: string | undefined): number | null {
  const count = value?.trim() ?? "";
  return /^[1-9][0-9]?$/.test(count) ? Number(count) : null;
}

/** The client's address in x-forwarded-for whose last `proxies` entries the customer's own proxies appended (the visitor writes any before them): that entry, or the first when the list is shorter; null for none. */
export function forwardedClient(header: string | null, proxies: number): string | null {
  const entries = (header ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return entries[Math.max(0, entries.length - proxies)] ?? null;
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
