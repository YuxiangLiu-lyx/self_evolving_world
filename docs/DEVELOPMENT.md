# Development Workflow

## Environment and commands

Use the Node version in [.node-version](../.node-version) and pnpm version in [packageManager](../package.json). Install Chromium with `pnpm exec playwright install chromium` before running browser checks. See the [quick start](../README.md#five-minute-quick-start) for setup and commands. Pin exact dependencies, commit workspace manifests and `pnpm-lock.yaml`, and use `pnpm install --frozen-lockfile` in CI.

Root dependencies provide development tools; runtime packages declare their own dependencies. Use `workspace:*` across packages. Create packages when needed instead of adding empty future modules. Do not commit `dist/`. Only installation scripts permitted by the [workspace configuration](../pnpm-workspace.yaml) may run; document any additions.

Follow the [language policy](../AGENTS.md#language-policy): user conversations are in Chinese, while all repository content and validation records are in English.

## A PR from start to completion

Use the [unified task entry](TASK_HARNESS.md) for preparation, deterministic execution and continuation. The coordinator owns step ordering and branch conditions; this document retains environment and development constraints. Read the current project documents and record numbered requirements before implementation. Review every changed file and every current screenshot against the plan. Complete documentation before final validation; moving a plan also invalidates evidence.

The program calls the existing full validation, review, reviewed commit, PR preflight, publication and final gates. Every route requires PR delivery by default. Merge requires its own actual instruction evidence; explicit no-PR/no-merge exceptions retain the [delivery contract](PULL_REQUESTS.md#automatic-pr-delivery-for-every-task). A local-only exception preserves the existing reviewed dirty-worktree path. Record outcomes honestly; failed checks and unresolved remote states remain incomplete.

## Offline world experiments and task harness

Follow the [numbered experiment workflow](../experiment/README.md) for `pnpm experiment:run` and `pnpm experiment:check`. The run command allocates the next `experiment/exN`, uses an explicit seed without model calls, and records objectives, results, replay and actual browser visualizations. Inspect an existing run without creating another number by importing its replay or checking its artifacts.

`pnpm harness` is an alias of the unified coordinator; the old task-name form continues an existing task. Standalone `pnpm validate` only produces automated evidence. It [classifies actual changes](VALIDATION.md#task-harness-routing) as code, experiment-only or mixed, and records the chosen route. Experiment-only and mixed work validates the archive before running full regression/browser checks. Code work runs the full suite, including any archived experiments. Every PR still needs an execution plan, full unfiltered tests, current visual/behavior review, requirement mapping and `task:finish`. Retained experiment files are tracked and source-fingerprinted; temporary validation output remains ignored.

## Optional model experiment

Follow [One-Round Experiment](ONE_ROUND_EXPERIMENT.md) for `pnpm experiment:login` and `pnpm experiment:once`. These commands are explicit local operations and are excluded from `pnpm check`, demo determinism checks, and CI. Unit tests substitute network transports; they cannot prove live account entitlement or model decision quality. The separately authorized [survival experiment](SURVIVAL_EXPERIMENT.md) uses `pnpm experiment:survival` for a fresh exN with 60 rounds and five attempted calls per actor maximum. It persists attempts before inference and validates saved programs without replaying network calls. Record real request counts and failed rounds separately, and do not repeat inference automatically to obtain a passing result.

## Debugging failures

`pnpm check` runs typecheck → lint → format → architecture → test → build → demo:check → experiment:check → analysis:check → test:e2e → docs, stopping at the first failure. After fixing a failure, run its individual check as needed, then rerun the full workflow. `pnpm format` fixes formatting only. `pnpm demo:check` compares complete built CLI output from two independent processes in different timezones.

If engine checks fail, switch to the specified Node and pnpm versions instead of disabling `engine-strict`. If frozen installation reports a lockfile mismatch, confirm the manifest change, update the lockfile with `pnpm install`, and review the difference. Do not disable rules or delete tests to make CI pass.

Tests resolve source aliases without requiring an existing build. The core and viewer also have independent host-type checks; production builds resolve real package exports. To test installation, copy repository source into a temporary directory without `node_modules` or `dist`, then run frozen install, check, and demo. Record the OS and tool versions; local results do not prove GitHub Actions passed.

## Version control and CI

The canonical repository is [YuxiangLiu-lyx/self_evolving_world](https://github.com/YuxiangLiu-lyx/self_evolving_world). Use `origin` for `https://github.com/YuxiangLiu-lyx/self_evolving_world.git` and `main` as the integration branch. The initial import establishes the baseline; subsequent work should use focused feature branches and pull requests targeting `main`.

Create a focused branch from current main after preserving existing changes, then start the unified task entry. Its review handoff precedes any commit; its PR-body handoff precedes publication. Legacy task commands route through the same coordinator and worker guards. Direct Git use is outside this command boundary; never use it to bypass actual review. Published delivery includes a version-bound GitHub COMMENT explicitly labeled current-conversation self-review, followed by independently verified delivery.

The publisher opens/updates a PR against `main` using the repository's [PR template](../.github/pull_request_template.md). Inspect both `quality` and `pr-policy` for the latest PR revision and resolve failures before merging. Every PR must run the complete test suite; failed, skipped, unavailable, or stale results cannot pass acceptance. Keep commits and PR content in English. Do not force-push shared history or commit dependencies, build outputs, local credentials, or generated validation directories.

[GitHub Actions](../.github/workflows/ci.yml) runs frozen install and `pnpm validate` on pushes, pull requests, and manual dispatch. This invokes the complete `pnpm check`, including the built CLI and Chromium. CI installs Chromium and its system dependencies. Actions use verified full commit SHAs. Toolchain upgrades must synchronize versions, lockfile, relevant ADR impacts, and validation.

Available HTML reports, screenshots, traces, and validation records are uploaded even when validation fails, under `validation-<commit SHA>-<run attempt>` with 14-day retention. Download them from the [Actions run](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions), extract the archive, and open its HTML report with Playwright. Failures before browser execution may have no screenshots. CI records automated success as pending review; it never fabricates visual approval. The task executor still performs the local visual/behavior review and completion gate.

The [PR contract](PULL_REQUESTS.md#github-checks-and-merge-restrictions) defines required GitHub protection and its rollout. Repository settings must require `quality` and `pr-policy`, an up-to-date branch, resolved conversations, and PR-based updates for administrators too. Configuration files alone do not establish remote enforcement; inspect the current settings and task-plan activation evidence. Merge only after the reviewed implementation and all current required checks pass; never bypass protection to finish implementation.

## Viewer development and browser tests

`pnpm dev` builds the core before starting Vite. Browser source changes reload automatically; restart after changing the core or completing a new experiment. The Vite configuration validates completed experiment records and serves their catalogue, replay and chart. `pnpm build` includes the same files in the static viewer output; rebuild to update that snapshot. Running/failed records are omitted so capture/resume builds remain possible, while full validation still rejects incomplete records. `pnpm build && pnpm test:e2e` starts a dedicated preview on port 4173 to test built output. Resolve port conflicts instead of reusing an unknown server. Tests work locally on macOS; Linux setup uses `pnpm exec playwright install --with-deps chromium`.

If the shell cannot find pnpm, follow the [quick-start troubleshooting](../README.md#five-minute-quick-start). Check `pnpm --version` and `pnpm exec node --version` in a fresh zsh session and verify `pnpm dev` serves both the page and `/experiments/index.json`; a toolchain available only under a temporary agent PATH is insufficient.

Browser tests cover move/pickup, legacy imported try records, synchronous rounds and successful collection, boundaries and occupancy, vision updates, unchanged replay exports, import/export round trips, invalid imports, empty worlds, and 390px layout. Every test monitors runtime and resource failures. The layout validator is also tested against injected horizontal overflow. Screenshots and failure traces are in ignored `test-results/`; the HTML report is in `playwright-report/`; review and completion records are in `validation-results/`. Replay tests live in `apps/viewer/test/`, core semantics in `packages/world-core/test/`, and gate tests in `scripts/validation.test.ts`.

Base world behavior stays in `world.ts`. Rule changes require explicit versioning, replay compatibility decisions, ADR updates, and tests. Never connect `try` directly to arbitrary code execution.
