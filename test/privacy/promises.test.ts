// The privacy promises of SECURITY.md, one test each, run through the core as an adapter runs it:
// secret URL values hashed under any policy, bodies kept by allowlist only, no event-stream content,
// the MCP session id and the setup header hashed, the built-in default named on its records, and
// no shipping claim the code does not keep. The missing-salt promise is each adapter's own test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { compilePolicy, defaultPolicy } from "../../packages/core/src/policy.js";
import { policyRefusals } from "../../packages/core/src/validate.js";
import type { ScopeDeclaration1 } from "../../packages/core/src/generated/declaration.js";
import type { ScopeRequest1 } from "../../packages/core/src/generated/request.js";
import { FIXTURE_SALT, makeIo, runFixture, sha12, type FixtureFacts, type FixtureRequest, type FixtureUpstream } from "../../packages/core/test/harness.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const facts: FixtureFacts = { address: "203.0.113.9", asn: 64512, as_org: "Example", country: "NL", colo: "AMS", tls: { protocol_version: "TLSv1.3", network_protocol_version: "HTTP/2", ja4: null, tls_ext_sha1: null, tls_hello_len: null }, platform_request_id: "promises" };
const hash = (value: string): Promise<string> => sha12(FIXTURE_SALT, value);
const REFERENCE = "5Z4KJ7N9";
const answerHeaders = (record: ScopeRequest1): Record<string, unknown> => (record["scope.response.headers"] ?? {}) as Record<string, unknown>;

async function run(policy: unknown, request: FixtureRequest, upstream: FixtureUpstream, compiled = compilePolicy(policy)) {
  const result = await runFixture({ name: "promises", request, upstream, policy, facts }, makeIo({ upstream }), compiled);
  const record = result.records.find((r) => r.schema === "scope.request/1") as ScopeRequest1;
  const declarations = result.records.filter((r) => r.schema === "scope.declaration/1") as ScopeDeclaration1[];
  return { ...result, record, declarations, serialised: JSON.stringify(result.records) };
}

