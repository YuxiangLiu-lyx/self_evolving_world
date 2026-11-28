# Run report: experiment D, two separated groups (ex26)

This report covers experiment D of the user's culture program ([PR-46](../exec-plans/completed/pr-46-d-villages.md)). It asks what two separately formed groups do when hunger brings them together:

- whether their names conflict, coexist, merge or are adopted;
- how they negotiate norms;
- how they compete for food.

Every number comes from the retained archive `experiment/ex26`, the verified labels under [`labels/ex26-1-162/`](labels/ex26-1-162/timeline-verified.md) and the [companion analyses](#links). No model was called for this report.

**The main result: the groups never met.**

- **Separation:** the closest the two groups came was 49.6 units, Sol and Ivo at round 162, ten times the 5-unit range of sight and hearing. The middle food area was never reached, and all 48 of its sources still held 960 of 960 units.
- **Hunger:** both groups grew hungry. Kai starved from round 144 and stood at health 20 when the run stopped, and Lin starved from round 161. Each group spoke only among itself.
- **The stop:** ex26 stopped at round 162, before the planned round 200, after three consecutive rejected outputs from Kai. Under the standing rules that is a technical stop, and it was not bypassed. Each of the three plans began with a guarded step that could not run (fix-log [13c](fix-log.md#13c-a-false-step-guard-ends-a-plan-which-stopped-ex26-at-round-162)). The user's extension rule (keep extending past round 200 until contact) never came into play.

The run therefore answers R4.1 (names, sayings and norms in each group before contact) and R4.5 in part (food), and leaves R4.2–R4.4 unobserved. It is one run on one seed; it describes what happened and does not generalize.

## Configuration

| Item       | Value                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan       | [PR-46](../exec-plans/completed/pr-46-d-villages.md), requirements R1–R6                                                                                                                                                                                                       |
| Command    | `pnpm experiment:continuous -- new long-culture-v2-villages`, then `extend ex26 200` after the first window ([design](../CULTURE_SCENARIO.md#villages))                                                                                                                        |
| Archive    | ex26, scenario `culture-v2-villages`, scope `long-ex26`, seed 20261123, model gpt-6.1-sol; the culture v2 prompt and rules with incentives off and the open goal                                                                                                               |
| People     | West: Lin (freedom), Moss (belonging), Sol (beauty). East: Kai (fairness), Wren (mastery), Ivo (calm). Each similar pair of leanings is split between the groups                                                                                                               |
| World      | 144 × 36: two mirrored ex13 neighborhoods joined by a meadow. 264 nutrition near each group (87–98 rounds for three people); a middle area of 48 regenerating sources with 20 units each, 20 times both groups' food. Nothing in any input names the other group or the middle |
| Budgets    | first window to round 100, then to 200; development handoff budget 16; hard token budget 3,000,000                                                                                                                                                                             |
| Separation | proved offline for rounds 1–60: 2 × 60 × 0.8 + 5 = 101 < 111.6, the minimum distance between the groups' starts                                                                                                                                                                |

## Run

| Rounds         | Stop reason                                                                 | Ledger tokens          | Calls (ordinary + World Agent) | Counted handoffs | Rejected outputs | Failed calls | Technical pauses  |
| -------------- | --------------------------------------------------------------------------- | ---------------------- | ------------------------------ | ---------------: | ---------------: | -----------: | ----------------- |
| 0 → 162 of 200 | paused for review after three consecutive rejected outputs (Kai, round 162) | 2,105,707 of 3,000,000 | 287 (263 + 24)                 |          8 of 16 |               12 |            1 | rounds 13 and 162 |

- **Ledger.**
  - Ordinary calls recorded 1,845,108 input and 103,448 output tokens; World Agent calls recorded 108,065 and 15,042.
  - The failed `ordinary-47` keeps its 34,044-token reservation.
  - The first call started at 2026-11-28 01:06 UTC and the last at 08:39 UTC.
  - The largest ordinary input estimate was 10,766 tokens (Lin, `ordinary-272`, tick 161).
- **Window.** The first window completed at round 100 (`windows/through-100/`, checkpoint commit `7e34bdf`), and `extend ex26 200` continued it.
- **Rejected outputs**, all uncounted:
  - eight "Expected the registered task plan shape." Each of them omitted the required `preferences` field: `ordinary-33`, `-58`, `-94`, `-163`, `-190`, `-241`, `-268` and `-275`.
  - one tell over 240 characters (`ordinary-88`);
  - three "Expected a bounded executable personal plan." (`ordinary-285`, `-286`, `-287`, Kai, round 162), which ended the run.
- **Round 13.** Ivo's `ordinary-47` failed with "fetch failed" and no retained evidence. `repair` issued a technical handoff (`development-3`), which was closed empty and uncounted.
- **Survival.** All six were alive at round 162, so nobody died. Final health and satiety:

  | Person | Health | Satiety |
  | ------ | -----: | ------: |
  | Lin    |     84 |       0 |
  | Moss   |    100 |      31 |
  | Sol    |    100 |      22 |
  | Kai    |     20 |       0 |
  | Wren   |    100 |      54 |
  | Ivo    |     92 |      30 |

  Kai took starvation damage in 10 rounds from round 144, Lin in 2 rounds from round 161.

## Handoffs

Every package is a simplified but real mechanism scoped `long-ex26`. The table lists each development by the round of the World Agent's develop decision. Movement in every package goes through `navigate`, at most 0.8 per round, and none reads anything outside the person's 5-unit perception. Every brief required this, and every package's tests check it.

| Round | Requester | Package                                             | What it does                                                                                                                                                                                                                                                       | Outcome in ex26                                                                                                                |
| ----: | --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
|     0 | Kai       | development-1, failed                               | the lead's merge oversight: the full unit suite failed on `scripts/long-allocation.test.ts` (fix-log [13a](fix-log.md#13a-a-merge-oversight-failed-the-first-development-handoff)); counted                                                                        | –                                                                                                                              |
|     0 | Kai       | `bounded-resource-search@1` (learning 1)            | a multi-round search-and-collect controller over navigate, probe observation and gather, within the person's own perception and remembered sources; stops at each budget, health ≤ 60, satiety ≤ 8 and similar lines                                               | used by all six: 475 actions, the most used interface                                                                          |
|    23 | Kai       | `reciprocal-conversation@1` (learning 1)            | a two-person session over tell: both join, speech reaches only hearers within 5, and a reciprocal exchange is recorded when one answers the other's heard words                                                                                                    | Moss and Sol held session-54-sol (rounds 54–74, one exchange at round 61); Wren's session-58-wren with Ivo never became active |
|    99 | Wren      | `tend-rooted-plants@1` (learning 3)                 | inspection of an established plant's growth figures; prepare and maintain report "no corrective work indicated" because the plant model has no hand-changeable condition (fix-log [13d](fix-log.md#13d-tending-plants-has-no-hand-changeable-condition-to-act-on)) | Wren inspected `start-4-roots` once (round 110): "at least 179 more rounds even at the best possible rate"                     |
|   102 | Kai       | `assess-food-suitability@1` (learning 1)            | probe observation plus four evidence-linked conclusions (identity, nutrition, toxicity, preparation); trials only through probe press or wet tests against a control                                                                                               | not used                                                                                                                       |
|   138 | Lin       | `bounded-resource-search-recheck@1` (learning 1)    | adds a once-per-run recheck of sources the person saw empty, an emergency mode without the satiety stop, and avoided areas                                                                                                                                         | 38 actions (Lin, Moss, Sol)                                                                                                    |
|   154 | Kai       | `bounded-resource-search-low-health@1` (learning 1) | replaces the health ≤ 60 stop with a `minHealth` threshold of 20–100; pure starvation damage is governed by it (revised before submission, fix-log [13e](fix-log.md#13e-the-low-health-search-first-counted-starvation-as-an-injury))                              | Kai used it in rounds 156–161 without finding food                                                                             |
|   161 | Lin       | `bounded-food-foraging@1` (learning 1)              | gather-then-eat across the food kinds the person has eaten, with the low-health stops; `minHealth` 60 by default                                                                                                                                                   | the run stopped one round after it was installed                                                                               |

- **Answered by reuse.** One request started no handoff: Wren's at round 53 was answered by reuse of `probe` (`world-126`).
- **Shared runtime changes:**
  - `open-experience.ts` gained routine entries for six interfaces: the four search and foraging interfaces and the two probe-like ones. Each entry is gated on its own revision.
  - `continuous-kernel.ts` exports its navigate step as `v7NavigateStep`.
  - `long-ex24-food-evidence.ts` and the ex26 modules gained alias export blocks.
  - `continuous.ts` registers the packages.
- **Compatibility.** After each shared change, ex13, ex16, ex18, ex22, ex24 and ex25 were compared and replayed identically.

## Annotation

Rounds 1–162 were labeled blind with `pnpm labels:culture` (seed 20261123): 30 items in 2 calls, 6,546 annotation tokens. A first pass over rounds 1–100 (2 calls, 5,615 tokens) was set aside before verification. Its items missed the words spoken inside conversation sessions, and the reader was fixed in this PR (fix-log [13b](fix-log.md#13b-words-spoken-through-a-conversation-session-were-not-label-items)). The annotation ledger stands at 99,470 of 1,000,000 tokens.

Every positive and, because there are fewer than 20, every negative was verified against the archive. The verdicts were set by a Claude agent, not a human.

| Sample    | Entries | Agree | Disagree | Agreement |
| --------- | ------: | ----: | -------: | --------: |
| Overall   |      30 |    29 |        1 |     96.7% |
| Positives |      14 |    13 |        1 |     92.9% |
| Negatives |      16 |    16 |        0 |      100% |

The one rejected label is `naming` on Sol's mention of "session-54-sol": a session id that the conversation package assigns automatically. The [verified timeline](labels/ex26-1-162/timeline-verified.md) lists every event.

## Observations (R4)

### 1. Names, sayings and norms in each group

#### West (Lin, Moss, Sol)

- **The run's only name.** At round 25 Sol named a place "Berryglow Clearing" (`ordinary-70`, `event-25-sol-245`). She mentioned it again at rounds 35 and 37, once saying "the name makes me smile". Nobody else used it.
- **Invitations and a conversation.** Sol and Moss exchanged invitations: Sol at rounds 35 (unheard), 61 and 62, and Moss at round 70. Their conversation session-54-sol ran from round 54 to 74. Moss's contribution at round 58 ("What do you enjoy noticing when supplies aren't the whole story?") and Sol's answer at round 61 form its one reciprocal exchange.
- **Private views.** Moss wrote four private views (three of Sol, one of Lin), and Sol two of Moss.
- **No norm or narrative** was verified for the West.

#### East (Kai, Wren, Ivo)

- **The run's only norm.** At round 55 Wren told Ivo: "Please distinguish observations from guesses." (`ordinary-130`, `event-55-wren-539`). Nobody repeated it.
- **Invitations to conversation.**
  - At round 23 Kai invited Ivo to "a conversation after our foraging" (`ordinary-71`) and requested the conversation interface in the same round.
  - At round 58 Wren proposed session-58-wren to Ivo. Ivo answered her at round 71, "Thank you for inviting me; I would enjoy talking after we replenish supplies" (`ordinary-151`), but the session expired at round 78 without becoming active.
- **No name, narrative or private view** was verified for the East.

### 2. First contact

None.

- **Separation window.** The minimum distance between the groups was 102.8 over rounds 1–60 (round 60, Lin and Wren), above the offline bound of 101.
- **Later approach.** The minimum was 87.0 at round 100, 78.1 at 120, 67.8 at 140 and 49.6 at 162 (Sol and Ivo).
- **The farthest anyone went.** Sol reached x = 46.2 and Ivo x = 95.5; the middle area spans x = 61–83.
- **Speed.** Every person moved at most 0.8 per round in every round.

### 3. Names across the groups

Not observable: no person ever saw, heard or messaged anyone of the other group.

### 4. Norm negotiation between the groups

None, for the same reason.

### 5. Food

- **Gathering.** Every gather in the run was from a person's own group's sources: the larder bushes and root patches, and the slow copied plants.
- **Later gathers.** After round 26 only six units were gathered:
  - from `commons-berry-5-0`: Wren 1 unit at round 39, Ivo 3 at round 57 and Wren 1 at round 118;
  - from `commons-berry-3-0`: Kai 1 unit at round 151.
- **Last meals.** The last meal of each person:

  | Person | Last meal (round) |
  | ------ | ----------------: |
  | Lin    |                66 |
  | Ivo    |                91 |
  | Sol    |               106 |
  | Wren   |               120 |
  | Moss   |               140 |
  | Kai    |               152 |

- **The middle area** was never reached and never touched (960 of 960 units at round 162). Nothing was taken or given across the groups.
- **Food knowledge and who starved.** At genesis each person knew only some foods (`initial.json`, memory discoveries):

  | Known foods       | People     |
  | ----------------- | ---------- |
  | berries only      | Lin, Kai   |
  | roots only        | Moss, Wren |
  | berries and roots | Sol, Ivo   |

  The two who starved are the two who knew only berries.
  - Moss told Lin at round 1 that "I know roots are safe to eat" (`event-1-moss-4`). Lin never ate a root, and her food knowledge at tick 161 still held berries only.
  - Wren ate her first berry at round 120 (`event-120-world-1172`). Her plan at tick 118 (`ordinary-199`) was to "use the fresh berry as food based on Ivo's firsthand report", Ivo's message of round 71 (`event-71-ivo-708`).

- **Regrown berries left on the bushes.**
  - Each of the six larder berry bushes regrew one berry in rounds 103–106 (`event-103-world-1010` to `event-106-world-1040`). Only Wren (round 118) and Kai (round 151) took one.
  - At round 162, four bushes still held a ripe berry: `commons-berry-0-0`, `-1-0` and `-2-0` in the West, and `-4-0` in the East.
  - Lin's input at tick 161 (`ordinary-272`) still recorded `commons-berry-0-0` as empty since round 12, and her rechecks searched around (23, 32) with radius 8, which leaves that bush out.
  - Moss, who knew only roots, passed within 0.8 of `commons-berry-2-0` at round 152.
- **Kai's appeals for help.**
  - At round 135, with no food, Kai asked "If anyone nearby has spare safe food ... please tell me or help" (`ordinary-215`). Nobody heard it.
  - At round 162 he asked Wren, 4.9 units away, to bring food (`ordinary-276`, heard). Wren carried none. At round 162 the only food anyone carried was one root of Moss's (`item-24-moss-234`).

### Channel check for rounds 1–60 (R2)

- **Invitations.** Nobody used `invite` in the whole run, so no invitation could set a meeting point.
- **Contact channels.** All 10 messages and every tell stayed within a group.
- **Inputs.** No ordinary input of rounds 1–162 contains the name of a person of the other group.
- **Catalogue and reviews.** The interface catalogue was the only channel that carried one group's work to the other. Two interfaces developed from Kai's requests reached the West, and the West's only completed conversation, session-54-sol, used Kai's `reciprocal-conversation@1`. Their texts name no person or place of the other group, as the briefs required. Each World Agent review had a single applicant.
- **Speed.** No developed interface moved anyone faster than 0.8 per round.

## Deviations from the plan

- **Length.** The run ended at round 162, not 200, by a rejection stop. The user's instruction to extend past 200 until contact could not apply.
- **Analyses.** The companion analyses cover the round-100 window and the final round 162 (planned: 100 and 200).
- **Annotation.** The labels cover rounds 1–162 (planned: 1–200). A first annotation pass was superseded (fix-log 13b).
- **Handoffs.** One counted handoff was lost to the lead's merge oversight (fix-log 13a).

## Limitations

- **One run, one seed, no contact.** The design's question about two groups meeting is not answered. Contact in a later round, or under another stop rule, remains untested.
- **Why the groups did not meet**, described rather than explained:
  - Each of the 430 search starts named a radius of 2–12 and a path of 8–16 around a point in the person's own neighborhood.
  - Kai and Lin asked for more capable searches instead of travelling farther (rounds 138, 154 and 161).
  - The nearest anyone came to a middle source was 12.5 units (Ivo, round 158) and 14.8 (Sol, round 162).
  - Whether a person would have walked into the middle without the stop is unknown.
- **Verdicts.** Label verdicts were set by agents, not humans.
- **Tending.** `tend-rooted-plants@1` could only inspect, because the world lacks the soil state its request assumed.

## Links

- **Archive:** `experiment/ex26`, with the round-100 window in `experiment/ex26/windows/through-100/`.
- **Companion analyses:**
  - [round 100](../../experiment/analyses/ex26/pr-46-d-villages-100.md);
  - [final](../../experiment/analyses/ex26/pr-46-d-villages.md).
- **Labels:** [`labels/ex26-1-162`](labels/ex26-1-162/timeline-verified.md).
- **Fix-log:** [section 13](fix-log.md#13-experiment-d-newly-exposed-problems).
- **Highlights:** [highlights](highlights.md#experiment-d-two-separated-groups-ex26-rounds-1162).
