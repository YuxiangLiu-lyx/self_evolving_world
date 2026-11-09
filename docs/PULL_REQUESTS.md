# Requirements and Pull Request Contract

This policy owns requirement traceability and PR acceptance. [VALIDATION](VALIDATION.md) owns full test execution and evidence review; [PRODUCT](PRODUCT.md) alone owns feature status. Requirements, plans, PR bodies, and review records are written in English. Summarize the task to the user in Chinese before implementation.

Use the [unified task entry](TASK_HARNESS.md) to execute this contract. The coordinator returns current-head PR-body, GitHub self-review and separately authorized merge requests; it preserves the template and checks below.

## Before implementation

Every PR needs an execution plan, including a concise plan for small or documentation-only work. Before editing implementation, record:

- `Requirement summary`: the user's requested outcome and relevant context.
- `Requirements`: stable identifiers such as `R1`, `R2`, and concrete acceptance statements using `- R1: ...`.
- `Scope and exclusions`: affected behavior and explicit boundaries.
- `Acceptance criteria`: observable success and important failure/regression cases.

Communicate this summary before development. Routine clarification does not need an extra approval round. Stop and clarify material ambiguity, architecture conflicts, or substantial scope expansion. Preserve prior requirement meaning when the user changes scope; explain the authorized change in the plan and update its acceptance criteria. Do not quietly rewrite requirements to justify unrelated code. Record the summary before implementation; automation cannot prove when a human formulated a requirement.

## Review the actual changes

Before opening or updating a PR, inspect `git diff origin/main...HEAD` and the working changes, including tests, configuration, documentation, deletions, and renamed paths. Compare both directions:

1. Every requirement has a complete implementation and meaningful verification.
2. Every changed file contributes to an authorized requirement; unrelated changes are removed or separately authorized.

Check semantics and failure behavior, not just filenames, type correctness, or green tests. Describe the concrete behavior, evidence, remaining risks, and any resolved mismatch. Do not mark a missing requirement as passed or omit it from the PR. Humans retain product and architectural acceptance; automated traceability is not a semantic proof.

## PR description contract

Use the [template](../.github/pull_request_template.md). Keep its section and field names so the checker can read it.

- **Requirements:** copy the plan's numbered requirements verbatim. The referenced plan must be changed in this PR.
- **Scope:** provide the repository-relative plan path, in-scope work and exclusions.
- **Requirement review:** map each requirement to exact changed paths in code spans, explain the implementation, identify actual verification and findings, and record `PASS` only when satisfied. Multiple rows per requirement are allowed. Every changed file must appear. For renames, use the destination path reported by GitHub and explain the old path in prose.
- **Validation:** record the latest full head SHA, actual local task/run ID, complete suite result, environment/counts, review findings and evidence locations. Remote CI state must be accurate and separate from local results.
- **Code review:** name the actual reviewer and record the full-diff comparison, risks, and resolved deviations.
- **Documentation synchronization:** identify relevant PRODUCT, architecture, ADR, plan, and usage updates, or explain why each is unchanged.
- **Completion checklist:** all attestations must be checked before the gate can pass.

Placeholders, duplicate or mismatched requirements, missing paths, pending/failed rows, unchecked attestations, and stale head SHAs fail `pr-policy`. Unavailable checks block completion; they are not exemptions. Draft PRs may capture unfinished work but cannot pass until the contract is complete. A new commit requires rechecking the full diff and updating the reviewed head; source or documentation changes also require fresh full validation. PR body edits retrigger the policy check.

## Full validation and local preflight

Every PR, including documentation-only PRs, runs the complete unfiltered `pnpm validate -- "task name"`. It includes types, lint, formatting, architecture, all unit tests, builds, compiled CLI verification, all browser tests, and documentation checks. Do not use path filters, changed-tests-only selection, skips, todo tests, expected failures, `.only`, or failed-check waivers as acceptance evidence. Focused debugging commands do not replace the final full run. Test removal or weaker assertions need a requirement-based explanation and semantic review.

Inspect every current screenshot and behavior result and record `requirements.verdict` and `requirements.notes` in the generated review after reading the actual diff. Notes identify the requirement IDs, changed behavior, evidence, and scope findings. Submit the actual review through the coordinator, which invokes the guarded local review worker after the final edit; final task completion additionally requires verified delivery.

Commit the reviewed source, prepare the PR body outside tracked source (for example `validation-results/pr-body.md`), then run:

```bash
pnpm pr:check -- validation-results/pr-body.md origin/main
```

This requires a clean worktree, compares the PR body with the committed plan and changed paths, checks the head SHA, and verifies that its task/run ID matches the actual accepted local evidence. Committing without changing source does not invalidate the source fingerprint. After another source edit, repeat validation, local review, commit, and PR preflight.

## Automatic PR delivery for every task

Code, documentation-only, experiment-only and mixed tasks all proceed automatically through PR and merge under the user's standing instruction. Perform implementation, full validation and actual review, submit the complete review, let the coordinator commit reviewed files and prepare the requirement-mapped body. Do not ask again for already-authorized publication or merge. Completion requires integration into main, not merely an open green PR.

```bash
pnpm task:publish -- validation-results/pr-body.md "Concrete problem and resulting behavior"
```

