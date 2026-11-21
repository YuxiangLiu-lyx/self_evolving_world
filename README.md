# Self-Evolving World

[![CI](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/workflows/ci.yml)

**Can autonomous agents discover needs, develop capabilities and change their world in ways that deliver lasting benefits?** This research project tests that question in a reproducible world. The latest protocol combines a continuous 2D forest, finite lives, seasonal pressures, physical costs, persistent objects, individual memory and happiness driven by actual outcomes.

**The mechanism:** agents act from private observations and request missing capabilities. A World Agent reviews functional equivalence, prerequisites, costs and effects. When implementation is needed, the world pauses and hands development to the current Codex conversation. Tested, versioned extensions become available; each actor must still learn and pay the execution costs. Requests and skill counts earn no reward. This is world-level learning, not model-weight training.

## What the experiments show

| Run                                                             | Observation                                                          | Measured outcome                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ex8](experiment/analyses/ex8/pr-21-forest-lives.md)            | 3 agents, 897 of 1,000 target rounds; forest ecology and three lives | The original decision budget ended the window. All three survived, but Lin finished at satiety 7.85. Five requested packages were used, including one shared shelter; 74 bounded experience awards occurred. No formal death or post-respawn adaptation was observed.            |
| [ex7](experiment/analyses/ex7/pr-18-continuous-world.md)        | 3 agents, 1,000 rounds; continuous space and happiness goals         | All survived at full health. Two requested activities were implemented: seven nature observations completed and one persistent stone mosaic was made. Mean happiness stayed at 9.42–9.58/100; mental satisfaction remained zero, with no sustained benefit from either activity. |
| [ex6](experiment/analyses/ex6/pr-17-development-coevolution.md) | 3 agents, 180 rounds; development goals and shared facilities        | All survived. Agents consumed 41 cultivated meals and rested 26 times at another agent's platform: concrete supply and recovery benefits.                                                                                                                                        |
| [ex5](experiment/ex5/report.md)                                 | 4 agents, 120 rounds; resource and skill evolution                   | Seven shared skills emerged, but all four agents starved. Capability count did not establish usefulness.                                                                                                                                                                         |

These are exploratory runs with different rules and goals, not causal comparisons. [The archive](experiment/README.md) retains configuration, events, replay, analysis and model-call records where applicable; authored starting abilities and isolated test fixtures are excluded from autonomous discoveries.

[![Actual ex8 replay at round 897: budget-paused forest, Lin hunger, lives and recorded experience](experiment/ex8/final.png)](experiment/ex8/final.png)

_Actual saved ex8 state at the original budget limit, viewable here without installation. Interactive replay runs locally after setup; it is read-only and makes no model calls._

## Five-minute quick start

Use Node.js **24.22.2** and pnpm **10.34.9**, pinned in [.node-version](.node-version) and [package.json](package.json).

```bash
git clone https://github.com/YuxiangLiu-lyx/self_evolving_world.git
cd self_evolving_world
npm install --global pnpm@10.34.9
pnpm install --frozen-lockfile
pnpm dev
```

