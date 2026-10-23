// Run by adapter.test.ts in its own process: an Express app with journeys() serves three requests
// and closes, and the process ends on its own; what it shipped before ending is printed at exit.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import express from "express";
import { trustPolicyKeyForTests } from "scope-journeys";

import { signedPolicy, TEST_POLICY_KID, testPolicyKeys } from "../../core/test/signed.js";
import { stored } from "../../core/test/ingest.js";
import { journeys } from "../src/index.js";

const POLICY = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
const INSTALL = "jin_test0000000000000000000000";
trustPolicyKeyForTests(TEST_POLICY_KID, (await testPolicyKeys()).publicKey);

let shipped = 0;
process.on("exit", () => process.stdout.write(String(shipped)));
const ingest = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).endsWith("/policy")) return signedPolicy(POLICY, { install: INSTALL, issuedAt: Math.floor(Date.now() / 1000), saltEpoch: "2", etag: '"3"' });
  const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  shipped += (JSON.parse(text) as Array<{ schema: string }>).filter((r) => r.schema === "scope.request/1").length;
  return stored(0);
}) as typeof fetch;

const app = express();
app.use(journeys({ env: { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "fixture-salt", JOURNEYS_API_URL: "https://api.test.invalid" }, fetch: ingest, log: () => undefined }));
app.get("/docs/:page", (_req, res) => {
  res.type("html").send("<!doctype html><html><body><h1>Guide</h1></body></html>");
});
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
for (const page of ["one", "two", "three"]) await (await fetch(`http://127.0.0.1:${port}/docs/${page}`, { headers: { "user-agent": "Claude-User (claude-code/2.1.0)", accept: "text/html" } })).text();
server.closeAllConnections();
server.close();
