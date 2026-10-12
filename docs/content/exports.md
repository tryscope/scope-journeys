# Exports

A window of your journeys leaves Scope as a package you can read without Scope: `POST /v1/data-exports` with a kind, a customer and a window queues one export; the Exports page lists it when the package is ready, and `GET /v1/data-exports` says the same. Three kinds, one manifest.

```
POST /v1/data-exports
Idempotency-Key: <uuid>
{"customer": "cus_...", "kind": "journeys.derived", "since": "2026-10-01T00:00:00Z", "until": "2026-10-11T00:00:00Z"}
```

The window is half open: `since` inclusive, `until` exclusive. The same request by the same person while its export is still queued or running answers that export instead of a second one.

## `journeys.intents`: a task set

What agents said they were doing, as the tasks a measurement runs. `tasks.json` is an array, one task per distinct sentence (distinct after lowercasing, trimming and collapsing whitespace), in the shape a campaign spec takes:

```json
[
  {
    "prompt": "Add a Zap that posts to Slack when a row lands in Sheets",
    "capability": "mcp",
    "mode": "usability",
    "notes": "source: vis_...; declared_at: 2026-10-05T10:00:00.000Z; agent: codex; source_kind: gate; duplicates: 2"
  }
]
```

`prompt` is the sentence as the first agent said it, never rewritten. `capability` is the declaration's task when it carried one, otherwise the surface the declaration came through (`mcp` for the gate, `api` for the header, the SDK and the CLI, `docs` for the finder). `notes` names the visit, the time, the agent, the source and how many later declarations collapsed into the task.

## `journeys.raw`: the batches as shipped

Your audit trail and the input a re-derivation needs: every batch your sensors sent inside the window, byte for byte, as `raw/<install_id>/<yyyy-mm-dd>/<batch_id>.jsonl.gz` (one gzip per batch, the records one per line, `scope.request/1` and `scope.declaration/1` as the sensor wrote them), plus `batches.csv`:

```
batch_id,install_id,received_at,record_count,accepted_count,rejected_count,bytes
```

A batch older than the hot window is read from the day's pack through its index; the bytes are the same.

## `journeys.derived`: the journeys as the reads project them

`journeys.jsonl` (`scope.journey/1`), `visits.jsonl` (`scope.visit/1`, the whole visit with its reads and steps) and `intents.jsonl` (`scope.intent/1`), one row per line, sorted by id, exactly what `GET /v1/journeys`, `GET /v1/visits/{id}` and `GET /v1/intents` answer. A journey is in the window when it was last seen after `since` and first seen before `until`; a visit when it started inside the window; an intent when it was declared inside it. Nothing internal is in a row: no tenant, no generation, no update time.

`calibration.csv` carries the measured precision behind every confidence label in the package, one row per stitcher version, join kind and cohort:

```
stitcher_version,join_kind,cohort,right_count,total_count,precision,measured_at,cells
```

## The manifest

Every package carries `manifest.json`:

| field | meaning |
|---|---|
| `kind` | the export kind |
| `customer_id`, `installs` | the customer and the installs the rows came from |
| `window` | `{since, until}` as normalized |
| `watermark` | the newest batch the ingest had accepted before `until`; the same watermark means the same input |
| `generated_at` | when the package was built; the only value that moves between two exports of the same watermark |
| `stitcher_versions` | the versions that derived the rows |
| `contract_version` | the API contract the request was accepted under |
| `query` | the reads the package came from and the filters applied |
| `counts` | per kind: `intents`, `tasks`, `duplicates`; `batches`, `bytes`, `records`; `journeys`, `visits`, `intents`, `calibration_rows`; and `row_counts` per file |
| `redaction` | what the source never held: no raw address, credential, cookie or body text |
| `files` | every data file with its schema, its rows and its bytes |

## Reproducible

The same request at the same watermark produces the same bytes: every list is sorted by id, nothing of the export's own clock is written into a data file, and the package's manifest names the watermark so you can tell two exports apart by their input rather than by their time. Verify a package by hashing its files against `files[]`.
