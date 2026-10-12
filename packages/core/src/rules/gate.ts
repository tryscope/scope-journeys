import { fill, type CompiledRule } from "../policy.js";

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface GateSplit {
  local: unknown[];
  forward: JsonRpcMessage[];
  declared: Array<Record<string, unknown>>;
}

/**
 * The gate in front of a JSON-RPC route: calls to the declaration tool are answered here with the
 * acknowledgement (carrying the session id) and recorded; the rest of the batch forwards.
 */
export function gateRequest(messages: readonly JsonRpcMessage[], rule: CompiledRule, session: string): GateSplit {
  const local: unknown[] = [];
  const forward: JsonRpcMessage[] = [];
  const declared: Array<Record<string, unknown>> = [];
  const toolName = rule.tool?.name;
  for (const m of messages) {
    const params = m?.params;
    if (m?.method === "tools/call" && params && params.name === toolName) {
      const args = params.arguments;
      declared.push(args && typeof args === "object" ? (args as Record<string, unknown>) : {});
      local.push({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: fill(rule.acknowledgement, { session }) }] } });
    } else forward.push(m);
  }
  return { local, forward, declared };
}

/** The origin's answer amended in place: the tool listed first; instructions or amended descriptions in the other forms. Returns whether anything changed. */
export function gateResponse(message: unknown, rule: CompiledRule): boolean {
  if (!message || typeof message !== "object" || !("result" in message)) return false;
  const r = (message as { result?: Record<string, unknown> }).result;
  if (!r || typeof r !== "object") return false;
  let changed = false;
  if (r.serverInfo && (rule.form === "instructions" || rule.form === "descriptions") && rule.instructions) {
    r.instructions = rule.instructions;
    changed = true;
  }
  if (Array.isArray(r.tools) && rule.tool) {
    const toolName = rule.tool.name;
    const others = (r.tools as Array<Record<string, unknown>>)
      .filter((t) => t.name !== toolName)
      .map((t) => (rule.form === "descriptions" && rule.description_suffix ? { ...t, description: `${String(t.description)} ${rule.description_suffix}` } : t));
    r.tools = [rule.tool, ...others];
    changed = true;
  }
  return changed;
}

/** The JSON-RPC error a closed gate answers the declaration call with when the rule itself failed. */
export function gateRefusal(id: unknown): unknown {
  return { jsonrpc: "2.0", id, error: { code: -32000, message: "declaration gate unavailable" } };
}

/**
 * A closed gate whose rule failed (`on_error: closed`): the declaration calls are refused, the rest
 * of the batch forwards as received, nothing is collected. The customer's MCP server never goes
 * down with the gate.
 */
export function refuseDeclarations(messages: readonly JsonRpcMessage[], rule: CompiledRule): GateSplit {
  const local: unknown[] = [];
  const forward: JsonRpcMessage[] = [];
  const toolName = rule.tool?.name;
  for (const m of messages) {
    if (m?.method === "tools/call" && m.params && m.params.name === toolName) local.push(gateRefusal(m.id));
    else forward.push(m);
  }
  return { local, forward, declared: [] };
}
