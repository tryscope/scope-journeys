# Releasing Scope Journeys

The five packages (`scope-journeys`, `scope-journeys-cloudflare`, `scope-journeys-next`,
`scope-journeys-node`, `scope-journeys-envoy`; the processor of the last one is also published as
the image `ghcr.io/tryscope/scope-journeys-envoy` at the same version) share one version. A
release is a repeatable act with five gates; nothing is published, promoted or deployed with a
gate red.

## The five gates

| gate | what | where |
|---|---|---|
| 1 | the packages' tests on both runtimes, the Node form on sockets, the real Envoy, the privacy tests | this repository's CI (`ci.yml`) |
| 2 | the conformance probe: the release candidate fronting real hosts answers every interaction as the origin does, plus the configured additions and nothing else | Scope's own fleet |
| 3 | the replay and the calibration of Scope's stitcher on every recorded cell | Scope's own CI |
| 4 | the staging smoke: a probe through a staging install becomes a stitched visit | Scope's promotion job |
| 5 | the fleet release cells: coding agents installing and using a product fronted by the candidate, and the onboarding cell on fresh targets | Scope's own fleet |

A packages release needs gates 1, 2, 4 and 5; a change to the policy defaults needs 2, 3 and 5.
Gate 1 is this repository's; gates 2 to 5 run on Scope's side and their outputs are recorded per
version, with the pinned versions of the coding agents the cells ran. A release whose outputs are
not recorded did not happen.

## How a version is made

1. Commits on `main` follow conventional commits (`feat:`, `fix:`, `perf:`, `deps:`); release-please
   opens and updates the release pull request from them (`release.yml`, job `release-please`;
   `release-please-config.json` holds the `node-workspace` plugin so every workspace takes the same
   version, and the four changelog sections).
2. Merging the release pull request tags `v<version>` and creates the GitHub release.
3. The `publish` job runs on that tag: `npm ci`, `npm run build`, then the six test scripts one by
   one (`test:node`, `test:node-adapter`, `test:workerd`, `test:identity`, `test:privacy`,
   `test:envoy`; a failure stops the job, no step continues on error), then
   `npm publish -w scope-journeys -w scope-journeys-cloudflare -w scope-journeys-next -w scope-journeys-node -w scope-journeys-envoy --provenance --access public --tag next` (the five packages by name: the docs site and the example are workspaces too and are never published). No npm token is in the
   workflow: npm's trusted publishing trusts this repository and this workflow (configured per
   package by the owner after the first manual publish), and `--provenance` attests both. Every
   version therefore lands on the registry under the `next` dist-tag first, as a release candidate.
4. The `container` job builds `ghcr.io/tryscope/scope-journeys-envoy:<version>` from the packages
   just published (`packages/envoy/Dockerfile`), under the workflow's own token.
5. Gates 2, 4 and 5 run against the candidate on Scope's side.
6. The owner moves the dist-tag once they are green: `npm dist-tag add scope-journeys@<version> latest`
   and the same for `scope-journeys-cloudflare`, `scope-journeys-next`, `scope-journeys-node` and
   `scope-journeys-envoy`, and the image's `latest` tag with them. The move requires the owner's
   two-factor authentication, so this step is the owner's and is written down as such. Until it
   runs, `npm install scope-journeys` resolves the previous `latest`.

The first version, `0.1.0`, is published by the owner from a laptop under two-factor (trusted
publishing cannot be configured for a package that does not exist yet); `0.1.1` is the first version
shipped from CI with provenance.

## The conformance tests

Gate 1 is `npm run build && npm run typecheck && npm run lint && npm test`, plus `npm run test:envoy`
against the real Envoy of `test/envoy/docker-compose.yml`: every synthetic fixture through the core
on Node and on workerd with the two outputs compared byte for byte and the sensor's own latency
bounded; the same fixtures through the Node form on real sockets, through the processor over gRPC
and through Envoy itself; the privacy tests (no secret in any policy, no value of a secret shape
leaking into a record, the fixtures synthetic, nothing in the repository naming a real product).

Gate 2 runs the same interactions against real hosts fronted by the candidate, one line per form:
a documentation page in each face, the root map, the MCP calls over JSON and over server-sent
events, the device flow's start, an API error, and a path the surface map does not name, which must
come back as the origin's own 404, byte for byte, on every form. Any body difference that is not a
configured addition is a stop.

## The docs deploy

`.github/workflows/docs.yml` builds the docs host on every push to `main` that touches `docs/` or
the sources of its generated pages, runs the smoke (every page, its markdown twin, `llms.txt`,
`SKILL.md`, the probe) and deploys it with `vercel deploy --prebuilt --prod`. The host runs the
sensor in front of itself; the install's variables are the Vercel project's.

## Deprecation

A breaking change deprecates first and keeps the old path for two minors; `DEPRECATION.md` holds
the rows. The ingest warns an old sensor through `warnings[]`; a policy section a sensor does not
know is ignored and a rule kind it does not know runs as `dry_run`.
