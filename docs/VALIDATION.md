# Task Validation and Completion Gate

Every development task, including documentation-only changes, must follow this workflow. The executor may be a developer or Codex; no additional user approval is required. Fix failures and continue until validation succeeds before declaring completion. Feature status remains in [PRODUCT](PRODUCT.md). Write repository review records in English and communicate with the user in Chinese.

## Execution sequence

1. Finish implementation and documentation, resolve known problems, and choose a clear English task name.
2. Run `pnpm validate -- "task name"`. It reruns the complete `pnpm check`, builds the page, and opens `http://127.0.0.1:4173/` in real Chromium for layout/behavior checks and screenshots.
3. Open the current report with `pnpm exec playwright show-report` and inspect **every screenshot** listed in `validation-results/report.json`. Codex may use an image viewer to inspect the original artifacts. Checking file existence, reading the DOM, or repeating test names does not count as visual inspection.
4. Apply the criteria below and complete `validation-results/review.json`. Record the reviewer, each image's `verdict` and specific `notes`, and the `behavior` result. Use `pass` only after actual review, `fail` for problems, and `pending` for unreviewed evidence. Keep the generated `runId`.
5. If anything fails, fix it and restart at step 2. A new run invalidates the prior review. Source/documentation edits and missing or changed screenshots invalidate earlier evidence.
6. Run `pnpm task:finish -- "same task name"`. Complete only after exit code 0 and report status `passed`. The final response must state actual results and evidence locations.

Automated success produces `awaiting-review` and never supplies visual judgments. `pnpm check`, `pnpm test:e2e`, or green CI alone cannot complete a task.

## Visual review

The World Observatory is currently the only product page. Inspect the following five full-page screenshots every run. When adding pages or major interactions, extend the [scene list](../scripts/validation.ts) and browser tests instead of continuing to review only old pages.

| Scene ID      | Required content                     | Review focus                                                                              |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| desktop       | Demo world at a 1440×1100 viewport   | Complete map, inspector, timeline, events, and controls; sensible spacing and hierarchy   |
| mobile        | New world at a 390×844 viewport      | Natural vertical scrolling; no cramped, clipped, or horizontally overflowing content      |
| agent-vision  | Lin's initial agent view             | Clear observed/unobserved regions; hidden out-of-range agents; matching map and inspector |
| after-actions | Movement, pickup, and repeated tries | Correct position and ownership; clear unavailable results without implying execution      |
| history       | Replay paused at frame 3             | Clear historical state, disabled action controls, matching map/inspector/event            |

Inspect blank pages, missing styles, obstruction, odd spacing, unreadable text, distinguishable colors, overlapping controls, and state feedback. Automated layout checks cover objective issues such as horizontal overflow, clipping, panel overlap, and missing controls or grid cells. **Basic aesthetics still require looking at the actual page.** There is no pixel baseline, and producing a screenshot is not visual acceptance.

## Behavior review

Review the browser assertions and key frames, compare states before and after actions, and use core and timeline tests to verify:

- A move travels exactly one cell. Boundary or occupancy rejection preserves position while recording a failed-action tick.
- Pickup transfers a same-cell item to exactly one inventory. The ground item, pickup button, and observations update together; other agents do not receive duplicates.
- Unknown skill attempts do not execute or unlock capabilities. Repeated tries remain unavailable; trying `move` does not implicitly move.
- Agent view excludes out-of-range entities and updates as agents move or items are collected.
- Playback, pause, and stepping do not create actions or rewrite history. Exports before and after replay must be identical. Historical controls are disabled; only the latest state can accept actions.
- No browser exceptions, console errors, failed resources, or HTTP errors occur.

Add scenarios and expected outcomes for changed behavior. Import `test` from `apps/viewer/e2e/validators.ts` in new browser tests so runtime health checks remain automatic. Both local and CI runs forbid `.only`; skipped or expected-failure tests cannot pass task validation. Screenshots wait for notifications to disappear naturally rather than injecting styles that conceal problems. Automation cannot judge unmodeled autonomous decisions; current agents only follow scripts and manual controls.

## Evidence and invalidation

- `validation-results/report.json`: task name, run ID, source fingerprint, automated result, screenshot paths/hashes, and final state.
- `validation-results/review.json`: reviewer, per-image findings, and behavior conclusions, initially pending.
- `playwright-report/index.html`: test details and attachments, opened with `pnpm exec playwright show-report`.
- `test-results/`: screenshots, exported histories, and failure traces; browser summary in `browser-validation.json`.

These local generated directories are ignored by Git. New validation replaces current evidence. Archive the report, review, and browser attachments together if long-term retention is needed. Plans record readable conclusions and the environment instead of linking uncommitted temporary images. Plan edits also require revalidation; finalize documentation before the last run.

The source fingerprint includes untracked files, documentation, tests, configuration, and the lockfile. It excludes dependencies, build outputs, evidence directories, system caches, and private `.env*` files; `.env.example` is included. Source symlinks are currently rejected. The current page does not depend on private environment variables; future use requires an explicit environment validation strategy.

The gate rejects failed/interrupted runs, missing or duplicate screenshots, missing/failed reviews, mismatched tasks/run IDs, and changed source or screenshots. It enforces the repository completion command and agent workflow, but cannot prove that a reviewer actually looked or prevent bypassing the workflow to commit directly. Never fabricate reviews.

## Environment and failure handling

Install the specified Node, pnpm, and Chromium using the [development workflow](DEVELOPMENT.md). Port 4173 is a dedicated test server that stops after testing; development on port 5173 is separate. For manual reproduction, run `pnpm build && pnpm preview`, then stop preview before validation to release the port.

Fix every automated, visual, or behavior failure and rerun the full workflow. Resolve browser installation, port, or environment problems before continuing. If a blocker cannot be resolved, report incomplete work instead of claiming success. Do not skip tests, weaken assertions, or use old screenshots to complete a task.

CI runs the same automated validation on the [canonical repository](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions) and produces pending review. Each run uploads available reports, screenshots, and traces with 14-day retention, including failed runs. Download the complete artifact to preserve the report's relative evidence paths. There is no remote visual review service or automatic branch protection setup. The task executor performs actual visual and behavior review and references the plan and findings in the PR.
