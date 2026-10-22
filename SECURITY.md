# Security

This document is written so it can be handed to a security review as it stands. It contains nothing a customer who installs the sensor cannot already see.

## What it does

**What it is.** Scope Journeys is a small observer that sits in front of your documentation host and your API and MCP host, either as a script in your own CDN account or as one condition in the proxy file of your own application. It forwards every request to your origin unchanged in substance and reports a hashed summary of the request and the answer to Scope, so that Scope can show you how coding agents (Claude Code, Codex, Cursor) find, install, sign in to and use your product, and with what intent.

**What it adds to your traffic.** On every request it forwards to your origin it adds a `Via` header naming itself, and it removes hop-by-hop headers and the client's `accept-encoding` and `content-length` as a conforming gateway does. Beside fetching its policy from Scope and shipping records to it, its one request of its own is the key directory of a signer the policy's `signers` list names (by default Exa's crawler and ChatGPT), fetched to verify a Web Bot Auth signature and cached for an hour; a signature from any other signer is recorded and causes no request. Where your traffic, records and install key go comes only from your own configuration, never from the policy; nothing ships without your install's key or, on Vercel, your project's OIDC identity. The policy cannot name a credential-carrying header such as `Authorization` or `Cookie` for recording, may add only its own `x-` headers on the hop, and the text a rule adds holds only plain text, its codes, a short list of tags and links to your own site. Nothing else changes until you turn a rule live in the console: every rule is dry run when you install it, computing what it would do, recording it and changing nothing on the wire. A live rule applies only where your surface map names: `inject` and `notfound` on the documentation paths the map lists, `finder` and `gate` on their exact routes, `error` on its route pattern; a path the map does not name is never changed by any rule, whoever the reader is. A live rule may: add a short reference code (`?ref=...`) to the links, the install command and the MCP URL on a mapped documentation page, and a setup and intent header line to the API samples on that page; list a tool named `declare_intent` first in your MCP server's tool list, which it answers itself with a fixed acknowledgement and never forwards to your server; answer the documentation-finder route (`/api/docs/find`) itself with links to your guides; answer a mapped documentation path your origin does not have with a page listing your real guides (the status stays 404); append "Guide: <link>" to your API's own error messages for the statuses you choose. Nothing else in any response is changed. Every change is served to people and agents alike, there is no agent-only answer, and each one is visible to the agent, the person using it, and to you in the console.

**What it records.** For each request: method, host, path and query string, status, timing, the client's user agent, Accept and fetch-metadata headers, the network facts your platform exposes (AS number, country, TLS version, JA4), a one-way hash of the client's address, a one-way hash of any credential (bearer token, device code, install id) and of the MCP session id, the reference code if one was carried, the outcome of a Web Bot Auth signature check (the signer, its key id and the reason), the MCP method, tool and client names and the OAuth grant type, client name, resource and scope a call names, the intent an agent declares (redacted like a body), and what the observer did. It never records a raw address or a raw credential; every hash is salted per installation and rotated on your request, and an observer without its salt records and sends nothing. In the query string and the `Location` header, the value of a parameter named `api_key`, `key`, `token`, `access_token`, `refresh_token`, `id_token`, `code`, `client_secret`, `password`, `secret`, `signature`, `sig`, in any case or spelling (`apiKey`, `api-key`, percent-encoded or inside a URL carried by another parameter), is hashed under any policy, beside your secret value shapes; a valid reference code stays readable only in the parameters your policy says carry one. It never records a text or HTML body or the content of an event stream. It records request and response bodies only when your policy turns `record_bodies` on and lists fields in `observe.bodies.allow_fields`, and then only on the routes your surface map observes (the answer's body also on an error answer, status 400 or above, from any route it does not pass through), only up to 64 KB and only the fields you allow, with the values of your secret fields and of the secret names above, and your secret value shapes, hashed wherever they appear; in its lightest form it records no bodies at all, and that is the default. It never records cookies, the `Authorization` value or `Set-Cookie`. The field list is `TELEMETRY.md`, generated from the record schema.

**What it holds.** No secret of yours: the observer's own credential is an installation key you can rotate or revoke at any time, or, on Vercel, your project's OIDC identity with no key at all. Its configuration is a public document with no secret in it. It stores nothing on your infrastructure.

**How it fails.** Open, always: if the observer cannot reach Scope, cannot load its configuration, or encounters an error, your request is forwarded unchanged and your origin's answer is returned as it was. With no configuration it runs its built-in default, which changes nothing on the wire, and each record it makes says so. Without its salt it forwards every request untouched and sends nothing, and `journeys doctor` names the missing salt. It never retries a report more than once and never delays a response to report.

**Where the data goes and for how long.** To Scope's ingest over HTTPS after the response went out, one call per request, authenticated by your install key or, on Vercel, your project's OIDC identity; stored in your tenant for 90 days by default, with the raw batches kept append-only as the audit trail; exportable to your own OpenTelemetry collector as log records and traces; deletable with your tenant.

**How to remove it.** Delete the script or the condition; your product is as it was. Your data remains yours to export or delete.

**What it is not.** It is not a firewall, it blocks nothing; it is not an identity provider, it issues no credential and sits in no sign-in; it does not read transcripts; it does not host your MCP server.

## Supported versions

The current minor and the previous one receive fixes. A breaking change is deprecated first and the old path kept for two minors; the ingest warns an old observer in its answer, and the console shows the warning on the install.

## Reporting a vulnerability

Write to security@tryscope.app with the package name and version, what you found, and how to reproduce it. You receive an acknowledgement within 72 hours and a fix or a mitigation plan within the window the severity warrants. Please do not open a public issue for a vulnerability before it is fixed.

## What the observer holds

- No customer secret. The install key authorises the observer's own reports and nothing else; it is stored hashed on Scope's side, shown once, rotatable with a 24-hour overlap, revocable at once.
- The hash salt is yours. `init` generates it on your machine and writes it to your environment; Scope never receives it and cannot reverse a hash.
- The policy is public. It names routes, header names and rules; it may hold no secret, and the CLI, the ingest and the test suite refuse one that does.
- Nothing of Scope's stands in your request path: the observer is the package you installed, in your own account, project, process or proxy; no DNS record points at Scope and no certificate for your hostname is issued elsewhere. What leaves your infrastructure and what never does is stated in [the data-handling note](https://journeys.tryscope.com/data-handling).

## Verification

Every release is published from the repository's own workflow with npm provenance, so the registry attests which repository and which workflow built the tarball:

```
npm audit signatures
npm view scope-journeys --json | jq .dist.attestations
```

## Reading the source

The shipped `dist` is the TypeScript source with the types stripped: no bundling, no minification, no `eval`, no dynamic `require`. A coding agent asked to install the package is invited to read it, as is your review.
