# Incremental verified observatory replay

## Intent

Complete the collective-life delivery after PR 19's post-merge CI exposed a
large-archive initial-load failure. This is a viewer and acceptance repair under
the existing user authorization, not another experiment. PR 19, its reviews,
failed checks, ex11/ex12 checkpoints and all prior archives remain retained.

## Requirements

- R1: Preserve every experiment, frozen policy, source snapshot and model-call record; make no inference calls and add no experiment.
- R2: Reconstruct only the requested continuous replay prefix, retain verified progress and reuse it for repeated/backward seeks; each requested round must pass the existing state, event and cursor checks.
- R3: Serialize concurrent seeks within a segment, reject corrupt input, and isolate cached segment work across archive changes; obsolete asynchronous results cannot replace current state.
- R4: Cover incremental/full equivalence, no repeated work, concurrent targets, corruption and archive switching with meaningful tests; retain actual browser state, interaction and visual checks without extending deadlines.
- R5: Record actual failure and performance evidence; complete the existing task harness, current review, PR, required CI and authorized guarded merge.

## Exclusions

No simulation rules, agent prompts, recipes, rewards, budgets, generated skills,
archive mutations, model execution, infrastructure services or framework rewrite.
No timeout increase, skipped browser check or fabricated acceptance evidence.

## Acceptance

Run the unfiltered unit suite and programmatically selected viewer compatibility
checks. Inspect new screenshots and reuse only matching reviewed evidence. Verify
current remote checks and main integration. Compare actual load/check timings to
[failed main CI](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/runs/45071313373)
and [passing PR CI](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/runs/45069638123).

## Progress

- Preparation: inspected clean main at `69f0b2b8416fc16d92283327e0b0ccd6b5d59ebd`.
- Observed failure: the initial viewer seek reconstructs all 100 rounds of a large
  segment before rendering round zero; ex12 failed near the 90-second state wait
  in the main run, followed by the ten-minute job cancellation.
- Implemented prefix-local serialized replay, in-flight segment sharing and stale-result exclusion. Every requested round retains the original verification; offline full audit is unchanged.
- Eight targeted tests passed, including the existing cross-segment operation regression. New browser concurrency/archive-switch coverage passed in 0.93 seconds; actual ex12 browser acceptance passed in 57.2 seconds locally, versus approximately 78 seconds in the prior full local run. These are observed timings, not a hardware-controlled benchmark.
- The retained main trace confirms expected `0 / 136`, actual `0 / 0`, timeout 90,000 ms. No timeout, archive or simulation policy changed.
- Implementation review found no remaining mismatch against R1-R5. Current full selected acceptance, screenshot review, remote CI and guarded integration are enforced by the task record; targeted diagnostics do not establish final completion.
