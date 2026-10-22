import { createHash, randomBytes } from "node:crypto";

import type { Io, IoCache, SensorRecord } from "scope-journeys";

import { deliver } from "./deliver.js";
import { hop } from "./hop.js";

export interface NodeIoOptions {
  /** The salt every hash carries (`JOURNEYS_SALT`); an empty string runs the forward-only default elsewhere, the hash is still well defined. */
  salt: string;
  /** The host the request came for: a request for another host is a signer's key directory, fetched plainly. */
  host: string;
  /** Where the hop goes: the app's own listener (a mount) or the origin (the proxy). */
  target: URL;
  /** The Host header on the hop. */
  hopHost: string;
  /** Headers the hop adds beside the core's: the inner marker on a mount, the forwarded address. */
  hopHeaders: Record<string, string>;
  /** Appended to the client's own x-forwarded-for on the hop, so the app sees who called. */
  forwardedFor: string | null;
  key: string | null;
  apiUrl: string | null;
  cache: IoCache;
  fetch: typeof fetch;
  now: () => number;
  /** Runs the delivery once the response has gone out; the adapter binds the response's finish. */
  afterResponse: (work: () => void) => void;
  /** Collects a started delivery so a drain can wait for it. */
  track: (pending: Promise<void>) => void;
  log: Io["log"];
  hopTimeoutMs?: number;
}

/**
 * The one io the three mounts and the proxy share: the clock from Date,
 * entropy from node:crypto, sha256 with the install's salt, the hop over node:http with the
 * core's gateway headers, shipping after the response was written and never awaited in the
 * request path.
 */
export function createNodeIo(options: NodeIoOptions): Io {
  return {
    now: options.now,
    random: (bytes) => new Uint8Array(randomBytes(bytes)),
    hash: async (value) => createHash("sha256").update(`${options.salt}:${value}`).digest("hex").slice(0, 12),
    forward: async (outbound) => {
      // Another host (a signer's key directory): a plain fetch, two seconds, nothing of ours added.
      if (new URL(outbound.url).host !== options.host) return options.fetch(outbound.url, { method: outbound.method, headers: outbound.headers, redirect: "manual", signal: AbortSignal.timeout(2_000) });
      const headers = new Headers(outbound.headers);
      for (const [name, value] of Object.entries(options.hopHeaders)) headers.set(name, value);
      if (options.forwardedFor) headers.append("x-forwarded-for", options.forwardedFor);
      return hop(new Request(outbound.url, { method: outbound.method, headers, body: outbound.body, redirect: "manual", ...(outbound.body ? { duplex: "half" } : {}) } as RequestInit), { target: options.target, host: options.hopHost, timeoutMs: options.hopTimeoutMs ?? 30_000 });
    },
    cache: options.cache,
    ship: (records: readonly SensorRecord[]) => {
      options.afterResponse(() => {
        options.track(deliver(records, { apiUrl: options.apiUrl, key: options.key, fetch: options.fetch, log: (line) => options.log("warn", line) }).catch((error: unknown) => options.log("warn", `journeys: shipment failed (${error instanceof Error ? error.message : String(error)})`)));
      });
    },
    log: options.log,
  };
}
