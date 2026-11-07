# Self-Evolving World

[![CI](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml)

A TypeScript project exploring autonomous AI agents and controlled world evolution. The current foundation includes a bounded grid, agents, items, movement, pickup, unsupported skill attempts, automatic vision, visualization, and history replay. Browser validation and a task completion gate are part of the development workflow.

Current behavior comes from manual controls or scripted demos. Autonomous AI decisions and skill evolution are not implemented. [PRODUCT](docs/PRODUCT.md) is the single source of feature status.

## Design goals

- **Human legibility:** clear explanations, responsibilities, diagrams, decisions, and acceptance evidence.
- **Agent legibility:** a short [AGENTS.md](AGENTS.md) that points to task-specific context.
- **Enforceable architecture:** strict TypeScript, linting, dependency rules, tests, and CI.
- **Incremental development:** focused PRs that keep behavior, evidence, and documentation aligned.

Repository content is written in English; conversations with the user are in Chinese. See the [language policy](AGENTS.md#language-policy).

The [World Foundation](docs/WORLD_FOUNDATION.md) is the fixed reference for starting items, base skills, and environment settings. Evolution must preserve this foundation and record extensions separately.

## Five-minute quick start

Use Node.js **24.22.2** from [.node-version](.node-version) and pnpm **10.34.9**. Switch through your Node version manager or use the [official release download](https://nodejs.org/dist/v24.22.2/) if needed.

```bash
git clone https://github.com/YuxiangLiu-lyx/self_evolving_world.git
cd self_evolving_world
node --version
npm install --global pnpm@10.34.9
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed in the terminal, normally `http://127.0.0.1:5173`. No API key or external service is required.

- The default demo has 3 agents, 6 initial items, and 12 scripted actions. Select **Play** to replay it or continue manually.
- Select an agent on the map or in the dropdown. Switch between **Global view** and **Agent vision**.
- Use arrow buttons or WASD to move one cell. Pick up an item when standing on its cell.
- Try a skill such as `fly`. The request is recorded as unavailable; it is neither executed nor unlocked.
- Play, pause, change speed, step through frames, or seek on the timeline. Historical frames cannot receive actions; return to **Latest frame** to continue.
- History lives in page memory. Export JSON before refreshing or starting a new world; import it to replay later.

All base rules live in [world.ts](packages/world-core/src/world.ts). Defaults are a 16×12 world and a vision radius of 4. Configure an initial world with `createWorld(setup)` or edit the viewer's [demo setup](apps/viewer/src/scenario.ts). Settings are fixed after initialization.

## Validation and commands

Install the test browser before the first full check. Linux CI also installs system dependencies using `--with-deps`.

```bash
pnpm exec playwright install chromium
pnpm check
```

Before completing each task, run `pnpm validate -- "task name"`. It opens the current build in Chromium and captures evidence. Inspect all five screenshots and behavior results, complete `validation-results/review.json`, and run `pnpm task:finish -- "same task name"`. Complete the task only when this gate succeeds. See the [validation workflow](docs/VALIDATION.md).

| Command                             | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                          | Build the core and start the viewer; restart after core changes         |
| `pnpm build`                        | Build the core, CLI, and static viewer                                  |
| `pnpm preview`                      | Serve the built viewer on port 4173                                     |
| `pnpm demo`                         | Run the CLI and print initial, move, pickup, and try snapshots          |
| `pnpm check`                        | Run all automated checks, including real Chromium interactions          |
| `pnpm validate -- "task name"`      | Run full checks and capture screenshots; create a pending review        |
| `pnpm task:finish -- "task name"`   | Require successful reviews and current evidence before completion       |
| `pnpm typecheck`                    | Check the root project, host-independent core, and browser module       |
| `pnpm lint`                         | Run strict ESLint checks                                                |
| `pnpm architecture:check`           | Check allowed dependencies, public entry points, cycles, and resolution |
| `pnpm test` / `pnpm test:watch`     | Test the core, replay, CLI, documentation checker, and completion gate  |
| `pnpm test:e2e`                     | Test the built viewer, replay, file round trips, and mobile layout      |
| `pnpm exec playwright show-report`  | Open browser test details and screenshot attachments                    |
| `pnpm demo:check`                   | Compare built CLI output in two independent processes                   |
| `pnpm docs:check`                   | Check Markdown, required documents, local links, and heading anchors    |
| `pnpm format:check` / `pnpm format` | Check or fix formatting                                                 |

The toolchain uses pnpm Workspace, TypeScript Strict / ESM, Vitest, Playwright, ESLint, Prettier, dependency-cruiser, and GitHub Actions. The interface uses native TypeScript/CSS and Vite without a frontend framework. Exact dependencies are in [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml). Initial installation requires network access; the built simulation and replay run offline.

CLI output contains full snapshots. The viewer imports the replay format produced by its export control.

## Repository map and reading guide

The canonical repository is [YuxiangLiu-lyx/self_evolving_world](https://github.com/YuxiangLiu-lyx/self_evolving_world), with `main` as the integration branch. Pushes and pull requests run the complete validation in [GitHub Actions](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions). Each run retains available browser reports, screenshots, and validation records for 14 days. See [version control and CI](docs/DEVELOPMENT.md#version-control-and-ci) for the contribution workflow.

```text
packages/world-core/  All base rules in world.ts; index.ts only re-exports
apps/simulator/       Fixed three-action CLI example
apps/viewer/          Map, manual controls, vision, and history replay
scripts/              Documentation, built-output, and completion checks
docs/                 Overview, product, policies, ADRs, and execution plans
.github/              CI and PR template
```

Start with the [project overview](docs/PROJECT_OVERVIEW.md), then the [architecture](ARCHITECTURE.md) and [feature inventory](docs/PRODUCT.md). Before developing, read the [development workflow](docs/DEVELOPMENT.md), [validation workflow](docs/VALIDATION.md), [documentation policy](docs/DOCUMENTATION_POLICY.md), and [agent guide](AGENTS.md).

Decisions and acceptance records live in [ADRs](docs/decisions/README.md) and [execution plans](docs/exec-plans/README.md).
