/**
 * Scope Journeys as an Envoy external processor: a gRPC
 * service implementing `envoy.service.ext_proc.v3.ExternalProcessor` whose stream receives the
 * request's headers and body and the response's headers and body, and answers each with a
 * mutation or an immediate response. The core is `scope-journeys`; this package binds it to
 * the stream (the facts Envoy carries, the policy cache, shipping).
 */
export { createProcessor, serveExtProc, parseHeaders, mutationBetween, ExternalProcessor, BODY_MODE, type Processor, type ProcessorOptions, type ServerOptions, type RunningServer, type ProcessingRequest, type ProcessingResponse, type HttpHeaders, type HttpBody, type HeaderMap, type HeaderValue, type HeaderMutation, type HeaderValueOption, type CommonResponse, type ProcessingMode } from "./server.js";
export { platformFacts, type Identity } from "./facts.js";
export { loadPolicy, resetPolicyCache, type PolicyState } from "./policy-cache.js";
export { memoryCache, resetCache } from "./cache.js";
export { deliver, droppedSoFar, resetDelivery, type DeliveryOptions } from "./deliver.js";
