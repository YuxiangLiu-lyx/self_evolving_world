# PR-32: Lean development workflow and legacy cleanup

## Requirement summary

Agent development, experiments, commits and merges took too long under the programmatic task harness. The user asked to keep the safeguards that matter, remove redundant process, delete logic superseded by newer protocol versions, and rewrite the README as a concise project description with only a short note on the development workflow.

Decisions confirmed by the user: (1) replace the coordinator with a lean branch → `pnpm validate` → PR → CI → merge workflow; (2) delete dead code, past-incident repairs and run entry points of retired protocols while keeping replay and validation of every archive ex1–ex13; (3) deliver this change through the new workflow as a merged PR.

## Requirements

- R1: Remove the task coordinator (`pnpm task`, state machine, request/source-hash bindings, sealed receipts, local review handoff, GitHub COMMENT self-review, merge-authority records, completion gate and compatibility aliases) and its tests.
- R2: Keep the necessary safeguards: CI `quality` (types, lint, format, architecture boundaries, full unit suite, dependency-scoped archive reconstruction and browser checks), archive immutability with the explicit reuse line, automatic next-exN allocation, model-free random runs, companion behavioral-analysis format checks, documentation checks and a required `pr-policy` check.
- R3: Replace the PR contract with a short template (Summary, Plan, Validation, Experiments) whose check requires a changed plan with numbered requirements when one is referenced, a plan for new experiments and a companion analysis for every new exN, without per-file matrices, head SHAs, run IDs or attestations.
- R4: Provide direct commands for the remaining experiment work: `experiment:run`, `experiment:continuous` (`new`, `continue`, `develop`, `extend`, `repair`), `experiment:capture`, `experiment:analysis`, plus `pnpm pr` for push/PR/merge without the GitHub CLI.
- R5: Narrow validation scope: continuous-family prefixes (`open-`, `long-`, `collective-`, `material-`) select protocol 7 only, `world.ts` no longer selects protocol 7, and validation/delivery tooling changes run code checks only.
- R6: Delete dead and superseded code: unreachable scripts, the exact-hash checkpoint repair allowlist and its incident tests, ex12-specific repair branches, the fixed CLI demo, the one-round model experiment and the run entry points of survival, learning, evolution and coevolution, while every archive still validates and replays.
- R7: Rewrite README, AGENTS and the development, validation and PR documents to describe the lean workflow; synchronize PRODUCT, ARCHITECTURE, protocol documents and record the decision in a superseding ADR.

## Scope and exclusions

In scope: `scripts/` harness and experiment CLIs, CI and PR template, simulator/viewer entry points that only started retired runs, and the documentation listed above.

Out of scope: changing any experiment archive, world rules, replay semantics, the grid-protocol viewer (`classic.html`) or the ex9/ex13 presentations; rewriting historical completed plans or evidence beyond fixing links to deleted files; starting a new experiment.

## Acceptance criteria

- `pnpm validate` passes locally with the scoped plan, including reconstruction and browser checks for every archive selected by the changed runtime files.
- `pnpm docs:check` passes with no links to deleted files or commands.
- CI `quality` and `pr-policy` pass on the PR, and the PR is merged into `main` with a merge commit.
- No archive file under `experiment/ex*/` changes.

## Results

- R1–R4: the coordinator, its 10 test files and the compatibility aliases are removed. New `experiment:continuous` subcommands, `experiment:capture`, `experiment:analysis` and `pnpm pr` replace them. `scripts/continuous-repair.ts` keeps the computation, context and failed-long-call technical pauses and the abandoned-invocation rule (never resend; keep the charge).
- R3: `pr-policy` now checks Summary, Validation, the plan reference and new-experiment analyses. Unit tests cover acceptance, placeholders, unchanged or unnumbered plans and missing analyses.
- R5: scope tests confirm that continuous-family prefixes select ex7 only, that `world.ts` selects ex1–ex6, and that tooling changes select no archives.
- R6: the scripts, simulator and test changes remove about 13,800 lines and add about 1,300. Byte-for-byte rebuilds of ex3–ex6 replay, results, report and chart were confirmed during the simulator cleanup.
- R7: the documentation listed above is synchronized, and [ADR-0027](../../decisions/0027-lean-development-workflow.md) records the decision.

Local `pnpm validate` (macOS, Node 24.22.2) selected the conservative full scope because shared files changed, and every check passed:

- archive preservation;
- typecheck, lint, format and architecture;
- 136 unit test files / 776 tests;
- deep reconstruction of all 13 archives;
- companion analyses and the build;
- 84 Playwright tests with 193 screenshots;
- documentation checks.

Sampled screenshots (desktop demo, ex3 final, ex13 final) render normally. Remote CI and the merge are recorded on the PR.

Limitations: honest visual and semantic review is now a convention rather than a structural gate. Validation tooling changes no longer trigger reconstruction automatically. New grid-era runs would need their entry points restored from history.
