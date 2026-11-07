# Development Workflow

## Environment and commands

Use the Node version in [.node-version](../.node-version) and pnpm version in [packageManager](../package.json). Install Chromium with `pnpm exec playwright install chromium` before running browser checks. See the [quick start](../README.md#five-minute-quick-start) for setup and commands. Pin exact dependencies, commit workspace manifests and `pnpm-lock.yaml`, and use `pnpm install --frozen-lockfile` in CI.

Root dependencies provide development tools; runtime packages declare their own dependencies. Use `workspace:*` across packages. Create packages when needed instead of adding empty future modules. Do not commit `dist/`. Only installation scripts permitted by the [workspace configuration](../pnpm-workspace.yaml) may run; document any additions.

Follow the [language policy](../AGENTS.md#language-policy): user conversations are in Chinese, while all repository content and validation records are in English.

## A PR from start to completion

1. Inspect existing changes and read [PRODUCT](PRODUCT.md), [ARCHITECTURE](../ARCHITECTURE.md), and relevant ADRs.
2. Define the objective, scope, and acceptance criteria. Create a plan in [active](exec-plans/active/README.md) for substantial work.
3. Implement the smallest complete behavior. Keep transitions pure and I/O at boundaries.
4. Test meaningful behavior and failure paths. Do not add tests that merely mirror simple copy edits.
5. Update feature records, architecture, ADRs, and plans according to the [synchronization policy](DOCUMENTATION_POLICY.md).
6. Follow the [validation workflow](VALIDATION.md): run `pnpm validate -- "task name"`, including the full `pnpm check`; inspect every current screenshot and behavior result; fix problems and rerun. Also run `pnpm demo` when CLI or package exports change.
7. Record actual evidence and limitations in the [PR template](../.github/pull_request_template.md) and plan. Finish documentation, rerun validation after edits, review the new evidence, and complete only after `pnpm task:finish -- "task name"` succeeds. Archive completed plans; archival changes require a final validation run too.

## Debugging failures

`pnpm check` runs typecheck → lint → format → architecture → test → build → demo:check → test:e2e → docs, stopping at the first failure. After fixing a failure, run its individual check as needed, then rerun the full workflow. `pnpm format` fixes formatting only. `pnpm demo:check` compares complete built CLI output from two independent processes in different timezones.

If engine checks fail, switch to the specified Node and pnpm versions instead of disabling `engine-strict`. If frozen installation reports a lockfile mismatch, confirm the manifest change, update the lockfile with `pnpm install`, and review the difference. Do not disable rules or delete tests to make CI pass.

Tests resolve source aliases without requiring an existing build. The core and viewer also have independent host-type checks; production builds resolve real package exports. To test installation, copy repository source into a temporary directory without `node_modules` or `dist`, then run frozen install, check, and demo. Record the OS and tool versions; local results do not prove GitHub Actions passed.

## Version control and CI

The canonical repository is [YuxiangLiu-lyx/self_evolving_world](https://github.com/YuxiangLiu-lyx/self_evolving_world). Use `origin` for `https://github.com/YuxiangLiu-lyx/self_evolving_world.git` and `main` as the integration branch. The initial import establishes the baseline; subsequent work should use focused feature branches and pull requests targeting `main`.

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/describe-the-change
# Implement and complete the local validation and review workflow.
git add <reviewed-files>
git commit -m "Describe the completed change"
git push -u origin HEAD
```

Open a PR against `main` using the repository's [PR template](../.github/pull_request_template.md). Inspect the `quality` check for the pushed commit and resolve failures before merging. Keep commits and PR content in English. Do not force-push shared history or commit dependencies, build outputs, local credentials, or generated validation directories.

[GitHub Actions](../.github/workflows/ci.yml) runs frozen install and `pnpm validate` on pushes, pull requests, and manual dispatch. This invokes the complete `pnpm check`, including the built CLI and Chromium. CI installs Chromium and its system dependencies. Actions use verified full commit SHAs. Toolchain upgrades must synchronize versions, lockfile, relevant ADR impacts, and validation.

Available HTML reports, screenshots, traces, and validation records are uploaded even when validation fails, under `validation-<commit SHA>-<run attempt>` with 14-day retention. Download them from the [Actions run](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions), extract the archive, and open its HTML report with Playwright. Failures before browser execution may have no screenshots. CI records automated success as pending review; it never fabricates visual approval. The task executor still performs the local visual/behavior review and completion gate.

Branch protection is an independent repository setting, not established by these files. A repository administrator can make the `quality` job required and choose review requirements. This integration does not enable branch protection, create releases, or publish packages.

## Viewer development and browser tests

`pnpm dev` builds the core before starting Vite. Browser source changes reload automatically; restart after changing the core. `pnpm build && pnpm test:e2e` starts a dedicated preview on port 4173 to test built output. Resolve port conflicts instead of reusing an unknown server. Tests work locally on macOS; Linux setup uses `pnpm exec playwright install --with-deps chromium`.

Browser tests cover move/pickup/try, boundaries and occupancy, vision updates, unchanged replay exports, import/export round trips, invalid imports, empty worlds, and 390px layout. Every test monitors runtime and resource failures. The layout validator is also tested against injected horizontal overflow. Screenshots and failure traces are in ignored `test-results/`; the HTML report is in `playwright-report/`; review and completion records are in `validation-results/`. Replay tests live in `apps/viewer/test/`, core semantics in `packages/world-core/test/`, and gate tests in `scripts/validation.test.ts`.

Base world behavior stays in `world.ts`. Rule changes require explicit versioning, replay compatibility decisions, ADR updates, and tests. Never connect `try` directly to arbitrary code execution.
