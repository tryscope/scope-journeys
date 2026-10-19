import type { Io } from "./io.js";
import { fieldNames, type CompiledSurfaces, type Route } from "./policy.js";
import { hashedValue } from "./redact.js";

export interface BodyKeys {
  device_code: string | null;
  user_code: string | null;
  oauth_client: string | null;
  hook: string | null;
}

export interface McpFacts {
  protocol_version: string | null;
  methods: string[];
  tools: string[];
  client: { name: string; version: string | null } | null;
}

export interface OauthFacts {
  grant_type: string | null;
  client_name: string | null;
  client_id_url: string | null;
  resource: string | null;
  scope: string | null;
}

const field = (body: unknown, names: readonly string[]): unknown => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  for (const name of names) {
    const value = (body as Record<string, unknown>)[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

/** A body field as a twelve-character hash: already hashed by name (`h:`), or hashed here. */
async function keyOf(value: unknown, io: Io): Promise<string | null> {
  const hashed = hashedValue(value);
  if (hashed) return hashed;
  if (typeof value === "string" && value.length > 0) return io.hash(value);
  return null;
}

/**
 * The keys a request carries in its bodies, by the field names the policy's surface map gives each
 * door (the standards' names by default: RFC 8628's device_code and user_code, RFC 6749's
 * client_id) and the product's hook id (from the catch path's capture group or the creation
 * answer). Read only when the bodies were read; they leave with the bodies, so in the no-bodies
 * form they are null (nothing of a body leaves).
 */
export async function bodyKeys(route: Route, surfaces: CompiledSurfaces | null, requestBody: unknown, responseBody: unknown, authorizeQueryClientId: string | null, hookIdFromPath: string | null, io: Io): Promise<BodyKeys> {
  const keys: BodyKeys = { device_code: null, user_code: null, oauth_client: null, hook: hookIdFromPath };
  const device = surfaces?.device.fields ?? {};
  const oauth = surfaces?.oauth.fields ?? {};
  const credentials = surfaces?.credentials.fields ?? {};
  const hooks = surfaces?.hooks.fields ?? {};
  if (route === "device.start") {
    keys.device_code = await keyOf(field(responseBody, fieldNames(device, "device_code", ["device_code"])), io);
    keys.user_code = await keyOf(field(responseBody, fieldNames(device, "user_code", ["user_code"])), io);
  } else if (route === "device.poll") {
    keys.device_code = await keyOf(field(requestBody, fieldNames(device, "device_code", ["device_code"])), io);
  } else if (route === "device.approve") {
    keys.user_code = await keyOf(field(requestBody, fieldNames(device, "approve_code", ["code", "user_code"])), io);
  } else if (route === "oauth.register") {
    keys.oauth_client = await keyOf(field(responseBody, fieldNames(oauth, "client_id", ["client_id"])), io);
  } else if (route === "oauth.token" || route === "oauth.approve") {
    keys.oauth_client = await keyOf(field(requestBody, fieldNames(oauth, "client_id", ["client_id"])), io);
  } else if (route === "oauth.authorize") {
    keys.oauth_client = authorizeQueryClientId ? await io.hash(authorizeQueryClientId) : null;
  } else if (route === "credentials") {
    keys.oauth_client = await keyOf(field(responseBody, fieldNames(credentials, "client_id", ["client_id"])), io);
  } else if (route === "hooks.create") {
    const url = field(responseBody, fieldNames(hooks, "url", ["url"]));
    const captured = typeof url === "string" ? (surfaces?.hooks.catch?.exec(new URL(url, "https://x.invalid").pathname)?.[1] ?? /\/([^/?#]+)\/?(?:[?#].*)?$/.exec(url)?.[1] ?? null) : null;
    const id = field(responseBody, fieldNames(hooks, "id", ["hook_id", "id"]));
    keys.hook = typeof id === "string" ? id : captured;
  }
  return keys;
}

const asMessages = (body: unknown): Array<Record<string, unknown>> => {
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  return list.filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object" && !Array.isArray(m) && typeof (m as Record<string, unknown>).method === "string");
};

/** What the MCP messages say about themselves: methods, tools called, the client the handshake named. Kept in every form. */
export function mcpFacts(messages: unknown): McpFacts {
  const list = asMessages(messages);
  const facts: McpFacts = { protocol_version: null, methods: [], tools: [], client: null };
  for (const m of list) {
    facts.methods.push(String(m.method));
    const params = m.params && typeof m.params === "object" ? (m.params as Record<string, unknown>) : {};
    if (m.method === "tools/call" && typeof params.name === "string") facts.tools.push(params.name);
    if (m.method === "initialize") {
      if (typeof params.protocolVersion === "string") facts.protocol_version = params.protocolVersion;
      const client = params.clientInfo && typeof params.clientInfo === "object" ? (params.clientInfo as Record<string, unknown>) : null;
      if (client && typeof client.name === "string") facts.client = { name: client.name, version: typeof client.version === "string" ? client.version : null };
    }
  }
  return facts;
}

/** What an OAuth call names about itself, from its parsed (redacted) body or the authorize query. */
export function oauthFacts(route: Route, requestBody: unknown, query: URLSearchParams): OauthFacts | null {
  if (!route.startsWith("oauth.")) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && !hashedValue(v) ? v : null);
  if (route === "oauth.authorize") {
    const clientId = query.get("client_id");
    return { grant_type: null, client_name: null, client_id_url: clientId && /^https?:/.test(clientId) ? clientId : null, resource: query.get("resource"), scope: query.get("scope") };
  }
  const clientId = field(requestBody, ["client_id"]);
  return {
    grant_type: str(field(requestBody, ["grant_type"])),
    client_name: str(field(requestBody, ["client_name"])),
    client_id_url: typeof clientId === "string" && /^https?:/.test(clientId) ? clientId : null,
    resource: str(field(requestBody, ["resource"])),
    scope: str(field(requestBody, ["scope"])),
  };
}
