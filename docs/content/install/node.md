# Install: Node (Express, Fastify, Hono) or the standalone proxy

The same core as the Worker and the Next forms, on Node's own HTTP server: a dependency and one mount in the app you have, or one binary in front of an origin you do not run. Node 24 or later.

```
npx scope-journeys init --node --hosts api.example.com --docs-host docs.example.com
```

The command finds the framework in `package.json` (Express, Fastify or Hono), the entry file (`main`, or the file the `start` or `dev` script runs; `--entry server.mjs` names it otherwise), writes the mount on the line after the one that creates the app and the import at the top, installs the dependency, makes one call to Scope for the install, and writes the variables to `.env.local` (which must be ignored by git). What it prints on a terminal:

```
install     jin_your_install_id
form        node (express)
hosts       api.example.com, docs.example.com
files       server.mjs, .env.local
env         JOURNEYS_INSTALL_ID (.env.local); JOURNEYS_SALT (.env.local); JOURNEYS_INSTALL_KEY (.env.local); JOURNEYS_ASSERTION_KEY (.env.local)
pending     set on the deployment, from .env.local: JOURNEYS_INSTALL_ID, JOURNEYS_SALT, JOURNEYS_INSTALL_KEY, JOURNEYS_ASSERTION_KEY
              JOURNEYS_TRUST_PROXY=1   # when a load balancer or a CDN sits in front of the app, so the client's address, scheme and host are read from x-forwarded-for, x-forwarded-proto and x-forwarded-host (the host on a mount)
              JOURNEYS_ORIGIN=http://127.0.0.1:<port>   # only when the app does not answer on the port the request arrived on
claim       https://console.tryscope.com/journeys/claim/...
next        start the app with the variables (node --env-file=.env.local server.mjs) and deploy; then run `journeys doctor --url https://api.example.com`; open the claim URL to bind the install to your account
```

An entry file whose shape the command does not understand (no `const app = express()` line, or no entry file at all) is exit 3: everything else is done, and the two lines to add are printed. Then deploy and [verify](/doctor):

```
npx scope-journeys doctor --url https://api.example.com
```

## The three mounts

Express, placed first, before every other `app.use` and every route:

```js
import { journeys } from "scope-journeys-node"

const app = express()
app.use(journeys())
```

Fastify, registered before the routes (the plugin skips encapsulation, so it sees every route of the instance):

```js
import { fastifyJourneys } from "scope-journeys-node"

const fastify = Fastify()
await fastify.register(fastifyJourneys)
```

Hono, fetch-native (the middleware receives the request and returns the response the core built), on `@hono/node-server`:

```js
import { honoJourneys } from "scope-journeys-node"

const app = new Hono()
app.use(honoJourneys())
```

Every mount reads the same variables from the process environment; each also takes them as options (`journeys({ installId, origin, trustProxy, ... })`) when you would rather pass them.

## The inner hop

A mount sits inside the app, so the sensor forwards every observed request to the app's own listener (`http://127.0.0.1:<the port the request arrived on>`, or `JOURNEYS_ORIGIN`) with the header `x-journeys-inner: 1`, the request's own `Host`, `x-forwarded-for` and `x-forwarded-proto`; the request carrying the marker is handed to your routes untouched and never observed twice. Your app therefore runs each observed request once, as before, one hop later. The hop is one loopback round trip; the equivalent hop of the Next form measured +1 ms on pages and +14 ms on MCP calls at p50.

## The standalone proxy

