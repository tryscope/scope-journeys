/* Generated from schemas/request.json by scripts/types-from-schemas.mjs. Do not edit. */

/**
 * a prefixed, opaque id minted by Scope; records themselves carry a UUIDv7 and no prefix
 */
export type PrefixedId = string;
/**
 * sha256(salt + ':' + value)[0:12]; a join key inside the salt epoch, nothing else
 */
export type Hash12 = string;
/**
 * eight base32 characters: three minting-minute characters, four random, one check
 */
export type Reference = string;

/**
 * One per observed request: the sensor's record. Attribute names follow the OpenTelemetry semantic conventions where one exists (http.*, url.*, server.*, user_agent.original, network.*, tls.*, mcp.*); the rest live under scope.*. Exported as an OTLP log record with event_name scope.request. Additive changes stay in this major; a field's meaning never changes; removal is a new major.
 */
export interface ScopeRequest1 {
  schema: "scope.request/1";
  /**
   * UUIDv7 minted by the sensor; the record's identity and its idempotency key at the ingest
   */
  id: string;
  /**
   * when the request arrived at the sensor
   */
  ts: string;
  /**
   * when the record was complete (after the response went out; at the end of a stream)
   */
  observed_ts?: string;
  /**
   * the install this sensor runs as; null only on a sensor with no install id (a lab deployment)
   */
  install: PrefixedId | null;
  /**
   * the form of the sensor that recorded this
   */
  source: "edge" | "inapp" | "node" | "ext_proc" | "drain";
  observer: {
    /**
     * the npm package of the adapter
     */
    package: string;
    /**
     * the package version (every package takes one version)
     */
    version: string;
    /**
     * cloudflare, next, node, envoy, drain-vercel, drain-cloudflare
     */
    adapter: string;
    /**
     * the policy version the sensor ran this request under; 0 is the embedded forward-only default
     */
    policy_version: number;
    /**
     * the customer's salt epoch the hashes were made in; hashes never join across epochs
     */
    salt_epoch: number;
    /**
     * the Via pseudonym
     */
    name?: string;
  };
  /**
   * the platform's own request id (cf-ray, x-vercel-id, x-amz-cf-id): the one key a connector's record and a sensor's record share
   */
  request_id?: string | null;
  "http.request.method": string;
  /**
   * the host the agent spoke to (the sensor's), which is also a signature's authority
   */
  "server.address": string;
  /**
   * redacted by shape: a value of the product's signed shape is replaced by its hash
   */
  "url.path": string;
  /**
   * the query string without the leading question mark, redacted by shape; references kept; null when the url has none
   */
  "url.query"?: string | null;
  "http.response.status_code"?: number | null;
  /**
   * the surface role of the path, from the policy's surface map
   */
  "scope.route":
    | "docs"
    | "docs_root"
    | "download"
    | "api"
    | "mcp"
    | "oauth.register"
    | "oauth.authorize"
    | "oauth.token"
    | "oauth.approve"
    | "device.start"
    | "device.poll"
    | "device.approve"
    | "signup"
    | "hooks.create"
    | "hooks.catch"
    | "credentials"
    | "trial"
    | "finder"
    | "cli.init"
    | "cli.beacon"
    | "passthrough"
    | "other";
  "http.request.header.content-type"?: string | null;
  "http.response.header.content-type"?: string | null;
  /**
   * the request body's size in bytes, when the body was read
   */
  "scope.request.bytes"?: number | null;
  /**
   * the response body's size in bytes, when the body was read
   */
  "scope.response.bytes"?: number | null;
  /**
   * cf-cache-status or x-vercel-cache as seen on the origin's answer
   */
  "scope.cache"?: string | null;
  "scope.timing"?: {
    /**
     * the origin's answer time as seen from the sensor
     */
    origin_ms?: number | null;
    /**
     * from arrival to the record's completion
     */
    total_ms?: number | null;
  };
  /**
   * a one-way hash of the client's address; the address itself never leaves
   */
  "scope.client.address_hash": string;
  /**
   * so that a dual-stack client seen on two hosts can be read as such
   */
  "scope.client.address_family"?: "ipv4" | "ipv6" | null;
  "scope.client.asn"?: number | null;
  "scope.client.as_org"?: string | null;
  "scope.client.country"?: string | null;
  /**
   * the edge location that served the request
   */
  "scope.client.colo"?: string | null;
  "user_agent.original": string;
  "scope.client.accept"?: string | null;
  /**
   * the browser signals a fetcher does not send: how a browser is told from a tool
   */
  "scope.client.fetch_metadata"?: {
    sec_ch_ua?: boolean;
    sec_fetch_dest?: string | null;
    sec_fetch_mode?: string | null;
    upgrade_insecure?: boolean;
  };
  "tls.protocol.version"?: string | null;
  "network.protocol.version"?: string | null;
  /**
   * the TLS client fingerprint when the platform exposes it
   */
  "scope.client.ja4"?: string | null;
  "scope.client.tls_ext_sha1"?: string | null;
  "scope.client.tls_hello_len"?: number | null;
  "scope.signature"?: {
    /**
     * the Signature-Agent header: the origin that publishes the signing key
     */
    agent: string;
    keyid?: string | null;
    /**
     * true only after the sensor verified the signature against the listed signer's key directory
     */
    valid: boolean;
    /**
     * verified, expired, not_yet_valid, unknown_key, directory_unreachable, bad_signature, unsupported_alg, authority_mismatch, or unlisted_signer (a signer the policy's signers do not list; no directory is fetched)
     */
    reason?: string | null;
    /**
     * the host the signature covers and is verified against (the sensor's)
     */
    authority: string;
  } | null;
  /**
   * the platform's verified-bot match, when the zone has bot management
   */
  "scope.platform_bot"?: {
    verified?: boolean;
    name?: string | null;
    category?: string | null;
    signed_agent?: string | null;
  } | null;
  /**
   * the reader family, from the signature, the agent string, Accept and the fetch metadata; vendor-client is the customer's own CLI or SDK by the policy's clients patterns
   */
  "scope.reader":
    | "claude-code"
    | "claude-ai"
    | "openai"
    | "exa"
    | "signed"
    | "cursor"
    | "vendor-client"
    | "browser"
    | "shell"
    | "unknown";
  /**
   * the hashed bearer of the Authorization header; the value never leaves
   */
  "scope.key.credential"?: Hash12 | null;
  /**
   * the hashed install id the policy's install header carried
   */
  "scope.key.install"?: Hash12 | null;
  /**
   * the hashed device code of a device-flow start or poll, when bodies are recorded
   */
  "scope.key.device_code"?: Hash12 | null;
  /**
   * the hashed user code of a device-flow start or approval, when bodies are recorded
   */
  "scope.key.user_code"?: Hash12 | null;
  /**
   * the hashed OAuth client id of a registration, authorization, approval or token call, when bodies are recorded (the authorize query is read in every form)
   */
  "scope.key.oauth_client"?: Hash12 | null;
  /**
   * the MCP session id the request carried; the one the answer assigned is in scope.response.headers
   */
  "mcp.session.id"?: string | null;
  /**
   * the id of a catch hook, from the catch path or the creation answer
   */
  "scope.key.hook"?: string | null;
  /**
   * the reference the request carried (query, setup header, body field named by the policy); only a value with the reference shape and check character counts, so another value in a reference parameter (a device user code in code= on a sign-in page) is not recorded here (the device door records it as scope.key.user_code)
   */
  "scope.key.reference"?: Reference | null;
  /**
   * the policy's setup header as sent, redacted by shape
   */
  "scope.key.setup_header"?: string | null;
  "scope.key.agent_header"?: string | null;
  "scope.key.client_header"?: string | null;
  /**
   * the policy's intent header as sent; a filled one is also a declaration
   */
  "scope.key.intent_header"?: string | null;
  "mcp.protocol.version"?: string | null;
  /**
   * the JSON-RPC methods of the request's messages, in order; kept in every form
   */
  "mcp.method.name"?: string[];
  /**
   * the tools the request called, in order; kept in every form
   */
  "scope.mcp.tools"?: string[];
  /**
   * the client the MCP handshake named; kept in every form
   */
  "scope.mcp.client"?: {
    name?: string;
    version?: string | null;
  } | null;
  /**
   * what an OAuth call named about itself; kept in every form
   */
  "scope.oauth"?: {
    grant_type?: string | null;
    client_name?: string | null;
    client_id_url?: string | null;
    resource?: string | null;
    scope?: string | null;
  } | null;
  /**
   * the request body on an observed route, parsed as JSON (an object, or an array for a JSON-RPC batch) or a form, redacted by field and by shape, capped at 64 KB; {bytes, type} for a text or HTML body; null in the no-bodies form
   */
  "scope.body.request"?: {} | unknown[] | null;
  /**
   * the same for the origin's answer
   */
  "scope.body.response"?: {} | unknown[] | null;
  /**
   * true when a body exceeded 64 KB and was cut before parsing
   */
  "scope.body.truncated"?: boolean;
  /**
   * the answer headers the stitcher needs: content-type, mcp-session-id, www-authenticate, location (redacted), cache-control, x-vercel-cache, cf-cache-status
   */
  "scope.response.headers"?: {} | null;
  /**
   * present on a page read (a docs page, the root map, the helpful 404)
   */
  "scope.page"?: {
    /**
     * the page's path without a face suffix
     */
    canonical?: string;
    face?: "html" | "md" | "txt" | "404-html" | "404-md";
    /**
     * the reference minted into this serve of the page, when an inject rule placed it
     */
    reference_minted?: Reference | null;
    /**
     * the labels of the inject rules that changed the page
     */
    injected?: string[];
    bytes?: number;
  } | null;
  /**
   * a reference minted into a non-page answer (an error link, a finder answer); a page's reference, the helpful 404's included, is scope.page.reference_minted
   */
  "scope.reference_minted"?: Reference | null;
  /**
   * what every rule that matched did, in rule order, and the observer's own steps as rules of kind observe: `assertion` (the assertion could not be signed) and `hop` (errored: the hop failed after the request may have left, answered 502, or 504 on a timeout, and not sent again; skipped: the request was handed on without the hop, because the hop never left or its Via already named this sensor without the marker, so the record holds the request side and no response)
   */
  "scope.decision"?: Decision[];
  /**
   * on the MCP route: how many messages the gate answered and how many it forwarded
   */
  "scope.gateway"?: {
    declared?: number;
    forwarded?: number;
  } | null;
  /**
   * the sensor's own errors on this request, by class; the request was forwarded untouched
   */
  "scope.observer.errors"?: string[];
  /**
   * records the sensor failed to ship since its last successful shipment
   */
  "scope.observer.dropped"?: number;
}
export interface Decision {
  rule: string;
  kind: "observe" | "inject" | "gate" | "finder" | "notfound" | "error" | "face";
  mode: "dry_run" | "live";
  outcome: "applied" | "would_apply" | "skipped" | "errored";
  reason?: string | null;
}