Open [Local replay (after setup)](http://127.0.0.1:5173/?experiment=ex8) while `pnpm dev` is running on your computer. This loopback URL points to your own machine; it is not a public hosted demo. Seek the timeline, follow an agent, switch to its personal view and inspect recorded events. No API key is needed. `/classic.html` retains the original grid inspector; old experiments preserve their original rules. See [development setup](docs/DEVELOPMENT.md) and [forest protocol and recorded limitations](docs/FOREST_WORLD.md), and [live-run/resume instructions](docs/CONTINUOUS_WORLD.md) for more.

## Development task entry

The **code-development harness** is a TypeScript coordinator, separate from the simulated agents. It controls order and evidence; the current Codex conversation implements changes and performs visual and semantic review. It does not launch another autonomous coding service. Its two connected flows are:

**Task execution and experiment branches.** Actual changed files determine the `code` (including documentation), `experiment` or `mixed` route. Explicit experiment configuration selects the runner; the requested task label never skips checks. Saved-data analysis can run without allocating an experiment.

```mermaid
flowchart TB
    Intent[Intent + numbered plan] --> Prepare[Codex prepares code, docs or experiment]
    Prepare --> Route[Actual files: code / experiment / mixed]
    Route --> Run{Experiment requested?}
    Run -->|No run| Targets{Analysis targets?}
    Run -->|Yes| Allocate[Next exN or explicit reuse]
    Allocate --> Mode{Experiment mode}
    Mode -->|random| Random[Seeded run; no model calls]
    Mode -->|survival| Survival[Bounded model programs]
    Mode -->|Extensible protocols| World[Versioned world runner]
    World -->|Development needed| Dev[Freeze + checkpoint; Codex implements and validates]
    Dev -->|submit| World
    World -->|Budget / failure| Pause[Checkpoint; stop world]
    Pause -.->|Explicit valid resume| World
    Random --> Evidence[Retained results + replay + visuals]
    Survival --> Evidence
    World -->|Complete| Evidence
    Evidence --> Targets
    Targets -->|Required| Analysis[Codex analyzes saved behavior]
    Targets -->|None| Checks[Shared full validation and delivery below]
    Analysis --> Checks
    classDef conversation fill:#e8f2ff,stroke:#356ba6,color:#172b4d
    classDef paused fill:#fff3cd,stroke:#9a7413,color:#493600
    class Prepare,Dev,Analysis conversation
    class Pause paused
```

Extensible protocols are `learning`, `evolution`, `coevolution` and `continuous`. Analysis targets combine new or changed experiment records with explicitly requested retrospective analyses. Blue nodes mark conversation work, handed over through version-bound JSON requests. Checkpoints preserve decisions and budgets; continuation does not reset exhausted budgets or blindly retry inference. Capture recovery reconstructs saved results without new model calls.

**Shared acceptance and delivery.** Code, documentation, experiment-only and mixed tasks all pass the full suite. The default is guarded merge; local-only and PR-only require an explicit task-scoped exception.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 20, 'rankSpacing': 25, 'padding': 10}}}%%
flowchart TB
    Route{Actual change route?}
    Route -->|Code / documentation| Checks
    Route -->|Experiment only| Records[Validate experiment archives first]
    Route -->|Mixed| Records
    Records --> Checks
    Checks[Full suite: types / lint / unit / build / archives / browser / docs]
    Checks -->|Passed| Review[Codex reviews every screenshot, behavior result and changed file]
    Checks -->|Failed| Fix[Codex fixes findings]
    Review -->|Mismatch| Fix
    Fix -->|next: fresh validation| Checks
    Review -->|Passed| Policy{Recorded delivery policy}
    Policy -->|Explicit local-only| Finish[Independent completion gate: policy-specific evidence and integration]
    Policy -->|Publish| Commit[Reviewed commit + complete PR body]
    Commit --> Publish[Publish PR; current quality + pr-policy]
    Publish --> Comment[Codex exact-head COMMENT self-review]
    Comment --> Current[Recheck remote review and current CI]
    Current --> Delivery{Merge requested?}
    Delivery -->|Explicit PR-only| Finish
    Delivery -->|Default merge| Guard{Authority + exact head + no conflicts?}
    Guard -->|Missing / failed| Stop[Stop; resolve failure or obtain actual authority]
    Stop -.->|next: recheck prerequisites| Current
    Guard -->|Passed| Merge[Connector merges reviewed head]
    Merge --> Finish
    Finish -->|Verified receipt| Done[Completed]
    classDef conversation fill:#e8f2ff,stroke:#356ba6,color:#172b4d
    classDef paused fill:#fff3cd,stroke:#9a7413,color:#493600
    class Review,Fix,Commit,Comment,Merge conversation
    class Stop paused
```

| Layer                                                                             | Responsibility                                                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [task.ts](scripts/task.ts) / [task-context.ts](scripts/task-context.ts)           | CLI entry; persist intent, versions, journals and evidence in `validation-results/`.                  |
| [task-flow.ts](scripts/task-flow.ts)                                              | State machine; return structured work to this conversation and recheck prerequisites on continuation. |
| [task-runtime.ts](scripts/task-runtime.ts)                                        | Invoke existing experiment, analysis, validation and delivery gates.                                  |
| [task-entry.ts](scripts/task-entry.ts) / [task-worker.ts](scripts/task-worker.ts) | Route compatibility commands and guard internal workers against bypassing the coordinator.            |

Start with `pnpm task -- start validation-results/intent.json`; continue with `submit`, `next` and `status`. [The harness guide](docs/TASK_HARNESS.md) defines the intent and response formats, including paused world-development handoffs.

Source, plan or requirement changes invalidate acceptance; continuation rechecks prerequisites. Failed gates stop the task for explicit repair. GitHub COMMENT records this conversation's self-review, not independent approval; only the completion gate establishes completion. See [validation](docs/VALIDATION.md) and the [PR contract](docs/PULL_REQUESTS.md).

## Code and further reading

- [`packages/world-core/`](packages/world-core/): deterministic rules and versioned protocols; no UI, I/O or model services.
- [`apps/simulator/`](apps/simulator/): observations, model transport, persistent plans and execution. [`apps/viewer/`](apps/viewer/): saved-world visualization.
- [`scripts/`](scripts/): development harness and experiment evidence. [`experiment/`](experiment/): retained runs and analyses.
- [Feature status](docs/PRODUCT.md) · [Architecture](ARCHITECTURE.md) · [Agent guide](AGENTS.md) · [Decisions](docs/decisions/README.md) · [Execution plans](docs/exec-plans/README.md).

This remains a research prototype. Reviewed extensions use trusted code; unattended production operation and general rollback remain planned. Repository content is English; user conversations are Chinese.
