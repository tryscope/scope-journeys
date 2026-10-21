# What Scope Journeys records

Generated from `schemas/request.json` and `schemas/declaration.json` by `scripts/telemetry-doc.mjs`; a field cannot ship without appearing here, and the privacy test fails when this file is stale.

**What it records.** For each request: method, host, path and query string, status, timing, the client's user agent, Accept and fetch-metadata headers, the network facts your platform exposes (AS number, country, TLS version, JA4), a one-way hash of the client's address, a one-way hash of any credential (bearer token, device code, install id), the MCP session id, the reference code if one was carried, and what the observer did. It never records a raw address or a raw credential; the hash is salted per installation and rotated on your request. It never records a text or HTML body. It records request and response bodies only on the routes you list, only the fields you allow, only up to 64 KB, with your secret value shapes hashed wherever they appear; in its lightest form it records no bodies at all. It never records cookies, the `Authorization` value or `Set-Cookie`.

**What it holds.** No secret of yours: the observer's own credential is an installation key you can rotate or revoke at any time, or, on Vercel, your project's OIDC identity with no key at all. Its configuration is a public document with no secret in it. It stores nothing on your infrastructure.

**How it fails.** Open, always: if the observer cannot reach Scope, cannot load its configuration, or encounters an error, your request is forwarded unchanged and your origin's answer is returned as it was. It never retries a report more than once and never delays a response to report.

**Where the data goes and for how long.** To Scope's ingest over HTTPS, batched after the response, signed; stored in your tenant for 90 days by default, with the raw batches kept append-only as the audit trail; exportable to your own OpenTelemetry collector as log records and traces; deletable with your tenant.

**The salt.** Every hash is `sha256(salt + ":" + value)` cut to twelve hexadecimal characters, with a salt you generate at install and Scope never receives. A hash is a join key inside your salt epoch and nothing else: Scope cannot reverse it, and you can re-hash a value you know to find it in your own records.

**Signatures.** A request carrying a Web Bot Auth signature (`Signature-Agent`, `Signature-Input`, `Signature`) is verified by the sensor itself against the host the agent spoke to (`server.address`) when its signer is on the policy's `signers` list (exact https origins; by default `https://crawler.exa.ai` and `https://chatgpt.com`), with the signer's public key fetched from that origin's directory (`/.well-known/http-message-signatures-directory`) and cached for an hour; that fetch is the only outbound request the sensor makes beside the hop to your origin, the policy fetch and the shipment to Scope, it never delays a request beyond two seconds, and a directory that could not be fetched is retried after a minute. A signature from a signer the list does not name causes no outbound request. The record carries `scope.signature` with `valid` and the reason: `verified`, `expired`, `not_yet_valid`, `unknown_key`, `directory_unreachable`, `bad_signature`, `unsupported_alg`, `authority_mismatch` (a good signature for a host this sensor does not serve), or `unlisted_signer`.

**Rules and decisions.** Every rule in your policy is `dry_run` when installed: the sensor computes what the rule would have done, records the decision with `outcome: would_apply` and the reason it would have had live, and changes nothing on the wire. A rule you flip to `live` records `applied` with the same reason. You can read every decision in the console's Debugger.

## The request record, `scope.request/1`

### identity

Present: every record.

| field | type | description |
|---|---|---|
| `schema` | const "scope.request/1" |  |
| `id` | string | UUIDv7 minted by the sensor; the record's identity and its idempotency key at the ingest |
| `ts` | string | when the request arrived at the sensor |
| `observed_ts` | string | when the record was complete (after the response went out; at the end of a stream) |
| `install` | prefixedId \| null | the install this sensor runs as; null only on a sensor with no install id (a lab deployment) |
| `source` | edge \| inapp \| node \| ext_proc \| drain | the form of the sensor that recorded this |
| `observer` | object |  |
| `observer.package` | string | the npm package of the adapter |
| `observer.version` | string | the package version (every package takes one version) |
| `observer.adapter` | string | cloudflare, next, node, envoy, drain-vercel, drain-cloudflare |
| `observer.policy_version` | integer | the policy version the sensor ran this request under; 0 is the embedded forward-only default |
| `observer.salt_epoch` | integer | the customer's salt epoch the hashes were made in; hashes never join across epochs |
| `observer.name` | string | the Via pseudonym |
| `request_id` | string \| null | the platform's own request id (cf-ray, x-vercel-id, x-amz-cf-id): the one key a connector's record and a sensor's record share |

