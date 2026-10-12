// The fixture test hands each fixture's masked canonical output and its latency to the reporter
// through vitest's task meta (the Workers runtime has no filesystem); this is that field's type.
import "vitest";

declare module "vitest" {
  interface TaskMeta {
    workerd?: { name: string; out: string; p50: number; p95: number };
  }
}
