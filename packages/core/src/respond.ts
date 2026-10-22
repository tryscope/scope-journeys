import { isTextFace, requestedFace, servedFace } from "./classify.js";
import { passHeaders } from "./gateway.js";
import type { SensorRecord } from "./io.js";
import type { ScopeRequest1 } from "./generated/request.js";
import { finish, type State } from "./observe.js";
import { readBody } from "./record.js";
import { redactString } from "./redact.js";
import { mintReference } from "./references.js";
import { errorLink } from "./rules/error.js";
import { FACE_NOT_IMPLEMENTED } from "./rules/face.js";
import { gateResponse } from "./rules/gate.js";
import { rewritePage } from "./rules/inject.js";
import { notfoundPage } from "./rules/notfound.js";
import { decide, errored, isLive } from "./rules/runner.js";
import { gateStream, teeHead } from "./stream.js";

export interface Responded {
  response: Response;
  /** Resolves when the record is complete: at once for a body read here, at stream end for a stream. The core ships at that moment. */
  records: Promise<SensorRecord[]>;
}

const passthrough = (upstream: Response): Response => new Response(upstream.body, { status: upstream.status, headers: passHeaders(upstream.headers) });

/** A response whose status and headers are known now and whose body arrives when the work on it is done. */
function deferredBody(status: number, headers: Headers, body: Promise<Uint8Array | string | ReadableStream<Uint8Array> | null>): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const out = await body;
        if (out === null) return controller.close();
        if (typeof out === "string") {
          controller.enqueue(new TextEncoder().encode(out));
          return controller.close();
        }
        if (out instanceof Uint8Array) {
          controller.enqueue(out);
          return controller.close();
        }
        const reader = out.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      },
    }),
    { status, headers },
  );
}

/**
 * The response side: the status and the headers the stitcher needs, then by kind: a server-sent
 * event stream through the gate frame by frame; a page with a reference minted for this serve and
 * the inject rules per face; the helpful 404; an observed JSON answer amended by the gate or the
 * error rule; everything else passed through. The response's status and headers are decided here
 * and now; a body a rule may rewrite arrives when the rewrite is done.
 */
export function observeResponse(upstream: Response, state: State): Responded {
  const { record, io } = state;
  if (state.passthrough) return { response: passthrough(upstream), records: Promise.resolve([]) };
  try {
    record["scope.timing"] = { origin_ms: io.now() - state.returnedAt, total_ms: null };
    record["http.response.status_code"] = upstream.status;
    const resType = upstream.headers.get("content-type") ?? "";
    record["http.response.header.content-type"] = resType || null;
    record["scope.cache"] = upstream.headers.get("cf-cache-status") ?? upstream.headers.get("x-vercel-cache");
    return respondByKind(upstream, state, resType);
  } catch (error) {
    (record["scope.observer.errors"] ??= []).push(error instanceof Error ? error.name : "Error");
    io.log("error", `journeys: observeResponse failed, passing the answer through: ${error instanceof Error ? error.message : String(error)}`);
    return { response: passthrough(upstream), records: finish(state) };
  }
}

