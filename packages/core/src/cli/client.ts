import { VERSION } from "../version.js";

/**
 * The CLI's client of Scope's public API (plan D19, J2.1): a thin typed fetch over the Journeys
 * resources of the contract's OpenAPI document vendored as `openapi.journeys.json` (the test checks
 * every operation below exists there). No generator at runtime, no dependency: the CLI is an
 * external caller pinned to the contract version the document carries.
 */
export const CONTRACT_VERSION_VENDORED = "1.181.0";

/** Every operation this client performs; `openapi.journeys.json` must carry each one. */
export const CLIENT_OPERATIONS: ReadonlyArray<{ method: "get" | "post"; path: string }> = Object.freeze([
  { method: "post", path: "/v1/installs" },
  { method: "get", path: "/v1/installs/{install_id}" },
  { method: "post", path: "/v1/installs/{install_id}" },
  { method: "post", path: "/v1/installs/{install_id}/keys" },
  { method: "get", path: "/v1/installs/{install_id}/probes/{nonce}" },
]);

export type InstallForm = "cloudflare" | "next" | "vercel-middleware" | "node" | "envoy" | "drain-vercel" | "drain-cloudflare" | "connector-clerk" | "connector-workos" | "connector-auth0";
export type InstallEnvironment = "production" | "preview" | "development";
export type InstallState = "unclaimed" | "waiting" | "live" | "stale" | "revoked";

export interface Install {
  install_id: string;
  customer_id: string | null;
  form: InstallForm;
  hosts: string[];
  environment: InstallEnvironment;
  key_id: string;
  oidc_subject: string | null;
  package: { name: string; version: string; adapter: string } | null;
  policy_id: string | null;
  policy_version: number | null;
  state: InstallState;
  salt_epoch: number;
  first_record_at: string | null;
  first_agent_at: string | null;
  last_record_at: string | null;
  records_day: number;
  batches_day: number;
  observer: Record<string, unknown> | null;
  claim_url: string | null;
  created_at: string;
}

export interface InstallCreateRequest {
  form: InstallForm;
  hosts: string[];
  environment: InstallEnvironment;
  oidc_token?: string;
  package?: { name: string; version: string; adapter: string };
  customer?: string;
  /** The install's public ES256 key (J3.4); accepted by the API from contract 1.175.0 on. */
  assertion_jwk?: Record<string, unknown>;
}

export interface InstallCreateResponse {
  install: Install;
  key?: string;
  claim_url: string | null;
  snippet: { form: string; files: Array<{ path: string; contents: string }> };
}

export type InstallUpdateRequest = { claim_token: string; customer: string } | { policy: string | null } | { status: "revoked" } | { salt_epoch: number } | { assertion_jwk: Record<string, unknown> };

export interface InstallKeyCreateResponse {
  key: string;
  key_id: string;
  previous_expires_at: string;
}

export interface InstallProbeRead {
  found: boolean;
  request_id: string | null;
  ts: string | null;
  facts: Record<string, boolean | number | string | null>;
  missing: Array<{ fact: string; fix: string }>;
}

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
}

export class UnreachableError extends Error {
  override name = "UnreachableError";
}

export interface ClientOptions {
  baseUrl: string;
  /** An install key, an API key or a console session token; null for the unauthenticated install creation. */
  credential?: string | null;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

export interface ApiClient {
  readonly baseUrl: string;
  createInstall(body: InstallCreateRequest, idempotencyKey: string): Promise<InstallCreateResponse>;
  getInstall(installId: string): Promise<Install>;
  updateInstall(installId: string, body: InstallUpdateRequest, idempotencyKey: string): Promise<Install>;
  rotateKey(installId: string, idempotencyKey: string): Promise<InstallKeyCreateResponse>;
  probe(installId: string, nonce: string): Promise<InstallProbeRead>;
}

const retryAfter = (value: string | null): number | null => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.round((at - Date.now()) / 1000)) : null;
};

export function createClient(options: ClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const userAgent = options.userAgent ?? `scope-journeys-cli/${VERSION}`;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": userAgent };
    if (options.credential) headers.authorization = `Bearer ${options.credential}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new UnreachableError(`${baseUrl} is unreachable (${error instanceof Error ? error.message : String(error)})`);
    }
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const envelope = parsed && typeof parsed === "object" ? (parsed as { error?: { code?: unknown; message?: unknown }; request_id?: unknown }) : {};
      const code = typeof envelope.error?.code === "string" ? envelope.error.code : `http_${response.status}`;
      const message = typeof envelope.error?.message === "string" ? envelope.error.message : `${method} ${path} answered ${response.status}`;
      throw new ApiError(response.status, code, message, typeof envelope.request_id === "string" ? envelope.request_id : null, retryAfter(response.headers.get("retry-after")));
    }
    return parsed as T;
  }

  return {
    baseUrl,
    createInstall: (body, idempotencyKey) => call<InstallCreateResponse>("POST", "/v1/installs", body, idempotencyKey),
    getInstall: async (installId) => (await call<{ install: Install }>("GET", `/v1/installs/${encodeURIComponent(installId)}`)).install,
    updateInstall: async (installId, body, idempotencyKey) => (await call<{ install: Install }>("POST", `/v1/installs/${encodeURIComponent(installId)}`, body, idempotencyKey)).install,
    rotateKey: (installId, idempotencyKey) => call<InstallKeyCreateResponse>("POST", `/v1/installs/${encodeURIComponent(installId)}/keys`, {}, idempotencyKey),
    probe: (installId, nonce) => call<InstallProbeRead>("GET", `/v1/installs/${encodeURIComponent(installId)}/probes/${encodeURIComponent(nonce)}`),
  };
}

/** The production API host, the default of JOURNEYS_API_URL (Appendix G.1). */
export const DEFAULT_API_URL = "https://api.tryscope.com";
