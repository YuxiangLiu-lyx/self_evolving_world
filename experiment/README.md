# World Experiments

Each numbered experiment is a retained, numbered record: `ex1`, `ex2`, `ex3`, and so on. Numbering is independent of the older optional model rounds in ignored `experiment-results/`. This directory is tracked; existing archives are immutable.

- [ex11 / ex12 campaign findings](../docs/exec-plans/evidence/pr-25-collective-life/final-results.md), [A analysis](analyses/ex11/pr-25-collective-life.md) and [B analysis](analyses/ex12/pr-25-collective-life.md): three groups of six people per isolated arm. A stopped at 7 rounds; B's short window ended at 37 and its continuation at 136. One real stone loan, material accumulation and half-built tray are observed; matched 200-round comparison, sustained productivity and the 1,600-round horizon were not achieved within frozen budgets.
- [ex10 report](ex10/report.md), [behavioral analysis](analyses/ex10/pr-24-open-development.md) and [measured evidence chains](../docs/exec-plans/evidence/pr-24-open-development/final-results.md): fresh skills, three living actors, 358 / 1,600 rounds before context protection with the original 20 development attempts exhausted. Interrupted material work resumed; personal learning enabled another actor to make and use a water cup. No full seasonal cycle or broad productivity improvement was observed.
- [ex9 report](ex9/report.md) and [behavioral analysis](analyses/ex9/pr-23-forest-experience.md): one real 1,200-round observation; five new capabilities, three actually used by all actors, paid material/equipment/health benefits, and no deaths. Fire and canopy remained unused; all failed calls and technical pauses are retained.
- [ex8 report](ex8/report.md) and [behavioral analysis](analyses/ex8/pr-21-forest-lives.md): real forest observation, 897 rounds before the original decision budget ended, five requested capability packages, three living actors and bounded mental feedback; no formal deaths.
- [ex7 report](ex7/report.md): one real 1,000-round continuous world; three healthy survivors, two implemented activities and no mental satisfaction source.
- [ex6 report](ex6/report.md): real 180-round coevolution with persistent shared facilities and resource processes.
- [ex5 report](ex5/report.md): real 120-round heterogeneous evolution with four starvation deaths retained.
- [ex4 report](ex4/report.md): real survival-driven skill generation, reuse and learning; three survivors over18 rounds.
- [ex3 report](ex3/report.md): ChatGPT-authored survival programs, 60 rounds per actor and denied learning.
- [ex2 report](ex2/report.md): simultaneous rounds with successful collection and no learning attempts.
- [ex1 report](ex1/report.md): the first founding-world random-action run, without an external agent or model.

## Browse saved history

Run `pnpm dev` and open the printed local URL (normally `http://127.0.0.1:5173`). The main page is the game observatory; choose a completed archive or open `http://127.0.0.1:5173/?experiment=ex12`. Seek/play its saved timeline, select actors, switch between global and personal views, zoom/pan/follow, locate events and compare adjacent states. Vitals, tasks, memory and happiness panels show recorded data; unmeasured historical values remain unmeasured. Camera and playback never advance simulation or call models.

The original grid inspector remains at `/classic.html`, with its archive overview links, legacy import/export, URL back/forward behavior and manual demo controls. It redirects continuous archives to the game observatory. Local demos/imports remain available there through **Demo / local session**, **New world** and **Import history**.

Every completed record supplies the data for these shared pages; there is no separate HTML file inside each experiment directory. `pnpm dev` discovers completed runs at startup, and `pnpm build` bundles their public replay/chart data into the static viewer. Restart or rebuild after a new experiment completes. Viewing a run never creates an experiment number or rewrites its artifacts. Calls, credentials and source snapshots are not served as public viewer assets.

## Run an experiment

`pnpm experiment:run -- [seed] [rounds]` allocates the next exN and runs a seeded random synchronous world without any model call. It records the objective, replay, results, report, chart and real browser screenshots. `pnpm experiment:check` validates every archive without modifying it.

Each new experiment creates the next number above the largest existing ID; allocation is an exclusive directory creation, so concurrent or repeated commands never share a number. Do not run a new experiment merely to inspect a saved one: select it in the viewer, import its `replay.json` or run `pnpm experiment:check`.

The default seed is `20261107`, with 160 simultaneous rounds (480 total actions, 160 per agent). Seeds are integers from 1 to 4294967295; round counts are 3–500. All agents choose from the same starting snapshot, then commit together. The [synchronous extension](../docs/SYNCHRONOUS_ROUNDS.md) defines collisions, replay version 2 and the collection policy: always pick up same-cell items, otherwise combine visible-item attraction with random exploration. No try actions, model connections or implicit randomness participate. Collection experiments must demonstrate a successful pickup to pass.

The ex1 generator remains available only for reconstructing its original sequential version-1 archive, including its 80/10/10 move/pickup/try weights. Do not regenerate ex1 with the new policy. Every new experiment defaults to a new exN; user-requested reuse requires a documented [exception](../docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task). Both code and experiment tasks retain the [delivery contract](../docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task). The unified entry separates PR publication from actual merge authority and verifies current checks, conflicts and the final remote state. Explicit no-PR/no-merge instructions remain task exceptions; incomplete delivery is an error.

## Retired grid-era protocols

Survival (v3, [protocol](../docs/SURVIVAL_EXPERIMENT.md)), skill learning (v4, [protocol](../docs/SKILL_LEARNING_EXPERIMENT.md)), heterogeneous evolution (v5, [protocol](../docs/EVOLUTION_EXPERIMENT.md)) and coevolution (v6, [protocol](../docs/COEVOLUTION_EXPERIMENT.md)) produced ex3–ex6. Their archives remain validated and replayable, including recorded model inputs and outputs, but their run entry points are retired; new model-calling work uses the continuous world.

