/**
 * Scope Journeys: the sensor core. Pure functions over Request, Response and a policy; every
 * effect goes through the `io` object the adapter supplies.
 */
export { observe, finish, PROBE_PATH, PROBE_HEADER, type Observation, type State } from "./observe.js";
export { forwardObserved, observeResponse, type Responded } from "./respond.js";
export { verifyWebBotAuth, DIRECTORY_PATH, type SignatureReason, type SignatureResult } from "./webbotauth.js";
export { agentName, assertionClaims, assertionFromEnv, importAssertionKey, resetAssertionKeys, signAssertion, ASSERTION_HEADER, AGENT_HEADER, ASSERTION_TYP, ASSERTION_TTL_SECONDS, type AgentName, type AssertionClaims } from "./assertion.js";
export { compilePolicy, defaultPolicy, effectiveMode, fieldNames, fill, PolicyError, type BodyMatch, type CompiledPolicy, type CompiledRule, type CompiledSurfaces, type Face, type FieldNames, type Mode, type Route, type RuleKind } from "./policy.js";
export { classifyRoute, classifyReader, isTextFace, requestedFace, servedFace, READER_TABLE, AGENT_READERS, type Reader, type RouteInfo, type FetchMetadata } from "./classify.js";
export { mintReference, isReference, findReference, REFERENCE } from "./references.js";
export { redact, redactString, hashedValue } from "./redact.js";
export { outboundHeaders, passHeaders, forwardedUrl, hopUrl, isHost, neverSent, originUrl } from "./gateway.js";
export { readBody, uuidv7, uuidv4, RECORD_SCHEMA, DECLARATION_SCHEMA, POLICY_SCHEMA, BODY_LIMIT, type ReadBody } from "./record.js";
export { bodyKeys, mcpFacts, oauthFacts, type BodyKeys, type McpFacts, type OauthFacts } from "./keys.js";
export { DEFAULT_API_URL, loadPolicy, resetPolicyCache, secureUrl, trustPolicyKeyForTests, type LoadOptions, type PolicyState } from "./policy-loader.js";
export { validatePolicy, validateRecord, findSecretShapedValues, type Finding, type Validation } from "./validate.js";
export { familyOf, type Io, type IoCache, type Facts, type PlatformBot, type SensorRecord, type Source, type Environment, type LogLevel } from "./io.js";
export type { ScopeRequest1 } from "./generated/request.js";
export type { ScopeDeclaration1 } from "./generated/declaration.js";
export type { ScopeDecision1 } from "./generated/decision.js";
export type { ScopePolicy1 } from "./generated/policy.js";
export { VERSION } from "./version.js";
