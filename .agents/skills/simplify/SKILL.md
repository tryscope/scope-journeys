---
name: simplify
description: Review scoped code (the local diff by default) for low-information comments, one-off helpers, needless abstraction, performance issues and reuse opportunities, checked against AGENTS.md, then make targeted cleanup fixes. Use when asked to simplify, tidy or clean up a change before review.
---

# Simplify

Simplify the scoped code with three read-only reviews, then make targeted cleanup fixes yourself.

## Scope Selection

1. If the user provided an explicit scope (paths, symbols, a diff, or a natural-language area), use
   that scope.
2. Otherwise, inspect local changes, staged, unstaged and new files, so nothing is missed:

   ```bash
   git diff --no-color
   git diff --cached --no-color
   git status --porcelain --untracked-files=all
   ```

   Treat the combined non-empty output, plus the full contents of untracked files, as the scope.
3. If there is no local change, fall back to concrete files, symbols, or changes mentioned in the
   conversation.
4. If that also does not exist, fall back to the current HEAD commit:

   ```bash
   git show --stat --patch --no-color HEAD
   ```

5. Preserve unrelated user changes. Do not broaden the scope beyond the selected diff or mentioned
   files unless needed to understand existing patterns.

## The Repo's Rules Are the Checklist

Before reviewing, read `AGENTS.md` and hand these sections to every reviewer: The rules the lint
enforces; How to work; This repository is public; Design rules; Code style.

A finding against any of these is a defect, not a style preference.

## Reviews

Run the three reviews below. They only report findings: they must not edit files, run formatters,
create worktrees, or commit. Pass each one the full combined diff when possible; if it is too
large, pass the file list, relevant hunks, and a scope summary.

If the harness can start subagents, launch the three in parallel, using the same model as the
parent. If it cannot, run the three reviews yourself one after another, read-only, and write down
each review's findings before starting the next. Do not skip a review because subagents are
unavailable.

### 1. Code quality reviewer

Look for simplification opportunities, including:

- Anything the `AGENTS.md` sections above forbid.
- Low-information comments that restate code instead of explaining intent, edge cases, or
  invariants.
- One-off helpers that are only used once and can be inlined to make the flow clearer.
- Unnecessary nullable or undefined states that force defensive checks and make invariants unclear.
- Catch-all try/catch blocks that swallow errors without identifying expected exceptions.
- Unnecessary abstraction, such as generic wrappers, config objects, or interfaces introduced
  before real reuse exists.
- Avoidable `any`, casts, non-null assertions, or overly broad types that hide invariants.
- Duplicated or derived state that could become stale.
- Dead or compatibility code, including unused branches, parameters, fallback paths, or old
  behavior preserved without evidence.

### 2. Performance reviewer

Look for performance issues, including:

- Blocking operations in hot paths, such as synchronous Node.js functions.
- Repeated expensive computation, parsing, or lookups that could safely be reused.
- Busy waits or polling loops that consume CPU instead of using events, timers, or backoff.
- String concatenation in loops that creates excessive allocations.
- N+1 database, filesystem, network, or RPC calls where batching would reduce latency or load.
- High-volume logging or telemetry inside tight loops or hot paths.

### 3. Reuse reviewer

Look for existing patterns or helpers that can be reused, either elsewhere in the codebase or
already present in the diff. A new helper that duplicates a shared one is a defect under
`AGENTS.md`; name the shared one it should use.

## Fixing

Aggregate the findings from all three reviews.

Make targeted fixes that reduce complexity or reuse existing patterns while preserving behavior.
Do not commit or push.

Skip issues that:

- Need additional user context.
- Require a substantially larger refactor than the original diff.

Include skipped recommendations in the final summary.

After editing, run the most relevant lightweight checks for the touched files when practical,
and always `npm run lint`: a rewritten comment can break the public-repository rules it enforces.
If checks are skipped or unavailable, say so.

Finish by summarizing:

- What you fixed.
- What verification you ran.
- What you skipped but recommend.
