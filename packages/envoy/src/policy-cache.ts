import { compilePolicy, defaultPolicy, type CompiledPolicy, type IoCache } from "scope-journeys";

/**
 * The policy as the processor runs it: the compiled document in process memory per policy url,
 * the same ETag, 60-second and last-good rules as the Worker, a 2-second fetch, never a throw.
 */
export interface PolicyState {
  at: number;
  policy: CompiledPolicy;
  etag: string | null;
  environment: string | null;
  saltEpoch: number | null;
}

interface StoredPolicy {
  document: unknown;
  etag: string | null;
  environment: string | null;
  saltEpoch: number | null;
}

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;
const states = new Map<string, PolicyState>();

export const compiledDefault = (): CompiledPolicy => compilePolicy(defaultPolicy);

export function resetPolicyCache(): void {
  states.clear();
}

export interface LoadOptions {
  url: string | null;
  key: string | null;
  fetch: typeof fetch;
  now: number;
  cache?: IoCache | null;
  log: (line: string) => void;
}

async function stored(cache: IoCache | null | undefined, url: string): Promise<StoredPolicy | null> {
  try {
    const text = await cache?.get(`policy:${url}`);
    return text ? (JSON.parse(text) as StoredPolicy) : null;
  } catch {
    return null;
  }
}

// A policy answer without the environment or epoch header (an old API) keeps the last value seen;
// before any answer the adapter stamps epoch 1 and production.
export async function loadPolicy(options: LoadOptions): Promise<PolicyState> {
  const key = options.url ?? "default";
  const current = states.get(key);
  if (current && options.now - current.at < TTL_MS) return current;
  if (!options.url) {
    const fresh = current ?? { at: options.now, policy: compiledDefault(), etag: null, environment: null, saltEpoch: null };
    states.set(key, { ...fresh, at: options.now });
    return fresh;
  }
  const headers: Record<string, string> = {};
  if (current?.etag) headers["if-none-match"] = current.etag;
  if (options.key) headers.authorization = `Bearer ${options.key}`;
  try {
    const warm = current ? null : await stored(options.cache, options.url);
    if (warm) {
      const kept: PolicyState = { at: options.now, policy: compilePolicy(warm.document), etag: warm.etag, environment: warm.environment, saltEpoch: warm.saltEpoch };
      states.set(key, kept);
      return kept;
    }
    const response = await options.fetch(options.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status === 304 && current) {
      const kept = { ...current, at: options.now };
      states.set(key, kept);
      return kept;
    }
    if (response.ok) {
      const document: unknown = await response.json();
      const policy = compilePolicy(document);
      for (const notice of policy.notices) options.log(`journeys: policy ${policy.version}: ${notice}`);
      const next: PolicyState = { at: options.now, policy, etag: response.headers.get("etag"), environment: response.headers.get("x-journeys-environment") ?? current?.environment ?? null, saltEpoch: Number(response.headers.get("x-journeys-salt-epoch")) || current?.saltEpoch || null };
      states.set(key, next);
      const keep: StoredPolicy = { document, etag: next.etag, environment: next.environment, saltEpoch: next.saltEpoch };
      try {
        await options.cache?.put(`policy:${options.url}`, JSON.stringify(keep), TTL_MS / 1000);
      } catch {
        // The cache is a convenience; the state map is the copy that matters.
      }
      return next;
    }
    options.log(`journeys: policy fetch answered ${response.status}; keeping ${current ? "the last good policy" : "the embedded default"}`);
  } catch (error) {
    options.log(`journeys: policy fetch failed (${error instanceof Error ? error.message : String(error)}); keeping ${current ? "the last good policy" : "the embedded default"}`);
  }
  const fallback: PolicyState = current ? { ...current, at: options.now } : { at: options.now, policy: compiledDefault(), etag: null, environment: null, saltEpoch: null };
  states.set(key, fallback);
  return fallback;
}
