/* Generated from schemas/declaration.json by scripts/types-from-schemas.mjs. Do not edit. */

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
 * An intent the sensor collected: from the declaration tool in front of the MCP route (gate), from the intent header on an API call (header), from the docs finder (finder), from the SDK's intent option (sdk) or the CLI (cli). Exported as an OTLP log record with event_name scope.intent. Shipped as its own record beside the request it rode on.
 */
export interface ScopeDeclaration1 {
  schema: "scope.declaration/1";
  /**
   * UUIDv7 minted by the sensor; the record's own identity and its idempotency key at the ingest
   */
  id: string;
  ts: string;
  /**
   * the install this sensor runs as; null only on a sensor with no install id (a lab deployment)
   */
  install: PrefixedId | null;
  /**
   * the request record the declaration rode on, when one did
   */
  request?: string | null;
  source: "gate" | "header" | "finder" | "sdk" | "cli";
  /**
   * the sentence the agent gave, redacted like url.query and by shape (a declaration that is no sentence: its arguments as JSON, redacted like a body)
   */
  text: string;
  /**
   * the task category the agent chose, when the declaration tool asked for one
   */
  task?: string | null;
  /**
   * how the agent says it found the product, when asked
   */
  found_via?: string | null;
  /**
   * the agent's own name for itself, when it gave one
   */
  agent?: string | null;
  "scope.client.address_hash": Hash12;
  /**
   * the hashed bearer of the call that carried the declaration
   */
  "scope.key.credential"?: Hash12 | null;
  /**
   * the hash of the MCP session id the declaration was made in
   */
  "mcp.session.id"?: string | null;
  /**
   * the page reference the call arrived with
   */
  "scope.key.reference"?: Reference | null;
  /**
   * the reference minted into the finder's answer
   */
  "scope.reference_minted"?: Reference | null;
}
