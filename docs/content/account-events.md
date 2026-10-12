# Account events

The sensor sees what an agent reads, downloads, calls and signs in to. It never sees the one thing your product knows at the moment it issues a key: which account the key went to. `POST /v1/account_events` is where your product tells Scope, hashed with your own salt, so the journey that read your docs and the account that converted are one journey.

Three lines decide what to send:

- `key_created` when a non-trial key is issued. A trial key is not a conversion.
- `login` on every sign-in, including the second machine.
- `signup` once, when the account is created.

`device_approved` and `oauth_consented` mark the approvals of a device flow and of an OAuth client when your product knows them.

## The call

From a Node product, at the moment it issues a key:

```ts
import { createHash } from "node:crypto";
const sha12 = (value: string) =>
  createHash("sha256").update(`${process.env.JOURNEYS_SALT}:${value}`).digest("hex").slice(0, 12);

await fetch(`${process.env.JOURNEYS_API_URL}/v1/account_events`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.SCOPE_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify([{
    provider: "product",
    kind: "key_created",                    // non-trial keys only; a trial key is not a conversion
    account_id: account.id,
    at: new Date().toISOString(),
    join: {
      credential_hash: sha12(apiKey),
      reference: signupRef ?? null,         // the ?ref= the sign-up page received, if any
      user_code: userCode ? sha12(userCode) : null,
      email_hash: sha12(account.email.toLowerCase()),
      address_hash: null,                   // the product does not hash addresses; the sensor does
    },
  }]),
});
```

`SCOPE_API_KEY` is an API key with the `account_events:create` action, scoped to your customer. `JOURNEYS_SALT` is the salt your sensor installs carry: the sensor hashes the credentials it sees with it, and the hashes only join when both sides used the same salt. Up to 100 events per body. The answer is `202 {"accepted": n, "duplicates": m}`: an event the natural key `(provider, kind, account_id, at)` already holds is a duplicate, counted and never an error, so a whole batch can be retried.

## What each join does

| member | joins | how |
|---|---|---|
| `credential_hash` | the key to the journey whose requests carried it | exact |
| `user_code` | the device flow's journey (the code the agent showed) | exact |
| `reference` | the sign-up to the documentation read that minted the `?ref=` | exact |
| `email_hash` | two journeys that both carry an account with the same hash: a second `login` on a second machine | exact, the one join the sensor alone can never make |
| `address_hash` | nothing from the product; leave it `null` | the sensor hashes addresses |

Every hash is `sha256(salt + ":" + value)` cut to twelve hex characters. Scope receives the twelve characters and nothing else; a value that is not a hash is refused with `400` naming the field, and the value is never echoed.

## What you see

Within a minute of the next stitch the journey carries `account` (`id`, `provider`, `joined_by`) and reaches the `signed_in` or `converted` stage the sensor could not see on its own. In the lightest sensor form, which records no bodies, this feed is the only source of those two stages.
