# Scope Journeys

Scope Journeys is a small observer that sits in front of your documentation host and your API and MCP host, either as a script in your own CDN account or as one condition in the proxy file of your own application. It forwards every request to your origin unchanged in substance and reports a hashed summary of the request and the answer to Scope, so that Scope can show you how coding agents (Claude Code, Codex, Cursor) find, install, sign in to and use your product, and with what intent.

Nothing changes on your traffic until you ask: every rule is off ("dry run") when you install it. Nothing is hidden: every change a rule makes is visible to the agent, the person using it, and to you in the console. [Data handling](/data-handling) is the full statement, written for a security review.

## The five forms

**[Next on Vercel](/install/next).** One package, one condition in the `proxy.ts` you already have, two variables; the key the site holds, or your Vercel project's OIDC identity with no key at all. One inner hop to your own host, marked as such so your app logs the request once.

**[A Cloudflare zone](/install/cloudflare).** One Worker in your own account on a route per host, two variables, two secrets, DNS proxied; it sees everything on the hosts it fronts and the facts Cloudflare knows about the client.

**[Node: Express, Fastify, Hono, or the standalone proxy](/install/node).** One mount in the app you have (the same inner hop, to the app's own listener), or one binary in front of an origin you do not run. The socket's facts in place of a CDN's.

**[Envoy or Istio](/install/envoy).** The `ext_proc` filter on the proxy you already run and a small processor beside it; observability mode until the first rule is live. A streamed response is never rewritten on this form, and the page says so first.

**[Connectors](/install/connectors).** Your platform's own request log (a Vercel log drain, Cloudflare Logpush) as a first day with no code deployed: the request log and nothing more.

## One sentence for your coding agent

> Install Scope Journeys on this project and confirm it sees traffic.

The agent runs `init`, deploys a preview, runs `journeys doctor` and hands you the claim link. The only human steps are the claim click and the merge. [How that works](/install/agent); the recipe it follows is [SKILL.md](/SKILL.md).

## The three commands

```
npx scope-journeys init            # mount the sensor, print the claim URL
npx scope-journeys doctor          # one probe per host, the facts that arrived, the one fix
npx scope-journeys uninstall       # reverse every write; your product is as it was
```

Install id in every snippet on these pages: `jin_your_install_id`. Open any page with `?install=jin_...` to see your own.

## Read before you install

- [Data handling](/data-handling): what it adds to your traffic, what it records, what it holds, how it fails, how to remove it.
- [Telemetry](/telemetry): every field the sensor records, generated from the record schema.
- [Security](/security): how to verify a release's provenance, how to report a vulnerability.
- [Policy](/policy): the document that tells the sensor what to observe and what each rule may do, and the mode semantics.

Every page here is available as markdown: append `.md` to its URL or send `Accept: text/markdown`. The root map is [llms.txt](/llms.txt). The sensor documented here runs in front of this host.
