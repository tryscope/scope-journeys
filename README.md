# Scope Journeys

A small observer in front of your documentation host and your API and MCP host. It forwards every request to your origin unchanged in substance and reports a hashed summary of the request and the answer to Scope, so that Scope can show you how coding agents (Claude Code, Codex, Cursor) find, install, sign in to and use your product, and with what intent.

Five packages, one core:

- `scope-journeys`: the core (pure functions over `Request` and `Response` and a policy) and the `journeys` CLI.
- `scope-journeys-cloudflare`: the Worker adapter, for a product that already fronts itself with Cloudflare.
- `scope-journeys-next`: the in-app adapter, one condition in the proxy file of a Next application, for a product hosted on Vercel.
- `scope-journeys-node`: the Node adapter, an Express, Fastify or Hono mount in the app you have, or the standalone proxy (`journeys proxy`) in front of an origin you do not run.
- `scope-journeys-envoy`: the Envoy adapter, an external processor behind the `ext_proc` filter of the Envoy or Istio you already run (also the image `ghcr.io/tryscope/scope-journeys-envoy`).

## Install

The Next form, in your project:

```
npm install scope-journeys scope-journeys-next
npx journeys init
```

The Cloudflare form, with `wrangler` logged in to your account:

```
npm install scope-journeys scope-journeys-cloudflare
npx journeys init --cloudflare --host docs.example.com --host api.example.com
```

The Node form, in an Express, Fastify or Hono app, or as the standalone proxy:

```
npm install scope-journeys scope-journeys-node
npx journeys init --node --hosts api.example.com --docs-host docs.example.com
npx journeys proxy --origin https://docs.example.com --listen :8080
```

The Envoy form, beside the Envoy or Istio you already run:

```
npm install scope-journeys scope-journeys-envoy
npx journeys init --envoy --hosts api.example.com --docs-host docs.example.com --config envoy.yaml
npx journeys-ext-proc
```

Or hand the sentence to your coding agent: "Install Scope Journeys on this project and confirm it sees traffic". The agent runs `init`, deploys a preview, runs `journeys doctor` and hands you the claim link. The only human steps are the claim click and the merge.

## The three forms

**Worker on your CDN.** One script, two variables, one secret, DNS proxied; it sees everything on the hosts it fronts and the facts Cloudflare knows about the client. Nothing the agent can feel.

**In-app proxy.** One package, one condition in the `proxy.ts` you already have, two variables; the key the site holds, or on Vercel your project's OIDC identity with no key at all. One inner hop to your own host, marked as such so your app logs the request once.

**Node.** One mount in an Express, Fastify or Hono app (the same inner hop, to the app's own listener), or one binary in front of an origin you do not run. The socket's facts in place of a CDN's: the AS number, the country and JA4 are null on this form.

**Envoy.** The `ext_proc` filter on the Envoy or Istio you already run and a processor beside it, in observability mode until the first rule is live. A streamed response body is never rewritten on this form.

**Connectors.** Your platform's own request log (a Vercel drain, Cloudflare Logpush) as a first day with no code deployed: the request log and nothing more.

## What it does to your traffic

On every request it forwards to your origin it adds a `Via` header naming itself, and it removes hop-by-hop headers and the client's `accept-encoding` and `content-length` as a conforming gateway does. Beside fetching its policy from Scope and shipping records to it, its one request of its own is the key directory of a signer the policy's `signers` list names (by default Exa's crawler and ChatGPT), fetched to verify a Web Bot Auth signature and cached for an hour; a signature from any other signer is recorded and causes no request. Where your traffic, records and install key go comes only from your own configuration, never from the policy; nothing ships without your install's key or, on Vercel, your project's OIDC identity. The policy cannot name a credential-carrying header such as `Authorization` or `Cookie` for recording, may add only its own `x-` headers on the hop, and the text a rule adds holds only plain text, its codes, a short list of tags and links to your own site. Nothing else changes until you turn a rule live in the console: every rule is dry run when you install it, computing what it would do, recording it and changing nothing on the wire. A live rule applies only where your surface map names: `inject` and `notfound` on the documentation paths the map lists, `finder` and `gate` on their exact routes, `error` on its route pattern; a path the map does not name is never changed by any rule, whoever the reader is. A live rule may: add a short reference code (`?ref=...`) to the links, the install command and the MCP URL on a mapped documentation page, and a setup and intent header line to the API samples on that page; list a tool named `declare_intent` first in your MCP server's tool list, which it answers itself with a fixed acknowledgement and never forwards to your server; answer the documentation-finder route (`/api/docs/find`) itself with links to your guides; answer a mapped documentation path your origin does not have with a page listing your real guides (the status stays 404); append "Guide: <link>" to your API's own error messages for the statuses you choose. Nothing else in any response is changed. Every change is served to people and agents alike, there is no agent-only answer, and each one is visible to the agent, the person using it, and to you in the console. When its own forward to your origin fails after the request left, it answers 502, or 504 on the 30-second timeout, rather than sending the request again; the Node form resends only a GET, HEAD, OPTIONS, PUT or DELETE whose kept-alive connection was reset before any answer.

## Read before you install

- `packages/core/TELEMETRY.md`: every field the sensor records, generated from the record schema.
- `SECURITY.md`: the data-handling statement, how to verify a release's provenance, how to report a vulnerability.
- https://journeys.tryscope.com: the guides, each with a markdown twin, `llms.txt` and the agent skill.

## The docs

Every page is at `https://journeys.tryscope.com/<path>`, as markdown at `/<path>.md`; the source is `docs/content/`.

- Install: [Next on Vercel](https://journeys.tryscope.com/install/next), [a Cloudflare zone](https://journeys.tryscope.com/install/cloudflare), [Node or the standalone proxy](https://journeys.tryscope.com/install/node), [Envoy or Istio](https://journeys.tryscope.com/install/envoy), [connectors](https://journeys.tryscope.com/install/connectors), [by your coding agent](https://journeys.tryscope.com/install/agent).
- Verify: [journeys doctor](https://journeys.tryscope.com/doctor), [the claim](https://journeys.tryscope.com/claim).
- Reference: [data handling](https://journeys.tryscope.com/data-handling), [telemetry](https://journeys.tryscope.com/telemetry), [CLI](https://journeys.tryscope.com/cli), [API](https://journeys.tryscope.com/api), [security](https://journeys.tryscope.com/security), [changelog](https://journeys.tryscope.com/changelog), [deprecation](https://journeys.tryscope.com/deprecation).
- Policy: [the document, the six rule kinds, the mode semantics](https://journeys.tryscope.com/policy).
- For agents: [llms.txt](https://journeys.tryscope.com/llms.txt), [SKILL.md](https://journeys.tryscope.com/SKILL.md) (`npx skills add https://journeys.tryscope.com`); `packages/core/SKILL.md` is the same file.

## Licence

Elastic License 2.0. The source is readable and the packages are published with provenance from this repository's own workflow; see `LICENSE`.
