# Working in this repository

These rules apply to every change, by a person or a coding agent.

Five packages under `packages/` (the core `scope-journeys` with the `journeys` CLI, `scope-journeys-cloudflare`, `scope-journeys-next`, `scope-journeys-node`, `scope-journeys-envoy`), the synthetic fixtures under `fixtures/synthetic/`, the tests under `test/` and `packages/*/test/` (`test/node-adapter/` runs the fixtures through the Node form on real sockets and the two sample apps under `test/node-adapter/apps/`; `packages/envoy/test/` runs them through the processor over gRPC with a stand-in for Envoy; `test/envoy/` runs them through the real Envoy of its compose stack, `npm run test:envoy`, which needs Docker and is its own CI step), and the docs host under `docs/`.

## The docs

`docs/` is a Next application: every page is a markdown file in `docs/content/` (the registry is `docs/lib/pages.json`), served as HTML at `/<path>` and as markdown at `/<path>.md` and under `Accept: text/markdown`. The pages derived from the repository (`/telemetry`, `/security`, `/changelog`, `/deprecation`, `/api`, `/SKILL.md`) are generated into `docs/content/generated/` by `docs/scripts/generate.mjs` on every build; edit their sources (`packages/core/TELEMETRY.md` is itself generated from the record schema, `SECURITY.md`, `CHANGELOG.md`, `DEPRECATION.md`, `packages/core/src/cli/openapi.journeys.json`, `packages/core/SKILL.md`), never the generated copies. `cd docs && npm run smoke` builds the app, starts it and checks every twin, `llms.txt`, `SKILL.md` and the probe. `docs/` is a workspace of the root: `npm ci && npm run build` at the root links the sensor packages from the tree, so the docs build against the working tree before and after the packages are on the registry.

`packages/core/SKILL.md` is the install recipe a coding agent follows (served at `/SKILL.md` on the docs host); keep it true to what `init` and `doctor` do.

## The gates

From the root: `npm run build && npm run typecheck && npm run lint && npm test` (Node and workerd, the Node form on sockets, the identity of the two runtimes, the privacy tests). A change to the core also regenerates `packages/core/TELEMETRY.md` and the validators (`npm run build`); commit them.

## The rules the lint enforces

- The core (`packages/core/src/` outside `src/cli/`) has no `node:` import and no Node global; the CLI is the only Node-only code.
- No `any`, no `eval`, no dynamic `require` in any package source.
- No em dash in anything a customer reads (documents, READMEs, CLI strings, the docs).
- Nothing in the repository names the lab the product was measured in; the fixtures are synthetic.
- Nothing in the repository points at private documents: no references to their sections or appendices, no plan, task, ticket or decision ids (`scripts/lint.mjs` lists the patterns).

## How to work

- Think before coding: state your assumptions, name what is unclear and ask, and say so when a simpler approach exists.
- Build the minimum that solves the problem: no speculative features, options or abstractions.
- Change only what the task needs. Leave unrelated code, comments and formatting alone; remove only what your own change made unused.
- Turn the task into a check you can run (a failing test, a command), then work until it passes.
- Search the code before saying that a function, file or option exists.

## This repository is public

- **No internal references.** Code, comments, commits and pull requests never mention private documents, ticket or plan ids, customer names or unpublished data. A comment states the constraint itself, not where it came from.
- **Security fixes stay quiet until they ship.** No attack details in branch names, commit messages, pull request titles or descriptions before the release is out; describe the change, not the exploit.
- **What the sensor records is documented.** A change to what it records, or to what it changes on the wire, updates the record schema (`npm run build` regenerates `packages/core/TELEMETRY.md`), `SECURITY.md`, `README.md` and `docs/content/data-handling.md` in the same change.
- **No new runtime dependency.** The core has none; each adapter depends on `scope-journeys`, `scope-journeys-envoy` also on `@grpc/grpc-js` and `@grpc/proto-loader`, and `scope-journeys-next` has a peer dependency on `next`. A new dev dependency needs a stated reason.

## Design rules

- **The sensor never breaks the site it fronts.** When the sensor fails, the visitor still gets the origin's answer; the one deliberate exception is a gate with `on_error: closed`, which refuses the declaration call.
- **A malformed policy value never turns a rule live;** it runs dry or is ignored.
- **One job per function.** A function returns what it exists to compute, not extra fields because the context was nearby.
- **One writer per field.** If two places set the same value, decide which one owns it before changing either.
- **Focused input.** A narrow parser gets the part of the request that holds its signal, not the whole exchange.
- **No guessing fallbacks.** Avoid `a ?? b ?? c` where an earlier source can be wrong; each source must be well defined and checked.
- **No inferred values.** If the caller knows a value, it passes it; never derive it from what surrounding data looks like.
- **Every path is handled:** thrown errors, aborts, timeouts, non-2xx responses, parse failures, stream events, unknown message types, and a child process's `error`, `exit` and `close`. Unknown input never looks like success.

## Code style

- Inline over extraction, straight-line flow over layers. Add a helper only for logic with three or more real callers, logic that is easy to get wrong, a validator, type guard or canonical translator, or code shared across packages where separate copies would drift. No wrappers that forward one call, no aliases that rename a type, no single-use constants; inline `error instanceof Error ? error.message : String(error)` instead of a helper.
- **Comments:** add one only for a hidden constraint, a third-party quirk, a subtle ownership rule or a surprising fail-open or fail-closed decision, in as few lines as it takes. No comment that restates the code or the signature, no history, no commented-out code. When you edit code under a comment, update the comment without making it longer.
- **Errors:** let a useful error reach the caller that can act on it; keep specific messages; never wrap code that cannot throw; never treat an unknown state as zero, empty or success; redact secrets before anything is logged; make retries explicit on new failure paths.
- **Input at the boundary:** parse untrusted input (requests, headers, bodies, the policy, environment variables) where it enters, accept a small, named set of shapes and fail closed. Optional chaining is not validation. Internal code trusts its own types and does not re-coerce them.

## Tests

- Write the test first: list how the change could fail, test those, then write the code. A bug fix starts with a test that fails because of the bug.
- Every behaviour change has a test that fails without it.
- No test that cannot fail: not a mock returning what it was told, not the expected value recomputed with the code's own logic.
- A test that proves a change uses a realistic, non-trivial case.

## Commits and git

- Conventional commits: `feat:`, `fix:`, `perf:` and `deps:` reach the changelog; use `chore:`, `docs:` or `test:` for changes that should not. A breaking change is deprecated first (the old path kept, a row added to `DEPRECATION.md`); the later removal takes `!`.
- Never put a real key, token, salt or customer value in code, tests, fixtures, docs, logs or pull requests; use placeholders such as `<JOURNEYS_INSTALL_KEY>`.
- Don't force-push shared branches, skip hooks, commit ignored files (`.env*`, local config) or revert changes you didn't make.

## Reviewing

Findings first, by severity, each with file and line. Always flag: a secret in output or logs, an unhandled path, a guessing fallback, a new dependency, a private reference, and a change to what the sensor records or sends without the matching documentation update.
