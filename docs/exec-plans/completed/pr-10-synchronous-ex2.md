# PR-10: Synchronous Random Experiment ex2 and Default PR Delivery

## Requirement summary

The user requests a new ex2 experiment that corrects ex1's sequential scheduling and lack of successful pickups, uses recognizable agent/item visuals, removes learning attempts while no external agent is connected, and publishes the changes as a PR. All future code and experiment tasks must follow PR delivery automatically; each new experiment allocates a fresh exN unless the user explicitly requests otherwise.

## Requirements

- R1: Preserve ex1 and its replay semantics while adding explicitly versioned synchronous rounds: every agent chooses from the same starting snapshot and all results appear in one committed frame, with deterministic collision handling and immutable observations.
- R2: Run ex2 with reproducible random exploration and observation-based collection, prioritize valid same-cell pickups, produce successful pickups, and issue no try actions or external model calls.
- R3: Render recognizable characters and distinct founding-item illustrations, retain accessible names and mobile readability, remove the learning-attempt control from the current interface, and keep legacy replay compatibility.
- R4: Retain ex2's objective, configuration, full replay, measured results, report and real browser visualizations; validate synchronous state/action consistency, artifact integrity, successful pickups and both archived histories in the interactive selector.
- R5: Make fresh exN allocation the default and explicit reuse the exception. Route code, experiment and mixed tasks through complete validation/review and automatic PR preparation/publication/verification, without skipping checks or fabricating review.
- R6: Preserve and include the previously authorized ex1 harness and experiment-browser foundation, synchronize all relevant documentation, pass full local validation and PR preflight, commit/publish a focused PR targeting main, and inspect its current quality and pr-policy checks.

## Scope and exclusions

This combined PR includes the uncommitted PR-08/PR-09 foundation plus synchronous simulation, replay support, revised random policy, viewer illustrations, ex2 and PR-delivery tooling. Keep version-1 core skills, founding items/settings, legacy replay behavior and ex1 artifacts unchanged. Do not connect external AI, add learning, create ex3, change repository protection, merge the PR, or add remote hosting. Use native vector/CSS illustrations rather than new image-generation dependencies.

## Acceptance criteria

- The same seed produces identical round histories; reversing batch input order does not change results. Duplicate/missing actors and malformed actions fail without mutation. Competing moves and starting occupancy cannot create overlaps; pickup preserves ownership and observations.
- One saved frame contains one round for all three agents. ex2 includes actual successful pickups and no try/model calls. Counts distinguish rounds, total actions and snapshots.
- Both replay versions round-trip and seek/play without executing new actions; ex1 remains byte-identical and ex2 is selectable through its direct URL. Archive controls remain read-only.
- New character/item visuals are distinguishable on desktop and mobile; missing item icons use a safe fallback; imported Unicode names remain text. No learning-attempt form remains in current UI.
- Existing record edits fail the default experiment-preservation gate unless an explicit, recorded exception is requested. New runs allocate the next unused number. Code-only tasks do not create experiments.
- Delivery requires current full validation, individual visual/behavior/requirement review, exact changed-file mapping, a clean reviewed commit, PR preflight and a matching remote PR. Remote checks are inspected before reporting delivery; merge is excluded.

## Steps

1. Preserve the previous local work on a focused branch and record the extension/replay design.
2. Implement and test synchronous rounds and the seeded collection policy while retaining legacy generation.
3. Extend replay, analysis, archive validation and browser illustrations; generate ex2 once.
4. Enforce numbered-archive preservation and default PR workflow; update documentation and tests.
5. Run the complete harness, inspect all current screenshots, resolve findings, archive the plan and repeat final validation.
6. Commit reviewed changes, prepare a requirement-mapped PR, run preflight, publish and inspect current remote checks.

## Results and evidence

- Implemented atomic rounds and version-2 replay while retaining the single-action core API and exact ex1 reconstruction.
- Generated ex2 once with seed 20261107: 160 rounds, 480 actions, 161 checked states; 434 moved, 6 picked-up, 7 occupied, 33 out-of-bounds; zero try/model calls and invariant failures. All six items were collected. Lin carries Wood; Moss carries Berry/Stone/Water; Sol carries Crystal/Seed.
- Added recognizable local character/item vectors, removed the try control, retained legacy imports and complete round event logs, and verified both archive selections on desktop/mobile.
- Added archive-preservation checks, explicit documented reuse exceptions, and automatic PR publication/verification for every route. Review identified a same-head stale-check risk after PR description edits; the publisher now requires check start times at or after the observed PR update and tests that case.
- First complete automated run ccfcc108-b0e5-42f9-97bb-15a648fb664d passed 183 unit tests, 14 Chromium tests, architecture (45 modules / 103 dependencies), deterministic compiled CLI and both archives. All 17 images were visually inspected: character/item art, round-2 pickups, round logs, mobile wrapping and trajectory/count charts were legible without clipping. Subsequent publication-check and documentation edits require a fresh full run and review.
- Fresh full run 7140b694-d1f8-4262-819e-cb65d4adc82a passed 184 unit tests in 16 files, all 14 Chromium tests and all other checks. All 17 current screenshots and behavior results were individually reviewed; pnpm task:finish passed. pnpm demo and a fresh zsh invocation of pnpm 10.34.9 / Node v24.22.2 also succeeded. This plan archive and documentation update require another complete run before publication; its exact run ID is retained in the PR and validation receipt.
- Branch: feat/synchronous-ex2-pr-workflow, based on origin/main 5fd2fc8ad514418fba94b2ac4c80f5d95b7fb228. The PR includes the previously authorized uncommitted PR-08/PR-09 foundation; ex1 artifacts were not regenerated. No ex3, model request, merge or repository protection change was performed.

## Unexecuted checks and limitations

Local implementation and acceptance are complete. Final validation after this plan archive, committed PR preflight, publication and current remote CI verification are delivery gates: the matching PR description and validation-results/publication.json record the exact final head/run and remote outcome. This document does not claim remote success before those checks execute. Synchronous scheduling is a separately versioned extension, not a rewrite of the founding single-action semantics. PR publication is authorized; merging is not.

## Follow-up suggestions

Longer experiments, other collection policies and connected decision agents require separate numbered runs and their own measured comparisons.
