// V2 on the Workers runtime: the same fixtures and harness, run inside workerd by Cloudflare's
// vitest plugin, with nodejs_compat OFF so the core is proven on the plain runtime. The reporter
// writes the per-fixture output the identity test diffs against the Node run.
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-10-01",
        compatibilityFlags: [],
      },
    }),
  ],
  test: {
    include: ["test/workerd/*.test.ts", "packages/cloudflare/test/*.test.ts"],
    root: new URL("../../", import.meta.url).pathname,
    testTimeout: 30000,
    reporters: ["default", "./test/workerd/reporter.mjs"],
  },
});