For an origin you do not run (a documentation host on someone else's platform, an API behind a gateway you cannot change):

```
npx scope-journeys proxy --origin https://docs.example.com --listen :8080 [--trust-proxy]
```

needs `scope-journeys-node` installed beside the CLI (`npm install scope-journeys scope-journeys-node`). It listens on plain HTTP and forwards to `--origin` with the origin's `Host`: certificates are your load balancer's job, and a proxy that terminated TLS would hold a private key the sensor never needs. The install's variables come from the environment and from `.env.local` in the working directory, as `init --node` wrote them. `SIGTERM` drains: no new connections, in-flight requests complete, their records ship, then it exits (10 seconds at most). Point the public hostname at it, and the policy's forward headers (`{host}` filled with the public host) tell the origin who was asked.

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_your_install_id` |
| `JOURNEYS_INSTALL_KEY` | yes | the install key, shown once at `init`; rotatable and revocable in the console |
| `JOURNEYS_SALT` | yes | 32 random bytes generated on your machine; every hash is salted with it and Scope never receives it |
| `JOURNEYS_ASSERTION_KEY` | yes | the ES256 key that signs `x-scope-assertion` on the hop; [Verify](/verify/express) |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host); https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |
| `JOURNEYS_HOST` | no | optional: observe only this host; other hosts pass to the app untouched |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |
| `JOURNEYS_ORIGIN` | no | where the hop goes: the app's own listener by default on a mount; required on the proxy (`--origin`) |
| `JOURNEYS_TRUST_PROXY` | no | `1` reads the client's address from the first `x-forwarded-for` and the scheme from `x-forwarded-proto`; on a mount also the host from `x-forwarded-host` (the record's `server.address`, the `{host}` the rules fill, what `JOURNEYS_HOST` is matched against; the hop still carries the `Host` as received), while the standalone proxy names the host it serves, the `Host` it receives. Unset, the socket's own address and scheme and the `Host` header. Set it only behind a proxy you control, or any client can name its own address and host |
| `JOURNEYS_LISTEN` | no | the proxy's listen address (`host:port`, `:port` or `port`; `:8080` by default) |

The variables load from `.env.local` with `node --env-file=.env.local server.mjs`; the deployment sets the four secrets itself (`init` prints their names, never their values, in the JSON output).

## What this form cannot see

A socket knows the client's address, its family, the TLS version (when Node terminates TLS; null behind a terminator) and the HTTP version. It does not know the AS number, the organisation, the country, the colo, the JA4 digest or the TLS fingerprint: those columns are null on every record of this form, `x-request-id` from a load balancer in front is the platform's request id when present. Joins lose nothing (the address hash, the credentials, the references and the session ids are the same); the behaviour columns lose the network kind (home, cloud, mobile), which the Worker and the Next forms carry.

## What it does to your traffic

On every request it forwards it adds a `Via` header naming itself, removes the hop-by-hop headers and the client's `accept-encoding` and `content-length` as a conforming gateway does, appends the caller's address to `x-forwarded-for`, and on a mount sets `x-journeys-inner: 1` and `x-forwarded-proto`. The hop carries no `accept-encoding` and no user agent of its own: the origin sees the client's agent string, uncompressed. A WebSocket upgrade is not proxied by the standalone proxy; a mount never sees one (the server's `upgrade` event bypasses middleware).

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws, or the hop fails before a byte was written | a mount hands the request to your routes untouched (`next`); the proxy forwards untouched, or answers 502 when the origin is unreachable; the log line names the cause |
| no install id | one log line naming `journeys init --node`; every request passes through under the forward-only default |
| no salt | one log line naming `journeys init --node`; nothing is recorded or sent, every request goes on untouched, and the probe answers `x-journeys-probe: no-salt` |
| the policy fetch fails | the last good policy, or the embedded forward-only default, whose records say so (a `policy` decision with the reason) |
| Scope's ingest is down, or answers 429 | one retry (after `Retry-After`, capped at 60 seconds, on a 429), then the record is dropped and counted; nothing waits in the request path |
| the origin stays silent | the hop is given up after 30 seconds; the client gets a 502 |

## Remove it

```
npx scope-journeys uninstall --node
```

restores the entry file as it was before the mount, removes the dependency and the lock, and never calls Scope. Remove the `JOURNEYS_*` lines from `.env.local` and from the deployment's environment.
