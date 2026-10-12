# The docs host

`journeys.tryscope.com`: every page as HTML at `/<path>`, as markdown at `/<path>.md` and under `Accept: text/markdown`; `/llms.txt` (the root map), `/llms-full.txt` (every page in one file), `/SKILL.md` (the install recipe for a coding agent). The sensor documented here runs in front of this host (`proxy.ts` is `withJourneys({ next })`), so the first customer of Journeys is Journeys.

## Pages

The registry is `lib/pages.json` (slug, title, group, description, source). Written pages live in `content/`; the pages derived from the repository are generated into `content/generated/` on every build by `scripts/generate.mjs`:

| page | source |
|---|---|
| `/telemetry` | `packages/core/TELEMETRY.md` (itself generated from the record schema) |
| `/security` | `SECURITY.md` |
| `/changelog` | `CHANGELOG.md` (release-please) |
| `/deprecation` | `DEPRECATION.md` |
| `/api` | `packages/core/src/cli/openapi.journeys.json` through `scripts/api-reference.mjs`; the build fails when the document is older than the CLI's pinned contract version (and, with `--published`, than the CLI on the registry) |
| `/SKILL.md` | `packages/core/SKILL.md`; the smoke test checks the served file equals the package's |

Every snippet shows `jin_your_install_id`; `?install=jin_...` on any page fills in the reader's own install.

## Run it

```
npm ci && npm run build  # at the repository root: the docs are a workspace and link the sensor packages from the tree
npm install              # otherwise
npm run dev              # generates the derived pages, then next dev
npm run smoke            # build, start on 127.0.0.1:3917, run test/twins.test.mjs against it
```

The twin test (`test/twins.test.mjs`) runs against any running copy: `DOCS_URL=https://journeys.tryscope.com node --test test/twins.test.mjs`.

## Deploy

`.github/workflows/docs.yml` builds on every push to `main` that touches the docs or their sources, runs the smoke, then `vercel build` and `vercel deploy --prebuilt --prod` with the repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_DOCS_PROJECT_ID`. The Vercel project (`journeys-docs`, domain `journeys.tryscope.com`) is built in CI, so its root directory is `docs` with "Include source files outside of the Root Directory" on (the generated pages read `..`). Its environment carries the docs host's own install: `JOURNEYS_INSTALL_ID`, `JOURNEYS_SALT`, `JOURNEYS_HOST=journeys.tryscope.com` and, unless the project's OIDC federation is on, `JOURNEYS_INSTALL_KEY` (see `.env.example`); `npx scope-journeys init` in this directory writes them. Without them the sensor hands every request to the app with no inner hop, answers the probe itself and logs one line saying so, which is how a local copy runs.
