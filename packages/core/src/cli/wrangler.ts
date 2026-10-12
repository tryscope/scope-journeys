import type { Exec } from "./vercel.js";

/** wrangler through npx, pinned to the major the adapter's template targets. */
export const WRANGLER = ["npx", ["--yes", "wrangler@4"]] as const;

export interface WhoAmI {
  loggedIn: boolean;
  accountId: string | null;
  accountName: string | null;
}

/** `wrangler whoami`: logged in or not, and the account id the deploy goes under. */
export async function wranglerWhoAmI(exec: Exec, cwd: string): Promise<WhoAmI> {
  try {
    const result = await exec(WRANGLER[0], [...WRANGLER[1], "whoami"], { cwd });
    const text = `${result.stdout}\n${result.stderr}`;
    if (result.code !== 0 || /not authenticated|not logged in/i.test(text)) return { loggedIn: false, accountId: null, accountName: null };
    const row = /│\s*([^│]+?)\s*│\s*([0-9a-f]{32})\s*│/.exec(text);
    return { loggedIn: true, accountId: row?.[2] ?? null, accountName: row?.[1]?.trim() ?? null };
  } catch {
    return { loggedIn: false, accountId: null, accountName: null };
  }
}

export interface Zone {
  id: string;
  name: string;
}

/** The zones the token can see (`GET /client/v4/zones`), for the host-to-zone check. */
export async function cloudflareZones(fetchFn: typeof fetch, token: string): Promise<Zone[]> {
  const zones: Zone[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchFn(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Cloudflare answered ${response.status} to the zone list`);
    const body = (await response.json()) as { result?: Array<{ id?: unknown; name?: unknown }>; result_info?: { total_pages?: number } };
    for (const z of body.result ?? []) if (typeof z.id === "string" && typeof z.name === "string") zones.push({ id: z.id, name: z.name });
    if ((body.result_info?.total_pages ?? 1) <= page) break;
  }
  return zones;
}

/** The zone a host belongs to: the longest zone name the host ends with. */
export function zoneOf(host: string, zones: readonly Zone[]): Zone | null {
  let best: Zone | null = null;
  for (const z of zones) if (host === z.name || host.endsWith(`.${z.name}`)) if (!best || z.name.length > best.name.length) best = z;
  return best;
}

/** Whether the host's DNS record is proxied (the orange cloud); null when no record answers. */
export async function dnsProxied(fetchFn: typeof fetch, token: string, zoneId: string, host: string): Promise<boolean | null> {
  const response = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records?name=${encodeURIComponent(host)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const body = (await response.json()) as { result?: Array<{ proxied?: unknown; type?: unknown }> };
  const records = (body.result ?? []).filter((r) => r.type === "A" || r.type === "AAAA" || r.type === "CNAME");
  if (records.length === 0) return null;
  return records.every((r) => r.proxied === true);
}

export async function wranglerSecretPut(exec: Exec, cwd: string, name: string, value: string): Promise<boolean> {
  const result = await exec(WRANGLER[0], [...WRANGLER[1], "secret", "put", name], { cwd, input: `${value}\n` }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  return result.code === 0;
}

export interface Deployed {
  ok: boolean;
  deploymentId: string | null;
  versionId: string | null;
  output: string;
}

export async function wranglerDeploy(exec: Exec, cwd: string): Promise<Deployed> {
  const result = await exec(WRANGLER[0], [...WRANGLER[1], "deploy"], { cwd }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  const text = `${result.stdout}\n${result.stderr}`;
  return { ok: result.code === 0, deploymentId: /Deployment ID:\s*([0-9a-f-]+)/i.exec(text)?.[1] ?? null, versionId: /Version ID:\s*([0-9a-f-]+)/i.exec(text)?.[1] ?? null, output: text.trim() };
}

export async function wranglerDelete(exec: Exec, cwd: string, name: string): Promise<boolean> {
  const result = await exec(WRANGLER[0], [...WRANGLER[1], "delete", "--name", name, "--force"], { cwd }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  return result.code === 0;
}