function respondByKind(upstream: Response, state: State, resType: string): Responded {
  const { record, policy, io, facts } = state;
  const environment = facts.environment;
  const H = policy.headers;

  const responseHeaders = async (): Promise<void> => {
    record["scope.response.headers"] = {
      "content-type": resType,
      [H.session]: upstream.headers.get(H.session),
      "www-authenticate": upstream.headers.get("www-authenticate"),
      location: (await redactString(upstream.headers.get("location") ?? "", policy, io)) || null,
      "cache-control": upstream.headers.get("cache-control"),
      "x-vercel-cache": upstream.headers.get("x-vercel-cache"),
      "cf-cache-status": upstream.headers.get("cf-cache-status"),
    };
  };

  if (/text\/event-stream/.test(resType) && upstream.body) {
    let settle: (records: SensorRecord[]) => void = () => undefined;
    const records = new Promise<SensorRecord[]>((resolve) => (settle = resolve));
    if (state.gate && upstream.status === 200) {
      const body = gateStream(upstream.body, state.gate, state.locals, state.gateLive, (seen, changed) => {
        void (async () => {
          await responseHeaders();
          record["scope.body.response"] = { sse: seen };
          state.gateReasons.push("stream through gate");
          if (changed) state.gateReasons.push("tools/list amended");
          settle(await finish(state));
        })();
      });
      return { response: new Response(body, { status: 200, headers: passHeaders(upstream.headers) }), records };
    }
    const body = teeHead(upstream.body, (seen) => {
      void (async () => {
        await responseHeaders();
        record["scope.body.response"] = { sse: seen };
        settle(await finish(state));
      })();
    });
    return { response: new Response(body, { status: upstream.status, headers: passHeaders(upstream.headers) }), records };
  }

  const isGet = state.method === "GET";
  // The page rules bind to the documentation paths the map names and to nothing else: a path the
  // map does not name is passed through as the origin answered it, whatever the reader.
  const content = state.route.content;
  const textFace = isTextFace(state.path, policy) && /text\/plain/.test(resType);

  // A helpful 404: a mapped documentation path the product does not have answers with the
  // policy's page of real guides, each carrying a reference, so a guessed URL still leads
  // somewhere and the read that follows joins the journey. The status stays 404.
  const notfound = content && isGet && upstream.status === 404 ? policy.rules.find((r) => r.kind === "notfound") : undefined;
  if (notfound) {
    const face = requestedFace(state.path, state.accept, policy);
    const token = mintReference(io);
    let page: ReturnType<typeof notfoundPage> = null;
    try {
      page = notfoundPage(notfound, face, state.host, state.prefix, token);
    } catch (error) {
      errored(state.decisions, notfound, environment, error);
    }
    if (page) {
      if (isLive(notfound, environment)) {
        decide(state.decisions, notfound, environment, "applied", "404 on content path");
        // The helpful 404 is a page: its reference is the page's, so a read of one of its links joins as a chain link.
        record["scope.page"] = { canonical: state.path, face: `404-${face}`, reference_minted: token, injected: ["notfound"], bytes: page.body.length };
        const records = responseHeaders().then(() => finish(state));
        return { response: new Response(page.body, { status: 404, headers: { "content-type": page.contentType, "cache-control": "no-store" } }), records };
      }
      decide(state.decisions, notfound, environment, "would_apply", "404 on content path");
    }
  }

  if (content && isGet && upstream.status === 200 && (/text\/(html|markdown)/.test(resType) || textFace)) {
    const face = servedFace(resType);
    const token = mintReference(io);
    const work = (async (): Promise<string> => {
      await responseHeaders();
      const original = await upstream.text();
      let live: string[] = [];
      let matched = false;
      let body = original;
      try {
        const vars = { host: state.host, token, face, prefix: state.prefix };
        const rewritten = rewritePage(original, policy.rules, vars);
        matched = rewritten.applied.length > 0;
        // A dry-run rule changes nothing on the wire: the page goes out as the live rules alone leave it,
        // and a live rule's decision is the one that pass made.
        const wire = rewritten.applied.every((a) => isLive(a.rule, environment)) ? rewritten : rewritePage(original, policy.rules.filter((r) => isLive(r, environment)), vars);
        for (const { rule } of rewritten.applied) if (!isLive(rule, environment)) decide(state.decisions, rule, environment, "would_apply", `page matched docs face ${face}`);
        for (const { rule } of wire.applied) decide(state.decisions, rule, environment, "applied", `page matched docs face ${face}`);
        for (const rule of [...rewritten.capped.filter((r) => !isLive(r, environment)), ...wire.capped.filter((r) => isLive(r, environment))]) decide(state.decisions, rule, environment, "errored", "the page would grow past twice its size and 64 KiB");
        live = wire.applied.map((a) => a.label);
        body = wire.body;
      } catch (error) {
        const first = policy.rules.find((r) => r.kind === "inject");
        if (first) errored(state.decisions, first, environment, error);
        body = original;
      }
      for (const rule of policy.rules) if (rule.kind === "face") decide(state.decisions, rule, environment, "skipped", FACE_NOT_IMPLEMENTED);
      // The reference is the record's, not the rule's: a page an inject rule matched records it even when the rule ran dry and placed nothing.
      record["scope.page"] = { canonical: state.path.endsWith(".md") ? state.path.slice(0, -3) || "/" : state.path, face, reference_minted: matched ? token : null, injected: live, bytes: body.length };
      record["scope.response.bytes"] = body.length;
      return body;
    })();
    const records = work.then(() => finish(state));
    return { response: deferredBody(200, passHeaders(upstream.headers), work), records };
  }

  if ((state.route.observed || upstream.status >= 400) && /json|text\/plain|html/.test(resType)) {
    const work = (async (): Promise<Uint8Array | string> => {
      await responseHeaders();
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      const read = await readBody(text, resType, policy, io);
      record["scope.body.response"] = read.parsed as ScopeRequest1["scope.body.response"];
      record["scope.response.bytes"] = read.bytes;
      if (read.truncated) record["scope.body.truncated"] = true;
      let out: Uint8Array | string = bytes;
      if (state.gate && upstream.status === 200 && /json/.test(resType)) {
        try {
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          if (json !== null) {
            const list = Array.isArray(json) ? json : [json];
            const gate = state.gate;
            const changed = list.map((m) => gateResponse(m, gate)).some(Boolean);
            if (changed) state.gateReasons.push("tools/list amended");
            if (state.gateLive && (changed || state.locals.length)) {
              const payload = state.locals.length ? [...list, ...state.locals] : Array.isArray(json) ? list : list[0];
              out = JSON.stringify(payload);
            }
          }
        } catch (error) {
          errored(state.decisions, state.gate, environment, error);
        }
      }
      // An error rule: the product's own error message gains a link to the guide for that status,
      // carrying a reference minted here and recorded against this call's credential.
      const errorRule = upstream.status >= 400 && /json/.test(resType) ? policy.rules.find((r) => r.kind === "error" && r.route !== null && new RegExp(r.route).test(state.path) && r.links[String(upstream.status)]) : undefined;
      if (errorRule) {
        try {
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          const token = mintReference(io);
          const amended = json === null ? null : errorLink(errorRule, json, upstream.status, state.host, state.prefix, token);
          if (amended !== null) {
            const reason = `status ${upstream.status} gained guide link`;
            if (isLive(errorRule, environment)) {
              decide(state.decisions, errorRule, environment, "applied", reason);
              record["scope.reference_minted"] = token;
              out = amended;
            } else decide(state.decisions, errorRule, environment, "would_apply", reason);
          }
        } catch (error) {
          errored(state.decisions, errorRule, environment, error);
        }
      }
      return out;
    })();
    const records = work.then(() => finish(state));
    return { response: deferredBody(upstream.status, passHeaders(upstream.headers), work), records };
  }

  // Built last: nothing above read or cloned the upstream's body, so it streams through untouched.
  const records = responseHeaders().then(() => finish(state));
  return { response: passthrough(upstream), records };
}
