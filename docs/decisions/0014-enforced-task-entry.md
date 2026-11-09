# ADR-0014: Enforced Task Entry and Auditable Self-review

- Date: 2026-11-09
- Decision status: Accepted
- Refines: [ADR-0013](0013-programmatic-task-harness.md)

## Context

The original coordinator separates merge authority from publication, but legacy commands can bypass it: harness aliases only validation and the publisher has a default HTTP merge branch. Local review evidence has no corresponding GitHub review record. The user explicitly requests closing both gaps and authorizes integration of the original work plus corrections.

## Decision

Route public task and numbered-experiment mutation commands through the existing coordinator. Compatibility wrappers resolve the recorded task and yield its structured requests; they never invent intent, approval or authority. Guard internal workers using the live execution lease and current task, step, branch, intent, evidence and parameters. Keep automated validation and read-only diagnostics standalone for CI. Remove the publisher's default merge branch; merge remains a separately authorized exact-head connector action followed by independent verification.

After publication, return a GitHub COMMENT payload containing actual accepted local review findings and task, requirement revision, plan, head, run, source, review and screenshot provenance. The current conversation publishes it. Query remote reviews to verify the exact submitted commit/body and record the account, ID and URL before merge handoff or PR-only completion. Recheck it at final completion and reuse matching records on continuation. Local-only remains offline. Existing check freshness, bounded polling, conflict and main-ancestry rules remain unchanged.

## Alternatives and consequences

Documentation-only cautions leave the command bypass open. Independent review agents, additional reviewers and model APIs exceed the requested same-conversation boundary. An automatic APPROVE would misrepresent provenance and cannot establish quality. A COMMENT makes the implementing conversation's self-review auditable without pretending it is independent approval.

The command guards prevent accidental alternate-entry bypass, not deliberate repository/state modification or direct credential use. Structure and remote provenance cannot prove honest visual inspection or causal correctness. Those judgments remain with the current conversation and human architectural acceptance. A review can update PR metadata and require a CI rerun under the existing strict freshness rule; that is an incomplete state, never a reason to waive checks.

See [the protocol](../TASK_HARNESS.md) and [the execution plan](../exec-plans/completed/pr-14-enforced-task-entry.md).
