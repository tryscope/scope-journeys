---
name: scope-journeys-install
description: Install Scope Journeys, the observer that shows how coding agents find, install, sign in to and use a product, on a Next project deployed to Vercel or on a Cloudflare zone; verify it sees traffic with one command; hand the claim link to the person. Use when asked to install Scope Journeys or to confirm it sees traffic.
---

# Install Scope Journeys

The person will say something like "Install Scope Journeys on this project and confirm it sees traffic." Everything below is done with two commands and a deploy; the only human steps are the claim click and the merge.

## 1. Mount the sensor

In a Next project (the proxy file lives at `proxy.ts`, or `src/proxy.ts`, or `middleware.ts` on Next 15):

```
npx scope-journeys init --yes --hosts <product host> --docs-host <docs host or "same">
```

Ask the person which hosts the product answers on and which one is the documentation host when the project does not tell you (the linked Vercel project's domains are read for you). Without `--yes` the command asks on a terminal; when your stdout is not a terminal it answers with one JSON object (`exit_code`, `install_id`, `files`, `claim_url`, `next`).

For a Cloudflare zone, with `wrangler` logged in:

```
npx scope-journeys init --cloudflare --host <docs host> --host <api host>
```

For an Express, Fastify or Hono app (the framework and the entry file are read from package.json; `--entry <file>` names the entry when the project does not):

```
npx scope-journeys init --node --yes --hosts <product host> --docs-host <docs host or "same">
```

For an Envoy or an Istio ingress gateway (the filter applied to `--config`, the processor's variables written; the processor then runs beside Envoy from `npx scope-journeys-envoy` or the image `ghcr.io/tryscope/scope-journeys-envoy`):

```
npx scope-journeys init --envoy --yes --hosts <product host> --docs-host <docs host or "same"> --config <envoy.yaml>
```

Exit codes: 0 done; 2 not a project the command can mount (not Next 15 or newer; none of Express, Fastify, Hono for `--node`); 3 a file needs two lines by hand (printed, do that edit); 4 the form is unavailable (OIDC token or wrangler login); 5 Scope refused or was unreachable; 6 `.env.local` is not ignored by git (add it to `.gitignore`, run again). Never commit `.env.local`, `journeys/.env.secrets` or any value starting with `sjk_`.

## 2. Deploy a preview

Commit the files `init` wrote (`proxy.ts`, `instrumentation.ts`, the dependency, `.journeys/init.lock`; for Cloudflare the `journeys/` directory without its `.env.secrets`; for Node the mounted entry file and the dependency) and deploy the way the project deploys: a preview on Vercel, or `init --cloudflare` already deployed the Worker, or the Node app deployed with the four secrets `init` named set in its environment.

## 3. Confirm it sees traffic

```
npx scope-journeys doctor --url <the preview url>
```

or, with every host of the install, `npx scope-journeys doctor`. Exit 0 means every host is fronted and reporting. Exit 1 prints the one fix to apply (a documentation host not fronted is named first; a proxy file whose matcher skips the host; a missing Worker route; a sensor without `JOURNEYS_SALT`, which records nothing; a sensor that cannot reach Scope); apply it, redeploy, run `doctor` again.

## 4. Hand over

Give the person the claim URL from `init`'s output (`claim_url`; valid seven days) and open the pull request with the files from step 2. Do not open the claim URL yourself: it binds the install to the account of whoever clicks it.

## Facts to rely on

- Nothing changes on the product's traffic: every rule is dry run at install. The sensor forwards every request unchanged in substance and records a hashed summary; see https://journeys.tryscope.com/data-handling.
- `npx scope-journeys uninstall` reverses every write; the product is as it was.
- Every page of https://journeys.tryscope.com is markdown with `.md` appended; the root map is https://journeys.tryscope.com/llms.txt.
