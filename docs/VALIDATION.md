# Task Validation and Completion Gate

Every development task, including documentation-only changes, must follow this workflow. The executor may be a developer or Codex; no additional user approval is required. Fix failures and continue until validation succeeds before declaring completion. Feature status remains in [PRODUCT](PRODUCT.md). Write repository review records in English and communicate with the user in Chinese.

## Execution sequence

1. Finish implementation and documentation, resolve known problems, and choose a clear English task name.
2. Run `pnpm validate -- "task name"`. It reruns the complete `pnpm check`, builds the page, and opens `http://127.0.0.1:4173/` in real Chromium for layout/behavior checks and screenshots.
3. Open the current report with `pnpm exec playwright show-report` and inspect **every screenshot** listed in `validation-results/report.json`. Codex may use an image viewer to inspect the original artifacts. Checking file existence, reading the DOM, or repeating test names does not count as visual inspection.
4. Apply the criteria below and complete `validation-results/review.json`. Record the reviewer, each image's `verdict` and specific `notes`, the `behavior` result, and a `requirements` review of the complete diff against the task plan. Requirement notes identify requirement IDs, implementation/evidence, scope coverage, and resolved mismatches; follow [PULL_REQUESTS](PULL_REQUESTS.md). Use `pass` only after actual review, `fail` for problems, and `pending` for unreviewed evidence. Keep the generated `runId`.
5. If anything fails, fix it and restart at step 2. A new run invalidates the prior review. Source/documentation edits and missing or changed screenshots invalidate earlier evidence.
6. Run `pnpm task:review -- "same task name"`. The local gate requires exit code 0 and report status `passed`. It does not complete delivery.

