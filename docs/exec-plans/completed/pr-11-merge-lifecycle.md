# PR-11: Default PR and Merge Completion

## Requirement summary

The user requires every task to proceed through PR and merge by default, explicit instructions to avoid a PR or merge to remain effective, conflicts to be checked, failures to be reported as incomplete work, and historical unmerged work to be merged. This task changes repository delivery tooling and policy without changing the world or generating experiments.

## Requirements

- R1: Default code, documentation, experiment and mixed tasks to PR plus merge; honor explicit task-scoped no-merge or no-PR instructions through a reviewed, recorded exception, without inferring an exception from missing credentials or failed checks.
- R2: Validate local merge conflicts and current remote mergeability, exact reviewed head/body/base and fresh required checks before a guarded merge; reject unknown, conflicting, stale or blocked states without bypassing repository protection.
- R3: Separate local review acceptance from final task completion; require a verified merged PR and integration into main for normal completion, record explicit exceptions distinctly, and return a clear nonzero failure for incomplete or invalid delivery.
- R4: Test the delivery lifecycle and meaningful failure cases including conflicts, branch/base movement, refused or unconfirmed merges, stale evidence and explicit exceptions, while preserving archive integrity and all existing full-suite review gates.
- R5: Inspect historical unmerged work, merge eligible reviewed PRs with current passing checks and conflict validation, and record their actual merge results; complete this task through the same PR and merge workflow.
- R6: Synchronize agent instructions, feature status, architecture, ADRs, commands and execution plans; run the full unfiltered validation, inspect every current screenshot and behavior result, review every changed file, and report actual local and remote evidence.

## Scope and exclusions

Update only repository delivery tooling, tests and documentation. Preserve ex1/ex2, world semantics and the viewer. Create no new experiment. Use merge commits to retain history. Do not force-push, bypass required checks, weaken branch protection, auto-approve reviews, remove historical records or delete branches. An explicit no-PR instruction means local-only completion; an explicit no-merge instruction means reviewed PR-only completion. Such exceptions never waive local validation and actual review.

## Acceptance criteria

- Without an explicit exception, an open green PR is insufficient for task completion.
- Conflict checking does not mutate the worktree/index and reports conflicting paths; a clean but outdated branch must integrate main and rerun validation before merging.
- GitHub mergeability must be known and clean, required checks current, and the merge request bound to the reviewed head. The resulting merged PR and main ancestry are independently verified.
- Pending/failed/skipped/stale checks, dirty source, changed head/body/base, API rejection and unconfirmed merge cannot produce a successful completion receipt.
- Exceptions are explicitly recorded in the current reviewed plan and tied to the current task/source; stale or unrelated exceptions do not apply. No-PR makes no publishing/merge calls; no-merge does not merge.
- Historical PRs are inspected and merged only after their existing review and current checks are verified. Their actual merged status and commit are recorded.
- Complete unit/browser checks and all current screenshots pass; the final reviewed change is published and merged, and final completion succeeds.

## Steps

1. Inspect and validate historical pending PRs, merge eligible work, then create a focused branch from updated main.
2. Implement explicit delivery policy, conflict/merge verification and separate local/final gates with regression coverage.
3. Synchronize documentation and review the complete change against R1-R6.
4. Run complete validation, inspect all current screenshots, record actual review and archive the plan with fresh validation after documentation edits.
5. Commit, run PR preflight, publish, verify current checks, merge and verify final completion.

## Results and evidence

- Initial inspection found only PR #4 unmerged; its head is f79924950507e0e1aa98bd97e63940ca69173f30. The worktree is clean and other local/remote branches are already ancestors of origin/main.
- Historical PR [#4](https://github.com/YuxiangLiu-lyx/self_evolving_world/pull/4) passed its current quality/pr-policy checks and prior completed review; a non-mutating local merge calculation found no conflicts. A head-guarded merge succeeded at a933a71c3e7ed5fb3d478efec323286443864ae4. Refetched metadata confirms merged status and fetched main contains its reviewed head.
- Delivery policy, local conflict checks, guarded remote merge, separate local/final gates and explicit exceptions are implemented. Unit and CLI regression coverage includes refusal, uncertainty, changed revisions, stale evidence and unavailable publication. The full local suite passed on macOS with Node 24.22.2 and pnpm 10.34.9: 199 unit tests, 14 Chromium tests, types, lint, formatting, architecture, build, deterministic compiled CLI, ex1/ex2 reconstruction and documentation checks. All 17 current screenshots and behavior results were inspected; task:review passed for run 345e1b1c-76f5-498b-bde4-7518282515ff.

## Delivery correction

PR [#5](https://github.com/YuxiangLiu-lyx/self_evolving_world/pull/5) passed current quality (run 42564413823) and pr-policy (run 42564413811), then merged at 0ab8da66006ff5f4eae6f6e2442a6cf371bd6f94. Its final local run 80c6aed0-9ccd-4285-87cc-a4c86588cd97 passed 199 unit tests, 14 browser tests and 17 individually inspected screenshots. Final completion correctly failed because the 2026-03-10 GitHub REST contract omits merge_commit_sha. A live read using the supported 2022-11-28 contract returned the actual merged commit. This focused follow-up pins the delivery HTTP transport to that contract and tests both the version header and guarded merge payload. No inference, experiment or protection changes are included. The earlier local failure is retained rather than reported as success.

## Unexecuted checks and limitations

The transport correction requires fresh full validation and individual screenshot review, a new reviewed PR against updated main, current remote checks, guarded merge and successful independent final completion. GitHub protection and API availability remain required; unresolved delivery is incomplete work, not an exception. The response contract must be revisited before GitHub retires the pinned API version. Actual correction delivery is recorded by its PR and local publication/completion receipts.

## Follow-up suggestions

Proceed to the separately requested subscription-funded survival experiment after this focused delivery. Keep that experiment out of this PR.
