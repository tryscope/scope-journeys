# Policy

The policy is the document that tells the sensor what to observe and what each rule may do. It is public: it holds no secret, it is fetched by the sensor from `GET /v1/installs/{id}/policy` with an `ETag` and cached for sixty seconds, and the embedded default (version 0) observes and forwards only. The console edits it; a version is promoted, never edited in place, so the records always name the version that produced them (`observer.policy_version`).

**Every rule is dry run when installed; nothing changes until you flip it.** A rule in `dry_run` computes what it would do, records it in the request's decisions and changes nothing on the wire; the console shows the would-apply counts per rule. `live` applies it. Each rule can be live in some environments and dry run in the others (`environments`), so a rule goes live on preview before production.

**A live rule applies only where the surface map names.** `inject` and `notfound` act on the documentation paths the map lists (`docs.paths`, `docs.root`, `docs.llms`, a `custom` entry with a docs role), `finder` and `gate` on their exact routes, `error` on its route pattern. A path the map does not name is `other`: nothing is read from it and no rule changes it, whatever the origin serves and whoever the reader is. Every change a live rule makes is served to people and agents alike; there is no agent-only answer.

## The sections

| section | meaning |
|---|---|
| `schema`, `version` | `scope.policy/1` and the document's version |
| `about` | a free description |
| `origin` | the origin to forward to when the sensor does not sit on the product host (the Worker off a route) |
| `report` | where records ship (`url`, the header that carries the install key) |
| `surfaces` | the surface map: the paths of each surface of your product (`docs`, `download`, `api`, `mcp`, `oauth`, `device`, `signup`, `hooks`, `credentials`, `trial`, `cli`, `clients`, `finder`, `passthrough`, `custom`), so each request is classified by what it is for |
| `routes` | the older form of the surface map, still read; new documents use `surfaces` |
| `secrets` | the value shapes hashed wherever they appear (a key prefix, a token pattern) |
| `headers` | the names of the setup, agent, client and intent headers the sensor reads |
| `forward` | headers added on the hop to the origin (with `{host}` filled in), the header that carries the install key to the origin |
| `record_bodies` | `false` is the lightest form: bodies are read where a rule needs them and never leave |
| `observe` | the routes whose request and response bodies are recorded, the fields allowed, the limit |
| `rules` | the rule table, below |
| `assertion` | whether the sensor signs an assertion of what it saw on each forwarded request, for your app to verify |
| `destinations` | your own OpenTelemetry collector, when records and traces should also go there |
| `retention_days`, `salt_epoch` | how long records are kept; the epoch of the hash salt, advanced by `journeys rotate-salt` on your request (journeys never join across epochs) |

## The six rule kinds

| kind | what it does when live | what it records in dry run |
|---|---|---|
| `inject` | adds a short reference code to the links, the install command and the MCP URL on a documentation page the map names, and a setup and intent header line to its API samples; a path the map does not name is left as it is | the page's canonical path and what would have been placed |
| `gate` | lists a tool named `declare_intent` first in your MCP server's tool list, answers it itself with a fixed acknowledgement and never forwards it to your server | the call that would have been answered |
| `finder` | answers a documentation-finder route (`/api/docs/find`) itself with links to your guides | the query and the links that would have been returned |
| `notfound` | answers a documentation path the map names that your origin does not have with a page listing your real guides; the status stays 404; a 404 on a path the map does not name passes through as the origin answered it | the path and the page that would have been served |
| `error` | appends "Guide: <link>" to your API's own error messages for the statuses you choose | the status and the link that would have been appended |
| `face` | serves the markdown face of a page to a reader who asked for it | the face that would have been served |

Every rule has `id`, `kind`, `mode` (`dry_run` or `live`), `environments` (the environments it is live in) and, for `gate` only, `on_error` (`open` forwards the call untouched when the rule fails; `closed` refuses it). Anything else in a rule is the kind's own fields (the paths, the statuses, the links).

## Validate a document

```
npx scope-journeys policy validate policy.json
```

validates the document against the schema the packages ship and scans it for secret-shaped values; a document holding one is refused by the API too (`400 policy_holds_secret`). The schema is `schemas/policy.json` in `scope-journeys`.
