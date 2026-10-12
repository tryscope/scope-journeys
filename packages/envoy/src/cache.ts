import type { IoCache } from "scope-journeys";

const memory = new Map<string, { value: string; expires: number }>();

/** For the tests: forget the process's copy. */
export function resetCache(): void {
  memory.clear();
}

/** The processor's cache (architecture §7.2): process memory; one process, one copy of the policy and the signers' directories. */
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
