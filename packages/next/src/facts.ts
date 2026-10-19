import { familyOf, type Facts } from "scope-journeys";

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
 * What Vercel's edge tells the function about the client: the address from
 * x-real-ip or the first x-forwarded-for, the AS number, the country and the JA4 digest from the
 * platform's headers; x-vercel-id as the platform's request id; the TLS facts null, which the
 * record allows.
 */
export function platformFacts(headers: Headers, identity: Identity): Facts {
  const address = headers.get("x-real-ip") ?? (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? null;
  const asn = headers.get("x-vercel-ip-as-number");
  return {
    address: address || null,
    family: familyOf(address || null),
    asn: asn ? Number(asn) || null : null,
    as_org: null,
    country: headers.get("x-vercel-ip-country"),
    colo: null,
    tls_protocol_version: null,
    network_protocol_version: null,
    ja4: headers.get("x-vercel-ja4-digest"),
    tls_ext_sha1: null,
    tls_hello_len: null,
    platform_request_id: headers.get("x-vercel-id"),
    platform_bot: null,
    install: identity.install,
    source: "inapp",
    observer: { package: "scope-journeys-next", version: identity.version, adapter: "next", name: identity.name },
    salt_epoch: identity.saltEpoch,
    environment: identity.environment,
    dropped: identity.dropped,
    assertion: identity.assertion ?? null,
  };
}
