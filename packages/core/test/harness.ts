// The in-memory Io the fixture tests, the oracle and the adapters' tests share: a fixed clock, a
// seeded xorshift128 for entropy, the real sha256 with a fixture salt, an upstream answered from
// upstream.json (streams reconstructed frame by frame), shipping and logging collected. Web APIs
// only, so the workerd test imports it unchanged.
import type { Facts, Io, SensorRecord } from "../src/io.js";
import { familyOf } from "../src/io.js";
import { observe, type State } from "../src/observe.js";
import { observeResponse } from "../src/respond.js";
import { compilePolicy, type CompiledPolicy } from "../src/policy.js";
import { importAssertionKey } from "../src/assertion.js";

export interface FixtureRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  bodyEncoding?: "utf8" | "base64";
}

export interface FixtureUpstream {
  status: number;
  headers: Record<string, string>;
  body?: string | null;
  bodyEncoding?: "utf8" | "base64";
  /** Server-sent event frames, each emitted as one chunk with a 1 ms gap. */
  stream?: string[];
}

export interface FixtureFacts {
  address: string | null;
  family?: "ipv4" | "ipv6" | null;
  asn: number | null;
  as_org: string | null;
  country: string | null;
  colo: string | null;
  tls: { protocol_version: string | null; network_protocol_version: string | null; ja4: string | null; tls_ext_sha1: string | null; tls_hello_len: number | null };
  platform_request_id: string | null;
  platform_bot?: Facts["platform_bot"];
  environment?: Facts["environment"];
  ts?: string;
  /** The salt the adapter hashes with and the epoch it stamps (plan J3.9); the fixture salt and epoch 1 otherwise. */
  salt?: string;
  salt_epoch?: number;
  /** The install's assertion key (plan J3.4): the private JWK with its kid, and the issuer URL. */
  assertion?: { kid: string; issuer: string; private_jwk: JsonWebKey & { kid?: string } };
}

/** A signer's key directory the fixture's world serves (`directory.json`): the URL, the answer, or no answer at all. */
export interface FixtureDirectory {
  url: string;
  status?: number;
  body?: unknown;
  unreachable?: boolean;
}

export interface Fixture {
  name: string;
  request: FixtureRequest;
  upstream: FixtureUpstream;
  policy: unknown;
  facts: FixtureFacts;
  directory?: FixtureDirectory;
}

export interface Forwarded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface HarnessIo extends Io {
  shipped: SensorRecord[][];
  logs: string[];
  forwarded: Forwarded[];
}

export const FIXTURE_SALT = "fixture-salt";
export const FIXTURE_TS = "2026-10-10T12:00:00.000Z";

export function xorshift(seed: number): () => number {
  let x = 123456789 ^ seed;
  let y = 362436069;
  let z = 521288629;
  let w = 88675123 ^ (seed * 2654435761) >>> 0;
  return () => {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w;
  };
}

export const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};
export const bytesToBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

export async function sha12(salt: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${value}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

function upstreamResponse(upstream: FixtureUpstream, streamGapMs: number): Response {
  if (upstream.stream) {
    const frames = upstream.stream;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
          if (streamGapMs > 0) await new Promise((resolve) => setTimeout(resolve, streamGapMs));
        }
        controller.close();
      },
    });
    return new Response(body, { status: upstream.status, headers: upstream.headers });
  }
  const body = upstream.body === null || upstream.body === undefined ? null : upstream.bodyEncoding === "base64" ? base64ToBytes(upstream.body) : upstream.body;
  return new Response(body, { status: upstream.status, headers: upstream.headers });
}

