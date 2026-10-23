import { familyOf, type Facts, type PlatformBot } from "scope-journeys";

/** The part of `request.cf` the sensor reads; the platform fills it on Cloudflare, nothing else does. */
export interface CfProperties {
  asn?: number;
  asOrganization?: string;
  country?: string;
  colo?: string;
  tlsVersion?: string;
  httpProtocol?: string;
  tlsClientExtensionsSha1?: string;
  tlsClientHelloLength?: number | string;
  botManagement?: { ja4?: string; verifiedBot?: boolean; verifiedBotCategory?: string; signedAgent?: string };
}

export type RequestWithCf = Request & { cf?: CfProperties };

export interface Identity {
  install: string | null;
  name: string;
  environment: Facts["environment"];
  saltEpoch: number;
  version: string;
  /** @deprecated Accepted and ignored until 0.3.0 (DEPRECATION.md): the shipper reports drops on the record that carries them. */
  dropped?: number;
  assertion?: Facts["assertion"];
}

/** What the platform knows about the client, from `request.cf` and `cf-connecting-ip`; nulls where the zone does not expose a fact. */
export function platformFacts(request: RequestWithCf, identity: Identity): Facts {
  const cf = request.cf ?? {};
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? null;
  const bot = cf.botManagement;
  const platformBot: PlatformBot | null = bot && (bot.verifiedBot !== undefined || bot.signedAgent !== undefined) ? { verified: Boolean(bot.verifiedBot), name: null, category: bot.verifiedBotCategory ?? null, signed_agent: bot.signedAgent ?? null } : null;
  const helloLen = cf.tlsClientHelloLength;
  return {
    address: address || null,
    family: familyOf(address || null),
    asn: typeof cf.asn === "number" ? cf.asn : null,
    as_org: cf.asOrganization ?? null,
    country: cf.country ?? null,
    colo: cf.colo ?? null,
    tls_protocol_version: cf.tlsVersion ?? null,
    network_protocol_version: cf.httpProtocol ?? null,
    ja4: bot?.ja4 ?? null,
    tls_ext_sha1: cf.tlsClientExtensionsSha1 ?? null,
    tls_hello_len: helloLen === undefined || helloLen === null ? null : Number(helloLen) || null,
    platform_request_id: request.headers.get("cf-ray"),
    platform_bot: platformBot,
    install: identity.install,
    source: "edge",
    observer: { package: "scope-journeys-cloudflare", version: identity.version, adapter: "cloudflare", name: identity.name },
    salt_epoch: identity.saltEpoch,
    environment: identity.environment,
    assertion: identity.assertion ?? null,
  };
}
