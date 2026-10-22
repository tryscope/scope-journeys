import type { Environment, IoCache } from "./io.js";
import { compilePolicy, defaultPolicy, isEnvironment, isRecord, PolicyError, type CompiledPolicy } from "./policy.js";
import { policyRefusals } from "./validate.js";

/**
 * The policy as every adapter runs it: fetched with If-None-Match over https, checked against the
 * schema before it is compiled, held 60 seconds per policy url, the document kept in the adapter's
 * cache so a new isolate or instance starts warm, the last good document kept on any failure, the
 * embedded forward-only default when nothing ever loaded. A fetch never takes more than 2 seconds
 * and never throws to the request path.
 */
export interface PolicyState {
  at: number;
  policy: CompiledPolicy;
  etag: string | null;
  environment: Environment | null;
  saltEpoch: number | null;
}

export const DEFAULT_API_URL = "https://api.tryscope.com";

const TTL_MS = 60_000;
const states = new Map<string, PolicyState>();
const refused = new Set<string>();

/** For the tests: forget every held policy and every refused url. */
export function resetPolicyCache(): void {
  states.clear();
  refused.clear();
}

/** `value` when it is https, or http to the loopback for a local run, with no credentials in it; otherwise null, said once per value. */
export function secureUrl(value: string, name: string, log: (line: string) => void): string | null {
  const url = URL.parse(value);
  if (url && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return value;
  if (!refused.has(value)) {
    refused.add(value);
    log(`journeys: ${name} must be https (http only to the loopback) with no credentials in it; ignoring ${url ? `${url.protocol}//${url.host}` : "a value that is not a url"}`);
  }
  return null;
}

function checked(document: unknown): CompiledPolicy {
  const refusals = policyRefusals(document);
  if (refusals.length) throw new PolicyError(refusals.map((f) => `${f.path} ${f.message}`).join("; "));
  return compilePolicy(document);
}

const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const epochOf = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);

/** The adapter's stored copy as a held state, or null when there is none, it is not in the stored shape, or its document is refused. */
async function stored(options: LoadOptions, url: string): Promise<PolicyState | null> {
  let entry: unknown;
  try {
    const text = await options.cache?.get(`policy:${url}`);
    entry = text ? JSON.parse(text) : null;
  } catch {
    // The cache is a convenience: one that cannot be read, or holds no JSON, is no stored copy.
    return null;
  }
  if (!isRecord(entry) || !nullableString(entry.etag) || !(entry.environment === null || isEnvironment(entry.environment)) || !epochOf(entry.saltEpoch)) return null;
  try {
    return { at: options.now, policy: checked(entry.document), etag: entry.etag, environment: entry.environment, saltEpoch: entry.saltEpoch };
  } catch (error) {
    options.log(`journeys: stored policy refused (${error instanceof Error ? error.message : String(error)}); fetching it again`);
    return null;
  }
}

export interface LoadOptions {
  url: string | null;
  /** The bearer the policy route accepts: the install key, or the Next form's OIDC token. */
  credential: string | null;
  fetch: typeof fetch;
  now: number;
  cache: IoCache | null;
  log: (line: string) => void;
}

// A policy answer without the environment or epoch header (an old API), or with a value this sensor
// does not take, keeps the last value seen; before any answer the adapter stamps epoch 1 and production.
export async function loadPolicy(options: LoadOptions): Promise<PolicyState> {
  // The policy route answers only an install or a session: without a credential there is nothing to fetch.
  const url = options.url === null || !options.credential ? null : secureUrl(options.url, "the policy url", options.log);
  const key = url ?? "default";
  const current = states.get(key);
  if (current && options.now - current.at < TTL_MS) return current;
  if (!url) {
    const fresh = current ?? { at: options.now, policy: compilePolicy(defaultPolicy), etag: null, environment: null, saltEpoch: null };
    states.set(key, { ...fresh, at: options.now });
    return fresh;
  }
  const headers: Record<string, string> = { authorization: `Bearer ${options.credential}` };
  if (current?.etag) headers["if-none-match"] = current.etag;
  try {
    const warm = current ? null : await stored(options, url);
    if (warm) {
      states.set(key, warm);
      return warm;
    }
    // A redirect is not followed: its target was never checked like the configured url.
    const response = await options.fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(2_000) });
    if (response.status === 304 && current) {
      const kept = { ...current, at: options.now };
      states.set(key, kept);
      return kept;
    }
    if (response.ok) {
      const document: unknown = await response.json();
      const policy = checked(document);
      for (const notice of policy.notices) options.log(`journeys: policy ${policy.version}: ${notice}`);
      const epoch = response.headers.get("x-journeys-salt-epoch");
      const environment = response.headers.get("x-journeys-environment");
      const next: PolicyState = { at: options.now, policy, etag: response.headers.get("etag"), environment: isEnvironment(environment) ? environment : (current?.environment ?? null), saltEpoch: epoch !== null && /^[1-9][0-9]*$/.test(epoch) && epochOf(Number(epoch)) ? Number(epoch) : (current?.saltEpoch ?? null) };
      states.set(key, next);
      const keep = { document, etag: next.etag, environment: next.environment, saltEpoch: next.saltEpoch };
      try {
        await options.cache?.put(`policy:${url}`, JSON.stringify(keep), TTL_MS / 1000);
      } catch {
        // The cache is a convenience; the held state is the copy that matters.
      }
      return next;
    }
    options.log(`journeys: policy fetch answered ${response.status}; keeping ${current ? "the last good policy" : "the embedded default"}`);
    // An unread body holds the connection open until the platform gives up on it; a cancel that fails changes nothing here.
    void response.body?.cancel().catch(() => undefined);
  } catch (error) {
    // A body that is not JSON throws a SyntaxError and a refused pattern a PolicyError: the document is refused.
    const what = error instanceof PolicyError || error instanceof SyntaxError ? `policy refused (${error.message})` : `policy fetch failed (${error instanceof Error ? error.message : String(error)})`;
    options.log(`journeys: ${what}; keeping ${current ? "the last good policy" : "the embedded default"}`);
  }
  const fallback: PolicyState = current ? { ...current, at: options.now } : { at: options.now, policy: compilePolicy(defaultPolicy), etag: null, environment: null, saltEpoch: null };
  states.set(key, fallback);
  return fallback;
}