7. Automatically commit reviewed files, prepare the complete requirement-mapped PR body, and run `pnpm task:publish -- validation-results/pr-body.md "Concrete PR title"`. All task routes use this step. The publisher verifies current checks and conflicts, merges the reviewed head, then calls `task:finish` to independently verify the merged PR and integration into main. Only then is the default task complete. Explicit no-PR or no-merge instructions require the current plan exception. Report the PR URL and actual delivery result; failures remain incomplete. See the [publication contract](PULL_REQUESTS.md#automatic-pr-delivery-for-every-task).

Automated success produces `awaiting-review` and never supplies visual judgments. `pnpm check`, `pnpm test:e2e`, or green CI alone cannot complete a task.

## Task harness routing

`pnpm harness -- "task name"` and `pnpm validate -- "task name"` use the same harness. The report records `route.kind`, all changed paths and affected experiment IDs. Classification compares `origin/main...HEAD` and includes staged/unstaged changes, deletions and untracked files. A missing baseline fails rather than guessing; CI fetches full history. Before checks, archive preservation rejects edits/deletions/additions within existing records unless the current plan documents explicit user-requested reuse. Every new experiment uses a fresh exN by default.

| Task type  | Classification                                                                | Workflow                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code       | Source, configuration or documentation changes; safe default for no changes   | Complete `pnpm check`, including archived experiments; current browser screenshots; visual, behavior and requirement review; completion gate        |
| Experiment | Only `experiment/exN/` records, optionally with numbered execution-plan files | Validate completed records first; full regression suite and saved replay import in Chromium; experiment and standard visual review; completion gate |
| Mixed      | Both numbered experiment records and code/documentation/configuration         | Validate experiment records, then the complete code workflow and all experiment browser scenes                                                      |

Creating an experiment is explicit: `pnpm experiment:run` generates the next `exN` with an objective, random configuration, results, report and real visual evidence. Its additional browser capture does not replace full validation. `pnpm experiment:check` verifies all records without creating another run. The capture environment variable is forbidden in full validation so it cannot restrict the suite. See the [archive contract](../experiment/README.md) and [ADR-0008](decisions/0008-numbered-experiments-and-task-routing.md).

Every saved run adds four required scenes: `exN-initial`, `exN-midpoint`, `exN-final`, and `exN-overview`. Inspect all of them alongside the nine standard scenes below. Review positions, ownership, event feedback, trajectories, counts and chart readability. The completion gate revalidates artifacts and requires fresh per-scene approval; expected action rejections do not imply execution failure.

## Visual review

The World Observatory is currently the only product page. Inspect the following nine full-page screenshots every run. When adding pages or major interactions, extend the [scene list](../scripts/validation.ts) and browser tests instead of continuing to review only old pages.

| Scene ID            | Required content                                        | Review focus                                                                                            |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| desktop             | Demo world at a 1440×1100 viewport                      | Complete map, inspector, timeline, events, and controls; sensible spacing and hierarchy                 |
| mobile              | New world at a 390×844 viewport                         | Natural vertical scrolling; no cramped, clipped, or horizontally overflowing content                    |
| agent-vision        | Lin's initial agent view                                | Clear observed/unobserved regions; hidden out-of-range agents; matching map and inspector               |
| after-actions       | Movement and pickup                                     | Correct position, ownership and collection feedback                                                     |
| history             | Replay paused at frame 3                                | Clear historical state, disabled action controls, matching map/inspector/event                          |
| experiment-browser  | Archived ex1 selected and paused midway on desktop      | Visible selector, objective, frame count, chart link and read-only feedback; matching positions         |
| experiment-mobile   | Direct ex1 URL on a 390px screen, Moss's initial vision | Selector and archive details wrap naturally; map, controls and inspector remain readable                |
| synchronous-browser | ex2 at collection round 2 on desktop                    | Three recognizable actors, collected items, round label, all round events and disabled archive controls |
| synchronous-mobile  | ex2 at collection round 2 at 390px                      | Readable illustrated map and event feedback with no horizontal overflow                                 |

Inspect blank pages, missing styles, obstruction, odd spacing, unreadable text, distinguishable colors, overlapping controls, and state feedback. Automated layout checks cover objective issues such as horizontal overflow, clipping, panel overlap, and missing controls or grid cells. **Basic aesthetics still require looking at the actual page.** There is no pixel baseline, and producing a screenshot is not visual acceptance.

## Behavior review

Review the browser assertions and key frames, compare states before and after actions, and use core and timeline tests to verify:

- A move travels exactly one cell. Boundary or occupancy rejection preserves position while recording a failed-action tick.
- Pickup transfers a same-cell item to exactly one inventory. The ground item, pickup button, and observations update together; other agents do not receive duplicates.
- Legacy imported skill attempts do not execute or unlock capabilities. Repeated tries remain unavailable; trying `move` does not implicitly move.
- Agent view excludes out-of-range entities and updates as agents move or items are collected.
- Playback, pause, and stepping do not create actions or rewrite history. Exports before and after replay must be identical. Local session actions require the latest state; archived experiment actions stay disabled at every frame.
- Experiment selection, direct links, refresh and back/forward load the correct archive. Invalid catalogue/replay data preserves the current history. Obsolete loads cannot replace a newer selection or local session. The demo remains usable with an empty archive. Fixture-only experiment IDs must never allocate real run directories.
- No browser exceptions, console errors, failed resources, or HTTP errors occur.

Add scenarios and expected outcomes for changed behavior. Import `test` from `apps/viewer/e2e/validators.ts` in new browser tests so runtime health checks remain automatic. Both local and CI unit/browser runs forbid `.only`; skipped, todo, expected-failure, or incomplete tests cannot pass task validation. Every PR runs the full unfiltered suite, including documentation-only changes. Screenshots wait for notifications to disappear naturally rather than injecting styles that conceal problems. Automation cannot judge model decision quality. The optional one-round CLI is tested with deterministic transports; live OAuth/inference results are recorded separately and never run by CI.

## Evidence and invalidation

- `validation-results/report.json`: task name, run ID, source fingerprint, automated result, screenshot paths/hashes, and final state.
- `validation-results/publication.json`: current delivery identity, policy, checks and merge result, written by task:publish after local review and commit.
- `validation-results/completion.json`: independently verified final integration or explicit exception; failures record an error and return nonzero. New validation removes both prior delivery records.
- `validation-results/review.json`: reviewer, per-image findings, behavior conclusions, and requirement/full-diff review, initially pending.
- `playwright-report/index.html`: test details and attachments, opened with `pnpm exec playwright show-report`.
- `test-results/`: screenshots, exported histories, and failure traces; browser summary in `browser-validation.json`.

These local generated directories and the optional legacy model `experiment-results/` directory are ignored by Git. Only that legacy output is excluded from source fingerprints. Numbered offline records under `experiment/exN/` are tracked and fingerprinted; the harness checks their data, reports, charts, hashes and browser evidence. New validation replaces current evidence. Archive the report, review, and browser attachments together if long-term retention is needed. Plans record readable conclusions and the environment instead of linking uncommitted temporary images. Plan edits also require revalidation; finalize documentation before the last run.

The source fingerprint includes untracked files, documentation, tests, configuration, and the lockfile. It excludes dependencies, build outputs, evidence directories, system caches, and private `.env*` files; `.env.example` is included. Source symlinks are currently rejected. The current page does not depend on private environment variables; future use requires an explicit environment validation strategy.

The gate rejects failed/interrupted runs, missing or duplicate screenshots, missing/failed reviews, mismatched tasks/run IDs, and changed source or screenshots. It enforces the repository completion command and agent workflow, but cannot prove that a reviewer actually looked or prevent bypassing the workflow to commit directly. Never fabricate reviews.

## Environment and failure handling

Install the specified Node, pnpm, and Chromium using the [development workflow](DEVELOPMENT.md). Port 4173 is a dedicated test server that stops after testing; development on port 5173 is separate. For manual reproduction, run `pnpm build && pnpm preview`, then stop preview before validation to release the port.

Fix every automated, visual, or behavior failure and rerun the full workflow. Resolve browser installation, port, or environment problems before continuing. If a blocker cannot be resolved, report incomplete work instead of claiming success. Do not skip tests, weaken assertions, or use old screenshots to complete a task.

CI runs the same automated validation on the [canonical repository](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions) and produces pending review. Each run uploads available reports, screenshots, and traces with 14-day retention, including failed runs. Download the complete artifact to preserve the report's relative evidence paths. There is no remote visual or semantic review service. GitHub protection is configured and verified separately under the [PR contract](PULL_REQUESTS.md#github-checks-and-merge-restrictions). The task executor performs actual visual and behavior review and references the plan and findings in the PR.
