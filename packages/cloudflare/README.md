# scope-journeys-cloudflare

Scope Journeys on a Cloudflare Worker: the sensor in front of your documentation host and your API and MCP host, on routes in your own zone. The core is `scope-journeys`; this package binds it to the platform (the facts in `request.cf`, the policy cache, the hop to your origin, shipping after the response).

## Two ways to deploy

With the CLI (recommended):

```
npx scope-journeys init --cloudflare --host docs.example.com --host api.example.com
```

It deploys the Worker under your account on routes for every host, sets the two secrets and prints the claim link.

By hand: `src/worker.ts` is `export { default } from "scope-journeys-cloudflare/worker"`, `wrangler.toml` follows `templates/wrangler.toml` in this package (what `journeys init --cloudflare` fills in), and the two secrets are set with `npx wrangler secret put JOURNEYS_INSTALL_KEY` and `npx wrangler secret put JOURNEYS_SALT`. `npx wrangler deploy` does the rest.

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_...`; the policy is signed for it, so without it the sensor runs the embedded default |
| `JOURNEYS_INSTALL_KEY` | yes | the install key, shown once at `init`; rotatable and revocable in the console |
| `JOURNEYS_SALT` | yes | 32 random bytes you generate; every hash is salted with it and Scope never receives it |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host); https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |
| `JOURNEYS_ORIGIN` | no | the origin to forward to, an http or https URL with no credentials in it; needed only off a route in your own zone (a `workers.dev` host) |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |
| `JOURNEYS_POLICY_URL` | no | optional: a full url to fetch the policy from instead of the install's policy route, which must serve answers Scope signed for this install; https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |

## What it does to your traffic

On every request it forwards to your origin it adds a `Via` header naming itself and removes the hop-by-hop headers and the client's `accept-encoding` and `content-length`, as a conforming gateway does. It forwards none of the edge's facts about the client to your origin: the AS number, the country, the colo, the TLS facts and the JA4 digest stay in the record. The policy's forward headers are the only other addition.

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws | `passThroughOnException`: the request reaches your origin untouched; the record carries the error's class |
| the origin is down | the error is forwarded as received; the record carries the status |
| the hop to your origin fails: the connection drops, or no answer within 30 seconds | the request is never sent again: the client gets a 502, or a 504 on the timeout; the record carries the status and the error's class |
| Scope's ingest is down, slow, or answers 429 | each request's records are sent again with growing waits within 25 of the 30 seconds the Worker keeps after the response; a 429 whose `Retry-After` is later than that, a shipment Scope refuses (a revoked key), and what is still failing at the end are dropped and counted; nothing waits |
| the policy fetch fails | the last good policy, or the embedded forward-only default, whose records say so (a `policy` decision with the reason) |
| `JOURNEYS_SALT` is not set | nothing is recorded or sent, every request goes to the origin untouched, the probe answers `x-journeys-probe: no-salt`; one log line, never an exception |

## Upgrades

`npm update scope-journeys-cloudflare`, then `npx wrangler versions upload` and `npx wrangler versions deploy --percentage 10`, then `100`, so a sensor version reaches a tenth of the traffic first. The record's `observer.version` shows both versions in the console while the split runs.

What it records is in `TELEMETRY.md` of `scope-journeys`; the data-handling statement is `SECURITY.md`.
