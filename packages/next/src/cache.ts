import type { IoCache } from "scope-journeys";

const memory = new Map<string, { value: string; expires: number }>();

/** For the tests: forget the instance's copy. */
export function resetCache(): void {
  memory.clear();
}

/** The Next form's cache (architecture §7.2): module memory per instance, which Fluid Compute keeps warm. */
export function memoryCache(now: () => number): IoCache {
  return {
    async get(key) {
      const held = memory.get(key);
      if (held && held.expires > now()) return held.value;
      if (held) memory.delete(key);
      return null;
    },
    async put(key, value, ttlSeconds) {
      memory.set(key, { value, expires: now() + ttlSeconds * 1000 });
    },
  };
}
