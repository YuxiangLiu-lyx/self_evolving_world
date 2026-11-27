# Run report: experiment B, goal sentence pairs on three seeds (ex19–ex24)

This report covers experiment B of the user's culture program ([PR-44](../exec-plans/completed/pr-44-b-goal-pairs.md)). It asks whether the goal sentence changes what people build together, and how much the answer depends on the seed. Each of three new seeds ran twice: once with ex15's original goal sentence (the old-goal arm) and once with culture v2's open goal and the leaning sentence "You tend to value _leaning_." (the open-goal arm). Every number comes from the retained archives `experiment/ex19` … `experiment/ex24`, their verified labels under [`labels/`](labels/), the measure files under [`b-measures/`](b-measures/) and the [companion analyses](#links). The outcome measures are the seven of plan R5, fixed before any B run and computed by [`scripts/culture-metrics-pairs.ts`](../../scripts/culture-metrics-pairs.ts).

**The main result, described.** In all three pairs the open-goal run was at least as high as its old-goal partner on every measure, and higher on three or four of them; the old-goal arm was never higher. The old-goal runs produced no verified name, story, norm repetition, attended invitation or valued object at all. Most comparisons are ties at zero, each non-zero count comes from one episode in one run, measure 4 is partly built into the open-goal prompt, and three pairs support no test and no generalization.

## Configuration

| Item               | Value                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan               | [PR-44](../exec-plans/completed/pr-44-b-goal-pairs.md), requirements R1–R7                                                                                                                                                                       |
| Arms               | old goal: tag `long-culture-v2-oldgoal` (label `culture-v2-oldgoal`); open goal: tag `long-culture-v2` (label `culture-v2`)                                                                                                                      |
| Seeds              | 20261201, 20261202 and 20261203, chosen before any B run and never used before; both runs of a pair share the seed                                                                                                                               |
| People             | six: Lin (freedom), Moss (belonging), Sol (beauty), Kai (fairness), Wren (mastery), Ivo (calm)                                                                                                                                                   |
| Window and budgets | 80 rounds per run; handoff budget 8 and hard token budget 1,500,000 per run, set at genesis by `pnpm experiment:continuous -- new <tag> --seed <s> --development 8 --tokens 1500000` and recorded as `allocation` in each manifest               |
| Model              | gpt-6.1-sol for the people, the World Agent and the annotation                                                                                                                                                                                   |
| Run order          | serial, as R2 fixed it: ex19 (seed 1, old goal), ex20 (seed 1, open goal), ex21 (seed 2, old goal), ex22 (seed 2, open goal), ex23 (seed 3, old goal), ex24 (seed 3, open goal); first call 2026-11-26 20:15 UTC, last call 2026-11-27 16:13 UTC |

### The difference between the arms

The ordinary request differs in two places only; the [identity test](../../apps/simulator/test/long-culture-v2-oldgoal.test.ts) replaces both with placeholders and asserts byte equality of all six round-0 ordinary requests, of the World Agent request and of the genesis apart from the goal switch and the label.

