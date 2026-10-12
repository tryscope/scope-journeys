# The loop

Journeys records what production agents do in your product. Three things can leave it, each
through a door you open, each with Scope's operator in front of it. Nothing enters a series by
itself.

## Intents into tasks

An intent is what an agent said it was doing: the sentence it declared through the gate, the
intent header, the finder, the SDK option or the CLI. On the Intents page, an owner selects
intents and chooses **Propose as tasks**.

Each selected intent becomes one proposal. The proposal's prompt is the intent's text, byte for
byte: no prefix, no suffix, no closing sentence. The capability is the declaration's task when it
named one, else the `about` of your current policy, else the surface the intent came through
(`mcp`, `api` or `docs`). An intent proposed twice answers the one proposal it already has.

A proposal shows its state beside the intent: **Proposed**, **Approved**, **Task created** or
**Declined**. Scope's operator decides each one once. An approval mints the task through the same
door every Scope task is minted through, content-addressed from the prompt, so the same words are
the same task; a decline ends the proposal. Every decision is recorded as an event.

A task that came from a proposal says so: its `source` names the proposal, the visit and the
intent. It joins a series only when you add it through the series' own task tables. The series
changes by your hand and nothing else.

## Failures into fix candidates

The Failures page groups where agents fail and what they read next. An owner chooses **Export as
fix candidates** over the page's window. The export is one file, `fix_candidates.jsonl`, one JSON
object per cluster of failures with the same status, route and message:

| field | holds |
|---|---|
| `status`, `route`, `message` | the cluster's key, as the product answered |
| `count` | the failures in the window |
| `agents` | how many came from each agent |
| `first_seen`, `last_seen` | the span |
| `visit_ids`, `request_ids` | up to fifty of each, the evidence |
| `reads_within_5min` | the pages read within five minutes of a failure, with counts (the error link followed, or not) |
| `intents` | up to twenty intents declared in those visits |

The manifest names the window, the counts and the stitcher versions. A flag the Failures page
shows carries **Exported** once a ready export holds its cluster. An operator turns a cluster into
a fix proof through Scope's experiments door, with the cluster's request ids as the proof's
evidence; nothing in Journeys creates an experiment.

## Named agents into the catalogue

Every journey names the agent that ran it and the version its evidence carried: the MCP
handshake's `clientInfo.version`, the OAuth registration's client name, the user agent's product
token; `unknown` when none did. Scope's operator reads these sightings beside the fleet's pinned
harness versions. A version seen in production for seven days that is newer than the fleet's pin
is flagged for the pin review, so the fleet measures with what your agents actually run. The
catalogue itself is never written from here.

## What never happens

- No prompt is edited, enriched or shortened on its way into a task.
- No task is added to a series by Scope.
- No experiment is created from an export.
- No agent catalogue row is written from a sighting.
