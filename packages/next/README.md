# scope-journeys-next

Scope Journeys inside a Next.js application: one condition in the proxy file you already have. The core is `scope-journeys`; this package binds it to Next (the platform's facts from Vercel's headers, the inner hop to your own host, the policy cache, shipping after the response through `after()`).

## Install

```
npx scope-journeys init
```

In a Next 16 project the command detects the proxy file's place (`proxy.ts`, or `src/proxy.ts` under `src/app`; `middleware.ts` on Next 15), the linked Vercel project and its domains, and the OIDC token `vercel env pull` wrote; it asks only what it cannot detect (the product hosts, the docs host), writes the dependency, the proxy file (created, or your existing default export wrapped as `next`), `instrumentation.ts`, the salt and the variables, and makes one call to Scope for the install. What it prints on a terminal, on a fresh project:

```
install     jin_your_install_id
form        next
hosts       acme.example
files       proxy.ts, instrumentation.ts, .env.local
env         JOURNEYS_INSTALL_ID (vercel: production, preview, development); JOURNEYS_SALT (vercel: production, preview, development); JOURNEYS_INSTALL_KEY (vercel: production, preview, development); JOURNEYS_INSTALL_ID (.env.local); JOURNEYS_SALT (.env.local); JOURNEYS_INSTALL_KEY (.env.local)
claim       https://console.tryscope.com/journeys/claim/...
next        deploy a preview, then run `journeys doctor --url <preview url>`; open the claim URL to bind the install to your account
```

Flags: `--key` (an install key even when OIDC is available), `--oidc` (require the OIDC form; exit 4 when the token is not at hand), `--hosts a.example,b.example`, `--docs-host docs.example` (or `same`), `--host h` (observe only this host), `--api-url`, `--environment production|preview|development`, `--yes`. When stdout is not a terminal the output is one JSON object (never the key or the salt). Exit codes: 0 done; 2 not a Next project (or Next below 15); 3 the proxy file needs the two lines by hand (printed); 4 the OIDC form was required and is unavailable; 5 Scope refused or was unreachable; 6 `.env.local` is not ignored, so no secret was written. `npx scope-journeys uninstall` reverses every write and never calls Scope.

or by hand, in `proxy.ts` (Next 16; `middleware.ts` on Next 15):

```ts
import { withJourneys } from "scope-journeys-next"

export default withJourneys()

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

Wrapping an existing proxy:

```ts
import { withJourneys } from "scope-journeys-next"

async function previous(request: NextRequest) { /* your logic */ }

export default withJourneys({ next: previous })
```

`next` runs for the inner hop (the request the sensor forwards to your own host, marked `x-journeys-inner: 1`) and for hosts the install does not observe, so your logic keeps running exactly where it ran.

Add to `instrumentation.ts`:

```ts
export { onRequestError } from "scope-journeys-next/instrumentation"
```

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_...` |
| `JOURNEYS_INSTALL_KEY` | yes | the install key; not needed when the project's OIDC federation is on |
| `JOURNEYS_SALT` | yes | 32 random bytes you generate; every hash is salted with it and Scope never receives it |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host) |
| `JOURNEYS_HOST` | no | optional: observe only this host |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |

Without a key, the sensor authenticates with your Vercel project's OIDC token (`x-vercel-oidc-token`): turn on "Secure backend access with OIDC federation" in the project's settings and bind the subject at `init`. The audience to set is `JOURNEYS_OIDC_AUDIENCE` as the console shows it.

## The inner hop

The sensor forwards every observed request to the app's own address with `x-journeys-inner: 1`; the inner pass is handed to your logic untouched and never observed twice. The address is the one Next built `request.url` on (your deployment's host on Vercel, `localhost:<port>` under `next start`), or `JOURNEYS_ORIGIN`; the hop's `Host` names it, and the agent's headers travel as received, `x-forwarded-host` and `x-forwarded-proto` among them. The hop asks for an uncompressed answer (`accept-encoding: identity`): the sensor reads and may rewrite the body, and your platform compresses the answer to the agent as before. The lab measured the hop at +1 ms on pages and +14 ms on MCP calls at p50.

The host on every record (`server.address`, the `{host}` the rules fill, the authority a signature is verified against) is the one the agent spoke to: `x-forwarded-host` as Vercel's edge or the proxy in front of `next start` set it (Next fills it from `Host` when nothing did), never the listen address. `JOURNEYS_HOST` is matched against the same host.

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws | the request is handed to your app untouched; the record carries the error's class |
| no install id (and no policy URL) | one log line naming `journeys init`; every request goes to your logic with no inner hop, the probe is still answered |
| no salt | one log line naming `journeys init`; every request passes through under the forward-only default |
| the policy fetch fails | the last good policy, or the embedded forward-only default |
| Scope's ingest is down, or answers 429 | one retry (after `Retry-After`, capped at 60 seconds, on a 429), then the record is dropped and counted; nothing waits |

What it records is in `TELEMETRY.md` of `scope-journeys`; the data-handling statement is `SECURITY.md`.
