# Install: Envoy or Istio (ext_proc)

This form does not rewrite a streamed response body. A server-sent event stream (the MCP transport's) is forwarded as it arrives: the gate still answers `declare_intent` and records the declaration, but its amendment of a streamed `tools/list` and the local answers it would append to a streamed batch are not applied, and the record says so (`skipped`, `streamed_body`). Pages, JSON answers and errors are rewritten as on every other form. Everything else the sensor records, it records here.

The sensor runs as an external processor beside your Envoy (or your Istio ingress gateway): a small gRPC service the `ext_proc` filter talks to for every request, receiving the headers and, on the routes that need it, the body, and answering with what to change.

```
npx scope-journeys init --envoy --hosts api.example.com --docs-host docs.example.com --config envoy.yaml
```

What it prints on a terminal:

```
install     jin_your_install_id
form        envoy (processor journeys-ext-proc:9000, observability mode)
hosts       api.example.com, docs.example.com
files       journeys/envoy.journeys.yaml, journeys/istio.journeys.yaml, envoy.yaml, .env.local
env         JOURNEYS_INSTALL_ID (.env.local); JOURNEYS_SALT (.env.local); JOURNEYS_INSTALL_KEY (.env.local); JOURNEYS_ASSERTION_KEY (.env.local)
pending     set on the processor's deployment, from .env.local: JOURNEYS_INSTALL_ID, JOURNEYS_SALT, JOURNEYS_INSTALL_KEY, JOURNEYS_ASSERTION_KEY
              JOURNEYS_EXT_PROC_LISTEN=0.0.0.0:9000   # the port the cluster names
claim       https://console.tryscope.com/journeys/claim/...
next        run the processor (npx scope-journeys-envoy, or the image ghcr.io/tryscope/scope-journeys-envoy:<version>) with the variables, reload Envoy with the filter, then run `journeys doctor --url https://api.example.com`; open the claim URL to bind the install to your account
```

`--config` names the `envoy.yaml` the fragment is applied to (the filter under `http_filters` before the router, the cluster under `clusters`); without it the fragment is written to `journeys/envoy.journeys.yaml` for you to merge, and `journeys/istio.journeys.yaml` is the `EnvoyFilter` twin for an Istio ingress gateway. `--processor host:port` is the address Envoy reaches the processor at (`journeys-ext-proc:9000` by default: a sidecar or a service of that name). `--dry-run` prints the result and writes nothing; a configuration whose shape is not understood is exit 3 with the fragment printed.

## The filter

```yaml
- name: envoy.filters.http.ext_proc
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.ext_proc.v3.ExternalProcessor
    grpc_service:
      envoy_grpc: { cluster_name: journeys_ext_proc }
      timeout: 2s
    processing_mode:
      request_header_mode: SEND
      response_header_mode: SEND
      request_body_mode: STREAMED
      response_body_mode: STREAMED
      request_trailer_mode: SKIP
      response_trailer_mode: SKIP
    failure_mode_allow: true
    message_timeout: 2s
    allow_mode_override: false
    observability_mode: true
```

Every install starts with every rule dry run, so the filter starts in observability mode: Envoy sends the messages and does not wait for the answers, the request path pays nothing, and the processor only records and ships. The first rule flipped live in the console prints the one change, which `init --envoy --dry-run --live` prints too: `observability_mode` off, the two body modes `NONE` (the processor asks for a body per route through `allow_mode_override: true`: the API, the MCP server and the finder are buffered, pages are buffered on the way back, a stream is streamed, everything else flows), and a reload. The cluster is the processor over HTTP/2:

```yaml
- name: journeys_ext_proc
  type: STRICT_DNS
  dns_lookup_family: V4_PREFERRED
  lb_policy: ROUND_ROBIN
  typed_extension_protocol_options:
    envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
      "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
      explicit_http_config: { http2_protocol_options: {} }
  load_assignment:
    cluster_name: journeys_ext_proc
    endpoints:
      - lb_endpoints:
          - endpoint: { address: { socket_address: { address: journeys-ext-proc, port_value: 9000 } } }
```

Set `per_connection_buffer_limit_bytes: 4194304` on the listener: a buffered page is held whole, and the largest page the sensor was measured on was 212 KB.

## The processor

```
npx scope-journeys-envoy
```

reads the variables from the environment and from `.env.local` in the working directory, listens on `JOURNEYS_EXT_PROC_LISTEN` (`0.0.0.0:9000`), and drains on `SIGTERM`. The container image `ghcr.io/tryscope/scope-journeys-envoy:<version>` is the same processor, published with the packages at the same version; run it with `--env-file .env.local`.

## What the stream gives

The client's address from `x-envoy-external-address` when the listener sets it, else the first `x-forwarded-for`; `x-request-id`, which Envoy sets, as the platform's request id. The AS number, the organisation, the country, the colo, the JA4 digest, the TLS fingerprint and the TLS and HTTP versions are null on this form. Joins lose nothing; the behaviour columns lose the network kind.

## What it does to your traffic

On every request Envoy forwards, the processor asks for the `Via` header naming the sensor, the policy's forward headers, the assertion when the policy asks for it, and the removal of `accept-encoding`; the hop itself is Envoy's. A body the gate shortened (a batch whose declarations it answered) is replaced before it reaches the origin. On the way back, a page or a JSON answer a live rule rewrote is replaced whole, with `content-length` left for Envoy to recompute.

## How it fails

| failure | behaviour |
|---|---|
| the processor is down, slow (2 seconds per message) or answers something Envoy refuses | `failure_mode_allow: true`: the request reaches the origin untouched |
| the sensor throws on a message | the processor answers `CONTINUE` for that message and logs the cause; the request proceeds untouched |
| no install id or no salt | one log line naming `journeys init --envoy`; every request passes through under the forward-only default |
| the policy fetch fails | the last good policy, or the embedded forward-only default |
| Scope's ingest is down, or answers 429 | one retry (after `Retry-After`, capped at 60 seconds, on a 429), then the record is dropped and counted; nothing waits |

## Remove it

```
npx scope-journeys uninstall --envoy
```

restores the `envoy.yaml` the fragment was applied to, removes the written fragments and the lock, and never calls Scope. Reload Envoy, stop the processor, remove the `JOURNEYS_*` lines from `.env.local` and from its deployment.
