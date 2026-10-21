/**
 * The Next form proves itself without a secret: when no install key is set
 * and Vercel's OIDC token is on the request (or in the environment at build time), the token is the
 * bearer for the policy fetch and the delivery; the install's subject was bound at init. With
 * neither, the adapter runs the default policy and names `journeys init` once; it never throws.
 */
export function credential(request: Request, env: Record<string, string | undefined>): string | null {
  const key = env.JOURNEYS_INSTALL_KEY;
  if (key) return key;
  const token = request.headers.get("x-vercel-oidc-token") ?? env.VERCEL_OIDC_TOKEN;
  return token || null;
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
