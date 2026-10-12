import { generateKeyPairSync } from "node:crypto";

export interface AssertionKeyPair {
  publicJwk: Record<string, unknown>;
  privateJwk: Record<string, unknown>;
}

/**
 * The install's assertion key pair (plan J3.4): ES256 (P-256), generated on the customer's
 * machine. The private half goes to the customer's environment as JOURNEYS_ASSERTION_KEY and is
 * never sent to Scope; the public half registers through the API. The `kid`
 * (`<install_id>:<version>`) is stamped on both once the install id is known.
 */
export function generateAssertionKeyPair(): AssertionKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { publicJwk: publicKey.export({ format: "jwk" }) as Record<string, unknown>, privateJwk: privateKey.export({ format: "jwk" }) as Record<string, unknown> };
}

export const assertionKid = (installId: string, version: number): string => `${installId}:${version}`;

/** The version a stored private JWK carries in its kid, or 0 when it has none. */
export function assertionKeyVersion(privateJwkJson: string | undefined): number {
  if (!privateJwkJson) return 0;
  try {
    const kid = (JSON.parse(privateJwkJson) as { kid?: unknown }).kid;
    const version = typeof kid === "string" ? Number(kid.split(":")[1]) : NaN;
    return Number.isInteger(version) && version > 0 ? version : 0;
  } catch {
    return 0;
  }
}
