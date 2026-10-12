# CLI

`journeys` ships in `scope-journeys`. Run it as `npx scope-journeys <command>` from anywhere, or `npx journeys <command>` once the package is installed in the project. Output is a table on a terminal and one JSON object when stdout is not a terminal or with `--json`; the key and the salt are never printed in JSON.

```
journeys <command> [options]

  init [--key|--oidc] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]
                                            mount the sensor in this Next project and print the claim URL
  init --cloudflare --host a [--host b] [--origin o] [--dir journeys] [--name scope-journeys]
                                            deploy the Worker under your Cloudflare account on a route per host
  init --node [--entry server.mjs] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]
                                            mount the sensor in this Express, Fastify or Hono app and print the claim URL
  proxy --origin <url> [--listen :8080] [--trust-proxy] [--name n] [--api-url u]
                                            the standalone sensor in front of an origin you do not run (needs scope-journeys-node)
  init --envoy [--dry-run] [--live] [--config envoy.yaml] [--processor host:9000] [--hosts a,b] [--docs-host d] [--yes]
                                            the ext_proc filter and its cluster for your Envoy (or Istio), the processor's variables, the install
  uninstall [--cloudflare|--node|--envoy]   reverse every write of init; the product is as it was
  rotate-assertion-key [--cloudflare]       a new signing key for the assertion, registered with Scope; the previous one verifies seven more days
  rotate-salt [--cloudflare]                the next salt epoch on the install, then a new JOURNEYS_SALT in your environment; deploy right after
  version                                   the package, record and policy versions
  policy validate <file>                    validate a policy document and scan it for secret-shaped values
  doctor [--url https://host] [--install jin_...] [--token t] [--timeout 60]
                                            probe each host of the install, print the facts that arrived and the one fix for what is missing
  doctor --local --policy <file> --url <base> [--path /docs/quickstart] [--raw]
                                            observe one request to a local app through the core, no adapter needed

  --json                                    one JSON object on stdout (the default when stdout is not a terminal)
```

## Commands

| command | does | guide |
|---|---|---|
| `init` | the Next form: detects the project, writes the proxy file, `instrumentation.ts`, the dependency, the salt and the variables, makes one call to Scope for the install, prints the claim URL | [Next on Vercel](/install/next) |
| `init --cloudflare` | the Worker form: deploys the Worker under your account on a route per host, sets the two secrets, prints the claim URL | [A Cloudflare zone](/install/cloudflare) |
| `init --node` | the Node form: finds the framework (Express, Fastify, Hono) and the entry file, writes the mount and the import, the dependency, the salt and the variables in `.env.local`, makes one call to Scope for the install, prints the claim URL and the lines the deployment still needs | [Node](/install/node) |
| `proxy --origin <url>` | the standalone sensor on plain HTTP in front of an origin you do not run; the variables from the environment and `.env.local`; `SIGTERM` drains | [Node](/install/node) |
| `init --envoy` | the Envoy form: the `ext_proc` filter and its cluster (applied to `--config`, written to `journeys/` otherwise, the Istio twin beside), the processor's variables in `.env.local`, one call to Scope for the install; `--dry-run` prints and writes nothing; `--live` prints the form the first live rule needs | [Envoy](/install/envoy) |
| `uninstall [--cloudflare\|--node\|--envoy]` | reverses every write of `init` (the lock says which form when no flag is given); never calls Scope | the same |
| `rotate-assertion-key [--cloudflare]` | a new ES256 pair for the assertion: the public key registered through `POST /v1/installs/{id}`, the private key written where `init` wrote the first (`.env.local` and the Vercel project, or `journeys/.env.secrets` and the Worker's secret), the overlap deadline printed | [Verify](/verify/next) |
| `rotate-salt [--cloudflare]` | the salt is yours and never reaches Scope, so a rotation is two things done in the order that keeps the window small: the epoch advanced on the install first (`POST /v1/installs/{id}` `{salt_epoch: current + 1}`, so every sensor stamps it within a minute), then a new salt written where `init` wrote the first, then the deploy instruction; records between the bump and the deploy carry the new epoch with the old salt and join nothing after the deploy, and journeys never join across epochs; refuses on an unclaimed or revoked install | [Policy](/policy) |
| `doctor` | one probe per host, the facts that arrived, the one step that fixes what is missing | [Verify](/doctor) |
| `doctor --local` | one request through the core in this process against a local app, no adapter, no account | [Verify](/doctor) |
| `policy validate <file>` | the document against the schema, plus a scan for secret-shaped values | [Policy](/policy) |
| `version` | the package version, the record schema version, the policy schema version | |

## Exit codes

| code | meaning |
|---|---|
| 0 | done |
| 1 | a finding: an invalid policy, a host or a required fact missing in `doctor` (the fix printed) |
| 2 | usage, or not a project the command can mount (`init` on something that is not Next 15 or newer; `init --node` on a project depending on none of Express, Fastify, Hono; `proxy` without `scope-journeys-node` installed) |
| 3 | a file needs an edit by hand; the lines are printed (`init`, when the proxy file's shape cannot be wrapped; `init --node`, when the entry file is unknown or its shape is not understood; `init --envoy`, when no `--config` was given or its shape is not understood: the fragment to merge) |
| 4 | a required form is unavailable (`--oidc` without the token at hand; `--cloudflare` without a wrangler login) |
| 5 | Scope refused or was unreachable, or the app is not listening (`doctor --local`) |
| 6 | a secret would have landed in a tracked file (`.env.local` is not ignored by git); nothing was written |

Every non-zero exit prints the one thing to do.

## The API client

The CLI talks to Scope through a client typed against the Journeys subset of the public API's OpenAPI document, vendored in the package and pinned to one contract version; the [API](/api) page is generated from the same document. `POST /v1/installs` carries an `Idempotency-Key` minted once per `init` run and kept in `.journeys/init.lock`, so a rerun after a failure reuses the same install instead of minting another.
