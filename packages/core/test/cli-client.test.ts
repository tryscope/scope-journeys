// J2.1: the CLI's API client is typed against the vendored Journeys subset of the contract's
// OpenAPI document: every operation it performs exists there, the document carries the contract
// version the client pins, and an error envelope with Retry-After maps to an ApiError.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { ApiError, CLIENT_OPERATIONS, CONTRACT_VERSION_VENDORED, createClient, UnreachableError } from "../src/cli/client.js";

const document = JSON.parse(readFileSync(join(new URL("../src/cli/openapi.journeys.json", import.meta.url).pathname), "utf8")) as { info: { version: string; "x-journeys-vendored-from": { contract_version: string } }; paths: Record<string, Record<string, unknown>> };

test("openapi.journeys.json holds every operation the client performs, and only Journeys paths", () => {
  for (const op of CLIENT_OPERATIONS) assert.ok(document.paths[op.path]?.[op.method], `${op.method.toUpperCase()} ${op.path} is not in the vendored document`);
  for (const path of Object.keys(document.paths)) assert.match(path, /^\/v1\/(requests|installs|policies|journeys|visits|intents)(\/|$)/);
  assert.equal(document.info["x-journeys-vendored-from"].contract_version, CONTRACT_VERSION_VENDORED);
  assert.equal(document.info.version, CONTRACT_VERSION_VENDORED);
});

let server: Server;
let base = "";
before(async () => {
  server = createServer((req, res) => {
    if (req.url?.endsWith("/probes/nonce1")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ found: false, request_id: null, ts: null, facts: {}, missing: [{ fact: "probe", fix: "x" }] }));
      return;
    }
    res.writeHead(429, { "content-type": "application/json", "retry-after": "120" });
    res.end(JSON.stringify({ error: { code: "quota_exceeded", message: "too many" }, request_id: "req_x" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => server.close());

test("an error envelope becomes an ApiError with the code, the request id and Retry-After; a probe parses", async () => {
  const client = createClient({ baseUrl: base, credential: "sjk_test_cccccccccccccccccccccccccccccccc" });
  await assert.rejects(client.createInstall({ form: "next", hosts: ["a.example"], environment: "production" }, "key-1"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "quota_exceeded");
    assert.equal(error.requestId, "req_x");
    assert.equal(error.retryAfterSeconds, 120);
    return true;
  });
  const probe = await client.probe("jin_x", "nonce1");
  assert.equal(probe.found, false);
  assert.equal(probe.missing[0]?.fact, "probe");
  const dead = createClient({ baseUrl: "http://127.0.0.1:1", timeoutMs: 500 });
  await assert.rejects(dead.getInstall("jin_x"), (error: unknown) => error instanceof UnreachableError);
});