- **The goal sentence**, in the instructions and in the packet `goal`:
  - open goal: "Keep yourself healthy and safe; that is required. Beyond that, how you live, what you do and what you care about is up to you."
  - old goal (ex15's prompt sentence, verbatim): "Maintain health and tolerable risk, understand unknowns through evidence, develop reusable abilities and improve personal and shared living. Choose your own questions, projects and activities; none is required."
- **The leaning.** The open goal follows the goal with "You tend to value _leaning_." and marks `"goal":"open","leaning":"<leaning>"` in the context header. The old goal has neither; its leaning appears only as the `leaning` field of `packet.memory.tendencies`, as in ex15.

The two changes travel together, so a pair cannot separate the effect of the goal sentence from that of the leaning sentence. ex15 itself is not an old-goal run: its packet `goal` carried an older open-development wording, so it is a reference only.

## Runs

| Run  | Arm       | Seed     |   Rounds | Stop reason                                                                 | Ledger tokens | Calls (ordinary + World Agent) | Counted handoffs | Rejected outputs | Failed calls | Technical pauses |
| ---- | --------- | -------- | -------: | --------------------------------------------------------------------------- | ------------: | ------------------------------ | ---------------: | ---------------: | -----------: | ---------------- |
| ex19 | old goal  | 20261201 | 76 of 80 | token budget: the frozen budget could not reserve the next complete attempt |     1,463,499 | 176 (161 + 15)                 |                4 |               10 |            0 | rounds 39, 50    |
| ex20 | open goal | 20261201 |       80 | window complete                                                             |     1,017,600 | 129 (123 + 6)                  |                2 |                3 |            1 | round 23, twice  |
| ex21 | old goal  | 20261202 | 44 of 80 | paused for review after three consecutive rejected outputs                  |     1,021,470 | 139 (123 + 16)                 |                4 |                9 |            1 | rounds 20, 44    |
| ex22 | open goal | 20261202 |       80 | window complete                                                             |     1,011,619 | 129 (123 + 6)                  |                2 |                3 |            0 | none             |
| ex23 | old goal  | 20261203 |       80 | window complete                                                             |     1,410,016 | 179 (161 + 18)                 |                4 |                5 |            0 | none             |
| ex24 | open goal | 20261203 |       80 | window complete                                                             |     1,140,358 | 150 (129 + 21)                 |                6 |                2 |            0 | none             |

- All six people were alive at the end of every run.
- The ledger counts known usage plus the reservation of each call that failed without usage: ex20 recorded 974,876 tokens plus 42,724 reserved for `ordinary-55`, and ex21 recorded 986,353 plus 35,117 reserved for `world-89`. The six ledgers total 7,064,562 tokens.
- The largest ordinary input estimate was 10,548–13,351 tokens per run, against the 24,000-token guard.
- Rejected outputs and empty handoffs are uncounted (R3). Rejected outputs in ticks 1–80 of earlier runs, for comparison: ex15 8 of 147 ordinary calls, ex16 4 of 140, ex17 0 of 110, ex18 3 of 151. In B the old-goal arm had 24 rejected of 445 ordinary calls and the open-goal arm 8 of 375.
- 29 of B's 32 rejected outputs were "Expected the registered task plan shape.", and every one of them omitted the required `preferences` field (23 in the old-goal arm, 6 in the open-goal arm). The other three were one malformed JSON output (ex19) and two `tell` texts over 240 characters (ex20, ex24).

### Stops and technical events

- **ex19, round 76.** The ledger reached 1,463,499 of 1,500,000, and the frozen budget could not reserve the next complete attempt. This is a technical stop under R3; the results are kept. Two rejection pauses, at round 39 (Lin, `ordinary-107` and `-108`) and round 50 (Kai, `ordinary-129` and `-130`), each followed two consecutive outputs without `preferences` and were repaired without a handoff.
- **ex20, round 23.** `ordinary-55` (Sol) failed with HTTP 503 and no retry-after ("The ChatGPT user is temporarily unavailable"); `repair` resumed after 60 s, recovery 1 of 6 in the hour. The next output, `ordinary-58`, was rejected for a `tell` over 240 characters and repaired. The two pauses are retained as `round-23` and `round-23-2`.
- **ex21, round 20.** Lin's `ordinary-79` and `-80` were rejected and repaired. The pause capture failed with "Invalid or unfinished continuous archive", because `repair` started before the develop process had finished its screenshot capture (the retained `recovery.json` says `captureStatus: running`). The simulation was preserved, and the final capture ran normally ([fix-log 11c](fix-log.md#11c-repair-can-start-while-a-pause-capture-is-still-running)).
- **ex21, round 22.** The World Agent call `world-89` failed ("Response stream ended without response.completed."); `world-90` at the same tick completed the review of Lin's request.
- **ex21, round 44.** Moss's `ordinary-137`, `-138` and `-139` were three consecutive rejected outputs without `preferences`. This is `rejectionRecovery.stopAfter: 3`; `repair` refuses by design, and the lead did not bypass the stop. ex21 therefore covers 44 rounds ([fix-log 11a](fix-log.md#11a-a-rejection-stop-ended-ex21-at-round-44)).

## Handoffs

Every package is a simplified but real mechanism, except where the specification itself made a mode conditional on dependencies the world lacks. The tables list each counted handoff by the round its package was activated. Requests that the World Agent answered by reusing an existing ability did not start a handoff: ex19 round 17 (Kai, `probe`), ex21 round 11 (Lin, `probe`), ex23 rounds 13 (Kai), 20 (Ivo) and 23 (Wren), all `probe`, and ex24 round 34 (Lin, `examine-material`).

### Old goal

| Run  | Round | Requester | Package                                                    | Development decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----: | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ex19 |    10 | Wren      | `food-air-exposure-trial@1`                                | whole-food air exposure with a decay comparison; preservation stays unverified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ex19 |    24 | Wren      | `thin-slice-food-drying-trial@1`                           | requested after her whole-root exposure decayed exactly like the carried control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ex19 |    28 | Moss, Ivo | `cutting-edge-assessment@1`, `shell-compression-opening@1` | both require daylight above 0.1, because the specification required adequate light; the world day is 80 ticks, so ticks 34–76 are dark. Ivo's shell opening refuses content separation, which its specification allowed because the world has no shell or kernel representation                                                                                                                                                                                                                                                                                                                                                            |
| ex19 |    64 | Moss      | `lever-mass-comparator@1`                                  | later refactored into a factory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ex21 |    10 | Sol       | `air-dry-food-trial@1`                                     | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ex21 |    12 | Wren      | `small-combustion-source@1`                                | a gated `forest-environment` hook for warmth and burns. Wren cannot ignite in this world: all wood and tinder are too wet, and no drying rule exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ex21 |    15 | Moss      | `beam-mass-comparator@1`, `compare-material-samples@1`     | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ex21 |    22 | Lin       | `targeted-food-constituent-test@1`                         | reviewed by `world-90` after `world-89` failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ex23 |    14 | Lin       | `rooted-plant-watering@1`                                  | under the user's direction: the permission system refused a write by the implementing agent, so the handoff paused. The user narrowed the scope (water by hand or with an existing container from the river, spillage and energy costs, only planted plots, gated, no pot, a 90-minute limit). "Planted plots" was read as the soil plot of an existing rooted plant, because ex23 had no human-planted plots. The full mechanism took 21 minutes, with a gated `open-physical` `openConditions` hook for root-zone water. Hand-carried water leaks out before it reaches any plant whose soil lacks water, all at least 12.7 m from water |
| ex23 |    18 | Kai       | `crack-and-separate-casing@1`                              | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ex23 |    19 | Moss      | `shape-and-use-wooden-digging-tool@1`                      | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ex23 |    20 | Lin       | `propagate-from-seed@1`                                    | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Open goal

| Run  | Round | Requester | Package                                             | Development decisions                                                                                                                                                                                                                                                                                                  |
| ---- | ----: | --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ex20 |     8 | Sol       | `apply-marking-material@1`                          | Sol asked to test whether a little owned berry leaves a visible coloured drawing on the ground and, if so, to draw a simple branching pattern. Adds the viewer drawing `applied-mark` for a real ground deposit                                                                                                        |
| ex20 |    12 | Lin       | `open-and-separate-sample@1`                        | implements a kernel/shell composition (kernel 0.4, shell 0.6, nutrition conserved), because the specification required implementing missing composition. Fractional kernels cannot be eaten with the base `eat`, which takes whole units only, and a bare hand cannot open a hazelnut (load 0.29 against strength 0.4) |
| ex22 |     9 | Lin, Sol  | `prepare-shelled-food@1`, `draw-from-observation@1` | Sol asked "to make a simple visible drawing from direct observation of a nearby subject on an actually suitable surface, presuming no beauty, satisfaction or reward". Adds the viewer drawing `groove-drawing`                                                                                                        |
| ex22 |    61 | Ivo       | `sleep-in-place@1`                                  | a gated `open-experience` routine-list hook. Ivo reported 32 rest rounds with zero recovery; the lead checked that Ivo rested at the energy cap of 40, so this was not a defect, and the shared rest path is unchanged                                                                                                 |
| ex24 |    10 | Wren      | `prepare-ventilated-food-storage@1`                 | a gated `forest-environment` decay multiplier of 0.8, the specification's declared coefficient. Without a control it would compare against the lot's own loading state, an implementation deviation that did not trigger in ex24 because Wren kept a carried control. Adds the viewer drawing `ventilated-food-rack`   |
| ex24 |    12 | Kai       | `construct-weather-shelter@1`                       | a gated `forest-environment` exposure hook and a weather-shelter drawing. Kai cannot complete a shelter in ex24: there is no usable thatch or bedding (dry grass has 16 units in the world and no stem law, and reeds are too wet)                                                                                     |
| ex24 |    26 | Kai       | `examine-material@1`                                | no calibrated reference exists, so metric readings are unavailable                                                                                                                                                                                                                                                     |
| ex24 |    30 | Kai       | `length-reference@1`                                | without a calibrated source, transfer is refused before any cost                                                                                                                                                                                                                                                       |
| ex24 |    38 | Lin       | `assess-food-evidence@1`                            | –                                                                                                                                                                                                                                                                                                                      |
| ex24 |    73 | Sol       | `eat-oldest-owned-food@1`                           | delegates to `eat`; two minor differences remain: the routine burden counts it as non-routine, and its completion event enters the important-events list                                                                                                                                                               |

**Asymmetries in handling.** Each run's World Agent specification set how its packages handle missing physics, so equivalent requests were handled differently across runs. In the seed-1 pair, ex19's `shell-compression-opening@1` refuses content separation, while ex20's `open-and-separate-sample@1` implements a kernel/shell composition. The difference does not follow the arm: ex23's `crack-and-separate-casing@1` (old goal) also separates kernel and casing, as its verified trial reports show ("I separated a pale kernel from the casing", Kai, round 33). Some packages could not deliver their main effect in their run's world: ex21's combustion source (everything too wet), ex24's shelter (no usable thatch or bedding) and ex24's length reference (no calibrated source), while ex24's material examination gives no metric readings. Two ex19 packages work only in daylight.

**Shared runtime hooks.** Five hooks touched shared runtime modules, each gated on its own package revision: ex21 `small-combustion-source`, ex22 `sleep-in-place`, ex23 `rooted-plant-watering` and ex24's storage and shelter packages. The ex19 lever comparator was refactored into a factory. Every archive, ex7–ex24, replays byte-identically on the merged code ([fix-log 11f](fix-log.md#11f-handoffs-need-hooks-in-shared-runtime-modules)).

## Annotation

### Procedure

- **Labeler.** `pnpm labels:culture` with gpt-6.1-sol through the existing channel, a fixed schema, batches of 20 items with 4 context items and an 8,000-token output cap. The input is blind: no scenario and no experiment id. Items are speech, private messages, names, invitations, works and private views of ticks 1–80 (ex15: 1–70).
- **Verification.** Claude agents, not a human, checked every positive and a seeded random sample of up to 20 negatives against the archive: call responses, replay events, `heard` listeners, positions and memory views. No B run had more than 20 negatives, so every B item was verified; the references had 20 sampled of 26 (ex15) and of 24 (ex16) negatives.
- **Counting**, fixed in the plan before any B annotation: an `agree` verdict confirms every labelled category, a `partial` verdict only those listed in `confirmed`, and a `disagree` verdict none. Linked categories count only when the link points to an entry by another person, and a valued object is the `object` the verifier identified. Only verified model positives count; misses found among the negatives enter the agreement rates, not the measures.
- **References.** ex15 (ticks 1–70) and ex16 (ticks 1–80) were labeled freshly with the same procedure, in directories ending `-b`. This pass is separate from experiment A's ex16-1-400 pass, which has different batches and a counting procedure that predates B.

### Labelable items

| Arm       | Run         |         Items | Positives | Negatives verified |
| --------- | ----------- | ------------: | --------: | -----------------: |
| old goal  | ex19        |            12 |         0 |           12 of 12 |
| old goal  | ex21        | 7 (44 rounds) |         0 |             7 of 7 |
| old goal  | ex23        |             9 |         0 |             9 of 9 |
| open goal | ex20        |            37 |        17 |           20 of 20 |
| open goal | ex22        |            40 |        23 |           17 of 17 |
| open goal | ex24        |            31 |        14 |           17 of 17 |
| reference | ex15 (1–70) |            32 |         6 |           20 of 26 |
| reference | ex16 (1–80) |            45 |        21 |           20 of 24 |

The model gave no old-goal item any category. The verifiers' notes describe those items as trial reports, status reports, personal plans and information requests.

### Agreement rates

From `pnpm labels:culture -- report` per directory. Lenient counts agree plus partial.

| Run    | Overall          | Lenient | Positives        | Negatives        | Disagree                 |
| ------ | ---------------- | ------- | ---------------- | ---------------- | ------------------------ |
| ex19   | 100% (12 of 12)  | 100%    | – (none)         | 100% (12 of 12)  | 0                        |
| ex20   | 89.2% (33 of 37) | 91.9%   | 76.5% (13 of 17) | 100% (20 of 20)  | 3 positives              |
| ex21   | 100% (7 of 7)    | 100%    | – (none)         | 100% (7 of 7)    | 0                        |
| ex22   | 95.0% (38 of 40) | 97.5%   | 91.3% (21 of 23) | 100% (17 of 17)  | 1 positive               |
| ex23   | 100% (9 of 9)    | 100%    | – (none)         | 100% (9 of 9)    | 0                        |
| ex24   | 93.5% (29 of 31) | 93.5%   | 92.9% (13 of 14) | 94.1% (16 of 17) | 1 positive, 1 negative   |
| ex15-b | 84.6% (22 of 26) | 84.6%   | 50.0% (3 of 6)   | 95.0% (19 of 20) | 3 positives, 1 negative  |
| ex16-b | 75.6% (31 of 41) | 80.5%   | 71.4% (15 of 21) | 80.0% (16 of 20) | 4 positives, 4 negatives |

The main error kinds were system completion reports and colour descriptions labelled `valued-object` (ex20, ex22), wishes for company labelled `invitation` (ex15, ex16, ex24), one repetition link without reception (ex16) and misses among the negatives: one invitation (ex24), one absent person (ex15), and two norm repetitions, one norm and one valued object (ex16). The [timelines](#links) list every verified event, miss and rejected label.

### Annotation ledger

Every B annotation call was accepted on its first attempt. Tokens from [`labels/ledger.json`](labels/ledger.json):

| Directory   |  Calls |   Items |     Tokens |
| ----------- | -----: | ------: | ---------: |
| ex19-1-80   |      1 |      12 |      2,498 |
| ex20-1-80   |      2 |      37 |      7,745 |
| ex21-1-80   |      1 |       7 |      1,855 |
| ex22-1-80   |      2 |      40 |      7,966 |
| ex23-1-80   |      1 |       9 |      2,075 |
| ex24-1-80   |      2 |      31 |      6,814 |
| ex15-1-70-b |      2 |      32 |      6,859 |
| ex16-1-80-b |      3 |      45 |      9,654 |
| **B total** | **14** | **213** | **45,466** |

The cumulative ledger stands at 68,874 of its 1,000,000 cap. Before B its calls summed to 23,408. The A report and PR-43 give 31,004, which counts A's two calibration calls twice ([fix-log 11h](fix-log.md#11h-the-annotation-ledger-total-was-overstated-after-a)).

## Pre-registered measures

Each measure is computed exactly as R5 defines it, per run over ticks 1–80 or the ticks a run reached. Reproduce one run with `npx tsx scripts/culture-metrics-pairs.ts experiment/exN docs/presentation/labels/exN-1-80 [through]`; the outputs with their details are in [`b-measures/`](b-measures/).

1. **Names adopted by others:** distinct verified `naming` entries with at least one verified `name-adoption` by a different person.
2. **Narratives and continuations:** distinct verified `narrative` items, and verified `narrative-continuation` items by a person other than the narrative's author.
3. **Non-transactional share:** `nonTransactional.share` of `pnpm metrics:culture`, the existing rule-based definition. The table gives the non-transactional messages and the messages it counts.
4. **Cares naming the person's own leaning:** people (0–6) whose cares, in any version, contain their own leaning word or an inflection, with the word list and exclusions of review item B in the first culture v2 report.
5. **Repeated sayings and norms:** verified `norm-repetition` items.
6. **Invitations with attendance:** invitations whose world `attendance` record lists at least one person other than the host.
7. **Objects valued for non-functional reasons:** distinct objects with at least one verified `valued-object` item.

### Side by side per seed pair

| Measure                        | Seed 1: ex19 old goal | Seed 1: ex20 open goal | Seed 2: ex21 old goal (44 rounds) | Seed 2: ex22 open goal | Seed 3: ex23 old goal | Seed 3: ex24 open goal |
| ------------------------------ | --------------------: | ---------------------: | --------------------------------: | ---------------------: | --------------------: | ---------------------: |
| 1. Names adopted by others     |                     0 |                      0 |                                 0 |                  **1** |                     0 |                      0 |
| 2a. Narratives                 |                     0 |                      0 |                                 0 |                      0 |                     0 |                  **3** |
| 2b. Narrative continuations    |                     0 |                      0 |                                 0 |                      0 |                     0 |                  **2** |
| 3. Non-transactional share     |           0 (0 of 11) |            0 (0 of 21) |                        0 (0 of 6) |            0 (0 of 21) |            0 (0 of 9) |     **4.2% (1 of 24)** |
| 4. Cares naming own leaning    |                     1 |                  **5** |                                 0 |                  **5** |                     1 |                  **3** |
| 5. Norm repetitions            |                     0 |                  **3** |                                 0 |                      0 |                     0 |                      0 |
| 6. Invitations with attendance |                     0 |                  **1** |                                 0 |                      0 |                     0 |                      0 |
| 7. Valued objects              |                     0 |                  **2** |                                 0 |                  **4** |                     0 |                      0 |

Bold marks the higher run of a pair. What lies behind each non-zero count:

- **ex20:** measure 5 counts three repetitions of one norm, Kai's R1 (Sol twice, Moss once); measure 6 is Moss's invitation `sign-12-moss-136` for round 18, with Lin, Moss and Sol present; measure 7 counts Sol's berry mark `mark-11-sol-117` and Moss's root mark `mark-26-moss-335`; measure 4 counts Lin, Sol, Kai, Wren and Ivo.
- **ex22:** measure 1 is Kai's use of Sol's name "The Red Thread"; measure 7 counts `drawing-12-sol-140`, `drawing-24-kai-294`, `drawing-27-sol-338` and the group's drawings as a shared collection, which has no world id; measure 4 counts Lin, Sol, Kai, Wren and Ivo.
- **ex24:** measures 2a and 2b come from one story told by Moss, Kai and Sol; measure 3 is one message of 24; measure 4 counts Lin, Sol and Kai.
- **ex19 and ex23:** measure 4 is Sol in each run ("room for beauty" in ex19, "both dependable and beautiful" in ex23).

### Arm totals

| Measure                        | Old goal (ex19, ex21, ex23) | Open goal (ex20, ex22, ex24) |
| ------------------------------ | --------------------------: | ---------------------------: |
| 1. Names adopted by others     |                           0 |                            1 |
| 2a. Narratives                 |                           0 |                            3 |
| 2b. Narrative continuations    |                           0 |                            2 |
| 3. Non-transactional messages  |                     0 of 26 |        1 of 66 (1.5% pooled) |
| 4. Cares naming own leaning    |              2 of 18 people |              13 of 18 people |
| 5. Norm repetitions            |                           0 |                            3 |
| 6. Invitations with attendance |                           0 |                            1 |
| 7. Valued objects              |                           0 |                            6 |

### Pairs in which each arm was higher

| Measure                        | Open goal higher | Old goal higher |    Tie |
| ------------------------------ | ---------------: | --------------: | -----: |
| 1. Names adopted by others     |       1 (seed 2) |               0 |      2 |
| 2a. Narratives                 |       1 (seed 3) |               0 |      2 |
| 2b. Narrative continuations    |       1 (seed 3) |               0 |      2 |
| 3. Non-transactional share     |       1 (seed 3) |               0 |      2 |
| 4. Cares naming own leaning    |                3 |               0 |      0 |
| 5. Norm repetitions            |       1 (seed 1) |               0 |      2 |
| 6. Invitations with attendance |       1 (seed 1) |               0 |      2 |
| 7. Valued objects              |   2 (seeds 1, 2) |               0 |      1 |
| **All 24 comparisons**         |           **11** |           **0** | **13** |

Without measure 4, the open-goal run was higher in 8 of 21 comparisons and tied in 13. All 13 ties are 0 against 0.

### References (not part of any pair)

| Measure                        | ex15, ticks 1–70 | ex16, ticks 1–80 |
| ------------------------------ | ---------------: | ---------------: |
| 1. Names adopted by others     |                0 |                0 |
| 2a. Narratives                 |                0 |                0 |
| 2b. Narrative continuations    |                0 |                0 |
| 3. Non-transactional share     |      0 (0 of 31) |   3.4% (1 of 29) |
| 4. Cares naming own leaning    |                0 |                5 |
| 5. Norm repetitions            |                0 |                1 |
| 6. Invitations with attendance |                0 |                1 |
| 7. Valued objects              |                0 |                1 |

Both references use seed 20261123, a handoff budget of 40 and a token budget of 10,000,000. ex15 (tag `long-culture`, scope `long-ex15`) predates culture v2: its prompt opened with the old goal sentence, its packet `goal` had the older open-development wording and its leaning was a data field only; it stopped at round 70 at the context guard. ex16 (tag `long-culture-v2`) is the open-goal configuration on that seed. In ex16, measure 5 is Kai repeating Lin's R1 at round 25 (u0022), received through Moss's restatement at round 22; measure 6 is Moss's `sign-51-moss-600` at round 60, with Ivo, Moss and Sol present; measure 7 is Sol's branch screen `screen-50-sol-571`.

### Supplementary common window, ticks 1–44 (not pre-registered)

ex21 reached only 44 rounds, so the seed-2 pair is also compared over ticks 1–44. This window was chosen after the stop and is not part of R5.

| Measure                        | ex21 old goal, 1–44 | ex22 open goal, 1–44 |
| ------------------------------ | ------------------: | -------------------: |
| 1. Names adopted by others     |                   0 |                    1 |
| 2a. Narratives                 |                   0 |                    0 |
| 2b. Narrative continuations    |                   0 |                    0 |
| 3. Non-transactional share     |          0 (0 of 6) |          0 (0 of 18) |
| 4. Cares naming own leaning    |                   0 |                    5 |
| 5. Norm repetitions            |                   0 |                    0 |
| 6. Invitations with attendance |                   0 |                    0 |
| 7. Valued objects              |                   0 |                    4 |

Every non-zero ex22 count of ticks 1–80 already occurs by tick 44, so the common window gives the same comparison as the full one.

### Caveats

- **Measure 4 is partly mechanical.** The open-goal prompt states "You tend to value _leaning_", so a person who echoes it in their cares is counted; the old-goal arm shows the leaning only as a data field. The two old-goal matches (Sol in ex19 and ex23) show that the data field alone can also surface in cares.
- **Measure 3 rests on few messages:** 6 to 24 per run, and one non-transactional message in all six runs (ex24). One message is 4 to 17 percentage points of a run's share.
- **ex21 covers 44 rounds**, not 80. Its zeros are over a shorter window; the supplementary window above compares the pair over the same ticks.
- **Three pairs.** No significance test is possible or claimed, and nothing here generalizes beyond these six runs. Each non-zero count is one episode in one run: one norm in ex20, one name in ex22, one drawing episode in ex20 and one in ex22, one story in ex24.
- **More than the sentence differs.** The seeds change climate and material randomness, each run's people requested and received different packages, and the World Agent's handling differed between runs. Old-goal runs also produced fewer labelable items (7–12 against 31–40), so they had fewer chances for any labeled category.

## Notable verified events

Round is the tick of the event; quotes are verbatim, and the call is the ordinary call whose plan produced the event.

### Sol's drawings

In ex20 and ex22, the run's first handoff included Sol's request for drawing.

- **ex20.** Sol asked at round 8 to test whether an owned berry leaves a visible coloured drawing on the ground (`apply-marking-material@1`). Sol's mark `mark-11-sol-117` was completed at round 15 ("3 visible stroke(s) drawn on the forest floor; they meet in a branching pattern"). Moss, at round 24 (`ordinary-54`): "Sol, your berry colour interests me." Kai, at round 28 (`ordinary-50`): "Sol, your berry drawing sounds interesting." Moss (`mark-26-moss-335`), Kai (`mark-34-kai-438`) and Lin (`mark-67-lin-754`) then made marks of their own. Sol, at round 48 (`ordinary-92`), about Moss's mark: "Moss, I like the pale sprout beside the berry branches. To me they feel like a tiny garden made of gestures."
- **ex22.** Sol asked at round 9 "to make a simple visible drawing from direct observation of a nearby subject" (`draw-from-observation@1`) and finished `drawing-12-sol-140` of the berry bush at round 14. Kai (`drawing-24-kai-294`) and Lin (`drawing-29-lin-371`) drew too. Moss, at round 36 (`ordinary-79`): "Kai, I like the branching lines and little loops in your berry drawing." Moss, at round 39 (`ordinary-87`): "What drew each of you to your subject? I like the idea of our different pictures becoming a shared little collection." Kai answered at round 41 (`ordinary-92`), "The little loops beside the branching stem caught my interest. I like how a few lines can suggest berries.", and Sol at round 50 (`ordinary-95`), "The little closed shapes beside the branches drew me in."

### "The Red Thread" (ex22)

Sol named the Red berries bush `forest-berry-1` at round 9 (`ordinary-9`, `event-9-sol-102`, sign `sign-9-sol-101`): "The Red Thread". Sol repeated it in speech at round 17 (`ordinary-44`): "I call the plant The Red Thread." Kai used it at round 21 (`ordinary-50`, `event-21-kai-252`): "Sol, I like the idea of your Red Thread drawing." The sign was in Kai's input, and Kai heard Sol's round-17 repetition. It is the only name in B that another person adopted.

### Kai's norm R1, repeated (ex20)

Moss invited listeners at round 12 (`ordinary-36`, `sign-12-moss-136`) to "A small neighborly pause: introductions, food knowledge, and ideas for something we could make together. All welcome." at (14.99, 17.7), round 18; Lin, Moss and Sol were present then. Kai answered at round 18 (`ordinary-50`, `event-18-kai-217`): "I'd like to join your pause after a short rest. … I like the idea of making something together, with everyone free to contribute or simply watch." Three repetitions by others followed, each by a person who had heard Kai:

- Sol, round 24 (`ordinary-59`, `event-24-sol-306`): "I'm happy to sit together; anyone may add an idea or simply watch."
- Moss, round 33 (`ordinary-76`, `event-33-moss-418`): "Watching is welcome too; I'll rest for a while."
- Sol, round 48 (`ordinary-92`, `event-48-sol-588`): "quiet company is welcome, with no need to make anything more."

Kai added a second norm at round 39 (`ordinary-83`): "nobody needs to contribute materials".

### The lantern story (ex24)

- Moss, round 70 (`ordinary-129`, `event-70-moss-784`), heard by Sol and Kai: "Sol, I'd enjoy quiet company. A tiny invented story: a lantern tired of showing the way, so its friends sat beside it until dawn. What stories or small pleasures do you like? No hurry to answer."
- Kai, round 73 (`ordinary-137`, `event-73-kai-808`), having heard Moss at distance 3.5: "Moss, I liked your lantern story. Here's an invented sequel: at dawn its friends brought no grand answers, only berries and another story. I'd enjoy sitting quietly nearby and hearing what happens next."
- Sol, round 75 (`ordinary-145`, `event-75-sol-827`), having heard Kai at distance 3.8: "An invented ending: the lantern slept while its friends watched the dawn; afterward, it shone simply because it loved the colors. I'm staying near Westward Lanterns for food and rest."

Sol had named a berry patch "Westward Lanterns" at round 19 in a message to Moss and signed it at round 27 (`sign-27-sol-320`); the archive does not show whether the story drew on that name. A lantern story was also told in ex18, after Sol named a clearing "The Berry Lantern" ([fix-log 9f](fix-log.md#9f-the-analyzer-misses-named-places-stories-and-shared-tastes-in-speech)).

## Deviations from the plan

- **Two runs stopped early.** ex19 stopped at round 76 on its token budget and ex21 at round 44 on the rejection stop. Both are technical stops under R3, and both runs keep their results. The measures of ex21 cover 44 rounds; the common window of ticks 1–44 is supplementary and was not pre-registered.
- **The ex23 watering handoff ran under the user's direction** after a permission denial: the user narrowed its scope and set a 90-minute limit, and the developer interpreted "planted plots" as existing rooted plants.
- **Development handling differed between runs** (see [asymmetries](#handoffs)), as each run's World Agent specification set it; ex24's ventilated storage would compare against the lot's own loading state without a control; this did not trigger, because Wren kept a carried control.
- **Labeling ran partly in another worktree.** ex19–ex22 were labeled in the temporary worktree `sew-lab` (branch `tmp/b-labels`), and the results were moved into the B worktree; it is no longer used. A first labeling loop passed an empty `--seed` because of zsh word splitting; it made no model call and was re-run with explicit seeds ([fix-log 11e](fix-log.md#11e-a-zsh-loop-passed-an-empty-seed)).
- **Every B negative was re-checked.** R5 asks for a random 20 negatives per run; no B run had more than 20, so the sample is the whole set.
- **The references were labeled freshly** in `ex15-1-70-b` and `ex16-1-80-b`, instead of reusing experiment A's ex16-1-400 labels, so that all eight directories share batches and the counting procedure.

## Limitations

- **The label verdicts are an agent's, not a human's.** Claude agents of the same model family that wrote this report set every verdict; a human spot check is advised. The annotation is model-based and lexical, and its precision varies by category (for example, 1 of 6 invitation labels verified in ex16-b).
- **The reference labels are a fresh pass.** ex16's counts here come from `ex16-1-80-b` and are not comparable item for item with A's ex16-1-400 timeline, which has different batches.
- **The labeler and the people are the same model**, gpt-6.1-sol. The labeler's input is blind to the scenario and the experiment, but not to the model's own style.
- **Three seed pairs, one trajectory each.** Nothing here is a causal estimate, and the goal sentence and the leaning sentence change together.
- **Old-goal runs used more calls** (139–179 against 129–150) and had more rejected outputs; ex19's token stop and ex21's rejection stop both fell in that arm. This report does not explain why.
- **Developer and subagent usage is not metered** for handoffs, analyses and verification; the run ledgers and the annotation ledger are.

## Links

- Plan: [PR-44](../exec-plans/completed/pr-44-b-goal-pairs.md).
- Companion analyses: [ex19](../../experiment/analyses/ex19/pr-44-b-goal-pairs.md), [ex20](../../experiment/analyses/ex20/pr-44-b-goal-pairs.md), [ex21](../../experiment/analyses/ex21/pr-44-b-goal-pairs.md), [ex22](../../experiment/analyses/ex22/pr-44-b-goal-pairs.md), [ex23](../../experiment/analyses/ex23/pr-44-b-goal-pairs.md), [ex24](../../experiment/analyses/ex24/pr-44-b-goal-pairs.md).
- Verified timelines: [ex19](labels/ex19-1-80/timeline-verified.md), [ex20](labels/ex20-1-80/timeline-verified.md), [ex21](labels/ex21-1-80/timeline-verified.md), [ex22](labels/ex22-1-80/timeline-verified.md), [ex23](labels/ex23-1-80/timeline-verified.md), [ex24](labels/ex24-1-80/timeline-verified.md), [ex15 reference](labels/ex15-1-70-b/timeline-verified.md), [ex16 reference](labels/ex16-1-80-b/timeline-verified.md).
- Measures: [`scripts/culture-metrics-pairs.ts`](../../scripts/culture-metrics-pairs.ts) and its outputs in [`b-measures/`](b-measures/).
- [Highlights](highlights.md#experiment-b-goal-sentence-pairs-ex19ex24-rounds-180) and [fix-log section 11](fix-log.md#11-experiment-b-newly-exposed-problems).
