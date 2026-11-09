# World Experiments

Each numbered experiment is a retained, numbered record: `ex1`, `ex2`, `ex3`, and so on. Numbering is independent of the older optional model rounds in ignored `experiment-results/`. This directory is tracked and included in task fingerprints.

- [ex3 report](ex3/report.md): ChatGPT-authored survival programs, 60 rounds per actor and denied learning.
- [ex2 report](ex2/report.md): simultaneous rounds with successful collection and no learning attempts.
- [ex1 report](ex1/report.md): the first founding-world random-action run, without an external agent or model.

## Browse saved history

Run `pnpm dev` and open the printed local URL (normally `http://127.0.0.1:5173`). Choose **ex3**, **ex2**, **ex1**, or another completed run in **Experiment archive**. A direct link such as `http://127.0.0.1:5173/?experiment=ex1` reopens the selected history after refresh and supports back/forward navigation. Use the timeline to seek/play, select agents, switch vision, export the replay, or open the overview chart. Archived histories remain read-only, including the final frame.

Every completed record supplies the data for this shared interactive page; there is no separate HTML file inside each experiment directory. `pnpm dev` discovers completed runs at startup, and `pnpm build` bundles them into the static viewer. Restart or rebuild after a new experiment completes. Viewing a run never creates the next experiment number or rewrites its artifacts. A missing or invalid replay leaves the current world intact. Local demos/imports remain available through **Demo / local session**, **New world** and **Import history**.

## Run an experiment

```bash
pnpm experiment:run
# Optional explicit seed and round count:
pnpm experiment:run -- 20261107 160
pnpm experiment:check
pnpm validate -- "Describe this experiment"
# Inspect all current screenshots and complete validation-results/review.json.
pnpm task:review -- "Describe this experiment"
# Commit reviewed files and prepare the requirement-mapped PR body.
pnpm task:publish -- validation-results/pr-body.md "Describe the experiment result"
```

Each invocation of `experiment:run` creates the next number above the largest existing ID. The first invocation creates `ex1`; the next creates `ex2`. Do not run it again merely to inspect a saved experiment. Select it in the viewer, import its `replay.json`, or run `experiment:check` instead. Completed experiments are never overwritten. Interrupted or failed runs retain a failing manifest and cannot pass validation; after fixing a browser capture failure, use `pnpm experiment:resume -- ex1` (with the failed run ID). This revalidates and preserves saved simulation data, replaces only incomplete visual evidence, and retains the earlier error in `captureFailures`. Completed records refuse resumption. A simulation-data failure requires investigation; resumption cannot fabricate missing or inconsistent results.

The default seed is `20261107`, with 160 simultaneous rounds (480 total actions, 160 per agent). Seeds are integers from 1 to 4294967295; round counts are 3–500. All agents choose from the same starting snapshot, then commit together. The [synchronous extension](../docs/SYNCHRONOUS_ROUNDS.md) defines collisions, replay version 2 and the collection policy: always pick up same-cell items, otherwise combine visible-item attraction with random exploration. No try actions, model connections or implicit randomness participate. Collection experiments must demonstrate a successful pickup to pass.

The ex1 generator remains available only for reconstructing its original sequential version-1 archive, including its 80/10/10 move/pickup/try weights. Do not regenerate ex1 with the new policy. Every new experiment defaults to a new exN; user-requested reuse requires a documented [exception](../docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task). Both code and experiment tasks automatically proceed to PR publication after complete validation and actual review. `task:publish` requires a reviewed commit and PR body; it verifies current remote checks and merge conflicts, merges the reviewed head, then invokes `task:finish` to verify integration into main. Explicit no-PR or no-merge instructions require the current plan exception; incomplete delivery is an error.

## Run a survival model experiment

Use `pnpm experiment:login` for browser consent, then `pnpm experiment:survival` to allocate the next exN and run the [fixed survival protocol](../docs/SURVIVAL_EXPERIMENT.md). Each actor executes 60 rounds with at most five attempted calls; every learning request is denied. The command uses ChatGPT plan OAuth only, with no paid API-key fallback. The first protocol is deliberately mild. Ordinary random runs, validation, replay and CI never invoke models.

Version 3 records the exact request template, per-actor observations and completed outputs in model-calls.json. Attempts are saved before network access; failed responses remain counted. Only complete saved simulation data can resume browser capture. Never rerun inference into the same archive. The validator checks program scheduling, budgets, response correspondence, mild vital trajectories and all shared artifact/browser requirements.

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

The validator checks canonical IDs, required files, objective/parameters, completed execution, provenance, artifact hashes, seeded reconstruction, report/chart agreement and PNG structure. The browser additionally decodes saved images, imports the replay, checks positions/inventories and vision, plus survival vitals/programs when present, verifies historical controls, and compares exports before/after playback. Fresh screenshots enter the same individual visual review gate as the eleven standard viewer scenes, including desktop/mobile archive navigation. Missing, corrupted, inconsistent, stale or failed evidence blocks completion.

Successful execution means every configured action completed through the world API and all checked invariants held. A rejected move, failed pickup or unavailable skill is a normal result, counted separately from a crash or invariant failure. One bounded random run does not establish intelligent behavior or long-term reliability. Feature acceptance belongs to [PRODUCT](../docs/PRODUCT.md); task routing belongs to [VALIDATION](../docs/VALIDATION.md#task-harness-routing).