## Required record

| File                                         | Meaning                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                              | Versioned identity, objective, seed (random protocols), steps, policy, completion status, provenance and SHA-256 artifact hashes      |
| `replay.json`                                | Initial conditions and every action, grouped into simultaneous rounds for version 2; configuration and bounded programs for version 3 |
| `results.json`                               | Round/action/outcome counts, per-agent results, every event, final state and invariant-check counts                                   |
| `report.md`                                  | Objective, method, measured results, interpretation, limitations and visualization links                                              |
| `overview.svg` / `overview.png`              | Measured trajectories/outcomes or per-actor survival curves; vector source and Chromium rendering                                     |
| `initial.png` / `midpoint.png` / `final.png` | Real viewer frames at ticks 0, floor(steps/2), and steps                                                                              |
| `model-calls.json` (version 3)               | Request template, private inputs, attempt statuses and completed ordinary outputs; no credentials or reasoning traces                 |
| `browser.json`                               | Replay identity, frame ticks and successful automated browser assertions                                                              |

The validator checks canonical IDs, required files, objective/parameters, completed execution, provenance, artifact hashes, seeded reconstruction, report/chart agreement and PNG structure. The browser additionally decodes saved images, imports the replay, checks positions/inventories and vision, plus survival vitals/programs when present, verifies historical controls, and compares exports before/after playback. Fresh screenshots enter the same individual visual review gate as the thirteen standard viewer scenes, including desktop/mobile archive navigation. Missing, corrupted, inconsistent, stale or failed evidence blocks completion.

Successful execution means every configured action completed through the world API and all checked invariants held. A rejected move, failed pickup or unavailable skill is a normal result, counted separately from a crash or invariant failure. One bounded random run does not establish intelligent behavior or long-term reliability. Feature acceptance belongs to [PRODUCT](../docs/PRODUCT.md); task routing belongs to [VALIDATION](../docs/VALIDATION.md#check-selection).

## Behavioral analysis

After every experiment, the agent that ran it analyzes the completed archive before publication. Inspect trajectories, each actor's actions, visible opportunities, failures, model inputs/outputs when present, prompts and objective incentives. Distinguish abnormal execution from a valid but uninformative policy, input isolation from individuality, observed facts from explanations, and recommendations from authorized changes.

Store companion records in `experiment/analyses/exN/<name>.json` and `.md` (by convention `<name>` is the plan file stem, for example `pr-32-short-name`), outside immutable original exN directories. The JSON follows [ExperimentAnalysis](../scripts/experiment-review.ts): version, experiment, name (`taskId`), reviewer, all original artifact SHA-256 hashes, summary, every actor's observations/assessment/evidence references, findings for isolation/individuality/behavior/causes/limitations, and proposals with rationale and a future verification method. Evidence references may include a JSON-pointer label after `#`; readable links resolve to the actual file. Write the JSON to `validation-results/analysis.json` and run `pnpm experiment:analysis -- validation-results/analysis.json`; it validates the record against the archive, renders the readable report and refuses to overwrite a published companion. A later analysis uses a new name. A PR that adds an exN must include its companion analysis.

`pnpm analysis:check` validates all stored companions and participates in full `pnpm check`. Missing actors, stale artifacts, invalid references or a mismatched readable report fail. These structural checks cannot establish that a causal explanation is correct. Absence of behavioral diversity is not by itself proof of cross-agent information leakage. Recommendations do not change prompts, policies, world rules or experiment-success thresholds. Older archives need no invented retrospective judgments; explicitly requested targets such as ex3 receive their own companion.

- [ex3 behavioral analysis](analyses/ex3/pr-13-programmatic-harness.md): per-actor findings, shelter convergence, waiting, isolation limits and proposed controlled follow-ups.

## Run or continue a continuous world

Run `pnpm experiment:login` once, then `pnpm experiment:continuous -- new open|long|collective-a` to allocate the next exN and run the [continuous protocol](../docs/CONTINUOUS_WORLD.md) with real plan-funded inference. A collective comparison then runs `new collective-b exA` for its second arm. The command stops at each development barrier; implement the requested mechanism and submit it with `develop exN file.json`, which validates the source boundary and continues. `continue exN` resumes a saved checkpoint and `repair exN` converts an eligible technical pause into a counted handoff. A finished window is captured automatically (`pnpm experiment:capture -- exN` recaptures). The command reference is in the [development workflow](../docs/DEVELOPMENT.md#experiments).

Version 7 retains configuration, initial/execution state, immutable per-call records, 100-round replay segments and index, 200-round checkpoints/reports, source/visual snapshots, validation logs and browser evidence. `pnpm experiment:check` reconstructs the record without inference; the legacy 500-round and 1 MB importer limits do not apply to this separate segmented protocol. Stage reports never become actor hints. A budget or engineering pause is reported separately from a completed observation.

A later authorized larger observation uses `extend exN rounds` with a recorded reuse line in the plan, preserving the captured prior window, identities, tasks and call counts through the [continuation contract](../docs/CONTINUOUS_WORLD.md#calls-journals-and-windows). Source integrity must match the retained revision; opening playback does not continue inference. ex7's post-window delivery corrections are separately versioned, retain all live sources and do not rewrite events or count as autonomous discoveries.

The opt-in [forest experience protocol](../docs/FOREST_EXPERIENCE.md) used by ex9 fixes a 1,200-round target, 650 ordinary attempts, 60 world attempts and 20 counted development handoffs. It separates substantial meal history, temporary pleasure and slow mental state, with shared references and durable paid operations. Ex7/ex8 retain their original settings. [Detailed final measurements](../docs/exec-plans/evidence/pr-23-forest-experience/final-results.md) distinguish requests, implementation, learning, actual use and benefit.
