# Verify: the assertion in Next

When the policy's `assertion.enabled` is on, every request the sensor forwards to your origin carries two headers:

- `x-scope-assertion`: a compact JWS (`alg: ES256`, `typ: scope-observer+jwt`, `kid: <install id>:<key version>`) signed with the key `journeys init` generated on your machine (`JOURNEYS_ASSERTION_KEY`; Scope never holds it). Its claims: `iss` (your install's URL on the API), `aud` (the host the request is for), `iat`, `exp` (five minutes), `jti` and `record` (the record's id), `reader`, `agent` (`{name, named_by}`: `verified` by a Web Bot Auth signature, `declared` by a header or the MCP client, `inferred` from the reader family), `signature`, `decisions`, `address_hash`, `salt_epoch`, `policy_version`.
- `x-scope-agent: <name>;<named_by>`: the convenience header, meaningful only when the assertion verifies.

Your app verifies the assertion against Scope's directory of install public keys, `https://api.tryscope.com/.well-known/scope-observer?kid=<kid>` (one key per `kid`, cached an hour; a `404` means the key is unknown, so a verifier fails closed). Twenty lines with [jose](https://www.npmjs.com/package/jose):

```ts
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";

const DIRECTORY = "https://api.tryscope.com/.well-known/scope-observer";
const keys = new Map<string, { set: ReturnType<typeof createLocalJWKSet>; until: number }>();

export interface ScopeObserver extends JWTPayload {
  record: string;
  reader: string;
  agent: { name: string; named_by: "verified" | "declared" | "inferred" };
  signature: { valid: boolean; agent: string } | null;
  decisions: Array<{ rule: string; outcome: string }>;
  address_hash: string;
  salt_epoch: number;
  policy_version: number;
}

/** The sensor's assertion for this host, verified against Scope's directory; null when absent or not verifiable. */
export async function verifyScopeObserver(assertion: string | null, host: string, fetchFn: typeof fetch = fetch): Promise<ScopeObserver | null> {
  if (!assertion) return null;
  let kid: string | undefined;
  try {
    kid = decodeProtectedHeader(assertion).kid;
  } catch {
    return null;
  }
  if (!kid) return null;
  let held = keys.get(kid);
  if (!held || held.until < Date.now()) {
    const response = await fetchFn(`${DIRECTORY}?kid=${encodeURIComponent(kid)}`);
    if (!response.ok) return null;
    held = { set: createLocalJWKSet(await response.json()), until: Date.now() + 3600_000 };
    keys.set(kid, held);
  }
  try {
    const { payload } = await jwtVerify(assertion, held.set, { algorithms: ["ES256"], audience: host, typ: "scope-observer+jwt" });
    return payload as ScopeObserver;
  } catch {
    return null;
  }
}
```

In the Next form the sensor wraps your proxy, and your own logic runs on the inner hop, which is the request carrying the assertion. Verify it there and hand the result to your handlers as a request header:

```ts
// proxy.ts
import { withJourneys } from "scope-journeys-next";
import { NextResponse, type NextRequest } from "next/server";
import { verifyScopeObserver } from "@/lib/scope-observer";

async function previous(request: NextRequest) {
  const observer = await verifyScopeObserver(request.headers.get("x-scope-assertion"), request.headers.get("host") ?? "");
  const headers = new Headers(request.headers);
  headers.delete("x-scope-observer");
  if (observer) headers.set("x-scope-observer", JSON.stringify({ record: observer.record, reader: observer.reader, agent: observer.agent }));
  return NextResponse.next({ request: { headers } });
}

export default withJourneys({ next: previous });
```

A handler reads `request.headers.get("x-scope-observer")`: present only when the assertion verified for this host, so a request a stranger sends with a forged header never reaches a handler with the field set (the proxy deletes it before verifying).

## Keys and rotation

`journeys init` generated the pair and wrote the private half to `JOURNEYS_ASSERTION_KEY` (a JWK carrying its `kid`), beside the install key and the salt. Every six weeks:

```
npx scope-journeys rotate-assertion-key
```

registers a new public key with Scope, writes the new private key where `init` wrote the first, and prints the overlap deadline: the previous key verifies for seven more days, so a deploy in flight keeps verifying. Redeploy to sign with the new key.

The sample on this page is run as a test in the packages repository against the sensor's own fixture output.
