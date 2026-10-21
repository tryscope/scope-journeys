import type { SensorRecord } from "scope-journeys";

/**
 * Shipping from the processor: the same contract as the Worker's: a gzip JSON
 * array of up to 500 records to `POST ${JOURNEYS_API_URL}/v1/requests` after the response went
 * out, one retry on a network error, a 5xx or a 429 (after `Retry-After`, capped at 60 seconds),
 * then the batch is dropped and counted into the next record's `scope.observer.dropped`. The
 * policy's `report.url` and `report.key_header`, when present, override the destination.
 */
export interface DeliveryOptions {
  apiUrl: string | null;
  key: string | null;
  report: { url: string; key_header: string | null } | null;
  fetch: typeof fetch;
  log: (line: string) => void;
  retryDelayMs?: number;
  /** The longest a 429's Retry-After is honoured (60 seconds unless a test shortens it). */
  maxRetryAfterMs?: number;
}

const BATCH = 500;
let dropped = 0;

export const droppedSoFar = (): number => dropped;

/** For the tests: forget the drop counter. */
export function resetDelivery(): void {
  dropped = 0;
}

/** A 429's Retry-After (seconds, or an HTTP date) as a delay, capped so a quota never holds the process for long; the usual retry delay without one. */
function retryAfterMs(header: string | null, options: DeliveryOptions): number {
  const cap = options.maxRetryAfterMs ?? 60_000;
  if (!header) return Math.min(options.retryDelayMs ?? 500, cap);
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, cap);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.min(Math.max(at - Date.now(), 0), cap) : Math.min(options.retryDelayMs ?? 500, cap);
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function deliver(records: readonly SensorRecord[], options: DeliveryOptions): Promise<void> {
  if (records.length === 0) return;
  const url = options.report?.url ?? (options.apiUrl ? `${options.apiUrl.replace(/\/$/, "")}/v1/requests` : null);
  if (!url) {
    dropped += records.length;
    return;
  }
  const headers: Record<string, string> = { "content-type": "application/json", "content-encoding": "gzip" };
  if (options.report?.key_header && options.key) headers[options.report.key_header] = options.key;
  else if (options.key) headers.authorization = `Bearer ${options.key}`;
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH);
    const body = await gzip(JSON.stringify(batch));
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      try {
        const response = await options.fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          ok = true;
          dropped = 0;
        } else if (response.status >= 500 || response.status === 429) {
          const delay = response.status === 429 ? retryAfterMs(response.headers.get("retry-after"), options) : (options.retryDelayMs ?? 500);
          options.log(`journeys: shipment answered ${response.status}${attempt === 0 ? `, retrying once in ${delay} ms` : ", dropping the batch"}`);
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          options.log(`journeys: shipment refused with ${response.status}; dropping the batch`);
          break;
        }
      } catch (error) {
        options.log(`journeys: shipment failed (${error instanceof Error ? error.message : String(error)})${attempt === 0 ? ", retrying once" : ", dropping the batch"}`);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 500));
      }
    }
    if (!ok) dropped += batch.length;
  }
}
