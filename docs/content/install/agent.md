# Install: by your coding agent

Hand your agent one sentence:

> Install Scope Journeys on this project and confirm it sees traffic.

## What the agent does

1. Runs `npx scope-journeys init` in the project (or `init --cloudflare --host <host>` for a Cloudflare zone, `init --node` for an Express, Fastify or Hono app). The command detects the form and asks only what it cannot detect: the product hosts and the documentation host. When stdout is not a terminal the command answers with one JSON object, so the agent reads the install id, the files written and the claim URL without parsing a table.
2. Commits the files `init` wrote and deploys a preview the way the project always deploys.
3. Runs `npx scope-journeys doctor --url <the preview url>`: one probe per host, the facts that arrived, the one step that fixes anything missing. Exit 0 means every host is fronted and reporting.
4. Hands you the claim URL from `init`'s output and opens the pull request.

## What you do

1. Answer the agent's questions, if it has any (which hosts, which one is the docs host).
2. Click the claim link: it binds the install to your account. [The claim](/claim).
3. Merge.

## Where the agent finds the recipe

- [SKILL.md](/SKILL.md), in the Agent Skills format, served at this host's root: `npx skills add https://journeys.tryscope.com` installs it.
- [llms.txt](/llms.txt): the root map; every page here is markdown with `.md` appended to its URL or under `Accept: text/markdown`.
- `npx scope-journeys` without a command prints the usage; every command prints the one thing to do on a non-zero exit.

Nothing the agent does needs your credentials beyond what the project already has: the Vercel login for `vercel env add`, or `wrangler` logged in for the Cloudflare form. Scope's install key, when one is needed, is minted by `init` and written to the environment the agent cannot commit (`.env.local` must be ignored by git, else `init` exits 6 and writes no secret).
