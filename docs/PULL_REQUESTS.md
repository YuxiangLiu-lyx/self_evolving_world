# Pull Requests

This document owns requirement traceability and PR acceptance. [VALIDATION](VALIDATION.md) owns check selection; [PRODUCT](PRODUCT.md) alone owns feature status. Plans and PR text are in English; summarize the task to the user in Chinese before implementation.

## Plans and requirements

Features and experiments need an [execution plan](exec-plans/README.md) written before implementation, with:

- `Requirement summary`: the requested outcome and relevant context.
- `Requirements`: numbered acceptance statements, `- R1: ...`.
- `Scope and exclusions`, and `Acceptance criteria` including important failure cases.

Small fixes (typos, CI tweaks, narrow bug fixes) may use `Plan: none`. Stop and ask the user about material ambiguity, architecture conflicts or substantial scope expansion. When the user changes scope, update the plan instead of quietly rewriting requirements.

## Review the actual changes

Before publishing, read `git diff origin/main...HEAD` including tests, configuration, documentation and deletions. Check both directions: every requirement is implemented and verified, and every changed file serves a requirement. Remove unrelated changes. Green checks are not a semantic review; say what you verified and what risks remain.

## PR description

Use the [template](../.github/pull_request_template.md): **Summary**, **Plan** (`Plan: path` or `Plan: none`), **Validation** (the `pnpm validate` result and what you saw in the screenshots for viewer changes), and **Experiments**. `pnpm pr:check -- body.md` and the `pr-policy` CI job enforce:

- Summary and Validation are concrete, without `REPLACE_ME`, `TODO` or `TBD`.
- A referenced plan is changed in this PR and contains numbered requirements.
- A PR that adds an experiment archive references a plan, fills in Experiments and adds a companion analysis under `experiment/analyses/exN/` for each new `exN`.

The check reads the PR body again on every edit, so fixing the description does not rerun `quality`.

## Automatic PR delivery for every task

Code, documentation, experiment and mixed tasks are published and merged by default under the user's standing instruction: `pnpm pr -- validation-results/pr-body.md "Title" --merge` pushes, opens or updates the PR, waits for `quality` and `pr-policy` on the current head and merges with a merge commit. Do not ask again for publication or merge that the user already authorized.

An explicit task-level instruction overrides the default: "PR only" means omit `--merge`; "local only" means commit locally without pushing. Record the exception in the plan. Missing credentials, failed checks or conflicts mean the work is incomplete, never an implied exception.

New experiments always use the next unused `exN`. Archive preservation blocks changes, removals and additions inside existing `exN` directories unless the plan records an explicit user reuse request: `- Experiment reuse: exN — quote or explain the instruction` (at least twenty characters). Never add a reuse line to silence a failure.

## GitHub checks and merge restrictions

[CI](../.github/workflows/ci.yml) runs the `quality` job for PR commits, main pushes and manual audits. [pr-policy](../.github/workflows/pr-policy.yml) runs on PR opening, new commits and description edits. The required protection in [main-protection.json](../.github/main-protection.json) requires PRs, both checks on an up-to-date branch, resolved conversations and no force pushes or deletions, including for administrators. A configuration file does not enable protection by itself; inspect the remote settings before claiming enforcement. An administrator can apply it with:

```bash
gh api --method PUT repos/YuxiangLiu-lyx/self_evolving_world/branches/main/protection \
  --input .github/main-protection.json
```

Inspect both checks for the latest PR revision before merging; never substitute an older green run or local results.
