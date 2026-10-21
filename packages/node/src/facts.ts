import type { IncomingMessage } from "node:http";
import { isIP, isIPv4 } from "node:net";
import type { TLSSocket } from "node:tls";

import type { Facts } from "scope-journeys";

export interface Identity {
  install: string | null;
  name: string;
  environment: Facts["environment"];
  saltEpoch: number;
  dropped: number;
  version: string;
  assertion?: Facts["assertion"];
}

/** What a socket can say about the client: the address (the trusted forwarded one, else the peer's), the peer itself, the TLS version when this process terminates TLS, the HTTP version. */
export interface SocketFacts {
  address: string | null;
  /** The socket's own remote address: appended to x-forwarded-for on the hop, whatever the trusted address is. */
  peer: string | null;
  tls_protocol_version: string | null;
  network_protocol_version: string | null;
}

/** The first address of an x-forwarded-for header, or null when the header is absent or empty. */
export function forwardedAddress(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

/** A dual-stack listener reports an IPv4 client as `::ffff:a.b.c.d`; the record keeps the address the client has, so the hash matches the other forms' for the same client. */
export function canonicalAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] && isIPv4(mapped[1])) return mapped[1];
  return address;
}

export function socketFacts(req: IncomingMessage, trustProxy: boolean): SocketFacts {
  const socket = req.socket;
  const forwarded = trustProxy ? forwardedAddress(req.headers["x-forwarded-for"]) : null;
  const tls = socket && "encrypted" in socket && (socket as TLSSocket).encrypted ? (socket as TLSSocket).getProtocol() : null;
  const peer = canonicalAddress(socket?.remoteAddress ?? null);
  return {
    address: forwarded ? canonicalAddress(forwarded) : peer,
    peer,
    tls_protocol_version: tls ?? null,
    network_protocol_version: req.httpVersion ? `HTTP/${req.httpVersion}` : null,
  };
}

/**
 * The facts of the Node form: the socket's, the platform's request
 * id from `x-request-id` when a load balancer set one, and nulls for what only a CDN knows (the AS
 * number, the country, the colo, JA4, the TLS fingerprint). Joins lose nothing; the behaviour
 * columns lose the network kind.
 */
export function platformFacts(socket: SocketFacts, requestId: string | null, identity: Identity): Facts {
  const family = socket.address ? isIP(socket.address) : 0;
  return {
    address: socket.address,
    family: family === 4 ? "ipv4" : family === 6 ? "ipv6" : null,
    asn: null,
    as_org: null,
    country: null,
    colo: null,
    tls_protocol_version: socket.tls_protocol_version,
    network_protocol_version: socket.network_protocol_version,
    ja4: null,
    tls_ext_sha1: null,
    tls_hello_len: null,
    platform_request_id: requestId,
    platform_bot: null,
    install: identity.install,
    source: "node",
    observer: { package: "scope-journeys-node", version: identity.version, adapter: "node", name: identity.name },
    salt_epoch: identity.saltEpoch,
    environment: identity.environment,
    dropped: identity.dropped,
    assertion: identity.assertion ?? null,
  };
}
