# Requirements and Pull Request Contract

This policy owns requirement traceability and PR acceptance. [VALIDATION](VALIDATION.md) owns full test execution and evidence review; [PRODUCT](PRODUCT.md) alone owns feature status. Requirements, plans, PR bodies, and review records are written in English. Summarize the task to the user in Chinese before implementation.

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

Inspect every current screenshot and behavior result and record `requirements.verdict` and `requirements.notes` in the generated review after reading the actual diff. Notes identify the requirement IDs, changed behavior, evidence, and scope findings. `pnpm task:finish` requires this review in addition to visual and behavior approval. Complete only after it passes after the final edit.

Commit the reviewed source, prepare the PR body outside tracked source (for example `validation-results/pr-body.md`), then run:

```bash
pnpm pr:check -- validation-results/pr-body.md origin/main
```

This requires a clean worktree, compares the PR body with the committed plan and changed paths, checks the head SHA, and verifies that its task/run ID matches the actual completed local evidence. Committing without changing source does not invalidate the source fingerprint. After another source edit, repeat validation, review, completion, commit, and PR preflight.

## GitHub checks and merge restrictions

[CI](../.github/workflows/ci.yml) runs `quality` for all PRs without path filters. The [PR workflow](../.github/workflows/pr-policy.yml) runs `pr-policy` on opening, reopening, new commits, description edits, and readiness changes. It fetches the current body and complete changed-file list, reads the plan at the exact head, and rejects concurrent changes. Both jobs use read-only permissions; untrusted PR text is data, never interpolated into shell commands. No privileged `pull_request_target` workflow executes PR code.

The required repository protection is captured in [main-protection.json](../.github/main-protection.json): require PRs, successful `quality` and `pr-policy` checks with the branch up to date, resolved conversations, no force-push/deletion, and enforcement for administrators. The policy does not add a second-person approval requirement; the actual semantic review and requirement mapping remain mandatory, and humans choose whether to merge. A separate approval-count policy needs an explicit decision.

A workflow file does not enable GitHub protection. Check the current remote state before applying settings, preserve stronger existing rules, and verify the returned state afterward. When `main` has no protection, an administrator may apply the reviewed configuration with:

```bash
gh api --method PUT repos/YuxiangLiu-lyx/self_evolving_world/branches/main/protection \
  --input .github/main-protection.json
```

Inspect both checks for the latest PR revision before merging; never substitute a prior green run or local results. New policy code becomes the repository baseline when its PR is merged. The rollout and actual remote activation result belong in the task plan. Do not claim server-side enforcement from configuration files alone. Administrators who change settings or reviewers who approve modifications to the checking code can change this policy; these checks are not tamper-proof governance.