test("secret URL values are hashed under any policy, the built-in default included; the probe nonce, references and other parameters stay readable", async () => {
  const query = `code=SECRETCODE123&state=xyz&api_key=sk_live_ABC&ref=${REFERENCE}&journeys_probe=c2NvcGU&Token=TOK1`;
  const { record, serialised } = await run(defaultPolicy, { method: "GET", url: `https://api.acme.example/oauth/callback?${query}`, headers: { "user-agent": "curl/8.7.1" }, body: null }, { status: 302, headers: { location: "https://app.acme.example/done?token=TOK999#access_token=AT1&scope=read" } });
  assert.equal(record["url.query"], `code=h:${await hash("SECRETCODE123")}&state=xyz&api_key=h:${await hash("sk_live_ABC")}&ref=${REFERENCE}&journeys_probe=c2NvcGU&Token=h:${await hash("TOK1")}`);
  assert.equal(answerHeaders(record).location, `https://app.acme.example/done?token=h:${await hash("TOK999")}#access_token=h:${await hash("AT1")}&scope=read`);
  for (const secret of ["SECRETCODE123", "sk_live_ABC", "TOK1", "TOK999", "AT1"]) assert.ok(!serialised.includes(secret), `${secret} left raw`);
  const nested = "https%3A%2F%2Fa.example%2F%3Ftoken%3DSEC5";
  const spelled = await run(defaultPolicy, { method: "GET", url: `https://acme.example/cb?apiKey=AK1&access-token=AT2&api%5Fkey=SEC1&%74oken=SEC2&password=%26SEC3&next=https://a.example/back?code=SEC4&return_to=${nested}&monkey=banana`, headers: {}, body: null }, { status: 204, headers: {} });
  assert.equal(spelled.record["url.query"], `apiKey=h:${await hash("AK1")}&access-token=h:${await hash("AT2")}&api%5Fkey=h:${await hash("SEC1")}&%74oken=h:${await hash("SEC2")}&password=h:${await hash("%26SEC3")}&next=https://a.example/back?code=h:${await hash("SEC4")}&return_to=https%3A%2F%2Fa.example%2F%3Ftoken%3Dh:${await hash("SEC5")}&monkey=banana`, "any case and spelling, an encoded name or value, a URL inside a parameter, encoded or not");
  for (const secret of ["SEC2", "SEC3", "SEC5"]) assert.ok(!spelled.serialised.includes(secret), `${secret} left raw`);
  for (const query of ["params=token%3DDEEP6%26foo%3Dbar", "x=%74oken%3DDEEP7", "error_description=invalid%20request%20token=DEEP8&state=s", "x=hello%0Atoken%3DDEEP9", "next=https%3A%2F%2Fa%2F%3Fq%3Dx%20token%3DDEEP0", "next=https://a.example/b?r=https://c.example/?token=DEEP1", "next=https://a.example/b?r=https%3A%2F%2Fc%2F%3Ftoken%3DDEEP2", "return_to=https%3A%2F%2Fa%2F%3Fnext%3Dhttps%3A%2F%2Fb%2F%3Ftoken%3DDEEP3", "r=https%3A%2F%2Fa%2F%3Fname%3Dcaf%E9%26token%3DDEEP4", "a=b?c=d?token=DEEP5"]) {
    const deep = await run(defaultPolicy, { method: "GET", url: `https://acme.example/cb?${query}`, headers: {}, body: null }, { status: 302, headers: { location: `https://app.example/p=1?${query}` } });
    assert.ok(!/DEEP\d/.test(deep.serialised), `a secret nested in ${query} left raw`);
  }
  const page = (policy: unknown) => run(policy, { method: "GET", url: `https://acme.example/device?code=${REFERENCE}`, headers: {}, body: null }, { status: 200, headers: { "content-type": "text/html" }, body: "<p>ok</p>" });
  assert.equal((await page(defaultPolicy)).record["url.query"], `code=h:${await hash(REFERENCE)}`, "a code shaped like a reference is hashed where no reference is said to travel");
  assert.equal((await page({ ...defaultPolicy, headers: { ...defaultPolicy.headers, reference: ["ref", "code"] } })).record["url.query"], `code=${REFERENCE}`, "a valid reference code in a reference parameter stays readable");
});

const BODIES = { schema: "scope.policy/1", version: 7, surfaces: { signup: { path: "^/signup$", fields: { reference: ["token"] } }, device: { start: "^/device/code$" }, api: { paths: ["^/v1/"] } }, record_bodies: true, observe: { bodies: { allow_fields: ["email", "password", "token", "secret", "uri", "code", "link", "note", "error"] } }, secrets: { uri_fields: { uri: "code" } } };

test("a string holding more than 64 secret values is recorded as one hash, so the work per string stays bounded", async () => {
  const flood = Array.from({ length: 65 }, (_, i) => `token=T${i}`).join("&");
  const { record } = await run(defaultPolicy, { method: "GET", url: `https://acme.example/cb?${flood}`, headers: {}, body: null }, { status: 204, headers: {} });
  assert.equal(record["url.query"], `h:${await hash(flood)}`);
  const sixtyFour = Array.from({ length: 64 }, (_, i) => `token=T${i}`).join("&");
  const kept = await run(defaultPolicy, { method: "GET", url: `https://acme.example/cb?${sixtyFour}`, headers: {}, body: null }, { status: 204, headers: {} });
  assert.equal(kept.record["url.query"], (await Promise.all(Array.from({ length: 64 }, async (_, i) => `token=h:${await hash(`T${i}`)}`))).join("&"));
});

