# Install: a Cloudflare zone

One command, with `wrangler` logged in to your account, deploys the Worker under your account on a route per host, sets the two secrets and prints the claim link.

```
npx scope-journeys init --cloudflare --host docs.example.com --host api.example.com
```

What it prints on a terminal:

```
install     jin_your_install_id
form        cloudflare
routes      docs.example.com/*, api.example.com/*
files       journeys/package.json, journeys/src/worker.ts, journeys/wrangler.toml, journeys/.gitignore, journeys/README.md, journeys/.env.secrets
secrets     JOURNEYS_INSTALL_KEY; JOURNEYS_SALT
deployed    <deployment id> (version <version id>)
claim       https://console.tryscope.com/journeys/claim/...
next        run `journeys doctor`; open the claim URL to bind the install to your account
```

Then [verify](/doctor):

```
npx scope-journeys doctor
```

and open the claim URL to [bind the install to your account](/claim). A host whose DNS record is not proxied (the grey cloud) is named in a warning line: the route exists but the request never reaches the Worker until the record is proxied.

## Flags

| flag | meaning |
|---|---|
| `--host h` | a host to front, once per host; the zone is looked up for each |
| `--origin o` | the origin to forward to, needed only off a route in your own zone (a `workers.dev` host) |
| `--dir journeys` | the directory the Worker project is written to (default `journeys/`) |
| `--name scope-journeys` | the Worker's name (default `scope-journeys`); give each install its own when one account fronts several zones |
| `--api-url u` | Scope's API (the default is the production host) |
| `--environment production\|preview\|development` | the install's environment |
| `--yes` | take every default without asking |
| `--json` | one JSON object on stdout (the default when stdout is not a terminal); never the key or the salt |

Exit codes: 0 done; 4 `wrangler` is not logged in, or a host is in no zone of the account; 5 Scope refused or was unreachable, or the deploy failed (the pending steps are printed).

## What it writes

`journeys/` next to your project: a `package.json` depending on `scope-journeys-cloudflare`, `src/worker.ts` (`export { default } from "scope-journeys-cloudflare/worker"`), `wrangler.toml` with the routes, `[observability] enabled = true` and the two variables, a `.gitignore` for `.env.secrets`, and `.env.secrets` holding the install key and the salt for `doctor` and a redeploy. Commit the directory; never commit `.env.secrets`.

```toml
name = "scope-journeys"
main = "src/worker.ts"
compatibility_date = "2026-10-01"
routes = [
  { pattern = "docs.example.com/*", zone_name = "example.com" },
  { pattern = "api.example.com/*", zone_name = "example.com" },
]

[observability]
enabled = true

[vars]
JOURNEYS_INSTALL_ID = "jin_your_install_id"
JOURNEYS_API_URL = "https://api.tryscope.com"
JOURNEYS_NAME = "scope-journeys"
```

By hand, the same: `src/worker.ts` as above, `wrangler.toml` following `templates/wrangler.toml` in `scope-journeys-cloudflare`, `npx wrangler secret put JOURNEYS_INSTALL_KEY`, `npx wrangler secret put JOURNEYS_SALT`, `npx wrangler deploy`.

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_your_install_id` |
| `JOURNEYS_INSTALL_KEY` | yes | the install key, shown once at `init`; rotatable and revocable in the console |
| `JOURNEYS_SALT` | yes | 32 random bytes generated on your machine; every hash is salted with it and Scope never receives it |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host); https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |
| `JOURNEYS_ORIGIN` | no | the origin to forward to, an http or https URL with no credentials in it; needed only off a route in your own zone |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |
| `JOURNEYS_POLICY_URL` | no | optional: a full url to fetch the policy from instead of the install's policy route; https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |

## The assertion key

`init` also generated an ES256 key pair on your machine: the public half is registered with Scope, the private half is the third secret, `JOURNEYS_ASSERTION_KEY` (a JWK carrying its `kid`, `<install id>:1`). When the policy's assertion is on, every request the Worker forwards to your origin carries `x-scope-assertion`, signed with it, so your origin can verify what the sensor saw: [Verify: the assertion in Express](/verify/express). Every six weeks, `npx scope-journeys rotate-assertion-key --cloudflare` registers a new public key, puts the new secret and prints the overlap deadline; the previous key verifies for seven more days; redeploy to sign with the new one.

## Rotating the salt

`JOURNEYS_SALT` is yours and never reaches Scope. `npx scope-journeys rotate-salt --cloudflare` advances the install's salt epoch first (every sensor stamps the new epoch within a minute), then writes a new salt where `init` wrote the first and tells you to deploy; records between the bump and the deploy carry the new epoch with the old salt and join nothing after the deploy, and journeys never join across epochs. The console shows the rotation's date for 30 days.

## What it does to your traffic

On every request it forwards to your origin it adds a `Via` header naming itself and removes the hop-by-hop headers and the client's `accept-encoding` and `content-length`, as a conforming gateway does. It forwards none of the edge's facts about the client to your origin: the AS number, the country, the colo, the TLS facts and the JA4 digest stay in the record.

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws | `passThroughOnException`: the request reaches your origin untouched; the record carries the error's class |
| the origin is down | the error is forwarded as received; the record carries the status |
| the hop to your origin fails: the connection drops, or no answer within 30 seconds | the request is never sent again: the client gets a 502, or a 504 on the timeout; the record carries the status and the error's class |
| Scope's ingest is down, slow, or answers 429 | each request's records are sent again with growing waits within 25 of the 30 seconds the Worker keeps after the response; a 429 whose `Retry-After` is later than that, a shipment Scope refuses (a revoked key), and what is still failing at the end are dropped and counted; nothing waits |
| the policy fetch fails | the last good policy, or the embedded forward-only default, whose records say so (a `policy` decision with the reason) |
| `JOURNEYS_SALT` is not set | nothing is recorded or sent, every request goes to the origin untouched, the probe answers `x-journeys-probe: no-salt`; one log line, never an exception |

## Upgrades and removal

`npm update scope-journeys-cloudflare` in `journeys/`, then `npx wrangler versions upload` and `npx wrangler versions deploy --percentage 10`, then `100`, so a sensor version reaches a tenth of the traffic first.

```
npx scope-journeys uninstall --cloudflare
```

deletes the Worker (and its routes) and the `journeys/` directory; it never calls Scope. Revoke the install key from the console when the install is retired.
