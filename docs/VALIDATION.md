# Task Validation and Completion Gate

Every development task, including documentation-only changes, must follow this workflow. The executor may be a developer or Codex; no additional user approval is required. Fix failures and continue until validation succeeds before declaring completion. Feature status remains in [PRODUCT](PRODUCT.md). Write repository review records in English and communicate with the user in Chinese.

## Execution sequence

The [existing coordinator](TASK_HARNESS.md) owns preparation, validation, actual review, commit, PR and integration. `pnpm validate -- "task name"` derives a check plan from actual changes; `pnpm validate:audit -- "audit name"` explicitly selects everything and starts a fresh evidence domain. No validation command calls a model or resumes an experiment.

The runner records every check's reason, duration, dependency fingerprint, deep-rebuild count and `passed`, `reused` or `not-applicable` status. All selected checks must pass. Code changes retain the full unfiltered unit suite. Selected browser tests reject skips and expected failures; exclusions are represented in the plan rather than hidden skipped tests. `pnpm check` remains the comprehensive debugging pipeline but cannot complete a task.

At review, inspect each newly selected image and its behavior. Unchanged browser results may reuse authenticated prior actual reviews only when browser dependencies and retained pixel hashes match. The report names the originating run and reviewer. Missing, changed or unreviewed evidence requires inspection; a cached PASS string is insufficient. Always review the complete current diff against numbered requirements. New task/source/plan changes invalidate that diff review while retaining independently valid check receipts.

## Task harness routing

The task category remains descriptive, not permission to skip checks. [Executable scope rules](../scripts/validation-plan.ts) inspect committed, staged, unstaged, deleted and untracked paths against an explicit base SHA. Missing baselines fail closed. CI uses the event's base/before SHA, including main push validation.

| Actual change                                       | Selected acceptance                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                                  | Documentation links/structure, formatting, full-diff review and PR contract; no world reconstruction or historical screenshots     |
| New experiment only                                 | Deep reconstruction and browser state/visual checks for the new archive; old archives receive complete batched preservation checks |
| Isolated version/module                             | All unit tests plus affected protocol reconstruction/browser checks; unrelated versions are excluded                               |
| Shared viewer                                       | Affected version loads, initial/intermediate/final state, representative desktop/mobile views and fixtures                         |
| Shared world/replay/migration or unknown dependency | Conservative affected-version expansion, up to the full audit                                                                      |
| PR description only                                 | Current PR contract and body freshness; no quality rerun                                                                           |
| Explicit audit                                      | Every automated check, every archive and all current scenes; fresh local/CI evidence                                               |

Known ownership currently separates continuous/forest, coevolution, evolution, learning, survival and founding dependencies. Unknown paths expand scope. Shared public entry points are conservative. Protocol fixtures remain separate from real experiment discoveries. Every new experiment still needs retained behavioral analysis; this task-routing change never authorizes inference or archive replacement.

