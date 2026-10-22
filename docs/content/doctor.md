# Verify: journeys doctor

```
npx scope-journeys doctor [--url https://host] [--install jin_your_install_id] [--token t] [--timeout 60]
```

`doctor` sends one probe per host of the install, waits for each to arrive at Scope, prints the facts that came with it and the one step that fixes anything missing. It is Sentry's "Waiting for events" and Segment's debugger in one command.

## What it does

1. Finds the install: `--install`, else `JOURNEYS_INSTALL_ID` in `.env.local`, else `journeys/wrangler.toml`. The credential is the install key from `.env.local` or `journeys/.env.secrets`, or a console session token passed as `--token`. The hosts come from `--url` (one host) or from the install (all of them).
2. For each host, a probe: `GET https://<host>/.well-known/journeys-probe?journeys_probe=<nonce>` with a fresh 16-byte nonce. The sensor answers it itself with `204 No Content` and `x-journeys-probe: received`, never forwards it, and records it like any request. A sensor without its salt answers `x-journeys-probe: no-salt` and records nothing, so `doctor` names the missing salt and does not wait for the record. A host that answers anything else is reported as not fronted, with the fix for the form.
3. Then `GET /v1/installs/{id}/probes/{nonce}` every two seconds for up to `--timeout` seconds (default 60), until the record is found.
4. The facts, per host, as the ingest saw them: `address_hash`, `client.asn`, `client.ja4`, `user_agent`, `route`, `observer.policy_version`, and the round trip between the probe and the record. The install's own row: the package, version and adapter the ingest last saw, the policy version, the salt epoch, the state.

What it prints on a terminal, two hosts fronted on a Cloudflare zone:

```
install     jin_your_install_id (cloudflare)
sensor      scope-journeys-cloudflare@0.1.0 (cloudflare), policy 3, salt epoch 1, unclaimed
host        docs.acme.example: fronted, probe found in 312 ms
  address_hash             present
  client.asn               present
  client.ja4               absent
  user_agent               present
  route                    present
  observer.policy_version  present
  fix         Bot Management is not enabled on this zone; JA4 is optional
host        api.acme.example: fronted, probe found in 290 ms
  ...
next        every host is fronted and reporting; open the claim URL to bind the install to your account
```

## The fixes, in the order they are named

| what is missing | the line |
|---|---|
| the documentation host is not fronted | "no documentation host is fronted: add `<docs host>` to the install (`journeys init --docs-host`) and front it, or every journey starts at the install instead of at the read"; always the first line |
| a host is not fronted, Next form | "the proxy file does not run for `<host>`; check `config.matcher` and `JOURNEYS_HOST`" |
| a host is not fronted, Cloudflare form | "no route for `<host>`: add `<host>/*` to `wrangler.toml` and deploy, or the DNS record for `<host>` is not proxied" |
| the sensor has no salt | Cloudflare: "the Worker for `<host>` has no JOURNEYS_SALT, so it records nothing: run journeys init again, or set the secret (npx wrangler secret put JOURNEYS_SALT) and deploy"; other forms: "the sensor for `<host>` has no JOURNEYS_SALT, so it records nothing: run journeys init again, or set JOURNEYS_SALT where the sensor runs and redeploy" |
| the probe never reached the ingest | "no request carrying the probe's nonce reached the ingest within `<timeout>` s; check that `<host>` is one the install fronts and that the sensor can reach `JOURNEYS_API_URL`" |
| `client.ja4` absent | Cloudflare: "Bot Management is not enabled on this zone; JA4 is optional"; Vercel: "the project is not on a plan that sends `x-vercel-ja4-digest`; optional" |
| `client.asn` absent | "the platform did not send an AS number; optional" |
| `observer.policy_version` is 0 | the sensor is on the embedded default: the policy fetch failed, its url is not https, or the document holds a value of the wrong type (the sensor's log and each record's `policy` decision name which); check `JOURNEYS_API_URL` and the key, then `doctor` again |
| the sensor is older than the CLI | "a newer sensor exists; `npm update` and redeploy" |

## Exit codes

| code | meaning |
|---|---|
| 0 | every host is fronted and every required fact is present (`address_hash`, `user_agent`, `route`, `observer.policy_version`); JA4 and the AS number are optional |
| 1 | at least one host or required fact is missing; the fix is printed |
| 5 | Scope was unreachable or refused the credential |

When stdout is not a terminal the output is one JSON object: `{install_id, form, sensor, hosts: [{host, fronted, found, round_trip_ms, facts, missing}], missing, ok, exit_code, next_step}`.

## Before any adapter is installed

```
npx scope-journeys doctor --local --policy <policy.json> --url http://localhost:3000 [--path /docs/quickstart]
```

runs one request through the core in this process against a local app, with no adapter and no account, and prints the record the core built and the facts only the platform can supply.
