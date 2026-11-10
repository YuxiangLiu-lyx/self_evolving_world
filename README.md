# Self-Evolving World

[![CI](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml)

A TypeScript project exploring autonomous AI agents and controlled world evolution. The current foundation includes a bounded grid, agents, items, movement, pickup, unsupported skill attempts, automatic vision, visualization, and history replay. Browser validation and a task completion gate are part of the development workflow.

The observatory uses manual controls and scripted demos. An optional [single-round experiment](docs/ONE_ROUND_EXPERIMENT.md) requests one model decision for each of its three founding agents through ChatGPT OAuth and Responses. The separate [survival-program experiment](docs/SURVIVAL_EXPERIMENT.md) lets each actor execute model-written behavior code for 60 synchronous rounds with at most five calls. A separate [skill-learning protocol](docs/SKILL_LEARNING_EXPERIMENT.md) adds 18-round survival pressure, World Agent review, constrained generated skills and individual learning. The [heterogeneous evolution protocol](docs/EVOLUTION_EXPERIMENT.md) extends this with four comparable actors, 120 rounds, persistent ecology and World Agent-designed resource/mechanic additions. Unrestricted physics and continuous NPC services remain future work. [PRODUCT](docs/PRODUCT.md) is the single source of feature status.

Run a [numbered offline experiment](experiment/README.md) to check the founding world with seeded random actions and no model connection. Each run retains its objective, measured results, replay and visualizations under `experiment/exN/`. [ex5](experiment/ex5/report.md) records 120 rounds, three new resource types, seven shared skills and four starvation deaths, with a [detailed behavioral analysis](experiment/analyses/ex5/pr-16-heterogeneous-evolution.md). [ex4](experiment/ex4/report.md) records two generated food capabilities, individual learning and three healthy survivors over18 rounds. [ex3](experiment/ex3/report.md) records 12 successful ChatGPT calls, 60 rounds per actor, three survivors and three denied learning requests. [ex2](experiment/ex2/report.md) adds simultaneous rounds and successful collection; [ex1](experiment/ex1/report.md) remains the original sequential baseline.

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

If zsh reports `command not found: pnpm`, install the pinned pnpm after selecting Node 24.22.2 with the commands above. Ensure the npm global prefix's `bin` directory is on your shell PATH, then run `rehash` or reopen the terminal. Verify both `pnpm --version` and `pnpm exec node --version`; do not disable engine checks.

- Choose **ex4** (18 skill-learning rounds), **ex3** (60 survival rounds), **ex2** (160 rounds / 480 actions) or **ex1** in **Experiment archive**, or open `http://127.0.0.1:5173/?experiment=ex1`, to inspect its saved 480-step history. Select any later completed experiment in the same dropdown. Refresh and browser back/forward reopen the selected archive.
- Saved experiments are read-only: seek, play, inspect agents and vision, export the replay, or open the overview chart. Choose **Demo / local session**, **New world**, or import a file to work in a local session.
- The default demo has 3 agents, 6 initial items, and 12 scripted actions. Select **Play** to replay it or continue manually.
- Select an agent on the map or in the dropdown. Switch between **Global view** and **Agent vision**.
- Use arrow buttons or WASD to move one cell. Pick up an item when standing on its cell.
- Characters and founding items have distinct illustrations. Move and pickup are the current controls; legacy try records remain readable in old histories.
- Play, pause, change speed, step through frames, or seek on the timeline. Historical frames cannot receive actions; return to **Latest frame** to continue.
- Local session history lives in page memory. Export JSON before refreshing or starting a new world; import it to replay later. Archived experiments remain in `experiment/exN/` and reload through their URLs.

All base rules live in [world.ts](packages/world-core/src/world.ts). Defaults are a 16×12 world and a vision radius of 4. Configure an initial world with `createWorld(setup)` or edit the viewer's [demo setup](apps/viewer/src/scenario.ts). Settings are fixed after initialization.

## Validation and commands

Install the test browser before the first full check. Linux CI also installs system dependencies using `--with-deps`.

```bash
pnpm exec playwright install chromium
pnpm check
```

Use `pnpm task -- start validation-results/intent.json` for every task. Follow its current structured requests for implementation, every screenshot and behavior result, complete diff review, PR description and GitHub COMMENT self-review. Submit results and continue with `pnpm task -- next ID`; the program controls full validation, reviewed commit, publication, separately authorized merge and independent completion. Explicit no-PR/no-merge instructions remain current-plan exceptions. Legacy task commands resolve the same recorded task and cannot bypass its authorization or evidence. Standalone `pnpm validate` produces automated evidence only. See the [task entry](docs/TASK_HARNESS.md) and [validation criteria](docs/VALIDATION.md).

| Command                                                                  | Purpose                                                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                               | Build the core and start the viewer with the current experiment archive; restart after core changes or new experiments |
| `pnpm build`                                                             | Build the core, CLI, and static viewer                                                                                 |
| `pnpm preview`                                                           | Serve the built viewer on port 4173                                                                                    |
| `pnpm experiment:run -- [seed] [rounds]`                                 | Create the next offline random experiment with results and browser visuals                                             |
| `pnpm experiment:resume -- exN`                                          | Finish failed browser capture without replacing saved simulation data                                                  |
| `pnpm experiment:check`                                                  | Validate all retained experiment records and deterministic results                                                     |
| `pnpm harness -- "task name"`                                            | Continue the matching recorded task through the unified coordinator                                                    |
| `pnpm experiment:login`                                                  | Authorize the optional experiment through ChatGPT in the browser                                                       |
| `pnpm experiment:evolution`                                              | Continue an authorized version5 task: offline smoke, four actors, 120 rounds and bounded world evolution               |
| `pnpm experiment:learning`                                               | Continue a recorded learning experiment through the unified harness; 18 rounds and bounded model calls                 |
| `pnpm experiment:survival`                                               | Run the next plan-funded survival experiment: 60 rounds, at most five requests per actor                               |
| `pnpm experiment:once`                                                   | Request one decision for each of three agents and save a replay                                                        |
| `pnpm demo`                                                              | Run the CLI and print initial, move, pickup, and try snapshots                                                         |
| `pnpm check`                                                             | Run all automated checks, including real Chromium interactions                                                         |
| `pnpm validate -- "task name"`                                           | Run full checks and capture screenshots; create a pending review                                                       |
| `pnpm task:review -- "task name"`                                        | Continue the matching task; submit actual review through its structured request                                        |
| `pnpm task:finish -- "task name"`                                        | Continue the matching task through the independent completion gate                                                     |
| `pnpm pr:check -- validation-results/pr-body.md origin/main`             | Verify PR requirements, all changed paths, latest head, and completed local evidence                                   |
| `pnpm task:publish -- validation-results/pr-body.md "Concrete PR title"` | Submit the current PR body or continue the recorded task; no independent merge path                                    |
| `pnpm typecheck`                                                         | Check the root project, host-independent core, and browser module                                                      |
| `pnpm lint`                                                              | Run strict ESLint checks                                                                                               |
| `pnpm architecture:check`                                                | Check allowed dependencies, public entry points, cycles, and resolution                                                |
| `pnpm test` / `pnpm test:watch`                                          | Test the core, replay, CLI, documentation checker, and completion gate                                                 |
| `pnpm test:e2e`                                                          | Test the built viewer, replay, file round trips, and mobile layout                                                     |
| `pnpm exec playwright show-report`                                       | Open browser test details and screenshot attachments                                                                   |
| `pnpm demo:check`                                                        | Compare built CLI output in two independent processes                                                                  |
| `pnpm docs:check`                                                        | Check Markdown, required documents, local links, and heading anchors                                                   |
| `pnpm format:check` / `pnpm format`                                      | Check or fix formatting                                                                                                |

The toolchain uses pnpm Workspace, TypeScript Strict / ESM, Vitest, Playwright, ESLint, Prettier, dependency-cruiser, and GitHub Actions. The interface uses native TypeScript/CSS and Vite without a frontend framework. Exact dependencies are in [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml). Initial installation requires network access; the built simulation and replay run offline.

CLI output contains full snapshots. The viewer imports the replay format produced by its export control.

## Repository map and reading guide

The canonical repository is [YuxiangLiu-lyx/self_evolving_world](https://github.com/YuxiangLiu-lyx/self_evolving_world), with `main` as the integration branch. Pushes and pull requests run the complete validation in [GitHub Actions](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions). Each run retains available browser reports, screenshots, and validation records for 14 days. Before implementation, summarize numbered requirements in a task plan. Every PR repeats those requirements, reviews every changed file against them, and requires full tests plus current evidence. Follow the [PR contract](docs/PULL_REQUESTS.md). See [version control and CI](docs/DEVELOPMENT.md#version-control-and-ci) for the contribution workflow.

```text
packages/world-core/  All base rules in world.ts; index.ts only re-exports
apps/simulator/       Fixed demo, offline random runner and optional model experiment
apps/viewer/          Map, manual controls, vision, and history replay
scripts/              Task harness, experiment records and validation checks
experiment/           Numbered goals, results, replays and visualizations
docs/                 Overview, product, policies, ADRs, and execution plans
.github/              CI and PR template
```

Start with the [project overview](docs/PROJECT_OVERVIEW.md), then the [architecture](ARCHITECTURE.md) and [feature inventory](docs/PRODUCT.md). Before developing, read the [development workflow](docs/DEVELOPMENT.md), [validation workflow](docs/VALIDATION.md), [documentation policy](docs/DOCUMENTATION_POLICY.md), and [agent guide](AGENTS.md).

Decisions and acceptance records live in [ADRs](docs/decisions/README.md) and [execution plans](docs/exec-plans/README.md).

## Development task entry

Use the [programmatic harness](docs/TASK_HARNESS.md) for new code, documentation and experiment tasks: `pnpm task -- start validation-results/intent.json`. It returns structured requests to the current conversation and resumes with `submit` or `next`; `status` shows current evidence and blockers. Legacy task commands are guarded compatibility entries; standalone diagnostic checks remain available. Every experiment also retains a [behavioral analysis](experiment/README.md#behavioral-analysis) with recommendations only.