test("bodies keep only the fields the allowlist names, at any depth; a secret name inside them is still hashed; the keys are still read", async () => {
  const signup = await run(BODIES, { method: "POST", url: "https://api.acme.example/signup", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.example", password: "hunter2", client_secret: "cs_123", profile: { name: "Ada", token: REFERENCE }, card: { number: "4242" }, secret: { value: "nested-s3cret", hints: ["h1"] }, uri: "https://acme.example/device?code=ABCD-EFGH", code: 482913 }) }, { status: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: "newkey_456", error: { message: "email taken", code: "email_taken" } }) });
  assert.deepEqual(signup.record["scope.body.request"], { email: "a@b.example", password: `h:${await hash("hunter2")}`, profile: { token: REFERENCE }, secret: `h:${await hash(JSON.stringify({ value: "nested-s3cret", hints: ["h1"] }))}`, uri: `https://acme.example/device?code=h:${await hash("ABCD-EFGH")}`, code: `h:${await hash("482913")}` }, "a secret name's whole value is hashed once, a number too, a uri field's code once");
  assert.deepEqual(signup.record["scope.body.response"], { error: { message: "email taken", code: "email_taken" } }, "a code in an answer is an error code and stays readable");
  for (const secret of ["hunter2", "cs_123", "newkey_456", "4242", "Ada", "nested-s3cret", "482913"]) assert.ok(!signup.serialised.includes(secret), `${secret} left`);
  const encoded = "https%3A%2F%2Fa.example%2F%3Ftoken%3DABC123";
  const blobs = await run(BODIES, { method: "POST", url: "https://api.acme.example/signup", headers: { "content-type": "application/json" }, body: JSON.stringify({ link: encoded, note: `see ${encoded} and %74oken%3DXYZ789 later` }) }, { status: 200, headers: { "content-type": "application/json" }, body: "{}" });
  const hidden = `https%3A%2F%2Fa.example%2F%3Ftoken%3Dh:${await hash("ABC123")}`;
  assert.deepEqual(blobs.record["scope.body.request"], { link: hidden, note: `see ${hidden} and %74oken%3Dh:${await hash("XYZ789")} later` }, "a URL or pair sent wholly encoded has its secret hashed where it sits");
  assert.ok(!blobs.serialised.includes("ABC123") && !blobs.serialised.includes("XYZ789"));
  const camel = await run(BODIES, { method: "POST", url: "https://api.acme.example/signup", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.example", profile: { token: "not-a-reference" } }) }, { status: 200, headers: { "content-type": "application/json" }, body: "{}" });
  assert.deepEqual(camel.record["scope.body.request"], { email: "a@b.example", profile: { token: `h:${await hash("not-a-reference")}` } }, "a value that is no reference is hashed in a reference field too");

  const device = await run(BODIES, { method: "POST", url: "https://api.acme.example/device/code", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "client_id=cli" }, { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ device_code: "DC-1", user_code: "WDJB-MJHT" }) });
  assert.equal(device.record["scope.body.response"], null, "nothing of the answer is allowed");
  assert.equal(device.record["scope.key.device_code"], await hash("DC-1"), "the key is read from the body all the same, hashed");
  assert.equal(device.record["scope.key.user_code"], await hash("WDJB-MJHT"));
});

test("record_bodies without an allowlist records no body and says so; a malformed allowlist is refused", async () => {
  const { observe: _observe, ...noList } = BODIES;
  const compiled = compilePolicy(noList);
  assert.equal(compiled.recordBodies, false);
  assert.ok(compiled.notices.includes("record_bodies ignored: observe.bodies.allow_fields names no field"), compiled.notices.join("\n"));
  const signup = await run(noList, { method: "POST", url: "https://api.acme.example/signup", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.example" }) }, { status: 200, headers: { "content-type": "application/json" }, body: "{}" }, compiled);
  assert.equal(signup.record["scope.body.request"], null);
  assert.equal(compilePolicy({ ...BODIES, observe: { bodies: { allow_fields: [] } } }).recordBodies, false, "an empty list allows nothing");
  assert.deepEqual(policyRefusals({ ...BODIES, observe: { bodies: { allow_fields: "email" } } }).map((f) => f.path), ["/observe/bodies/allow_fields"]);
  assert.deepEqual(policyRefusals({ ...BODIES, observe: { bodies: { allow_fields: ["email", 7] } } }).map((f) => f.path), ["/observe/bodies/allow_fields/1"]);
});

test("an event stream's content is never recorded, only its size; the stream reaches the client whole", async () => {
  const frames = ['data: {"token":"sk_live_STREAMED"}\n\n', 'data: {"n":2}\n\n'];
  const { record, response, serialised } = await run(BODIES, { method: "GET", url: "https://api.acme.example/v1/events", headers: { accept: "text/event-stream" }, body: null }, { status: 200, headers: { "content-type": "text/event-stream" }, stream: frames });
  assert.equal(response.body, frames.join(""));
  assert.equal(record["scope.body.response"], null);
  assert.equal(record["scope.response.bytes"], new TextEncoder().encode(frames.join("")).byteLength);
  assert.ok(!serialised.includes("sk_live_STREAMED"));
});

const MCP = { schema: "scope.policy/1", version: 4, surfaces: { mcp: { path: "^/mcp$" }, api: { paths: ["^/v1/"] } }, headers: { setup: "x-acme-setup" } };
const SESSION = "6f1c2b9e-1111-4222-8333-444455556666";

test("the MCP session id is recorded hashed, on the request and in the answer's headers; the client still gets the real one", async () => {
  const { record, response, serialised } = await run(MCP, { method: "POST", url: "https://api.acme.example/mcp", headers: { "content-type": "application/json", "mcp-session-id": SESSION }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }, { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "srv-session-7" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }) });
  assert.equal(record["mcp.session.id"], await hash(SESSION));
  assert.equal(answerHeaders(record)["mcp-session-id"], await hash("srv-session-7"));
  assert.equal(response.headers["mcp-session-id"], "srv-session-7", "the wire is unchanged");
  assert.ok(!serialised.includes(SESSION) && !serialised.includes("srv-session-7"));
});

test("the setup header is hashed like the session id it carries, so the two still join; a reference code in it stays readable", async () => {
  const call = (setup: string) => run(MCP, { method: "GET", url: "https://api.acme.example/v1/things", headers: { "x-acme-setup": setup }, body: null }, { status: 200, headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await call(SESSION)).record["scope.key.setup_header"], await hash(SESSION));
  assert.equal((await call(REFERENCE)).record["scope.key.setup_header"], REFERENCE);
});

test("the gate's declaration carries the hashed session id, and its answer the real one", async () => {
  const policy = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8")) as Record<string, unknown>;
  const declare = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "declare_intent", arguments: { intent: "sync orders to a sheet" } } };
  const { response, declarations, serialised } = await run(policy, { method: "POST", url: "https://api.acme.example/mcp", headers: { "content-type": "application/json", "mcp-session-id": SESSION }, body: JSON.stringify(declare) }, { status: 500, headers: {}, body: "never forwarded" });
  assert.equal(response.headers["mcp-session-id"], SESSION);
  assert.equal(declarations[0]?.["mcp.session.id"], await hash(SESSION));
  assert.ok(!serialised.includes(SESSION));
});