/** The harness Io: fixed clock and seed, the real hash, the fixture's upstream. */
export function makeIo(options: { now?: number; seed?: number; salt?: string; upstream: FixtureUpstream; directory?: FixtureDirectory; forwardKey?: string | null; keyHeader?: string | null; streamGapMs?: number }): HarnessIo {
  const next = xorshift(options.seed ?? 1);
  const now = options.now ?? Date.parse(FIXTURE_TS);
  const salt = options.salt ?? FIXTURE_SALT;
  let tick = 0;
  // The cache on the fixture clock: a fresh one per run, so every run fetches the directory once.
  const cached = new Map<string, { value: string; expires: number }>();
  const io: HarnessIo = {
    shipped: [],
    logs: [],
    forwarded: [],
    now: () => now + tick++,
    random: (bytes) => {
      const out = new Uint8Array(bytes);
      for (let i = 0; i < bytes; i += 1) out[i] = next() & 255;
      return out;
    },
    hash: (value) => sha12(salt, value),
    forward: async (request) => {
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => (headers[k] = v));
      // A signer's directory is the one request for another host; the fixture's world answers it or not.
      if (options.directory && request.url === options.directory.url) {
        io.forwarded.push({ method: request.method, url: request.url, headers, body: null });
        if (options.directory.unreachable) throw new TypeError("fetch failed");
        return Response.json(options.directory.body ?? null, { status: options.directory.status ?? 200 });
      }
      if (options.keyHeader && options.forwardKey) headers[options.keyHeader] = options.forwardKey;
      const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
      const url = new URL(request.url);
      io.forwarded.push({ method: request.method, url: `${url.pathname}${url.search}`, headers, body });
      return upstreamResponse(options.upstream, options.streamGapMs ?? 1);
    },
    cache: {
      get: async (key) => {
        const entry = cached.get(key);
        return entry && entry.expires > now + tick ? entry.value : null;
      },
      put: async (key, value, ttlSeconds) => {
        cached.set(key, { value, expires: now + tick + ttlSeconds * 1000 });
      },
    },
    ship: (records) => {
      io.shipped.push([...records]);
    },
    log: (level, line) => {
      io.logs.push(`${level}: ${line}`);
    },
  };
  return io;
}

export function factsOf(fixture: FixtureFacts, identity?: Partial<Facts>): Facts {
  return {
    address: fixture.address,
    family: fixture.family ?? familyOf(fixture.address),
    asn: fixture.asn,
    as_org: fixture.as_org,
    country: fixture.country,
    colo: fixture.colo,
    tls_protocol_version: fixture.tls.protocol_version,
    network_protocol_version: fixture.tls.network_protocol_version,
    ja4: fixture.tls.ja4,
    tls_ext_sha1: fixture.tls.tls_ext_sha1,
    tls_hello_len: fixture.tls.tls_hello_len,
    platform_request_id: fixture.platform_request_id,
    platform_bot: fixture.platform_bot ?? null,
    install: "jin_fixture0000000000000000",
    source: "edge",
    observer: { package: "scope-journeys", version: "0.0.0-fixture", adapter: "fixture", name: "fixture-sensor" },
    salt_epoch: fixture.salt_epoch ?? 1,
    environment: fixture.environment ?? "production",
    dropped: 0,
    ...identity,
  };
}

export function buildRequest(fixture: FixtureRequest): Request {
  const body = fixture.body === null ? null : fixture.bodyEncoding === "base64" ? base64ToBytes(fixture.body) : fixture.body;
  return new Request(fixture.url, { method: fixture.method, headers: fixture.headers, body, redirect: "manual" });
}

export interface RunResult {
  response: { status: number; headers: Record<string, string>; body: string };
  records: SensorRecord[];
  forwarded: Forwarded[];
  logs: string[];
  /** Milliseconds spent in observe and observeResponse, the forward's own time excluded. */
  latencyMs: number;
  state: State;
}

/** A body as text, or `base64:` plus the bytes when it is not UTF-8 (a binary pass-through). */
export async function readText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return `base64:${bytesToBase64(bytes)}`;
  }
}

/** One fixture through the core: observe, forward when asked, observeResponse, the body drained, the records awaited. */
export async function runFixture(fixture: Fixture, io: HarnessIo, policy?: CompiledPolicy): Promise<RunResult> {
  const compiled = policy ?? compilePolicy(fixture.policy);
  const facts = factsOf(fixture.facts);
  if (fixture.facts.assertion) {
    const { kid: _kid, ...jwk } = fixture.facts.assertion.private_jwk;
    facts.assertion = { kid: fixture.facts.assertion.kid, issuer: fixture.facts.assertion.issuer, key: await importAssertionKey(jwk) };
  }
  const request = buildRequest(fixture.request);
  const t0 = performance.now();
  const observed = await observe(request, compiled, facts, io);
  let response: Response;
  let records: Promise<SensorRecord[]>;
  let state: State;
  if (observed.kind === "answer") {
    response = observed.response;
    records = observed.records;
    state = observed.state;
  } else {
    const t1 = performance.now();
    const upstream = await io.forward(observed.request);
    const t2 = performance.now();
    const responded = observeResponse(upstream, observed.state);
    response = responded.response;
    records = responded.records;
    state = observed.state;
    const body = await readText(response);
    const got = await records;
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    return { response: { status: response.status, headers, body }, records: got, forwarded: io.forwarded, logs: io.logs, latencyMs: performance.now() - t0 - (t2 - t1), state };
  }
  const body = await readText(response);
  const got = await records;
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  return { response: { status: response.status, headers, body }, records: got, forwarded: io.forwarded, logs: io.logs, latencyMs: performance.now() - t0, state };
}
