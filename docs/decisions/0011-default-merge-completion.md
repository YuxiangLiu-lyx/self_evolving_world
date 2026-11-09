# ADR-0011: Default Guarded Merge and Final Completion

- Date: 2026-11-08
- Decision status: Accepted
- Supersedes: the PR-only delivery portion of [ADR-0010](0010-synchronous-rounds-and-pr-delivery.md)

## Context

The user explicitly requires PR and merge for every task by default, conflict validation, historical eligible PR integration and an error if delivery is incomplete. Explicit instructions to avoid a PR or merge remain authoritative. A local review or open green PR therefore cannot be the final completion condition.

## Decision

Separate `task:review` (current local evidence and actual review) from `task:finish` (independent delivery verification). After the reviewed commit, `task:publish` checks local merge compatibility and main ancestry, publishes the PR, verifies exact head/body/base and fresh required checks, requires known clean remote mergeability and requests a merge commit guarded by the reviewed head. It verifies the merged PR and both commits in fetched main before invoking final completion.

The current changed execution plan may record a task-bound `pr-only` or `local-only` exception only when the user explicitly requested it. Missing credentials, conflicts, failed checks and API uncertainty are errors, never exceptions. Final receipts distinguish ordinary completion from completion with an explicit exception. New validation invalidates previous delivery receipts. Matching retry receipts allow confirming an already merged PR after an interrupted response.

Pure policy and remote response validation remain separate from Git, credential and HTTP operations. Merge requests do not bypass protection, approve reviews or alter settings. A connector may perform the reviewed merge after prepare-only verification; verify-only then confirms integration without publishing mutations.

## Alternatives and reasons

Keeping the PR open by default contradicts the requested lifecycle. Treating publication as completion hides failed or missing merges. Merging before local review or current CI weakens the existing acceptance contract. A merge commit preserves branch history and permits explicit ancestry verification without rewriting published commits.

## Costs and future consequences

Final completion now requires GitHub access and current main metadata. Strict revision checks can require CI reruns after metadata updates. GitHub's merge endpoint guards the head, while server protection handles concurrent base movement; local and remote checks reduce that race without claiming atomic control of GitHub. Receipt integrity and recorded exception authorization still depend on honest semantic review. Automation cannot prove that screenshots were seen or that the user requested an exception.

See the [delivery contract](../PULL_REQUESTS.md#automatic-pr-delivery-for-every-task), [validation workflow](../VALIDATION.md) and [PR-11 plan](../exec-plans/completed/pr-11-merge-lifecycle.md).
