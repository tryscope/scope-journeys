// J3.1: the mode matrix. A rule is live only in the environments it lists and runs dry everywhere
// else; `on_error: closed` compiles for a gate only; a template that asks for a value its rule
// cannot fill throws, and the runner records the error's class.
import assert from "node:assert/strict";
import { test } from "node:test";

import { PolicyError, compilePolicy, effectiveMode, fill } from "../src/policy.js";
import { decide, errored, isLive, type Decision } from "../src/rules/runner.js";

const document = (rules: Array<Record<string, unknown>>): Record<string, unknown> => ({
  schema: "scope.policy/1",
  version: 9,
  secrets: [],
  headers: {},
  forward: {},
  surfaces: { docs: { paths: ["^/docs/"] }, mcp: { paths: ["^/mcp$"] } },
  rules,
});

const gate = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "gate", kind: "gate", route: "/mcp", tool: { name: "declare_intent", description: "d", inputSchema: { type: "object" } }, acknowledgement: "Noted {session}.", ...extra });

test("the effective mode: live in a listed environment, dry run in an unlisted one, dry run when the rule says so, dry run by default", () => {
  const policy = compilePolicy(document([
    { id: "a", kind: "inject", mode: "live", environments: ["preview"], faces: {} },
    { id: "b", kind: "inject", mode: "dry_run", environments: ["production", "preview", "development"], faces: {} },
    { id: "c", kind: "inject", faces: {} },
    { id: "d", kind: "inject", mode: "live", faces: {} },
  ]));
  const [a, b, c, d] = policy.rules;
  assert.ok(a && b && c && d);
  assert.equal(effectiveMode(a, "preview"), "live");
  assert.equal(effectiveMode(a, "production"), "dry_run");
  assert.equal(isLive(a, "development"), false);
  assert.equal(effectiveMode(b, "production"), "dry_run");
  assert.equal(effectiveMode(c, "production"), "dry_run", "dry run by default");
  assert.deepEqual(c.environments, ["production", "preview", "development"], "every environment by default");
  assert.equal(effectiveMode(d, "development"), "live", "live everywhere when no environments are listed");
  assert.equal(d.on_error, "open");
});

test("the runner is the one writer of decisions: applied and would_apply carry the same reason; errored carries the error's class and what was done", () => {
  const policy = compilePolicy(document([{ id: "links", kind: "inject", mode: "live", environments: ["production"], faces: {} }, gate({ mode: "live", on_error: "closed" })]));
  const [links, g] = policy.rules;
  assert.ok(links && g);
  const decisions: Decision[] = [];
  assert.equal(decide(decisions, links, "production", "applied", "page matched docs face html"), "live");
  assert.equal(decide(decisions, links, "preview", "would_apply", "page matched docs face html"), "dry_run");
  errored(decisions, g, "production", new TypeError("template asks for {token}"));
  errored(decisions, g, "production", new TypeError("template asks for {token}"), "on_error closed: declaration refused");
  errored(decisions, g, "production", "not an Error");
  assert.deepEqual(decisions, [
    { rule: "links", kind: "inject", mode: "live", outcome: "applied", reason: "page matched docs face html" },
    { rule: "links", kind: "inject", mode: "dry_run", outcome: "would_apply", reason: "page matched docs face html" },
    { rule: "gate", kind: "gate", mode: "live", outcome: "errored", reason: "TypeError" },
    { rule: "gate", kind: "gate", mode: "live", outcome: "errored", reason: "TypeError; on_error closed: declaration refused" },
    { rule: "gate", kind: "gate", mode: "live", outcome: "errored", reason: "Error" },
  ]);
});

test("on_error closed compiles for a gate and is refused on every other kind", () => {
  assert.equal(compilePolicy(document([gate({ on_error: "closed" })])).rules[0]?.on_error, "closed");
  assert.equal(compilePolicy(document([gate()])).rules[0]?.on_error, "open");
  assert.throws(() => compilePolicy(document([{ id: "links", kind: "inject", on_error: "closed", faces: {} }])), (error: unknown) => error instanceof PolicyError && /on_error "closed" is honoured by a gate only/.test(error.message));
  for (const kind of ["finder", "notfound", "error", "face"]) assert.throws(() => compilePolicy(document([{ id: kind, kind, on_error: "closed" }])), PolicyError, kind);
});

test("fill: a placeholder the rule cannot supply throws a TypeError; a placeholder another rule fills is left alone", () => {
  assert.equal(fill("Noted {session}.", { session: "s-1" }), "Noted s-1.");
  assert.equal(fill("https://{host}{prefix}/x?ref={token}", { host: "acme.example", prefix: "", token: "ABCDEFGH" }), "https://acme.example/x?ref=ABCDEFGH");
  assert.throws(() => fill("Noted {session}. Token {token}.", { session: "s-1" }), (error: unknown) => error instanceof TypeError && /asks for \{token\}/.test(error.message));
  assert.equal(fill(" Guide: {link}?ref={token}", { token: "ABCDEFGH", host: "h", prefix: "" }), " Guide: {link}?ref=ABCDEFGH");
  assert.equal(fill("{unknown} stays", {}), "{unknown} stays");
});

test("what the compiler tolerates (DEPRECATION.md): an unknown section is ignored and named, an unknown rule kind runs dry and is named, the routes form is named", () => {
  const policy = compilePolicy({ ...document([gate({ mode: "live" }), { id: "future", kind: "banner", mode: "live", copy: "x" }]), experiments: { banner: true } });
  assert.deepEqual(policy.notices, ["section ignored: experiments", "rule future: kind banner is not implemented by this sensor; it runs dry"]);
  const future = policy.rules[1];
  assert.ok(future);
  assert.equal(future.kind, "unknown");
  assert.equal(future.unknown_kind, "banner");
  assert.equal(future.mode, "dry_run", "dry whatever the document says");
  assert.equal(effectiveMode(future, "production"), "dry_run");
  assert.equal(policy.rules[0]?.mode, "live", "the known rule keeps its mode");
  const routesOnly = compilePolicy({ schema: "scope.policy/1", version: 1, secrets: [], headers: {}, forward: {}, routes: { passthrough: "^$", not_content: "^/api/", observed: "^/api/", text_faces: "^$" }, rules: [] });
  assert.deepEqual(routesOnly.notices, ["routes form: move to surfaces"]);
});
