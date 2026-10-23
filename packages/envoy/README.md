# scope-journeys-envoy

Scope Journeys as an Envoy external processor, for Envoy and the meshes built on it (Istio's `EnvoyFilter`): a gRPC service implementing `envoy.service.ext_proc.v3.ExternalProcessor` behind the `ext_proc` filter. The core is `scope-journeys`; this package binds it to the stream Envoy sends (the request's headers and body, the response's headers and body) and answers each message with a mutation or an immediate response.

What this form does not do, stated first: a streamed response body (a server-sent event stream, the MCP transport's) is forwarded as it arrives and never rewritten. The gate's `declare_intent` is answered and recorded, but its amendment of a streamed `tools/list` and the local answers it would append to a streamed batch are not applied; the record carries the decision `skipped` with the reason `streamed_body`, so the console shows what the form did not do. Buffered answers (pages, JSON answers) are rewritten as on every other form.

## Install

```
npx scope-journeys init --envoy --hosts api.example.com --docs-host docs.example.com [--config envoy.yaml] [--processor journeys-ext-proc:9000]
```

creates the install, writes the processor's variables to `.env.local`, writes `journeys/envoy.journeys.yaml` (the filter and its cluster) and `journeys/istio.journeys.yaml` (the `EnvoyFilter` twin), and applies the fragment to `--config` when given: the filter under `http_filters` before the router, the cluster under `clusters`. `--dry-run` prints the result and writes nothing. The processor runs beside Envoy:

```
npx scope-journeys-envoy            # or: docker run --env-file .env.local -p 9000:9000 ghcr.io/tryscope/scope-journeys-envoy:<version>
```

## Observability mode, then live

Every install starts with every rule dry run, so the filter is written with `observability_mode: true`: Envoy sends the messages and does not wait for answers, the request path pays nothing, and the processor only records and ships. The first rule flipped live in the console prints the one change (`init --envoy --dry-run --live` prints it too): `observability_mode` off, `request_body_mode` and `response_body_mode` `NONE` (the processor asks for a body per route through `allow_mode_override`), and a reload.

## Variables

| name | secret | meaning |
|---|---|---|
| `JOURNEYS_INSTALL_ID` | no | your install, `jin_...`; the policy is signed for it, so without it the sensor runs the embedded default |
| `JOURNEYS_INSTALL_KEY` | yes | the install key |
| `JOURNEYS_SALT` | yes | 32 random bytes you generate; every hash is salted with it and Scope never receives it |
| `JOURNEYS_ASSERTION_KEY` | yes | the ES256 key that signs `x-scope-assertion` on the hop |
| `JOURNEYS_API_URL` | no | Scope's API (the default is the production host); https only, http only to the loopback (`localhost`, `127.0.0.1`, `[::1]`) |
| `JOURNEYS_NAME` | no | the `Via` pseudonym; default `scope-journeys` |
| `JOURNEYS_TRUST_PROXY` | no | the number of proxies in front of Envoy that append to `x-forwarded-for`; `1` by default, `2` for a CDN in front of a load balancer |
| `JOURNEYS_EXT_PROC_LISTEN` | no | the gRPC listen address; `0.0.0.0:9000` by default |

## What the stream gives

The client's address from `x-envoy-external-address` when the listener sets it, else the `x-forwarded-for` entry the proxies in front of Envoy appended (`JOURNEYS_TRUST_PROXY` counts them, one by default), never one the visitor wrote before it; `x-request-id` as the platform's request id. The AS number, the country, the colo, JA4, the TLS fingerprint and the TLS and HTTP versions are null on this form.

## How it fails

The filter is written with `failure_mode_allow: true` and `message_timeout: 2s`: a processor that is down, slow or wrong lets the request through untouched. Inside the processor every failure on a message answers `CONTINUE` and is logged. Shipping is the Worker's contract: one retry (after `Retry-After`, capped, on a 429), then the batch is dropped and counted.

What it records is in `TELEMETRY.md` of `scope-journeys`; the data-handling statement is `SECURITY.md`. The guide: https://journeys.tryscope.com/install/envoy. The protos under `proto/` are trimmed from Envoy's api tree (Apache License 2.0, `proto/LICENSE`).
