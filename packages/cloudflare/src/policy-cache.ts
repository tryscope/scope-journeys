import { compilePolicy, defaultPolicy, type CompiledPolicy, type IoCache } from "scope-journeys";

/**
 * The policy as the Worker runs it (architecture §7.2 step 1): fetched with If-None-Match, held
 * 60 seconds in the isolate, the document kept in the shared cache so a new isolate starts warm,
 * the last good document kept on any failure, the embedded forward-only default when nothing ever
 * loaded. A fetch never takes more than 2 seconds and never throws to the request path.
 */
export interface PolicyState {
  at: number;
  policy: CompiledPolicy;
  etag: string | null;
  environment: string | null;
  saltEpoch: number | null;
}

/** What the shared cache holds under `policy:<url>`: the document and the headers that rode with it. */
interface StoredPolicy {
  document: unknown;
  etag: string | null;
  environment: string | null;
  saltEpoch: number | null;
}

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;
let state: PolicyState | null = null;

export const compiledDefault = (): CompiledPolicy => compilePolicy(defaultPolicy);

/** For the tests: forget the isolate's copy. */
export function resetPolicyCache(): void {
  state = null;
}

export interface LoadOptions {
  url: string | null;
  credential: string | null;
  fetch: typeof fetch;
  now: number;
  cache: IoCache | null;
  log: (line: string) => void;
}

async function stored(cache: IoCache | null, url: string): Promise<StoredPolicy | null> {
  try {
    const text = await cache?.get(`policy:${url}`);
    return text ? (JSON.parse(text) as StoredPolicy) : null;
  } catch {
    return null;
  }
}

// A policy answer without the environment or epoch header (an old API) keeps the last value seen;
// before any answer the adapter stamps epoch 1 and production (plan J3.9).
export async function loadPolicy(options: LoadOptions): Promise<PolicyState> {
  const { url, now } = options;
  if (state && now - state.at < TTL_MS) return state;
  if (!url) return state ?? (state = { at: now, policy: compiledDefault(), etag: null, environment: null, saltEpoch: null });
  const headers: Record<string, string> = {};
  if (state?.etag) headers["if-none-match"] = state.etag;
  if (options.credential) headers.authorization = `Bearer ${options.credential}`;
  try {
    const warm = state ? null : await stored(options.cache, url);
    if (warm) {
      state = { at: now, policy: compilePolicy(warm.document), etag: warm.etag, environment: warm.environment, saltEpoch: warm.saltEpoch };
      return state;
    }
    const response = await options.fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status === 304 && state) {
      state = { ...state, at: now };
      return state;
    }
    if (response.ok) {
      const document: unknown = await response.json();
      const policy = compilePolicy(document);
      for (const notice of policy.notices) options.log(`journeys: policy ${policy.version}: ${notice}`);
      const next: PolicyState = { at: now, policy, etag: response.headers.get("etag"), environment: response.headers.get("x-journeys-environment") ?? state?.environment ?? null, saltEpoch: Number(response.headers.get("x-journeys-salt-epoch")) || state?.saltEpoch || null };
      state = next;
      const keep: StoredPolicy = { document, etag: next.etag, environment: next.environment, saltEpoch: next.saltEpoch };
      try {
        await options.cache?.put(`policy:${url}`, JSON.stringify(keep), TTL_MS / 1000);
      } catch {
        // The shared cache is a convenience; the isolate's copy is the one that matters.
      }
      return next;
    }
    options.log(`journeys: policy fetch answered ${response.status}; keeping ${state ? "the last good policy" : "the embedded default"}`);
  } catch (error) {
    options.log(`journeys: policy fetch failed (${error instanceof Error ? error.message : String(error)}); keeping ${state ? "the last good policy" : "the embedded default"}`);
  }
  if (state) {
    state = { ...state, at: now };
    return state;
  }
  state = { at: now, policy: compiledDefault(), etag: null, environment: null, saltEpoch: null };
  return state;
}
