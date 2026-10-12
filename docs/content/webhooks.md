# Webhooks

Six things happen in a journey that your systems may want to hear the moment they happen. Each is an event: stored once, listed by `GET /v1/events`, and posted to every endpoint you subscribe, signed with that endpoint's secret.

| kind | subject | what arrives in `data` |
|---|---|---|
| `install.claimed` | `jin_...` | `{customer_id, form, hosts, environment, actor}` |
| `install.activated` | `jin_...` | `{first_record_at}`, the first record of a claimed install |
| `install.stalled` | `jin_...` | `{last_record_at}`, once per 24 hours of silence |
| `policy.promoted` | `pol_...` | `{customer_id, version, previous_version, actor}` |
| `journey.staged` | `jrn_...` | `{stage, at, agent: {name, named_by}}`, the journey reached a stage |
| `visit.closed` | `vis_...` | `{journey_id, agent, started_at, ended_at, reads, steps, intents, outcome}` |

The exact shapes are the `JourneyWebhookDelivery` schema of the [API reference](/api), under the document's `webhooks` section.

## Subscribing

An endpoint is a resource: `POST /v1/webhook_endpoints` with the https URL and the kinds it should hear (an empty list hears every public kind). The answer carries the endpoint and, once, its signing secret; every later read shows `secret_id`, the first sixteen hex characters of the secret's SHA-256, so you can tell which secret an endpoint holds without ever reading it back. A lost secret means a new endpoint.

```
POST /v1/webhook_endpoints
Idempotency-Key: <uuid v4>
{"url": "https://hooks.example.com/scope", "kinds": ["visit.closed", "journey.staged"]}
```

The URL is https on a public hostname: an IP literal, `localhost`, a `.local` or `.internal` name, or a bare name is refused with `webhook_url_invalid` and the reason. A kind outside the vocabulary is refused with `webhook_kind_unknown`. An API key subscribes the one customer it is scoped to; the console's Settings page, under Webhooks, does the same for the customer it shows, with the secret shown once and copied from there.

`GET /v1/webhook_endpoints` lists your endpoints with what the delivery ledger says about each: `last_delivery_at`, `last_attempt` (its time, the status code your endpoint answered or null when it did not answer, and the error), and `pending`, the deliveries not yet acknowledged. `POST /v1/webhook_endpoints/{id}` with `{"active": false}` turns one off (it hears nothing until turned on; what it is already owed keeps retrying) or `{"kinds": [...]}` replaces the kinds.

## What a delivery looks like

One `POST` per event, `content-type: application/json`:

```json
{
  "id": "4d3e2c1b-0a9f-4e8d-9c7b-6a5f4e3d2c1b",
  "kind": "visit.closed",
  "subject_ref": "vis_22ac9c73e519081f58bead",
  "occurred_at": "2026-10-10T04:50:18.054+00:00",
  "tenant_id": "ten_...",
  "customer_id": "cus_...",
  "data": {
    "journey_id": "jrn_6e4a079aee7fb0ea786eae",
    "agent": { "name": "cursor", "named_by": "declared", "evidence": ["declare_intent"] },
    "started_at": "2026-10-10T04:46:44.13+00:00",
    "ended_at": "2026-10-10T04:50:18.054+00:00",
    "reads": 7, "steps": 61, "intents": 6,
    "outcome": "mcp"
  }
}
```

with the headers `scope-event-id`, `scope-event-kind` and `scope-signature`. `customer_id` names the customer the event is about (null for a platform event of the tenant). Any `2xx` acknowledges. Anything else, or no answer within ten seconds, is retried: after 60 seconds, then doubling, at most an hour apart, ten attempts in all.

| attempt | waits |
|---|---|
| 2 | 60 s |
| 3 | 2 min |
| 4 | 4 min |
| 5 | 8 min |
| 6 | 16 min |
| 7 | 32 min |
| 8 to 10 | 1 h |

After the tenth attempt the delivery is marked failed; the event itself stays listed by the catch-up read.

## Testing an endpoint

`POST /v1/webhook_endpoints/{id}` with `{"send_test": "visit.closed"}` (the Settings card's "Send a test visit.closed") delivers one synthetic `visit.closed` to that endpoint alone, whether or not it is active. Its `data.test` is `true`, its subject starts with `vis_test_` and is never a real visit, and the catch-up read never lists it. Read the endpoint back a moment later: `last_delivery_at` moves when your receiver answered 2xx, `last_attempt` says what it answered otherwise.

## Verifying the signature

`scope-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, where `body` is the raw bytes you received. Five lines of Node:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const parts = Object.fromEntries(request.headers["scope-signature"].split(",").map((p) => p.split("=", 2)));
if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error("stale");
const expected = createHmac("sha256", process.env.SCOPE_WEBHOOK_SECRET).update(`${parts.t}.${rawBody}`).digest("hex");
if (!timingSafeEqual(Buffer.from(parts.v1, "hex"), Buffer.from(expected, "hex"))) throw new Error("bad signature");
```

Compare the raw body, not a re-serialised one; the timestamp is inside the signed string, so a replay outside five minutes fails on its own.

## Catching up

Missed deliveries are never lost: every event is listed, oldest first, by the catch-up read. From an instant, one kind at a time:

```
GET /v1/events?since=2026-10-10T00:00:00Z&kinds[]=visit.closed
```

The answer carries `data[]`, `has_more` and `next_cursor`; walk `starting_after=<next_cursor>` until `has_more` is false. `since` and `starting_after` are exclusive. An API key with `events:read` lists the events of the customer it is scoped to; a console session lists its tenant's, or one customer's with `customer=`. Every row carries `customer_id`; a test delivery is never listed.
