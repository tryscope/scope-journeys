export type Credential = { scheme: "oidc"; value: string } | { scheme: "key"; value: string } | null;

/**
 * The Next form proves itself without a secret (architecture §14.2): when no install key is set
 * and Vercel's OIDC token is on the request (or in the environment at build time), the token is the
 * bearer for the policy fetch and the delivery; the install's subject was bound at init. With
 * neither, the adapter runs the default policy and names `journeys init` once; it never throws.
 */
export function credential(request: Request, env: Record<string, string | undefined>): Credential {
  const key = env.JOURNEYS_INSTALL_KEY;
  if (key) return { scheme: "key", value: key };
  const token = request.headers.get("x-vercel-oidc-token") ?? env.VERCEL_OIDC_TOKEN;
  if (token) return { scheme: "oidc", value: token };
  return null;
}

/** The claims of a JWT without verification (the API verifies); for `init`'s detection only. */
export function decodeClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