The publisher checks canonical origin, a focused branch and the clean reviewed commit/body, fetches main, computes conflicts with `git merge-tree` without changing the index/worktree, and requires main as an ancestor. It runs `pr:check`, pushes without force, creates or updates the matching PR, and waits for current `quality` and `pr-policy`. Checks must start at or after the observed PR update time; later comments or metadata edits may conservatively require rerunning CI. It rejects changed head/body/base, conflicting, unknown or blocked mergeability, stale/failed checks and concurrent source edits. After preflight the coordinator requests a GitHub COMMENT recording the current conversation's actual self-review. It verifies the remote record against the current head and evidence, then returns a merge-commit connector action only with separately recorded actual authorization. Final verification confirms the merged PR, fetches main and checks both reviewed head and merge commit ancestry. GitHub protection remains authoritative; no override, automatic review approval or setting change is requested.

`validation-results/publication.json` binds task, run, source, plan, body, branch, base, head, checks and merge result. The coordinator-bound publisher invokes the guarded finish worker, which independently checks current evidence, the version-bound remote self-review, PR identity/checks, archive preservation and integration and writes `completion.json`. Failures return nonzero and record incomplete delivery. A retry with the same current receipt detects an already merged PR and verifies it without a second merge. Keep the receipt/body until completion; new validation invalidates them.

Delivery HTTP calls pin the supported [2022-11-28 REST contract](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28), which retains the merged commit SHA required for independent confirmation. Do not upgrade this version without verifying the live merge response contract.

Authentication uses `GITHUB_TOKEN` or an existing HTTPS Git credential helper without logging secrets; gh is not required. Public `task:publish` is a compatibility wrapper for the unified coordinator, requires an existing task and cannot auto-merge. Its `--verify-only` option uses coordinator `verify ID` for fresh independent completion checks without preparation or external writes. Internal prepare-only and verify-only workers are guarded by the current coordinator lease, task, stage, plan, source/run/review and body. Raw publication without a worker mode is rejected. The legacy default HTTP merge path no longer exists.

The remote self-review is a submitted COMMENT for the exact current commit and exact recorded findings. It retains every reviewed file, task/run/source/review identities and per-image evidence. The gate reads remote facts rather than trusting a submitted tool result. This is implementing-conversation Codex self-review published through the connected account, not independent approval or proof of correct judgment. No second reviewer or model service is added. The current conversation must still inspect every image and full diff. Missing or stale remote review blocks published completion and merge handoff; an existing matching review is reused on continuation.

### Explicit delivery exceptions

Only an explicit user instruction for this task permits an exception. Record it in the current changed plan, using the exact validation task name:

```text
## Delivery

- Task: Exact validation task name
- Mode: pr-only
- Reason: The user explicitly requested a PR without merging for this task.
```

`pr-only` retains the reviewed PR and verifies current checks without merging. `local-only` means no PR and no merge; after full local review run `pnpm task:finish -- "Exact validation task name" --plan docs/exec-plans/active/pr-NN-task.md`. This path performs no network publication and requires the current reviewed exception plan and intact archives. Exceptions produce `completed-with-exception`, distinct from normal `completed`. Absent a section, the mode is `merge`; an explicit merge section needs Task and Mode only. Duplicate, malformed, wrong-task and unchanged historical exceptions fail. Semantic reviewers verify actual authorization; never manufacture an exception to work around missing credentials, conflicts or failed checks.

New experiments always allocate the next unused exN by default. The harness and preflight compare every previously committed archive file with origin/main and block changed, removed or added files within existing exN directories. Only an explicit user reuse request may be recorded in the current changed plan as:

```text
- Experiment reuse: exN — Quote or explain the explicit user instruction and why this record must change.
```

The reason must contain at least twenty characters. Reviewers verify the actual authorization; the parser cannot prove it. No exception bypasses complete artifact reconstruction, browser evidence, tests or PR review. Explicit capture resumption is limited to failed/incomplete runs and preserves their simulation and error history. Never add a reuse line merely to silence a failure. Code-only tasks do not allocate experiment directories.

## GitHub checks and merge restrictions

[CI](../.github/workflows/ci.yml) runs `quality` for all PRs without path filters. The [PR workflow](../.github/workflows/pr-policy.yml) runs `pr-policy` on opening, reopening, new commits, description edits, and readiness changes. It fetches the current body and complete changed-file list, reads the plan at the exact head, and rejects concurrent changes. Both jobs use read-only permissions; untrusted PR text is data, never interpolated into shell commands. No privileged `pull_request_target` workflow executes PR code.

The required repository protection is captured in [main-protection.json](../.github/main-protection.json): require PRs, successful `quality` and `pr-policy` checks with the branch up to date, resolved conversations, no force-push/deletion, and enforcement for administrators. The policy does not add a second-person approval requirement; the actual semantic review and requirement mapping remain mandatory, and humans retain product and architectural acceptance while the standing instruction authorizes guarded merge by default. A separate approval-count policy needs an explicit decision.

A workflow file does not enable GitHub protection. Check the current remote state before applying settings, preserve stronger existing rules, and verify the returned state afterward. When `main` has no protection, an administrator may apply the reviewed configuration with:

```bash
gh api --method PUT repos/YuxiangLiu-lyx/self_evolving_world/branches/main/protection \
  --input .github/main-protection.json
```

Inspect both checks for the latest PR revision before merging; never substitute a prior green run or local results. New policy code becomes the repository baseline when its PR is merged. The rollout and actual remote activation result belong in the task plan. Do not claim server-side enforcement from configuration files alone. Administrators who change settings or reviewers who approve modifications to the checking code can change this policy; these checks are not tamper-proof governance.
