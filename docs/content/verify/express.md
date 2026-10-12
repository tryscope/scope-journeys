# Verify: the assertion in Express

The sensor in front of your host (the Worker, Node or Envoy form) forwards every request with `x-scope-assertion`, a compact JWS (`ES256`, `typ: scope-observer+jwt`, `kid: <install id>:<key version>`) signed with the key `journeys init` generated on your machine, and `x-scope-agent: <name>;<named_by>`. What the claims hold is on [the Next page](/verify/next); the verification is the same twenty lines with [jose](https://www.npmjs.com/package/jose), as a middleware that exposes `request.scopeObserver`:

```js
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

const DIRECTORY = "https://api.tryscope.com/.well-known/scope-observer";
const keys = new Map();

/** The sensor's assertion for this host, verified against Scope's directory; null when absent or not verifiable. */
export async function verifyScopeObserver(assertion, host, fetchFn = fetch) {
  if (!assertion) return null;
  let kid;
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
    return payload;
  } catch {
    return null;
  }
}

/** `app.use(scopeObserver())`: `request.scopeObserver` is the verified claims, or null. */
export function scopeObserver(fetchFn = fetch) {
  return async (request, response, next) => {
    request.scopeObserver = await verifyScopeObserver(request.get("x-scope-assertion") ?? null, request.hostname, fetchFn);
    next();
  };
}
```

```js
import express from "express";
import { scopeObserver } from "./scope-observer.js";

const app = express();
app.set("trust proxy", true);
app.use(scopeObserver());
app.get("/docs/quickstart", (request, response) => {
  const observer = request.scopeObserver;
  response.set("x-seen-by", observer ? `${observer.agent.name};${observer.agent.named_by}` : "nobody");
  response.send("...");
});
```

`request.hostname` must be the host the sensor forwards for (`trust proxy` when a platform proxy sits between the sensor and the app), because the assertion's `aud` is that host and a different value is rejected. A directory answer of `404` (an unknown `kid`) leaves `scopeObserver` null: the verifier fails closed.

## Keys and rotation

Every six weeks, `npx scope-journeys rotate-assertion-key --cloudflare` (in the directory holding `journeys/`) registers a new public key with Scope, puts the new private key as the Worker's secret and prints the overlap deadline; the previous key verifies for seven more days. `npx wrangler deploy` signs with the new key from then on.

The first sample on this page is run as a test in the packages repository against the sensor's own fixture output.
