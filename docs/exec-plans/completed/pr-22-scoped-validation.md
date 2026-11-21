# PR-22: Dependency-scoped validation and delivery

## Requirement summary

Optimize the existing task coordinator's acceptance path without changing world behavior, experiment results or historical archives. The user explicitly replaces the unconditional full-suite/all-image policy with programmatically selected checks and authorizes AGENTS, harness, documentation and CI changes, reviewed publication and guarded merge.

## Requirements

- R1: Separate lightweight experiment reading, integrity checking and deep reconstruction. Reconstruct each selected archive/input at most once per validation session; downstream gates verify bound evidence. Batch preservation checks over complete archives.
- R2: Derive a conservative, testable check plan from actual changed files and protocol dependencies. Cover new archives, isolated modules, shared viewer, shared replay/core, documentation and explicit full audits. Report selected, reused and not-applicable checks honestly.
- R3: Bind evidence to relevant source, archive, validator and toolchain inputs. Reject missing, stale, failed or untrusted cached results. Keep runtime provenance separate from acceptance tooling; preserve frozen source snapshots.
- R4: Run one quality workflow per PR commit, with stable required check names. PR-body edits run contract checks only. Preserve exact-head CI, actual review, conflict and integration gates.
- R5: Add regressions for deduplication, scope, invalidation, archive mutation/deletion/addition, compatibility failures and invalid evidence. Synchronize instructions and architecture with the executable rules.
- R6: Deliver through the existing coordinator, PR and guarded merge. Retain ex8 and its task/checkpoint; compare existing failed CI logs with measured optimized local/remote checks, including reasons, durations and reconstruction counts.

## Scope and exclusions

Scope: validation scripts, experiment read/validation boundaries, browser selection, evidence receipts, archive preservation, CI triggers and freshness, tests and development documentation. No new service or task framework.

Excluded: real agent calls, experiment allocation/resumption, world rules, experimental outcomes, archive edits and replacement source snapshots. No timeout-only workaround or fabricated full-suite claim.

## Branch and task relationship

The clean original checkout remains on `feat/forest-lives-ex8` at `e3e0341`; PR #15 is open, with recorded ex8 and task `pr-21-forest-lives`. Its latest quality job passed in 624 seconds after earlier timeout failures. This focused task starts from main `f0441a9` in a separate worktree on `fix/scoped-validation`. PR #15 and its ignored task records remain intact. Integrate acceptance changes without allocating or continuing ex8; record any remaining parent-task delivery separately.

## Acceptance criteria

Every selected check passes; complete unit tests remain enabled for code changes. Tests demonstrate conservative impact rules, once-per-input reconstruction and rejection of corrupt or untrusted evidence. Current selected visual evidence receives actual review. CI independently creates its own evidence and preserves stable `quality` and `pr-policy` gates. Both local and remote measurements and limitations are recorded before completion.

## Steps

1. Trace current validation/read/build/review/publication calls and retain timeout baselines.
2. Implement scoped plans, dependency-bound evidence and batched preservation checks.
3. Update browser/CI selection and delivery freshness; synchronize policy.
4. Run regressions, inspect selected behavior/images and complete the existing delivery state machine.

## Results and unexecuted checks

Implementation is complete; final current-source acceptance, visual review and remote CI are still required by the coordinator. No real experiment was run or resumed. Original PR #15 and ex8 remain untouched in their checkout.

Preliminary local run `df19fc8e-1e25-4865-a54e-7f532393879c` passed 379 unit tests in 43 files and 28 real Chromium tests, producing 51 selected images. Check durations totaled 36.885 seconds (warm reconstruction receipts, fresh browser capture). The preceding cold reconstruction measured ex1 0.022 s, ex2 0.012 s, ex3 0.011 s, ex4 0.025 s, ex5 0.885 s, ex6 2.476 s and ex7 8.475 s, once each. Its browser start failed because an orphaned static preview occupied port 4173; that process was stopped and the passing world receipts were reused. This development evidence predates the final ledger/fingerprint regression edits; final task and CI receipts supersede it.

The old ex8 CI [first timeout log](https://github.com/YuxiangLiu-lyx/self_evolving_world/blob/e3e0341c02845d95d6cd0f1e0a4e857d04ed8e6b/docs/exec-plans/evidence/pr-21-forest-lives/ci-quality-44862144416.txt) shows 53 unit files/415 tests passing, then repeated archive reconstruction, a 77-second viewer build and cancellation during browser tests. The [second timeout](https://github.com/YuxiangLiu-lyx/self_evolving_world/blob/e3e0341c02845d95d6cd0f1e0a4e857d04ed8e6b/docs/exec-plans/evidence/pr-21-forest-lives/ci-quality-44866956270.txt) preserves the subsequent incomplete attempt. The eventual old PR quality job took 624 seconds after raising its timeout to 20 minutes. This change retains the main branch's 10-minute limit. Comparisons must identify scope: this focused main-based PR contains ex1-ex7, while those baseline jobs also contain ex8. No speedup percentage is inferred across these different suites.

Regression coverage includes documentation/new-archive/isolated/shared/fallback selection, nested archive mutation/deletion and ignored additions, once-per-input deep reconstruction, validator/runtime invalidation, forged/failed/stale evidence, CI trust isolation, frozen runtime/tool separation and exact-head quality/body-policy freshness. The final report and CI artifact expose each selected check, reason, timing and disposition; the cross-process reconstruction ledger also counts browser reference reuse. Selected failures remain blockers.

## Limitations and follow-up

No cross-run CI artifact cache is trusted; each CI workflow verifies its own selected inputs. Local authenticated caches assume the runner key and checkout are not maliciously controlled by the same actor. Protocol ownership rules are deliberately conservative; unknown dependencies expand coverage. Real browser playback still reconstructs application state, while reference acceptance runs only once. Unchanged archive integrity and documentation bindings still incur cheap reads. PR #15 requires integration of these harness changes and fresh affected acceptance; this task never restarts its experiment.

## Delivery

- Task: Dependency-scoped validation and auditable delivery
- Mode: merge

## Current acceptance measurements

Coordinator run `3a7fecfa-116c-414e-a790-8e8f3adb1fd6` passed all selected automated checks: 380 unit tests in 43 files, 28 Chromium tests and 51 images. Checks totaled 45.917 seconds. Each of ex1-ex7 rebuilt exactly once; the cross-process ledger retained reuse by browser reference consumers. Archive preservation took 0.07 seconds. Actual image/diff review and current-head CI/merge receipts are still required; later policy/runtime-fingerprint refinements require refreshed validation. No CI performance number is invented before remote execution.
