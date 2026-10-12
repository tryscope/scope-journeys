import type { IoCache } from "scope-journeys";

const memory = new Map<string, { value: string; expires: number }>();
const MEMORY_TTL_MS = 60_000;
const cacheUrl = (key: string): string => `https://journeys.invalid/cache/${encodeURIComponent(key)}`;

/** For the tests: forget the isolate's copy. */
export function resetCache(): void {
  memory.clear();
}

/**
 * The Worker's cache (architecture §7.2): the Cache API, shared by every isolate on the colo and
 * expiring entries itself by `max-age`, with isolate memory in front of it for a minute. A Cache
 * API failure is a miss, never an exception.
 */
export function workerCache(cache: Cache | null, now: () => number): IoCache {
  return {
    async get(key) {
      const held = memory.get(key);
      if (held && held.expires > now()) return held.value;
      if (held) memory.delete(key);
      if (!cache) return null;
      try {
        const stored = await cache.match(cacheUrl(key));
        if (!stored) return null;
        const value = await stored.text();
        memory.set(key, { value, expires: now() + MEMORY_TTL_MS });
        return value;
      } catch {
        return null;
      }
    },
    async put(key, value, ttlSeconds) {
      memory.set(key, { value, expires: now() + Math.min(ttlSeconds * 1000, MEMORY_TTL_MS) });
      if (!cache) return;
      try {
        await cache.put(cacheUrl(key), new Response(value, { headers: { "content-type": "text/plain", "cache-control": `max-age=${ttlSeconds}` } }));
      } catch {
        // The Cache API is a convenience; the isolate's copy is the one that matters.
      }
    },
  };
}
