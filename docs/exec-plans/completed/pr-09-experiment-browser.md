# PR-09: Experiment Browser and Persistent Local Toolchain

## Requirement summary

The user cannot run `pnpm` in zsh and wants one web page with a dropdown that opens each experiment's interactive history. Extend the existing local World Observatory and preserve the completed ex1 archive and the prior experiment harness work.

## Requirements

- R1: Make the pinned pnpm command available in ordinary local zsh sessions, with the supported Node runtime, and verify the actual viewer startup command.
- R2: List retained completed experiments in a labeled dropdown and load the selected replay without manual file import. Support direct experiment URLs, refresh, and browser navigation.
- R3: Keep archived history read-only while supporting seeking, playback, agent inspection, vision, and export. Preserve the current history on load failure and prevent stale asynchronous loads from replacing a newer selection.
- R4: Include validated experiment data in the static viewer build and local development server without coupling application source to simulator or filesystem APIs. Future numbered experiments must appear after rebuilding or restarting the viewer; do not create ex2 for this task.
- R5: Update usage, architecture, feature records, and harness visual coverage; run the complete test suite, inspect every current screenshot, review all changes, and pass the completion gate.

## Scope and exclusions

Scope includes local toolchain repair, an experiment selector in the existing viewer, build-time archive publication, URL navigation and failure handling, browser tests, and relevant documentation. Preserve all pre-existing PR-08 changes. Do not change core rules, replay format, experiment results, model integration, or credentials. No hosting service, publication, database, new experiment, commit, or remote PR is requested.

## Acceptance criteria

- A fresh zsh can run `pnpm --version` and `pnpm exec node --version` with the pinned versions; `pnpm dev` serves a working local page and experiment data.
- ex1 loads directly from the dropdown and `?experiment=ex1`; refresh and back/forward resolve the correct history. All 481 frames remain available and exported data equals the archived replay.
- Selection, playback, vision and historical inspection work on desktop and mobile. Archived actions stay disabled, including at the latest frame. Demo and file import remain usable.
- Missing or invalid data and overlapping requests do not corrupt the active history. An empty archive leaves the demo usable. A later valid numbered record is discoverable without hard-coded IDs.
- Build publication includes only validated, completed archive data; the archived files remain byte-identical. Full validation includes the new page scenes and existing ex1 scenes.

## Steps

1. Inspect existing state and toolchain, then install persistent local launchers without replacing the system Node.
2. Publish a static experiment catalogue and replays during dev/build; implement selector and URL navigation.
3. Add meaningful archive-publication and browser regression checks, including desktop/mobile screenshots.
4. Synchronize documents, run full validation, review actual evidence and diff, archive this plan, and repeat final validation after documentation edits.

## Results and evidence

The initial shell had Node 25.2.1 but no pnpm; the prior pinned toolchain lived under `/tmp/sew-pr00-toolchain`, outside the user's PATH. Installed persistent copies under `~/.local/share/self-evolving-world/toolchain/` and added previously absent `pnpm`/`pnpx` launchers in `/opt/homebrew/bin`. The launchers select Node 24.22.2 for their child processes while preserving the system Node and existing shell configuration. No temporary PATH export is required.

Actual checks on macOS arm64:

- Fresh `zsh -lic` resolves `/opt/homebrew/bin/pnpm`; `pnpm --version` returns `10.34.9`, and `pnpm exec node --version` returns `v24.22.2`.
- `pnpm dev` starts the viewer at `http://127.0.0.1:5173/`; the page and `/experiments/index.json` return HTTP 200. A real Chromium session on the development URL loads `?experiment=ex1` and displays `480 / 480`. Opened that URL in the local browser.
- `pnpm validate -- "PR-09 experiment browser and persistent pnpm"` passed in run `1afbdb3b-8a4f-4923-91bd-d8827fc6c1ea`: 168 unit tests in 13 files, 12 browser tests, 40 modules / 86 dependencies checked, types/lint/format/build/CLI/experiment/docs checks passed.
- Individually inspected all 11 current screenshots: seven standard scenes including the new desktop/mobile archive views, plus ex1 initial/midpoint/final/chart. Readonly status, positions, inventories, vision, timeline and layout agree with behavior assertions. Importing a replay remains a local editable session; selecting its archive remains read-only.
- Completed the actual visual/behavior/requirement review; `pnpm task:finish -- "PR-09 experiment browser and persistent pnpm"` passed for that run. Final documentation archival is followed by another complete validation/review/gate cycle; the latest run lives in ignored `validation-results/`.
- ex1 retains 480 actions, 481 reconstructed states, six ground items, zero invariant failures and zero model calls. The original artifacts pass reconstruction and SHA-256 checks. No ex2 directory was created; switching tests use intercepted HTTP fixtures only.

The first full check exposed the dependency checker's missing package-exports resolution for Vite. Enabled standard `exportsFields` / `conditionNames`, retaining every forbidden dependency rule. Also corrected the feature-table row placement and changed generic action-log copy to cover recorded random actions. No unresolved findings remain.

## Requirement and changed-file review

The combined worktree includes the previously completed [PR-08](pr-08-random-experiment-harness.md), which remains uncommitted. Its original numbered requirements and path matrix still apply. This task preserves that work and extends the same local viewer; it does not republish its experiment or claim new remote CI results.

