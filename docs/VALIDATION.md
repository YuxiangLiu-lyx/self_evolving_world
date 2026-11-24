# Validation

Every change runs `pnpm validate` before publication; CI runs the same command as the `quality` check. No validation command calls a model or resumes an experiment. Feature status remains in [PRODUCT](PRODUCT.md).

## What runs

`pnpm validate` compares the branch, working tree and untracked files with `origin/main` (CI uses the event's base SHA) and runs, in order: archive preservation, typecheck, lint, format, architecture boundaries and the complete unit suite (for any code change), reconstruction of the selected archives in two worker processes, companion-analysis checks, build, the selected Playwright scenes, and documentation checks. Selected tests reject skips, `.only` and expected failures. `pnpm validate:audit` selects everything.

`validation-results/report.json` records each check as `passed`, `reused` or `not-applicable` with its reason and duration, plus the screenshot paths and hashes. Reconstruction and browser results are cached in `validation-results/cache/` by an input fingerprint (archive bytes, relevant runtime sources, validators, lockfile, Node and platform), so a rerun after an unrelated edit reuses them. CI starts with a fresh cache.

## Check selection

[Executable scope rules](../scripts/validation-plan.ts) select checks from the actual changed paths:

| Actual change                  | Selected checks                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Documentation only             | Documentation links and structure, formatting; no world reconstruction or screenshots            |
| New experiment archive         | Deep reconstruction and browser state/visual checks for that archive; preservation of all others |
| Protocol-owned runtime file    | All unit tests plus reconstruction and browser checks for that protocol's archives               |
| Validation or delivery tooling | All unit tests only; run `pnpm validate:audit` when the change alters reconstruction or scenes   |
| Shared viewer file             | Affected protocols' archives and scenes, including historical and mobile views                   |
| Shared or unknown dependency   | Conservative expansion up to every archive                                                       |
| Explicit audit                 | Every automated check, every archive and all scenes                                              |

Protocol ownership follows file-name prefixes: `continuous-`, `forest-`, `open-`, `collective-`, `long-` and `material-` belong to the continuous protocol (version 7, ex7–ex13), which never imports grid-era modules; `coevolution-`, `evolution-`, `learning-`/`skill-`, `survival-`/`program-`, `synchronous-` and `random-` map to their grid versions; `world.ts` affects versions 1–6. Unknown paths expand scope.

Archive preservation compares every committed file under `experiment/exN/` with the base tree, and rejects additions, even ignored ones. Only an explicit user reuse request recorded in the changed plan as `- Experiment reuse: exN — reason` (at least twenty characters) exempts that archive.

`readExperiment` reads metadata without semantic acceptance, `checkExperimentIntegrity` checks the file set and artifact hashes, and `validateExperiment` performs deep reconstruction or reuses a cached result for identical inputs.

## Visual review

The game observatory is the primary page; `classic.html` preserves the original controls and protocol views. The planner selects relevant scenes from the catalogue below. Shared presentation changes cover affected historical adapters and mobile views; new archives add initial, midpoint, final and overview scenes. Unaffected scenes are not applicable or reused, never claimed as freshly captured. When adding pages or major interactions, extend the [scene list](../scripts/validation.ts) and browser tests instead of continuing to review only old pages.

| Scene ID                         | Required content                                        | Review focus                                                                                            |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| desktop                          | Demo world at a 1440×1100 viewport                      | Complete map, inspector, timeline, events, and controls; sensible spacing and hierarchy                 |
| mobile                           | New world at a 390×844 viewport                         | Natural vertical scrolling; no cramped, clipped, or horizontally overflowing content                    |
| agent-vision                     | Lin's initial agent view                                | Clear observed/unobserved regions; hidden out-of-range agents; matching map and inspector               |
| after-actions                    | Movement and pickup                                     | Correct position, ownership and collection feedback                                                     |
| history                          | Replay paused at frame 3                                | Clear historical state, disabled action controls, matching map/inspector/event                          |
| experiment-browser               | Archived ex1 selected and paused midway on desktop      | Visible selector, objective, frame count, chart link and read-only feedback; matching positions         |
| experiment-mobile                | Direct ex1 URL on a 390px screen, Moss's initial vision | Selector and archive details wrap naturally; map, controls and inspector remain readable                |
| synchronous-browser              | ex2 at collection round 2 on desktop                    | Three recognizable actors, collected items, round label, all round events and disabled archive controls |
| survival-browser                 | Survival replay at round 30 on desktop                  | Health/satiety/cold/heat, current code progress and denied learning are readable and agree with history |
| learning-browser                 | Version-4 generated skill fixture on desktop            | Terrain, resource quantities, learned specification/code and vitals agree with reconstructed state      |
| learning-mobile                  | Same fixture during unfinished learning at 390px        | Individual progress and resources fit without horizontal overflow                                       |
| survival-mobile                  | Same replay at 390px with Moss selected                 | Vital meters, code and request history fit without horizontal overflow                                  |
| synchronous-mobile               | ex2 at collection round 2 at 390px                      | Readable illustrated map and event feedback with no horizontal overflow                                 |
| evolution-browser                | Version-5 resource discovery on desktop                 | Persistent allocation, learned capabilities and actual resources match history                          |
| evolution-mobile                 | Version-5 discovery at 390px                            | Allocation and resource feedback remain readable                                                        |
| coevolution-browser              | Version-6 facility fixture on desktop                   | Persistent facility, energy, burden and effects agree with state                                        |
| coevolution-mobile               | Version-6 fixture at 390px                              | Facility details and plans fit the narrow view                                                          |
| historical-game-ex6              | Saved ex6 in the game observatory                       | Historical coordinates, resources and actor state remain unchanged                                      |
| historical-personal-ex6          | Personal historical view                                | Hidden actors and objects stay hidden; selection and inspector agree                                    |
| historical-game-mobile           | Historical game view at 390px                           | Map and controls fit; inspector and event feed scroll naturally                                         |
| historical-unmeasured-vitals     | Saved ex1 in the game observatory                       | Unmeasured vital fields show an empty meter and em dash, never invented values                          |
| isolated-continuous-extension    | Paid shared object fixture                              | Real geometry, footprint and distinct rendering; fixture is not an experiment discovery                 |
| continuous-initial-world-fixture | Continuous scene fixture                                | Fractional positions, private vision, selected object and before/after reconstruction                   |

Inspect blank pages, missing styles, obstruction, odd spacing, unreadable text, distinguishable colors, overlapping controls, and state feedback. Automated layout checks cover objective issues such as horizontal overflow, clipping, panel overlap, and missing controls or grid cells. **Basic aesthetics still require looking at the actual page.** There is no pixel baseline, and producing a screenshot is not visual acceptance.

The `continuous-responsive-collective` scene covers an actual ex12 replay after
a cancelled long seek, settled playback, private-view isolation and camera fit.
Its browser case checks that controls respond before the long target is reached;
it does not interpret test interactions as agent behavior.

## Behavior review

Review the browser assertions and key frames, compare states before and after actions, and use core and timeline tests to verify:

- In historical grid protocols a move travels exactly one cell; their boundary and occupancy rejection semantics remain unchanged. In version7 a step uses continuous distance, swept collision and mass-dependent costs; the renderer never advances simulation time.
- Historical pickup transfers a same-cell item to exactly one inventory. Continuous pickup uses the shared reach geometry and actual quantity/cost rules. Ground state, controls and observations update together; other agents do not receive duplicates.
- Legacy imported skill attempts do not execute or unlock capabilities. Repeated tries remain unavailable; trying `move` does not implicitly move.
- Agent view excludes out-of-range entities and updates as agents move or items are collected.
- Playback, pause, and stepping do not create actions or rewrite history. Exports before and after replay must be identical. Local session actions require the latest state; archived experiment actions stay disabled at every frame.
- Experiment selection, direct links, refresh and back/forward load the correct archive. Invalid catalogue/replay data preserves the current history. Obsolete loads cannot replace a newer selection or local session. The demo remains usable with an empty archive. Fixture-only experiment IDs must never allocate real run directories.
- Survival history reconstructs exactly without inference; selecting a frame updates vitals, code/progress and denied requests. Adverse-temperature/starvation tests cause continuing damage and irreversible death, and program tests reject unsupported code, premature calls and exhausted budgets.
- No browser exceptions, console errors, failed resources, or HTTP errors occur.

Add scenarios and expected outcomes for changed behavior. Import `test` from `apps/viewer/e2e/validators.ts` in new browser tests so runtime health checks remain automatic. Both local and CI unit/browser runs forbid `.only`; skipped, todo, expected-failure, or incomplete tests cannot pass task validation. Code changes run all unit tests. The program selects browser coverage; every selected test must actually pass. Screenshots wait for notifications to disappear naturally rather than injecting styles that conceal problems. Automation cannot judge model decision quality. Optional model CLIs are tested with deterministic transports; live OAuth/inference results are recorded separately and never run by CI.

## Evidence and invalidation

- `validation-results/report.json`: run ID, plan, check results, screenshot paths and hashes.
- `validation-results/evidence/<run>/`: copies of the selected screenshots, kept across Playwright cleanup.
- `validation-results/cache/`: fingerprint-keyed reconstruction and browser results for local reuse.
- `playwright-report/index.html`: test details (`pnpm exec playwright show-report`); `test-results/`: raw screenshots, exported histories and failure traces.

These directories are ignored by Git. Any source edit changes the relevant fingerprints, so the next `pnpm validate` reruns exactly the affected reconstructions and browser checks. Automated checks do not prove that anyone looked at a screenshot; for viewer changes, inspect the listed images yourself and state what you found in the PR.

## Protocol-specific coverage

- **Learning (v4), evolution (v5), coevolution (v6):** reconstruct every recorded input, proposal, allocation, registry and body transition; their browser scenes are listed above. See [learning](SKILL_LEARNING_EXPERIMENT.md), [evolution](EVOLUTION_EXPERIMENT.md) and [coevolution](COEVOLUTION_EXPERIMENT.md).
- **Continuous and forest (v7):** the forest-lab scenes in `REVIEW_SCENES` cover cave, building, food, experience, lives and requested mechanisms and are selected when forest behavior or presentation changes. [Open development](OPEN_DEVELOPMENT.md) adds registry isolation, physical probes and conserved processes; [collective life](COLLECTIVE_LIFE.md) adds member, group and generated-capability fixtures. Fixture output is never evidence of autonomous behavior; real archives receive their own replay checks and behavioral analysis.
- **Pending capture:** `pnpm experiment:capture` reconstructs the saved simulation before launching Chromium; the pending receipt cannot satisfy completed-archive acceptance.

## Environment and failure handling

Install the pinned Node, pnpm and Chromium using the [development workflow](DEVELOPMENT.md). Port 4173 is the dedicated test server; development uses 5173. Fix every failure and rerun; do not skip selected tests, weaken assertions or substitute old screenshots. If a blocker cannot be resolved, report the work as incomplete.

CI runs on the [canonical repository](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions) with a twenty-five-minute limit and uploads reports and screenshots for 14 days, including failed runs. A manual `workflow_dispatch` runs the full audit. Earlier workload measurements are retained in [PR-27](exec-plans/completed/pr-27-ci-audit-headroom.md) and the [ex13 CI deadline record](exec-plans/evidence/pr-31-long-open-development/ci-deadline.txt).
