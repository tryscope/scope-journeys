import type { ScopeDeclaration1 } from "./generated/declaration.js";
import type { ScopeRequest1 } from "./generated/request.js";

export type SensorRecord = ScopeRequest1 | ScopeDeclaration1;
export type LogLevel = "info" | "warn" | "error";

/**
 * The one cache contract (architecture §7.2): the policy document and the signers' key directories
 * live here. The Worker binds the Cache API with isolate memory in front; the Next form binds
 * module memory. A value is a string; an expired or absent key reads as null.
 */
export interface IoCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * Everything the core needs from the world, supplied by the adapter. The core performs no I/O of
 * its own: no fetch, no clock, no entropy, no shipping. The fixtures fix every member, which is
 * what makes a record reproducible to the byte on two runtimes.
 */
export interface Io {
  /** Epoch milliseconds. */
  now(): number;
  /** Entropy for references and record ids. */
  random(bytes: number): Uint8Array;
  /** sha256(salt + ":" + value) as twelve hexadecimal characters; the adapter binds the salt. */
  hash(value: string): Promise<string>;
  /**
   * The hop to the origin: the adapter owns the target, the fetch and its timeout. A request for
   * another host (a signer's key directory) is a plain fetch of that URL with a 2-second timeout.
   */
  forward(request: Request): Promise<Response>;
  cache: IoCache;
  /** Deliver after the response went out; the adapter binds waitUntil or after(). */
  ship(records: readonly SensorRecord[]): void;
  log(level: LogLevel, line: string): void;
}

export interface PlatformBot {
  verified: boolean;
  name: string | null;
  category: string | null;
  signed_agent: string | null;
}

export type Source = ScopeRequest1["source"];
export type Environment = "production" | "preview" | "development";

/** What the platform knows about the client, plus the adapter's own identity on the record. */
export interface Facts {
  address: string | null;
  family: "ipv4" | "ipv6" | null;
  asn: number | null;
  as_org: string | null;
  country: string | null;
  colo: string | null;
  tls_protocol_version: string | null;
  network_protocol_version: string | null;
  ja4: string | null;
  tls_ext_sha1: string | null;
  tls_hello_len: number | null;
  platform_request_id: string | null;
  platform_bot: PlatformBot | null;
  /** The install this sensor runs as; null on a sensor with no install id (a lab deployment). */
  install: string | null;
  source: Source;
  observer: { package: string; version: string; adapter: string; name: string };
  /** The customer's salt epoch the adapter hashes in. */
  salt_epoch: number;
  /** The install's environment, which decides where a live rule is live. */
  environment: Environment;
  /** Records the adapter failed to ship since its last successful shipment. */
  dropped: number;
  /** The install's own assertion signing key (`JOURNEYS_ASSERTION_KEY`), its `kid` and the issuer URL; null when none is configured. */
  assertion?: { kid: string; key: CryptoKey; issuer: string } | null;
}

/** The address family, from the address's shape; a dual-stack client is two addresses on two hosts. */
export function familyOf(address: string | null): "ipv4" | "ipv6" | null {
  if (!address) return null;
  return address.includes(":") ? "ipv6" : "ipv4";
}