Archive preservation uses one recursive Git tree inventory and in-process blob comparison, covering every original file plus actual directory entries (including ignored additions). Explicit user-authorized reuse remains governed by the [PR contract](PULL_REQUESTS.md#automatic-pr-delivery-for-every-task).

`readExperiment` reads metadata without semantic acceptance. `checkExperimentIntegrity` checks the complete file set and artifact hashes. `validateExperiment` performs deep reconstruction or returns an authenticated result for identical inputs. Viewer builds and behavioral-analysis identity/binding checks never implicitly reconstruct. Completion checks verify the plan, receipts, dependency fingerprints and actual review; they never replay experiments again.

## Visual review

The game observatory is the primary page; `classic.html` preserves the original controls and protocol views. The planner selects relevant scenes from the catalogue below. Shared presentation changes cover affected historical adapters and mobile views; new archives add initial, midpoint, final and overview scenes. Unaffected scenes are not applicable or explicitly reused, never claimed as freshly captured. When adding pages or major interactions, extend the [scene list](../scripts/validation.ts) and browser tests instead of continuing to review only old pages.

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

- `validation-results/tasks/<id>.json`: original/amended intent, derived route/version, command journal, evidence references and current structured handoff; excluded from source fingerprints.
- `validation-results/report.json`: task name, run ID, source fingerprint, automated result, screenshot paths/hashes, and final state.
- `validation-results/publication.json`: current delivery identity, policy, checks and merge result, written by task:publish after local review and commit.
- `validation-results/completion.json`: independently verified final integration or explicit exception; failures record an error and return nonzero. New validation removes both prior delivery records.
- `validation-results/tasks/<id>.json` also binds the accepted review hash and verified GitHub COMMENT URL, account, head, body digest and explicit non-independent provenance. Published delivery requires this current record; local-only remains offline.
- `validation-results/review.json`: reviewer, per-image findings, behavior conclusions, and requirement/full-diff review, initially pending.
- `playwright-report/index.html`: test details and attachments, opened with `pnpm exec playwright show-report`.
- `test-results/`: screenshots, exported histories, and failure traces; browser summary in `browser-validation.json`.

These local generated directories and the optional legacy model `experiment-results/` directory are ignored by Git. Only that legacy output is excluded from source fingerprints. Numbered offline records under `experiment/exN/` are tracked and fingerprinted; the harness checks their data, reports, charts, hashes and browser evidence. New validation replaces current task/diff evidence and retains valid dependency-scoped receipts. Archive the report, review, and browser attachments together if long-term retention is needed. Plans record readable conclusions and the environment instead of linking uncommitted temporary images. Plan edits require a current impact plan and renewed diff review; unchanged world/browser checks can be reused.

The whole-task review fingerprint includes untracked files, documentation, tests, configuration, and the lockfile. It excludes dependencies, build outputs, evidence directories, system caches, and private `.env*` files; `.env.example` is included. Source symlinks are currently rejected. The current page does not depend on private environment variables; future use requires an explicit environment validation strategy.

The gate rejects failed/interrupted runs, missing or duplicate screenshots, missing/failed reviews, mismatched tasks/run IDs, and changed source or screenshots. It enforces the repository completion command and agent workflow, but cannot prove that a reviewer actually looked or prevent bypassing the workflow to commit directly. Never fabricate reviews.

### Dependency and trust boundaries

World receipts bind the complete selected archive, relevant runtime sources, validators, lockfile/manifests and actual Node/platform/architecture. Browser receipts additionally bind selected scenarios, viewer assets, browser tests/configuration and oracle inputs. Tooling or documentation changes do not rewrite frozen runtime snapshots. The global task fingerprint still prevents accepting a stale diff review.

`validation-results/cache/` contains authenticated result receipts; `validation-results/evidence/` retains immutable selected screenshots across Playwright cleanup. `validation-results/receipt-key` is private, ignored and excluded from CI uploads. Local key access is the trust boundary, not protection against malicious repository code execution. CI starts fresh and independently executes its selected checks; it may reuse its own results within that workflow. Missing, corrupt, failed, foreign or mismatched receipts cause recomputation or block completion. Acceptance evidence never consists of a caller-supplied PASS.

## Environment and failure handling

Install the specified Node, pnpm, and Chromium using the [development workflow](DEVELOPMENT.md). Port 4173 is a dedicated test server that stops after testing; development on port 5173 is separate. For manual reproduction, run `pnpm build && pnpm preview`, then stop preview before validation to release the port.

Fix every selected automated, visual, or behavior failure and rerun the affected workflow. Resolve browser installation, port, or environment problems before continuing. If a blocker cannot be resolved, report incomplete work instead of claiming success. Do not skip selected tests, weaken assertions, or substitute unbound old screenshots.

CI runs the same automated validation on the [canonical repository](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions) and produces pending review. Each run uploads available reports, screenshots, and traces with 14-day retention, including failed runs. Download the complete artifact to preserve the report's relative evidence paths. There is no remote visual or semantic review service. GitHub protection is configured and verified separately under the [PR contract](PULL_REQUESTS.md#github-checks-and-merge-restrictions). The task executor performs actual visual and behavior review and references the plan and findings in the PR.

## Learning protocol evidence

Version-4 [learning experiments](SKILL_LEARNING_EXPERIMENT.md) require complete recorded call/input/output correspondence, bounded attempts, the exact round barrier, persisted executable registry and resource-backed survival reconstruction. Development is a task handoff before validation, not approval to bypass it. Tests include exact starvation timing, one-to-four-round learning, functional/same-batch reuse, generated execution, food/toxicity, tool costs/wear, reachable food, private observations, plan interruption and paused resumption. Every completed run receives the existing retained per-agent analysis and full screenshot/semantic review. The all-wait control is explicitly offline and is not a causal estimate.

## Heterogeneous evolution evidence

Version5 adds `evolution-browser` and `evolution-mobile` to current screenshot review. Its archive reconstructs every retained ordinary/world input and proposal, persistent finite allocations, registry and body transitions. Tests cover zero-stock persistence, generic new resource execution, nutritional conservation, unknown-property isolation, map reachability, safe batching and development resume. The short smoke is explicitly offline and never substitutes for real-model evidence. Scientific failures remain recorded outcomes; archive validity does not assert survival success.

## Coevolution evidence

Version6 adds `coevolution-browser` and `coevolution-mobile`: inspect energy/load, project text, persistent object markers, shared effects, and historical read-only behavior. [Protocol evidence](COEVOLUTION_EXPERIMENT.md#harness-evidence-and-review) includes deterministic feasibility, generated effects, finite resource coexistence, input-before-output processing, individual mastery, actual shared recovery, attempt budgets and replay/checkpoint correspondence. Archive validity may accept an explicitly budget-paused observation; never describe that as180 completed rounds. No fixture is real-model evidence, and no stage report becomes actor guidance.

## Forest extension evidence

The 25 explicitly labeled forest-lab scenes are mandatory entries in `REVIEW_SCENES`, not optional attachments. They cover cave exterior/interior and collision overlays, paid building geometry, attention, food examination/sampling, event-grounded experience, respawn and the third death, requested shelter construction/refuge/expiry/maintenance, requested exercise/progress/relief/cancellation and reachable/moved/blocked/unknown route evidence. With eight numbered archives, the current gate requires 80 screenshots. Inspect every current image, especially doorway alignment, roof visibility, life counters and overlapping event labels. These authored fixtures do not establish autonomous adoption. Forest regressions include conserved inventory identities, persistent world and mastery, important memory, invalid ex7 event aliases, stale action references, locally alterable seasonal growth and the complete current-conversation development/reuse chain. Formal forest runs retain the existing full archive, call, source and behavioral analysis requirements and an explicit round-200 technical checkpoint.
