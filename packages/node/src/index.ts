/**
 * Scope Journeys on Node's own HTTP server: three mounts over one
 * io, and the standalone proxy. The core is `scope-journeys`; this package binds it to
 * node:http (the socket's facts, the hop to the app's own listener or to an origin, the policy
 * cache, shipping after the response).
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { forwardedUrl, isHost } from "scope-journeys";

import { afterResponse, createNodeHandler, createSensor, requestHost, toRequest, type Exchange, type NodeOptions } from "./handler.js";
import { forwardedAddress, socketFacts } from "./facts.js";

export { createNodeHandler, createSensor, toRequest, requestHost, send, afterResponse, INNER_HEADER, type NodeOptions, type NodeHandler, type Sensor, type Exchange } from "./handler.js";
export { createNodeIo, type NodeIoOptions } from "./io.js";
export { hop, headersOf, HOP_BY_HOP, type HopOptions } from "./hop.js";
export { platformFacts, socketFacts, canonicalAddress, forwardedAddress, type Identity, type SocketFacts } from "./facts.js";
export { memoryCache, resetCache } from "./cache.js";
export { deliver, droppedSoFar, resetDelivery, type DeliveryOptions } from "scope-journeys";
export { serveProxy, parseListen, type ProxyOptions, type RunningProxy } from "./proxy.js";

/**
 * Express: `app.use(journeys())`, placed first. An observed request is answered here (the hop to
 * the app's own listener is the app's execution, so `next` is never called for it); the inner pass,
 * a host the install does not observe and a failure of the sensor go to `next` untouched.
 */
export function journeys(options: NodeOptions = {}): (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => Promise<void> {
  const handler = createNodeHandler(options);
  return (req, res, next) => handler(req, res, () => next());
}

interface FastifyLikeReply {
  raw: ServerResponse;
  hijack(): unknown;
}

interface FastifyLikeRequest {
  raw: IncomingMessage;
}

interface FastifyLikeInstance {
  addHook(name: "onRequest", hook: (request: FastifyLikeRequest, reply: FastifyLikeReply, done: (error?: Error) => void) => void): unknown;
}

/**
 * Fastify: `await fastify.register(fastifyJourneys)`. An onRequest hook hijacks the reply for an
 * observed request and hands the raw messages to the handler; the inner pass and an unobserved
 * host continue down the route table. The plugin skips Fastify's encapsulation (the same symbol
 * fastify-plugin sets), so the hook sees every route of the instance it is registered on.
 */
async function fastifyPlugin(instance: FastifyLikeInstance, options: NodeOptions = {}): Promise<void> {
  const handler = createNodeHandler(options);
  instance.addHook("onRequest", (request, reply, done) => {
    if (!handler.observes(request.raw)) {
      done();
      return;
    }
    reply.hijack();
    void handler(request.raw, reply.raw);
    done();
  });
}

export const fastifyJourneys: typeof fastifyPlugin = Object.assign(fastifyPlugin, { [Symbol.for("skip-override")]: true, [Symbol.for("fastify.display-name")]: "scope-journeys-node", [Symbol.for("plugin-meta")]: { name: "scope-journeys-node" } });

interface HonoLikeContext {
  req: { raw: Request };
  env?: unknown;
}

const nodeEnv = (env: unknown): { incoming?: IncomingMessage; outgoing?: ServerResponse } => {
  if (!env || typeof env !== "object") return {};
  const { incoming, outgoing } = env as { incoming?: unknown; outgoing?: unknown };
  return { incoming: incoming && typeof incoming === "object" && "httpVersion" in incoming ? (incoming as IncomingMessage) : undefined, outgoing: outgoing && typeof outgoing === "object" && "writableFinished" in outgoing ? (outgoing as ServerResponse) : undefined };
};

/**
 * Hono: `app.use(honoJourneys())`, fetch-native. The middleware receives `c.req.raw` and returns
 * the Response the core built; on `@hono/node-server` the socket's facts and the response's finish
 * come from `c.env`, elsewhere the address is the trusted x-forwarded-for or nothing.
 */
export function honoJourneys(options: NodeOptions = {}): (c: HonoLikeContext, next: () => Promise<void>) => Promise<Response | undefined> {
  const sensor = createSensor(options);
  return async (c, next) => {
    const request = c.req.raw;
    const { incoming, outgoing } = nodeEnv(c.env);
    // Fetch-native (no Node message): the runtime built the URL on the Host header; behind a trusted proxy the forwarded host names it, as toRequest does for a Node message.
    const url = sensor.forwardedHost && !incoming ? forwardedUrl(new URL(request.url), request.headers) : new URL(request.url);
    const host = incoming ? requestHost(incoming, sensor.forwardedHost) : isHost(url.host) ? url.host : null;
    if (!sensor.observes(request.headers.get("x-journeys-inner"), host)) {
      await next();
      return undefined;
    }
    try {
      const exchange: Exchange = {
        request: incoming ? toRequest(incoming, sensor.trustProxy, sensor.forwardedHost) : url.href === request.url ? request : new Request(url, { method: request.method, headers: request.headers, body: request.body, redirect: "manual", ...(request.body ? { duplex: "half" } : {}) } as RequestInit),
        socket: incoming ? socketFacts(incoming, sensor.trustProxy) : { address: sensor.trustProxy ? forwardedAddress(request.headers.get("x-forwarded-for") ?? undefined) : null, peer: null, tls_protocol_version: null, network_protocol_version: null },
        localPort: incoming?.socket?.localPort ?? null,
        afterResponse: outgoing ? afterResponse(outgoing) : (work) => work(),
      };
      return await sensor.sense(exchange);
    } catch (error) {
      sensor.log("error", `journeys: the sensor failed, passing the request on untouched: ${error instanceof Error ? error.message : String(error)}`);
      await next();
      return undefined;
    }
  };
}
