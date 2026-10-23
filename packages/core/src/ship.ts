import type { SensorRecord } from "./io.js";
import { RECORD_SCHEMA } from "./record.js";

/** The rhythm and the limits of shipping; the defaults are the production values, which a test shortens. */
export interface ShipTiming {
  /** The least time from the end of one send to the next batch that is not full, and between two tries of one batch: it groups small sends. */
  intervalMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** How long a send may be tried, from its first attempt, before its records are dropped and counted. */
  giveUpMs: number;
  /** What a queue holds, waiting and in flight, measured as the records' JSON. */
  budgetBytes: number;
  attemptTimeoutMs: number;
}

const TIMING: ShipTiming = { intervalMs: 1_000, baseDelayMs: 1_000, maxDelayMs: 60_000, giveUpMs: 15 * 60_000, budgetBytes: 32 * 1024 * 1024, attemptTimeoutMs: 10_000 };

// The ingest takes at most 500 records and 4 MB of gzip (16 MB inflated) a batch; 2 MB of JSON stays well inside both.
const BATCH = 500;
const BATCH_CHARS = 2 * 1024 * 1024;

let pending = 0;
let warnedNoKey = false;

/** Records dropped that no stored record has reported yet. */
export const droppedSoFar = (): number => pending;

/** For the tests: forget the count and the warning. */
export function resetDelivery(): void {
  pending = 0;
  warnedNoKey = false;
}

/**
 * A wait. One that holds keeps a Node process open until it ends: the short wait for the next send
 * holds, so a mount that shuts down cleanly still ships what it queued; a retry's backoff does not,
 * so a stopping process never hangs on an ingest that is down.
 */
function sleep(ms: number, hold: boolean): Promise<void> {
  return new Promise((resolve) => {
    const timer: unknown = setTimeout(resolve, ms);
    if (!hold && typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") timer.unref();
  });
}

/** A Retry-After as a wait: whole seconds, or an HTTP date; null for anything else. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(at - Date.now(), 0) : null;
}

/** The indices the ingest's answer names as rejected, or null when the answer is not the ingest's `{accepted, rejected}`. */
async function rejectedOf(response: Response, size: number): Promise<number[] | null> {
  let answer: unknown;
  try {
    answer = await response.json();
  } catch {
    return null;
  }
  if (typeof answer !== "object" || answer === null || !("accepted" in answer) || typeof answer.accepted !== "number" || !("rejected" in answer) || !Array.isArray(answer.rejected)) return null;
  const indices = answer.rejected.map((r: unknown) => (typeof r === "object" && r !== null && "index" in r ? r.index : null));
  return [...new Set(indices.filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < size))];
}

interface Batch {
  size: number;
  /** The index of the request record carrying the count, or -1 when the batch has none. */
  carrier: number;
  carried: number;
  body: ArrayBuffer;
}

type Outcome = { kind: "stored"; rejected: number[] } | { kind: "retry"; what: string; waitMs: number | null; status: number | null } | { kind: "refused"; what: string };

async function attempt(batch: Batch, url: string, key: string, fetchFn: typeof fetch, timeoutMs: number): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip", authorization: `Bearer ${key}` }, body: batch.body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { kind: "retry", what: `failed (${error instanceof Error ? error.message : String(error)})`, waitMs: null, status: null };
  }
  if (response.ok) {
    const rejected = await rejectedOf(response, batch.size);
    // Counted rather than taken for stored: a batch the ingest did store is then reported twice, never lost.
    return rejected === null ? { kind: "refused", what: `answered ${response.status} without the ingest's answer` } : { kind: "stored", rejected };
  }
  // An unread body holds the connection open until the platform gives up on it.
  void response.body?.cancel().catch(() => undefined);
  if ([408, 429, 500, 502, 503, 504].includes(response.status)) return { kind: "retry", what: `answered ${response.status}`, waitMs: retryAfterMs(response.headers.get("retry-after")), status: response.status };
  return { kind: "refused", what: `refused with ${response.status}` };
}

export interface Shipper {
  /** Queues records whose response went out; settles once they are stored or dropped, never rejects. The newest url and key are the ones a send uses. */
  add(records: readonly SensorRecord[], apiUrl: string | null, key: string | null): Promise<void>;
}

