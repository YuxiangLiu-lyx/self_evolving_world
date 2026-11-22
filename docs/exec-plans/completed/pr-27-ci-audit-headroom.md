# CI headroom after measured replay optimization

## Requirement summary

Finish the existing collective-life delivery after PR 20's main check reached
the total job deadline during its last browser cases. Preserve the completed
experiments and all correctness gates; this is not another simulation run.

## Requirements

- R1: Increase only the quality job's total deadline from ten to fifteen minutes after the measured PR 19/20 optimizations; retain every assertion, selected check, individual test timeout and stable required check name.
- R2: Document the retained failure and measured computation improvements without presenting cancellation as success or claiming controlled benchmarks.
- R3: Preserve all world code, experiment policies, frozen archives, calls and checkpoints; make no model calls or new experiment.
- R4: Complete the existing scoped acceptance, actual review, current-head PR checks and guarded merge; verify a fresh explicit full audit of the resulting main revision before final delivery.

## Scope and exclusions

Change CI's outer execution allowance and its validation documentation only.
No simulator change, skipped work, external cache/service, budget increase,
framework rewrite, retries of model calls or extension of individual test limits.
F-128's delivered behavior and all feature statuses remain unchanged.

## Acceptance criteria

The program selects checks from the actual diff; code changes retain the entire
unit suite and all archives retain batch immutability coverage. This CI-only
change does not invalidate unchanged world or screenshot inputs. After guarded
merge, dispatch the existing explicit full-audit entry against main and retain
its actual result. This audit reconstructs saved state, never model inference.

## Retained evidence and rationale

- PR 20 head `d89d44d37ff7bfa13a61735f56057bc24ac1605c` passed
  [CI 45077035486](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/runs/45077035486)
  in 9m39s: 761 unit tests, 75 browser cases, twelve deep archive checks.
- Incremental verified seeking reduced ex12 initial display from a 90-second
  timeout to 1.71 seconds in that CI. Equivalent structural comparison reduced
  ex12 deep verification from 249.13 seconds in the preceding cancelled job to
  98.13 seconds; execution environments were not controlled benchmarks.
- Merged main `f630107b4d0367b25c2a7ef12331db0516efa123` then hit the
  [ten-minute deadline in CI 45078099541](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/runs/45078099541).
  Ex12's first frame took 1.718 seconds, deep verification took 111.83 seconds,
  and its complete browser case passed. Cancellation occurred near the last
  browser cases, with no reported assertion failure. This run remains failed.
- The previous deadline leaves little margin for runner variability even after
  eliminating eager segment work, duplicate compilation and redundant canonical
  comparisons. Fifteen minutes bounds the complete existing workload, including
  setup and evidence upload. It does not make failed or missing checks pass.

## Progress

Prepared on clean main after both earlier tasks completed their guarded merges.
Current validation, review, PR checks and explicit main audit remain required;
their authoritative results are the coordinator and GitHub run records.
