# PR-08: Random World Experiment and Task Harness

## Requirement summary

Run the first offline world experiment with randomly selected actions and no external agent or model. Preserve its goals, measured results, replay and visual evidence under `experiment/ex1`. Extend the repository harness to distinguish code changes from experiment changes and validate experiment execution and artifact conventions.

## Requirements

- R1: Run the founding world with a reproducible seeded random policy, no model calls, and a bounded action count while preserving version-1 rules.
- R2: Save the first experiment in `experiment/ex1` with an objective, configuration, measured outcomes, replay, report and visual results; allocate subsequent runs as `ex2`, `ex3` and so on without overwriting existing runs.
- R3: Classify code, experiment-only and mixed changes in the harness, route them through documented workflows, and preserve full-suite and browser review requirements.
- R4: Reject incomplete, malformed, inconsistent or tampered experiment artifacts; verify runtime invariants, deterministic replay, results and browser evidence before task completion.
- R5: Synchronize usage, architecture, decisions, feature inventory and task records; inspect all current visual evidence and pass the complete validation and task completion gates.

## Scope and exclusions

Use 480 actions (160 turns per founding agent), seed 20261107, sequential round-robin scheduling and explicitly documented random action selection. Randomness belongs to the simulator application. Experiment tooling owns files, charts and browser capture. Mixed changes retain the code workflow plus experiment validation. All PRs retain the complete unfiltered suite.

Exclude OAuth/inference, continuous autonomous controllers, new skills/items, world rule changes, external services and deployment. Do not create `ex2` in the repository during this task; allocation tests use temporary directories. Existing optional model experiments remain separately invoked.

## Acceptance criteria

1. The saved run completes all 480 actions without runtime exceptions or invariant failures; expected rejected action outcomes are reported separately from execution failures.
2. Repeating the seed reconstructs the same action sequence and measured states. Every original item has exactly one location, agents remain in bounds without overlaps, rules/settings stay fixed, and observations match visibility.
3. The viewer imports the saved replay, displays initial/intermediate/final states and exports identical history after seeking/playback. Saved visuals and summary are derived from the actual run.
4. Number allocation never overwrites prior results. Missing goals, invalid parameters, altered replays/results/visuals, incomplete runs and invalid directory names fail validation.
5. Classification includes committed branch differences, staged/unstaged changes, deletions and untracked files; code changes cannot opt into a weaker experiment path. Completion requires fresh experiment checks and individual screenshot review.
6. Full tests, built CLI, browser checks, documentation checks and `pnpm task:finish` pass after the final source/documentation edit. Record actual evidence and distinguish local validation from remote CI.

## Steps

1. Inspect the foundation, current validation tooling and repository state; record scope before implementation.
2. Implement seeded random simulation, invariant checking, experiment allocation/reporting and artifact validation.
3. Integrate classification and experiment review into the task harness; add meaningful failure-path and replay/browser tests.
4. Run `ex1`, review its results and visuals, and synchronize documentation.
5. Review all changed files against R1-R5, run full validation, inspect current screenshots and finish the task.

## Results

The initial worktree was clean on `main`; implementation uses `feat/random-experiment-harness`. The canonical origin remains unchanged. Local validation used macOS arm64, Node 24.22.2, pnpm 10.34.9, Playwright 1.65.0 and Chromium from the existing pinned installation.

- Created only [ex1](../../../experiment/ex1/report.md), with seed 20261107 and 480 actions, 160 for each agent. All 481 snapshots passed invariant checks. There were zero model calls and no simulation exceptions.
- Measured 373 move requests, 41 pickup requests and 66 try requests. Outcomes: 341 moves, 30 boundary rejections, 2 occupied-cell rejections, 39 out-of-reach pickups, 2 missing-item pickups and 66 unavailable skills. All six items remain on the ground. No successful pickup occurred in this run; existing core and browser tests separately cover pickup success.
- Final positions: Lin (3,11), Moss (2,6), Sol (10,7); visited cells: 55, 34 and 37 respectively. Saved objective, configuration/provenance, all events, final state, replay, report, vector chart and four real browser images.
- The first browser capture timed out because the test requested an unavailable 8x speed. Corrected the test to the supported 4x option and resumed capture from the saved replay. The manifest retains the failure in `captureFailures`; simulation artifacts were preserved. A later attempt to resume the completed record correctly failed without modifying it.
- Full `pnpm validate -- "PR-08 random world experiment and harness"` passed: 154 unit tests across 12 files, all 8 browser tests, strict types/lint/format/dependency checks, builds, deterministic compiled CLI, experiment validation and documentation checks. No tests were skipped. `pnpm demo` also passed.
- Codex inspected the four archived images and all nine current task screenshots. Initial/midpoint/final map positions, inventories, history controls and event logs matched the data. The chart correctly displayed paths, counts and conservation; standard desktop/mobile/vision/action/history views had no clipping or overlap findings.
- `pnpm task:finish -- "PR-08 random world experiment and harness"` passed for run `4d77d8d3-191f-4798-bd3e-4894d2673e5d` before this results/archive update. Archival and feature-record edits require a fresh full validation, direct image review and completion gate before delivery; the current ignored validation report/review records that final run.

