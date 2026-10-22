// Settings answers signed the way Scope's policy route signs them, with a key made for the test run.
// A test trusts it with trustPolicyKeyForTests(TEST_POLICY_KID, ...); the sensor never does otherwise.
// Web APIs only, so the workerd tests import it unchanged.
import { base64url } from "../src/assertion.js";

export const TEST_POLICY_KID = "policy:test";

let pair: Promise<CryptoKeyPair> | null = null;
/** The run's key pair, made on first use (a Worker may not make keys while its module loads). */
export const testPolicyKeys = (): Promise<CryptoKeyPair> => (pair ??= crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]) as Promise<CryptoKeyPair>);

/** The `x-journeys-signature` value over the six lines Scope signs. */
export async function policySignature(install: string, environment: string, saltEpoch: string, issuedAt: number, body: string, kid = TEST_POLICY_KID): Promise<string> {
  const message = new TextEncoder().encode(["journeys-policy-signature/1", install, environment, saltEpoch, String(issuedAt), body].join("\n"));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, (await testPolicyKeys()).privateKey, message));
  return `${kid} ${issuedAt} ${base64url(signature)}`;
}

/** The headers the policy route sends with an answer whose body is `body`, signed for `install` at `issuedAt` (unix seconds). */
async function signedHeaders(body: string, options: { install: string; issuedAt: number; environment?: string; saltEpoch?: string; etag?: string }): Promise<Record<string, string>> {
  const environment = options.environment ?? "production";
  const saltEpoch = options.saltEpoch ?? "1";
  const headers: Record<string, string> = { "x-journeys-environment": environment, "x-journeys-salt-epoch": saltEpoch, "x-journeys-signature": await policySignature(options.install, environment, saltEpoch, options.issuedAt, body) };
  if (options.etag) headers.etag = options.etag;
  return headers;
}

/** A 200 answer for `document` as the policy route serves it. */
export async function signedPolicy(document: unknown, options: Parameters<typeof signedHeaders>[1]): Promise<Response> {
  const body = JSON.stringify(document);
  return new Response(body, { headers: { "content-type": "application/json", ...(await signedHeaders(body, options)) } });
}

/** A 304 as the policy route serves it: no body, signed over `held`, the body the sensor holds. */
export async function signedNotModified(held: string, options: Parameters<typeof signedHeaders>[1]): Promise<Response> {
  return new Response(null, { status: 304, headers: await signedHeaders(held, options) });
}
