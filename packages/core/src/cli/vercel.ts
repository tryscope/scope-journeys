import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readEnvFile } from "./project.js";

/** A command runner `init` is given (the tests give one that records; the bin gives execFile). */
export type Exec = (command: string, args: string[], options: { cwd: string; input?: string }) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface ProjectLink {
  projectId: string;
  orgId: string;
}

/** `.vercel/project.json`, written by `vercel link`. */
export function readProjectLink(root: string): ProjectLink | null {
  const file = join(root, ".vercel", "project.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { projectId?: unknown; orgId?: unknown };
    return typeof parsed.projectId === "string" && typeof parsed.orgId === "string" ? { projectId: parsed.projectId, orgId: parsed.orgId } : null;
  } catch {
    return null;
  }
}

/** The claims of a JWT without verification (the API verifies). */
export function decodeJwt(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface OidcToken {
  token: string;
  sub: string | null;
  iss: string | null;
}

/** `VERCEL_OIDC_TOKEN` as `vercel env pull` writes it into `.env.local`, decoded for the form decision (architecture §14.2). */
export function oidcTokenFromEnvLocal(root: string): OidcToken | null {
  const env = readEnvFile(join(root, ".env.local"));
  const token = env.VERCEL_OIDC_TOKEN;
  if (!token) return null;
  const claims = decodeJwt(token) ?? {};
  return { token, sub: typeof claims.sub === "string" ? claims.sub : null, iss: typeof claims.iss === "string" ? claims.iss : null };
}

export interface VercelProjectFacts {
  oidcEnabled: boolean | null;
  domains: string[];
}

/** The project's OIDC federation setting and production domains through Vercel's API, when a token is at hand. */
export async function vercelProjectFacts(fetchFn: typeof fetch, token: string, link: ProjectLink): Promise<VercelProjectFacts> {
  const headers = { authorization: `Bearer ${token}` };
  const team = `?teamId=${encodeURIComponent(link.orgId)}`;
  let oidcEnabled: boolean | null = null;
  const domains: string[] = [];
  try {
    const project = await fetchFn(`https://api.vercel.com/v9/projects/${encodeURIComponent(link.projectId)}${team}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (project.ok) {
      const body = (await project.json()) as { oidcTokenConfig?: { enabled?: unknown } };
      oidcEnabled = typeof body.oidcTokenConfig?.enabled === "boolean" ? body.oidcTokenConfig.enabled : null;
    }
    const list = await fetchFn(`https://api.vercel.com/v9/projects/${encodeURIComponent(link.projectId)}/domains${team}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (list.ok) {
      const body = (await list.json()) as { domains?: Array<{ name?: unknown; verified?: unknown }> };
      for (const d of body.domains ?? []) if (typeof d.name === "string" && d.verified !== false) domains.push(d.name);
    }
  } catch {
    // The setting cannot be read: the caller says so and continues with the key form.
  }
  return { oidcEnabled, domains };
}

/** Whether the Vercel CLI is logged in here. */
export async function vercelAuthenticated(exec: Exec, cwd: string): Promise<boolean> {
  try {
    const result = await exec("vercel", ["whoami"], { cwd });
    return result.code === 0;
  } catch {
    return false;
  }
}

/** `vercel env add NAME production preview development`, the value on stdin, `--sensitive` for a secret. */
export async function vercelEnvAdd(exec: Exec, cwd: string, name: string, value: string, sensitive: boolean): Promise<boolean> {
  const args = ["env", "add", name, "production", "preview", "development", "--force", "--yes"];
  if (sensitive) args.push("--sensitive");
  try {
    const result = await exec("vercel", args, { cwd, input: `${value}\n` });
    return result.code === 0;
  } catch {
    return false;
  }
}

/** The lines a person runs when the CLI could not write the variables itself. */
export function vercelEnvLines(names: Array<{ name: string; sensitive: boolean }>): string[] {
  return names.map(({ name, sensitive }) => `vercel env add ${name} production preview development${sensitive ? " --sensitive" : ""}   # (from .env.local)`);
}
