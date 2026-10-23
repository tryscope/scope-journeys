# scope-journeys-node

Scope Journeys on Node's own HTTP server: an Express, Fastify or Hono mount in the app you have, or the standalone proxy in front of an origin you do not run. The core is `scope-journeys`; this package binds it to `node:http` (the socket's facts, the hop to the app's own listener or to the origin, the policy cache, shipping after the response). Node 24 or later; no dependency beyond the core.

## Install

```
npx scope-journeys init --node --hosts api.example.com --docs-host docs.example.com
```

finds the framework and the entry file, writes the mount and the import, installs this package, creates the install and writes the variables to `.env.local`. By hand, the three mounts:

```js
import { journeys } from "scope-journeys-node"
app.use(journeys())                       // Express, placed first

import { fastifyJourneys } from "scope-journeys-node"
await fastify.register(fastifyJourneys)   // Fastify, before the routes

import { honoJourneys } from "scope-journeys-node"
app.use(honoJourneys())                   // Hono on @hono/node-server
```

The standalone proxy, with the CLI installed beside this package:

```
npx scope-journeys proxy --origin https://docs.example.com --listen :8080 [--trust-proxy]
```

## The inner hop

A mount forwards every observed request to the app's own listener (`http://127.0.0.1:<the port the request arrived on>`, or `JOURNEYS_ORIGIN`) with `x-journeys-inner` (a value derived from `JOURNEYS_SALT`, so a visitor cannot produce it while the salt is set), the request's own `Host`, `x-forwarded-for` and `x-forwarded-proto`; the request carrying the marker is handed to your routes untouched and never observed twice. The proxy forwards to `--origin` with the origin's `Host` and no marker.

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_...`; the policy is signed for it, so without it the sensor runs the embedded default |
| `JOURNEYS_INSTALL_KEY` | yes | the install key |
| `JOURNEYS_SALT` | yes | 32 random bytes you generate; every hash is salted with it and Scope never receives it |
| `JOURNEYS_ASSERTION_KEY` | yes | the ES256 key that signs `x-scope-assertion` on the hop |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host); https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |
| `JOURNEYS_HOST` | no | optional: observe only this host |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |
| `JOURNEYS_ORIGIN` | no | where the hop goes, an http or https URL with no credentials in it; the app's own listener by default on a mount, required on the proxy, which refuses any other value at start |
| `JOURNEYS_TRUST_PROXY` | no | the number of proxies in front that append to `x-forwarded-for` (`1` for a load balancer or a CDN, `2` for a CDN in front of a load balancer): the client's address is the entry the outermost of them appended, the scheme comes from `x-forwarded-proto`; on a mount also the host from `x-forwarded-host` (the record's `server.address`, the `{host}` the rules fill, what `JOURNEYS_HOST` is matched against; the hop still carries the `Host` as received), while the standalone proxy names the host it serves, the `Host` it receives. Set it only behind proxies you control, and count them all: too low a number records your CDN's addresses instead of your visitors' |
| `JOURNEYS_LISTEN` | no | the proxy's listen address; `:8080` by default |

Every mount also takes the same values as options (`journeys({ installId, origin, trustProxy, ... })`).

## What this form cannot see

The AS number, the organisation, the country, the colo, the JA4 digest and the TLS fingerprint are null on every record of this form: a socket does not know them. The address, its family, the TLS version (when Node terminates TLS) and the HTTP version are recorded. Joins lose nothing; the behaviour columns lose the network kind.

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws, or the hop cannot connect (the origin refuses it, or its host does not resolve) | a hop that cannot connect is recorded as received, with no response; a mount hands the request to your routes untouched; the proxy forwards untouched, or answers 502 when the origin is unreachable |
| the hop fails after the request left: the connection drops, or the origin stays silent for 30 seconds | the request is not sent again: the client gets a 502, or a 504 when the origin stayed silent; the record carries the status and the error's class. A GET, HEAD, OPTIONS, PUT or DELETE whose kept-alive connection was reset before any answer goes once more on a fresh connection |
| no install id | one log line naming `journeys init --node`; every request passes through under the forward-only default |
| no salt | one log line naming `journeys init --node`; nothing is recorded or sent, every request goes on untouched, and the probe answers `x-journeys-probe: no-salt` |
| the policy fetch fails | the last good policy, or the embedded forward-only default, whose records say so (a `policy` decision with the reason) |
| Scope's ingest is down, or answers 429 | one retry (after `Retry-After`, capped at 60 seconds, on a 429), then the record is dropped and counted; nothing waits |

What it records is in `TELEMETRY.md` of `scope-journeys`; the data-handling statement is `SECURITY.md`. The guide: https://journeys.tryscope.com/install/node.
