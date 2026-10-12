# Connect Cloudflare Logpush

A zone on Cloudflare can push its HTTP request log to Scope with a Logpush job. Each line becomes a
request record with `source: drain`: the path with its query, the status, the client address (hashed
before it is stored), the user agent, the cache status, the colo, the AS number and the country, the
TLS and HTTP versions, the response facts, the ray id, and on zones with Bot Management the JA4
fingerprint and the verified bot category. The log carries no header, no body and no session id, so it
tells you who read what and when, not which agent took which step: **request log only, no sessions,
no intent**. It is the history before a sensor, and the half you have not fronted yet. For the
journeys, front the host with the sensor (on Cloudflare, the Worker); the log and the sensor join on
the ray id and the request is counted once.

## 1. Create the connector

In the console, Journeys, Installs, add a connector of kind Cloudflare. The console shows the
delivery URL (`https://<scope api>/v1/connectors/cloudflare?install=jin_...`) and, once, the secret
the job must send as its `Authorization` header. The secret is the connector's install key; it is
shown once and stored hashed.

Through the API:

```
POST /v1/connectors
Idempotency-Key: <uuid>
{ "customer": "cus_...", "kind": "cloudflare" }
```

The answer carries `connector.endpoint_url` and `secret`.

## 2. Create the Logpush job

A job on the zone for the `http_requests` dataset, delivering NDJSON, gzipped, in uploads of at most
5,000,000 bytes or 1,000 records every 30 seconds, with the secret as the `Authorization` header of
the destination URL. Through the API (`<api token>` is a Cloudflare token with Logs Edit on the
zone):

```
curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone id>/logpush/jobs" \
  -H "Authorization: Bearer <api token>" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "scope-journeys",
    "dataset": "http_requests",
    "enabled": true,
    "destination_conf": "https://<scope api>/v1/connectors/cloudflare?install=jin_...&header_Authorization=Bearer%20<secret>",
    "output_options": {
      "output_type": "ndjson",
      "timestamp_format": "rfc3339",
      "field_names": ["RayID", "EdgeStartTimestamp", "EdgeEndTimestamp", "ClientRequestMethod", "ClientRequestHost", "ClientRequestPath", "ClientRequestURI", "ClientRequestProtocol", "ClientSSLProtocol", "EdgeResponseStatus", "EdgeResponseContentType", "EdgeResponseBytes", "ClientRequestBytes", "ClientIP", "ClientRequestUserAgent", "CacheCacheStatus", "ClientASN", "ClientCountry", "EdgeColoCode", "JA4", "BotScore", "VerifiedBotCategory"]
    },
    "max_upload_bytes": 5000000,
    "max_upload_records": 1000,
    "max_upload_interval_seconds": 30
  }'
```

`JA4`, `BotScore` and `VerifiedBotCategory` are filled on zones with Bot Management and absent
otherwise; leave them in the list either way. Any timestamp format works (RFC 3339, unix seconds or
unix nanoseconds); RFC 3339 is the readable one.

## 3. Complete the ownership challenge

Cloudflare's first delivery to a new HTTP destination is an ownership challenge: a short file holding
a token rather than log lines. Scope answers it and keeps the token on the connector; the console
shows it on the connector's page under Challenge, and the API returns it as `connector.challenge.token`.
Paste it back to Cloudflare:

```
curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone id>/logpush/ownership/validate" \
  -H "Authorization: Bearer <api token>" \
  -H "Content-Type: application/json" \
  --data '{ "destination_conf": "<the destination_conf above, verbatim>", "ownership_challenge": "<the token>" }'
```

Then enable the job if it was created disabled. Deliveries start within a minute; the connector's
page shows the first and last record and the day's counts.

## 4. What the records carry

By name: `http.request.method`, `server.address` (`ClientRequestHost`), `url.path`
(`ClientRequestPath`), `url.query` (from `ClientRequestURI`; a `ref=` reference in it is kept as the
record's reference; secret-shaped values are hashed by your policy's shapes),
`http.response.status_code`, `scope.route` (from your policy's surface map), `scope.cache`,
`scope.client.colo`, `scope.client.asn`, `scope.client.country`, `scope.client.address_hash` and
`address_family` (the address hashed with Scope's drain salt, never stored raw),
`user_agent.original`, `scope.reader` (from the user agent alone), `tls.protocol.version`,
`network.protocol.version`, `http.response.header.content-type`, `scope.request.bytes`,
`scope.response.bytes`, `scope.timing.total_ms` (edge end minus edge start), `scope.client.ja4`,
`scope.platform_bot` (verified when Cloudflare names a category). Null by construction: every key, the
MCP session id, the carrier headers, the signature, both bodies, the response headers, the page
facts, a minted reference, the gateway; `decisions` is empty. A delivery of more than 500 lines is
stored in slices of 500; a redelivered line inserts nothing, because a record's id derives from the
ray id.

To stop, delete the job and revoke the connector in the console.