| Requirement              | Reviewed files or environment                                                                                                                                                                                                                                                                                 | Implementation and evidence                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1                       | Local persistent toolchain and `/opt/homebrew/bin/pnpm`, `/opt/homebrew/bin/pnpx`; `README.md`, `docs/DEVELOPMENT.md`                                                                                                                                                                                         | Commands work in fresh zsh; real dev startup, HTTP assets and Chromium navigation succeeded. Setup guidance explains PATH and pinned engines.                                                                                                                       |
| R2, R3                   | `apps/viewer/src/experiments.ts`, `apps/viewer/src/main.ts`, `apps/viewer/index.html`, `apps/viewer/src/style.css`                                                                                                                                                                                            | Generic dropdown, validated catalogue/replay fetch, URL/back/forward navigation, local-session exits, read-only archive controls and stale-request protection. Desktop/mobile screenshots and browser assertions passed.                                            |
| R2, R3, R4               | `apps/viewer/test/experiments.test.ts`, `apps/viewer/e2e/experiment-browser.spec.ts`                                                                                                                                                                                                                          | Numbered metadata validation, empty/invalid archive, unknown IDs, refresh/navigation, play/export equality, vision, invalid input preservation and stale loads. A second run exists only in HTTP fixtures; future actual ex2 entries do not duplicate that fixture. |
| R4                       | `scripts/experiment-assets.ts`, `apps/viewer/vite.config.ts`, `scripts/experiments.test.ts`, `dependency-cruiser.config.cjs`                                                                                                                                                                                  | Validated completed records become static catalogue/replay/chart assets; failed/running captures are omitted, corrupted completed records fail. Dev and static builds serve the same data. Package exports resolution keeps architecture rules intact.              |
| R5                       | `apps/viewer/e2e/validators.ts`, `scripts/validation.ts`, `scripts/validation.test.ts`, `docs/VALIDATION.md`                                                                                                                                                                                                  | Archive layout checks and two additional mandatory scenes; missing latest scene still fails the gate. Complete unfiltered checks and individual visual/behavior review passed.                                                                                      |
| R5                       | `ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`, `docs/PRODUCT.md`, `experiment/README.md`, `docs/decisions/0009-static-experiment-browser.md`, `docs/decisions/README.md`, `docs/exec-plans/README.md`, this plan                                                                                              | Document public-data build boundary, usage, snapshot refresh limits, current acceptance and actual evidence.                                                                                                                                                        |
| R5 / preserved PR-08     | `.github/workflows/ci.yml`, `.prettierignore`, `AGENTS.md`, `agent.md`, `package.json`, `docs/DOCUMENTATION_POLICY.md`, `scripts/documentation.ts`, `scripts/validate.ts`                                                                                                                                     | Retain complete-history CI fetch, canonical artifact formatting, experiment workflow/navigation, required archive documentation, full check integration and mixed-route validation. No skipped gates.                                                               |
| R5 / preserved PR-08     | `apps/simulator/src/random-run.ts`, `apps/simulator/test/random-run.test.ts`, `scripts/experiment-analysis.ts`, `scripts/experiment-cli.ts`, `scripts/experiments.ts`, `scripts/harness.ts`, `scripts/harness.test.ts`, `apps/viewer/e2e/experiments.spec.ts`                                                 | Preserve seeded offline runner, invariant/report checks, exclusive numbering/resume, artifact verification, routing and retained replay browser checks; all pass in the current full suite.                                                                         |
| R5 / preserved PR-08     | `docs/decisions/0008-numbered-experiments-and-task-routing.md`, `docs/exec-plans/completed/pr-08-random-experiment-harness.md`                                                                                                                                                                                | Preserve original design rationale, requirements, actual experiment results and capture failure/resume provenance.                                                                                                                                                  |
| R4, R5 / preserved PR-08 | `experiment/ex1/manifest.json`, `experiment/ex1/replay.json`, `experiment/ex1/results.json`, `experiment/ex1/report.md`, `experiment/ex1/browser.json`, `experiment/ex1/overview.svg`, `experiment/ex1/overview.png`, `experiment/ex1/initial.png`, `experiment/ex1/midpoint.png`, `experiment/ex1/final.png` | Preserve the original archive and its completed evidence. Current validation reconstructs data, verifies hashes, decodes saved images, checks replay behavior and captures fresh review scenes without rewriting retained files.                                    |

Reviewer: Codex. Reviewed the changed-file inventory, implementation, failure behavior, documentation and preserved PR-08 scope. All R1-R5 requirements have implementation and passing local evidence; no unrelated changes, core-rule changes, credential changes, live model calls or new experiment were introduced.

## Unexecuted checks and limitations

No required local checks remain unresolved. No commit, push, PR, remote CI check or publication was requested or performed. The static build contains the archive as of build time; restart development or rebuild after a new experiment. Direct links restore the full history at its latest frame, not the previously selected frame. Local sessions still require JSON export before refresh. The local pnpm repair is machine-specific; a clean checkout still follows the documented pinned-toolchain setup.

## Follow-up suggestions

Keep individual experiment reports and replay data in `experiment/exN`; add future runs through the existing experiment workflow.
