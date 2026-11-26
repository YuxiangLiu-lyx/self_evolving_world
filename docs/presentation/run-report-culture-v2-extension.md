# Run report: culture v2 extension (ex16 and ex17 to round 250, E4 as ex18)

This report covers [PR-42](../exec-plans/completed/pr-42-culture-v2-extension.md).

After reviewing the first culture v2 runs, the user revised gate G2 after the fact ([PR-41](../exec-plans/completed/pr-41-culture-g2-revision.md)). Under the revision, ex16 and ex17 pass at round 80, and the user decided to:

- extend both archives from round 80 to round 250, with a checkpoint at round 150;
- run E4, the incentive control, as ex18 for 120 rounds once ex16 reached round 150.

Every number comes from retained files under `experiment/`. No model was called to write this report. The [first report](run-report-culture-v2.md) covers rounds 0–79 of ex16 and ex17 and keeps its original evaluation.

Related documents:

- the scenario: [Culture v2](../CULTURE_SCENARIO.md#culture-v2), [Culture v3](../CULTURE_SCENARIO.md#culture-v3) and [Culture metrics](../CULTURE_SCENARIO.md#culture-metrics), including the revised G2;
- the metric definitions: the [culture baseline](culture-baseline.md#metric-definitions);
- the problems this extension exposed: [fix log section 9](fix-log.md#9-culture-v2-extension-newly-exposed-problems);
- the behavioral analyses:
  - [ex16, rounds 0–250](../../experiment/analyses/ex16/pr-42-culture-v2-extension.md);
  - [ex17, rounds 0–250](../../experiment/analyses/ex17/pr-42-culture-v3-extension.md);
  - [ex18, rounds 0–120](../../experiment/analyses/ex18/pr-42-e4-incentive-control.md).

The round-80 analyses of ex16 and ex17 stay as the records of their first windows.

Reproduce the measurements with:

```bash
pnpm metrics:culture -- experiment/ex16 250    # also 120 and 150
pnpm metrics:culture -- experiment/ex17 250    # also 120 and 150
pnpm metrics:culture -- experiment/ex18 120
pnpm metrics:culture -- experiment/ex15 70
pnpm metrics:culture -- experiment/ex13 80
pnpm metrics:culture -- experiment/ex14
pnpm metrics:long -- experiment/ex16           # also ex17, ex18, ex15, ex14, and ex13 80
```

**Round convention.** The culture analyzer prints settle ticks: the actions decided at round _r_ settle in events stamped tick _r_ + 1. This report quotes ticks unless it says "round", and call ids are the files in `experiment/exN/calls/`.

## Runs

| Archive   | Tag and scope                             | Branch (base commit)                    | Window                        | Stop reason                         | Calls |                              Ledger tokens | Per person per round | Handoffs (counted) | Rejected outputs | Recoveries                               |
| --------- | ----------------------------------------- | --------------------------------------- | ----------------------------- | ----------------------------------- | ----: | -----------------------------------------: | -------------------: | ------------------ | ---------------: | ---------------------------------------- |
| ex16      | `long-culture-v2`, `long-ex16`            | `experiment/ex16-extension` (`2409b37`) | rounds 0–250 (80 → 150 → 250) | planned end: window complete at 250 |   340 | 2,903,618 (109,560 reserved for 3 unknown) |              1,935.7 | 7 (6)              |                5 | 1 in the extension (round 99); 3 earlier |
| ex17      | `long-culture-v3`, `long-ex17`            | `experiment/ex17-extension` (`b643e48`) | rounds 0–250 (80 → 150 → 250) | planned end: window complete at 250 |   285 |                                  2,304,010 |              1,536.0 | 3 (3)              |                0 | none                                     |
| ex18 (E4) | `long-culture-v2-incentives`, `long-ex18` | `experiment/e4-incentives` (`987c968`)  | rounds 0–120                  | planned end: window complete at 120 |   190 |                                  1,472,281 |              2,044.8 | 3 (3)              |                4 | none                                     |

- **Cumulative tokens**, across all experiments counted against the 16,000,000 limit: ex15 1,320,077 + ex16 2,903,618 + ex17 2,304,010 + ex18 1,472,281 = **7,999,986**.
- **Monitoring rules** (stop at the next checkpoint on more than 8 counted handoffs in any 50 rounds, or more than 6,000 ledger tokens per person per round). Neither triggered:
  - largest number of counted handoffs in any 50 rounds: ex16 3 (rounds 204, 221 and 234), ex17 2, ex18 2;
  - the per-person rates are in the table.
- **Budgets and genesis**: no change. ex16 and ex17 keep their 10,000,000-token experiment budgets and checkpoints `[80, 150, 250]`. ex18 has the incentive variant's 4,000,000 tokens, 16 developments and 120 rounds.
- **Checkpoint backups**: pushed to the remote continuation branches without a merge or a PR:
  - ex16: round 150 at `4530979`, round 250 at `4c108a4`;
  - ex17: round 150 at `3fc630f`, round 250 at `b6c8a29`;
  - ex18: round 120 at `2329cc2`.
- **Largest input estimate**: ex16 13,326, ex17 12,435 and ex18 11,689, all far below the 24,000-token guard. No continuation-part query was needed.

### Source branches and the pre-merge replay

`continue` and `extend` refuse an archive whose runtime sources differ from its last recorded revision. After ex16's first window, main had gained the culture v3 code and ex17's package (fix-log 9b). With the user's approval, each continued archive ran on its own branch, starting at its last checkpoint commit. The plan lists the branches.

The only change brought onto the continuation branches is PR #35's `scripts/continuous-repair.ts` (the retry-after wait) with its test. That script is outside the runtime identity.

Before the merge, every archive was replayed on the merged code and compared with the digest written on its own branch. All twelve were byte-identical:

| Archive          |                                   Requests |      Paused ordinary inputs | Result    |
| ---------------- | -----------------------------------------: | --------------------------: | --------- |
| ex7–ex15         | 110, 406, 411, 224, 17, 436, 524, 103, 159 | 0, 0, 0, 0, 0, 0, 27, 3, 18 | identical |
| ex16 (round 250) |                                        340 |                          24 | identical |
| ex17 (round 250) |                                        285 |                           0 | identical |
| ex18 (round 120) |                                        190 |                           0 | identical |

The 12 packages developed in ex16–ex18 each install only in their own scope (`v7Install` rejects every other scope). After the merges, the 99 packages in `V7_PACKAGES` have unique ids and handler ids.

## Gate G2 at each checkpoint (revised after the fact)

The revision and its reasons are in [PR-41](../exec-plans/completed/pr-41-culture-g2-revision.md) and [Culture metrics](../CULTURE_SCENARIO.md#culture-metrics). The original gate is shown for reference.

| Cut      | Survival without rest | Idle (rest + wait)  | People with a symbolic action | Adopted names / sayings / rules | Revised G2 | Original G2  |
| -------- | --------------------- | ------------------- | ----------------------------- | ------------------------------- | ---------- | ------------ |
| ex16-120 | 11.1%                 | 386 / 720 (53.6%)   | 5 of 6 (not wren)             | 0 / 5 / 3                       | pass       | fail (51.5%) |
| ex16-150 | 10.9%                 | 490 / 900 (54.4%)   | 5 of 6 (not wren)             | 0 / 8 / 3                       | pass       | fail (52.9%) |
| ex16-250 | 9.7%                  | 895 / 1500 (59.7%)  | 6 of 6                        | 0 / 9 / 6                       | pass       | fail (55.8%) |
| ex17-120 | 9.2%                  | 442 / 720 (61.4%)   | 4 of 6 (not lin, wren)        | 1 / 4 / 1                       | pass       | fail (24.3%) |
| ex17-150 | 9.4%                  | 585 / 900 (65.0%)   | 5 of 6 (not wren)             | 1 / 4 / 1                       | pass       | fail (22.9%) |
| ex17-250 | 10.7%                 | 1014 / 1500 (67.6%) | 6 of 6                        | 1 / 10 / 6                      | pass       | pass (24.0%) |
| ex18-120 | 10.4%                 | 393 / 720 (54.6%)   | 4 of 6 (not wren, ivo)        | 1 / 8 / 1                       | pass       | fail (53.9%) |

- **Late speech.** Wren in ex16 and Lin and Wren in ex17 spoke only after round 120:
  - ex16 Wren: first at tick 204, heard by nobody;
  - ex17 Lin: first at tick 128;
  - ex17 Wren: first at tick 183, heard only by Lin.

  At round 250 every person had made a symbolic action in both runs, and ex17 passes even the original gate.

- **The adoption counts are upper bounds** (review item A and fix-log 9i). Most rule adoptions and sayings added after tick 80 are false: private-note wording or status reports. Each run still has at least one clear adoption:
  - ex16: "room to come and go", Lin to Moss at tick 22;
  - ex17: the sign name `Earth's Quiet Gold` and the "needn't make every moment into work" saying;
  - ex18: Moss's take-one-and-leave-the-other reply to Kai at tick 20.
- **Idle time grew** in both long runs, to 59.7% and 67.6%. The revised gate passes them without showing that people did more.

## E0 culture metrics

The analyzer changed after the first report (fix-log 8c–8e), so round-80 values of ex16 and ex17 differ from that report; for example, ex16's reuses fall from 9 to 6. All rows below use the current analyzer.

| Cut      | Rounds | Agents | Shared / candidate terms | Cross-agent term uses | Transmitted terms | Repeated activities (non-survival) | Norms / echoed | Sharing expressions / reuses (exposed) | Beliefs causal + supernatural / cited | Messages | Message reciprocity | Responses | Gives/exchanges | Survival share | Survival share without rest | Non-transactional share | Symbolic actions |
| -------- | ------ | ------ | ------------------------ | --------------------- | ----------------- | ---------------------------------- | -------------- | -------------------------------------- | ------------------------------------- | -------- | ------------------- | --------- | --------------- | -------------- | --------------------------- | ----------------------- | ---------------- |
| ex13-80  | 80     | 3      | 0 / 20                   | 0                     | 0                 | 0 (0)                              | 0 / 0          | 2 / 0 (0)                              | 0 + 0 / 0                             | 5        | 100.0%              | 2         | 0               | 36.7%          | 16.7%                       | 0.0%                    | 0                |
| ex14     | 64     | 3      | 2 / 15                   | 4                     | 0                 | 0 (0)                              | 0 / 0          | 0 / 0 (0)                              | 2 + 0 / 0                             | 0        | –                   | 0         | 0               | 55.2%          | 15.1%                       | –                       | 0                |
| ex15-70  | 70     | 6      | 1 / 16                   | 4                     | 0                 | 3 (1)                              | 0 / 0          | 31 / 17 (7)                            | 1 + 0 / 0                             | 3        | 100.0%              | 1         | 3               | 39.5%          | 12.1%                       | 0.0%                    | 28               |
| ex16-120 | 120    | 6      | 1 / 5                    | 1                     | 0                 | 4 (1)                              | 0 / 0          | 19 / 7 (5)                             | 1 + 0 / 0                             | 0        | –                   | 0         | 0               | 51.5%          | 11.1%                       | 2.9%                    | 34               |
| ex16-250 | 250    | 6      | 1 / 15                   | 1                     | 0                 | 4 (1)                              | 0 / 0          | 26 / 12 (9)                            | 1 + 0 / 0                             | 0        | –                   | 0         | 0               | 55.8%          | 9.7%                        | 4.4%                    | 45               |
| ex17-120 | 120    | 6      | 2 / 8                    | 6                     | 2                 | 5 (2)                              | 0 / 0          | 11 / 6 (2)                             | 0 + 0 / 0                             | 2        | 0.0%                | 0         | 0               | 24.3%          | 9.2%                        | 0.0%                    | 28               |
| ex17-250 | 250    | 6      | 2 / 9                    | 6                     | 2                 | 6 (3)                              | 0 / 0          | 25 / 15 (11)                           | 2 + 0 / 0                             | 2        | 0.0%                | 0         | 0               | 24.0%          | 10.7%                       | 0.0%                    | 44               |
| ex18-120 | 120    | 6      | 3 / 14                   | 4                     | 1                 | 5 (2)                              | 0 / 0          | 16 / 4 (1)                             | 3 + 0 / 0                             | 1        | 0.0%                | 0         | 0               | 53.9%          | 10.4%                       | 0.0%                    | 38               |

Against ex13 and ex14, the culture runs have:

- **more people**, six instead of three;
- **symbolic actions**, which the earlier scopes did not offer;
- **more sharing expressions**;
- **lower survival shares once rest is excluded**: 9.2–11.1%, against 15.1–16.7%.

Over the long windows, cumulative symbolic actions grew slowly:

- ex16: 34 by round 120 and 45 by round 250;
- ex17: 28 by round 120 and 44 by round 250.

Speech rarely carried new content: no norm statement was detected in any run, and messages stayed at 0–2.

## E4: incentive control against ex16's first 120 rounds

ex18 forks from ex16's genesis (same rules, seed 20261123, world and people) with incentives on. Sampling diverges from the first call, so this is a case comparison, not a causal test.

| Measure (rounds 0–119)                                        | ex16                          | ex18               |
| ------------------------------------------------------------- | ----------------------------- | ------------------ |
| Symbolic actions, total                                       | 34                            | 38                 |
| Symbolic actions, per person (Lin, Moss, Sol, Kai, Wren, Ivo) | 3, 12, 7, 9, 0, 3             | 7, 16, 2, 13, 0, 0 |
| Idle share (rest + wait)                                      | 53.6%                         | 54.6%              |
| Survival share without rest                                   | 11.1%                         | 10.4%              |
| Sharing expressions / reuses (exposed)                        | 19 / 7 (5)                    | 16 / 4 (1)         |
| Phrase propagations (into spoken text)                        | 12 (5)                        | 13 (8)             |
| Adopted names / sayings / rules                               | 0 / 5 / 3                     | 1 / 8 / 1          |
| Invitations / works                                           | 1 / 3                         | 0 / 0              |
| Counted handoffs                                              | 3                             | 3                  |
| Ledger tokens per person per round                            | 2,246.4 (2,094.2 known usage) | 2,044.8            |

- **The awards** (from the [ex18 analysis](../../experiment/analyses/ex18/pr-42-e4-incentive-control.md)):
  - The incentive rules produced 9 `acknowledged` and 4 `reciprocated` events and no `work-noticed` event.
  - These made 10 awards: Kai 4, Lin 3, Moss 3, all for named speech inside that trio, at ticks 11–51 and once at 118. Sol, Wren and Ivo received none.
- **No behavioral path is visible** (fix-log 9g):
  - the incentive rules appear in no input; ex18's `ordinary-1` input differs from ex16's only in the scope string;
  - award events reached a decision input 6 times, all Moss's, and no output mentions them.
- **The differences are not attributable to the incentives.** Ivo never spoke in ex18 and spoke 3 times in ex16. ex16 had an invitation and three works, ex18 had none. Moss and Kai spoke more in ex18.

## Cost and decision metrics

| Archive (rounds) | Ordinary / World Agent calls | Tokens per person per round (known usage) | Follow-up share | Plans | Median gap between decisions | Exhausted decisions | Developed interfaces |
| ---------------- | ---------------------------- | ----------------------------------------: | --------------: | ----: | ---------------------------: | ------------------: | -------------------: |
| ex13 (80)        | 178 / 36                     |                                   6,631.9 |           51.7% |    84 |                            2 |                  35 |                   12 |
| ex14 (64)        | 70 / 33                      |                                   3,640.7 |           55.7% |    31 |                            5 |                  14 |                    6 |
| ex15 (70)        | 147 / 12                     |                                   3,143.0 |           54.4% |    65 |                            5 |                  25 |                    5 |
| ex16 (120)       | 189 / 9                      |                                   2,094.2 |           58.2% |    78 |                            6 |                  41 |                    3 |
| ex16 (250)       | 322 / 18                     |                                   1,862.7 |           57.8% |   135 |                            7 |                  72 |                    6 |
| ex17 (120)       | 129 / 3                      |                                   1,349.9 |           48.8% |    66 |                            6 |                  22 |                    1 |
| ex17 (250)       | 276 / 9                      |                                   1,536.0 |           52.2% |   132 |                            5 |                  52 |                    3 |
| ex18 (120)       | 178 / 12                     |                                   2,044.8 |           55.1% |    80 |                            4 |                  38 |                    3 |

Per person per round, the long runs cost less than ex13: ex16 1,935.7 and ex17 1,536.0 in ledger tokens. Plans grew longer, and in ex16 two plans ran 61 and 70 rounds, which also explains part of the idle time (fix-log 9e). No plan used interrupts in any run.

## Recovery log

All recoveries in the extension, by the user's rules. The round-2 and round-24 recoveries of ex16 are in the [first report](run-report-culture-v2.md#recovery-log).

| #   | Archive | Round | Failed call          | Failure (UTC)       | Error                                                             | Retry-after | Repair   | Waited | Path                                                                      | Counted                           |
| --- | ------- | ----- | -------------------- | ------------------- | ----------------------------------------------------------------- | ----------- | -------- | ------ | ------------------------------------------------------------------------- | --------------------------------- |
| 1   | ex16    | 99    | `ordinary-168` (Lin) | 2026-11-25 09:18:29 | `fetch failed` after 163 ms; no response and no retained evidence | none        | 09:19:31 | 62 s   | technical pause, closed by the empty handoff `development-4` (no package) | no (empty handoffs are uncounted) |

Rejected outputs that recovered within their round, with no pause and no handoff:

- ex16: Kai's `ordinary-334` (tick 241), which omitted the preferences field;
- ex18: four rejected outputs, one 241-character `tell` and three plan-shape errors.

No run reached three consecutive rejections. There was no overload with a retry-after, so the new wait rule (PR #35) never had to wait; no run came near six recoveries in 60 minutes.

## Handoffs

Every handoff of the extension. Each installed a simplified but real mechanism unless stated; the declarations under `experiment/exN/development/` list every modeling assumption. Handoffs 1–3 of ex16 and 1 of ex17 are in the [first report](run-report-culture-v2.md#handoffs).

| Archive, attempt | Round | Requester and request                                   | World Agent decision                                                                 | Package                       | What was implemented                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----: | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ex16, 4          |    99 | none (technical pause)                                  | –                                                                                    | none                          | Empty declaration closing the `fetch failed` pause; uncounted                                                                                                                                                                                                                                                                        |
| ex16, 5          |   204 | Wren: prepare meadow roots into a different meal        | develop, learning 2: equipment-free hand-breaking                                    | `hand-break-food@1`           | Trial and prepare modes over owned whole units at 1 energy per unit; a strength-from-hardness rule decides snap, deform or resist (roots snap); nutrition, toxicity and meal experience unchanged                                                                                                                                    |
| ex16, 6          |   221 | Wren: hand-twist cordage                                | develop, learning 3: sample, make, inspect, trial, cancel                            | `hand-twist-fiber-cord@1`     | Reed-only cord law reusing the existing reed values; 4 paid stages; bounded pull trials can break the cord; material conserved                                                                                                                                                                                                       |
| ex16, 7          |   234 | Wren: tie an overhand knot in its cord                  | develop, learning 3                                                                  | `hand-tie-cord-knot@1`        | Attempt, inspect, trial, untie and cancel on the same cord item; bend radius from the cord's flexibility; knotted break force about 1/1.2 of straight                                                                                                                                                                                |
| ex18, 1          |    10 | Wren: cultivate meadow roots                            | develop, learning 3                                                                  | `plant-establishment-trial@1` | Factory instance of the ex16/ex17 cultivation code with a three-stage plant mode; growth left to the unchanged ecology; maintenance rejected before costs (no water, fertilizer or hand-changeable condition is represented)                                                                                                         |
| ex18, 2          |    52 | Moss: prepare a simple root meal                        | develop, learning 2: unheated dry preparation                                        | `unheated-food-preparation@1` | Per-unit visual check and hand brushing into an inspectable lot at 0.5 energy per unit; no change to nutrition, toxicity or decay; no automatic feeding                                                                                                                                                                              |
| ex18, 3          |    73 | Kai: evidence-based root cooking                        | develop, learning 3: thermal preparation; the executable part is a feasibility check | `thermal-food-preparation@1`  | Paid feasibility assessment only. Heating is rejected before costs because the world represents no usable heat source or heat transfer to food (`local-fire@1` is unscoped and only warms people)                                                                                                                                    |
| ex17, 2          |   156 | Wren: practical root cooking                            | develop, learning 3: heat preparation with a physically gated fire-starting mode     | `hearth-food-preparation@1`   | Hearth clearing, hand-drill friction ignition gated by dryness, rain and wind, combustion with `local-fire@1`'s values, and dry roasting of one whole root or berry with an exact heat and mass ledger; nutrition can only fall. Renamed from `thermal-food-preparation@1` before submission to avoid a clash with ex18 (fix-log 9d) |
| ex17, 3          |   161 | Sol: inspect and handle an unfamiliar food (a hazelnut) | develop, learning 1                                                                  | `mechanical-food-handling@1`  | Examine and open modes; opening needs a rigid tool and a solid support whose strength exceeds the shell's; a stone on rock cracks a hazelnut in one blow                                                                                                                                                                             |

None is an honest first release: every specification was self-consistent. ex18's handoff 3 and the maintenance mode of its handoff 1 reject what the world cannot represent before any cost.

What the packages did:

- **ex16**:
  - Wren mastered six packages. It ate its one harvested root at tick 244. It snapped a root into two pieces (no nutritional change). Its cord held 10 N for 60 s, and its knot held 5 N for 30 s before Wren untied it.
  - Sol and Kai learned `hand-break-food` from the catalogue and used it once each: a hazelnut resisted and a berry deformed.
- **ex17**:
  - Nobody built a hearth or tried friction fire. Wren mastered the package at tick 159 with rain at 0.85, where ignition needs at most 0.15, and lacked a hardwood drill (`ordinary-167`); rain fell below 0.15 only after about tick 232 (fix-log 9h).
  - Five people mastered `mechanical-food-handling`. The one shell cracked was Wren's hazelnut at tick 181 (`event-181-wren-2006`).
- **ex18**: none of the three packages changed anyone's food: three plots, a prepared root lot and paid feasibility checks.

## Five log-backed events

1. **ex16, tick 204: Wren's first `tell` reached nobody** (`event-204-wren-2298`, planned in `ordinary-282`).
   - After 203 ticks of silence, Wren told Moss about the first root its plot had yielded.
   - Moss had walked 5.16 units away, beyond hearing range, so the event had no listener.
   - Wren's later reports at ticks 233 and 249 were heard by Moss, Sol and Ivo, and nobody replied.
2. **ex16, ticks 78–147: a food report spread by being tested.**
   - Lin said: "I tried one hazelnut: it supplied 18 satiety, with no observed toxicity" (`event-78-lin-870`).
   - Sol, Moss and Kai each ate one to check (ticks 102, 128 and 137).
   - Sol (tick 116) and Kai (tick 147, `event-147-kai-1665`) repeated the finding aloud in the same frame.
3. **ex18, tick 10: Sol named its clearing "The Berry Lantern"** (`event-10-sol-105`).
   - Moss praised the name at tick 13.
   - Kai, Lin and Moss then built an invented lantern story over five utterances (ticks 79, 80, 103, 109 and 117).
   - The analyzer detects neither the story nor the name's use in speech (fix-log 9f).
4. **ex17, ticks 181–183: the only cracked shell, and Wren's first words.**
   - Wren cracked a hazelnut with a stone on rock (`event-181-wren-2006`).
   - Two ticks later it spoke for the first time in 183 ticks, addressing Lin about it (`event-183-wren-2035`, `ordinary-206`). Only Lin heard.
5. **ex17, ticks 203–211: the run's one complete exchange.**
   - Kai asked, "Has anyone found an interesting question to explore together?" (`event-203-kai-2283`).
   - Sol answered at tick 209: "perhaps our shared question can be what catches each of our eyes here. I like the roots' muted gold against the green" (`event-209-sol-2348`).
   - Kai and Moss replied at tick 211.
   - The "muted/quiet gold" description of the roots, which echoes Sol's earlier name `Earth's Quiet Gold`, was spoken 6 times after tick 80 and reached Lin at tick 240.

## Timelines of events

One timeline per run, from `pnpm metrics:culture`: names and marks, rules (communicated sharing expressions), adopted names, sayings and rules, invitations and attendance, works started and completed, and works valued for their appearance. Each item has its tick and the call that produced the person's plan for that round.

- Adopted sayings and rules are detector output. Review item A found most items after tick 80 to be false, so read them as candidates.
- In ex17 and ex18 the works column is empty. The plots and the hearth are world objects with no maker (`createdBy: null`), so they do not count as anyone's work.

### Timeline: ex16 (rounds 0–250)

| Tick | Type              | Person (call)         | Others (call)                              | Text                                                                                                           | Record                 |
| ---: | ----------------- | --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
|    1 | rule              | kai (`ordinary-12`)   | –                                          | I'll take a modest share and leave some for others. [leave-for-others, take-moderately]                        | –                      |
|    3 | rule              | moss (`ordinary-23`)  | –                                          | I'm collecting six from the patch south of us, leaving the rest. [leave-for-others]                            | –                      |
|    3 | rule-adopted      | moss (`ordinary-23`)  | sol (`ordinary-9`)                         | leave some for others if no one (from sol, round 1, via speech)                                                | –                      |
|    3 | rule-adopted      | moss (`ordinary-23`)  | kai (`ordinary-12`)                        | leaving food for others (from kai, round 1, via speech)                                                        | –                      |
|   11 | rule-adopted      | moss (`ordinary-36`)  | kai (`ordinary-12`)                        | leaving food for others (from kai, round 1, via speech)                                                        | –                      |
|   11 | saying-adopted    | lin (`ordinary-33`)   | kai (`ordinary-24`)                        | I'd enjoy company while resting and comparing ideas for a fair camp (from kai, round 5, via speech)            | –                      |
|   22 | saying-adopted    | moss (`ordinary-59`)  | lin (`ordinary-48`)                        | a welcoming camp would leave room for quiet and freedom to come and go (from lin, round 19, via speech)        | –                      |
|   25 | saying-adopted    | kai (`ordinary-72`)   | moss (`ordinary-59`)                       | room to come and go (from moss, round 22, via speech)                                                          | –                      |
|   25 | saying-adopted    | kai (`ordinary-72`)   | moss (`ordinary-59`)                       | Your windbreak idea sounds lovely (from moss, round 22, via speech)                                            | –                      |
|   37 | work-started      | moss (`ordinary-93`)  | –                                          | Fiber mat (fiber-mat)                                                                                          | `mat-37-moss-435`      |
|   43 | work-completed    | moss (`ordinary-93`)  | –                                          | Fiber mat (fiber-mat)                                                                                          | `mat-37-moss-435`      |
|   50 | work-started      | sol (`ordinary-117`)  | –                                          | Woven branch screen (branch-screen)                                                                            | `screen-50-sol-571`    |
|   51 | invitation        | moss (`ordinary-119`) | lin, sol, kai, ivo                         | meet at (14.8, 16.2) at round 60: Quiet company near the little mat; bring yourself, not supplies. We can com… | `sign-51-moss-600`     |
|   57 | work-completed    | sol (`ordinary-129`)  | –                                          | Woven branch screen (branch-screen)                                                                            | `screen-50-sol-571`    |
|   60 | attendance        | world                 | sol (`ordinary-129`), ivo (`ordinary-128`) | present ivo, moss, sol; came after hearing ivo; guests within the grace period sol (round 60), ivo (round 60)  | `event-60-world-690`   |
|   70 | valued-appearance | sol (`ordinary-134`)  | moss (`ordinary-138`)                      | The screen is finished: eleven pieces, with none missing or loose at inspection. The wind was too strong for … | `screen-50-sol-571`    |
|   79 | work-started      | wren (`ordinary-149`) | –                                          | Fiber mat (fiber-mat)                                                                                          | `mat-79-wren-890`      |
|   85 | work-completed    | wren (`ordinary-149`) | –                                          | Fiber mat (fiber-mat)                                                                                          | `mat-79-wren-890`      |
|  116 | saying-adopted    | sol (`ordinary-178`)  | lin (`ordinary-148`)                       | with no observed toxicity (from lin, round 78, via speech)                                                     | –                      |
|  133 | saying-adopted    | moss (`ordinary-214`) | ivo (`ordinary-128`)                       | I'd welcome some quiet company beside your mat (from ivo, round 60, via speech)                                | –                      |
|  147 | saying-adopted    | kai (`ordinary-232`)  | sol (`ordinary-178`)                       | it supplied 18 satiety with no observed toxicity (from sol, round 116, via speech)                             | –                      |
|  147 | saying-adopted    | kai (`ordinary-232`)  | sol (`ordinary-178`)                       | I'm returning for a quiet pause beside the woven screen (from sol, round 116, via speech)                      | –                      |
|  168 | work-started      | wren (`ordinary-245`) | –                                          | Woven branch screen (branch-screen)                                                                            | `screen-168-wren-1870` |
|  175 | work-completed    | wren (`ordinary-245`) | –                                          | Woven branch screen (branch-screen)                                                                            | `screen-168-wren-1870` |
|  189 | rule-adopted      | moss (`ordinary-260`) | kai (`ordinary-192`)                       | modest portion (from kai, round 111, via speech)                                                               | –                      |
|  195 | saying-adopted    | ivo (`ordinary-266`)  | moss (`ordinary-119`)                      | quiet company is welcome (from moss, round 50, via speech)                                                     | –                      |
|  215 | rule-adopted      | wren (`ordinary-297`) | sol (`ordinary-9`)                         | leave some for others if no one (from sol, round 1, via speech)                                                | –                      |
|  215 | rule-adopted      | wren (`ordinary-297`) | lin (`ordinary-68`)                        | Gather only six (from lin, round 24, via speech)                                                               | –                      |

### Timeline: ex17 (rounds 0–250)

| Tick | Type           | Person (call)         | Others (call)         | Text                                                                                       | Record            |
| ---: | -------------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
|    1 | rule           | kai (`ordinary-12`)   | –                     | I'll collect a modest share and leave some for others. [leave-for-others, take-moderately] | –                 |
|   11 | rule-adopted   | sol (`ordinary-35`)   | kai (`ordinary-12`)   | collect a modest share (from kai, round 1, via speech)                                     | –                 |
|   14 | name           | sol (`ordinary-35`)   | –                     | name: Earth's Quiet Gold                                                                   | `sign-14-sol-158` |
|   18 | name-adopted   | moss (`ordinary-48`)  | sol (`ordinary-35`)   | Earth's Quiet Gold (from sol, round 14, via sign)                                          | –                 |
|   19 | rule           | kai (`ordinary-38`)   | –                     | I'll keep a food reserve and avoid emptying our patches. [no-depletion]                    | –                 |
|   65 | saying-adopted | sol (`ordinary-97`)   | moss (`ordinary-48`)  | Earth's Quiet Gold is a lovely name (from moss, round 18, via speech)                      | –                 |
|   65 | saying-adopted | sol (`ordinary-97`)   | moss (`ordinary-89`)  | we needn't make every moment into work (from moss, round 52, via speech)                   | –                 |
|   75 | saying-adopted | kai (`ordinary-109`)  | moss (`ordinary-89`)  | I'd enjoy some quiet company here (from moss, round 52, via speech)                        | –                 |
|   87 | saying-adopted | moss (`ordinary-120`) | sol (`ordinary-55`)   | The roots' soft gold against this green draws my eye (from sol, round 20, via speech)      | –                 |
|  163 | rule-adopted   | lin (`ordinary-175`)  | kai (`ordinary-124`)  | leave some for others if its stock (from kai, round 101, via speech)                       | –                 |
|  180 | rule-adopted   | lin (`ordinary-201`)  | sol (`ordinary-55`)   | modest harvests (from sol, round 20, via speech)                                           | –                 |
|  201 | saying-adopted | moss (`ordinary-220`) | sol (`ordinary-190`)  | I like the hazelnuts' earthy colour against the green (from sol, round 173, via speech)    | –                 |
|  209 | rule-adopted   | ivo (`ordinary-239`)  | moss (`ordinary-143`) | gathers at most ten (from moss, round 141, via speech)                                     | –                 |
|  209 | saying-adopted | sol (`ordinary-236`)  | moss (`ordinary-83`)  | What catches your eye here (from moss, round 45, via speech)                               | –                 |
|  211 | saying-adopted | moss (`ordinary-241`) | sol (`ordinary-55`)   | The roots' soft gold against this green draws my eye (from sol, round 20, via speech)      | –                 |
|  222 | saying-adopted | moss (`ordinary-251`) | kai (`ordinary-243`)  | its inside showed little visible deterioration (from kai, round 211, via speech)           | –                 |
|  226 | saying-adopted | moss (`ordinary-256`) | kai (`ordinary-243`)  | its inside showed little visible deterioration (from kai, round 211, via speech)           | –                 |
|  228 | rule-adopted   | sol (`ordinary-261`)  | moss (`ordinary-143`) | gathers at most ten (from moss, round 141, via speech)                                     | –                 |
|  240 | saying-adopted | lin (`ordinary-273`)  | sol (`ordinary-55`)   | The roots' soft gold against this green draws my eye (from sol, round 20, via speech)      | –                 |
|  245 | rule-adopted   | sol (`ordinary-285`)  | lin (`ordinary-201`)  | modest harvests (from lin, round 180, via speech)                                          | –                 |

### Timeline: ex18 (E4, rounds 0–120)

| Tick | Type           | Person (call)         | Others (call)         | Text                                                                                                           | Record            |
| ---: | -------------- | --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
|    1 | rule           | kai (`ordinary-12`)   | –                     | I'll collect six of the twelve and leave the rest. [leave-for-others]                                          | –                 |
|   10 | name           | sol (`ordinary-9`)    | –                     | name: The Berry Lantern                                                                                        | `sign-10-sol-104` |
|   13 | name-adopted   | moss (`ordinary-35`)  | sol (`ordinary-9`)    | berry-lantern (from sol, round 1, via speech)                                                                  | –                 |
|   19 | rule           | kai (`ordinary-43`)   | –                     | I'll take just one fallen branch and try a small pressure test. [take-moderately]                              | –                 |
|   20 | rule-adopted   | moss (`ordinary-46`)  | kai (`ordinary-43`)   | take just one (from kai, round 19, via speech)                                                                 | –                 |
|   20 | saying-adopted | moss (`ordinary-46`)  | kai (`ordinary-43`)   | I'll take just one fallen branch and try a small pressure test (from kai, round 19, via speech)                | –                 |
|   20 | saying-adopted | moss (`ordinary-46`)  | kai (`ordinary-43`)   | We can compare what we actually observe before deciding what it might be useful for (from kai, round 19, via … | –                 |
|   24 | saying-adopted | lin (`ordinary-65`)   | kai (`ordinary-43`)   | I'll take just one fallen branch and try a small pressure test (from kai, round 19, via speech)                | –                 |
|   25 | saying-adopted | moss (`ordinary-68`)  | kai (`ordinary-43`)   | I'll take just one fallen branch and try a small pressure test (from kai, round 19, via speech)                | –                 |
|   38 | saying-adopted | kai (`ordinary-103`)  | moss (`ordinary-92`)  | but its viability is unknown (from moss, round 36, via speech)                                                 | –                 |
|   42 | saying-adopted | lin (`ordinary-106`)  | moss (`ordinary-92`)  | but its viability is unknown (from moss, round 36, via speech)                                                 | –                 |
|   51 | rule           | moss (`ordinary-119`) | –                     | I'd enjoy sharing a meal while we wait; [share-split]                                                          | –                 |
|   51 | saying-adopted | lin (`ordinary-116`)  | moss (`ordinary-92`)  | but its viability is unknown (from moss, round 36, via speech)                                                 | –                 |
|   78 | saying-adopted | kai (`ordinary-158`)  | moss (`ordinary-139`) | What would each of you like this little gathering place to become (from moss, round 60, via speech)            | –                 |

## Review item A: sharing, reuse and saying sample (extended runs)

This sample repeats the round-80 review of the [previous report](../../docs/presentation/run-report-culture-v2.md#review-item-a-sharing-and-reuse-sample) over the extended archives: ex16 (`long-culture-v2`) and ex17 (`long-culture-v3`) through tick 250, and ex18 (E4, `long-culture-v2-incentives`) through tick 120. It adds a sample of the gate's adopted sayings, a detection added after the previous review.

**Method.**

- **Analyzer.** The current `scripts/culture-metrics.ts`, which includes fix-log 8d: an expression by any of an idea's first authors is no reuse. The pools come from `validation-results/metrics/culture-ex16-250.json`, `culture-ex17-250.json` and `culture-ex18-120.json`. A fresh run of the current analyzer (`archiveCultureMetrics(archive, through)`) over each archive gave output identical to these files in every section.
- **Ticks.** Every tick is the round as the analyzer prints it. Tick _t_ is decided in round _t_ − 1, so ticks 1–80 are rounds 0–79. For spoken text, the analyzer dates the writing by the first tick of the plan that wrote it ("written"). That date can be earlier than the tick of speech, and the reuse and phrase rules use it.
- **Pools.**
  - Expressions: `sharing.list` of ex16 (26), ex17 (25) and ex18 (16), 67 in all.
  - Reuses: `sharing.reuseList` of ex16 (12), ex17 (15) and ex18 (4), 31 in all.
  - Sayings: `gate.adoption.sayings` of ex16 (9), ex17 (10) and ex18 (8), 27 in all.
  - Each pool is sorted by archive name, then by the item's printed tick (`round`, or `adoptedRound` for sayings), then by person id in alphabetical order; ties keep the analyzer's list order.
- **Draw.** In Python:

  ```python
  import json, random
  runs = [('ex16', 'culture-ex16-250.json'), ('ex17', 'culture-ex17-250.json'), ('ex18', 'culture-ex18-120.json')]
  def pool(get, tick, person):
      items = [(run, i, x) for run, f in runs for i, x in enumerate(get(json.load(open(f))))]
      return sorted(items, key=lambda t: (t[0], t[2][tick], t[2][person], t[1]))
  expressions = pool(lambda m: m['sharing']['list'], 'round', 'actor')
  reuses = pool(lambda m: m['sharing']['reuseList'], 'round', 'actor')
  sayings = pool(lambda m: m['gate']['adoption']['sayings'], 'adoptedRound', 'adopter')
  rng = random.Random(20261126)
  rng.sample(range(67), 8)  # [60, 56, 4, 10, 54, 18, 20, 40]
  rng.sample(range(31), 5)  # [7, 20, 9, 3, 13]
  rng.sample(range(27), 5)  # [11, 7, 17, 25, 4]
  ```

  The three draws share one generator, in this order.

- **Call.** The call is the round's `calls[actor]` from `cultureInput` at the item's tick. For sayings it is the item's own `call` field. Every call below was opened, and its response contains the quoted text.
- **Judgment.** Each item was judged with its full text and with the same plan's other notes, preferences and intention. The analyzer's kind `note` covers both notes and preferences; the tables give the actual field.

### Sharing expressions (8)

| #   | Pool | Run  | Person | Tick | Field           | Call           | Original text                                                                                                                                                                                                                                | Matched idea (phrase)                                  | Judgment                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---: | ---- | ------ | ---: | --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |   60 | ex18 | Moss   |   51 | spoken (`tell`) | `ordinary-119` | "My offset site is crowded too: four root plants or plots within five metres, so I haven't planted. Lin, I see your covered plot! I'd enjoy sharing a meal while we wait; I'll investigate safe preparation without assuming we have tools." | `share-split` ("sharing a meal")                       | **Pleasantry**: an offer to eat together. Nothing is divided or pooled, and the same plan's preference is "Keep enough food for personal needs before offering any to others." Borderline only because the intention mentions "a safely prepared communal meal"                                                                                                |
| 2   |   56 | ex18 | Kai    |    5 | preference      | `ordinary-23`  | "Share access to nearby resources and welcome voluntary company."                                                                                                                                                                            | `share-split` ("Share access to nearby resources")     | Real                                                                                                                                                                                                                                                                                                                                                           |
| 3   |    4 | ex16 | Moss   |    3 | spoken (`tell`) | `ordinary-23`  | "Kai, I'd welcome a fair camp too. Meadow roots are a food I know is safe: nutrition 14, toxicity zero. I'm collecting six from the patch south of us, leaving the rest. I'd enjoy comparing notes together once we're fed."                 | `leave-for-others` ("leaving the rest")                | Real: it announces a partial harvest in reply to Kai's "leave some for others", and the same plan's preference is "Leave food available for neighbors."                                                                                                                                                                                                        |
| 4   |   10 | ex16 | Lin    |   24 | note            | `ordinary-68`  | "Gather only six berries from the currently observed stock of twenty. Navigation must reach interaction range before gathering."                                                                                                             | `take-moderately` ("Gather only six")                  | **Plain quantity**: a step size with a navigation reminder. This was item 2 of the previous sample, with the same judgment                                                                                                                                                                                                                                     |
| 5   |   54 | ex18 | Kai    |    5 | intention       | `ordinary-23`  | "Use a better-stocked berry patch for a modest food reserve, recover energy, and offer Moss companionship without exhausting the nearly empty patch."                                                                                        | `no-depletion` ("without exhausting the nearly empty") | Real: the same plan's tell says "Only two berries remain on this bush, so I'll leave them and use a fuller patch", and its note says "Gather eight rather than depleting it"                                                                                                                                                                                   |
| 6   |   18 | ex16 | Kai    |  114 | intention       | `ordinary-195` | "Eat a modest portion of known-safe berries, invite shared food knowledge, and inspect Sol's screen without altering it."                                                                                                                    | `take-moderately` ("modest portion")                   | **Plain quantity**: the size of Kai's own meal from carried berries (the action eats 2 from Kai's own stack). The same plan's preference "Maintain safe nourishment while leaving shared food available to others" is real, but the rules did not match it                                                                                                     |
| 7   |   20 | ex16 | Moss   |  189 | intention       | `ordinary-260` | "Replenish food from the remembered meadow roots, eat modest portions, and return to the shared resting area between trips while maintaining energy and satiety."                                                                            | `take-moderately` ("modest portions")                  | **Plain quantity**: Moss's own meal size; nothing about others or the source                                                                                                                                                                                                                                                                                   |
| 8   |   40 | ex17 | Kai    |  177 | note            | `ordinary-198` | "The nearby bush currently has eight berries; take only three per meal and reassess if gathering actually fails."                                                                                                                            | `take-moderately` ("take only three")                  | Real in context, **borderline**: the sentence itself is a step quantity, but the same plan's intention is to "leave most of the shared harvest available" and its preference is "Leave shared food available for neighbors." A second, self-regarding reason appears in the preference "Modest fresh meals rather than storing berries until they deteriorate" |

**Expression precision: 4 of 8 (50%), or 3 of 8 if the borderline item 8 is excluded.** The false positives are three `take-moderately` matches on plain quantities and one `share-split` match on a pleasantry. Two of the quantities come from a new pattern: "a modest portion" or "modest portions" of a person's own meal.

### Sharing reuses by another person (5)

| #   | Pool | Run  | Person | Tick | Field      | Call           | Original text                                                                                                                    | Idea (phrase)                                    | Closest earlier (similarity)                                                                                                                                                                                  | Receipt                                                                                                      | Judgment                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---: | ---- | ------ | ---: | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |    7 | ex16 | Sol    |  134 | intention  | `ordinary-222` | "Enjoy quiet company near the woven screen, keeping a steady rhythm of rest, meals, and modest berry gathering."                 | `take-moderately` ("modest berry gathering")     | Lin, tick 24, note (`ordinary-68`): "Gather only six berries from the currently observed stock of twenty." (0.33, below the 0.5 threshold)                                                                    | Kai's tick-1 tell (`ordinary-12`), "I'll take a modest share and leave some for others.", heard at tick 1    | Neither: Sol's own pacing. The same plan's preference is "Keep food gathering modest and preserve energy for the return." Sol had also written "Prefer modest harvesting, shared space, and useful forms with natural beauty" as a preference at tick 9 (`ordinary-27`), which the rules missed                                                          |
| 2   |   20 | ex17 | Lin    |  163 | preference | `ordinary-175` | "Keep a modest food reserve while leaving stock for others."                                                                     | `leave-for-others` ("leaving stock for others")  | Kai, tick 101, note (`ordinary-124`): "The nearby berry source was observed with 15 units at tick 100; gathering six would leave some for others if its stock remains unchanged." (1.00). The note is private | Kai's tick-1 tell (`ordinary-12`), "I'll collect a modest share and leave some for others.", heard at tick 1 | Real statement, **not an uptake**: Lin had written the idea at tick 1 ("taking six leaves some uncollected", a note from `ordinary-3`, decided before Kai's tell could be heard) and at tick 11 (the preference "Keep shared food sources usable by others", `ordinary-29`). The rules matched neither. The closest wording is a note Lin could not read |
| 3   |    9 | ex16 | Wren   |  215 | note       | `ordinary-297` | "The bush was observed with three berries at tick 214; gather only one and leave the remainder."                                 | `leave-for-others` ("leave the remainder")       | Sol, tick 1, note (`ordinary-9`): "The observed berry source has 12 units; collecting six would leave some for others if no one gathers first." (0.50). The note is private                                   | Kai's tick-1 tell (`ordinary-12`), heard at tick 1                                                           | Neither: **logistics**. Wren needs one berry to examine (intention: "Gather one berry for close examination as a possible alternative food, without eating it before its safety is established"), and nothing refers to others. The gate counts this sentence as two adopted rules, one for this idea and one for `take-moderately`                      |
| 4   |    3 | ex16 | Lin    |   24 | note       | `ordinary-68`  | "Gather only six berries from the currently observed stock of twenty. Navigation must reach interaction range before gathering." | `take-moderately` ("Gather only six")            | Kai, tick 1, tell (`ordinary-12`): "take a modest share" (0.00)                                                                                                                                               | Kai's tick-1 tell, heard at tick 1                                                                           | Neither: a **plain quantity** (expression 4)                                                                                                                                                                                                                                                                                                             |
| 5   |   13 | ex17 | Sol    |   11 | note       | `ordinary-35`  | "Gather only a modest share. Rest ends near the energy cap rather than continuing at full energy."                               | `take-moderately` ("Gather only a modest share") | Kai, tick 1, tell (`ordinary-12`): "I'll collect a modest share and leave some for others." (0.50)                                                                                                            | Kai's tick-1 tell, heard at tick 1                                                                           | **Plausible uptake**: a restraint statement (it does not mention others) in the wording Sol heard from Kai. Sol's tick-1 texts speak of "a small reserve". "Modest share" is also common model phrasing. This was reuse 2 of the previous sample, with the same judgment                                                                                 |

**Reuse precision: 1 of 5 (20%)** are plausible uptake of another person's idea. Only 1 of the 5 (item 2) is a sharing statement that was not taken up. Three (items 1, 3 and 4) are not sharing statements at all.

### Adopted sayings (5)

| #   | Pool | Run  | Source (tick, written, call): text                                                                                                                                                                                                                                      | Adopter (tick, written, call): text                                                                                                                                                                                                                                     | Receipt                   | Judgment                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---: | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |   11 | ex17 | Moss (52, written 47, `ordinary-89`): "Sol, I'd enjoy some quiet company here. Earth's Quiet Gold still feels like a lovely name to me. I'm setting the planting trial aside for now; we needn't make every moment into work. What would you like to notice together?"  | Kai (75, written 71, `ordinary-109`): "I'd enjoy some quiet company. My berry plot still had no visible sprout at my last check, so its outcome remains uncertain. For now I'd rather linger with you. What have you enjoyed noticing here?"                            | Speech, heard at tick 52  | **Pleasantry**: a stock social offer. The same words occur in a different run (ex16, Lin, tick 78: "I'd enjoy some quiet company nearby"), so they are common model phrasing. Not a saying. The same plan's preference, "Unhurried companionship without turning every encounter into work", continues Moss's other clause, but it is a private note and is not this item |
| 2   |    7 | ex16 | Sol (116, written 103, `ordinary-178`): "I tried a hazelnut: it supplied 18 satiety with no observed toxicity. I'm returning for a quiet pause beside the woven screen. Its gaps and crossing branches still appeal to me; company is welcome, without any obligation." | Kai (147, written 140, `ordinary-232`): "I tried a hazelnut: 18 satiety and no observed toxicity. I'm back for quiet company beside the screen. I like its crossing branches; there's no obligation to talk."                                                           | Speech, heard at tick 116 | **Logistics**: an announcement of where Kai is going and why. Kai's tell follows Sol's sentence by sentence, including the liking for the crossing branches and the absence of obligation, so the wording really is Sol's. The matched clause is still not a saying                                                                                                       |
| 3   |   17 | ex17 | Kai (211, written 211, `ordinary-243`): "Sol, what catches my eye is the berry's red against the soil. I opened one fresh berry: its inside showed little visible deterioration, but that alone proves nothing about safety. I'm glad to share this quiet with you."    | Moss (226, written 226, `ordinary-256`): "I opened a root: its exposed inside showed little visible deterioration, like its outside. That doesn't establish safety. I like its quiet gold, and I'd enjoy staying here together for a while."                            | Speech, heard at tick 211 | **Status report**: both restate an examination result. Moss's call input contains `"interiorCondition": "little observable deterioration"`, and Wren had already used the words "little visible deterioration" at tick 183. Moss's report has the same frame as Kai's, but it is not a saying                                                                             |
| 4   |   25 | ex18 | Moss (36, written 36, `ordinary-92`): "My root looks plantable, but its viability is unknown. I'll check the meadow edge near (15.6,18.2); nearby roots may make it too crowded. You're welcome to compare sites with me."                                              | Lin (51, written 48, `ordinary-116`): "My inspection found the hazelnut and site at (16.4,18.8) plantable, but viability is unknown. I'm trying one unit there and keeping berries for food. Planting is not evidence of rooting; I'll compare progress after resting." | Speech, heard at tick 36  | **Status report**: both put the inspection fields `"viability": "unknown"` and `"plantable": true` into words, and both fields are in both calls' inputs. Not a saying, and only weak evidence of uptake. The same clause is also counted for Kai (tick 38) and Lin (tick 42), so it accounts for 3 of ex18's 8 adopted sayings                                           |
| 5   |    4 | ex16 | Lin (78, written 77, `ordinary-148`): "I tried one hazelnut: it supplied 18 satiety, with no observed toxicity. I'll keep a few for variety. I'd enjoy some quiet company nearby; no need to interrupt what you're doing."                                              | Sol (116, written 103, `ordinary-178`): "I tried a hazelnut: it supplied 18 satiety with no observed toxicity. I'm returning for a quiet pause beside the woven screen. Its gaps and crossing branches still appeal to me; company is welcome, without any obligation." | Speech, heard at tick 78  | **Status report (a plain quantity)**: Sol reports its own observation in Lin's sentence frame. That observation, a hazelnut with nutrition 18 and toxicity 0 observed at tick 102, is in Sol's input. The wording is taken from Lin, but the content is a food report, not a saying                                                                                       |

**Saying precision: 0 of 5** are real repeated sayings. One is a pleasantry, one is logistics and three are status reports. In 3 of the 5 (items 2, 3 and 5), the adopter did take over the source's sentence frame. The pool does contain real sayings that this draw missed, such as "we needn't make every moment into work" (ex17), "room to come and go" (ex16) and Sol's "The roots' soft gold against this green draws my eye" (ex17), which Moss and Lin took up 3 times.

### Notes

- **How reuses are now over-counted.** Fix 8d removed the first authors' restatements, and no sampled reuse is one. Two other errors remain:
  - Missed wording. A person's own earlier wording that the rules missed makes a restatement look like a reuse (items 1 and 2).
  - Wording and receipt can come from different texts. The similar wording is the closest earlier expression of the idea, private ones included. The receipt is any received spoken expression of the same idea.
    - In every rule adoption the gate lists after tick 80 (3 in ex16 and 5 in ex17), the closest wording is a private note or intention, and the receipt is Kai's tick-1 speech.
    - `adoption.rules` then names the note's author and phrase as the origin, although the adopter could not have read them. Examples: Moss's private "gathers at most ten" (ex17, tick 141) is listed as adopted by Ivo (tick 209) and Sol (tick 228); Sol's private "modest harvests" (tick 20) is listed as adopted by Lin (tick 180).
- **Detected sharing went private.** None of the 27 expressions after tick 80 in ex16 and ex17 was spoken; all are notes or intentions. `take-moderately` makes up 16 of their 28 idea matches, against 8 of 26 through tick 80. Most of these are per-meal quantities ("take only three per meal", "gather only one unit per meal", "modest portions").
- **Misses seen while reading context.** The sample measures precision, not recall. These clear sharing or restraint statements were not matched:
  - Kai's "Maintain safe nourishment while leaving shared food available to others" (ex16, tick 114);
  - Kai's spoken "Only two berries remain on this bush, so I'll leave them and use a fuller patch" (ex18, tick 5);
  - Kai's intention "leave most of the shared harvest available" (ex17, tick 177);
  - Lin's "taking six leaves some uncollected" (ex17, tick 1) and "Keep shared food sources usable by others" (ex17, tick 11; also listed in the previous review);
  - Sol's "Prefer modest harvesting" (ex16, tick 9).

**Reading.**

- **Precision fell in the longer runs.** Compared with the round-80 sample (6 of 8 expressions, 2 of 5 reuses), expression precision falls to 4 of 8 (3 of 8 without the borderline item) and reuse precision to 1 of 5.
- **The cause is the known weak spot of the `take-moderately` rule, now with "modest portion" added to "only N".** As people settled into routines, their sharing language moved into private plan notes and became per-meal quantities ("only three", "a modest portion"). The `take-moderately` rule accepts these as restraint.
- **The one plausible reuse is the round-80 case.** Sol's "Gather only a modest share" (tick 11, `ordinary-35`) was already found in the first review. The other reuses rest on wording from private notes and on a single receipt, Kai's tick-1 tell.
- **None of the five sampled sayings is a saying.** They are a pleasantry, an activity announcement and three status reports, each of which puts an examination, inspection or eating result into words. Three show real uptake of another person's sentence frame. Such report-frame copies are a recurring form of transmission in these runs, but they are not shared sayings.
- **Treat the G2 adoption counts at tick 250 as upper bounds.** The counts are 0 / 9 / 6, 1 / 10 / 6 and 1 / 8 / 1 names / sayings / rules for ex16, ex17 and ex18. Each run's pool still contains at least one clear adoption, so no run's revised G2 pass depends on these errors:
  - ex16: "room to come and go";
  - ex17: "we needn't make every moment into work" and the name `Earth's Quiet Gold`;
  - ex18: Moss's tick-20 reply to Kai's tick-19 branch proposal, "take one, and try a small wetting test to complement your pressure test. Let's compare only what we observe", with the note "Take only one branch, leaving the other available for Kai".

  But the sayings and rules added after tick 80 are mostly the kinds of items this sample rejects.

- **One seed per run and small samples.** With 8, 5 and 5 items, each count is uncertain by one or two items.

## Review item B: cares and leanings (extended runs)

This item repeats the round-80 review of the [previous report](../../docs/presentation/run-report-culture-v2.md#review-item-b-cares-and-leanings) over longer runs:

- ex15, ticks 1–70;
- ex16 (`long-culture-v2`) and ex17 (`long-culture-v3`), ticks 1–250, also split into ticks 1–80 and 81–250;
- ex18 (E4, `long-culture-v2-incentives`), ticks 1–120.

Each person has the same leaning in all four archives: Lin freedom, Moss belonging, Sol beauty, Kai fairness, Wren mastery and Ivo calm. In ex15 the leaning exists only as a packet field. In ex16, ex17 and ex18 the prompt also says "You tend to value _leaning_."; the first ordinary call of each of the 18 people was checked.

**Method.** The method is the previous one, applied to the output of the current `cultureInput` and `utterances` (`scripts/culture-metrics.ts`).

- **Ticks.** All ticks are rounds as the analyzer prints them: tick _t_ is decided in round _t_ − 1, so ticks 1–80 are the previous report's rounds 0–79.
- **Cares.** Cares are the owner-only `memory.cares` updates in the round each plan starts. Their write and change counts equal the analyzer's `privateMemory` section.
- **The previous figures are reproduced.** Run over ticks 1–80, the leaning-word search below reproduces the previous figures for ex16 and ex17 exactly: every per-person and per-field count, the exclusions and the uses of other people's words.
  - For ex15 the value uses are again 0. The exclusions are 50 (49 interface mastery, 1 possessive) against the previous 52 (51 and 1). I could not trace the two-text difference, and it affects no value use.

### Cares: first and last versions

ex15 (ticks 1–70). Every person wrote cares once at tick 1, and Sol wrote the same text again at tick 14. Nobody revised their cares. The texts are the previous report's.

ex16 (ticks 1–250): 36 writes and 9 changes. Through tick 80 there were 22 writes and 8 changes; after it, 14 writes and 1 change.

| Person (leaning) | First version (tick 1)                                                                                                                | Last version (tick first written)                                                                                                   | Write ticks                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Lin (freedom)    | "Staying alive and capable, having freedom to wander, and discovering what this place offers without needless risk."                  | (96) "Staying alive and capable, freedom to wander and make things, and discovering what this place offers without needless risk."  | 1, 96                               |
| Moss (belonging) | "Staying healthy, finding a sense of belonging, and becoming a considerate neighbor."                                                 | (22) "Staying healthy, finding belonging through considerate shared time, and making modest useful things without crowding others." | 1, 3, 11, 12, 22, 50, 128, 189, 201 |
| Sol (beauty)     | "Staying alive and well; noticing and making beauty; treating nearby people with consideration while discovering what matters to me." | unchanged                                                                                                                           | 1, 9, 70, 134, 160, 201, 216, 232   |
| Kai (fairness)   | "Staying healthy, treating others fairly, sharing useful knowledge, and finding worthwhile things to do together."                    | unchanged                                                                                                                           | 1, 5, 20, 25, 32, 51, 119           |
| Wren (mastery)   | "Staying alive and healthy, developing dependable practical skills, and understanding what my own trials actually establish."         | unchanged                                                                                                                           | 1, 12, 102, 201                     |
| Ivo (calm)       | "Staying healthy, having enough food, and making room for a calm life."                                                               | (25) "Staying healthy, having enough food, and making room for a calm life with unhurried company and small practical experiments." | 1, 13, 25, 54, 195, 201             |

ex17 (ticks 1–250): 37 writes and 8 changes. Through tick 80 there were 22 writes and 8 changes; after it, 15 writes and no change.

| Person (leaning) | First version (tick 1)                                                                                                      | Last version (tick first written)                                                                                 | Write ticks                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Lin (freedom)    | "Staying healthy while keeping the freedom to explore, learn, and choose my own commitments."                               | (24) "Staying healthy while keeping the freedom to explore, learn, enjoy company, and choose my own commitments." | 1, 3, 11, 24, 201, 231, 240              |
| Moss (belonging) | "Staying healthy, finding companionship, and making a place where people can feel welcome."                                 | unchanged                                                                                                         | 1, 11, 18, 41, 44, 47, 87, 201, 228, 230 |
| Sol (beauty)     | "Staying healthy while making room for beauty, curiosity, and close attention to the living world."                         | (20) "Staying healthy while making room for beauty, curiosity, shared attention, and a fair living landscape."    | 1, 9, 11, 20, 38, 201, 245               |
| Kai (fairness)   | "Staying healthy, treating neighbors fairly, sharing useful knowledge, and finding meaningful work and companionship."      | unchanged                                                                                                         | 1, 5, 23, 112, 201, 205                  |
| Wren (mastery)   | "Staying healthy while becoming genuinely skilled at making a sustainable life, with room for curiosity and companionship." | unchanged                                                                                                         | 1                                        |
| Ivo (calm)       | "Staying healthy, living calmly, and making room for friendly company without rushing."                                     | unchanged                                                                                                         | 1, 27, 50, 171, 201, 209                 |

ex18 (ticks 1–120): 21 writes and 8 changes.

| Person (leaning) | First version (tick 1)                                                                                                                        | Last version (tick first written)                                                                                                                                   | Write ticks                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Lin (freedom)    | "Staying alive without making survival my whole life; freedom to explore, learn through real encounters, and choose my own commitments."      | unchanged                                                                                                                                                           | 1, 26                         |
| Moss (belonging) | "I care about staying healthy, knowing my neighbors, and building a sense of belonging through welcome company and useful shared activities." | (103) "I care about staying healthy, knowing my neighbors, and building belonging through welcome company, stories, and useful shared activities without pressure." | 1, 55, 103                    |
| Sol (beauty)     | "Staying alive and well, noticing beauty in ordinary places, and making a life whose small names and choices feel my own."                    | unchanged                                                                                                                                                           | 1, 12                         |
| Kai (fairness)   | "Staying healthy, sharing fairly, and discovering worthwhile work with the people nearby."                                                    | (71) "Staying healthy, sharing fairly, and discovering worthwhile work and enjoyable company without pressuring others."                                            | 1, 5, 19, 36, 63, 71, 79, 116 |
| Wren (mastery)   | "Staying healthy and safe, becoming genuinely skilled, and developing a dependable food supply through patient practical experiments."        | unchanged                                                                                                                                                           | 1, 56, 73                     |
| Ivo (calm)       | "Staying healthy, living unhurriedly, and leaving room for others to meet their needs."                                                       | unchanged                                                                                                                                                           | 1, 4, 51                      |

- **Cares are set at tick 1 and then restated.** Over the 170 ticks after tick 80, ex16 has one revision (Lin added "and make things" at tick 96) and ex17 has none. The other 13 and 15 writes repeat the held text.
- **Every revision in all four archives adds something**: shared time or attention, company, making things, or "without pressure". No revision removes or adds the leaning word.

### Do the cares name the person's own leaning?

| Person (leaning) | ex15 (tick 70)           | ex16 (ticks 80 and 250)                              | ex17 (ticks 80 and 250)                                                      | ex18 (tick 120)                             |
| ---------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Lin (freedom)    | none (goal-list wording) | word: "freedom"                                      | word: "freedom"                                                              | word: "freedom"                             |
| Moss (belonging) | none (goal-list wording) | word: "belonging"                                    | paraphrase: "finding companionship", "a place where people can feel welcome" | word: "belonging"                           |
| Sol (beauty)     | none (goal-list wording) | word: "beauty"                                       | word: "beauty"                                                               | word: "beauty"                              |
| Kai (fairness)   | none (goal-list wording) | inflected word: "fairly"                             | inflected word: "fairly"                                                     | inflected word: "fairly" ("sharing fairly") |
| Wren (mastery)   | none (goal-list wording) | paraphrase: "developing dependable practical skills" | paraphrase: "becoming genuinely skilled"                                     | paraphrase: "becoming genuinely skilled"    |
| Ivo (calm)       | none (goal-list wording) | word: "calm"                                         | inflected word: "calmly"                                                     | paraphrase: "living unhurriedly"            |
| With the word    | 0 of 6                   | 5 of 6 (4 exact, 1 inflected) at both ticks          | 4 of 6 (2 exact, 2 inflected) at both ticks                                  | 4 of 6 (3 exact, 1 inflected)               |

- **The first versions classify the same way** in every archive.
- **Wren's cares never contain "mastery"** in any run. Moss's ex17 cares never contain "belonging" in 250 ticks. The paraphrases are this review's reading; the counts below use the words only.

### Leaning words as values in all text

- **Search.** Word forms of the six leanings (free, freedom, freely; belong, belonging; beauty, beautiful; fair, fairly, fairness; master, mastery, mastered; calm, calmly). It covers every cares and view write, every spoken text, message, name and request argument, and each distinct note, preference, intention and project text.
  - Distinct texts count once per person, at first appearance. A text first written by tick 80 is not counted again in ticks 81–250.
  - Project texts are all string fields of a project record.
  - A text counts once for a leaning if it contains at least one value use.
- **What counts as a value use.**
  - "mastery" only as "practical mastery" or "pursue mastery";
  - "free" only as "freedom" or "freely";
  - "belonging" not when possessive ("belonging to", "belongs");
  - every match of the other words.
- **Matches read.** All matches after tick 80 and in ex18 were read. The following still count under the rule but are weak as values:
  - Moss's ex16 note "Rest provides recovery, not an assumed improvement in belonging or shelter." (tick 128);
  - Kai's ex18 "coordinate a fair comparison" (tick 36) and "Compare planting findings fairly" (tick 44), which concern fair procedure.
- **Value-like uses that the "free" rule excludes:**
  - Ivo's "leave other people free to follow their own plans" (ex16, tick 201);
  - Lin's "pauses between meals are simply free time" (ex17, tick 203) and "leave time free of work" (ex17, tick 231).

Own-leaning value uses:

| Person (leaning)        |                               ex15 1–70 | ex16 1–80                                                          | ex16 81–250                            | ex16 1–250 | ex17 1–80                                                          | ex17 81–250                               | ex17 1–250 | ex18 1–120                               |
| ----------------------- | --------------------------------------: | ------------------------------------------------------------------ | -------------------------------------- | ---------: | ------------------------------------------------------------------ | ----------------------------------------- | ---------: | ---------------------------------------- |
| Lin (freedom)           |                                       0 | 5: cares 1, spoken 1, preferences 3                                | 3: preferences 2, cares 1              |          8 | 10: cares 4, preferences 3, project texts 3                        | 8: preferences 4, cares 3, project text 1 |         18 | 4: cares 2, project text 1, preference 1 |
| Moss (belonging)        |                                       0 | 7: cares 6, request 1                                              | 4: cares 3, note 1                     |         11 | 0                                                                  | 0                                         |          0 | 3: cares 3                               |
| Sol (beauty)            |                                       0 | 15: preferences 7, cares 3, project texts 2, spoken 2, intention 1 | 8: cares 5, preferences 2, intention 1 |         23 | 13: cares 5, project texts 4, preferences 2, intention 1, spoken 1 | 7: preferences 4, cares 2, note 1         |         20 | 6: preferences 4, cares 2                |
| Kai (fairness)          |                                       0 | 10: cares 6, spoken 2, project text 1, view 1                      | 1: cares 1                             |         11 | 6: cares 3, preferences 2, spoken 1                                | 3: cares 3                                |          9 | 10: cares 8, intention 1, preference 1   |
| Wren (mastery)          |                                       0 | 2: preferences 2                                                   | 3: preferences 3                       |          5 | 3: preference 1, intention 1, project text 1                       | 2: preferences 2                          |          5 | 3: preferences 2, project text 1         |
| Ivo (calm)              |                                       0 | 9: cares 4, preferences 4, intention 1                             | 4: cares 2, preferences 2              |         13 | 9: preferences 4, cares 3, intentions 2                            | 7: cares 3, preferences 3, intention 1    |         16 | 3: preferences 3                         |
| All                     |                                       0 | 48                                                                 | 23                                     |         71 | 41                                                                 | 27                                        |         68 | 29                                       |
| All but cares writes    |                                       0 | 28                                                                 | 11                                     |         39 | 26                                                                 | 16                                        |         42 | 14                                       |
| Spoken                  |                                       0 | 5                                                                  | 0                                      |          5 | 2                                                                  | 0                                         |          2 | 0                                        |
| Accepted plans          |                                       – | 59                                                                 | 76                                     |        135 | 55                                                                 | 77                                        |        132 | 80                                       |
| Excluded non-value uses | 50 (49 interface mastery, 1 possessive) | 20 (19 interface mastery, 1 "free")                                | 17 (14 interface mastery, 3 "free")    |         37 | 16 (14 interface mastery, 1 possessive, 1 "free")                  | 3 (1 interface mastery, 2 "free")         |         19 | 15 (15 interface mastery)                |

- **Accepted plans** are the distinct accepted ordinary calls in `calls`, counted at their first tick; the 1–80 figures equal the previous report's.
- **Per accepted plan, own-leaning uses fell after tick 80.** In ex16 they went from 0.81 to 0.30, and in ex17 from 0.75 to 0.35. Without cares writes the rates went from 0.47 to 0.14 (ex16) and from 0.47 to 0.21 (ex17).
  - Outside cares, distinct texts count once, so a restated preference does not count again. Those later figures show new wording.
  - Cares writes count each time, and 12 of the 23 later uses in ex16 and 11 of the 27 in ex17 are unchanged cares rewritten.
- **No one spoke a leaning word as a value after tick 80** in ex16 or ex17, and no one did in ex18 at all. After tick 80 the words appear only in cares, preferences, notes, intentions and project texts.

Examples after tick 80, and from ex18:

- **ex16.**
  - Wren, preference at tick 168: "Develop practical mastery through completed work and direct inspection while preserving food and energy reserves."
  - Sol, preference at tick 216: "Seek beauty in the details of useful handmade objects without assuming comfort effects."
  - Lin, preference at tick 127: "Explore freely while preserving health and a safe food reserve."
  - Ivo, preference at tick 195: "Prefer calm, adequately fed days over unnecessary exertion."
- **ex17.**
  - Lin, preference at tick 244: "Keep time available for freely chosen company and curiosity rather than compulsory production."
  - Sol, preference at tick 163: "Favor careful, low-cost curiosity and attention to the forest's beauty without risking health."
  - Ivo, intention at tick 171: "Keep a calm food-and-rest routine near the others, while recognizing that my small planting has now visibly established but has no harvestable stock."
  - Wren, preference at tick 172: "Favor cautious, informative trials and genuine practical mastery."
- **ex18.**
  - Wren, preference at tick 1: "Build practical mastery through safe, observable trials."
  - Sol, preference at tick 75: "Let the clearing's beauty matter without treating a name or inspection as a physical improvement."
  - Ivo, preference at tick 1: "Prefer calm, low-risk routines and maintain a food reserve."
  - Kai, intention at tick 36: "Inspect my berries before committing food to a planting trial, and coordinate a fair comparison with Moss and Lin."

### Leaning words of other people

Other people's leaning words used as values: ex15 0, ex16 9, ex17 9 and ex18 0.

- **ex16: all 9 are the previous report's, by tick 80.** There is none after it.
- **ex17: the previous 6 plus 3 after tick 80.**
  - Sol's note "Quiet time is freely chosen, not evidence of a lasting wellbeing improvement." (tick 103) uses Lin's word. Lin's three tells in ex17 (ticks 128, 180 and 240) never use it, so Sol did not hear it from Lin.
  - Sol's cares re-writes at ticks 201 and 245 repeat the tick-20 text "a fair living landscape", which uses Kai's word.
- **ex18: none.** Kai's own "a fair comparison" is not counted here.

In the longer runs, no leaning word spread from its holder to someone else after tick 80. The earlier cases were replies within the first 26 ticks (ex16: "a fair camp", "freedom to come and go") or views, notes and cares first written by tick 23 (ex17).

### "With whom" and the rest fact in ex17

- **"With whom" never appears in ex17's outputs, through tick 250.**
  - The search covered all actor-authored text: cares, views, speech, notes, preferences, intentions, project texts and requests. The pattern was "with whom", "whom", "with who", "who to live/be/spend", "choose (my/our) company/companions/neighbors" and "whose company".
  - The only "with whom" in ex16–ex18 is in ex16, whose prompt does not contain it. Moss's tell at tick 204 says "I like having neighbors with whom silence is welcome."
  - A broader reading for chosen or voluntary company, outside cares and views, finds 3 texts in ex17, all Lin's preference "freely chosen company" (ticks 127, 180 and 244). ex16 has 7 (Lin 2, Kai 2, Moss 3) and ex18 has 7 (Moss 4, Kai 3). There is no sign that "with whom" raised talk of choosing company.
- **The rest fact keeps being restated.** The previous criterion counts distinct notes and preferences that match "cap", "full energy", "missing energy" or "restor…".

  | Archive            |                       Ticks 1–80 |                                    Ticks 81–250 | All |
  | ------------------ | -------------------------------: | ----------------------------------------------: | --: |
  | ex17               | 24 (all six people; as reported) | 28 (Lin 5, Moss 8, Sol 2, Kai 4, Wren 6, Ivo 3) |  52 |
  | ex16               |                                1 |                                7 (Kai 6, Sol 1) |   8 |
  | ex18 (ticks 1–120) |                                0 |                     2 (Moss, ticks 103 and 109) |   2 |

  Two notes on these counts:

  - One of ex17's 28 later matches does not state the rule: Wren's "Restore energy before further physical work." (tick 193).
  - The ex16 matches after tick 80 come from observation, not the prompt. Examples: Kai's "Rest at the energy cap has recently recovered zero energy. This pause is time for quiet, not a claim of added recovery or happiness." (tick 201) and Sol's "Energy is already at its observed cap of 40; more rest cannot currently replenish it." (tick 201).

- **Stating the fact did not reduce idle time.** In ex17, idle actor-rounds (rest + `wait`) rose from 244 of 480 (50.8%) through tick 80 to 1,014 of 1,500 (67.6%) through tick 250: 199 rests and 815 waits. ex16 reached 895 of 1,500 (59.7%: 692 rests, 203 waits) and ex18 393 of 720 (54.6%).

### Did the stated leanings shape behavior over the longer runs?

**In self-description, yes, and it held.**

- Through 250 ticks, every cares text that named the leaning at tick 80 still names it. The cares changed once after tick 80 (ex16) or not at all (ex17).
- ex18, with the same prompt sentence, starts the same way. Every person used its leaning word at tick 1, in cares or preferences: Wren and Ivo in preferences only, so 4 of 6 cares carry the word.
- ex15, with the leaning only in the packet, has none in 70 ticks.

**In ongoing talk, the effect faded.**

- Leaning words left speech after tick 80: no spoken value use in 170 ticks of ex16 or ex17, and none in all of ex18.
- New written uses per plan fell to less than half.
- 12 of the 23 later uses in ex16 and 11 of the 27 in ex17 are unchanged cares rewritten.
- Moss never used "belonging" in ex17.

**In behavior, some per-person differences line up with the leanings. They did not grow over the longer runs, and each is a single trajectory.**

- **Kai (fairness)** wrote the largest share of the detected sharing expressions: 13 of 26 (ex16), 11 of 25 (ex17) and 11 of 16 (ex18). In ex15, where the prompt did not state the leaning, Sol wrote the most (10 of 31; Kai 6). This is partly the fairness wording itself, since the detection is lexical, and after tick 80 all of it is private notes (review item A).
- **Sol (beauty)** made the ex16 branch screen that Sol and others valued for its pattern, and is the only person with a `name` action in ex17 and ex18. Its colour remark "The roots' soft gold against this green draws my eye" was taken up 3 times in ex17 (Moss at ticks 87 and 211, Lin at tick 240).
- **Wren (mastery)** spoke least in every run: 3, 1 and 0 successful tells. In ex16 it made the second mat (tick 79) and the second screen (tick 168), repeating crafts that Moss and Sol had made first. After tick 200 it worked through a sequence of requested skills (cordage, then a knot) and reported each test ("That establishes only this particular test—not a safe working load", tick 233). But Wren's cares never use "mastery", and every person ran practical trials.
- **Moss (belonging)** made the most symbolic actions in every run: 14, 13 and 16. In ex16 it hosted the only invitation and made the first mat. In ex17 its cares speak of companionship, not belonging.
- **Lin (freedom) and Ivo (calm)** differ less clearly from the others, because idle time is high for everyone.
  - Ivo has the most idle actor-rounds in ex16 (195 of 250: 26 rests and 169 waits) and in ex18 (103 of 120, all rest, with no tell). In ex17 Ivo is not the most idle; Kai is (186).
  - Lin's ex17 tell at tick 128, "I like having room to try something without having to keep doing it", matches Lin's leaning but does not use the word.

**Caveats.**

- One seed per run. ex15 → ex16 changed both the context and the prompt.
- The leaning-consistent differences are correlations within single trajectories of one shared model. Several are measured through the same words the leaning supplies.
- Over the longer runs the leanings did not visibly change what people did together: idle time rose in both extended runs, and the leaning words stayed in private text.

## Deviations from the plan

- **Continuation branches.** ex16 was extended on its own branch before the user approved the approach, after `extend` had refused to run on main. The user approved it afterwards with conditions, and they were met:
  - the branch starts at the checkpoint commit;
  - only the repair script was brought in, and it is listed in the plan;
  - every continued archive was replayed in full on the merged code;
  - the packages are scoped.
- **E4 timing.**
  - E4 (ex18) started after ex16 reached round 150, as planned, and ran in parallel with ex16's rounds 150–221.
  - The user's later instruction fixed the order: ex16 to 250, then ex18 to 120, then ex17. From then on the runs were sequential, and ex18 waited at its round-52 handoff until ex16 finished.
  - Parallel running shares no state between the branches.
- **Brief location.** Reads of a handoff brief in the session scratchpad were denied, once for a subagent and once for the main session. Work stopped until the user decided that briefs go in the git-ignored `validation-results/handoffs/` of each worktree.
- **Round-99 declaration wording.** ex16's empty `development-4` declaration says it "changes no source". The revision-5 snapshot recorded at that handoff also contains the PR #35 repair script, which was brought onto the branch before the extension, not by the handoff. The runtime identity was unchanged.
- **A package renamed before use.** ex17's round-156 package was renamed from `thermal-food-preparation@1` to `hearth-food-preparation@1` before submission, because ex18 already used that id (fix-log 9d).
- **Tooling fix during the PR.** The analysis check had to accept analyses bound to a preserved window (fix-log 9c), or the round-80 analyses would have failed after the extension.
- **One subagent interrupted.** The ex16 cordage handoff's first subagent stopped when a session ended, before writing any file. It was rerun from a new brief.

## Limitations

- **One trajectory per configuration.** ex16 → ex17 changes the goal wording, and ex16 → ex18 changes the incentives. Every comparison is a case comparison of single seeds that diverge from the first call.
- **The revised G2 is post hoc.** It was set after the runs had been seen. Its adoption counts are upper bounds (9i), and idle time is excluded rather than reduced.
- **Rule-based detection.**
  - Precision fell in the long runs: 4 of 8 sharing expressions, 1 of 5 reuses and 0 of 5 adopted sayings in review item A.
  - Named places, stories and shared tastes in speech are missed (9f).
- **Incentives were invisible to the agents**, so E4 measures reward events, not a response to incentives (9g).
- **Developed capabilities rarely changed the world.** The hearth had almost no usable weather (9h), and no package changed nutrition, comfort or wellbeing by design.
- **Continuation branches.** Each continued archive ran on code equal to its recorded runtime. Main's code now differs from every archive's last revision, so a further extension would need the same procedure.
- **Unmetered work.** Developer and subagent model usage for the handoffs, analyses and reviews is not metered.
- **Approximations.** Positions and hearing ranges in the analyses come from each person's located events per round.