test("an agent's declaration and intent header are redacted before they are recorded", async () => {
  const policy = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8")) as Record<string, unknown>;
  const key = "ah_abcdefghijklmnopqrstuvwx";
  const declare = (args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "declare_intent", arguments: args } });
  const structured = await run(policy, { method: "POST", url: "https://api.acme.example/mcp", headers: { "content-type": "application/json" }, body: JSON.stringify(declare({ intent: { goal: "sync" }, api_key: "sk_live_PASTED" })) }, { status: 500, headers: {}, body: "" });
  assert.equal(structured.declarations[0]?.text, JSON.stringify({ intent: { goal: "sync" }, api_key: `h:${await hash("sk_live_PASTED")}` }));
  const sentence = await run(policy, { method: "POST", url: "https://api.acme.example/mcp", headers: { "content-type": "application/json" }, body: JSON.stringify(declare({ intent: `send orders with ${key}, token=SECRETTOK then stop`, task: `notify ${key}`, found_via: "token=FOUNDTOK", agent: "codex" })) }, { status: 500, headers: {}, body: "" });
  assert.equal(sentence.declarations[0]?.text, `send orders with ah:h:${await hash(key)}, token=h:${await hash("SECRETTOK")} then stop`, "a secret ends at whitespace, the sentence goes on");
  assert.deepEqual([sentence.declarations[0]?.task, sentence.declarations[0]?.found_via, sentence.declarations[0]?.agent], [`notify ah:h:${await hash(key)}`, `token=h:${await hash("FOUNDTOK")}`, "codex"]);
  const header = await run(policy, { method: "GET", url: "https://api.acme.example/api/v1/hooks", headers: { "x-acme-intent": `deploy with ${key}` }, body: null }, { status: 200, headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(header.record["scope.key.intent_header"], `deploy with ah:h:${await hash(key)}`);
  for (const r of [structured, sentence, header]) assert.ok(!r.serialised.includes(key) && !r.serialised.includes("sk_live_PASTED") && !r.serialised.includes("TOK"));
  const task = "post to /api?code=1 when an order webhook fires";
  const posted = await run(policy, { method: "POST", url: "https://acme.example/api/docs/find", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) }, { status: 500, headers: {}, body: "" });
  const asked = await run(policy, { method: "GET", url: `https://acme.example/api/docs/find?task=${encodeURIComponent(task)}`, headers: {}, body: null }, { status: 500, headers: {}, body: "" });
  assert.equal(posted.response.body, asked.response.body, "the finder answers the task as sent, posted or asked");
  assert.equal(posted.declarations[0]?.text, `post to /api?code=h:${await hash("1")} when an order webhook fires`);
});

