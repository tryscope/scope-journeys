# Working in this repository

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