### request and response

Present: every record.

| field | type | description |
|---|---|---|
| `http.request.method` | string |  |
| `server.address` | string | the host the agent spoke to (the sensor's), which is also a signature's authority |
| `url.path` | string | redacted by shape: a value of the product's signed shape is replaced by its hash |
| `url.query` | string \| null | the query string without the leading question mark, redacted by shape; references kept; null when the url has none |
| `http.response.status_code` | integer \| null |  |
| `scope.route` | docs \| docs_root \| download \| api \| mcp \| oauth.register \| oauth.authorize \| oauth.token \| oauth.approve \| device.start \| device.poll \| device.approve \| signup \| hooks.create \| hooks.catch \| credentials \| trial \| finder \| cli.init \| cli.beacon \| passthrough \| other | the surface role of the path, from the policy's surface map |
| `http.request.header.content-type` | string \| null |  |
| `http.response.header.content-type` | string \| null |  |
| `scope.request.bytes` | integer \| null | the request body's size in bytes, when the body was read |
| `scope.response.bytes` | integer \| null | the response body's size in bytes, when the body was read |
| `scope.cache` | string \| null | cf-cache-status or x-vercel-cache as seen on the origin's answer |
| `scope.timing` | object |  |
| `scope.timing.origin_ms` | integer \| null | the origin's answer time as seen from the sensor |
| `scope.timing.total_ms` | integer \| null | from arrival to the record's completion |

### client

Present: every record (the network facts when the platform exposes them).

| field | type | description |
|---|---|---|
| `scope.client.address_hash` | hash12 | a one-way hash of the client's address; the address itself never leaves |
| `scope.client.address_family` | ipv4 \| ipv6 \| null | so that a dual-stack client seen on two hosts can be read as such |
| `scope.client.asn` | integer \| null |  |
| `scope.client.as_org` | string \| null |  |
| `scope.client.country` | string \| null |  |
| `scope.client.colo` | string \| null | the edge location that served the request |
| `user_agent.original` | string |  |
| `scope.client.accept` | string \| null |  |
| `scope.client.fetch_metadata` | object | the browser signals a fetcher does not send: how a browser is told from a tool |
| `scope.client.fetch_metadata.sec_ch_ua` | boolean |  |
| `scope.client.fetch_metadata.sec_fetch_dest` | string \| null |  |
| `scope.client.fetch_metadata.sec_fetch_mode` | string \| null |  |
| `scope.client.fetch_metadata.upgrade_insecure` | boolean |  |
| `tls.protocol.version` | string \| null |  |
| `network.protocol.version` | string \| null |  |
| `scope.client.ja4` | string \| null | the TLS client fingerprint when the platform exposes it |
| `scope.client.tls_ext_sha1` | string \| null |  |
| `scope.client.tls_hello_len` | integer \| null |  |

### agent evidence

Present: when the request carries a signature, when the zone has bot management; the reader on every record.

| field | type | description |
|---|---|---|
| `scope.signature` | object \| null |  |
| `scope.signature.agent` | string | the Signature-Agent header: the origin that publishes the signing key |
| `scope.signature.keyid` | string \| null |  |
| `scope.signature.valid` | boolean | true only after the sensor verified the signature against the listed signer's key directory |
| `scope.signature.reason` | string \| null | verified, expired, not_yet_valid, unknown_key, directory_unreachable, bad_signature, unsupported_alg, authority_mismatch, or unlisted_signer (a signer the policy's signers do not list; no directory is fetched) |
| `scope.signature.authority` | string | the host the signature covers and is verified against (the sensor's) |
| `scope.platform_bot` | object \| null | the platform's verified-bot match, when the zone has bot management |
| `scope.platform_bot.verified` | boolean |  |
| `scope.platform_bot.name` | string \| null |  |
| `scope.platform_bot.category` | string \| null |  |
| `scope.platform_bot.signed_agent` | string \| null |  |
| `scope.reader` | claude-code \| claude-ai \| openai \| exa \| signed \| cursor \| vendor-client \| browser \| shell \| unknown | the reader family, from the signature, the agent string, Accept and the fetch metadata; vendor-client is the customer's own CLI or SDK by the policy's clients patterns |

### keys and carriers

Present: when the request carries the header, query parameter or body field.

| field | type | description |
|---|---|---|
| `scope.key.credential` | hash12 \| null | the hashed bearer of the Authorization header; the value never leaves |
| `scope.key.install` | hash12 \| null | the hashed install id the policy's install header carried |
| `scope.key.device_code` | hash12 \| null | the hashed device code of a device-flow start or poll, when bodies are recorded |
| `scope.key.user_code` | hash12 \| null | the hashed user code of a device-flow start or approval, when bodies are recorded |
| `scope.key.oauth_client` | hash12 \| null | the hashed OAuth client id of a registration, authorization, approval or token call, when bodies are recorded (the authorize query is read in every form) |
| `mcp.session.id` | string \| null | the MCP session id the request carried; the one the answer assigned is in scope.response.headers |
| `scope.key.hook` | string \| null | the id of a catch hook, from the catch path or the creation answer |
| `scope.key.reference` | reference \| null | the reference the request carried (query, setup header, body field named by the policy); only a value with the reference shape and check character counts, so another value in a reference parameter (a device user code in code= on a sign-in page) is not recorded here (the device door records it as scope.key.user_code) |
| `scope.key.setup_header` | string \| null | the policy's setup header as sent, redacted by shape |
| `scope.key.agent_header` | string \| null |  |
| `scope.key.client_header` | string \| null |  |
| `scope.key.intent_header` | string \| null | the policy's intent header as sent; a filled one is also a declaration |

### MCP and OAuth

Present: on the MCP and OAuth routes, in every form.

| field | type | description |
|---|---|---|
| `mcp.protocol.version` | string \| null |  |
| `mcp.method.name` | array of string | the JSON-RPC methods of the request's messages, in order; kept in every form |
| `scope.mcp.tools` | array of string | the tools the request called, in order; kept in every form |
| `scope.mcp.client` | object \| null | the client the MCP handshake named; kept in every form |
| `scope.mcp.client.name` | string |  |
| `scope.mcp.client.version` | string \| null |  |
| `scope.oauth` | object \| null | what an OAuth call named about itself; kept in every form |
| `scope.oauth.grant_type` | string \| null |  |
| `scope.oauth.client_name` | string \| null |  |
| `scope.oauth.client_id_url` | string \| null |  |
| `scope.oauth.resource` | string \| null |  |
| `scope.oauth.scope` | string \| null |  |

### bodies

Present: only on observed routes, only when the policy records bodies.

| field | type | description |
|---|---|---|
| `scope.body.request` | object \| array \| null | the request body on an observed route, parsed as JSON (an object, or an array for a JSON-RPC batch) or a form, redacted by field and by shape, capped at 64 KB; {bytes, type} for a text or HTML body; null in the no-bodies form |
| `scope.body.response` | object \| array \| null | the same for the origin's answer |
| `scope.body.truncated` | boolean | true when a body exceeded 64 KB and was cut before parsing |
| `scope.response.headers` | object \| null | the answer headers the stitcher needs: content-type, mcp-session-id, www-authenticate, location (redacted), cache-control, x-vercel-cache, cf-cache-status |

### page and rules

Present: on page reads and wherever a rule matched.

| field | type | description |
|---|---|---|
| `scope.page` | object \| null | present on a page read (a docs page, the root map, the helpful 404) |
| `scope.page.canonical` | string | the page's path without a face suffix |
| `scope.page.face` | html \| md \| txt \| 404-html \| 404-md |  |
| `scope.page.reference_minted` | reference \| null | the reference minted into this serve of the page, when an inject rule placed it |
| `scope.page.injected` | array of string | the labels of the inject rules that changed the page |
| `scope.page.bytes` | integer |  |
| `scope.reference_minted` | reference \| null | a reference minted into a non-page answer (an error link, a finder answer); a page's reference, the helpful 404's included, is scope.page.reference_minted |
| `scope.decision` | array of decision | what every rule that matched did, in rule order |
| `scope.gateway` | object \| null | on the MCP route: how many messages the gate answered and how many it forwarded |
| `scope.gateway.declared` | integer |  |
| `scope.gateway.forwarded` | integer |  |

### observer

Present: every record.

| field | type | description |
|---|---|---|
| `scope.observer.errors` | array of string | the sensor's own errors on this request, by class; the request was forwarded untouched |
| `scope.observer.dropped` | integer | records the sensor failed to ship since its last successful shipment |

## The declaration record, `scope.declaration/1`

An intent the sensor collected: from the declaration tool in front of the MCP route (gate), from the intent header on an API call (header), from the docs finder (finder), from the SDK's intent option (sdk) or the CLI (cli). Exported as an OTLP log record with event_name scope.intent. Shipped as its own record beside the request it rode on.

| field | type | description |
|---|---|---|
| `schema` | const "scope.declaration/1" |  |
| `id` | string | UUIDv7 minted by the sensor; the record's own identity and its idempotency key at the ingest |
| `ts` | string |  |
| `install` | prefixedId \| null | the install this sensor runs as; null only on a sensor with no install id (a lab deployment) |
| `request` | string \| null | the request record the declaration rode on, when one did |
| `source` | gate \| header \| finder \| sdk \| cli |  |
| `text` | string | the sentence the agent gave, verbatim |
| `task` | string \| null | the task category the agent chose, when the declaration tool asked for one |
| `found_via` | string \| null | how the agent says it found the product, when asked |
| `agent` | string \| null | the agent's own name for itself, when it gave one |
| `scope.client.address_hash` | hash12 |  |
| `scope.key.credential` | hash12 \| null | the hashed bearer of the call that carried the declaration |
| `mcp.session.id` | string \| null | the MCP session the declaration was made in |
| `scope.key.reference` | reference \| null | the page reference the call arrived with |
| `scope.reference_minted` | reference \| null | the reference minted into the finder's answer |

## The policy, `scope.policy/1`

The configuration the sensor fetches. Immutable integer versions per customer; public to the customer; holds no secret (the sensor's validator refuses a secret-shaped value). A sensor that does not know a section ignores it; a rule kind it does not know runs as a skipped decision.

| section | what it may contain |
|---|---|
| `schema` | const "scope.policy/1" |
| `version` | the customer's policy version; 0 is the embedded forward-only default |
| `about` | string |
| `origin` | the origin to forward to when the adapter has none configured (a Worker on workers.dev needs one; a route in the customer's zone does not) |
| `report` | object |
| `routes` | the regular-expression form: four expressions over the path plus the text faces; a policy with surfaces ignores every key but run_prefix |
| `surfaces` | the surface map: the roles of the product's paths, derived from the standards (MCP is one JSON-RPC endpoint carrying MCP-Session-Id and MCP-Protocol-Version; OAuth 2.1 names its registration (RFC 7591), authorization, token and device-authorization (RFC 8628) endpoints in its metadata documents (RFC 8414, RFC 9728); an API call carries a bearer) plus a short custom list. Classification precedence, first match wins: passthrough, custom (in order), finder, mcp, oauth.register, oauth.authorize, oauth.token, oauth.approve, device.start, device.poll, device.approve, hooks.create, hooks.catch, credentials, trial, cli.init, cli.beacon, signup, download, api, docs.llms and docs.root (docs_root), docs.paths (docs), else other. |
| `secrets` | object |
| `headers` | object |
| `forward` | object |
| `record_bodies` | false is the lightest form: bodies are read where a rule needs them and never leave |
| `observe` | reserved for the body allow list |
| `rules` | array of object |
| `assertion` | object |
| `signers` | the Web Bot Auth signers whose key directories the sensor fetches, each an exact https origin such as https://chatgpt.com (an entry that is not one is ignored and named in the notices); a signature from any other signer is recorded as unlisted_signer and causes no outbound request |
| `destinations` | array of object |
| `retention_days` | integer |
| `salt_epoch` | integer |

## The hashes and the references

A hash (`hash12`) is twelve lowercase hexadecimal characters. A reference is eight characters of the base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`: three encode the minting minute, four are random, one is a check character; it is minted per serve of a page and carries no information about the reader.
