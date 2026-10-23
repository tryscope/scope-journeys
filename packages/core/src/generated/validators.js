/* Generated from schemas/*.json by scripts/types-from-schemas.mjs (ajv standalone, ESM). Do not edit. */
"use strict";
export const validateRequest = validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://journeys.tryscope.com/schemas/journeys/1/request","title":"scope.request/1","description":"One per observed request: the sensor's record. Attribute names follow the OpenTelemetry semantic conventions where one exists (http.*, url.*, server.*, user_agent.original, network.*, tls.*, mcp.*); the rest live under scope.*. Exported as an OTLP log record with event_name scope.request. Additive changes stay in this major; a field's meaning never changes; removal is a new major.","$defs":{"hash12":{"type":"string","pattern":"^[0-9a-f]{12}$","description":"sha256(salt + ':' + value)[0:12]; a join key inside the salt epoch, nothing else"},"reference":{"type":"string","pattern":"^[0-9A-HJKMNP-TV-Z]{8}$","description":"eight base32 characters: three minting-minute characters, four random, one check"},"prefixedId":{"type":"string","pattern":"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$","description":"a prefixed, opaque id minted by Scope; records themselves carry a UUIDv7 and no prefix"},"decision":{"type":"object","required":["rule","kind","mode","outcome"],"properties":{"rule":{"type":"string"},"kind":{"type":"string","enum":["observe","inject","gate","finder","notfound","error","face"]},"mode":{"type":"string","enum":["dry_run","live"]},"outcome":{"type":"string","enum":["applied","would_apply","skipped","errored"]},"reason":{"type":["string","null"]}},"additionalProperties":false}},"type":"object","required":["schema","id","ts","install","source","observer","http.request.method","server.address","url.path","scope.route","scope.client.address_hash","user_agent.original","scope.reader"],"properties":{"schema":{"const":"scope.request/1"},"id":{"type":"string","format":"uuid","description":"UUIDv7 minted by the sensor; the record's identity and its idempotency key at the ingest"},"ts":{"type":"string","format":"date-time","description":"when the request arrived at the sensor"},"observed_ts":{"type":"string","format":"date-time","description":"when the record was complete (after the response went out; at the end of a stream)"},"install":{"oneOf":[{"$ref":"#/$defs/prefixedId"},{"type":"null"}],"description":"the install this sensor runs as; null only on a sensor with no install id (a lab deployment)"},"source":{"type":"string","enum":["edge","inapp","node","ext_proc","drain"],"description":"the form of the sensor that recorded this"},"observer":{"type":"object","required":["package","version","adapter","policy_version","salt_epoch"],"properties":{"package":{"type":"string","description":"the npm package of the adapter"},"version":{"type":"string","description":"the package version (every package takes one version)"},"adapter":{"type":"string","description":"cloudflare, next, node, envoy, drain-vercel, drain-cloudflare"},"policy_version":{"type":"integer","description":"the policy version the sensor ran this request under; 0 is the embedded forward-only default"},"salt_epoch":{"type":"integer","description":"the customer's salt epoch the hashes were made in; hashes never join across epochs"},"name":{"type":"string","description":"the Via pseudonym"}},"additionalProperties":false},"request_id":{"type":["string","null"],"description":"the platform's own request id (cf-ray, x-vercel-id, x-amz-cf-id): the one key a connector's record and a sensor's record share"},"http.request.method":{"type":"string"},"server.address":{"type":"string","description":"the host the agent spoke to (the sensor's), which is also a signature's authority"},"url.path":{"type":"string","description":"redacted like url.query (a secret-named pair's value, and a segment holding an encoded pair from its start, become h:<hash>), then by shape: a value of the product's signed shape is replaced by its hash"},"url.query":{"type":["string","null"],"description":"the query string without the leading question mark; the value of a secret-named parameter (api_key, key, token, access_token, refresh_token, id_token, code, client_secret, password, secret, signature, sig, session_id, in any case or spelling, also percent-encoded, or a name whose last word is key, token, secret, password, signature or sig, also inside a URL another parameter carries) becomes h:<hash>, unless it is a valid reference code where the policy says a reference travels (headers.reference, a door's fields.reference); a value that carries an encoded parameter of its own, or is still encoded after four decodings, becomes h:<hash> from the start of the path segment that holds it; a string holding more than 64 such values is recorded as one hash; then redacted by shape; null when the url has none"},"http.response.status_code":{"type":["integer","null"]},"scope.route":{"type":"string","enum":["docs","docs_root","download","api","mcp","oauth.register","oauth.authorize","oauth.token","oauth.approve","device.start","device.poll","device.approve","signup","hooks.create","hooks.catch","credentials","trial","finder","cli.init","cli.beacon","passthrough","other"],"description":"the surface role of the path, from the policy's surface map"},"http.request.header.content-type":{"type":["string","null"]},"http.response.header.content-type":{"type":["string","null"]},"scope.request.bytes":{"type":["integer","null"],"description":"the request body's size in bytes, when the body was read"},"scope.response.bytes":{"type":["integer","null"],"description":"the response body's size, when the body was read or, for an event stream, counted as it passed (in bytes)"},"scope.cache":{"type":["string","null"],"description":"cf-cache-status or x-vercel-cache as seen on the origin's answer"},"scope.timing":{"type":"object","properties":{"origin_ms":{"type":["integer","null"],"description":"the origin's answer time as seen from the sensor"},"total_ms":{"type":["integer","null"],"description":"from arrival to the record's completion"}},"additionalProperties":false},"scope.client.address_hash":{"$ref":"#/$defs/hash12","description":"a one-way hash of the client's address; the address itself never leaves"},"scope.client.address_family":{"type":["string","null"],"enum":["ipv4","ipv6",null],"description":"so that a dual-stack client seen on two hosts can be read as such"},"scope.client.asn":{"type":["integer","null"]},"scope.client.as_org":{"type":["string","null"]},"scope.client.country":{"type":["string","null"]},"scope.client.colo":{"type":["string","null"],"description":"the edge location that served the request"},"user_agent.original":{"type":"string"},"scope.client.accept":{"type":["string","null"]},"scope.client.fetch_metadata":{"type":"object","properties":{"sec_ch_ua":{"type":"boolean"},"sec_fetch_dest":{"type":["string","null"]},"sec_fetch_mode":{"type":["string","null"]},"upgrade_insecure":{"type":"boolean"}},"additionalProperties":false,"description":"the browser signals a fetcher does not send: how a browser is told from a tool"},"tls.protocol.version":{"type":["string","null"]},"network.protocol.version":{"type":["string","null"]},"scope.client.ja4":{"type":["string","null"],"description":"the TLS client fingerprint when the platform exposes it"},"scope.client.tls_ext_sha1":{"type":["string","null"]},"scope.client.tls_hello_len":{"type":["integer","null"]},"scope.signature":{"type":["object","null"],"required":["agent","valid","authority"],"properties":{"agent":{"type":"string","description":"the Signature-Agent header: the origin that publishes the signing key"},"keyid":{"type":["string","null"]},"valid":{"type":"boolean","description":"true only after the sensor verified the signature against the listed signer's key directory"},"reason":{"type":["string","null"],"description":"verified, expired, not_yet_valid, unknown_key, directory_unreachable, bad_signature, unsupported_alg, authority_mismatch, or unlisted_signer (a signer the policy's signers do not list; no directory is fetched)"},"authority":{"type":"string","description":"the host the signature covers and is verified against (the sensor's)"}},"additionalProperties":false},"scope.platform_bot":{"type":["object","null"],"properties":{"verified":{"type":"boolean"},"name":{"type":["string","null"]},"category":{"type":["string","null"]},"signed_agent":{"type":["string","null"]}},"additionalProperties":false,"description":"the platform's verified-bot match, when the zone has bot management"},"scope.reader":{"type":"string","enum":["claude-code","claude-ai","openai","exa","signed","cursor","vendor-client","browser","shell","unknown"],"description":"the reader family, from the signature, the agent string, Accept and the fetch metadata; vendor-client is the customer's own CLI or SDK by the policy's clients patterns"},"scope.key.credential":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed bearer of the Authorization header; the value never leaves"},"scope.key.install":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed install id the policy's install header carried"},"scope.key.device_code":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed device code of a device-flow start or poll, when bodies are recorded"},"scope.key.user_code":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed user code of a device-flow start or approval, when bodies are recorded"},"scope.key.oauth_client":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed OAuth client id of a registration, authorization, approval or token call, when bodies are recorded (the authorize query is read in every form)"},"mcp.session.id":{"type":["string","null"],"description":"the hash of the MCP session id the request carried; the one the answer assigned is in scope.response.headers, hashed the same way"},"scope.key.hook":{"type":["string","null"],"description":"the id of a catch hook, from the catch path or the creation answer"},"scope.key.reference":{"oneOf":[{"$ref":"#/$defs/reference"},{"type":"null"}],"description":"the reference the request carried (query, setup header, body field named by the policy); only a value with the reference shape and check character counts, so another value in a reference parameter (a device user code in code= on a sign-in page) is not recorded here (the device door records it as scope.key.user_code)"},"scope.key.setup_header":{"type":["string","null"],"description":"the policy's setup header: a valid reference code as sent, any other value (the session id the gate hands out) hashed like mcp.session.id"},"scope.key.agent_header":{"type":["string","null"]},"scope.key.client_header":{"type":["string","null"]},"scope.key.intent_header":{"type":["string","null"],"description":"the policy's intent header, redacted like url.query and by shape; a filled one is also a declaration"},"mcp.protocol.version":{"type":["string","null"]},"mcp.method.name":{"type":"array","items":{"type":"string"},"description":"the JSON-RPC methods of the request's messages, in order; kept in every form"},"scope.mcp.tools":{"type":"array","items":{"type":"string"},"description":"the tools the request called, in order; kept in every form"},"scope.mcp.client":{"type":["object","null"],"properties":{"name":{"type":"string"},"version":{"type":["string","null"]}},"additionalProperties":false,"description":"the client the MCP handshake named; kept in every form"},"scope.oauth":{"type":["object","null"],"properties":{"grant_type":{"type":["string","null"]},"client_name":{"type":["string","null"]},"client_id_url":{"type":["string","null"]},"resource":{"type":["string","null"]},"scope":{"type":["string","null"]}},"additionalProperties":false,"description":"what an OAuth call named about itself; kept in every form"},"scope.body.request":{"type":["object","array","null"],"description":"the request body on an observed route, parsed as JSON or a form (capped at 64 KB), cut to the fields observe.bodies.allow_fields names at any depth, with the values of the policy's secret fields and of the secret names (as in url.query; code only in a request) and the shapes hashed; null when no allowed field remains and in the no-bodies form"},"scope.body.response":{"type":["object","array","null"],"description":"the same for the origin's answer, also on an error answer (400 or above) from any route the surface map does not pass through; an event stream's content is never recorded, only its size in scope.response.bytes"},"scope.body.truncated":{"type":"boolean","description":"true when a body exceeded 64 KB and was cut before parsing"},"scope.response.headers":{"type":["object","null"],"description":"the answer headers the stitcher needs: content-type, mcp-session-id (hashed), www-authenticate, location (redacted like url.query), cache-control, x-vercel-cache, cf-cache-status"},"scope.page":{"type":["object","null"],"properties":{"canonical":{"type":"string","description":"the page's path without a face suffix"},"face":{"type":"string","enum":["html","md","txt","404-html","404-md"]},"reference_minted":{"oneOf":[{"$ref":"#/$defs/reference"},{"type":"null"}],"description":"the reference minted into this serve of the page, when an inject rule placed it"},"injected":{"type":"array","items":{"type":"string"},"description":"the labels of the inject rules that changed the page"},"bytes":{"type":"integer"}},"additionalProperties":false,"description":"present on a page read (a docs page, the root map, the helpful 404)"},"scope.reference_minted":{"oneOf":[{"$ref":"#/$defs/reference"},{"type":"null"}],"description":"a reference minted into a non-page answer (an error link, a finder answer); a page's reference, the helpful 404's included, is scope.page.reference_minted"},"scope.decision":{"type":"array","items":{"$ref":"#/$defs/decision"},"description":"what every rule that matched did, in rule order, and the observer's own steps as rules of kind observe: `policy` (the embedded default ran: errored, reason `built-in default: <why>`), `assertion` (the assertion could not be signed) and `hop` (errored: the hop failed after the request may have left, answered 502, or 504 on a timeout, and not sent again; skipped: the request was handed on without the hop, because the hop never left or its Via already named this sensor without the marker, so the record holds the request side, on a Node mount without the body it left unread for the app, and no response)"},"scope.gateway":{"type":["object","null"],"properties":{"declared":{"type":"integer"},"forwarded":{"type":"integer"}},"additionalProperties":false,"description":"on the MCP route: how many messages the gate answered and how many it forwarded"},"scope.observer.errors":{"type":"array","items":{"type":"string"},"description":"the sensor's own errors on this request, by class; the request was forwarded untouched"},"scope.observer.dropped":{"type":"integer","description":"records the sensor failed to ship since its last successful shipment"}},"additionalProperties":false};
const schema32 = {"type":"string","pattern":"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$","description":"a prefixed, opaque id minted by Scope; records themselves carry a UUIDv7 and no prefix"};
const schema33 = {"type":"string","pattern":"^[0-9a-f]{12}$","description":"sha256(salt + ':' + value)[0:12]; a join key inside the salt epoch, nothing else"};
const schema39 = {"type":"string","pattern":"^[0-9A-HJKMNP-TV-Z]{8}$","description":"eight base32 characters: three minting-minute characters, four random, one check"};
const schema42 = {"type":"object","required":["rule","kind","mode","outcome"],"properties":{"rule":{"type":"string"},"kind":{"type":"string","enum":["observe","inject","gate","finder","notfound","error","face"]},"mode":{"type":"string","enum":["dry_run","live"]},"outcome":{"type":"string","enum":["applied","would_apply","skipped","errored"]},"reason":{"type":["string","null"]}},"additionalProperties":false};
const func1 = Object.prototype.hasOwnProperty;
const formats0 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats2 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const pattern4 = new RegExp("^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$", "u");
const pattern5 = new RegExp("^[0-9a-f]{12}$", "u");
const pattern11 = new RegExp("^[0-9A-HJKMNP-TV-Z]{8}$", "u");

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://journeys.tryscope.com/schemas/journeys/1/request" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.ts === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ts"},message:"must have required property '"+"ts"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.install === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "install"},message:"must have required property '"+"install"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.source === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.observer === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "observer"},message:"must have required property '"+"observer"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data["http.request.method"] === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "http.request.method"},message:"must have required property '"+"http.request.method"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data["server.address"] === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "server.address"},message:"must have required property '"+"server.address"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data["url.path"] === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "url.path"},message:"must have required property '"+"url.path"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data["scope.route"] === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scope.route"},message:"must have required property '"+"scope.route"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data["scope.client.address_hash"] === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scope.client.address_hash"},message:"must have required property '"+"scope.client.address_hash"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data["user_agent.original"] === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "user_agent.original"},message:"must have required property '"+"user_agent.original"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data["scope.reader"] === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scope.reader"},message:"must have required property '"+"scope.reader"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err13 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.schema !== undefined){
if("scope.request/1" !== data.schema){
const err14 = {instancePath:instancePath+"/schema",schemaPath:"#/properties/schema/const",keyword:"const",params:{allowedValue: "scope.request/1"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!(formats0.test(data1))){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/format",keyword:"format",params:{format: "uuid"},message:"must match format \""+"uuid"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.ts !== undefined){
let data2 = data.ts;
if(typeof data2 === "string"){
if(!(formats2.test(data2))){
const err17 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.observed_ts !== undefined){
let data3 = data.observed_ts;
if(typeof data3 === "string"){
if(!(formats2.test(data3))){
const err19 = {instancePath:instancePath+"/observed_ts",schemaPath:"#/properties/observed_ts/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/observed_ts",schemaPath:"#/properties/observed_ts/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.install !== undefined){
let data4 = data.install;
const _errs10 = errors;
let valid1 = false;
let passing0 = null;
const _errs11 = errors;
if(typeof data4 === "string"){
if(!pattern4.test(data4)){
const err21 = {instancePath:instancePath+"/install",schemaPath:"#/$defs/prefixedId/pattern",keyword:"pattern",params:{pattern: "^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$"},message:"must match pattern \""+"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/install",schemaPath:"#/$defs/prefixedId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs11 === errors;
if(_valid0){
valid1 = true;
passing0 = 0;
}
const _errs14 = errors;
if(data4 !== null){
const err23 = {instancePath:instancePath+"/install",schemaPath:"#/properties/install/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid1 = true;
passing0 = 1;
}
}
if(!valid1){
const err24 = {instancePath:instancePath+"/install",schemaPath:"#/properties/install/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
if(data.source !== undefined){
let data5 = data.source;
if(typeof data5 !== "string"){
const err25 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(((((data5 === "edge") || (data5 === "inapp")) || (data5 === "node")) || (data5 === "ext_proc")) || (data5 === "drain"))){
const err26 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema31.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.observer !== undefined){
let data6 = data.observer;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.package === undefined){
const err27 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/required",keyword:"required",params:{missingProperty: "package"},message:"must have required property '"+"package"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data6.version === undefined){
const err28 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data6.adapter === undefined){
const err29 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/required",keyword:"required",params:{missingProperty: "adapter"},message:"must have required property '"+"adapter"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data6.policy_version === undefined){
const err30 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/required",keyword:"required",params:{missingProperty: "policy_version"},message:"must have required property '"+"policy_version"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data6.salt_epoch === undefined){
const err31 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/required",keyword:"required",params:{missingProperty: "salt_epoch"},message:"must have required property '"+"salt_epoch"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key1 in data6){
if(!((((((key1 === "package") || (key1 === "version")) || (key1 === "adapter")) || (key1 === "policy_version")) || (key1 === "salt_epoch")) || (key1 === "name"))){
const err32 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data6.package !== undefined){
if(typeof data6.package !== "string"){
const err33 = {instancePath:instancePath+"/observer/package",schemaPath:"#/properties/observer/properties/package/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data6.version !== undefined){
if(typeof data6.version !== "string"){
const err34 = {instancePath:instancePath+"/observer/version",schemaPath:"#/properties/observer/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data6.adapter !== undefined){
if(typeof data6.adapter !== "string"){
const err35 = {instancePath:instancePath+"/observer/adapter",schemaPath:"#/properties/observer/properties/adapter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data6.policy_version !== undefined){
let data10 = data6.policy_version;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err36 = {instancePath:instancePath+"/observer/policy_version",schemaPath:"#/properties/observer/properties/policy_version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data6.salt_epoch !== undefined){
let data11 = data6.salt_epoch;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err37 = {instancePath:instancePath+"/observer/salt_epoch",schemaPath:"#/properties/observer/properties/salt_epoch/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data6.name !== undefined){
if(typeof data6.name !== "string"){
const err38 = {instancePath:instancePath+"/observer/name",schemaPath:"#/properties/observer/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
else {
const err39 = {instancePath:instancePath+"/observer",schemaPath:"#/properties/observer/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.request_id !== undefined){
let data13 = data.request_id;
if((typeof data13 !== "string") && (data13 !== null)){
const err40 = {instancePath:instancePath+"/request_id",schemaPath:"#/properties/request_id/type",keyword:"type",params:{type: schema31.properties.request_id.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data["http.request.method"] !== undefined){
if(typeof data["http.request.method"] !== "string"){
const err41 = {instancePath:instancePath+"/http.request.method",schemaPath:"#/properties/http.request.method/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data["server.address"] !== undefined){
if(typeof data["server.address"] !== "string"){
const err42 = {instancePath:instancePath+"/server.address",schemaPath:"#/properties/server.address/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data["url.path"] !== undefined){
if(typeof data["url.path"] !== "string"){
const err43 = {instancePath:instancePath+"/url.path",schemaPath:"#/properties/url.path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data["url.query"] !== undefined){
let data17 = data["url.query"];
if((typeof data17 !== "string") && (data17 !== null)){
const err44 = {instancePath:instancePath+"/url.query",schemaPath:"#/properties/url.query/type",keyword:"type",params:{type: schema31.properties["url.query"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data["http.response.status_code"] !== undefined){
let data18 = data["http.response.status_code"];
if((!(((typeof data18 == "number") && (!(data18 % 1) && !isNaN(data18))) && (isFinite(data18)))) && (data18 !== null)){
const err45 = {instancePath:instancePath+"/http.response.status_code",schemaPath:"#/properties/http.response.status_code/type",keyword:"type",params:{type: schema31.properties["http.response.status_code"].type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data["scope.route"] !== undefined){
let data19 = data["scope.route"];
if(typeof data19 !== "string"){
const err46 = {instancePath:instancePath+"/scope.route",schemaPath:"#/properties/scope.route/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!((((((((((((((((((((((data19 === "docs") || (data19 === "docs_root")) || (data19 === "download")) || (data19 === "api")) || (data19 === "mcp")) || (data19 === "oauth.register")) || (data19 === "oauth.authorize")) || (data19 === "oauth.token")) || (data19 === "oauth.approve")) || (data19 === "device.start")) || (data19 === "device.poll")) || (data19 === "device.approve")) || (data19 === "signup")) || (data19 === "hooks.create")) || (data19 === "hooks.catch")) || (data19 === "credentials")) || (data19 === "trial")) || (data19 === "finder")) || (data19 === "cli.init")) || (data19 === "cli.beacon")) || (data19 === "passthrough")) || (data19 === "other"))){
const err47 = {instancePath:instancePath+"/scope.route",schemaPath:"#/properties/scope.route/enum",keyword:"enum",params:{allowedValues: schema31.properties["scope.route"].enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data["http.request.header.content-type"] !== undefined){
let data20 = data["http.request.header.content-type"];
if((typeof data20 !== "string") && (data20 !== null)){
const err48 = {instancePath:instancePath+"/http.request.header.content-type",schemaPath:"#/properties/http.request.header.content-type/type",keyword:"type",params:{type: schema31.properties["http.request.header.content-type"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data["http.response.header.content-type"] !== undefined){
let data21 = data["http.response.header.content-type"];
if((typeof data21 !== "string") && (data21 !== null)){
const err49 = {instancePath:instancePath+"/http.response.header.content-type",schemaPath:"#/properties/http.response.header.content-type/type",keyword:"type",params:{type: schema31.properties["http.response.header.content-type"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data["scope.request.bytes"] !== undefined){
let data22 = data["scope.request.bytes"];
if((!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))) && (data22 !== null)){
const err50 = {instancePath:instancePath+"/scope.request.bytes",schemaPath:"#/properties/scope.request.bytes/type",keyword:"type",params:{type: schema31.properties["scope.request.bytes"].type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data["scope.response.bytes"] !== undefined){
let data23 = data["scope.response.bytes"];
if((!(((typeof data23 == "number") && (!(data23 % 1) && !isNaN(data23))) && (isFinite(data23)))) && (data23 !== null)){
const err51 = {instancePath:instancePath+"/scope.response.bytes",schemaPath:"#/properties/scope.response.bytes/type",keyword:"type",params:{type: schema31.properties["scope.response.bytes"].type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data["scope.cache"] !== undefined){
let data24 = data["scope.cache"];
if((typeof data24 !== "string") && (data24 !== null)){
const err52 = {instancePath:instancePath+"/scope.cache",schemaPath:"#/properties/scope.cache/type",keyword:"type",params:{type: schema31.properties["scope.cache"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data["scope.timing"] !== undefined){
let data25 = data["scope.timing"];
if(data25 && typeof data25 == "object" && !Array.isArray(data25)){
for(const key2 in data25){
if(!((key2 === "origin_ms") || (key2 === "total_ms"))){
const err53 = {instancePath:instancePath+"/scope.timing",schemaPath:"#/properties/scope.timing/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data25.origin_ms !== undefined){
let data26 = data25.origin_ms;
if((!(((typeof data26 == "number") && (!(data26 % 1) && !isNaN(data26))) && (isFinite(data26)))) && (data26 !== null)){
const err54 = {instancePath:instancePath+"/scope.timing/origin_ms",schemaPath:"#/properties/scope.timing/properties/origin_ms/type",keyword:"type",params:{type: schema31.properties["scope.timing"].properties.origin_ms.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data25.total_ms !== undefined){
let data27 = data25.total_ms;
if((!(((typeof data27 == "number") && (!(data27 % 1) && !isNaN(data27))) && (isFinite(data27)))) && (data27 !== null)){
const err55 = {instancePath:instancePath+"/scope.timing/total_ms",schemaPath:"#/properties/scope.timing/properties/total_ms/type",keyword:"type",params:{type: schema31.properties["scope.timing"].properties.total_ms.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
}
else {
const err56 = {instancePath:instancePath+"/scope.timing",schemaPath:"#/properties/scope.timing/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data["scope.client.address_hash"] !== undefined){
let data28 = data["scope.client.address_hash"];
if(typeof data28 === "string"){
if(!pattern5.test(data28)){
const err57 = {instancePath:instancePath+"/scope.client.address_hash",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
else {
const err58 = {instancePath:instancePath+"/scope.client.address_hash",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data["scope.client.address_family"] !== undefined){
let data29 = data["scope.client.address_family"];
if((typeof data29 !== "string") && (data29 !== null)){
const err59 = {instancePath:instancePath+"/scope.client.address_family",schemaPath:"#/properties/scope.client.address_family/type",keyword:"type",params:{type: schema31.properties["scope.client.address_family"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!(((data29 === "ipv4") || (data29 === "ipv6")) || (data29 === null))){
const err60 = {instancePath:instancePath+"/scope.client.address_family",schemaPath:"#/properties/scope.client.address_family/enum",keyword:"enum",params:{allowedValues: schema31.properties["scope.client.address_family"].enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data["scope.client.asn"] !== undefined){
let data30 = data["scope.client.asn"];
if((!(((typeof data30 == "number") && (!(data30 % 1) && !isNaN(data30))) && (isFinite(data30)))) && (data30 !== null)){
const err61 = {instancePath:instancePath+"/scope.client.asn",schemaPath:"#/properties/scope.client.asn/type",keyword:"type",params:{type: schema31.properties["scope.client.asn"].type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data["scope.client.as_org"] !== undefined){
let data31 = data["scope.client.as_org"];
if((typeof data31 !== "string") && (data31 !== null)){
const err62 = {instancePath:instancePath+"/scope.client.as_org",schemaPath:"#/properties/scope.client.as_org/type",keyword:"type",params:{type: schema31.properties["scope.client.as_org"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data["scope.client.country"] !== undefined){
let data32 = data["scope.client.country"];
if((typeof data32 !== "string") && (data32 !== null)){
const err63 = {instancePath:instancePath+"/scope.client.country",schemaPath:"#/properties/scope.client.country/type",keyword:"type",params:{type: schema31.properties["scope.client.country"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data["scope.client.colo"] !== undefined){
let data33 = data["scope.client.colo"];
if((typeof data33 !== "string") && (data33 !== null)){
const err64 = {instancePath:instancePath+"/scope.client.colo",schemaPath:"#/properties/scope.client.colo/type",keyword:"type",params:{type: schema31.properties["scope.client.colo"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data["user_agent.original"] !== undefined){
if(typeof data["user_agent.original"] !== "string"){
const err65 = {instancePath:instancePath+"/user_agent.original",schemaPath:"#/properties/user_agent.original/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data["scope.client.accept"] !== undefined){
let data35 = data["scope.client.accept"];
if((typeof data35 !== "string") && (data35 !== null)){
const err66 = {instancePath:instancePath+"/scope.client.accept",schemaPath:"#/properties/scope.client.accept/type",keyword:"type",params:{type: schema31.properties["scope.client.accept"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data["scope.client.fetch_metadata"] !== undefined){
let data36 = data["scope.client.fetch_metadata"];
if(data36 && typeof data36 == "object" && !Array.isArray(data36)){
for(const key3 in data36){
if(!((((key3 === "sec_ch_ua") || (key3 === "sec_fetch_dest")) || (key3 === "sec_fetch_mode")) || (key3 === "upgrade_insecure"))){
const err67 = {instancePath:instancePath+"/scope.client.fetch_metadata",schemaPath:"#/properties/scope.client.fetch_metadata/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data36.sec_ch_ua !== undefined){
if(typeof data36.sec_ch_ua !== "boolean"){
const err68 = {instancePath:instancePath+"/scope.client.fetch_metadata/sec_ch_ua",schemaPath:"#/properties/scope.client.fetch_metadata/properties/sec_ch_ua/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data36.sec_fetch_dest !== undefined){
let data38 = data36.sec_fetch_dest;
if((typeof data38 !== "string") && (data38 !== null)){
const err69 = {instancePath:instancePath+"/scope.client.fetch_metadata/sec_fetch_dest",schemaPath:"#/properties/scope.client.fetch_metadata/properties/sec_fetch_dest/type",keyword:"type",params:{type: schema31.properties["scope.client.fetch_metadata"].properties.sec_fetch_dest.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data36.sec_fetch_mode !== undefined){
let data39 = data36.sec_fetch_mode;
if((typeof data39 !== "string") && (data39 !== null)){
const err70 = {instancePath:instancePath+"/scope.client.fetch_metadata/sec_fetch_mode",schemaPath:"#/properties/scope.client.fetch_metadata/properties/sec_fetch_mode/type",keyword:"type",params:{type: schema31.properties["scope.client.fetch_metadata"].properties.sec_fetch_mode.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data36.upgrade_insecure !== undefined){
if(typeof data36.upgrade_insecure !== "boolean"){
const err71 = {instancePath:instancePath+"/scope.client.fetch_metadata/upgrade_insecure",schemaPath:"#/properties/scope.client.fetch_metadata/properties/upgrade_insecure/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath:instancePath+"/scope.client.fetch_metadata",schemaPath:"#/properties/scope.client.fetch_metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data["tls.protocol.version"] !== undefined){
let data41 = data["tls.protocol.version"];
if((typeof data41 !== "string") && (data41 !== null)){
const err73 = {instancePath:instancePath+"/tls.protocol.version",schemaPath:"#/properties/tls.protocol.version/type",keyword:"type",params:{type: schema31.properties["tls.protocol.version"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data["network.protocol.version"] !== undefined){
let data42 = data["network.protocol.version"];
if((typeof data42 !== "string") && (data42 !== null)){
const err74 = {instancePath:instancePath+"/network.protocol.version",schemaPath:"#/properties/network.protocol.version/type",keyword:"type",params:{type: schema31.properties["network.protocol.version"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data["scope.client.ja4"] !== undefined){
let data43 = data["scope.client.ja4"];
if((typeof data43 !== "string") && (data43 !== null)){
const err75 = {instancePath:instancePath+"/scope.client.ja4",schemaPath:"#/properties/scope.client.ja4/type",keyword:"type",params:{type: schema31.properties["scope.client.ja4"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data["scope.client.tls_ext_sha1"] !== undefined){
let data44 = data["scope.client.tls_ext_sha1"];
if((typeof data44 !== "string") && (data44 !== null)){
const err76 = {instancePath:instancePath+"/scope.client.tls_ext_sha1",schemaPath:"#/properties/scope.client.tls_ext_sha1/type",keyword:"type",params:{type: schema31.properties["scope.client.tls_ext_sha1"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data["scope.client.tls_hello_len"] !== undefined){
let data45 = data["scope.client.tls_hello_len"];
if((!(((typeof data45 == "number") && (!(data45 % 1) && !isNaN(data45))) && (isFinite(data45)))) && (data45 !== null)){
const err77 = {instancePath:instancePath+"/scope.client.tls_hello_len",schemaPath:"#/properties/scope.client.tls_hello_len/type",keyword:"type",params:{type: schema31.properties["scope.client.tls_hello_len"].type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data["scope.signature"] !== undefined){
let data46 = data["scope.signature"];
if((!(data46 && typeof data46 == "object" && !Array.isArray(data46))) && (data46 !== null)){
const err78 = {instancePath:instancePath+"/scope.signature",schemaPath:"#/properties/scope.signature/type",keyword:"type",params:{type: schema31.properties["scope.signature"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(data46 && typeof data46 == "object" && !Array.isArray(data46)){
if(data46.agent === undefined){
const err79 = {instancePath:instancePath+"/scope.signature",schemaPath:"#/properties/scope.signature/required",keyword:"required",params:{missingProperty: "agent"},message:"must have required property '"+"agent"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(data46.valid === undefined){
const err80 = {instancePath:instancePath+"/scope.signature",schemaPath:"#/properties/scope.signature/required",keyword:"required",params:{missingProperty: "valid"},message:"must have required property '"+"valid"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(data46.authority === undefined){
const err81 = {instancePath:instancePath+"/scope.signature",schemaPath:"#/properties/scope.signature/required",keyword:"required",params:{missingProperty: "authority"},message:"must have required property '"+"authority"+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
for(const key4 in data46){
if(!(((((key4 === "agent") || (key4 === "keyid")) || (key4 === "valid")) || (key4 === "reason")) || (key4 === "authority"))){
const err82 = {instancePath:instancePath+"/scope.signature",schemaPath:"#/properties/scope.signature/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data46.agent !== undefined){
if(typeof data46.agent !== "string"){
const err83 = {instancePath:instancePath+"/scope.signature/agent",schemaPath:"#/properties/scope.signature/properties/agent/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data46.keyid !== undefined){
let data48 = data46.keyid;
if((typeof data48 !== "string") && (data48 !== null)){
const err84 = {instancePath:instancePath+"/scope.signature/keyid",schemaPath:"#/properties/scope.signature/properties/keyid/type",keyword:"type",params:{type: schema31.properties["scope.signature"].properties.keyid.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data46.valid !== undefined){
if(typeof data46.valid !== "boolean"){
const err85 = {instancePath:instancePath+"/scope.signature/valid",schemaPath:"#/properties/scope.signature/properties/valid/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data46.reason !== undefined){
let data50 = data46.reason;
if((typeof data50 !== "string") && (data50 !== null)){
const err86 = {instancePath:instancePath+"/scope.signature/reason",schemaPath:"#/properties/scope.signature/properties/reason/type",keyword:"type",params:{type: schema31.properties["scope.signature"].properties.reason.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data46.authority !== undefined){
if(typeof data46.authority !== "string"){
const err87 = {instancePath:instancePath+"/scope.signature/authority",schemaPath:"#/properties/scope.signature/properties/authority/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
}
}
if(data["scope.platform_bot"] !== undefined){
let data52 = data["scope.platform_bot"];
if((!(data52 && typeof data52 == "object" && !Array.isArray(data52))) && (data52 !== null)){
const err88 = {instancePath:instancePath+"/scope.platform_bot",schemaPath:"#/properties/scope.platform_bot/type",keyword:"type",params:{type: schema31.properties["scope.platform_bot"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
for(const key5 in data52){
if(!((((key5 === "verified") || (key5 === "name")) || (key5 === "category")) || (key5 === "signed_agent"))){
const err89 = {instancePath:instancePath+"/scope.platform_bot",schemaPath:"#/properties/scope.platform_bot/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data52.verified !== undefined){
if(typeof data52.verified !== "boolean"){
const err90 = {instancePath:instancePath+"/scope.platform_bot/verified",schemaPath:"#/properties/scope.platform_bot/properties/verified/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data52.name !== undefined){
let data54 = data52.name;
if((typeof data54 !== "string") && (data54 !== null)){
const err91 = {instancePath:instancePath+"/scope.platform_bot/name",schemaPath:"#/properties/scope.platform_bot/properties/name/type",keyword:"type",params:{type: schema31.properties["scope.platform_bot"].properties.name.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data52.category !== undefined){
let data55 = data52.category;
if((typeof data55 !== "string") && (data55 !== null)){
const err92 = {instancePath:instancePath+"/scope.platform_bot/category",schemaPath:"#/properties/scope.platform_bot/properties/category/type",keyword:"type",params:{type: schema31.properties["scope.platform_bot"].properties.category.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data52.signed_agent !== undefined){
let data56 = data52.signed_agent;
if((typeof data56 !== "string") && (data56 !== null)){
const err93 = {instancePath:instancePath+"/scope.platform_bot/signed_agent",schemaPath:"#/properties/scope.platform_bot/properties/signed_agent/type",keyword:"type",params:{type: schema31.properties["scope.platform_bot"].properties.signed_agent.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
}
}
if(data["scope.reader"] !== undefined){
let data57 = data["scope.reader"];
if(typeof data57 !== "string"){
const err94 = {instancePath:instancePath+"/scope.reader",schemaPath:"#/properties/scope.reader/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(!((((((((((data57 === "claude-code") || (data57 === "claude-ai")) || (data57 === "openai")) || (data57 === "exa")) || (data57 === "signed")) || (data57 === "cursor")) || (data57 === "vendor-client")) || (data57 === "browser")) || (data57 === "shell")) || (data57 === "unknown"))){
const err95 = {instancePath:instancePath+"/scope.reader",schemaPath:"#/properties/scope.reader/enum",keyword:"enum",params:{allowedValues: schema31.properties["scope.reader"].enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data["scope.key.credential"] !== undefined){
let data58 = data["scope.key.credential"];
const _errs129 = errors;
let valid9 = false;
let passing1 = null;
const _errs130 = errors;
if(typeof data58 === "string"){
if(!pattern5.test(data58)){
const err96 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var _valid1 = _errs130 === errors;
if(_valid1){
valid9 = true;
passing1 = 0;
}
const _errs133 = errors;
if(data58 !== null){
const err98 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/properties/scope.key.credential/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
var _valid1 = _errs133 === errors;
if(_valid1 && valid9){
valid9 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid9 = true;
passing1 = 1;
}
}
if(!valid9){
const err99 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/properties/scope.key.credential/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
else {
errors = _errs129;
if(vErrors !== null){
if(_errs129){
vErrors.length = _errs129;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.key.install"] !== undefined){
let data59 = data["scope.key.install"];
const _errs136 = errors;
let valid11 = false;
let passing2 = null;
const _errs137 = errors;
if(typeof data59 === "string"){
if(!pattern5.test(data59)){
const err100 = {instancePath:instancePath+"/scope.key.install",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
else {
const err101 = {instancePath:instancePath+"/scope.key.install",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
var _valid2 = _errs137 === errors;
if(_valid2){
valid11 = true;
passing2 = 0;
}
const _errs140 = errors;
if(data59 !== null){
const err102 = {instancePath:instancePath+"/scope.key.install",schemaPath:"#/properties/scope.key.install/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
var _valid2 = _errs140 === errors;
if(_valid2 && valid11){
valid11 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid11 = true;
passing2 = 1;
}
}
if(!valid11){
const err103 = {instancePath:instancePath+"/scope.key.install",schemaPath:"#/properties/scope.key.install/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
else {
errors = _errs136;
if(vErrors !== null){
if(_errs136){
vErrors.length = _errs136;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.key.device_code"] !== undefined){
let data60 = data["scope.key.device_code"];
const _errs143 = errors;
let valid13 = false;
let passing3 = null;
const _errs144 = errors;
if(typeof data60 === "string"){
if(!pattern5.test(data60)){
const err104 = {instancePath:instancePath+"/scope.key.device_code",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
else {
const err105 = {instancePath:instancePath+"/scope.key.device_code",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var _valid3 = _errs144 === errors;
if(_valid3){
valid13 = true;
passing3 = 0;
}
const _errs147 = errors;
if(data60 !== null){
const err106 = {instancePath:instancePath+"/scope.key.device_code",schemaPath:"#/properties/scope.key.device_code/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var _valid3 = _errs147 === errors;
if(_valid3 && valid13){
valid13 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid13 = true;
passing3 = 1;
}
}
if(!valid13){
const err107 = {instancePath:instancePath+"/scope.key.device_code",schemaPath:"#/properties/scope.key.device_code/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
else {
errors = _errs143;
if(vErrors !== null){
if(_errs143){
vErrors.length = _errs143;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.key.user_code"] !== undefined){
let data61 = data["scope.key.user_code"];
const _errs150 = errors;
let valid15 = false;
let passing4 = null;
const _errs151 = errors;
if(typeof data61 === "string"){
if(!pattern5.test(data61)){
const err108 = {instancePath:instancePath+"/scope.key.user_code",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
else {
const err109 = {instancePath:instancePath+"/scope.key.user_code",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
var _valid4 = _errs151 === errors;
if(_valid4){
valid15 = true;
passing4 = 0;
}
const _errs154 = errors;
if(data61 !== null){
const err110 = {instancePath:instancePath+"/scope.key.user_code",schemaPath:"#/properties/scope.key.user_code/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var _valid4 = _errs154 === errors;
if(_valid4 && valid15){
valid15 = false;
passing4 = [passing4, 1];
}
else {
if(_valid4){
valid15 = true;
passing4 = 1;
}
}
if(!valid15){
const err111 = {instancePath:instancePath+"/scope.key.user_code",schemaPath:"#/properties/scope.key.user_code/oneOf",keyword:"oneOf",params:{passingSchemas: passing4},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
else {
errors = _errs150;
if(vErrors !== null){
if(_errs150){
vErrors.length = _errs150;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.key.oauth_client"] !== undefined){
let data62 = data["scope.key.oauth_client"];
const _errs157 = errors;
let valid17 = false;
let passing5 = null;
const _errs158 = errors;
if(typeof data62 === "string"){
if(!pattern5.test(data62)){
const err112 = {instancePath:instancePath+"/scope.key.oauth_client",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
else {
const err113 = {instancePath:instancePath+"/scope.key.oauth_client",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var _valid5 = _errs158 === errors;
if(_valid5){
valid17 = true;
passing5 = 0;
}
const _errs161 = errors;
if(data62 !== null){
const err114 = {instancePath:instancePath+"/scope.key.oauth_client",schemaPath:"#/properties/scope.key.oauth_client/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var _valid5 = _errs161 === errors;
if(_valid5 && valid17){
valid17 = false;
passing5 = [passing5, 1];
}
else {
if(_valid5){
valid17 = true;
passing5 = 1;
}
}
if(!valid17){
const err115 = {instancePath:instancePath+"/scope.key.oauth_client",schemaPath:"#/properties/scope.key.oauth_client/oneOf",keyword:"oneOf",params:{passingSchemas: passing5},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
else {
errors = _errs157;
if(vErrors !== null){
if(_errs157){
vErrors.length = _errs157;
}
else {
vErrors = null;
}
}
}
}
if(data["mcp.session.id"] !== undefined){
let data63 = data["mcp.session.id"];
if((typeof data63 !== "string") && (data63 !== null)){
const err116 = {instancePath:instancePath+"/mcp.session.id",schemaPath:"#/properties/mcp.session.id/type",keyword:"type",params:{type: schema31.properties["mcp.session.id"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data["scope.key.hook"] !== undefined){
let data64 = data["scope.key.hook"];
if((typeof data64 !== "string") && (data64 !== null)){
const err117 = {instancePath:instancePath+"/scope.key.hook",schemaPath:"#/properties/scope.key.hook/type",keyword:"type",params:{type: schema31.properties["scope.key.hook"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data["scope.key.reference"] !== undefined){
let data65 = data["scope.key.reference"];
const _errs168 = errors;
let valid19 = false;
let passing6 = null;
const _errs169 = errors;
if(typeof data65 === "string"){
if(!pattern11.test(data65)){
const err118 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/$defs/reference/pattern",keyword:"pattern",params:{pattern: "^[0-9A-HJKMNP-TV-Z]{8}$"},message:"must match pattern \""+"^[0-9A-HJKMNP-TV-Z]{8}$"+"\""};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
else {
const err119 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/$defs/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
var _valid6 = _errs169 === errors;
if(_valid6){
valid19 = true;
passing6 = 0;
}
const _errs172 = errors;
if(data65 !== null){
const err120 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/properties/scope.key.reference/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
var _valid6 = _errs172 === errors;
if(_valid6 && valid19){
valid19 = false;
passing6 = [passing6, 1];
}
else {
if(_valid6){
valid19 = true;
passing6 = 1;
}
}
if(!valid19){
const err121 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/properties/scope.key.reference/oneOf",keyword:"oneOf",params:{passingSchemas: passing6},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
else {
errors = _errs168;
if(vErrors !== null){
if(_errs168){
vErrors.length = _errs168;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.key.setup_header"] !== undefined){
let data66 = data["scope.key.setup_header"];
if((typeof data66 !== "string") && (data66 !== null)){
const err122 = {instancePath:instancePath+"/scope.key.setup_header",schemaPath:"#/properties/scope.key.setup_header/type",keyword:"type",params:{type: schema31.properties["scope.key.setup_header"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
if(data["scope.key.agent_header"] !== undefined){
let data67 = data["scope.key.agent_header"];
if((typeof data67 !== "string") && (data67 !== null)){
const err123 = {instancePath:instancePath+"/scope.key.agent_header",schemaPath:"#/properties/scope.key.agent_header/type",keyword:"type",params:{type: schema31.properties["scope.key.agent_header"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data["scope.key.client_header"] !== undefined){
let data68 = data["scope.key.client_header"];
if((typeof data68 !== "string") && (data68 !== null)){
const err124 = {instancePath:instancePath+"/scope.key.client_header",schemaPath:"#/properties/scope.key.client_header/type",keyword:"type",params:{type: schema31.properties["scope.key.client_header"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
}
if(data["scope.key.intent_header"] !== undefined){
let data69 = data["scope.key.intent_header"];
if((typeof data69 !== "string") && (data69 !== null)){
const err125 = {instancePath:instancePath+"/scope.key.intent_header",schemaPath:"#/properties/scope.key.intent_header/type",keyword:"type",params:{type: schema31.properties["scope.key.intent_header"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data["mcp.protocol.version"] !== undefined){
let data70 = data["mcp.protocol.version"];
if((typeof data70 !== "string") && (data70 !== null)){
const err126 = {instancePath:instancePath+"/mcp.protocol.version",schemaPath:"#/properties/mcp.protocol.version/type",keyword:"type",params:{type: schema31.properties["mcp.protocol.version"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
if(data["mcp.method.name"] !== undefined){
let data71 = data["mcp.method.name"];
if(Array.isArray(data71)){
const len0 = data71.length;
for(let i0=0; i0<len0; i0++){
if(typeof data71[i0] !== "string"){
const err127 = {instancePath:instancePath+"/mcp.method.name/" + i0,schemaPath:"#/properties/mcp.method.name/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
}
else {
const err128 = {instancePath:instancePath+"/mcp.method.name",schemaPath:"#/properties/mcp.method.name/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data["scope.mcp.tools"] !== undefined){
let data73 = data["scope.mcp.tools"];
if(Array.isArray(data73)){
const len1 = data73.length;
for(let i1=0; i1<len1; i1++){
if(typeof data73[i1] !== "string"){
const err129 = {instancePath:instancePath+"/scope.mcp.tools/" + i1,schemaPath:"#/properties/scope.mcp.tools/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
}
else {
const err130 = {instancePath:instancePath+"/scope.mcp.tools",schemaPath:"#/properties/scope.mcp.tools/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data["scope.mcp.client"] !== undefined){
let data75 = data["scope.mcp.client"];
if((!(data75 && typeof data75 == "object" && !Array.isArray(data75))) && (data75 !== null)){
const err131 = {instancePath:instancePath+"/scope.mcp.client",schemaPath:"#/properties/scope.mcp.client/type",keyword:"type",params:{type: schema31.properties["scope.mcp.client"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if(data75 && typeof data75 == "object" && !Array.isArray(data75)){
for(const key6 in data75){
if(!((key6 === "name") || (key6 === "version"))){
const err132 = {instancePath:instancePath+"/scope.mcp.client",schemaPath:"#/properties/scope.mcp.client/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
if(data75.name !== undefined){
if(typeof data75.name !== "string"){
const err133 = {instancePath:instancePath+"/scope.mcp.client/name",schemaPath:"#/properties/scope.mcp.client/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
if(data75.version !== undefined){
let data77 = data75.version;
if((typeof data77 !== "string") && (data77 !== null)){
const err134 = {instancePath:instancePath+"/scope.mcp.client/version",schemaPath:"#/properties/scope.mcp.client/properties/version/type",keyword:"type",params:{type: schema31.properties["scope.mcp.client"].properties.version.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
}
}
if(data["scope.oauth"] !== undefined){
let data78 = data["scope.oauth"];
if((!(data78 && typeof data78 == "object" && !Array.isArray(data78))) && (data78 !== null)){
const err135 = {instancePath:instancePath+"/scope.oauth",schemaPath:"#/properties/scope.oauth/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
if(data78 && typeof data78 == "object" && !Array.isArray(data78)){
for(const key7 in data78){
if(!(((((key7 === "grant_type") || (key7 === "client_name")) || (key7 === "client_id_url")) || (key7 === "resource")) || (key7 === "scope"))){
const err136 = {instancePath:instancePath+"/scope.oauth",schemaPath:"#/properties/scope.oauth/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
if(data78.grant_type !== undefined){
let data79 = data78.grant_type;
if((typeof data79 !== "string") && (data79 !== null)){
const err137 = {instancePath:instancePath+"/scope.oauth/grant_type",schemaPath:"#/properties/scope.oauth/properties/grant_type/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].properties.grant_type.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data78.client_name !== undefined){
let data80 = data78.client_name;
if((typeof data80 !== "string") && (data80 !== null)){
const err138 = {instancePath:instancePath+"/scope.oauth/client_name",schemaPath:"#/properties/scope.oauth/properties/client_name/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].properties.client_name.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
if(data78.client_id_url !== undefined){
let data81 = data78.client_id_url;
if((typeof data81 !== "string") && (data81 !== null)){
const err139 = {instancePath:instancePath+"/scope.oauth/client_id_url",schemaPath:"#/properties/scope.oauth/properties/client_id_url/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].properties.client_id_url.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data78.resource !== undefined){
let data82 = data78.resource;
if((typeof data82 !== "string") && (data82 !== null)){
const err140 = {instancePath:instancePath+"/scope.oauth/resource",schemaPath:"#/properties/scope.oauth/properties/resource/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].properties.resource.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
if(data78.scope !== undefined){
let data83 = data78.scope;
if((typeof data83 !== "string") && (data83 !== null)){
const err141 = {instancePath:instancePath+"/scope.oauth/scope",schemaPath:"#/properties/scope.oauth/properties/scope/type",keyword:"type",params:{type: schema31.properties["scope.oauth"].properties.scope.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
}
}
if(data["scope.body.request"] !== undefined){
if(typeof data["scope.body.request"] != "object"){
const err142 = {instancePath:instancePath+"/scope.body.request",schemaPath:"#/properties/scope.body.request/type",keyword:"type",params:{type: schema31.properties["scope.body.request"].type},message:"must be object,array,null"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
if(data["scope.body.response"] !== undefined){
if(typeof data["scope.body.response"] != "object"){
const err143 = {instancePath:instancePath+"/scope.body.response",schemaPath:"#/properties/scope.body.response/type",keyword:"type",params:{type: schema31.properties["scope.body.response"].type},message:"must be object,array,null"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
if(data["scope.body.truncated"] !== undefined){
if(typeof data["scope.body.truncated"] !== "boolean"){
const err144 = {instancePath:instancePath+"/scope.body.truncated",schemaPath:"#/properties/scope.body.truncated/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
if(data["scope.response.headers"] !== undefined){
let data87 = data["scope.response.headers"];
if((!(data87 && typeof data87 == "object" && !Array.isArray(data87))) && (data87 !== null)){
const err145 = {instancePath:instancePath+"/scope.response.headers",schemaPath:"#/properties/scope.response.headers/type",keyword:"type",params:{type: schema31.properties["scope.response.headers"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
if(data["scope.page"] !== undefined){
let data88 = data["scope.page"];
if((!(data88 && typeof data88 == "object" && !Array.isArray(data88))) && (data88 !== null)){
const err146 = {instancePath:instancePath+"/scope.page",schemaPath:"#/properties/scope.page/type",keyword:"type",params:{type: schema31.properties["scope.page"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
if(data88 && typeof data88 == "object" && !Array.isArray(data88)){
for(const key8 in data88){
if(!(((((key8 === "canonical") || (key8 === "face")) || (key8 === "reference_minted")) || (key8 === "injected")) || (key8 === "bytes"))){
const err147 = {instancePath:instancePath+"/scope.page",schemaPath:"#/properties/scope.page/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
if(data88.canonical !== undefined){
if(typeof data88.canonical !== "string"){
const err148 = {instancePath:instancePath+"/scope.page/canonical",schemaPath:"#/properties/scope.page/properties/canonical/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
if(data88.face !== undefined){
let data90 = data88.face;
if(typeof data90 !== "string"){
const err149 = {instancePath:instancePath+"/scope.page/face",schemaPath:"#/properties/scope.page/properties/face/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
if(!(((((data90 === "html") || (data90 === "md")) || (data90 === "txt")) || (data90 === "404-html")) || (data90 === "404-md"))){
const err150 = {instancePath:instancePath+"/scope.page/face",schemaPath:"#/properties/scope.page/properties/face/enum",keyword:"enum",params:{allowedValues: schema31.properties["scope.page"].properties.face.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
}
if(data88.reference_minted !== undefined){
let data91 = data88.reference_minted;
const _errs228 = errors;
let valid28 = false;
let passing7 = null;
const _errs229 = errors;
if(typeof data91 === "string"){
if(!pattern11.test(data91)){
const err151 = {instancePath:instancePath+"/scope.page/reference_minted",schemaPath:"#/$defs/reference/pattern",keyword:"pattern",params:{pattern: "^[0-9A-HJKMNP-TV-Z]{8}$"},message:"must match pattern \""+"^[0-9A-HJKMNP-TV-Z]{8}$"+"\""};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
else {
const err152 = {instancePath:instancePath+"/scope.page/reference_minted",schemaPath:"#/$defs/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
var _valid7 = _errs229 === errors;
if(_valid7){
valid28 = true;
passing7 = 0;
}
const _errs232 = errors;
if(data91 !== null){
const err153 = {instancePath:instancePath+"/scope.page/reference_minted",schemaPath:"#/properties/scope.page/properties/reference_minted/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
var _valid7 = _errs232 === errors;
if(_valid7 && valid28){
valid28 = false;
passing7 = [passing7, 1];
}
else {
if(_valid7){
valid28 = true;
passing7 = 1;
}
}
if(!valid28){
const err154 = {instancePath:instancePath+"/scope.page/reference_minted",schemaPath:"#/properties/scope.page/properties/reference_minted/oneOf",keyword:"oneOf",params:{passingSchemas: passing7},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
else {
errors = _errs228;
if(vErrors !== null){
if(_errs228){
vErrors.length = _errs228;
}
else {
vErrors = null;
}
}
}
}
if(data88.injected !== undefined){
let data92 = data88.injected;
if(Array.isArray(data92)){
const len2 = data92.length;
for(let i2=0; i2<len2; i2++){
if(typeof data92[i2] !== "string"){
const err155 = {instancePath:instancePath+"/scope.page/injected/" + i2,schemaPath:"#/properties/scope.page/properties/injected/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
}
else {
const err156 = {instancePath:instancePath+"/scope.page/injected",schemaPath:"#/properties/scope.page/properties/injected/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
if(data88.bytes !== undefined){
let data94 = data88.bytes;
if(!(((typeof data94 == "number") && (!(data94 % 1) && !isNaN(data94))) && (isFinite(data94)))){
const err157 = {instancePath:instancePath+"/scope.page/bytes",schemaPath:"#/properties/scope.page/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
}
}
if(data["scope.reference_minted"] !== undefined){
let data95 = data["scope.reference_minted"];
const _errs241 = errors;
let valid32 = false;
let passing8 = null;
const _errs242 = errors;
if(typeof data95 === "string"){
if(!pattern11.test(data95)){
const err158 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/$defs/reference/pattern",keyword:"pattern",params:{pattern: "^[0-9A-HJKMNP-TV-Z]{8}$"},message:"must match pattern \""+"^[0-9A-HJKMNP-TV-Z]{8}$"+"\""};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
else {
const err159 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/$defs/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
var _valid8 = _errs242 === errors;
if(_valid8){
valid32 = true;
passing8 = 0;
}
const _errs245 = errors;
if(data95 !== null){
const err160 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/properties/scope.reference_minted/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
var _valid8 = _errs245 === errors;
if(_valid8 && valid32){
valid32 = false;
passing8 = [passing8, 1];
}
else {
if(_valid8){
valid32 = true;
passing8 = 1;
}
}
if(!valid32){
const err161 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/properties/scope.reference_minted/oneOf",keyword:"oneOf",params:{passingSchemas: passing8},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
else {
errors = _errs241;
if(vErrors !== null){
if(_errs241){
vErrors.length = _errs241;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.decision"] !== undefined){
let data96 = data["scope.decision"];
if(Array.isArray(data96)){
const len3 = data96.length;
for(let i3=0; i3<len3; i3++){
let data97 = data96[i3];
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.rule === undefined){
const err162 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/required",keyword:"required",params:{missingProperty: "rule"},message:"must have required property '"+"rule"+"'"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if(data97.kind === undefined){
const err163 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
if(data97.mode === undefined){
const err164 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
if(data97.outcome === undefined){
const err165 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/required",keyword:"required",params:{missingProperty: "outcome"},message:"must have required property '"+"outcome"+"'"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
for(const key9 in data97){
if(!(((((key9 === "rule") || (key9 === "kind")) || (key9 === "mode")) || (key9 === "outcome")) || (key9 === "reason"))){
const err166 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
if(data97.rule !== undefined){
if(typeof data97.rule !== "string"){
const err167 = {instancePath:instancePath+"/scope.decision/" + i3+"/rule",schemaPath:"#/$defs/decision/properties/rule/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
}
if(data97.kind !== undefined){
let data99 = data97.kind;
if(typeof data99 !== "string"){
const err168 = {instancePath:instancePath+"/scope.decision/" + i3+"/kind",schemaPath:"#/$defs/decision/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if(!(((((((data99 === "observe") || (data99 === "inject")) || (data99 === "gate")) || (data99 === "finder")) || (data99 === "notfound")) || (data99 === "error")) || (data99 === "face"))){
const err169 = {instancePath:instancePath+"/scope.decision/" + i3+"/kind",schemaPath:"#/$defs/decision/properties/kind/enum",keyword:"enum",params:{allowedValues: schema42.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
if(data97.mode !== undefined){
let data100 = data97.mode;
if(typeof data100 !== "string"){
const err170 = {instancePath:instancePath+"/scope.decision/" + i3+"/mode",schemaPath:"#/$defs/decision/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
if(!((data100 === "dry_run") || (data100 === "live"))){
const err171 = {instancePath:instancePath+"/scope.decision/" + i3+"/mode",schemaPath:"#/$defs/decision/properties/mode/enum",keyword:"enum",params:{allowedValues: schema42.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
}
if(data97.outcome !== undefined){
let data101 = data97.outcome;
if(typeof data101 !== "string"){
const err172 = {instancePath:instancePath+"/scope.decision/" + i3+"/outcome",schemaPath:"#/$defs/decision/properties/outcome/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
if(!((((data101 === "applied") || (data101 === "would_apply")) || (data101 === "skipped")) || (data101 === "errored"))){
const err173 = {instancePath:instancePath+"/scope.decision/" + i3+"/outcome",schemaPath:"#/$defs/decision/properties/outcome/enum",keyword:"enum",params:{allowedValues: schema42.properties.outcome.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
if(data97.reason !== undefined){
let data102 = data97.reason;
if((typeof data102 !== "string") && (data102 !== null)){
const err174 = {instancePath:instancePath+"/scope.decision/" + i3+"/reason",schemaPath:"#/$defs/decision/properties/reason/type",keyword:"type",params:{type: schema42.properties.reason.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
}
}
else {
const err175 = {instancePath:instancePath+"/scope.decision/" + i3,schemaPath:"#/$defs/decision/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
}
}
else {
const err176 = {instancePath:instancePath+"/scope.decision",schemaPath:"#/properties/scope.decision/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
if(data["scope.gateway"] !== undefined){
let data103 = data["scope.gateway"];
if((!(data103 && typeof data103 == "object" && !Array.isArray(data103))) && (data103 !== null)){
const err177 = {instancePath:instancePath+"/scope.gateway",schemaPath:"#/properties/scope.gateway/type",keyword:"type",params:{type: schema31.properties["scope.gateway"].type},message:"must be object,null"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
if(data103 && typeof data103 == "object" && !Array.isArray(data103)){
for(const key10 in data103){
if(!((key10 === "declared") || (key10 === "forwarded"))){
const err178 = {instancePath:instancePath+"/scope.gateway",schemaPath:"#/properties/scope.gateway/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
}
if(data103.declared !== undefined){
let data104 = data103.declared;
if(!(((typeof data104 == "number") && (!(data104 % 1) && !isNaN(data104))) && (isFinite(data104)))){
const err179 = {instancePath:instancePath+"/scope.gateway/declared",schemaPath:"#/properties/scope.gateway/properties/declared/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
}
if(data103.forwarded !== undefined){
let data105 = data103.forwarded;
if(!(((typeof data105 == "number") && (!(data105 % 1) && !isNaN(data105))) && (isFinite(data105)))){
const err180 = {instancePath:instancePath+"/scope.gateway/forwarded",schemaPath:"#/properties/scope.gateway/properties/forwarded/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
}
}
if(data["scope.observer.errors"] !== undefined){
let data106 = data["scope.observer.errors"];
if(Array.isArray(data106)){
const len4 = data106.length;
for(let i4=0; i4<len4; i4++){
if(typeof data106[i4] !== "string"){
const err181 = {instancePath:instancePath+"/scope.observer.errors/" + i4,schemaPath:"#/properties/scope.observer.errors/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
}
else {
const err182 = {instancePath:instancePath+"/scope.observer.errors",schemaPath:"#/properties/scope.observer.errors/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
}
if(data["scope.observer.dropped"] !== undefined){
let data108 = data["scope.observer.dropped"];
if(!(((typeof data108 == "number") && (!(data108 % 1) && !isNaN(data108))) && (isFinite(data108)))){
const err183 = {instancePath:instancePath+"/scope.observer.dropped",schemaPath:"#/properties/scope.observer.dropped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
}
else {
const err184 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateDeclaration = validate21;
const schema43 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://journeys.tryscope.com/schemas/journeys/1/declaration","title":"scope.declaration/1","description":"An intent the sensor collected: from the declaration tool in front of the MCP route (gate), from the intent header on an API call (header), from the docs finder (finder), from the SDK's intent option (sdk) or the CLI (cli). Exported as an OTLP log record with event_name scope.intent. Shipped as its own record beside the request it rode on.","$defs":{"hash12":{"type":"string","pattern":"^[0-9a-f]{12}$","description":"sha256(salt + ':' + value)[0:12]; a join key inside the salt epoch, nothing else"},"reference":{"type":"string","pattern":"^[0-9A-HJKMNP-TV-Z]{8}$","description":"eight base32 characters: three minting-minute characters, four random, one check"},"prefixedId":{"type":"string","pattern":"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$","description":"a prefixed, opaque id minted by Scope; records themselves carry a UUIDv7 and no prefix"}},"type":"object","required":["schema","id","ts","install","source","text","scope.client.address_hash"],"properties":{"schema":{"const":"scope.declaration/1"},"id":{"type":"string","format":"uuid","description":"UUIDv7 minted by the sensor; the record's own identity and its idempotency key at the ingest"},"ts":{"type":"string","format":"date-time"},"install":{"oneOf":[{"$ref":"#/$defs/prefixedId"},{"type":"null"}],"description":"the install this sensor runs as; null only on a sensor with no install id (a lab deployment)"},"request":{"type":["string","null"],"format":"uuid","description":"the request record the declaration rode on, when one did"},"source":{"type":"string","enum":["gate","header","finder","sdk","cli"]},"text":{"type":"string","description":"the sentence the agent gave, redacted like url.query and by shape (a declaration that is no sentence: its arguments as JSON, redacted like a body)"},"task":{"type":["string","null"],"description":"the task category the agent chose, when the declaration tool asked for one"},"found_via":{"type":["string","null"],"description":"how the agent says it found the product, when asked"},"agent":{"type":["string","null"],"description":"the agent's own name for itself, when it gave one"},"scope.client.address_hash":{"$ref":"#/$defs/hash12"},"scope.key.credential":{"oneOf":[{"$ref":"#/$defs/hash12"},{"type":"null"}],"description":"the hashed bearer of the call that carried the declaration"},"mcp.session.id":{"type":["string","null"],"description":"the hash of the MCP session id the declaration was made in"},"scope.key.reference":{"oneOf":[{"$ref":"#/$defs/reference"},{"type":"null"}],"description":"the page reference the call arrived with"},"scope.reference_minted":{"oneOf":[{"$ref":"#/$defs/reference"},{"type":"null"}],"description":"the reference minted into the finder's answer"}},"additionalProperties":false};
const schema44 = {"type":"string","pattern":"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$","description":"a prefixed, opaque id minted by Scope; records themselves carry a UUIDv7 and no prefix"};
const schema45 = {"type":"string","pattern":"^[0-9a-f]{12}$","description":"sha256(salt + ':' + value)[0:12]; a join key inside the salt epoch, nothing else"};
const schema47 = {"type":"string","pattern":"^[0-9A-HJKMNP-TV-Z]{8}$","description":"eight base32 characters: three minting-minute characters, four random, one check"};

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://journeys.tryscope.com/schemas/journeys/1/declaration" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.ts === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ts"},message:"must have required property '"+"ts"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.install === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "install"},message:"must have required property '"+"install"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.source === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.text === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data["scope.client.address_hash"] === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scope.client.address_hash"},message:"must have required property '"+"scope.client.address_hash"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema43.properties, key0))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.schema !== undefined){
if("scope.declaration/1" !== data.schema){
const err8 = {instancePath:instancePath+"/schema",schemaPath:"#/properties/schema/const",keyword:"const",params:{allowedValue: "scope.declaration/1"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!(formats0.test(data1))){
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/format",keyword:"format",params:{format: "uuid"},message:"must match format \""+"uuid"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.ts !== undefined){
let data2 = data.ts;
if(typeof data2 === "string"){
if(!(formats2.test(data2))){
const err11 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/ts",schemaPath:"#/properties/ts/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.install !== undefined){
let data3 = data.install;
const _errs8 = errors;
let valid1 = false;
let passing0 = null;
const _errs9 = errors;
if(typeof data3 === "string"){
if(!pattern4.test(data3)){
const err13 = {instancePath:instancePath+"/install",schemaPath:"#/$defs/prefixedId/pattern",keyword:"pattern",params:{pattern: "^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$"},message:"must match pattern \""+"^(jin|jrn|vis|int|acc|pol|jds)_[A-Za-z0-9_-]{20,64}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/install",schemaPath:"#/$defs/prefixedId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs9 === errors;
if(_valid0){
valid1 = true;
passing0 = 0;
}
const _errs12 = errors;
if(data3 !== null){
const err15 = {instancePath:instancePath+"/install",schemaPath:"#/properties/install/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs12 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid1 = true;
passing0 = 1;
}
}
if(!valid1){
const err16 = {instancePath:instancePath+"/install",schemaPath:"#/properties/install/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.request !== undefined){
let data4 = data.request;
if((typeof data4 !== "string") && (data4 !== null)){
const err17 = {instancePath:instancePath+"/request",schemaPath:"#/properties/request/type",keyword:"type",params:{type: schema43.properties.request.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(typeof data4 === "string"){
if(!(formats0.test(data4))){
const err18 = {instancePath:instancePath+"/request",schemaPath:"#/properties/request/format",keyword:"format",params:{format: "uuid"},message:"must match format \""+"uuid"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
if(data.source !== undefined){
let data5 = data.source;
if(typeof data5 !== "string"){
const err19 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!(((((data5 === "gate") || (data5 === "header")) || (data5 === "finder")) || (data5 === "sdk")) || (data5 === "cli"))){
const err20 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema43.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.text !== undefined){
if(typeof data.text !== "string"){
const err21 = {instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.task !== undefined){
let data7 = data.task;
if((typeof data7 !== "string") && (data7 !== null)){
const err22 = {instancePath:instancePath+"/task",schemaPath:"#/properties/task/type",keyword:"type",params:{type: schema43.properties.task.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.found_via !== undefined){
let data8 = data.found_via;
if((typeof data8 !== "string") && (data8 !== null)){
const err23 = {instancePath:instancePath+"/found_via",schemaPath:"#/properties/found_via/type",keyword:"type",params:{type: schema43.properties.found_via.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.agent !== undefined){
let data9 = data.agent;
if((typeof data9 !== "string") && (data9 !== null)){
const err24 = {instancePath:instancePath+"/agent",schemaPath:"#/properties/agent/type",keyword:"type",params:{type: schema43.properties.agent.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data["scope.client.address_hash"] !== undefined){
let data10 = data["scope.client.address_hash"];
if(typeof data10 === "string"){
if(!pattern5.test(data10)){
const err25 = {instancePath:instancePath+"/scope.client.address_hash",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/scope.client.address_hash",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data["scope.key.credential"] !== undefined){
let data11 = data["scope.key.credential"];
const _errs30 = errors;
let valid4 = false;
let passing1 = null;
const _errs31 = errors;
if(typeof data11 === "string"){
if(!pattern5.test(data11)){
const err27 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/$defs/hash12/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{12}$"},message:"must match pattern \""+"^[0-9a-f]{12}$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/$defs/hash12/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid1 = _errs31 === errors;
if(_valid1){
valid4 = true;
passing1 = 0;
}
const _errs34 = errors;
if(data11 !== null){
const err29 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/properties/scope.key.credential/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var _valid1 = _errs34 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid4 = true;
passing1 = 1;
}
}
if(!valid4){
const err30 = {instancePath:instancePath+"/scope.key.credential",schemaPath:"#/properties/scope.key.credential/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
errors = _errs30;
if(vErrors !== null){
if(_errs30){
vErrors.length = _errs30;
}
else {
vErrors = null;
}
}
}
}
if(data["mcp.session.id"] !== undefined){
let data12 = data["mcp.session.id"];
if((typeof data12 !== "string") && (data12 !== null)){
const err31 = {instancePath:instancePath+"/mcp.session.id",schemaPath:"#/properties/mcp.session.id/type",keyword:"type",params:{type: schema43.properties["mcp.session.id"].type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data["scope.key.reference"] !== undefined){
let data13 = data["scope.key.reference"];
const _errs39 = errors;
let valid6 = false;
let passing2 = null;
const _errs40 = errors;
if(typeof data13 === "string"){
if(!pattern11.test(data13)){
const err32 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/$defs/reference/pattern",keyword:"pattern",params:{pattern: "^[0-9A-HJKMNP-TV-Z]{8}$"},message:"must match pattern \""+"^[0-9A-HJKMNP-TV-Z]{8}$"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/$defs/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid2 = _errs40 === errors;
if(_valid2){
valid6 = true;
passing2 = 0;
}
const _errs43 = errors;
if(data13 !== null){
const err34 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/properties/scope.key.reference/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid2 = _errs43 === errors;
if(_valid2 && valid6){
valid6 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid6 = true;
passing2 = 1;
}
}
if(!valid6){
const err35 = {instancePath:instancePath+"/scope.key.reference",schemaPath:"#/properties/scope.key.reference/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
errors = _errs39;
if(vErrors !== null){
if(_errs39){
vErrors.length = _errs39;
}
else {
vErrors = null;
}
}
}
}
if(data["scope.reference_minted"] !== undefined){
let data14 = data["scope.reference_minted"];
const _errs46 = errors;
let valid8 = false;
let passing3 = null;
const _errs47 = errors;
if(typeof data14 === "string"){
if(!pattern11.test(data14)){
const err36 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/$defs/reference/pattern",keyword:"pattern",params:{pattern: "^[0-9A-HJKMNP-TV-Z]{8}$"},message:"must match pattern \""+"^[0-9A-HJKMNP-TV-Z]{8}$"+"\""};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
else {
const err37 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/$defs/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid3 = _errs47 === errors;
if(_valid3){
valid8 = true;
passing3 = 0;
}
const _errs50 = errors;
if(data14 !== null){
const err38 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/properties/scope.reference_minted/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid3 = _errs50 === errors;
if(_valid3 && valid8){
valid8 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid8 = true;
passing3 = 1;
}
}
if(!valid8){
const err39 = {instancePath:instancePath+"/scope.reference_minted",schemaPath:"#/properties/scope.reference_minted/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
errors = _errs46;
if(vErrors !== null){
if(_errs46){
vErrors.length = _errs46;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err40 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateDecision = validate22;
const schema49 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://journeys.tryscope.com/schemas/journeys/1/decision","title":"scope.decision/1","description":"What a rule did to one request. A rule that does not match a request records nothing; a rule that matched records one decision with the reason it had, whether it applied the change (live) or only computed it (dry run).","type":"object","required":["rule","kind","mode","outcome"],"properties":{"rule":{"type":"string","description":"the rule's id in the policy"},"kind":{"type":"string","enum":["observe","inject","gate","finder","notfound","error","face"]},"mode":{"type":"string","enum":["dry_run","live"],"description":"the effective mode the rule ran in on this request"},"outcome":{"type":"string","enum":["applied","would_apply","skipped","errored"],"description":"applied: the change went out; would_apply: computed and discarded (dry run); skipped: matched but excluded (the install's environment, or a kind this sensor version does not implement); errored: the rule threw and the original answer was served"},"reason":{"type":["string","null"],"description":"the same wording live and dry run, so the counters compare"}},"additionalProperties":false};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://journeys.tryscope.com/schemas/journeys/1/decision" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.rule === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rule"},message:"must have required property '"+"rule"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.mode === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.outcome === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "outcome"},message:"must have required property '"+"outcome"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "rule") || (key0 === "kind")) || (key0 === "mode")) || (key0 === "outcome")) || (key0 === "reason"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.rule !== undefined){
if(typeof data.rule !== "string"){
const err5 = {instancePath:instancePath+"/rule",schemaPath:"#/properties/rule/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!(((((((data1 === "observe") || (data1 === "inject")) || (data1 === "gate")) || (data1 === "finder")) || (data1 === "notfound")) || (data1 === "error")) || (data1 === "face"))){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema49.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.mode !== undefined){
let data2 = data.mode;
if(typeof data2 !== "string"){
const err8 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!((data2 === "dry_run") || (data2 === "live"))){
const err9 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/enum",keyword:"enum",params:{allowedValues: schema49.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.outcome !== undefined){
let data3 = data.outcome;
if(typeof data3 !== "string"){
const err10 = {instancePath:instancePath+"/outcome",schemaPath:"#/properties/outcome/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!((((data3 === "applied") || (data3 === "would_apply")) || (data3 === "skipped")) || (data3 === "errored"))){
const err11 = {instancePath:instancePath+"/outcome",schemaPath:"#/properties/outcome/enum",keyword:"enum",params:{allowedValues: schema49.properties.outcome.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.reason !== undefined){
let data4 = data.reason;
if((typeof data4 !== "string") && (data4 !== null)){
const err12 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: schema49.properties.reason.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePolicy = validate23;
const schema50 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://journeys.tryscope.com/schemas/journeys/1/policy","title":"scope.policy/1","description":"The configuration the sensor fetches. Immutable integer versions per customer; public to the customer; holds no secret (the sensor's validator refuses a secret-shaped value). A sensor that does not know a section ignores it; a rule kind it does not know runs as a skipped decision.","$defs":{"regex":{"type":"string","description":"a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document"},"regexList":{"type":"array","items":{"$ref":"#/$defs/regex"}},"route":{"type":"string","enum":["docs","docs_root","download","api","mcp","oauth.register","oauth.authorize","oauth.token","oauth.approve","device.start","device.poll","device.approve","signup","hooks.create","hooks.catch","credentials","trial","finder","cli.init","cli.beacon","passthrough","other"]},"faceRewrite":{"type":"object","required":["pattern","replacement"],"properties":{"pattern":{"type":"string","description":"a regular expression over the page body with {host} filled in; applied globally"},"replacement":{"type":"string","description":"the replacement with $1 to $9 groups and {host}, {prefix}, {token} filled in; plain text, every link on https://{host} or a path, and on the html face only whole tags from a, blockquote, body, code, h1, head, html, li, meta, p, pre, title, ul with an a's href and a meta's utf-8 charset; on the md and txt faces no www or mail address, character reference, control character or markup a renderer would act on; anything else runs the rule dry. Where the pattern lands it inside a tag, an inline script or style, a title or a text area, or joins it to the page's text inside a word on the md or txt face, it only extends a link to https://{host} with a link-safe code. A rule that would grow a page past twice its size and 64 KiB is left out of it"}},"additionalProperties":false},"fieldNames":{"type":"object","additionalProperties":{"oneOf":[{"type":"string"},{"type":"array","items":{"type":"string"}}]},"description":"the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names"},"bodyMatch":{"type":"object","required":["field","value"],"properties":{"field":{"type":"string"},"value":{}},"additionalProperties":false,"description":"a body field and the value that means success"},"door":{"oneOf":[{"$ref":"#/$defs/regex"},{"type":"object","required":["path"],"properties":{"path":{"$ref":"#/$defs/regex"},"fields":{"$ref":"#/$defs/fieldNames"}},"additionalProperties":false}],"description":"a door: its path pattern, or the pattern with the field names its keys live in"}},"type":"object","required":["schema","version","secrets","headers","forward","rules"],"anyOf":[{"required":["routes"]},{"required":["surfaces"]}],"properties":{"schema":{"const":"scope.policy/1"},"version":{"type":"integer","minimum":0,"description":"the customer's policy version; 0 is the embedded forward-only default"},"about":{"type":"string"},"origin":{"type":["string","null"],"description":"ignored by the sensor: where traffic goes comes only from its own configuration (JOURNEYS_ORIGIN)"},"report":{"type":"object","description":"ignored by the sensor: records go to JOURNEYS_API_URL in its own configuration, with the install key as Authorization: Bearer","required":["url"],"properties":{"url":{"type":"string"},"key_header":{"type":"string"},"kinds":{"type":"object","description":"reserved"}},"additionalProperties":false},"routes":{"type":"object","description":"the regular-expression form: four expressions over the path plus the text faces; a policy with surfaces ignores every key but run_prefix","properties":{"run_prefix":{"$ref":"#/$defs/regex","description":"a path prefix with two capture groups (the prefix, the rest): the path up to the rest group is stripped before classification and restored in rewritten links as {prefix}, whatever the first group captures"},"passthrough":{"$ref":"#/$defs/regex"},"not_content":{"$ref":"#/$defs/regex"},"observed":{"$ref":"#/$defs/regex"},"text_faces":{"$ref":"#/$defs/regex","description":"plain-text documents that are pages (a root map such as llms.txt)"}},"additionalProperties":false},"surfaces":{"type":"object","description":"the surface map: the roles of the product's paths, derived from the standards (MCP is one JSON-RPC endpoint carrying MCP-Session-Id and MCP-Protocol-Version; OAuth 2.1 names its registration (RFC 7591), authorization, token and device-authorization (RFC 8628) endpoints in its metadata documents (RFC 8414, RFC 9728); an API call carries a bearer) plus a short custom list. Classification precedence, first match wins: passthrough, custom (in order), finder, mcp, oauth.register, oauth.authorize, oauth.token, oauth.approve, device.start, device.poll, device.approve, hooks.create, hooks.catch, credentials, trial, cli.init, cli.beacon, signup, download, api, docs.llms and docs.root (docs_root), docs.paths (docs), else other.","properties":{"docs":{"type":"object","properties":{"paths":{"$ref":"#/$defs/regexList","description":"documentation pages: observed, content, references minted per serve"},"root":{"$ref":"#/$defs/regex","description":"the site root or docs root page"},"llms":{"$ref":"#/$defs/regex","description":"the root map (llms.txt), a plain-text page"},"faces":{"type":"object","properties":{"md":{"$ref":"#/$defs/regexList"},"txt":{"$ref":"#/$defs/regexList"}},"additionalProperties":false,"description":"paths whose face is markdown or text regardless of the answer's content type"}},"additionalProperties":false},"download":{"type":"object","properties":{"paths":{"$ref":"#/$defs/regexList"}},"additionalProperties":false,"description":"installer and package downloads: an opener of an install journey when the url carries a reference"},"api":{"type":"object","properties":{"paths":{"$ref":"#/$defs/regexList"},"credential_header":{"type":"string","default":"authorization"},"actions":{"$ref":"#/$defs/regexList","description":"the API paths that are actions (a step with an outcome) rather than reads"},"action_success":{"$ref":"#/$defs/bodyMatch","description":"what a successful action's answer says; absent means any 2xx"}},"additionalProperties":false},"mcp":{"type":"object","properties":{"path":{"$ref":"#/$defs/regex"}},"additionalProperties":false},"oauth":{"type":"object","properties":{"metadata":{"$ref":"#/$defs/regex","description":"RFC 8414 authorization-server metadata; classified as api"},"resource_metadata":{"$ref":"#/$defs/regex","description":"RFC 9728 protected-resource metadata; classified as api"},"register":{"$ref":"#/$defs/regex","description":"RFC 7591 dynamic client registration"},"authorize":{"$ref":"#/$defs/regex"},"token":{"$ref":"#/$defs/regex"},"approve":{"$ref":"#/$defs/regex","description":"the product's consent post"},"fields":{"$ref":"#/$defs/fieldNames","description":"client_id (default client_id), credential (default access_token)"}},"additionalProperties":false},"device":{"type":"object","properties":{"start":{"$ref":"#/$defs/regex","description":"RFC 8628 device authorization"},"poll":{"$ref":"#/$defs/regex"},"approve":{"$ref":"#/$defs/regex","description":"the person's approval post"},"poll_approved":{"$ref":"#/$defs/bodyMatch","description":"what the poll's answer says when the person approved; default {status: approved}"},"fields":{"$ref":"#/$defs/fieldNames","description":"device_code, user_code, approve_code (default code), credential (default api_key)"}},"additionalProperties":false},"signup":{"$ref":"#/$defs/door","description":"the sign-up form post; fields: reference (default via)"},"hooks":{"type":"object","properties":{"create":{"$ref":"#/$defs/regex"},"catch":{"$ref":"#/$defs/regex","description":"the first capture group is the hook id"},"fields":{"$ref":"#/$defs/fieldNames","description":"url (default url), id (default hook_id)"}},"additionalProperties":false},"credentials":{"$ref":"#/$defs/door","description":"client credentials issued; fields: client_id"},"trial":{"$ref":"#/$defs/door","description":"a trial key issued from code; fields: credential (default trial_key), install (default install_id)"},"cli":{"type":"object","properties":{"init":{"$ref":"#/$defs/regex","description":"the product's CLI registering a project or an install: an opener"},"beacon":{"$ref":"#/$defs/regex","description":"the CLI's telemetry ping: an opener"},"fields":{"$ref":"#/$defs/fieldNames","description":"reference (default ref, token), install (default install_id)"}},"additionalProperties":false},"clients":{"type":"object","properties":{"cli":{"type":"string","description":"a regular expression over the user agent that names the customer's own CLI"},"sdk":{"type":"string","description":"the same for the customer's SDK"}},"additionalProperties":false,"description":"how the reader family vendor-client is decided: the customer's own clients by pattern, never a hard-coded product string"},"finder":{"$ref":"#/$defs/regex","description":"the documentation-finder route the sensor answers"},"passthrough":{"$ref":"#/$defs/regexList","description":"never observed, never recorded"},"custom":{"type":"array","items":{"type":"object","required":["pattern","role"],"properties":{"pattern":{"$ref":"#/$defs/regex"},"role":{"$ref":"#/$defs/route"},"observed":{"type":"boolean","default":true}},"additionalProperties":false},"description":"the customer's overrides, in order; an entry beats every standard entry"}},"additionalProperties":false},"secrets":{"type":"object","properties":{"fields":{"type":"array","items":{"type":"string"},"description":"body fields hashed by name wherever they appear, beside the names the sensor always hashes in bodies and URLs (api_key, key, token, access_token, refresh_token, id_token, code, client_secret, password, secret, signature, sig, session_id, in any case or spelling, or a name whose last word is key, token, secret, password, signature or sig; such a field's whole value is hashed unless it is true or false, except code in an answer's body (usually an error code); a valid reference code stays readable only where headers.reference or a door's fields.reference names the field)"},"shapes":{"type":"array","items":{"type":"string"},"description":"the product's signed-value shapes, hashed wherever they appear: path, query, body, Location"},"uri_fields":{"type":"object","additionalProperties":{"type":"string"},"description":"a body field holding a url whose named parameter, in the query or the fragment, is a code; only that parameter's value is hashed"}},"additionalProperties":false},"headers":{"type":"object","description":"the names of the headers the sensor reads; a name that is not a header name is ignored, and session, setup, agent, client and intent may not name one that carries a credential (a name with auth, cookie, token, secret, password, credential, key, jwt, assertion, oidc, signature, bypass, dpop, proof, hmac, csrf or xsrf in it, the credential header, surfaces.api.credential_header)","properties":{"credential":{"type":"string","default":"authorization"},"session":{"type":"string","default":"mcp-session-id"},"reference":{"type":"array","items":{"type":"string"},"description":"the query parameters that carry a reference"},"install":{"type":["string","null"]},"setup":{"type":["string","null"]},"agent":{"type":["string","null"]},"client":{"type":["string","null"]},"intent":{"type":["string","null"]},"signature":{"type":"string","default":"signature-agent"}},"additionalProperties":false},"forward":{"type":"object","properties":{"headers":{"type":"object","additionalProperties":{"type":"string"},"description":"the policy's own x- headers added on the hop to the origin, with {host} filled in; x-forwarded, x-forwarded-*, x-real-ip, x-client-ip, x-cluster-client-ip, x-originating-ip, x-host, x-original-*, x-rewrite-url, x-http-method, x-http-method-override, x-method-override, x-middleware-*, x-invoke-*, x-matched-path, x-prerender-*, x-vercel-*, x-nextjs-*, x-journeys-*, x-scope-*, x-envoy-*, a name that carries a credential, a value that is not one line of latin-1 or has a placeholder other than {host}, and any name not starting x- are ignored"},"key_header":{"type":["string","null"],"description":"ignored by the sensor: the install key never goes to the origin; the signed assertion proves the hop"}},"additionalProperties":false},"record_bodies":{"type":"boolean","default":false,"description":"false is the lightest form: bodies are read where a rule needs them and never leave; true records, on the routes the surface map observes and for an error answer (400 or above) on any route it does not pass through, only the fields observe.bodies.allow_fields names, with secret names and shapes hashed; true with no allowed field records no body"},"observe":{"type":"object","description":"the body allowlist; routes, max_bytes and json_rpc are reserved and not read","properties":{"bodies":{"type":"object","properties":{"routes":{"type":"array"},"allow_fields":{"type":"array","items":{"type":"string"},"description":"the body field names that may leave, at any depth: an allowed field keeps its whole value, any other is dropped; a body with no allowed field is recorded as null"},"max_bytes":{"type":"integer"},"json_rpc":{"type":"boolean"}}}}},"rules":{"type":"array","items":{"type":"object","required":["id","kind"],"properties":{"id":{"type":"string"},"kind":{"type":"string","enum":["inject","gate","finder","notfound","error","face"]},"mode":{"type":"string","enum":["dry_run","live"],"default":"dry_run","description":"dry_run computes what the rule would do, records it and changes nothing on the wire"},"environments":{"type":"array","items":{"type":"string","enum":["production","preview","development"]},"default":["production","preview","development"],"description":"where a live rule is live; elsewhere it runs dry"},"on_error":{"type":"string","enum":["open","closed"],"default":"open","description":"closed is honoured by a gate only: the declaration call is refused instead of forwarded"},"label":{"type":"string"},"faces":{"type":"object","description":"inject: a rewrite per face (html, md, txt); notfound: a page body per face, held to the same content as an inject replacement (with no html face, the md page is shown to a browser as escaped plain text)"},"route":{"type":"string","description":"finder and gate: the exact path; error: a regular expression over the path"},"form":{"type":"string","enum":["tool","instructions","descriptions"]},"tool":{"type":"object","required":["name"],"properties":{"name":{"type":"string"},"description":{"type":"string"},"inputSchema":{"type":"object"}}},"acknowledgement":{"type":"string"},"instructions":{"type":"string"},"description_suffix":{"type":"string"},"answers":{"type":"array","items":{"type":"object","required":["match","links"],"properties":{"match":{"type":"string"},"links":{"type":"array","items":{"type":"string"}}}}},"default_links":{"type":"array","items":{"type":"string"},"description":"finder: paths on the customer's site; anything else runs the rule dry"},"links":{"type":"object","additionalProperties":{"type":"string"},"description":"error: a path on the customer's site per status; anything else runs the rule dry"},"suffix":{"type":"string"}},"if":{"properties":{"kind":{"not":{"const":"gate"}}}},"then":{"properties":{"on_error":{"const":"open"}}}}},"assertion":{"type":"object","properties":{"enabled":{"type":"boolean","default":false},"audience":{"type":"array","items":{"type":"string"}}},"additionalProperties":false},"signers":{"type":"array","items":{"type":"string"},"default":["https://crawler.exa.ai","https://chatgpt.com"],"description":"the Web Bot Auth signers whose key directories the sensor fetches, each an exact https origin such as https://chatgpt.com (an entry that is not one is ignored and named in the notices); a signature from any other signer is recorded as unlisted_signer and causes no outbound request"},"destinations":{"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["scope","otlp","webhook"]},"url":{"type":"string"},"headers":{"type":"object"},"events":{"type":"array"}}}},"retention_days":{"type":"integer","default":90,"minimum":30,"maximum":400},"salt_epoch":{"type":"integer","default":1,"minimum":1}}};
const schema51 = {"type":"string","description":"a JavaScript regular expression over the path; anchored at the start by the compiler when it does not begin with ^; one that repeats a group holding a repeat, such as (a+)+, refuses the whole document"};
const schema60 = {"type":"object","required":["field","value"],"properties":{"field":{"type":"string"},"value":{}},"additionalProperties":false,"description":"a body field and the value that means success"};
const schema68 = {"type":"object","additionalProperties":{"oneOf":[{"type":"string"},{"type":"array","items":{"type":"string"}}]},"description":"the body field names a door's keys live in, by key kind; a sensor and the stitcher read the same names"};
const schema86 = {"type":"string","enum":["docs","docs_root","download","api","mcp","oauth.register","oauth.authorize","oauth.token","oauth.approve","device.start","device.poll","device.approve","signup","hooks.create","hooks.catch","credentials","trial","finder","cli.init","cli.beacon","passthrough","other"]};
const schema56 = {"type":"array","items":{"$ref":"#/$defs/regex"}};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
if(typeof data[i0] !== "string"){
const err0 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema74 = {"oneOf":[{"$ref":"#/$defs/regex"},{"type":"object","required":["path"],"properties":{"path":{"$ref":"#/$defs/regex"},"fields":{"$ref":"#/$defs/fieldNames"}},"additionalProperties":false}],"description":"a door: its path pattern, or the pattern with the field names its keys live in"};

function validate31(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate31.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs4 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.path === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "path") || (key0 === "fields"))){
const err2 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.path !== undefined){
if(typeof data.path !== "string"){
const err3 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.fields !== undefined){
let data1 = data.fields;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
let data2 = data1[key1];
const _errs15 = errors;
let valid6 = false;
let passing1 = null;
const _errs16 = errors;
if(typeof data2 !== "string"){
const err4 = {instancePath:instancePath+"/fields/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid1 = _errs16 === errors;
if(_valid1){
valid6 = true;
passing1 = 0;
}
const _errs18 = errors;
if(Array.isArray(data2)){
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
if(typeof data2[i0] !== "string"){
const err5 = {instancePath:instancePath+"/fields/" + key1.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath:instancePath+"/fields/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid6){
valid6 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid6 = true;
passing1 = 1;
}
}
if(!valid6){
const err7 = {instancePath:instancePath+"/fields/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
else {
errors = _errs15;
if(vErrors !== null){
if(_errs15){
vErrors.length = _errs15;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err8 = {instancePath:instancePath+"/fields",schemaPath:"#/$defs/fieldNames/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs4 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
var props0 = true;
}
}
if(!valid0){
const err10 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate31.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate31.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://journeys.tryscope.com/schemas/journeys/1/policy" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs1 = errors;
let valid0 = false;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.routes === undefined){
const err0 = {instancePath,schemaPath:"#/anyOf/0/required",keyword:"required",params:{missingProperty: "routes"},message:"must have required property '"+"routes"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
var _valid0 = _errs2 === errors;
valid0 = valid0 || _valid0;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.surfaces === undefined){
const err1 = {instancePath,schemaPath:"#/anyOf/1/required",keyword:"required",params:{missingProperty: "surfaces"},message:"must have required property '"+"surfaces"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
var _valid0 = _errs3 === errors;
valid0 = valid0 || _valid0;
if(!valid0){
const err2 = {instancePath,schemaPath:"#/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
else {
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.version === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.secrets === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "secrets"},message:"must have required property '"+"secrets"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.headers === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "headers"},message:"must have required property '"+"headers"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.forward === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "forward"},message:"must have required property '"+"forward"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rules === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rules"},message:"must have required property '"+"rules"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.schema !== undefined){
if("scope.policy/1" !== data.schema){
const err9 = {instancePath:instancePath+"/schema",schemaPath:"#/properties/schema/const",keyword:"const",params:{allowedValue: "scope.policy/1"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.version !== undefined){
let data1 = data.version;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err10 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 0 || isNaN(data1)){
const err11 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
if(data.about !== undefined){
if(typeof data.about !== "string"){
const err12 = {instancePath:instancePath+"/about",schemaPath:"#/properties/about/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.origin !== undefined){
let data3 = data.origin;
if((typeof data3 !== "string") && (data3 !== null)){
const err13 = {instancePath:instancePath+"/origin",schemaPath:"#/properties/origin/type",keyword:"type",params:{type: schema50.properties.origin.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.report !== undefined){
let data4 = data.report;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.url === undefined){
const err14 = {instancePath:instancePath+"/report",schemaPath:"#/properties/report/required",keyword:"required",params:{missingProperty: "url"},message:"must have required property '"+"url"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key0 in data4){
if(!(((key0 === "url") || (key0 === "key_header")) || (key0 === "kinds"))){
const err15 = {instancePath:instancePath+"/report",schemaPath:"#/properties/report/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data4.url !== undefined){
if(typeof data4.url !== "string"){
const err16 = {instancePath:instancePath+"/report/url",schemaPath:"#/properties/report/properties/url/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data4.key_header !== undefined){
if(typeof data4.key_header !== "string"){
const err17 = {instancePath:instancePath+"/report/key_header",schemaPath:"#/properties/report/properties/key_header/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data4.kinds !== undefined){
let data7 = data4.kinds;
if(!(data7 && typeof data7 == "object" && !Array.isArray(data7))){
const err18 = {instancePath:instancePath+"/report/kinds",schemaPath:"#/properties/report/properties/kinds/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/report",schemaPath:"#/properties/report/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.routes !== undefined){
let data8 = data.routes;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
for(const key1 in data8){
if(!(((((key1 === "run_prefix") || (key1 === "passthrough")) || (key1 === "not_content")) || (key1 === "observed")) || (key1 === "text_faces"))){
const err20 = {instancePath:instancePath+"/routes",schemaPath:"#/properties/routes/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data8.run_prefix !== undefined){
if(typeof data8.run_prefix !== "string"){
const err21 = {instancePath:instancePath+"/routes/run_prefix",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data8.passthrough !== undefined){
if(typeof data8.passthrough !== "string"){
const err22 = {instancePath:instancePath+"/routes/passthrough",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data8.not_content !== undefined){
if(typeof data8.not_content !== "string"){
const err23 = {instancePath:instancePath+"/routes/not_content",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data8.observed !== undefined){
if(typeof data8.observed !== "string"){
const err24 = {instancePath:instancePath+"/routes/observed",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data8.text_faces !== undefined){
if(typeof data8.text_faces !== "string"){
const err25 = {instancePath:instancePath+"/routes/text_faces",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/routes",schemaPath:"#/properties/routes/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.surfaces !== undefined){
let data14 = data.surfaces;
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
for(const key2 in data14){
if(!(func1.call(schema50.properties.surfaces.properties, key2))){
const err27 = {instancePath:instancePath+"/surfaces",schemaPath:"#/properties/surfaces/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data14.docs !== undefined){
let data15 = data14.docs;
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
for(const key3 in data15){
if(!((((key3 === "paths") || (key3 === "root")) || (key3 === "llms")) || (key3 === "faces"))){
const err28 = {instancePath:instancePath+"/surfaces/docs",schemaPath:"#/properties/surfaces/properties/docs/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data15.paths !== undefined){
if(!(validate24(data15.paths, {instancePath:instancePath+"/surfaces/docs/paths",parentData:data15,parentDataProperty:"paths",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data15.root !== undefined){
if(typeof data15.root !== "string"){
const err29 = {instancePath:instancePath+"/surfaces/docs/root",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data15.llms !== undefined){
if(typeof data15.llms !== "string"){
const err30 = {instancePath:instancePath+"/surfaces/docs/llms",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data15.faces !== undefined){
let data19 = data15.faces;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
for(const key4 in data19){
if(!((key4 === "md") || (key4 === "txt"))){
const err31 = {instancePath:instancePath+"/surfaces/docs/faces",schemaPath:"#/properties/surfaces/properties/docs/properties/faces/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data19.md !== undefined){
if(!(validate24(data19.md, {instancePath:instancePath+"/surfaces/docs/faces/md",parentData:data19,parentDataProperty:"md",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data19.txt !== undefined){
if(!(validate24(data19.txt, {instancePath:instancePath+"/surfaces/docs/faces/txt",parentData:data19,parentDataProperty:"txt",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
}
else {
const err32 = {instancePath:instancePath+"/surfaces/docs/faces",schemaPath:"#/properties/surfaces/properties/docs/properties/faces/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath:instancePath+"/surfaces/docs",schemaPath:"#/properties/surfaces/properties/docs/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data14.download !== undefined){
let data22 = data14.download;
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
for(const key5 in data22){
if(!(key5 === "paths")){
const err34 = {instancePath:instancePath+"/surfaces/download",schemaPath:"#/properties/surfaces/properties/download/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data22.paths !== undefined){
if(!(validate24(data22.paths, {instancePath:instancePath+"/surfaces/download/paths",parentData:data22,parentDataProperty:"paths",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
}
else {
const err35 = {instancePath:instancePath+"/surfaces/download",schemaPath:"#/properties/surfaces/properties/download/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data14.api !== undefined){
let data24 = data14.api;
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
for(const key6 in data24){
if(!((((key6 === "paths") || (key6 === "credential_header")) || (key6 === "actions")) || (key6 === "action_success"))){
const err36 = {instancePath:instancePath+"/surfaces/api",schemaPath:"#/properties/surfaces/properties/api/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data24.paths !== undefined){
if(!(validate24(data24.paths, {instancePath:instancePath+"/surfaces/api/paths",parentData:data24,parentDataProperty:"paths",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data24.credential_header !== undefined){
if(typeof data24.credential_header !== "string"){
const err37 = {instancePath:instancePath+"/surfaces/api/credential_header",schemaPath:"#/properties/surfaces/properties/api/properties/credential_header/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data24.actions !== undefined){
if(!(validate24(data24.actions, {instancePath:instancePath+"/surfaces/api/actions",parentData:data24,parentDataProperty:"actions",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data24.action_success !== undefined){
let data28 = data24.action_success;
if(data28 && typeof data28 == "object" && !Array.isArray(data28)){
if(data28.field === undefined){
const err38 = {instancePath:instancePath+"/surfaces/api/action_success",schemaPath:"#/$defs/bodyMatch/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data28.value === undefined){
const err39 = {instancePath:instancePath+"/surfaces/api/action_success",schemaPath:"#/$defs/bodyMatch/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key7 in data28){
if(!((key7 === "field") || (key7 === "value"))){
const err40 = {instancePath:instancePath+"/surfaces/api/action_success",schemaPath:"#/$defs/bodyMatch/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data28.field !== undefined){
if(typeof data28.field !== "string"){
const err41 = {instancePath:instancePath+"/surfaces/api/action_success/field",schemaPath:"#/$defs/bodyMatch/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
}
else {
const err42 = {instancePath:instancePath+"/surfaces/api/action_success",schemaPath:"#/$defs/bodyMatch/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath:instancePath+"/surfaces/api",schemaPath:"#/properties/surfaces/properties/api/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data14.mcp !== undefined){
let data30 = data14.mcp;
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
for(const key8 in data30){
if(!(key8 === "path")){
const err44 = {instancePath:instancePath+"/surfaces/mcp",schemaPath:"#/properties/surfaces/properties/mcp/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data30.path !== undefined){
if(typeof data30.path !== "string"){
const err45 = {instancePath:instancePath+"/surfaces/mcp/path",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath:instancePath+"/surfaces/mcp",schemaPath:"#/properties/surfaces/properties/mcp/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data14.oauth !== undefined){
let data32 = data14.oauth;
if(data32 && typeof data32 == "object" && !Array.isArray(data32)){
for(const key9 in data32){
if(!(((((((key9 === "metadata") || (key9 === "resource_metadata")) || (key9 === "register")) || (key9 === "authorize")) || (key9 === "token")) || (key9 === "approve")) || (key9 === "fields"))){
const err47 = {instancePath:instancePath+"/surfaces/oauth",schemaPath:"#/properties/surfaces/properties/oauth/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data32.metadata !== undefined){
if(typeof data32.metadata !== "string"){
const err48 = {instancePath:instancePath+"/surfaces/oauth/metadata",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data32.resource_metadata !== undefined){
if(typeof data32.resource_metadata !== "string"){
const err49 = {instancePath:instancePath+"/surfaces/oauth/resource_metadata",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data32.register !== undefined){
if(typeof data32.register !== "string"){
const err50 = {instancePath:instancePath+"/surfaces/oauth/register",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data32.authorize !== undefined){
if(typeof data32.authorize !== "string"){
const err51 = {instancePath:instancePath+"/surfaces/oauth/authorize",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data32.token !== undefined){
if(typeof data32.token !== "string"){
const err52 = {instancePath:instancePath+"/surfaces/oauth/token",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data32.approve !== undefined){
if(typeof data32.approve !== "string"){
const err53 = {instancePath:instancePath+"/surfaces/oauth/approve",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data32.fields !== undefined){
let data39 = data32.fields;
if(data39 && typeof data39 == "object" && !Array.isArray(data39)){
for(const key10 in data39){
let data40 = data39[key10];
const _errs105 = errors;
let valid29 = false;
let passing0 = null;
const _errs106 = errors;
if(typeof data40 !== "string"){
const err54 = {instancePath:instancePath+"/surfaces/oauth/fields/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var _valid1 = _errs106 === errors;
if(_valid1){
valid29 = true;
passing0 = 0;
}
const _errs108 = errors;
if(Array.isArray(data40)){
const len0 = data40.length;
for(let i0=0; i0<len0; i0++){
if(typeof data40[i0] !== "string"){
const err55 = {instancePath:instancePath+"/surfaces/oauth/fields/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
}
else {
const err56 = {instancePath:instancePath+"/surfaces/oauth/fields/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var _valid1 = _errs108 === errors;
if(_valid1 && valid29){
valid29 = false;
passing0 = [passing0, 1];
}
else {
if(_valid1){
valid29 = true;
passing0 = 1;
}
}
if(!valid29){
const err57 = {instancePath:instancePath+"/surfaces/oauth/fields/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
else {
errors = _errs105;
if(vErrors !== null){
if(_errs105){
vErrors.length = _errs105;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err58 = {instancePath:instancePath+"/surfaces/oauth/fields",schemaPath:"#/$defs/fieldNames/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
}
else {
const err59 = {instancePath:instancePath+"/surfaces/oauth",schemaPath:"#/properties/surfaces/properties/oauth/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data14.device !== undefined){
let data42 = data14.device;
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
for(const key11 in data42){
if(!(((((key11 === "start") || (key11 === "poll")) || (key11 === "approve")) || (key11 === "poll_approved")) || (key11 === "fields"))){
const err60 = {instancePath:instancePath+"/surfaces/device",schemaPath:"#/properties/surfaces/properties/device/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data42.start !== undefined){
if(typeof data42.start !== "string"){
const err61 = {instancePath:instancePath+"/surfaces/device/start",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data42.poll !== undefined){
if(typeof data42.poll !== "string"){
const err62 = {instancePath:instancePath+"/surfaces/device/poll",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data42.approve !== undefined){
if(typeof data42.approve !== "string"){
const err63 = {instancePath:instancePath+"/surfaces/device/approve",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data42.poll_approved !== undefined){
let data46 = data42.poll_approved;
if(data46 && typeof data46 == "object" && !Array.isArray(data46)){
if(data46.field === undefined){
const err64 = {instancePath:instancePath+"/surfaces/device/poll_approved",schemaPath:"#/$defs/bodyMatch/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(data46.value === undefined){
const err65 = {instancePath:instancePath+"/surfaces/device/poll_approved",schemaPath:"#/$defs/bodyMatch/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
for(const key12 in data46){
if(!((key12 === "field") || (key12 === "value"))){
const err66 = {instancePath:instancePath+"/surfaces/device/poll_approved",schemaPath:"#/$defs/bodyMatch/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data46.field !== undefined){
if(typeof data46.field !== "string"){
const err67 = {instancePath:instancePath+"/surfaces/device/poll_approved/field",schemaPath:"#/$defs/bodyMatch/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/surfaces/device/poll_approved",schemaPath:"#/$defs/bodyMatch/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data42.fields !== undefined){
let data48 = data42.fields;
if(data48 && typeof data48 == "object" && !Array.isArray(data48)){
for(const key13 in data48){
let data49 = data48[key13];
const _errs135 = errors;
let valid40 = false;
let passing1 = null;
const _errs136 = errors;
if(typeof data49 !== "string"){
const err69 = {instancePath:instancePath+"/surfaces/device/fields/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var _valid2 = _errs136 === errors;
if(_valid2){
valid40 = true;
passing1 = 0;
}
const _errs138 = errors;
if(Array.isArray(data49)){
const len1 = data49.length;
for(let i1=0; i1<len1; i1++){
if(typeof data49[i1] !== "string"){
const err70 = {instancePath:instancePath+"/surfaces/device/fields/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i1,schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
}
else {
const err71 = {instancePath:instancePath+"/surfaces/device/fields/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var _valid2 = _errs138 === errors;
if(_valid2 && valid40){
valid40 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid40 = true;
passing1 = 1;
}
}
if(!valid40){
const err72 = {instancePath:instancePath+"/surfaces/device/fields/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
else {
errors = _errs135;
if(vErrors !== null){
if(_errs135){
vErrors.length = _errs135;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/surfaces/device/fields",schemaPath:"#/$defs/fieldNames/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
}
else {
const err74 = {instancePath:instancePath+"/surfaces/device",schemaPath:"#/properties/surfaces/properties/device/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data14.signup !== undefined){
if(!(validate31(data14.signup, {instancePath:instancePath+"/surfaces/signup",parentData:data14,parentDataProperty:"signup",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
errors = vErrors.length;
}
}
if(data14.hooks !== undefined){
let data52 = data14.hooks;
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
for(const key14 in data52){
if(!(((key14 === "create") || (key14 === "catch")) || (key14 === "fields"))){
const err75 = {instancePath:instancePath+"/surfaces/hooks",schemaPath:"#/properties/surfaces/properties/hooks/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data52.create !== undefined){
if(typeof data52.create !== "string"){
const err76 = {instancePath:instancePath+"/surfaces/hooks/create",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data52.catch !== undefined){
if(typeof data52.catch !== "string"){
const err77 = {instancePath:instancePath+"/surfaces/hooks/catch",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data52.fields !== undefined){
let data55 = data52.fields;
if(data55 && typeof data55 == "object" && !Array.isArray(data55)){
for(const key15 in data55){
let data56 = data55[key15];
const _errs157 = errors;
let valid48 = false;
let passing2 = null;
const _errs158 = errors;
if(typeof data56 !== "string"){
const err78 = {instancePath:instancePath+"/surfaces/hooks/fields/" + key15.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
var _valid3 = _errs158 === errors;
if(_valid3){
valid48 = true;
passing2 = 0;
}
const _errs160 = errors;
if(Array.isArray(data56)){
const len2 = data56.length;
for(let i2=0; i2<len2; i2++){
if(typeof data56[i2] !== "string"){
const err79 = {instancePath:instancePath+"/surfaces/hooks/fields/" + key15.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i2,schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
}
else {
const err80 = {instancePath:instancePath+"/surfaces/hooks/fields/" + key15.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var _valid3 = _errs160 === errors;
if(_valid3 && valid48){
valid48 = false;
passing2 = [passing2, 1];
}
else {
if(_valid3){
valid48 = true;
passing2 = 1;
}
}
if(!valid48){
const err81 = {instancePath:instancePath+"/surfaces/hooks/fields/" + key15.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
else {
errors = _errs157;
if(vErrors !== null){
if(_errs157){
vErrors.length = _errs157;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err82 = {instancePath:instancePath+"/surfaces/hooks/fields",schemaPath:"#/$defs/fieldNames/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
}
else {
const err83 = {instancePath:instancePath+"/surfaces/hooks",schemaPath:"#/properties/surfaces/properties/hooks/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data14.credentials !== undefined){
if(!(validate31(data14.credentials, {instancePath:instancePath+"/surfaces/credentials",parentData:data14,parentDataProperty:"credentials",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
errors = vErrors.length;
}
}
if(data14.trial !== undefined){
if(!(validate31(data14.trial, {instancePath:instancePath+"/surfaces/trial",parentData:data14,parentDataProperty:"trial",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
errors = vErrors.length;
}
}
if(data14.cli !== undefined){
let data60 = data14.cli;
if(data60 && typeof data60 == "object" && !Array.isArray(data60)){
for(const key16 in data60){
if(!(((key16 === "init") || (key16 === "beacon")) || (key16 === "fields"))){
const err84 = {instancePath:instancePath+"/surfaces/cli",schemaPath:"#/properties/surfaces/properties/cli/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data60.init !== undefined){
if(typeof data60.init !== "string"){
const err85 = {instancePath:instancePath+"/surfaces/cli/init",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data60.beacon !== undefined){
if(typeof data60.beacon !== "string"){
const err86 = {instancePath:instancePath+"/surfaces/cli/beacon",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data60.fields !== undefined){
let data63 = data60.fields;
if(data63 && typeof data63 == "object" && !Array.isArray(data63)){
for(const key17 in data63){
let data64 = data63[key17];
const _errs180 = errors;
let valid56 = false;
let passing3 = null;
const _errs181 = errors;
if(typeof data64 !== "string"){
const err87 = {instancePath:instancePath+"/surfaces/cli/fields/" + key17.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
var _valid4 = _errs181 === errors;
if(_valid4){
valid56 = true;
passing3 = 0;
}
const _errs183 = errors;
if(Array.isArray(data64)){
const len3 = data64.length;
for(let i3=0; i3<len3; i3++){
if(typeof data64[i3] !== "string"){
const err88 = {instancePath:instancePath+"/surfaces/cli/fields/" + key17.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i3,schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
}
else {
const err89 = {instancePath:instancePath+"/surfaces/cli/fields/" + key17.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf/1/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
var _valid4 = _errs183 === errors;
if(_valid4 && valid56){
valid56 = false;
passing3 = [passing3, 1];
}
else {
if(_valid4){
valid56 = true;
passing3 = 1;
}
}
if(!valid56){
const err90 = {instancePath:instancePath+"/surfaces/cli/fields/" + key17.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/fieldNames/additionalProperties/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
errors = _errs180;
if(vErrors !== null){
if(_errs180){
vErrors.length = _errs180;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err91 = {instancePath:instancePath+"/surfaces/cli/fields",schemaPath:"#/$defs/fieldNames/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
}
else {
const err92 = {instancePath:instancePath+"/surfaces/cli",schemaPath:"#/properties/surfaces/properties/cli/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data14.clients !== undefined){
let data66 = data14.clients;
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
for(const key18 in data66){
if(!((key18 === "cli") || (key18 === "sdk"))){
const err93 = {instancePath:instancePath+"/surfaces/clients",schemaPath:"#/properties/surfaces/properties/clients/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data66.cli !== undefined){
if(typeof data66.cli !== "string"){
const err94 = {instancePath:instancePath+"/surfaces/clients/cli",schemaPath:"#/properties/surfaces/properties/clients/properties/cli/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
if(data66.sdk !== undefined){
if(typeof data66.sdk !== "string"){
const err95 = {instancePath:instancePath+"/surfaces/clients/sdk",schemaPath:"#/properties/surfaces/properties/clients/properties/sdk/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
}
else {
const err96 = {instancePath:instancePath+"/surfaces/clients",schemaPath:"#/properties/surfaces/properties/clients/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
if(data14.finder !== undefined){
if(typeof data14.finder !== "string"){
const err97 = {instancePath:instancePath+"/surfaces/finder",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data14.passthrough !== undefined){
if(!(validate24(data14.passthrough, {instancePath:instancePath+"/surfaces/passthrough",parentData:data14,parentDataProperty:"passthrough",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data14.custom !== undefined){
let data71 = data14.custom;
if(Array.isArray(data71)){
const len4 = data71.length;
for(let i4=0; i4<len4; i4++){
let data72 = data71[i4];
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
if(data72.pattern === undefined){
const err98 = {instancePath:instancePath+"/surfaces/custom/" + i4,schemaPath:"#/properties/surfaces/properties/custom/items/required",keyword:"required",params:{missingProperty: "pattern"},message:"must have required property '"+"pattern"+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if(data72.role === undefined){
const err99 = {instancePath:instancePath+"/surfaces/custom/" + i4,schemaPath:"#/properties/surfaces/properties/custom/items/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
for(const key19 in data72){
if(!(((key19 === "pattern") || (key19 === "role")) || (key19 === "observed"))){
const err100 = {instancePath:instancePath+"/surfaces/custom/" + i4,schemaPath:"#/properties/surfaces/properties/custom/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
if(data72.pattern !== undefined){
if(typeof data72.pattern !== "string"){
const err101 = {instancePath:instancePath+"/surfaces/custom/" + i4+"/pattern",schemaPath:"#/$defs/regex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
if(data72.role !== undefined){
let data74 = data72.role;
if(typeof data74 !== "string"){
const err102 = {instancePath:instancePath+"/surfaces/custom/" + i4+"/role",schemaPath:"#/$defs/route/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if(!((((((((((((((((((((((data74 === "docs") || (data74 === "docs_root")) || (data74 === "download")) || (data74 === "api")) || (data74 === "mcp")) || (data74 === "oauth.register")) || (data74 === "oauth.authorize")) || (data74 === "oauth.token")) || (data74 === "oauth.approve")) || (data74 === "device.start")) || (data74 === "device.poll")) || (data74 === "device.approve")) || (data74 === "signup")) || (data74 === "hooks.create")) || (data74 === "hooks.catch")) || (data74 === "credentials")) || (data74 === "trial")) || (data74 === "finder")) || (data74 === "cli.init")) || (data74 === "cli.beacon")) || (data74 === "passthrough")) || (data74 === "other"))){
const err103 = {instancePath:instancePath+"/surfaces/custom/" + i4+"/role",schemaPath:"#/$defs/route/enum",keyword:"enum",params:{allowedValues: schema86.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
if(data72.observed !== undefined){
if(typeof data72.observed !== "boolean"){
const err104 = {instancePath:instancePath+"/surfaces/custom/" + i4+"/observed",schemaPath:"#/properties/surfaces/properties/custom/items/properties/observed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
}
else {
const err105 = {instancePath:instancePath+"/surfaces/custom/" + i4,schemaPath:"#/properties/surfaces/properties/custom/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
}
else {
const err106 = {instancePath:instancePath+"/surfaces/custom",schemaPath:"#/properties/surfaces/properties/custom/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
}
else {
const err107 = {instancePath:instancePath+"/surfaces",schemaPath:"#/properties/surfaces/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data.secrets !== undefined){
let data76 = data.secrets;
if(data76 && typeof data76 == "object" && !Array.isArray(data76)){
for(const key20 in data76){
if(!(((key20 === "fields") || (key20 === "shapes")) || (key20 === "uri_fields"))){
const err108 = {instancePath:instancePath+"/secrets",schemaPath:"#/properties/secrets/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data76.fields !== undefined){
let data77 = data76.fields;
if(Array.isArray(data77)){
const len5 = data77.length;
for(let i5=0; i5<len5; i5++){
if(typeof data77[i5] !== "string"){
const err109 = {instancePath:instancePath+"/secrets/fields/" + i5,schemaPath:"#/properties/secrets/properties/fields/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
}
else {
const err110 = {instancePath:instancePath+"/secrets/fields",schemaPath:"#/properties/secrets/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data76.shapes !== undefined){
let data79 = data76.shapes;
if(Array.isArray(data79)){
const len6 = data79.length;
for(let i6=0; i6<len6; i6++){
if(typeof data79[i6] !== "string"){
const err111 = {instancePath:instancePath+"/secrets/shapes/" + i6,schemaPath:"#/properties/secrets/properties/shapes/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
}
else {
const err112 = {instancePath:instancePath+"/secrets/shapes",schemaPath:"#/properties/secrets/properties/shapes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
if(data76.uri_fields !== undefined){
let data81 = data76.uri_fields;
if(data81 && typeof data81 == "object" && !Array.isArray(data81)){
for(const key21 in data81){
if(typeof data81[key21] !== "string"){
const err113 = {instancePath:instancePath+"/secrets/uri_fields/" + key21.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/secrets/properties/uri_fields/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
}
else {
const err114 = {instancePath:instancePath+"/secrets/uri_fields",schemaPath:"#/properties/secrets/properties/uri_fields/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
}
else {
const err115 = {instancePath:instancePath+"/secrets",schemaPath:"#/properties/secrets/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data.headers !== undefined){
let data83 = data.headers;
if(data83 && typeof data83 == "object" && !Array.isArray(data83)){
for(const key22 in data83){
if(!(func1.call(schema50.properties.headers.properties, key22))){
const err116 = {instancePath:instancePath+"/headers",schemaPath:"#/properties/headers/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data83.credential !== undefined){
if(typeof data83.credential !== "string"){
const err117 = {instancePath:instancePath+"/headers/credential",schemaPath:"#/properties/headers/properties/credential/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data83.session !== undefined){
if(typeof data83.session !== "string"){
const err118 = {instancePath:instancePath+"/headers/session",schemaPath:"#/properties/headers/properties/session/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
if(data83.reference !== undefined){
let data86 = data83.reference;
if(Array.isArray(data86)){
const len7 = data86.length;
for(let i7=0; i7<len7; i7++){
if(typeof data86[i7] !== "string"){
const err119 = {instancePath:instancePath+"/headers/reference/" + i7,schemaPath:"#/properties/headers/properties/reference/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
}
else {
const err120 = {instancePath:instancePath+"/headers/reference",schemaPath:"#/properties/headers/properties/reference/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
}
if(data83.install !== undefined){
let data88 = data83.install;
if((typeof data88 !== "string") && (data88 !== null)){
const err121 = {instancePath:instancePath+"/headers/install",schemaPath:"#/properties/headers/properties/install/type",keyword:"type",params:{type: schema50.properties.headers.properties.install.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
if(data83.setup !== undefined){
let data89 = data83.setup;
if((typeof data89 !== "string") && (data89 !== null)){
const err122 = {instancePath:instancePath+"/headers/setup",schemaPath:"#/properties/headers/properties/setup/type",keyword:"type",params:{type: schema50.properties.headers.properties.setup.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
if(data83.agent !== undefined){
let data90 = data83.agent;
if((typeof data90 !== "string") && (data90 !== null)){
const err123 = {instancePath:instancePath+"/headers/agent",schemaPath:"#/properties/headers/properties/agent/type",keyword:"type",params:{type: schema50.properties.headers.properties.agent.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data83.client !== undefined){
let data91 = data83.client;
if((typeof data91 !== "string") && (data91 !== null)){
const err124 = {instancePath:instancePath+"/headers/client",schemaPath:"#/properties/headers/properties/client/type",keyword:"type",params:{type: schema50.properties.headers.properties.client.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
}
if(data83.intent !== undefined){
let data92 = data83.intent;
if((typeof data92 !== "string") && (data92 !== null)){
const err125 = {instancePath:instancePath+"/headers/intent",schemaPath:"#/properties/headers/properties/intent/type",keyword:"type",params:{type: schema50.properties.headers.properties.intent.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data83.signature !== undefined){
if(typeof data83.signature !== "string"){
const err126 = {instancePath:instancePath+"/headers/signature",schemaPath:"#/properties/headers/properties/signature/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
}
else {
const err127 = {instancePath:instancePath+"/headers",schemaPath:"#/properties/headers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
if(data.forward !== undefined){
let data94 = data.forward;
if(data94 && typeof data94 == "object" && !Array.isArray(data94)){
for(const key23 in data94){
if(!((key23 === "headers") || (key23 === "key_header"))){
const err128 = {instancePath:instancePath+"/forward",schemaPath:"#/properties/forward/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data94.headers !== undefined){
let data95 = data94.headers;
if(data95 && typeof data95 == "object" && !Array.isArray(data95)){
for(const key24 in data95){
if(typeof data95[key24] !== "string"){
const err129 = {instancePath:instancePath+"/forward/headers/" + key24.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/forward/properties/headers/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
}
else {
const err130 = {instancePath:instancePath+"/forward/headers",schemaPath:"#/properties/forward/properties/headers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data94.key_header !== undefined){
let data97 = data94.key_header;
if((typeof data97 !== "string") && (data97 !== null)){
const err131 = {instancePath:instancePath+"/forward/key_header",schemaPath:"#/properties/forward/properties/key_header/type",keyword:"type",params:{type: schema50.properties.forward.properties.key_header.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
}
else {
const err132 = {instancePath:instancePath+"/forward",schemaPath:"#/properties/forward/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
if(data.record_bodies !== undefined){
if(typeof data.record_bodies !== "boolean"){
const err133 = {instancePath:instancePath+"/record_bodies",schemaPath:"#/properties/record_bodies/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
if(data.observe !== undefined){
let data99 = data.observe;
if(data99 && typeof data99 == "object" && !Array.isArray(data99)){
if(data99.bodies !== undefined){
let data100 = data99.bodies;
if(data100 && typeof data100 == "object" && !Array.isArray(data100)){
if(data100.routes !== undefined){
if(!(Array.isArray(data100.routes))){
const err134 = {instancePath:instancePath+"/observe/bodies/routes",schemaPath:"#/properties/observe/properties/bodies/properties/routes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
if(data100.allow_fields !== undefined){
let data102 = data100.allow_fields;
if(Array.isArray(data102)){
const len8 = data102.length;
for(let i8=0; i8<len8; i8++){
if(typeof data102[i8] !== "string"){
const err135 = {instancePath:instancePath+"/observe/bodies/allow_fields/" + i8,schemaPath:"#/properties/observe/properties/bodies/properties/allow_fields/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
}
else {
const err136 = {instancePath:instancePath+"/observe/bodies/allow_fields",schemaPath:"#/properties/observe/properties/bodies/properties/allow_fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
if(data100.max_bytes !== undefined){
let data104 = data100.max_bytes;
if(!(((typeof data104 == "number") && (!(data104 % 1) && !isNaN(data104))) && (isFinite(data104)))){
const err137 = {instancePath:instancePath+"/observe/bodies/max_bytes",schemaPath:"#/properties/observe/properties/bodies/properties/max_bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data100.json_rpc !== undefined){
if(typeof data100.json_rpc !== "boolean"){
const err138 = {instancePath:instancePath+"/observe/bodies/json_rpc",schemaPath:"#/properties/observe/properties/bodies/properties/json_rpc/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
}
else {
const err139 = {instancePath:instancePath+"/observe/bodies",schemaPath:"#/properties/observe/properties/bodies/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
}
else {
const err140 = {instancePath:instancePath+"/observe",schemaPath:"#/properties/observe/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
if(data.rules !== undefined){
let data106 = data.rules;
if(Array.isArray(data106)){
const len9 = data106.length;
for(let i9=0; i9<len9; i9++){
let data107 = data106[i9];
const _errs280 = errors;
let valid83 = true;
const _errs281 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.kind !== undefined){
const _errs283 = errors;
const _errs284 = errors;
if("gate" !== data107.kind){
const err141 = {};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
var valid85 = _errs284 === errors;
if(valid85){
const err142 = {};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
else {
errors = _errs283;
if(vErrors !== null){
if(_errs283){
vErrors.length = _errs283;
}
else {
vErrors = null;
}
}
}
}
}
var _valid5 = _errs281 === errors;
errors = _errs280;
if(vErrors !== null){
if(_errs280){
vErrors.length = _errs280;
}
else {
vErrors = null;
}
}
if(_valid5){
const _errs285 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.on_error !== undefined){
if("open" !== data107.on_error){
const err143 = {instancePath:instancePath+"/rules/" + i9+"/on_error",schemaPath:"#/properties/rules/items/then/properties/on_error/const",keyword:"const",params:{allowedValue: "open"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
}
var _valid5 = _errs285 === errors;
valid83 = _valid5;
if(valid83){
var props3 = {};
props3.on_error = true;
props3.kind = true;
}
}
if(!valid83){
const err144 = {instancePath:instancePath+"/rules/" + i9,schemaPath:"#/properties/rules/items/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err145 = {instancePath:instancePath+"/rules/" + i9,schemaPath:"#/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
if(data107.kind === undefined){
const err146 = {instancePath:instancePath+"/rules/" + i9,schemaPath:"#/properties/rules/items/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
if(props3 !== true){
props3 = props3 || {};
props3.id = true;
props3.kind = true;
props3.mode = true;
props3.environments = true;
props3.on_error = true;
props3.label = true;
props3.faces = true;
props3.route = true;
props3.form = true;
props3.tool = true;
props3.acknowledgement = true;
props3.instructions = true;
props3.description_suffix = true;
props3.answers = true;
props3.default_links = true;
props3.links = true;
props3.suffix = true;
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err147 = {instancePath:instancePath+"/rules/" + i9+"/id",schemaPath:"#/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
if(data107.kind !== undefined){
let data111 = data107.kind;
if(typeof data111 !== "string"){
const err148 = {instancePath:instancePath+"/rules/" + i9+"/kind",schemaPath:"#/properties/rules/items/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
if(!((((((data111 === "inject") || (data111 === "gate")) || (data111 === "finder")) || (data111 === "notfound")) || (data111 === "error")) || (data111 === "face"))){
const err149 = {instancePath:instancePath+"/rules/" + i9+"/kind",schemaPath:"#/properties/rules/items/properties/kind/enum",keyword:"enum",params:{allowedValues: schema50.properties.rules.items.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
if(data107.mode !== undefined){
let data112 = data107.mode;
if(typeof data112 !== "string"){
const err150 = {instancePath:instancePath+"/rules/" + i9+"/mode",schemaPath:"#/properties/rules/items/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if(!((data112 === "dry_run") || (data112 === "live"))){
const err151 = {instancePath:instancePath+"/rules/" + i9+"/mode",schemaPath:"#/properties/rules/items/properties/mode/enum",keyword:"enum",params:{allowedValues: schema50.properties.rules.items.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
if(data107.environments !== undefined){
let data113 = data107.environments;
if(Array.isArray(data113)){
const len10 = data113.length;
for(let i10=0; i10<len10; i10++){
let data114 = data113[i10];
if(typeof data114 !== "string"){
const err152 = {instancePath:instancePath+"/rules/" + i9+"/environments/" + i10,schemaPath:"#/properties/rules/items/properties/environments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
if(!(((data114 === "production") || (data114 === "preview")) || (data114 === "development"))){
const err153 = {instancePath:instancePath+"/rules/" + i9+"/environments/" + i10,schemaPath:"#/properties/rules/items/properties/environments/items/enum",keyword:"enum",params:{allowedValues: schema50.properties.rules.items.properties.environments.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
}
}
else {
const err154 = {instancePath:instancePath+"/rules/" + i9+"/environments",schemaPath:"#/properties/rules/items/properties/environments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
if(data107.on_error !== undefined){
let data115 = data107.on_error;
if(typeof data115 !== "string"){
const err155 = {instancePath:instancePath+"/rules/" + i9+"/on_error",schemaPath:"#/properties/rules/items/properties/on_error/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
if(!((data115 === "open") || (data115 === "closed"))){
const err156 = {instancePath:instancePath+"/rules/" + i9+"/on_error",schemaPath:"#/properties/rules/items/properties/on_error/enum",keyword:"enum",params:{allowedValues: schema50.properties.rules.items.properties.on_error.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err157 = {instancePath:instancePath+"/rules/" + i9+"/label",schemaPath:"#/properties/rules/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data107.faces !== undefined){
let data117 = data107.faces;
if(!(data117 && typeof data117 == "object" && !Array.isArray(data117))){
const err158 = {instancePath:instancePath+"/rules/" + i9+"/faces",schemaPath:"#/properties/rules/items/properties/faces/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
if(data107.route !== undefined){
if(typeof data107.route !== "string"){
const err159 = {instancePath:instancePath+"/rules/" + i9+"/route",schemaPath:"#/properties/rules/items/properties/route/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
if(data107.form !== undefined){
let data119 = data107.form;
if(typeof data119 !== "string"){
const err160 = {instancePath:instancePath+"/rules/" + i9+"/form",schemaPath:"#/properties/rules/items/properties/form/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
if(!(((data119 === "tool") || (data119 === "instructions")) || (data119 === "descriptions"))){
const err161 = {instancePath:instancePath+"/rules/" + i9+"/form",schemaPath:"#/properties/rules/items/properties/form/enum",keyword:"enum",params:{allowedValues: schema50.properties.rules.items.properties.form.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data107.tool !== undefined){
let data120 = data107.tool;
if(data120 && typeof data120 == "object" && !Array.isArray(data120)){
if(data120.name === undefined){
const err162 = {instancePath:instancePath+"/rules/" + i9+"/tool",schemaPath:"#/properties/rules/items/properties/tool/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if(data120.name !== undefined){
if(typeof data120.name !== "string"){
const err163 = {instancePath:instancePath+"/rules/" + i9+"/tool/name",schemaPath:"#/properties/rules/items/properties/tool/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
if(data120.description !== undefined){
if(typeof data120.description !== "string"){
const err164 = {instancePath:instancePath+"/rules/" + i9+"/tool/description",schemaPath:"#/properties/rules/items/properties/tool/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
if(data120.inputSchema !== undefined){
let data123 = data120.inputSchema;
if(!(data123 && typeof data123 == "object" && !Array.isArray(data123))){
const err165 = {instancePath:instancePath+"/rules/" + i9+"/tool/inputSchema",schemaPath:"#/properties/rules/items/properties/tool/properties/inputSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
}
else {
const err166 = {instancePath:instancePath+"/rules/" + i9+"/tool",schemaPath:"#/properties/rules/items/properties/tool/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
if(data107.acknowledgement !== undefined){
if(typeof data107.acknowledgement !== "string"){
const err167 = {instancePath:instancePath+"/rules/" + i9+"/acknowledgement",schemaPath:"#/properties/rules/items/properties/acknowledgement/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
}
if(data107.instructions !== undefined){
if(typeof data107.instructions !== "string"){
const err168 = {instancePath:instancePath+"/rules/" + i9+"/instructions",schemaPath:"#/properties/rules/items/properties/instructions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
}
if(data107.description_suffix !== undefined){
if(typeof data107.description_suffix !== "string"){
const err169 = {instancePath:instancePath+"/rules/" + i9+"/description_suffix",schemaPath:"#/properties/rules/items/properties/description_suffix/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
if(data107.answers !== undefined){
let data127 = data107.answers;
if(Array.isArray(data127)){
const len11 = data127.length;
for(let i11=0; i11<len11; i11++){
let data128 = data127[i11];
if(data128 && typeof data128 == "object" && !Array.isArray(data128)){
if(data128.match === undefined){
const err170 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11,schemaPath:"#/properties/rules/items/properties/answers/items/required",keyword:"required",params:{missingProperty: "match"},message:"must have required property '"+"match"+"'"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
if(data128.links === undefined){
const err171 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11,schemaPath:"#/properties/rules/items/properties/answers/items/required",keyword:"required",params:{missingProperty: "links"},message:"must have required property '"+"links"+"'"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
if(data128.match !== undefined){
if(typeof data128.match !== "string"){
const err172 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11+"/match",schemaPath:"#/properties/rules/items/properties/answers/items/properties/match/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
if(data128.links !== undefined){
let data130 = data128.links;
if(Array.isArray(data130)){
const len12 = data130.length;
for(let i12=0; i12<len12; i12++){
if(typeof data130[i12] !== "string"){
const err173 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11+"/links/" + i12,schemaPath:"#/properties/rules/items/properties/answers/items/properties/links/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
}
else {
const err174 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11+"/links",schemaPath:"#/properties/rules/items/properties/answers/items/properties/links/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
}
}
else {
const err175 = {instancePath:instancePath+"/rules/" + i9+"/answers/" + i11,schemaPath:"#/properties/rules/items/properties/answers/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
}
}
else {
const err176 = {instancePath:instancePath+"/rules/" + i9+"/answers",schemaPath:"#/properties/rules/items/properties/answers/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
if(data107.default_links !== undefined){
let data132 = data107.default_links;
if(Array.isArray(data132)){
const len13 = data132.length;
for(let i13=0; i13<len13; i13++){
if(typeof data132[i13] !== "string"){
const err177 = {instancePath:instancePath+"/rules/" + i9+"/default_links/" + i13,schemaPath:"#/properties/rules/items/properties/default_links/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
}
}
else {
const err178 = {instancePath:instancePath+"/rules/" + i9+"/default_links",schemaPath:"#/properties/rules/items/properties/default_links/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
}
if(data107.links !== undefined){
let data134 = data107.links;
if(data134 && typeof data134 == "object" && !Array.isArray(data134)){
for(const key25 in data134){
if(typeof data134[key25] !== "string"){
const err179 = {instancePath:instancePath+"/rules/" + i9+"/links/" + key25.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/rules/items/properties/links/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
}
}
else {
const err180 = {instancePath:instancePath+"/rules/" + i9+"/links",schemaPath:"#/properties/rules/items/properties/links/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data107.suffix !== undefined){
if(typeof data107.suffix !== "string"){
const err181 = {instancePath:instancePath+"/rules/" + i9+"/suffix",schemaPath:"#/properties/rules/items/properties/suffix/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
}
else {
const err182 = {instancePath:instancePath+"/rules/" + i9,schemaPath:"#/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
}
}
else {
const err183 = {instancePath:instancePath+"/rules",schemaPath:"#/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
if(data.assertion !== undefined){
let data137 = data.assertion;
if(data137 && typeof data137 == "object" && !Array.isArray(data137)){
for(const key26 in data137){
if(!((key26 === "enabled") || (key26 === "audience"))){
const err184 = {instancePath:instancePath+"/assertion",schemaPath:"#/properties/assertion/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
if(data137.enabled !== undefined){
if(typeof data137.enabled !== "boolean"){
const err185 = {instancePath:instancePath+"/assertion/enabled",schemaPath:"#/properties/assertion/properties/enabled/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
}
if(data137.audience !== undefined){
let data139 = data137.audience;
if(Array.isArray(data139)){
const len14 = data139.length;
for(let i14=0; i14<len14; i14++){
if(typeof data139[i14] !== "string"){
const err186 = {instancePath:instancePath+"/assertion/audience/" + i14,schemaPath:"#/properties/assertion/properties/audience/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
}
}
else {
const err187 = {instancePath:instancePath+"/assertion/audience",schemaPath:"#/properties/assertion/properties/audience/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
}
}
else {
const err188 = {instancePath:instancePath+"/assertion",schemaPath:"#/properties/assertion/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
}
if(data.signers !== undefined){
let data141 = data.signers;
if(Array.isArray(data141)){
const len15 = data141.length;
for(let i15=0; i15<len15; i15++){
if(typeof data141[i15] !== "string"){
const err189 = {instancePath:instancePath+"/signers/" + i15,schemaPath:"#/properties/signers/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
}
else {
const err190 = {instancePath:instancePath+"/signers",schemaPath:"#/properties/signers/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
}
if(data.destinations !== undefined){
let data143 = data.destinations;
if(Array.isArray(data143)){
const len16 = data143.length;
for(let i16=0; i16<len16; i16++){
let data144 = data143[i16];
if(data144 && typeof data144 == "object" && !Array.isArray(data144)){
if(data144.kind !== undefined){
let data145 = data144.kind;
if(typeof data145 !== "string"){
const err191 = {instancePath:instancePath+"/destinations/" + i16+"/kind",schemaPath:"#/properties/destinations/items/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
if(!(((data145 === "scope") || (data145 === "otlp")) || (data145 === "webhook"))){
const err192 = {instancePath:instancePath+"/destinations/" + i16+"/kind",schemaPath:"#/properties/destinations/items/properties/kind/enum",keyword:"enum",params:{allowedValues: schema50.properties.destinations.items.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
if(data144.url !== undefined){
if(typeof data144.url !== "string"){
const err193 = {instancePath:instancePath+"/destinations/" + i16+"/url",schemaPath:"#/properties/destinations/items/properties/url/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
}
if(data144.headers !== undefined){
let data147 = data144.headers;
if(!(data147 && typeof data147 == "object" && !Array.isArray(data147))){
const err194 = {instancePath:instancePath+"/destinations/" + i16+"/headers",schemaPath:"#/properties/destinations/items/properties/headers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
}
if(data144.events !== undefined){
if(!(Array.isArray(data144.events))){
const err195 = {instancePath:instancePath+"/destinations/" + i16+"/events",schemaPath:"#/properties/destinations/items/properties/events/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
}
else {
const err196 = {instancePath:instancePath+"/destinations/" + i16,schemaPath:"#/properties/destinations/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
}
}
else {
const err197 = {instancePath:instancePath+"/destinations",schemaPath:"#/properties/destinations/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
}
if(data.retention_days !== undefined){
let data149 = data.retention_days;
if(!(((typeof data149 == "number") && (!(data149 % 1) && !isNaN(data149))) && (isFinite(data149)))){
const err198 = {instancePath:instancePath+"/retention_days",schemaPath:"#/properties/retention_days/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
if((typeof data149 == "number") && (isFinite(data149))){
if(data149 > 400 || isNaN(data149)){
const err199 = {instancePath:instancePath+"/retention_days",schemaPath:"#/properties/retention_days/maximum",keyword:"maximum",params:{comparison: "<=", limit: 400},message:"must be <= 400"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if(data149 < 30 || isNaN(data149)){
const err200 = {instancePath:instancePath+"/retention_days",schemaPath:"#/properties/retention_days/minimum",keyword:"minimum",params:{comparison: ">=", limit: 30},message:"must be >= 30"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
}
}
if(data.salt_epoch !== undefined){
let data150 = data.salt_epoch;
if(!(((typeof data150 == "number") && (!(data150 % 1) && !isNaN(data150))) && (isFinite(data150)))){
const err201 = {instancePath:instancePath+"/salt_epoch",schemaPath:"#/properties/salt_epoch/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
if((typeof data150 == "number") && (isFinite(data150))){
if(data150 < 1 || isNaN(data150)){
const err202 = {instancePath:instancePath+"/salt_epoch",schemaPath:"#/properties/salt_epoch/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
}
}
}
else {
const err203 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":{"schema":true,"version":true,"about":true,"origin":true,"report":true,"routes":true,"surfaces":true,"secrets":true,"headers":true,"forward":true,"record_bodies":true,"observe":true,"rules":true,"assertion":true,"signers":true,"destinations":true,"retention_days":true,"salt_epoch":true},"dynamicProps":false,"dynamicItems":false};