test("the URLs an OAuth authorization names are redacted like the query, in every form", async () => {
  const policy = { schema: "scope.policy/1", version: 2, surfaces: { oauth: { authorize: "^/oauth/authorize$" } } };
  const { record, serialised } = await run(policy, { method: "GET", url: "https://api.acme.example/oauth/authorize?client_id=https%3A%2F%2Fclient.example%2Fm.json%3Ftoken%3DCLIENTSECRET&resource=https%3A%2F%2Fmcp.example%2F%3Fapi_key%3DRESOURCESECRET", headers: {}, body: null }, { status: 302, headers: { location: "https://acme.example/login" } });
  assert.equal(record["scope.oauth"]?.client_id_url, `https://client.example/m.json?token=h:${await hash("CLIENTSECRET")}`);
  assert.equal(record["scope.oauth"]?.resource, `https://mcp.example/?api_key=h:${await hash("RESOURCESECRET")}`);
  assert.ok(!serialised.includes("CLIENTSECRET") && !serialised.includes("RESOURCESECRET"));
});

test("the policy cannot name the client's address or the session id as a header recorded as sent", () => {
  const compiled = compilePolicy({ ...MCP, headers: { session: "x-acme-session", install: "x-acme-install", setup: "X-Acme-Install", agent: "mcp-session-id", client: "X-Forwarded-For", intent: "fly-client-ip" } });
  assert.deepEqual([compiled.headers.setup, compiled.headers.agent, compiled.headers.client, compiled.headers.intent], [null, null, null, null]);
  assert.equal(compiled.notices.filter((n) => /holds the client's address, the session id or the install id/.test(n)).length, 4, compiled.notices.join("\n"));
});

test("a record made under the built-in default says so in its decisions, with the reason; one under fetched settings does not", async () => {
  const request: FixtureRequest = { method: "GET", url: "https://acme.example/docs", headers: {}, body: null };
  const upstream: FixtureUpstream = { status: 200, headers: { "content-type": "text/html" }, body: "<p>ok</p>" };
  const fallback = await run(defaultPolicy, request, upstream, { ...compilePolicy(defaultPolicy), fallback: "answered 503" });
  assert.deepEqual(fallback.record["scope.decision"], [{ rule: "policy", kind: "observe", mode: "live", outcome: "errored", reason: "built-in default: answered 503" }]);
  const fetched = await run(defaultPolicy, request, upstream);
  assert.deepEqual(fetched.record["scope.decision"], []);
});

test("the shipping promises are the ones the code keeps: no claim of signed or batched records", () => {
  for (const path of ["SECURITY.md", join("docs", "content", "data-handling.md"), "README.md", join("packages", "core", "TELEMETRY.md")]) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.doesNotMatch(text, /batched after the response|signed with the installation's key|after the response, signed/, path);
    if (path !== "README.md") assert.match(text, /one call per request/, `${path}: says how records travel`);
    if (path !== "README.md") assert.match(text, /observe\.bodies\.allow_fields/, `${path}: names the allowlist that decides which body fields leave`);
  }
});
