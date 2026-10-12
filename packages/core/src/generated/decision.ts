/* Generated from schemas/decision.json by scripts/types-from-schemas.mjs. Do not edit. */

/**
 * What a rule did to one request. A rule that does not match a request records nothing; a rule that matched records one decision with the reason it had, whether it applied the change (live) or only computed it (dry run).
 */
export interface ScopeDecision1 {
  /**
   * the rule's id in the policy
   */
  rule: string;
  kind: "observe" | "inject" | "gate" | "finder" | "notfound" | "error" | "face";
  /**
   * the effective mode the rule ran in on this request
   */
  mode: "dry_run" | "live";
  /**
   * applied: the change went out; would_apply: computed and discarded (dry run); skipped: matched but excluded (the install's environment, or a kind this sensor version does not implement); errored: the rule threw and the original answer was served
   */
  outcome: "applied" | "would_apply" | "skipped" | "errored";
  /**
   * the same wording live and dry run, so the counters compare
   */
  reason?: string | null;
}
