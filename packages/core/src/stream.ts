import type { CompiledRule } from "./policy.js";
import { gateResponse } from "./rules/gate.js";

/**
 * Server-sent events through the gate, forwarded as they arrive: every line of every frame is
 * kept (id, retry, event names, comments); only a data payload that carries a tools list or the
 * server information is re-serialised after the gate's change; local answers close the stream.
 * `onDone` receives the origin's first 4,000 characters as they arrived (the record keeps the
 * origin's frames, not the rewritten ones) and the rewritten flag.
 */
export function gateStream(body: ReadableStream<Uint8Array>, rule: CompiledRule, locals: unknown[], live: boolean, onDone: (seen: string, changed: boolean) => void): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let seen = "";
  let changed = false;
  const rewriteFrame = (frame: string): string => {
    const lines = frame.split(/\r\n|\r|\n/);
    const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, ""));
    if (!data.length) return frame;
    let message: unknown;
    try {
      message = JSON.parse(data.join("\n"));
    } catch {
      return frame;
    }
    if (!gateResponse(message, rule)) return frame;
    changed = true;
    if (!live) return frame;
    const out: string[] = [];
    let placed = false;
    for (const line of lines) {
      if (!line.startsWith("data:")) out.push(line);
      else if (!placed) {
        out.push(`data: ${JSON.stringify(message)}`);
        placed = true;
      }
    }
    return out.join("\n");
  };
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, text: string): void => controller.enqueue(encoder.encode(text));
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        seen += text;
        pending += text;
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(pending))) {
          emit(controller, rewriteFrame(pending.slice(0, boundary.index)) + boundary[0]);
          pending = pending.slice(boundary.index + boundary[0].length);
        }
      },
      flush(controller) {
        if (pending) emit(controller, rewriteFrame(pending));
        if (live) for (const local of locals) emit(controller, `event: message\ndata: ${JSON.stringify(local)}\n\n`);
        onDone(seen.slice(0, 4000), changed);
      },
    }),
  );
}

/** A stream without a gate: teed, the first 4,000 characters kept for the record once it ends. */
export function teeHead(body: ReadableStream<Uint8Array>, onDone: (seen: string) => void): ReadableStream<Uint8Array> {
  const [a, b] = body.tee();
  void new Response(b).text().then((text) => onDone(text.slice(0, 4000)));
  return a;
}
