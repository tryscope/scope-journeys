import { createServer, type Server } from "node:http";

import type { LogLevel } from "scope-journeys";

import { createNodeHandler, type NodeOptions } from "./handler.js";

export interface ProxyOptions extends Omit<NodeOptions, "form" | "track"> {
  /** The origin every request is forwarded to (`--origin`). */
  origin: string;
  /** `host:port`, `:port` (every interface) or `port` (`--listen`, `JOURNEYS_LISTEN`; `:8080` by default). */
  listen?: string;
  /** How long a drain waits for in-flight requests and pending shipments (10 seconds). */
  drainMs?: number;
  /** Install the SIGTERM and SIGINT handlers that drain and exit (the binary does; a test does not). */
  signals?: boolean;
}

export interface RunningProxy {
  url: string;
  host: string;
  port: number;
  /** Stops accepting, lets in-flight requests finish, waits for the shipments they started, closes. */
  close(): Promise<void>;
  /** Resolves once `close` has run (from a signal or a call). */
  closed: Promise<void>;
}

/** `host:port`, `:port` or `port`; an IPv6 host in brackets. */
export function parseListen(value: string): { host: string | undefined; port: number } {
  const trimmed = value.trim();
  const m = /^\d+$/.test(trimmed) ? [trimmed, undefined, undefined, trimmed] : /^(?:\[([^\]]+)\]|([^:[\]]*)):(\d+)$/.exec(trimmed);
  if (!m) throw new Error(`journeys proxy: --listen ${value} is not host:port, :port or port`);
  const host = m[1] ?? m[2] ?? "";
  const port = Number(m[3]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`journeys proxy: port ${m[3]} is out of range`);
  return { host: host || undefined, port };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The standalone proxy: one http.Server on the handler, plain HTTP (TLS is the
 * load balancer's job in front; a proxy that terminated TLS would hold a private key the sensor
 * never needs), forwarding to `--origin`. SIGTERM drains: no new connections, in-flight requests
 * complete, their shipments go out, then the process exits.
 */
export async function serveProxy(options: ProxyOptions): Promise<RunningProxy> {
  const pending = new Set<Promise<void>>();
  const log = options.log ?? ((level: LogLevel, line: string) => process.stderr.write(`${level === "info" ? "" : `${level}: `}${line}\n`));
  const handler = createNodeHandler({ ...options, form: "proxy", log, track: (p) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  } });
  const server: Server = createServer((req, res) => {
    void handler(req, res);
  });
  let inflight = 0;
  server.on("request", (_req, res) => {
    inflight += 1;
    res.once("close", () => {
      inflight -= 1;
    });
  });
  const { host, port } = parseListen(options.listen ?? options.env?.JOURNEYS_LISTEN ?? process.env.JOURNEYS_LISTEN ?? ":8080");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const bound = server.address();
  const boundPort = typeof bound === "object" && bound ? bound.port : port;
  const boundHost = typeof bound === "object" && bound ? bound.address : (host ?? "0.0.0.0");
  const shown = boundHost.includes(":") ? `[${boundHost}]` : boundHost;
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      const deadline = Date.now() + (options.drainMs ?? 10_000);
      server.close();
      server.closeIdleConnections();
      while (inflight > 0 && Date.now() < deadline) await sleep(25);
      if (inflight > 0) log("warn", `journeys proxy: ${inflight} request(s) still in flight at the drain's end; closing them`);
      server.closeAllConnections();
      const remaining = Math.max(0, deadline - Date.now());
      await Promise.race([Promise.allSettled([...pending]), sleep(remaining)]);
      if (pending.size > 0) log("warn", `journeys proxy: ${pending.size} shipment(s) still pending at the drain's end; dropped`);
      resolveClosed();
    })();
    return closing;
  };
  if (options.signals) {
    const onSignal = (signal: NodeJS.Signals): void => {
      log("info", `journeys proxy: ${signal}, draining for up to ${(options.drainMs ?? 10_000) / 1000} s`);
      void close().then(() => process.exit(0));
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  }
  return { url: `http://${shown}:${boundPort}`, host: boundHost, port: boundPort, close, closed };
}
