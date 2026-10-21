import { isIP } from "node:net";

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

/**
 * The facts of the ext_proc form: the client's address from
 * `x-envoy-external-address` when the listener sets it, else the first `x-forwarded-for`; the
 * request id Envoy sets; nulls for what only a CDN knows and for the TLS and HTTP versions, which
 * the stream does not carry.
 */
export function platformFacts(headers: Headers, identity: Identity): Facts {
  const external = headers.get("x-envoy-external-address");
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = external || forwarded || null;
  const family = address ? isIP(address) : 0;
  return {
    address,
    family: family === 4 ? "ipv4" : family === 6 ? "ipv6" : null,
    asn: null,
    as_org: null,
    country: null,
    colo: null,
    tls_protocol_version: null,
    network_protocol_version: null,
    ja4: null,
    tls_ext_sha1: null,
    tls_hello_len: null,
    platform_request_id: headers.get("x-request-id"),
    platform_bot: null,
    install: identity.install,
    source: "ext_proc",
    observer: { package: "scope-journeys-envoy", version: identity.version, adapter: "envoy", name: identity.name },
    salt_epoch: identity.saltEpoch,
    environment: identity.environment,
    dropped: identity.dropped,
    assertion: identity.assertion ?? null,
  };
}
