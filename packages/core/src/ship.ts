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
  /** What a queue holds, waiting and in flight, measured as the bytes of the records' UTF-8 JSON. */
  budgetBytes: number;
  attemptTimeoutMs: number;
}

const TIMING: ShipTiming = { intervalMs: 1_000, baseDelayMs: 1_000, maxDelayMs: 60_000, giveUpMs: 15 * 60_000, budgetBytes: 32 * 1024 * 1024, attemptTimeoutMs: 10_000 };

// The ingest takes at most 500 records and 4 MB of gzip (16 MB inflated) a batch; 2 MB of JSON stays well inside both.
const BATCH = 500;
const BATCH_BYTES = 2 * 1024 * 1024;

const encoder = new TextEncoder();

let pending = 0;
let warnedNoKey = false;

/** Records dropped that no stored record has reported yet. */
export const droppedSoFar = (): number => pending;

/** For the tests: forget the count and the warning. */
export function resetDelivery(): void {
  pending = 0;
  warnedNoKey = false;
}

/** A retry's wait. Inside a delivery's window it holds a Node process open; otherwise it does not, so a stopping process never hangs on an ingest that is down. */
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

interface Destination {
  url: string;
  key: string;
}

interface Batch {
  to: Destination;
  size: number;
  /** The index of the request record carrying the count, or -1 when the batch has none. */
  carrier: number;
  carried: number;
  body: ArrayBuffer;
}

type Outcome = { kind: "stored"; rejected: number[] } | { kind: "retry"; what: string; waitMs: number | null; status: number | null } | { kind: "refused"; what: string };

async function attempt(batch: Batch, fetchFn: typeof fetch, timeoutMs: number): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetchFn(batch.to.url, { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip", authorization: `Bearer ${batch.to.key}` }, body: batch.body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
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
  /** Queues records whose response went out; settles once they are stored or dropped, never rejects. The records ship with this url and key, never another add's: on Vercel the key is the request's own OIDC token. */
  add(records: readonly SensorRecord[], apiUrl: string | null, key: string | null): Promise<void>;
}

interface Waiting {
  /** The record as it ships, held as its UTF-8 JSON: what the budget measures is what the queue holds. */
  bytes: Uint8Array<ArrayBuffer>;
  request: boolean;
  to: Destination;
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
  let waitingBytes = 0;
  let outBytes = 0;
  let running = false;
  /** Ends the rhythm's wait, so the queue looks again: a batch that fills goes at once. */
  let wake = (): void => undefined;
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
   * left, so one last try lands before the deadline. No try runs past the deadline.
   */
  const send = async (batch: Batch, deadline: number): Promise<void> => {
    let failures = 0;
    let serverErrors = 0;
    for (;;) {
      // Whole milliseconds: AbortSignal.timeout refuses a fraction.
      const left = Math.floor(deadline - performance.now());
      if (left <= 0) return drop(batch.size, batch.carried, "out of time before it could be sent");
      const outcome = await attempt(batch, options.fetch, Math.min(timing.attemptTimeoutMs, left));
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
    for (let first = waiting[0]; first !== undefined; first = waiting[0]) {
      const wait = lastSentAt + timing.intervalMs - performance.now();
      if (wait > 0 && waiting.length < BATCH && waitingBytes < BATCH_BYTES) {
        // The wait holds a Node process open, so a mount that shuts down cleanly still ships what it queued.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, wait);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        // Looked at again: the wait may have filled the batch or dropped the oldest records.
        continue;
      }
      // The oldest record's destination, gathered from the whole queue in order: records of another key in between never split its batch.
      const batch: Waiting[] = [];
      const rest: Waiting[] = [];
      let bytes = 0;
      let open = true;
      for (const next of waiting) {
        if (open && next.to.url === first.to.url && next.to.key === first.to.key) {
          if (batch.length < BATCH && (batch.length === 0 || bytes + next.bytes.length <= BATCH_BYTES)) {
            batch.push(next);
            bytes += next.bytes.length;
            continue;
          }
          open = false;
        }
        rest.push(next);
      }
      waiting.length = 0;
      for (const w of rest) waiting.push(w);
      const taken = batch.length;
      waitingBytes -= bytes;
      outBytes = bytes;
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
          const parts: BlobPart[] = ["["];
          batch.forEach((w, i) => {
            if (i > 0) parts.push(",");
            parts.push(i === carrier && carried > 0 ? JSON.stringify({ ...(JSON.parse(new TextDecoder().decode(w.bytes)) as object), "scope.observer.dropped": carried }) : w.bytes);
          });
          parts.push("]");
          // Joined first: a Blob streams each part as its own chunk, and gzip over a thousand small chunks blocks the event loop many times longer.
          const body = await new Response(new Blob([await new Blob(parts).arrayBuffer()]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
          await send({ to: first.to, size: taken, carrier, carried, body }, options.until ?? performance.now() + timing.giveUpMs);
        } catch (error) {
          // A batch that could not be built or sent is counted with the count it carried, and the next one goes.
          drop(taken, carried, `failed (${error instanceof Error ? error.message : String(error)})`);
        }
      }
      lastSentAt = performance.now();
      outBytes = 0;
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
      const to = { url: `${apiUrl.replace(/\/$/, "")}/v1/requests`, key };
      const incoming = records.map((record) => ({ bytes: encoder.encode(JSON.stringify(record)), request: record.schema === RECORD_SCHEMA, to }));
      const size = incoming.reduce((sum, entry) => sum + entry.bytes.length, 0);
      if (outBytes + size > timing.budgetBytes) {
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
          if (waitingBytes + outBytes + size <= timing.budgetBytes) break;
          waitingBytes -= oldest.bytes.length;
          evicted += 1;
          oldest.settle();
        }
        waiting.splice(0, evicted);
        pending += evicted;
        if (evicted && !warnedFull) {
          warnedFull = true;
          log(`journeys: the shipping queue is full (${Math.round(timing.budgetBytes / (1024 * 1024))} MB); dropping the ${evicted} oldest record(s), counted into a later record`);
        }
        for (const entry of incoming) waiting.push({ ...entry, settle });
        waitingBytes += size;
        wake();
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