## Requirement and changed-file review

Codex reviewed all changed and added files against R1-R5. No unrelated edits, world rule changes, production viewer changes, new services or model calls were introduced.

| Requirements | Changed paths                                                                                                                                                                                                                                                                                                                                                                                                                    | Findings and evidence                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1           | `apps/simulator/src/random-run.ts`, `apps/simulator/test/random-run.test.ts`                                                                                                                                                                                                                                                                                                                                                     | Explicit seeded policy outside the unchanged core; reproducible actions, foundation equality, fair scheduling, no network/ambient randomness and full replay round trip tested.                                                                                                         |
| R2, R4       | `scripts/experiment-cli.ts`, `scripts/experiments.ts`, `scripts/experiment-analysis.ts`, `scripts/experiments.test.ts`                                                                                                                                                                                                                                                                                                           | Exclusive increasing IDs, complete records, guarded capture recovery, per-state invariants, exact reconstruction, report/chart checks, hashes and invalid-artifact cases verified. Allocation tests use temporary roots, leaving only ex1 here.                                         |
| R2           | `experiment/ex1/manifest.json`, `experiment/ex1/replay.json`, `experiment/ex1/results.json`, `experiment/ex1/report.md`, `experiment/ex1/browser.json`, `experiment/ex1/overview.svg`, `experiment/ex1/overview.png`, `experiment/ex1/initial.png`, `experiment/ex1/midpoint.png`, `experiment/ex1/final.png`                                                                                                                    | Retained actual measurements and real visuals with checksums. Zero pickup successes are recorded accurately.                                                                                                                                                                            |
| R3, R4       | `scripts/harness.ts`, `scripts/harness.test.ts`, `scripts/validate.ts`, `scripts/validation.ts`, `apps/viewer/e2e/experiments.spec.ts`, `apps/viewer/e2e/validators.ts`                                                                                                                                                                                                                                                          | Code/experiment/mixed classification includes all change sources. Mixed work prechecks artifacts; full suite remains mandatory. Fresh experiment scenes are required by the review gate. Real replay import, positions, inventories, vision, playback/export and image decoding passed. |
| R3, R5       | `package.json`, `.github/workflows/ci.yml`, `.prettierignore`                                                                                                                                                                                                                                                                                                                                                                    | Commands integrated, complete suite gains artifact checks, CI fetches baseline history. Canonical generated archives bypass formatter rewriting while remaining tracked, fingerprinted and validated. No dependency additions.                                                          |
| R5           | `AGENTS.md`, `agent.md`, `README.md`, `ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/DOCUMENTATION_POLICY.md`, `docs/PRODUCT.md`, `docs/PROJECT_OVERVIEW.md`, `docs/VALIDATION.md`, `docs/decisions/0008-numbered-experiments-and-task-routing.md`, `docs/decisions/README.md`, `docs/exec-plans/README.md`, `docs/exec-plans/completed/pr-08-random-experiment-harness.md`, `experiment/README.md`, `scripts/documentation.ts` | Workflow entrypoints, module ownership, decision, feature evidence, archive contract, plan navigation and required documentation synchronized. Markdown and local links passed before archival; final rerun required after these edits.                                                 |

## Limitations and unexecuted checks

One seeded bounded run establishes observed behavior for that run, not long-term reliability or intelligent decision-making. The run did not exercise successful pickups; regression tests do. The archive grows with each experiment and all retained runs participate in browser validation. Future policy/report changes must preserve versioned historical reconstruction semantics.

No publication, PR, remote GitHub Actions run or merge was requested or performed. Local success does not establish remote CI success; PR preflight and current remote `quality`/`pr-policy` checks remain necessary before future publication/merge. There are no unresolved local environment blockers.
