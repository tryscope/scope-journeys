# scope-journeys

The core of Scope Journeys: pure functions over `Request`, `Response` and a policy document, with no I/O except through one `io` object the adapter supplies, plus the `journeys` CLI. The adapters (`scope-journeys-cloudflare`, `scope-journeys-next`, `scope-journeys-node`, `scope-journeys-envoy`) bind this core to a platform; this package alone observes nothing.

## What it exports

- `observe(request, policy, facts, io)`: the request path (routing, the record's facts, the body on observed routes, the intent header, the finder, the gate, the outbound request). Answers `{ kind: "forward", request, state }` or `{ kind: "answer", response, state, records }`.
- `observeResponse(upstream, state)`: the response path (server-sent events frame by frame, pages with their references and rules, the helpful 404, observed JSON answers, the pass-through built last). Returns `{ response, records }`; the core ships the records itself through `io.ship` when the response is complete.
- `compilePolicy(document)` and `defaultPolicy`: the policy compiled once (regexes, the surface map, the rule table) and the embedded forward-only default (version 0).
- `classifyRoute`, `classifyReader`: the surface map's classifier and the reader families.
- `mintReference`, `isReference`, `findReference`: the eight-character references.
- `validatePolicy`, `validateRecord`, `findSecretShapedValues`: the schemas as code, generated validators with no runtime dependency.
- `RECORD_SCHEMA`, `DECLARATION_SCHEMA`, `POLICY_SCHEMA`, `VERSION`.

The schemas ship under `schemas/` (`request.json`, `declaration.json`, `decision.json`, `policy.json`) and the record's field list is `TELEMETRY.md`, generated from them.

## The CLI

```
npx journeys init [--key|--oidc] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]
npx journeys init --cloudflare --host a [--host b] [--origin o] [--dir journeys] [--name scope-journeys]
npx journeys init --node [--entry server.mjs] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]
npx journeys proxy --origin <url> [--listen :8080] [--trust-proxy]
npx journeys init --envoy [--dry-run] [--live] [--config envoy.yaml] [--processor host:9000] [--hosts a,b] [--docs-host d]
npx journeys uninstall [--cloudflare|--node|--envoy]
npx journeys version
npx journeys policy validate <file>
npx journeys doctor [--url https://host] [--install jin_...] [--token t] [--timeout 60]
npx journeys doctor --local --policy <file> --url <base url> [--path /docs/quickstart]
```

`init` mounts the sensor (the Next form in the project you run it in; the Worker form under your Cloudflare account with `--cloudflare`; the Express, Fastify or Hono mount with `--node`; the `ext_proc` filter and its cluster for an Envoy or Istio with `--envoy`), makes one call to Scope for the install and prints the claim URL; `uninstall` reverses every write and never calls Scope. `proxy` runs the standalone sensor of `scope-journeys-node` (installed beside the CLI) on plain HTTP in front of an origin you do not run; `SIGTERM` drains. The API client is typed against the Journeys subset of Scope's OpenAPI document vendored in `src/cli/openapi.journeys.json`, pinned to one contract version.

`doctor` sends one probe per host of the install (`GET /.well-known/journeys-probe?journeys_probe=<nonce>`, which the sensor answers itself with `204` and `x-journeys-probe: received` and records as a pass-through request), polls Scope for the record every two seconds for up to `--timeout` seconds, prints the facts that arrived per host and the one step that fixes anything missing, a documentation host that is not fronted first. The install id comes from `--install`, `.env.local` or `journeys/wrangler.toml`; the credential from `--token`, `.env.local` or `journeys/.env.secrets`. Exit 0 when every host is fronted and reporting (JA4 and the AS number are optional), 1 with the fix printed, 5 when Scope is unreachable or refuses the credential.

Output is a table on a terminal and one JSON object when stdout is not a TTY (or with `--json`). Exit codes: 0 done; 1 a finding; 2 usage, or not a project the command can mount; 3 a file needs an edit by hand (printed); 4 a required form is unavailable (OIDC, a wrangler login); 5 Scope refused or was unreachable; 6 a secret would have landed in a tracked file.

## What it never does

It performs no `fetch` (the adapter owns the forward and the shipment), it holds no secret, it keeps no raw address and no raw credential, it never throws to the adapter (a bug forwards the request untouched and is recorded in `scope.observer.errors`), and it hides nothing it does from the agent, the person or the customer.

## Licence

Elastic License 2.0.