interface Waiting {
  /** The record as it ships, held as its JSON: what the budget measures is what the queue holds. */
  json: string;
  request: boolean;
  settle: () => void;
}

/**
 * The queue a process ships from: one send at a time, the oldest records first. A batch that is not
 * full waits for the rhythm, so small sends are grouped; a full one goes at once. When the budget is
 * full, the oldest waiting records are dropped and counted. While a quota the ingest named lasts,
 * batches are dropped and counted unsent. `until` fixes one deadline for every send, for a delivery
 * that must end by then, and makes every wait hold.
 */
export function createShipper(options: { fetch: typeof fetch; log: (line: string) => void; timing?: ShipTiming; until?: number }): Shipper {
  const timing = options.timing ?? TIMING;
  const log = (line: string): void => {
    try {
      options.log(line);
    } catch {
      // A logger that throws must not stop the queue: the records still ship.
    }
  };
  const waiting: Waiting[] = [];
  let waitingChars = 0;
  let outChars = 0;
  let destination = { url: "", key: "" };
  let running = false;
  let lastSentAt = -Infinity;
  let quotaUntil = -Infinity;
  let warnedFull = false;
  let warnedQuota = false;

  const drop = (count: number, carried: number, why: string): void => {
    pending += count + carried;
    log(`journeys: shipment ${why}; dropping ${count} record(s), counted into a later record`);
  };

  /**
   * One batch until the ingest stores it, refuses it, or its time runs out. A 429 is a quota, so its
   * Retry-After is the earliest a retry may land; elsewhere a Retry-After is a hint cut to the time
   * left, so one last try lands before the deadline.
   */
  const send = async (batch: Batch, deadline: number): Promise<void> => {
    let failures = 0;
    let serverErrors = 0;
    for (;;) {
      // The newest url and key each try: a Vercel token that expired during a long retry is replaced by a fresh one.
      const outcome = await attempt(batch, destination.url, destination.key, options.fetch, timing.attemptTimeoutMs);
      if (outcome.kind === "stored") {
        pending += outcome.rejected.length + (outcome.rejected.includes(batch.carrier) ? batch.carried : 0);
        if (outcome.rejected.length) log(`journeys: the ingest rejected ${outcome.rejected.length} record(s) of a shipment; counted into a later record`);
        warnedFull = false;
        return;
      }
      if (outcome.kind === "refused") return drop(batch.size, batch.carried, outcome.what);
      if (outcome.status === 500 && (serverErrors += 1) >= 3) return drop(batch.size, batch.carried, `${outcome.what} three times`);
      const backoff = Math.max(timing.intervalMs, Math.random() * Math.min(timing.maxDelayMs, timing.baseDelayMs * 2 ** failures));
      failures += 1;
      const room = deadline - performance.now() - timing.attemptTimeoutMs;
      const asked = outcome.waitMs ?? 0;
      if (outcome.status === 429 && asked > room) {
        // Held at most a day, the ingest's longest quota: a Retry-After past that is not taken at its word.
        quotaUntil = performance.now() + Math.min(asked, 24 * 60 * 60 * 1000);
        warnedQuota = false;
        return drop(batch.size, batch.carried, `${outcome.what}, asked to wait ${Math.round(asked / 1000)} s, past the time limit`);
      }
      if (room < 0) return drop(batch.size, batch.carried, `${outcome.what}, still failing at the time limit`);
      const wait = Math.min(Math.max(backoff, asked), room);
      log(`journeys: shipment ${outcome.what}; trying again in ${Math.round(wait)} ms`);
      await sleep(wait, options.until !== undefined);
    }
  };

  const run = async (): Promise<void> => {
    while (waiting.length > 0) {
      const full = waiting.length >= BATCH || waitingChars >= BATCH_CHARS;
      const wait = lastSentAt + timing.intervalMs - performance.now();
      if (!full && wait > 0) await sleep(wait, true);
      let taken = 0;
      let chars = 0;
      for (const next of waiting) {
        if (taken === BATCH || (taken > 0 && chars + next.json.length > BATCH_CHARS)) break;
        taken += 1;
        chars += next.json.length;
      }
      const batch = waiting.splice(0, taken);
      waitingChars -= chars;
      outChars = chars;
      if (performance.now() < quotaUntil) {
        pending += taken;
        if (!warnedQuota) {
          warnedQuota = true;
          log("journeys: the ingest's quota is spent; dropping records unsent until it lifts, counted into a later record");
        }
      } else {
        const carrier = batch.findIndex((w) => w.request);
        // Taken at once, before any wait, so two Worker requests shipping side by side never both carry it.
        const carried = carrier === -1 ? 0 : pending;
        pending -= carried;
        try {
          const parts = batch.map((w, i) => (i === carrier && carried > 0 ? JSON.stringify({ ...(JSON.parse(w.json) as object), "scope.observer.dropped": carried }) : w.json));
          const body = await new Response(new Blob([`[${parts.join(",")}]`]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
          await send({ size: taken, carrier, carried, body }, options.until ?? performance.now() + timing.giveUpMs);
        } catch (error) {
          // A batch that could not be built or sent is counted with the count it carried, and the next one goes.
          drop(taken, carried, `failed (${error instanceof Error ? error.message : String(error)})`);
        }
      }
      lastSentAt = performance.now();
      outChars = 0;
      for (const w of batch) w.settle();
    }
    running = false;
  };

  return {
    add(records, apiUrl, key) {
      if (records.length === 0) return Promise.resolve();
      if (!apiUrl || !key) {
        pending += records.length;
        if (apiUrl && !warnedNoKey) {
          warnedNoKey = true;
          log("journeys: no install key (JOURNEYS_INSTALL_KEY, or on Vercel the project's OIDC token); nothing ships and the records count as dropped");
        }
        return Promise.resolve();
      }
      destination = { url: `${apiUrl.replace(/\/$/, "")}/v1/requests`, key };
      const incoming = records.map((record) => ({ json: JSON.stringify(record), request: record.schema === RECORD_SCHEMA }));
      const size = incoming.reduce((sum, entry) => sum + entry.json.length, 0);
      if (outChars + size > timing.budgetBytes) {
        pending += records.length;
        log(`journeys: ${records.length} record(s) too large for the shipping queue; dropped, counted into a later record`);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let left = records.length;
        const settle = (): void => {
          left -= 1;
          if (left === 0) resolve();
        };
        let evicted = 0;
        for (const oldest of waiting) {
          if (waitingChars + outChars + size <= timing.budgetBytes) break;
          waitingChars -= oldest.json.length;
          evicted += 1;
          oldest.settle();
        }
        waiting.splice(0, evicted);
        pending += evicted;
        if (evicted && !warnedFull) {
          warnedFull = true;
          log(`journeys: the shipping queue is full (${Math.round(timing.budgetBytes / (1024 * 1024))} MB); dropping the ${evicted} oldest record(s), counted into a later record`);
        }
        waiting.push(...incoming.map((entry) => ({ ...entry, settle })));
        waitingChars += size;
        if (!running) {
          running = true;
          void run();
        }
      });
    },
  };
}

export interface DeliveryOptions {
  apiUrl: string | null;
  key: string | null;
  fetch: typeof fetch;
  log: (line: string) => void;
  /** How long the whole delivery may take, inside the platform's background window (the Worker's waitUntil ends 30 s after the response). */
  windowMs?: number;
  timing?: ShipTiming;
  /** @deprecated Ignored: the backoff is `timing`'s. Read until 0.3.0 (DEPRECATION.md). */
  retryDelayMs?: number;
  /** @deprecated Ignored: a Retry-After is honoured inside the window. Read until 0.3.0 (DEPRECATION.md). */
  maxRetryAfterMs?: number;
}

/** One request's records, shipped on their own under the same rules and inside one window: the Worker's form, where a request cannot finish another's sends. */
export function deliver(records: readonly SensorRecord[], options: DeliveryOptions): Promise<void> {
  return createShipper({ fetch: options.fetch, log: options.log, timing: { ...(options.timing ?? TIMING), intervalMs: 0 }, until: performance.now() + (options.windowMs ?? 25_000) }).add(records, options.apiUrl, options.key);
}
