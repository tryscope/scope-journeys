// Canonical JSON (sorted keys at every depth, arrays in order, numbers as JSON, strings as is) and
// the volatile-field mask the identity test, the oracle and the fixtures share. Web APIs only: the
// workerd test imports this file too.
import mask from "./mask.json" with { type: "json" };

export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

const REF_QUERY = /\?ref=[0-9A-HJKMNP-TV-Z]{8}/g;
const REF_HEADER = /((?:X-[A-Za-z]+-Setup)(?:: |&quot;: &quot;|": "))[0-9A-HJKMNP-TV-Z]{8}/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// An ES256 assertion (x-scope-assertion): the signature segment (64 bytes, 86 characters) is randomised per signing; the header and the claims are not.
const JWS_SIGNATURE = /(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)[A-Za-z0-9_-]{86}(?![A-Za-z0-9_-])/g;

/** References and ids inside a body or a header value, replaced by their placeholders. */
export function maskText(text) {
  if (typeof text !== "string") return text;
  return text.replace(REF_QUERY, "?ref=REF").replace(REF_HEADER, "$1REF").replace(UUID, "UUID").replace(JWS_SIGNATURE, "$1SIG");
}

function maskDeep(value) {
  if (typeof value === "string") return maskText(value);
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v)]));
  return value;
}

/**
 * A record with its volatile fields masked: the listed paths (Appendix F.1) become "MASKED" when
 * present and non-null, references inside strings become REF, uuids become UUID.
 */
export function applyMask(record) {
  const out = maskDeep(structuredClone(record));
  for (const path of mask.fields) {
    let node = out;
    for (let i = 0; i < path.length - 1; i += 1) {
      node = node?.[path[i]];
      if (!node || typeof node !== "object") break;
    }
    const last = path[path.length - 1];
    if (node && typeof node === "object" && node[last] !== undefined && node[last] !== null) node[last] = "MASKED";
  }
  return out;
}

/** A response (status, headers, body) with the same masks on its header values and its body. */
export function maskResponse(response) {
  const headers = Object.fromEntries(Object.entries(response.headers ?? {}).filter(([k]) => !mask.volatileHeaders.includes(k.toLowerCase())).map(([k, v]) => [k.toLowerCase(), maskText(v)]));
  return { status: response.status, headers, body: maskText(response.body) };
}
