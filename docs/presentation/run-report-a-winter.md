# Run report: experiment A, the cold season arrives (ex16 rounds 250–400)

This report covers experiment A of the user's culture program ([PR-43](../exec-plans/completed/pr-43-a-winter.md)). ex16, the culture v2 main run, continued from round 250 to round 400 to see how people respond as the scenario's survival pressure begins at tick 300. Every number comes from retained files under `experiment/ex16`, its labels under `docs/presentation/labels/ex16-1-400/` and the [behavioral analysis](../../experiment/analyses/ex16/pr-43-a-winter.md). The earlier analyses of rounds 0–80 and 0–250 stay as they are.

**The main result in one sentence.** By round 400 the pressure had not made life harder: it ramps from tick 300 to full only at tick 440, and the season label changed from summer to autumn only at tick 400. So the cooling moved bodies from too warm into the comfortable range, nobody was hurt, and what changed was social: people spread out, stopped talking and pursued private projects.

## Configuration and run

| Item          | Value                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive       | ex16, tag `long-culture-v2`, scope `long-ex16`, seed 20261123, six people (Lin freedom, Moss belonging, Sol beauty, Kai fairness, Wren mastery, Ivo calm)                                             |
| Branch        | `experiment/ex16-winter` from `4c108a4` (ex16's round-250 checkpoint), continuation-branch rule; checkpoint backups `d4e45e7` (300), `0c93813` (350), `e73ad81` (400)                                 |
| Pressure      | `pressureStart` 300 and `difficultyStart` 440 in a cycle of 800: intensity 0.71 at tick 400, cold +1.07, rain floor 0.57, plant growth 0.71; confirmed from the archived configuration before the run |
| Window        | rounds 250 → 300 → 350 → 400 (`extend`), stop reason: planned end, window complete at 400                                                                                                             |
| Calls in A    | 188 (170 ordinary, 18 World Agent); 528 in total                                                                                                                                                      |
| Tokens        | A spent 2,044,361 of its 3,500,000 cap (ledger 2,903,618 → 4,947,979), 2,272 per person per round in A; largest input estimate 17,948 (guard 24,000)                                                  |
| Handoffs in A | 8 attempts: 6 counted packages, all Wren's, and 2 empty pause-closing handoffs (uncounted); at most 3 counted in any 50 rounds                                                                        |
| Survivors     | all six, health 100 at every tick                                                                                                                                                                     |

### Handoffs

| Attempt | Round | Package                            | What it does                                                                                                                   |
| ------: | ----: | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
|       8 |   256 | `hand-join-fiber-cords@1`          | Sheet bend joining two owned cords; friction 0.3 reed on reed declared; trials and untying                                     |
|       9 |   278 | `hand-bind-crossing@1`             | One-wrap crossing binding of two branches with an overhand closure; a 0.34 m cord is measured too short for two whole branches |
|      10 |   282 | none (empty)                       | Closed a `fetch failed` pause without evidence (Wren, `ordinary-375`)                                                          |
|      11 |   298 | `hand-twist-sectioned-cord@1`      | Continuous two-ply cords up to 0.60 m in hand-sized sections                                                                   |
|      12 |   329 | `hand-lash-crossing@1`             | Two to four adjacent turns with per-turn tension; extra turns add little sliding resistance                                    |
|      13 |   363 | `hand-frap-crossing@1`             | Transverse frapping turns that raise the lashing's turn tension                                                                |
|      14 |   365 | none (empty)                       | Closed a `fetch failed` pause without evidence (Lin, `ordinary-484`)                                                           |
|      15 |   368 | `hand-twist-long-sectioned-cord@1` | Lifts the 0.60 m ceiling; the physical limit is one 1.8 m reed stalk per strand (1.524 m cord)                                 |

Every package is a simplified but real mechanism with its assumptions in `experiment/ex16/development/`. Each reuses the earlier cord code; the earlier packages' ability text and replay are byte-identical, which the develop step's exact replay and the pre-merge comparison confirm.

### Recovery log

| Round | Failed call           | Failure (UTC)       | Error                                                 | Retry-after | Repair   | Waited | Path                                            | Counted |
| ----: | --------------------- | ------------------- | ----------------------------------------------------- | ----------- | -------- | ------ | ----------------------------------------------- | ------- |
|   282 | `ordinary-375` (Wren) | 2026-11-26 16:37:16 | `fetch failed` after 124 ms, no response, no evidence | none        | 16:39:21 | 125 s  | technical pause, empty handoff `development-10` | no      |
|   365 | `ordinary-484` (Lin)  | 2026-11-26 19:25:09 | `fetch failed` after 117 ms, no response, no evidence | none        | 19:27:50 | 161 s  | technical pause, empty handoff `development-14` | no      |

Both are the evidence-free transport failure of fix-log 9a. No overload with a retry-after occurred, and no 60-minute window came near six recoveries.

### Pre-merge replay

On the merged code, ex7–ex15, ex17 and ex18 are byte-identical to their main digests, and the full ex16 (528 requests, 36 paused ordinary inputs) is byte-identical to the digest written on its branch. The 105 registered packages have unique ids and handlers.

## Annotation

The GPT annotation (`pnpm labels:culture`, blind to scenario and experiment) labeled 76 items of ticks 1–400 in 4 batches (23,408 tokens) after two one-batch calibration calls on ticks 1–80 (7,596 tokens). The annotation ledger stands at 31,004 of its 1,000,000 cap (`docs/presentation/labels/ledger.json`).

A Claude agent, not a human annotator, checked every positive and 20 seeded negatives against the archive text: agreement 85.7% overall (48 of 56), 80.6% on positives and 95.0% on negatives. The verified timeline is `docs/presentation/labels/ex16-1-400/timeline-verified.md`.

### Verified labels

Model labels (gpt-6.1-sol) in `docs/presentation/labels/ex16-1-400/`. A Claude agent set the verdicts on 2026-11-26, not a human annotator. It checked all 56 verification entries (36 positives and 20 seeded negatives of 40) against the `experiment/ex16` replay events, `heard` events, positions, memory views and call responses. Every item text matched the archive verbatim.

### Counts per category

| Category               | Labeled | Verified |
| ---------------------- | ------- | -------- |
| naming                 | 1       | 1        |
| name-adoption          | 0       | 0        |
| narrative              | 0       | 0        |
| narrative-continuation | 0       | 0        |
| norm                   | 3       | 3        |
| norm-repetition        | 2       | 1        |
| invitation             | 6       | 1        |
| valued-object          | 14      | 13       |
| private-view           | 12      | 12       |
| absent-person          | 3       | 2        |

One more `norm-repetition` was missed (u0021, a sampled negative).

### Agreement rates (`pnpm labels:culture -- report`)

- Overall: 48 agree, 2 partial, 6 disagree of 56. Agreement 85.7%, lenient 89.3%.
- Positives: 29 agree, 2 partial, 5 disagree of 36. Agreement 80.6%, lenient 86.1%.
- Negatives: 19 agree, 1 disagree of 20. Agreement 95.0%.
- Per category, the report counts whole entries: invitation 16.7%, norm 33.3% (both norm entries marked partial lost points on their other category), norm-repetition 50.0%, absent-person 66.7%, valued-object 92.9%, naming and private-view 100%.

### Main error kinds

1. Soft invitations: five "I'd enjoy resting together / company / comparing notes" wishes with no place or time labeled `invitation` (u0003, u0006, u0015, u0016, u0019). Only Moss's formal invitation (u0033, round 51: meet at (14.8, 16.2) at round 60) is concrete.
2. Links without reception: u0018 links Kai's norm to Lin's R1, but Kai stood 5.03 units from Lin, has no `heard` event for it and no record of it in memory. Both answered Moss's question independently.
3. Missed relay: Moss's u0021 endorses Lin's R1 and Kai's R2 after hearing both, but was left unlabeled. Kai's later repetition (u0022) came through this relay.
4. Address taken as absence: u0063 is Wren speaking to Moss, whom Wren had seen nearby but who was just out of hearing range.
5. A planned object (u0019, a "beautiful" windbreak not yet built and wanted for shelter) labeled `valued-object`.

### Verified items after round 300 (winter pressure)

Only 4 items fall in rounds 301–400, against 72 in rounds 1–300. Two are unsampled, unlabeled reports by Kai: apples at round 330 and cord study at round 337. Both were heard only by Sol. No norms and no mentions of absent people were verified after round 300. Verified:

- Valued object, round 344, ordinary-460, Moss to Ivo (heard only by Ivo): "My little grass mat was a satisfying thing to make." This is borderline: the mat is valued for what making it meant, with no mention of use.
- Name, round 373, ordinary-508, Sol names a place (place:6,17): "The Little Apple Pause". Nobody heard it, and no one adopted it by round 400. Sol's own call notes say: "The orchard name expresses my affection for this place, not a physical improvement or a promised wellbeing effect." Sol had heard Kai's apple report at round 330.

The last verified absent-person mentions came earlier, both of living neighbors who were out of hearing range:

- Round 262, ordinary-349, Moss: "Sol also noticed the crossing stems of my mat; that was lovely to hear."
- Round 284, ordinary-381, Sol: "Kai, I inspected Moss's mat …"

## Before and after tick 300

Scope: ex16 (tag `long-culture-v2`, scope `long-ex16`), ticks 201-400 in 25-tick blocks, with the halves 201-300 and 301-400. Experiment A itself covers ticks 251-400 (decisions at rounds 250-399).

Tick convention: ticks are replay event ticks. A decision (an ordinary call) recorded at round r settles in events stamped tick r + 1, so block 301-325 holds decisions made at rounds 300-324. Vitals, positions, carried items and source stocks are read from the exact-replay world after each tick's round. Call and event ids are retained archive ids.

Method: `reconstructContinuousSegment` over the indexed segments `replay/execution-000200-000300.json` and `replay/execution-000300-000400.json` (every round matched its recorded before/after hashes, events and cursors), the retained events and the call records. Sharing expressions come from `pnpm metrics:culture -- experiment/ex16 400` (which uses `cultureInput` with the same exact replay). No model was called.

### Verified facts

| Item                        | Brief                                     | Archive                                                     | Note                                                                                                                                                                     |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ledger at 400 / 250         | 4,947,979 / 2,903,618                     | 4,947,979 / 2,903,618                                       | A spent 2,044,361                                                                                                                                                        |
| Calls                       | 528                                       | 528 (A: 188)                                                | A: 170 ordinary (166 accepted, 2 failed, 2 rejected) and 18 World Agent; known usage 1,938,584 (1,858,854 in, 79,730 out) plus 105,777 reserved for the two failed calls |
| First A call                | -                                         | tick 256                                                    | none at ticks 250-255                                                                                                                                                    |
| Handoffs 8-15               | as listed                                 | as listed                                                   | 6 packages, all requested by and assigned to Wren; development-10 closes Wren's failed ordinary-375 (282), development-14 closes Lin's failed ordinary-484 (365)         |
| Survivors at 400            | 6                                         | 6, health 100                                               | no `injured` or `died` event in 201-400                                                                                                                                  |
| Pressure at 400             | 0.71, cold 1.5x, rain 0.8x, growth 1-0.4x | intensity 0.714, cold 1.071, rain floor 0.571, growth 0.714 | season label is summer through tick 399 and autumn at 400 (`season-changed` at 400); winter (year phase 0.75) begins at tick 600                                         |
| Largest input estimate in A | -                                         | 17,948 tokens                                               | Wren, ordinary-528, tick 393                                                                                                                                             |

A configured drought hazard (`west-drought-1`, centre (9, 10), radius 6, start 260, 100 ticks plus 80 of recovery) also overlaps A. It covers Wren's workspace (`local-hazard` events at ticks 293 and 385) and the hazelnut source `forest-hazelnut-1` used by Sol and Kai, whose stock stayed at 3 from tick 300 to 400.

### Climate and body temperature

The ambient temperature is `14 + 11 sin(2 pi phase) + weather + region + 4 (daylight - 0.4) + 5 - cold`, minus `0.6 (rain + wind)` outdoors. Between ticks 300 and 400 the seasonal sine falls from 7.78 to 0, while the configured cold reaches only 1.07. The pressure rain is only a floor (0.57 at 400); the natural rain term was 0.95 at tick 400.

| Block   | Intensity (end) | Cold | Rain floor | Growth | Ambient min / mean | Body temp min / mean | Thermal comfort mean | Indoor actor-ticks |
| ------- | --------------- | ---- | ---------- | ------ | ------------------ | -------------------- | -------------------- | ------------------ |
| 201-225 | 0               | 0    | 0          | 1      | 26.5 / 27.5        | 28.1 / 29.3          | 0.812                | 0                  |
| 226-250 | 0               | 0    | 0          | 1      | 26.4 / 28.2        | 27.6 / 28.2          | 0.897                | 0                  |
| 251-275 | 0               | 0    | 0          | 1      | 26.2 / 29.5        | 28.0 / 29.0          | 0.831                | 0                  |
| 276-300 | 0               | 0    | 0          | 1      | 25.7 / 26.2        | 26.8 / 28.0          | 0.919                | 0                  |
| 301-325 | 0.179           | 0.27 | 0.14       | 0.929  | 25.1 / 26.1        | 26.1 / 26.8          | 0.990                | 0                  |
| 326-350 | 0.357           | 0.54 | 0.29       | 0.857  | 24.6 / 27.6        | 26.3 / 27.1          | 0.979                | 0                  |
| 351-375 | 0.536           | 0.80 | 0.43       | 0.786  | 19.8 / 21.9        | 23.5 / 25.4          | 0.998                | 0                  |
| 376-400 | 0.714           | 1.07 | 0.57       | 0.714  | 14.1 / 18.1        | 20.1 / 22.1          | 1.000                | 7 (Kai)            |
| 201-300 |                 |      |            |        | 25.7 / 27.8        | 26.8 / 28.6          | 0.865                | 0                  |
| 301-400 |                 |      |            |        | 14.1 / 23.4        | 20.1 / 25.4          | 0.992                | 7                  |

Thermal comfort is the wellbeing term `1 - max(0, 16 - T, T - 27) / 12` of body temperature T. Thermal damage starts below 7 degrees. Before tick 300 bodies were above 27 degrees in 590 of 600 actor-ticks, so the cooling moved people into the comfort band: Sol and Kai were below 27 from tick 301, Wren from 346, Lin from 351, Moss and Ivo from 356. At tick 400 body temperatures were 20.1-21.1 degrees, 4-5 degrees above the discomfort threshold.

Sheltering and warming: none in the usual sense. Nobody made fire, built or repaired shelter, or used a mat or screen for warmth. The only indoor ticks were Kai inside `cave-2` at (6, 30.5) at ticks 378-384, after a search it framed as inspecting "a possible refuge" (ordinary-475, tick 360). Inside, the ambient was colder (14.1-14.3 against 18.5-19.4 outdoors), but the cave's insulation slowed Kai's body cooling (-0.61 degrees over ticks 378-384 against Sol's -0.81). Kai probed the cave (event-379-kai-4326), wrote "no additional shelter effect has been established" (ordinary-517, tick 383) and left. No text in A mentions cold, temperature, season, winter or the pressure, although every packet showed it (for example ordinary-526, tick 391: `pressure accumulating`, intensity 0.65, temperature 17.4, `gradually cooling`). The only related words are "regrowth" (not assumed), Lin's "A mat remains a making project, not a demonstrated source of warmth" (ordinary-437) and Kai's "refuge".

### Health and survival

| Block   | Health min / mean | Satiety min (who) / mean | Energy min (who) / mean | Wellbeing min / mean |
| ------- | ----------------- | ------------------------ | ----------------------- | -------------------- |
| 201-225 | 100 / 100         | 49.5 (Moss) / 73.8       | 7.3 (Lin) / 36.3        | 7.0 / 8.9            |
| 226-250 | 100 / 100         | 45.0 (Moss) / 74.9       | 34.0 (Ivo) / 39.5       | 8.2 / 9.3            |
| 251-275 | 100 / 100         | 42.4 (Moss) / 74.1       | 17.0 (Moss) / 36.9      | 7.6 / 9.0            |
| 276-300 | 100 / 100         | 50.5 (Ivo) / 75.8        | 26.4 (Lin) / 38.1       | 8.3 / 9.3            |
| 301-325 | 100 / 100         | 52.1 (Ivo) / 71.1        | 8.9 (Moss) / 37.3       | 7.2 / 9.3            |
| 326-350 | 100 / 100         | 51.7 (Ivo) / 74.0        | 20.9 (Moss) / 37.0      | 8.4 / 9.3            |
| 351-375 | 100 / 100         | 51.4 (Ivo) / 73.3        | 25.6 (Lin) / 37.5       | 8.5 / 9.3            |
| 376-400 | 100 / 100         | 44.0 (Wren) / 70.1       | 14.2 (Kai) / 35.0       | 7.5 / 9.1            |
| 201-300 | 100 / 100         | 42.4 / 74.7              | 7.3 / 37.7              | 7.0 / 9.1            |
| 301-400 | 100 / 100         | 44.0 / 72.1              | 8.9 / 36.7              | 7.2 / 9.2            |

Deaths: none. Per person, mean wellbeing rose from the first to the second half for Lin (9.14 to 9.50), Moss (8.63 to 9.20), Ivo (8.85 to 9.22), and fell for Sol (9.50 to 9.40), Kai (9.33 to 9.16) and Wren (9.23 to 9.01). Wren's mean satiety fell from 81.8 to 65.9 and it ended at 44 with no food after its root reserve spoiled (event-382-world-4365); its last plan (ordinary-528, tick 393) has no food step. Moss's energy minimum of 8.9 at tick 323 is the 24-energy cost of gathering 12 berries at once (tick 319), not cold.

### Food stocks and hoarding

Nutrition per unit: berry 8, root 14, apple 10, hazelnut 18 (the foods carried). Drain: satiety falls by `hunger x dt` = 0.9 per tick; a forest day is 80 ticks (`forest.day`), so one day is 72 satiety and three days are 216. Satiety is capped at 100 (one capped meal: Sol, tick 283, 35.8 of 36).

Carried edible items at block ends (count / nutrition):

| Tick | Lin      | Moss   | Sol    | Kai    | Wren       | Ivo    | Total        |
| ---- | -------- | ------ | ------ | ------ | ---------- | ------ | ------------ |
| 200  | 5 / 90   | 3 / 42 | 3 / 54 | 2 / 36 | 8 / 112    | 3 / 42 | 24 / 376     |
| 225  | 10 / 120 | 3 / 42 | 2 / 36 | 4 / 32 | 6.9 / 91.2 | 2 / 28 | 27.9 / 349.2 |
| 250  | 8 / 104  | 1 / 14 | 0 / 0  | 3 / 24 | 5.9 / 77.2 | 1 / 14 | 18.9 / 233.2 |
| 275  | 5 / 60   | 4 / 32 | 3 / 54 | 3 / 54 | 5.9 / 65.2 | 0 / 0  | 20.9 / 265.2 |
| 300  | 3 / 54   | 1 / 8  | 3 / 54 | 2 / 36 | 3 / 42     | 0 / 0  | 12 / 194     |
| 325  | 5 / 90   | 9 / 72 | 2 / 36 | 1 / 18 | 6 / 84     | 0 / 0  | 23 / 300     |
| 350  | 7 / 126  | 5 / 40 | 2 / 36 | 3 / 30 | 4 / 56     | 0 / 0  | 21 / 288     |
| 375  | 15 / 180 | 5 / 40 | 1 / 10 | 1 / 10 | 2 / 28     | 0 / 0  | 24 / 268     |
| 400  | 12 / 156 | 1 / 8  | 2 / 36 | 0 / 0  | 0 / 0      | 0 / 0  | 15 / 200     |

Maximum carried nutrition, 201-300 / 301-400: Lin 138 (tick 218) / 180 (ticks 375-377: 6 hazelnuts and 9 berries); Moss 64 / 104 (tick 319); Sol 54 / 54; Kai 68 / 48; Wren 112 (tick 207) / 84; Ivo 44 / 14. Nobody exceeded three days of drain (216). The largest store, Lin's 180, is 200 ticks (2.5 days) of drain, held by a person who was alone. After tick 264 Ivo held food only between a gather and the next meal (at most 2 units): its plan from tick 298 gathers one root per meal.

Gathered and eaten (edible units / nutrition; drain for comparison is 135 per block and 540 per 100 ticks):

| Block   | Gathered | Eaten (realized) | Spoiled                                                                              |
| ------- | -------- | ---------------- | ------------------------------------------------------------------------------------ |
| 201-225 | 12 / 106 | 8 / 132          | -                                                                                    |
| 226-250 | 2 / 16   | 11 / 132         | -                                                                                    |
| 251-275 | 19 / 212 | 16 / 166         | 1 root, Moss (event-261-world-3002)                                                  |
| 276-300 | 6 / 88   | 11 / 127.8       | 3 berries, Lin (event-283-world-3276, -3277); 0.9 berry, Wren (event-289-world-3329) |
| 301-325 | 19 / 206 | 8 / 100          | -                                                                                    |
| 326-350 | 9 / 122  | 10 / 126         | 1 berry, Moss (event-343-world-3938)                                                 |
| 351-375 | 13 / 120 | 10 / 140         | -                                                                                    |
| 376-400 | 5 / 70   | 12 / 110         | 2 roots, Wren (event-382-world-4365)                                                 |
| 201-300 | 39 / 422 | 46 / 557.8       | 81.2 nutrition in all of 201-400, all inside A                                       |
| 301-400 | 46 / 518 | 40 / 476         |                                                                                      |

Gathered nutrition by person, 201-300 / 301-400: Sol 108 / 76, Kai 86 / 40, Lin 84 / 180, Moss 72 / 96, Ivo 48 / 84, Wren 24 / 42. The world's edible stock stayed ample: 821 units (9,840 nutrition) at tick 300 and 790 units (9,494) at tick 400. Ripening events fell from 40 in 201-300 to 20 in 301-400, none after tick 350, consistent with the lower growth factor; nobody ran short.

### Giving and sharing

No `give`, `exchange`, `drop` or `pickup` action and no transfer event occurred in 201-400 (none in the whole run; the culture metrics' transfer graph is empty). Food passed between people only as information: Kai's apple report (event-330-kai-3787, heard by Sol) led Sol to try one apple after noting "this is another person's finding, not yet my own trial" (ordinary-472, tick 360; discovery event-372-world-4260). Moss's berry report (event-266-moss-3076) was heard by Wren and Ivo.

### Norms: moderate taking, leaving some, open access

Sharing expressions (culture metrics, dated by authored round, the first round of the plan that wrote them): 201-300: 8, one communicated; 301-400: 10, one communicated. In A (251-400): 13, two communicated.

| Round | Person | Kind                | Text                                                                                                                             | Idea                              |
| ----- | ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 266   | Moss   | note                | "gathering eight leaves some for others."                                                                                        | leave-for-others                  |
| 266   | Moss   | note                | "Leave room for neighbors and avoid demanding conversation."                                                                     | leave-for-others                  |
| 284   | Sol    | tell (heard by Kai) | "I'll gather just two nuts and leave the rest."                                                                                  | leave-for-others, take-moderately |
| 317   | Moss   | preference          | "Keep a food reserve without stripping a patch."                                                                                 | no-depletion                      |
| 321   | Kai    | preference          | "Maintain nourishment without stripping shared food sources."                                                                    | no-depletion                      |
| 322   | Sol    | preference          | "Use older food first and take modest harvests."                                                                                 | take-moderately                   |
| 328   | Kai    | note                | "take only one for this trial."                                                                                                  | take-moderately                   |
| 330   | Kai    | tell (heard by Sol) | "I'll collect three more, leaving the remaining fruit, and pause here for a while."                                              | leave-for-others                  |
| 330   | Kai    | note, preference    | "Gather only three of the ten apples currently visible"; "Keep food collection modest and leave accessible supplies for others." | take-moderately, leave-for-others |
| 361   | Sol    | preference          | "Keep a modest food reserve and leave fruit for others."                                                                         | leave-for-others                  |
| 373   | Sol    | note                | "Gather two apples from the five currently visible, leaving the rest."                                                           | leave-for-others                  |
| 384   | Kai    | note                | "Take only three apples if available, retaining some source stock rather than collecting everything."                            | take-moderately, no-depletion     |

The culture metrics count no public norm statement (`norms.statements` 0) and no echo. Sol's rejected first answer to Kai (ordinary-380, over 240 characters) also said "I'll gather three nuts, leaving two here", but it was never spoken. Open access appears as avoidance, not as a rule: "without crowding Sol" (Kai, ordinary-359), "Avoid occupying another person's mat or assuming it is available" (Lin, ordinary-440). Nobody claimed, marked or reserved a source.

Breaking, defined from retained stocks: a gather that empties a source (E) or takes more than half of its stock (H) while a person within 5 units has satiety below 50 (S). Every edible gather in 201-400 was checked (31 events). E or H cases:

| Tick | Event               | Who  | Source            | Took / stock | Nearby (satiety)                         | E/H  | S   |
| ---- | ------------------- | ---- | ----------------- | ------------ | ---------------------------------------- | ---- | --- |
| 212  | event-212-sol-2387  | Sol  | start-1-nuts      | 1 / 1        | Moss 61.2, Kai 71.2, Wren 85.2, Ivo 65.2 | E, H | no  |
| 267  | event-267-moss-3089 | Moss | commons-berry-0-0 | 8 / 12       | Wren 77.7, Ivo 75.7                      | H    | no  |
| 273  | event-273-wren-3173 | Wren | start-1-berries   | 2 / 3        | Moss 74.3, Ivo 70.3                      | H    | no  |
| 287  | event-287-lin-3310  | Lin  | start-2-nuts      | 2 / 2        | nobody                                   | E, H | no  |
| 319  | event-319-moss-3638 | Moss | commons-berry-0-1 | 12 / 20      | Ivo 58.9                                 | H    | no  |
| 325  | event-325-wren-3716 | Wren | start-0-roots     | 3 / 5        | Sol 79.3                                 | H    | no  |
| 361  | event-361-lin-4153  | Lin  | start-2-berries   | 3 / 4        | nobody                                   | H    | no  |

No gather met the breaking definition. The only times someone within 5 units had satiety below 50 (Moss at ticks 228 and 261) Ivo took 2 of 15 and 2 of 14 berries. In A one source was emptied (Lin, tick 287, alone), and every larger take had a full 20-unit patch within 5 units. Moss's 8-of-12 gather kept the letter of its note ("leaves some for others") but took two thirds. Spoilage (81.2 nutrition) shows reserves slightly beyond use, not deprivation of others.

### The fallen and the absent

Nobody died, so nobody fell. Mentions of a person outside 5 units in A texts (all retained calls, all text fields):

- Moss, decision tick 261 (ordinary-349; told to Ivo at 262, event-262-moss-3015): "Sol also noticed the crossing stems of my mat" (Sol 7.0 units away).
- Sol, tick 283 (ordinary-380 rejected; ordinary-381 told at 284, event-284-sol-3285): "I inspected Moss's mat" (Moss 7.0 units away).
- Sol, tick 360 (ordinary-472, note): "Kai reported that one apple supplied 10 satiety" (Kai 9.9 units away).

These recall a person's earlier words or works; none asks where anyone is or misses anyone. Lin, alone in 185 of 200 ticks of 201-400, and Wren are never named by anyone in A. Lin names nobody. No owner-only view was written in 201-400 (the held views date from rounds 3-134), and the eleven cares writes in 201-400 all restate the previous text unchanged.

### The camp and the works

| Work                 | Maker | Tick 250                  | Tick 300 | Tick 400                                       | Events in A                                                                                                               | Near (within 2.5 units) in A           |
| -------------------- | ----- | ------------------------- | -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| mat-37-moss-435      | Moss  | complete, condition 0.818 | 0.793    | 0.743                                          | none                                                                                                                      | Sol 2 ticks (251-275), Lin 6 (351-375) |
| mat-79-wren-890      | Wren  | complete, 0.912           | 0.887    | 0.837                                          | none                                                                                                                      | nobody                                 |
| screen-50-sol-571    | Sol   | complete, integrity 0.614 | 0.543    | damaged, 0.238                                 | deteriorated 264; damaged 321 (event-321-world-3673, "gives no shielding until repaired"); deteriorated 323-325, 356, 385 | Lin 10 ticks (326-375)                 |
| screen-168-wren-1870 | Wren  | complete, 0.851           | 0.780    | damaged, 0.474                                 | deteriorated 289, 335, 367; damaged 394 (event-394-world-4496); deteriorated 395-397                                      | nobody                                 |
| sign-373-sol-4269    | Sol   | -                         | -        | name "The Little Apple Pause" at place (6, 17) | named 373 (event-373-sol-4270)                                                                                            | Sol 15 ticks                           |

Nobody repaired, inspected or used a screen or mat in 251-400; the last mat inspection was Sol's at tick 219. Lin's 10 ticks beside Sol's screen and 6 beside Moss's mat were failed approaches to the empty dry-grass patch (ordinary-437 to -457), in which it avoided "occupying another person's mat". Lin learned branch-screen (mastered 324) and tried one post, which failed on soil (event-325-lin-3716). The camp emptied: in 276-325 nobody came within 2.5 units of any mat or screen.

Wren's cords and assemblies (all in Wren's inventory at 400, used by nobody else): two 0.30 m cords (item-226-wren-2532, item-250-wren-2847), a 0.50 m cord (item-303-wren-3473), a 0.60 m cord (item-337-wren-3866) and a 1.10 m cord (item-371-wren-4249) bound into the frapped two-turn lashing `lashing-389-wren-4439` of branches item-287-wren-3309 and item-295-wren-3384. Lin (mastered 261) and Kai (mastered 340) learned hand-twist-fiber-cord from the catalogue, not from Wren: neither heard any Wren tell in 201-400. Lin's dry-grass and vine samples failed (event-262-lin-3018, event-314-lin-3584); Kai found no reed.

### Communication

| Block   | Tells | Messages | Names | Invitations | Marks | Heard events | Speakers (listeners)                                                                                                                               |
| ------- | ----- | -------- | ----- | ----------- | ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201-225 | 5     | 0        | 0     | 0           | 0     | 11           | Kai 201 (Moss, Sol, Ivo); Sol 202 to Kai (Kai); Moss 204 to Ivo (Sol, Kai, Ivo); Wren 204 to Moss (nobody); Sol 220 to Moss (Moss, Kai, Wren, Ivo) |
| 226-250 | 2     | 0        | 0     | 0           | 0     | 6            | Wren 233, 249 (Moss, Sol, Ivo)                                                                                                                     |
| 251-275 | 2     | 1        | 0     | 0           | 0     | 4            | Moss 262 to Ivo, 266 (Wren, Ivo); Kai message to Sol 270                                                                                           |
| 276-300 | 2     | 0        | 0     | 0           | 0     | 3            | Wren 277 (Moss, Ivo); Sol 284 to Kai (Kai)                                                                                                         |
| 301-325 | 0     | 0        | 0     | 0           | 0     | 0            | -                                                                                                                                                  |
| 326-350 | 3     | 0        | 0     | 0           | 0     | 3            | Kai 330, 337 (Sol); Moss 344 to Ivo (Ivo)                                                                                                          |
| 351-375 | 0     | 0        | 1     | 0           | 0     | 0            | Sol names place (6, 17) at 373                                                                                                                     |
| 376-400 | 0     | 0        | 0     | 0           | 0     | 0            | -                                                                                                                                                  |
| 201-300 | 11    | 1        | 0     | 0           | 0     | 24           |                                                                                                                                                    |
| 301-400 | 3     | 0        | 1     | 0           | 0     | 3            |                                                                                                                                                    |

Event ids in A: event-262-moss-3015, event-266-moss-3076, event-270-kai-3143 (message), event-277-wren-3222, event-284-sol-3285, event-330-kai-3787, event-337-kai-3862, event-344-moss-3949, event-373-sol-4270 (name). Listeners in 301-400: Sol heard Kai twice, Ivo heard Moss once. Lin heard nothing and said nothing in 201-400 (its last tell was at tick 78). Wren's last tell was at tick 277; it heard nothing after tick 300.

The run's first message and first name both fall in A. Kai's message (`Quiet company and food`) reached Sol at its next decision, tick 283 (ordinary-378 to -381 inputs). Sol's first reply was rejected (ordinary-380, tell over 240 characters); the accepted reply was told at 284, addressed to Kai and heard by Kai. That is 14 ticks after the message, outside the culture metrics' 10-round response window, so the response graph has no edge. Sol's name sign "The Little Apple Pause" (ordinary-508: "The orchard name expresses my affection for this place") appears in Lin's later packets (ordinary-518, -521 to -523) and Sol's (ordinary-524 to -526), and nobody spoke of it.

Questions and answers:

- Sol, tick 220, to Moss: "If you know another grass source, I'd welcome directions" (heard by Moss, Kai, Wren, Ivo). Unanswered.
- Kai, tick 270, message to Sol: "I'd enjoy hearing about your mat studies". Answered at 284 (above).
- Moss, tick 344, to Ivo: "Is there something you've enjoyed lately, or something you'd like to try?" (heard by Ivo). Unanswered: Ivo's plan ordinary-391 (tick 298) repeats a wait-gather-eat-rest cycle until tick 470 with no interrupts, and Ivo made no decision in ticks 299-400.

Proximity (pairs within 5 units, actor-ticks with nobody within 5):

| Block   | Solitary actor-ticks                 | Pairs within 5 units (ticks)                       |
| ------- | ------------------------------------ | -------------------------------------------------- |
| 201-225 | 27 (Lin 21, Wren 6)                  | Moss-Ivo 25, Sol-Kai 25, Moss-Sol 23, Moss-Wren 19 |
| 226-250 | 25 (Lin)                             | Moss, Sol, Wren, Ivo all 25; Sol-Kai 25            |
| 251-275 | 25 (Lin)                             | Moss-Wren, Moss-Ivo, Sol-Kai, Wren-Ivo 25          |
| 276-300 | 26 (Lin 25, Wren 1)                  | Moss-Ivo 25, Sol-Kai 25, Moss-Wren 15              |
| 301-325 | 25 (Lin)                             | Moss-Ivo 25, Sol-Kai 25, Sol-Wren 25               |
| 326-350 | 33 (Lin 24, Kai 9)                   | Moss-Ivo 25, Sol-Wren 25, Sol-Kai 16               |
| 351-375 | 85 (Kai 25, Sol 21, Wren 21, Lin 18) | Moss-Ivo 25, Lin-Ivo 7, Sol-Wren 4                 |
| 376-400 | 90 (Kai 24, Wren 23, Lin 22, Sol 21) | Moss-Ivo 25, Sol-Wren 2, Lin-Sol 2                 |
| 201-300 | 103                                  | Moss-Ivo 100, Sol-Kai 100, Moss-Wren 84            |
| 301-400 | 233                                  | Moss-Ivo 100, Sol-Wren 56, Sol-Kai 41              |

Activity and decisions (calls counted at decision ticks s-1 to e-1):

| Block   | Idle (rest + wait) | Navigate | Craft actions | Calls | Tokens    | Decisions (by person)                           |
| ------- | ------------------ | -------- | ------------- | ----- | --------- | ----------------------------------------------- |
| 201-225 | 62.0%              | 28       | 4             | 47    | 418,666   | 19 (Wren 8, Sol 5, Kai 3, Ivo 1, Moss 1, Lin 1) |
| 226-250 | 82.0%              | 0        | 15            | 25    | 258,569   | 10 (Wren 6, Kai 2, Lin 1, Sol 1)                |
| 251-275 | 60.7%              | 17       | 17            | 25    | 251,836   | 10 (Lin 4, Wren 3, Moss 2, Kai 1)               |
| 276-300 | 71.3%              | 22       | 2             | 29    | 356,844   | 10 (Wren 6, Lin 2, Sol 1, Ivo 1)                |
| 301-325 | 67.3%              | 14       | 20            | 30    | 307,438   | 13 (Lin 5, Wren 4, Moss 2, Kai 1, Sol 1)        |
| 326-350 | 59.3%              | 28       | 13            | 37    | 380,377   | 14 (Lin 5, Kai 4, Wren 4, Moss 1)               |
| 351-375 | 56.7%              | 30       | 16            | 47    | 538,046   | 16 (Kai 5, Wren 6, Lin 3, Sol 2)                |
| 376-400 | 47.3%              | 43       | 21            | 20    | 209,820   | 9 (Lin 4, Wren 3, Sol 1, Kai 1)                 |
| 201-300 | 69.0%              | 67       | 38            | 126   | 1,285,915 | 49                                              |
| 301-400 | 57.7%              | 115      | 70            | 134   | 1,435,681 | 52                                              |

Idle rounds beside someone (within 5 units at the start of the round) fell from 356 to 265 and solitary idle rose from 58 to 81. The A blocks (251-400) sum to the 2,044,361 A tokens.

### Wren's craft chain, ticks 251-400

| Tick    | What happened                                                                                                                                                                                                                         | Evidence                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 253     | Second 0.30 m two-ply reed cord completed (item-250-wren-2847)                                                                                                                                                                        | event-253-wren-2884; ordinary-340                                                                            |
| 256-259 | Requested and mastered hand-join-fiber-cords (development-8)                                                                                                                                                                          | event-257-wren-2936, event-259-wren-2970                                                                     |
| 260-267 | Sheet bend tied (263), held 5 N for 30 s (264), inspected, untied (267); a later join inspection failed because the join no longer existed (268)                                                                                      | event-263-wren-3036, event-264-wren-3053, event-267-wren-3091, event-268-world-3115; ordinary-344, -353      |
| 277     | Told the sheet-bend result (heard by Moss, Ivo); requested hand-lash-branches                                                                                                                                                         | event-277-wren-3222; ordinary-368                                                                            |
| 279-282 | Mastered hand-bind-crossing (development-9); ordinary-375 failed (`fetch failed`), closed by the empty development-10                                                                                                                 | event-282-wren-3267                                                                                          |
| 287-295 | Gathered two branches; binding refused for lack of room (290); then a measured shortfall: the cord is 0.34 m and the binding needs 0.4332 m                                                                                           | event-290-world-3339, event-295-wren-3388; ordinary-376, -384, -386                                          |
| 299-301 | Requested and mastered hand-twist-sectioned-cord (development-11)                                                                                                                                                                     | event-299-wren-3428, event-301-wren-3453; ordinary-388                                                       |
| 309     | 0.50 m (0.54 m overall) cord, ply 3.2 mm                                                                                                                                                                                              | event-309-wren-3531; ordinary-398                                                                            |
| 313-321 | Single-wrap binding fitted and held on release (316); held 5 N separation and 1 N slide for 10 s each (318, 319); untied (321)                                                                                                        | event-316-wren-3604, event-318-wren-3623, event-319-wren-3639, event-321-wren-3672; ordinary-401, -409       |
| 330-334 | Requested and mastered hand-lash-crossing (development-12)                                                                                                                                                                            | event-330-wren-3787, event-334-wren-3826; ordinary-425                                                       |
| 335     | Two-turn lashing shortfall: 0.54 m cord, 0.6273 m needed                                                                                                                                                                              | event-335-wren-3841; ordinary-446                                                                            |
| 343     | 0.60 m (0.64 m overall) cord, ply 2.9 mm                                                                                                                                                                                              | event-343-wren-3937; ordinary-447                                                                            |
| 346-360 | Two-turn lashing fitted (0.6124 m needed) and held on release (350); held 5 N separation and 1 N slide for 10 s (353, 354); held 10 N separation for 60 s (355); slipped at 4.3 N in a 5 N slide trial (356); inspected, untied (360) | event-350-wren-4028, event-355-wren-4079, event-356-wren-4095, event-360-wren-4139; ordinary-461, -463, -471 |
| 364-366 | Requested and mastered hand-frap-crossing (development-13)                                                                                                                                                                            | event-364-wren-4181, event-366-wren-4198; ordinary-478                                                       |
| 367     | Frapping assessment: shortfall, 0.8911 m needed with the 0.64 m cord                                                                                                                                                                  | event-367-wren-4208; ordinary-487                                                                            |
| 369     | Requested and mastered hand-twist-long-sectioned-cord (development-15); ordinary-501 rejected (plan shape), ordinary-502 accepted                                                                                                     | event-369-wren-4226; ordinary-495, -502                                                                      |
| 370-383 | Mat-offcut reed sample passed (370); 1.10 m (1.14 m overall) cord in 4 sections and 13 paid rounds, ply 3.1 mm (383)                                                                                                                  | event-370-wren-4237, event-383-wren-4376; ordinary-502, -514                                                 |
| 388     | Frapping assessment fits: 0.9064 m of 1.14 m                                                                                                                                                                                          | event-388-wren-4428; ordinary-514                                                                            |
| 389-393 | New two-turn lashing with the long cord held on release                                                                                                                                                                               | event-393-wren-4483; ordinary-520                                                                            |
| 394-400 | One transverse frapping turn closed and held (397); held 1 N slide and 5 N slide for 10 s (398, 399) and 10 N separation for 60 s (400)                                                                                               | event-397-wren-4529, event-398-wren-4540, event-399-wren-4556, event-400-wren-4568; ordinary-528             |

All 18 World Agent calls in A reviewed Wren's six requests (three per request at ticks 256, 278, 298, 329, 363, 368). Wren's own notes keep the limits: "These are bounded hand trials, not a load rating or shelter test. Different cord diameters prevent a controlled comparison with the earlier lashing" (ordinary-528). The frapped lashing passed the 5 N slide that the unfrapped one failed, but with a thicker cord (6.2 mm against 5.9 mm), so the chain does not isolate the frapping effect. Nothing Wren made was given, shown or used by anyone else, and the event text says the lashing "gives no shelter" (event-397-wren-4529).

## Timeline of events (verified)

Verified on 2026-11-26: verdicts on the model labels (gpt-6.1-sol) for ex16 rounds 1–400 were set by a Claude agent at the user's request, not by a human annotator, and await a human spot-check. Every entry of [`verification.json`](labels/ex16-1-400/verification.json) (36 positives and 20 seeded negatives of 40) was checked against the retained archive in `experiment/ex16`: the replay events, `heard` events and positions within the 5-unit hearing range, the memory views and the call responses.

### Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex16-1-400`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 56      | 48    | 2       | 6        | 85.7%     | 89.3%                     |
| Positives | 36      | 29    | 2       | 5        | 80.6%     | 86.1%                     |
| Negatives | 20      | 19    | 0       | 1        | 95.0%     | 95.0%                     |

The report's per-category rates count whole entries, so a partial entry lowers every category it holds. Counted per category instead:

| Category        | Labeled | Verified | Report agreement |
| --------------- | ------- | -------- | ---------------- |
| naming          | 1       | 1        | 100%             |
| norm            | 3       | 3        | 33.3%            |
| norm-repetition | 2       | 1        | 50.0%            |
| invitation      | 6       | 1        | 16.7%            |
| valued-object   | 14      | 13       | 92.9%            |
| private-view    | 12      | 12       | 100%             |
| absent-person   | 3       | 2        | 66.7%            |

No item was labeled `name-adoption`, `narrative` or `narrative-continuation`.

### Verified events

One row per item with at least one category judged correct; only the verified categories are listed. Texts are verbatim from the archive.

| Round | Call         | Person | Verified categories          | Text                                                                                                                                                                                                                 | Links and details                                                                                                                             | Item  |
| ----- | ------------ | ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 3     | ordinary-23  | moss   | private-view                 | A neighbor who introduced themself, offered berry knowledge, and expressed interest in sharing and a fair camp. I'd like to get to know them.                                                                        | view of kai                                                                                                                                   | u0004 |
| 5     | ordinary-24  | kai    | private-view                 | Seems welcoming and interested in sharing food knowledge and a fair camp.                                                                                                                                            | view of moss                                                                                                                                  | u0007 |
| 5     | ordinary-24  | kai    | private-view                 | Seems drawn to quiet beauty and open to companionship.                                                                                                                                                               | view of sol                                                                                                                                   | u0008 |
| 9     | ordinary-27  | sol    | private-view                 | A prospective companion who speaks warmly of company and sharing food knowledge.                                                                                                                                     | view of moss                                                                                                                                  | u0009 |
| 9     | ordinary-27  | sol    | private-view                 | A prospective companion whose interest in modest harvesting and a fair camp appeals to me.                                                                                                                           | view of kai                                                                                                                                   | u0010 |
| 11    | ordinary-36  | moss   | private-view                 | A neighbor who enjoys the forest's quiet beauty and has welcomed company. I'd like to spend time together.                                                                                                           | view of sol                                                                                                                                   | u0012 |
| 12    | ordinary-39  | moss   | private-view                 | A neighbor who values room to wander, welcomes company, and is interested in learning cultivation. I'd enjoy comparing experiences without crowding them.                                                            | view of lin                                                                                                                                   | u0013 |
| 13    | ordinary-43  | ivo    | private-view                 | A nearby person interested in wandering, company, and learning to plant food; I would welcome comparing observations.                                                                                                | view of lin                                                                                                                                   | u0014 |
| 19    | ordinary-48  | lin    | norm                         | Moss, a welcoming camp would leave room for quiet and freedom to come and go. I'd enjoy resting together later. I'm trying one small berry planting nearby; I don't yet know whether it will establish.              | new norm R1; answers Moss's question at tick 18 (ordinary-39)                                                                                 | u0016 |
| 19    | ordinary-48  | lin    | private-view                 | Welcoming and interested in sharing food knowledge and company; I appreciate the invitation without wanting obligations.                                                                                             | view of moss                                                                                                                                  | u0017 |
| 20    | ordinary-55  | kai    | norm                         | A welcoming camp would leave food accessible to everyone and room for quiet company. I'd like to learn cultivation too, then compare what actually grows rather than assume planting will work.                      | new norm R2; the model's repetition link to R1 is rejected: Kai never heard u0016                                                             | u0018 |
| 25    | ordinary-72  | kai    | norm-repetition              | A welcoming camp would leave food accessible and room to come and go. I've learned cultivation; I'll try planting one berry in the nearby meadow. It may not establish. Your mat and windbreak ideas sound lovely.   | repeats Lin's R1 (u0016, tick 19, ordinary-48), received through Moss's relay u0021 (tick 22, ordinary-59); "food accessible" is Kai's own R2 | u0022 |
| 50    | ordinary-119 | moss   | norm                         | The mat held during my sitting trial, without slipping or sharp loose stems. That doesn't establish warmth or extra comfort. It's here for shared use, one person at a time; quiet company is welcome.               | new norm R3 for Moss's mat                                                                                                                    | u0031 |
| 51    | ordinary-119 | moss   | invitation                   | Quiet company near the little mat; bring yourself, not supplies. We can compare our experiments, or simply rest.                                                                                                     | meeting at (14.8, 16.2), round 60; heard by lin, sol, kai, ivo                                                                                | u0033 |
| 54    | ordinary-128 | ivo    | private-view                 | A welcoming neighbor whose invitation to quiet company appeals to me.                                                                                                                                                | view of moss                                                                                                                                  | u0036 |
| 61    | ordinary-129 | sol    | valued-object                | I'd welcome some quiet company, Moss. I've been weaving a little branch screen nearby. I like the pattern of the rods, though I won't assume it makes the resting place more comfortable.                            | Sol's branch screen                                                                                                                           | u0040 |
| 70    | ordinary-134 | sol    | valued-object                | The screen is finished: eleven pieces, with none missing or loose at inspection. The wind was too strong for its shelter effect. I like the woven pattern anyway. I'll sit quietly awhile, then gather some berries. | Sol's branch screen                                                                                                                           | u0041 |
| 71    | ordinary-138 | moss   | valued-object                | Sol, I'm glad you like the pattern, even without shelter from this wind. Ivo and Kai, I'm glad you're nearby too. I'll stay quietly a while, then collect some roots for later.                                      | Sol's branch screen; reply to u0041                                                                                                           | u0042 |
| 71    | ordinary-138 | moss   | private-view                 | A neighbor who welcomed quiet company and candidly shared an unsuccessful planting attempt. I appreciate their considerate presence.                                                                                 | view of ivo                                                                                                                                   | u0043 |
| 116   | ordinary-178 | sol    | valued-object                | I tried a hazelnut: it supplied 18 satiety with no observed toxicity. I'm returning for a quiet pause beside the woven screen. Its gaps and crossing branches still appeal to me; company is welcome …               | Sol's branch screen                                                                                                                           | u0050 |
| 119   | ordinary-198 | kai    | valued-object                | Thank you, Sol. I inspected the screen: no pieces missing or loose, and I enjoy its woven pattern. Your hazelnut report interests me. I'll collect a small sample from the western plant and try it for myself.      | Sol's branch screen, after Kai's first use at tick 118                                                                                        | u0052 |
| 133   | ordinary-214 | moss   | valued-object                | Sol, I'd enjoy some quiet company near your screen. I like having these little woven things around us, even without assuming they change the shelter. No need to interrupt your own plans.                           | the mat and screen                                                                                                                            | u0053 |
| 134   | ordinary-222 | sol    | valued-object                | Moss, I'd enjoy that quiet company. I'll pause near the screen, then make a short food-gathering trip. I like how our woven things give this place a character of its own.                                           | the mat and screen; reply to u0053                                                                                                            | u0054 |
| 134   | ordinary-222 | sol    | valued-object, private-view  | A welcome quiet companion; I enjoy our shared affection for the little woven things around us.                                                                                                                       | view of moss; the mat and screen                                                                                                              | u0055 |
| 147   | ordinary-232 | kai    | valued-object                | I tried a hazelnut: 18 satiety and no observed toxicity. I'm back for quiet company beside the screen. I like its crossing branches; there's no obligation to talk.                                                  | Sol's branch screen; echoes Sol's "crossing branches" (u0050, tick 116)                                                                       | u0056 |
| 202   | ordinary-276 | sol    | valued-object                | Kai, I still like the crossing branches here. I'm going to study hand-plaiting a small mat—a different pattern to explore, without assuming it gives shelter or comfort.                                             | Sol's branch screen                                                                                                                           | u0061 |
| 220   | ordinary-300 | sol    | valued-object                | Moss, I like the crossing stems of your mat. I've learned the weaving method, but the nearby grass patch is empty, so I'll leave it alone. If you know another grass source, I'd welcome directions.                 | Moss's mat, inspected by Sol at tick 219                                                                                                      | u0065 |
| 262   | ordinary-349 | moss   | valued-object, absent-person | Ivo, I've enjoyed the quiet company. I'll try one of these berries for a change from roots. Sol also noticed the crossing stems of my mat; that was lovely to hear.                                                  | Moss's mat; absent: sol, recalling u0065 (tick 220, ordinary-300)                                                                             | u0068 |
| 284   | ordinary-381 | sol    | absent-person                | Kai, I inspected Moss's mat, but haven't established any comfort benefit. A whole hazelnut resisted my bare-hand bending trial. I enjoy our quiet company. I'll gather just two nuts and leave the rest.             | absent: moss (7.05 units away)                                                                                                                | u0072 |
| 344   | ordinary-460 | moss   | valued-object                | Ivo, I've enjoyed your quiet company. My little grass mat was a satisfying thing to make. Is there something you've enjoyed lately, or something you'd like to try? No need to interrupt your meal.                  | Moss's mat                                                                                                                                    | u0075 |
| 373   | ordinary-508 | sol    | naming                       | The Little Apple Pause                                                                                                                                                                                               | names a place (place:6,17), N1                                                                                                                | u0076 |

### Missed by the model

- u0021 (round 22, ordinary-59, moss), a sampled negative: "Sol and Kai, I'd like quiet company, room to come and go, and food left accessible." It endorses Lin's R1 (u0016, round 19, ordinary-48) and Kai's R2 (u0018, round 20, ordinary-55); Moss heard both. It should be `norm-repetition`. The 20 unsampled negatives were not verified.

### Rejected labels

- `invitation` on u0003, u0006, u0015, u0016 and u0019: wishes for company ("I'd enjoy …") with no meeting place or time.
- `norm-repetition` on u0018: Kai never heard Lin's u0016 (5.03 units away, no `heard` event, absent from Kai's call memory).
- `valued-object` on u0019: the windbreak did not exist yet and was wanted for shelter as well as looks.
- `absent-person` on u0063: Wren addresses Moss directly, having seen Moss nearby; Moss was just outside hearing range.

## Deviations from the plan

- **"Winter" did not arrive within the window.** The pressure was confirmed to start at tick 300, as required, but it ramps to full only at tick 440, and the season label stays summer until tick 400 (winter begins at tick 600). The window therefore shows the onset of pressure, not a hard season. A configured drought hazard (`west-drought-1`, ticks 260–440) overlaps the window as well.
- **Two evidence-free transport failures** were closed by empty handoffs instead of the transport recovery (fix-log 9a).
- **The window-bound analysis check had to learn nested windows** (fix-log 10a); without it, ex16's round-250 analysis would fail after this extension.
- **Label verdicts are an agent's, not a human's.** The same model family that wrote the report checked the labels; a human spot check is advised.

## Limitations

- One trajectory; nothing here is a causal estimate of the pressure's effect. The social change after tick 300 coincides with long private plans and individual projects that started before it.
- The pressure was mild in this window, so A says nothing about scarcity, injury or death. Extending to round 600 or beyond would be needed to observe the season the experiment was named for.
- Annotation is lexical and model-based. Categories such as `invitation` were over-assigned (1 of 6 verified), and one repetition was missed.
- Developer and subagent model usage for handoffs, analyses and verification is not metered; the annotation ledger is.
