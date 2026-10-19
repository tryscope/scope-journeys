import type { ScopeDecision1 } from "../generated/decision.js";
import { effectiveMode, type CompiledRule } from "../policy.js";
import type { Environment } from "../io.js";

export type Decision = ScopeDecision1;

/**
 * One writer for decisions: every rule application goes through here. In
 * dry run the caller computes exactly what the rule would have done and discards it; the decision
 * carries the same reason the live path writes, so the would-apply counters compare.
 */
export function decide(decisions: Decision[], rule: CompiledRule, environment: Environment, outcome: Decision["outcome"], reason: string | null): Decision["mode"] {
  const mode = effectiveMode(rule, environment);
  decisions.push({ rule: rule.id, kind: rule.kind === "unknown" ? "observe" : rule.kind, mode, outcome, reason });
  return mode;
}

/** Whether the rule's change goes out on this install. */
export function isLive(rule: CompiledRule, environment: Environment): boolean {
  return effectiveMode(rule, environment) === "live";
}

/** The decision for a rule that threw: the error's class is the reason, with what the sensor did about it when that was not serving the original answer. */
export function errored(decisions: Decision[], rule: CompiledRule, environment: Environment, error: unknown, did?: string): void {
  const name = error instanceof Error ? error.name : "Error";
  decisions.push({ rule: rule.id, kind: rule.kind === "unknown" ? "observe" : rule.kind, mode: effectiveMode(rule, environment), outcome: "errored", reason: did ? `${name}; ${did}` : name });
}
