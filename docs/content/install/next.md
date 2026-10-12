# Install: Next on Vercel

One command in your Next project. It detects the proxy file's place (`proxy.ts`, or `src/proxy.ts` under `src/app`; `middleware.ts` on Next 15), the linked Vercel project and its domains, and the OIDC token `vercel env pull` wrote; it asks only what it cannot detect (the product hosts, the docs host), writes the dependency, the proxy file (created, or your existing default export wrapped as `next`), `instrumentation.ts`, the salt and the variables, and makes one call to Scope for the install.

```
npx scope-journeys init
```

What it prints on a terminal, on a fresh project:

```
install     jin_your_install_id
form        next
hosts       acme.example
files       proxy.ts, instrumentation.ts, .env.local
env         JOURNEYS_INSTALL_ID (vercel: production, preview, development); JOURNEYS_SALT (vercel: production, preview, development); JOURNEYS_INSTALL_KEY (vercel: production, preview, development); JOURNEYS_INSTALL_ID (.env.local); JOURNEYS_SALT (.env.local); JOURNEYS_INSTALL_KEY (.env.local)
claim       https://console.tryscope.com/journeys/claim/...
next        deploy a preview, then run `journeys doctor --url <preview url>`; open the claim URL to bind the install to your account
```

Then commit, deploy a preview as you always do, and [verify](/doctor):

```
npx scope-journeys doctor --url https://<your preview url>
```

Open the claim URL to [bind the install to your account](/claim).

## Flags

| flag | meaning |
|---|---|
| `--key` | an install key even when the project's OIDC federation is available |
| `--oidc` | require the OIDC form; exit 4 when the token is not at hand |
| `--hosts a.example,b.example` | the product hosts the install observes (asked when absent) |
| `--docs-host docs.example` | the documentation host, or `same` when the docs live on the product host (asked when absent) |
| `--host h` | observe only this host (`JOURNEYS_HOST`); other hosts pass through untouched |
| `--api-url u` | Scope's API (the default is the production host) |
| `--environment production\|preview\|development` | the install's environment |
| `--yes` | take every default without asking |
| `--json` | one JSON object on stdout (the default when stdout is not a terminal); never the key or the salt |

Exit codes: 0 done; 2 not a Next project (or Next below 15); 3 the proxy file needs the two lines by hand (printed); 4 the OIDC form was required and is unavailable; 5 Scope refused or was unreachable; 6 `.env.local` is not ignored, so no secret was written.

## What it writes

`proxy.ts` on a fresh project:

```ts
import { withJourneys } from "scope-journeys-next"

export default withJourneys()

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

An existing proxy keeps running exactly where it ran: the default export is wrapped as `next`, which runs for the inner hop (the request the sensor forwards to your own address, marked `x-journeys-inner: 1`) and for hosts the install does not observe, and the matcher is merged.

```ts
import { withJourneys } from "scope-journeys-next"

async function previous(request: NextRequest) { /* your logic */ }

export default withJourneys({ next: previous })
```

The hop goes to the address Next built `request.url` on (your deployment's host on Vercel, `localhost:<port>` under `next start`), or to `JOURNEYS_ORIGIN`, with the agent's headers as received, `x-forwarded-host` and `x-forwarded-proto` among them, and asks for an uncompressed answer (`accept-encoding: identity`; your platform compresses the answer to the agent as before). The host on every record (`server.address`, the `{host}` the rules fill, the authority a signature is verified against) is the one the agent spoke to: `x-forwarded-host` as Vercel's edge or the proxy in front of `next start` set it (Next fills it from `Host` when nothing did), never the listen address. `JOURNEYS_HOST` is matched against the same host.

`instrumentation.ts` gains one line, so an error in the sensor is reported with its class and never thrown at your app:

```ts
export { onRequestError } from "scope-journeys-next/instrumentation"
```

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_your_install_id` |
| `JOURNEYS_INSTALL_KEY` | yes | the install key; not needed when the project's OIDC federation is on |
| `JOURNEYS_SALT` | yes | 32 random bytes generated on your machine; every hash is salted with it and Scope never receives it |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host) |
| `JOURNEYS_HOST` | no | optional: observe only this host |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |

`init` writes them to the Vercel project (production, preview, development) when the project is linked and you are logged in, and to `.env.local` when that file is ignored by git. Without a key, the sensor authenticates with your Vercel project's OIDC token (`x-vercel-oidc-token`): turn on "Secure backend access with OIDC federation" in the project's settings; `init` binds the subject.

## The assertion key

`init` also generated an ES256 key pair on your machine: the public half is registered with Scope, the private half is `JOURNEYS_ASSERTION_KEY` (a JWK carrying its `kid`, `<install id>:1`) beside the install key and the salt. When the policy's assertion is on, every request the sensor forwards carries `x-scope-assertion`, signed with it, so your app can verify what the sensor saw: [Verify: the assertion in Next](/verify/next). Every six weeks:

```
npx scope-journeys rotate-assertion-key
```

registers a new public key, writes the new private key where `init` wrote the first and prints the overlap deadline; the previous key verifies for seven more days.

## Rotating the salt

`JOURNEYS_SALT` is yours and never reaches Scope. `npx scope-journeys rotate-salt` advances the install's salt epoch first (every sensor stamps the new epoch within a minute), then writes a new salt where `init` wrote the first and tells you to deploy; records between the bump and the deploy carry the new epoch with the old salt and join nothing after the deploy, and journeys never join across epochs. The console shows the rotation's date for 30 days.

## How it fails

| failure | behaviour |
|---|---|
| the sensor throws | the request is handed to your app untouched; the record carries the error's class |
| no install id (and no policy URL) | one log line naming `journeys init`; every request goes to your logic with no inner hop, the probe is still answered |
| no salt | one log line naming `journeys init`; every request passes through under the forward-only default |
| the policy fetch fails | the last good policy, or the embedded forward-only default |
| Scope's ingest is down | the record is dropped after one retry and counted; nothing waits |

## Remove it

```
npx scope-journeys uninstall
```

reverses every write of `init` (the created proxy file is deleted, a wrapped one is unwrapped, the instrumentation line and the dependency are removed) and never calls Scope. It prints the `vercel env rm` lines for the variables it set on the project.
