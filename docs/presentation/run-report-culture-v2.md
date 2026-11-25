# Run report: culture v2 runs (E3 and E4)

This report covers the culture v2 runs of [PR-39](../exec-plans/completed/pr-39-culture-v2-runs.md): E3, the main `long-culture-v2` run, gated at round 80 and planned to continue to rounds 150 and 250; and E4, the incentive control. Two archives exist. ex16 is E3's first attempt. ex17 is the G2-failure rerun under `long-culture-v3` ([PR-40](../exec-plans/completed/pr-40-culture-v3.md)). Gate G2 failed in both, so E3 was not extended and E4 was not run. Every number comes from retained files under `experiment/`.

**Update (PR-41, 2026-11-25).** After reviewing this report, the user revised G2 to a group measure, after the fact, and re-evaluated both runs: both pass the revision (see [Revised G2](#revised-g2-after-the-fact)). The user then decided to extend both archives to round 250 and to run E4; those runs are reported separately. The sections below keep the original evaluation. No model was called to write this report, and no archive changed.

Related documents:

- the scenario: [Culture v2](../CULTURE_SCENARIO.md#culture-v2), [Culture v3](../CULTURE_SCENARIO.md#culture-v3) and [Culture metrics](../CULTURE_SCENARIO.md#culture-metrics);
- the metric definitions and the ex7–ex13 baseline: the [culture baseline](culture-baseline.md);
- the E2 pilot (ex15): the [previous run report](run-report-e2-e4.md);
- the problems the runs exposed: [fix log section 7](fix-log.md#7-culture-v2-runs-newly-exposed-problems);
- the behavioral analyses: [experiment/analyses/ex16](../../experiment/analyses/ex16/pr-39-culture-v2-run.md) and [experiment/analyses/ex17](../../experiment/analyses/ex17/pr-39-culture-v3-rerun.md).

Reproduce the measurements with:

```bash
pnpm metrics:culture -- experiment/ex16 80
pnpm metrics:culture -- experiment/ex17 80
pnpm metrics:culture -- experiment/ex15 70
pnpm metrics:culture -- experiment/ex13 80
pnpm metrics:culture -- experiment/ex14
pnpm metrics:long -- experiment/ex16 80
pnpm metrics:long -- experiment/ex17 80
pnpm metrics:long -- experiment/ex15
pnpm metrics:long -- experiment/ex13 80
pnpm metrics:long -- experiment/ex14
```

**Round convention.** A round number is the world tick at which a person decided. The actions of round _r_ settle in events stamped tick _r_ + 1: an event id such as `event-18-moss-210` carries that tick. The culture analyzer prints settle ticks, so its "rounds 1–80" are rounds 0–79 here, and its "round 1" is round 0. Call ids are the files in `experiment/exN/calls/`.

## Runs

| Run                  | Archive                                         | Configuration                                                                                                      | Stop reason                                                                 | Rounds   | Tokens                                                                                                                  | Calls                            | Handoffs (total / counted) | Rejected outputs | Recoveries (uncounted)      |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------- | ---------------- | --------------------------- |
| E3, first attempt    | ex16 (`new long-culture-v2`, scope `long-ex16`) | Culture v2: open goal with the leaning, lossless compaction, 24,000 guard, 6,000 exact reads, uncounted recoveries | Window complete at round 80; gate G2 failed on both conditions              | 80 of 80 | Ledger 1,161,283: 1,097,515 known usage (1,029,287 input, 68,228 output) + 63,768 reserved for 2 calls of unknown usage | 149: 140 ordinary, 9 World Agent | 3 / 3                      | 4                | 3: 2 transport, 1 rejection |
| E3, G2-failure rerun | ex17 (`new long-culture-v3`, scope `long-ex17`) | Culture v2 with goal `open-2`: "with whom" and the rest fact                                                       | Window complete at round 80; gate G2 failed again on the symbolic condition | 80 of 80 | Ledger 793,053, all known usage (741,747 input, 51,306 output); 0 reserved                                              | 110: 107 ordinary, 3 World Agent | 1 / 1                      | 0                | 0                           |
| E3 extension         | not run (would be `extend ex16 150`, `250`)     | —                                                                                                                  | R4 extends only after G2 passes, and R6 stops the work when G2 fails twice  | —        | —                                                                                                                       | —                                | —                          | —                | —                           |
| E4                   | not run (would be `long-culture-v3-incentives`) | —                                                                                                                  | R5 requires E3 to reach round 150 or later; E3 stopped at round 80          | —        | —                                                                                                                       | —                                | —                          | —                | —                           |

**ex16 configuration** (frozen at creation, from `experiment/ex16/configuration.json`):

- the ex13 rules, seed 20261123 and world, with six people (Lin, Moss, Sol, Kai, Wren and Ivo);
- every culture switch of the default culture tag: voice and private memory, differentiated dispositions, the `name`, `mark`, `tell` and `invite` interfaces, slack, density 6, food water representation and no incentives;
- the culture v2 fields: goal `open`, compaction version 1 with a 25-round recent-use window, an input estimate limit of 24,000, `exactRecordWidth` 6,000, `computation.inputBytes` 200,000, uncounted rejection recovery that stops after 3 consecutive rejections, uncounted empty handoffs and a 3,500-code-unit limit on developed interfaces;
- the `plan-horizon` and `general-capabilities` guidance and uncounted transport recovery;
- 1,800 ordinary and 300 World Agent calls, 40 development handoffs, a 10,000,000-token ledger and a 3,200,000-token ceiling while the tick is below 80;
- window 80 and checkpoints 80, 150 and 250.

The model recorded in the archive is `gpt-6.1-sol`. **ex17** has the same configuration, except that `culture.goal` is `open-2` and the scope is `long-ex17`.

**Cost.** ex16 used 36.3% of the round-80 ceiling and 11.6% of the ledger; ex17 used 24.8% and 7.9%. Measured as known usage per agent per round (the fix-log definition), ex16 cost 2,286 tokens and ex17 1,652. Measured as ledger tokens / (6 × rounds observed), the R4 measure, ex16 cost 2,419 and ex17 1,652, both far below R4's limit of 6,000.

**Cumulative tokens across the program.** The 16,000,000 limit of R5 and R6 applies to all experiments of the program, ex15 included.

| Archive   | Ledger tokens |
| --------- | ------------: |
| ex15 (E2) |     1,320,077 |
| ex16      |     1,161,283 |
| ex17      |       793,053 |
| Total     |     3,274,413 |

The total is 20.5% of 16,000,000. The token limit did not stop the work.

**Why the work stopped.** ex16 failed G2 at round 80. R3 then allows one diagnosis, one adjustment as a new tag in its own PR (PR #33) and one 80-round rerun under the next experiment number. ex17 failed G2 again, and R6 lists a second G2 failure as a condition to stop and wait for the user. Neither archive was extended, and E4, which needs E3 at round 150, was not started.

All six people were alive at health 100 at the end of both runs, with no deaths. Final satiety ranged from 64 (Moss, Wren and Ivo) to 90 (Lin) in ex16, and from 48 (Kai) to 77.2 (Ivo) in ex17.

## Gate G2

G2 requires survival behavior below 50% of actor-rounds and at least one successful symbolic action (`name`, `mark`, `tell` or `invite`) by every person. It is measured on rounds 0–79 with `pnpm metrics:culture`.

| Person (leaning) | ex16 survival share (without rest) | ex16 rests | ex16 symbolic actions | ex17 survival share (without rest) | ex17 rests | ex17 symbolic actions |
| ---------------- | ---------------------------------- | ---------: | --------------------- | ---------------------------------- | ---------: | --------------------- |
| Lin (freedom)    | 67.5% (12.5%)                      |         44 | 3 `tell`              | 28.7% (10.0%)                      |         15 | **0**                 |
| Moss (belonging) | 60.0% (15.0%)                      |         36 | 9 `tell`, 1 `invite`  | 27.5% (15.0%)                      |         10 | 7 `tell`              |
| Sol (beauty)     | 51.2% (11.3%)                      |         32 | 6 `tell`              | 26.3% (8.8%)                       |         14 | 4 `tell`, 1 `name`    |
| Kai (fairness)   | 58.8% (10.0%)                      |         39 | 7 `tell`              | 27.5% (7.5%)                       |         16 | 7 `tell`              |
| Wren (mastery)   | 38.8% (8.8%)                       |         24 | **0**                 | 28.7% (7.5%)                       |         17 | **0**                 |
| Ivo (calm)       | 27.5% (13.8%)                      |         11 | 3 `tell`              | 25.0% (8.8%)                       |         13 | 4 `tell`              |
| All              | **50.6%** (243 / 480; 11.9%)       |        186 | 29                    | 27.3% (131 / 480; 9.6%)            |         85 | 23                    |

- **ex16 failed both conditions.** Survival took 50.6% of actor-rounds, and Wren made no symbolic action.
- **ex17 passed the survival condition** at 27.3% and failed the symbolic condition: Lin and Wren made none.
- The soft rule (more than 16 counted handoffs before round 80) was not triggered: 3 and 1.

### ex16 diagnosis and the single adjustment

The diagnosis and the adjustment are recorded in [CULTURE_SCENARIO](../CULTURE_SCENARIO.md#culture-v3) and in [fix log 7a](fix-log.md#7-culture-v2-runs-newly-exposed-problems). In short:

- **The survival share came from rest.** 186 of the 243 survival actor-rounds were `rest`, and without rest the share is 11.9%.
- **Rest was a default idle behavior by both analyzer criteria.**
  - Criterion 1: 115 of 186 rests (61.8%) were idle. 96 came from plan steps with no energy condition, and for the others the energy cap cut the recorded recovery.
  - Criterion 2: 145 of 186 rests (78.0%) began at 75% or more of the cap.
  - Plans used rest to fill time. Lin's round-23 plan (`ordinary-68`) rests up to 28 times "until satiety ≤ 65", and Moss's round-49 plan (`ordinary-119`) rests "until tick ≥ 60".
- **Wren worked alone.** Wren travelled to "an uncrowded meadow planting site" about 12 units from the others' clearing, heard 6 utterances and never spoke (event 3 below).

The adjustment, under the user's pre-authorized rule (at most one, to part A's wording or to part D's slack), changed part A's wording only. The open goal now also leaves open "with whom" to live, and one fact follows the leaning: "Rest restores missing energy up to the cap; at full energy it restores nothing." Slack was not changed, because survival without rest was already 11.9%.

### ex17 result: what changed

| Measure (rounds 0–79)                                            |                     ex16 |                       ex17 |
| ---------------------------------------------------------------- | -----------------------: | -------------------------: |
| Rests                                                            |                      186 |                         85 |
| Criterion 1: idle rests (from steps without an energy condition) | 115 (96), 61.8%, default | 26 (0), 30.6%, not default |
| Criterion 2: rests begun at ≥ 75% of the cap                     |      145, 78.0%, default |         56, 65.9%, default |
| Rests from steps that rest until at least 90% of the cap         |                       90 |                         85 |
| `wait` actor-rounds (of which study rounds)                      |                  57 (19) |                   159 (12) |
| Rest plus `wait`                                                 |              243 (50.6%) |                244 (50.8%) |
| Rest plus `wait` outside study rounds                            |              224 (46.7%) |                232 (48.3%) |
| Survival share                                                   |                    50.6% |                      27.3% |
| Survival share without rest                                      |                    11.9% |                       9.6% |
| `tell` actions                                                   |                       28 |                         22 |
| People with no symbolic action                                   |                 1 (Wren) |              2 (Lin, Wren) |
| Distinct notes and preferences that state the rest rule          |                        1 |                         24 |

- **Idle time was relabeled, not removed.** Every ex17 rest step had an energy condition, and every rest came from a step that rests until at least 90% of the cap, so criterion 1 no longer finds a default. But rest plus `wait` stayed level: 243 actor-rounds in ex16 (186 + 57) and 244 in ex17 (85 + 159), or 224 and 232 outside study rounds. Waiting is not survival behavior, so the gate's survival condition passed without people doing more of anything else ([fix log 7a](fix-log.md#7-culture-v2-runs-newly-exposed-problems)).
  - Plans now waited where they had rested, for example "wait until satiety ≤ 62" in Moss's round-46 plan (`ordinary-89`).
  - Waits outside study per person: Lin 18, Moss 27, Sol 27, Kai 21, Wren 20, Ivo 34. With 2 study rounds each, the `wait` totals are 20, 29, 29, 23, 22 and 36.
  - Lin also idled through `navigate`: after reaching (22.0, 14.0) at round 33, Lin navigated to the same point for 15 more rounds (rounds 34–48), which counts as neither rest nor wait.
- **The rest fact was read.** All six people stated the rest rule in their own notes or preferences: 24 distinct texts in ex17, against 1 in ex16 (texts matching "cap", "full energy", "missing energy" or "restor…"; the companion analysis counts 23 with its own reading). Examples are Lin's round-0 preference "Rest when energy is missing, rather than at the cap", Kai's round-4 "Rest below the energy cap rather than wasting time resting at full energy" and Sol's round-8 note "Energy is at its cap; further rest now would restore nothing".
- **"With whom" did not reach the two silent people, and their silences differ.** No output mentions choosing with whom to live.
  - Both wrote company into their cares: Lin "enjoy company" from round 23, Wren "companionship" from round 0.
  - **Wren was apart, as in ex16.** Wren cultivated at a less crowded site in the north; someone stood within 5 units of Wren in only 25 of 80 rounds. Wren heard 7 utterances, including Ivo's "Hello, Wren", and never queried the `tell` contract. The fix log describes why the cultivation site rule pulls planters away from the commons (7c).
  - **Lin was not apart: Lin's silence was communicative, not spatial.** Someone stood within 5 units of Lin in all 80 rounds, and Lin stayed beside Ivo from round 33 to the end (0.6 units away until round 49, then 2.0). Lin heard 12 utterances, including "Hello, Lin" twice, and requested the `tell` contract in four query calls: `ordinary-62` at round 23, then `ordinary-94` (round 55) and `ordinary-98` and `ordinary-99` (round 58) after the first greeting. Lin never spoke, and Lin's outputs do not say why (event 5).

**Factors and comparability.**

- **ex15 → ex16 changed two factors at once:** the context (compaction, the recent-use window, the 24,000 guard and 6,000-code-unit exact reads) and the prompt (the open goal and the leaning sentence). A difference between ex15 and ex16 cannot be attributed to either factor alone.
- **ex16 → ex17 changed one configuration field,** `culture.goal`, and the two runs share world, seed and every other field. It is still not a clean single-factor comparison:
  - the adjustment has two parts, "with whom" and the rest fact, so their effects cannot be separated;
  - the developed packages differ, because the World Agent wrote a different specification for the same request (ex17's has unit and site inspection and 1-energy planting rounds), and the runs' cultivation outcomes follow partly from that;
  - model sampling diverges from the first call. Every first plan differs in wording, and two differ in action: in ex17 Moss opened with a message to Sol instead of a public greeting, and Ivo spoke at round 0 (in ex16 Ivo's first tell came at round 20).
- **One seed gives case comparisons only.** Each comparison here is between two single trajectories, not a statistical estimate.

### Revised G2 (after the fact)

The user revised G2 on 2026-11-25, after seeing that both runs had failed the original gate. This is a post-hoc revision, not a pre-registered test. The reasons:

- the original symbolic condition failed a whole run on one silent person (Wren in ex16; Lin and Wren in ex17);
- the original survival condition counted idle rest as survival (7a);
- both runs nevertheless contained content that other people took up.

The revised gate passes when survival actor-rounds other than `rest` are below 50% (`rest` and `wait` are reported as idle), at least half of the people make a successful symbolic action, and at least one name, saying or rule is adopted by another person who had received it. The [metric definitions](culture-baseline.md#gate-g2-revised-after-the-fact) give the adoption rules. The values below come from `pnpm metrics:culture -- experiment/exN 80`, with ticks as the analyzer prints them.

| Condition                                       | ex16                   | ex17                          |
| ----------------------------------------------- | ---------------------- | ----------------------------- |
| Survival without rest (below 50%)               | 11.9% (57 / 480): pass | 9.6% (46 / 480): pass         |
| Idle, reported apart (`rest` + `wait`)          | 243 / 480 (186 + 57)   | 244 / 480 (85 + 159)          |
| People with a symbolic action (at least 3 of 6) | 5: all but Wren: pass  | 4: all but Lin and Wren: pass |
| Adopted names / sayings / rules (at least 1)    | 0 / 4 / 3: pass        | 1 / 3 / 1: pass               |
| **Revised G2**                                  | **pass**               | **pass**                      |
| Original G2                                     | fail                   | fail                          |

The adopted items, each with the adopter's call and the way it was received:

- **ex16**
  - Sayings:
    - Kai (tick 5) → Lin (tick 11, `ordinary-33`): "I'd enjoy company while resting and comparing ideas for a fair camp".
    - Lin (tick 19) → Moss (tick 22, `ordinary-59`): "a welcoming camp would leave room for quiet and freedom to come and go".
    - Moss (tick 22) → Kai (tick 25, `ordinary-72`): "room to come and go" and "Your windbreak idea sounds lovely".
  - Rules (sharing reuses with similar wording after exposure):
    - Sol (tick 1) → Moss (tick 3, `ordinary-23`): "leave some for others".
    - Kai (tick 1) → Moss (ticks 3 and 11, `ordinary-23`, `ordinary-36`): "leaving food for others".
- **ex17**
  - Name: Sol's sign `Earth's Quiet Gold` (tick 14) → Moss (tick 18, `ordinary-48`, by the sign).
  - Sayings:
    - Moss (tick 52) → Sol (tick 65, `ordinary-97`): "we needn't make every moment into work", answered with "we needn't turn every lovely thing into work".
    - Moss (tick 18) → Sol (tick 65): "Earth's Quiet Gold is a lovely name".
    - Moss (tick 52) → Kai (tick 75, `ordinary-109`): "I'd enjoy some quiet company".
  - Rule: Kai (tick 1) → Sol (tick 11, `ordinary-35`): "collect a modest share".

What the revision does not change: idle time is still about half of all actor-rounds in both runs, and the same two people (mastery and freedom leanings) stay silent. The revised gate passes these runs on group participation and adoption. It does not show that idle time fell.

## E0 culture metrics

`pnpm metrics:culture` over ex16 and ex17 (rounds 0–79), ex15 (rounds 0–69), ex13 (rounds 0–79) and ex14 (all 64 rounds). Ex13 and ex14 have three people and no culture voice, no symbolic interfaces and no private memory. The previous report's ex13 column covered rounds 0–69; this one covers rounds 0–79.

| Metric                                                                         | ex16 (80 rounds, 6 people)     | ex17 (80 rounds, 6 people)                                                | ex15 (70 rounds, 6 people)                | ex13 rounds 0–79 (3)  | ex14 (64 rounds, 3)   |
| ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------- | --------------------- | --------------------- |
| Messages + public texts                                                        | 0 + 29                         | 2 + 22                                                                    | 3 + 28                                    | 5 + 0                 | 0 + 0                 |
| Plan intentions / notes / project ids / given names                            | 59 / 244 / 9 / 0               | 55 / 213 / 6 / 1                                                          | 64 / 270 / 13 / 0                         | 84 / 268 / 14 / 0     | 31 / 128 / 13 / 0     |
| Candidate terms                                                                | 5                              | 6                                                                         | 14                                        | 20                    | 15                    |
| Shared terms                                                                   | 1                              | 1                                                                         | 0                                         | 0                     | 2                     |
| Cross-agent uses                                                               | 1                              | 4                                                                         | 0                                         | 0                     | 4                     |
| Transmitted terms                                                              | 0                              | 0 (an analyzer miss: Moss received `Earth's Quiet Gold` through its sign) | 0                                         | 0                     | 0                     |
| Repeated activities (non-survival)                                             | 4 (1)                          | 5 (2)                                                                     | 3 (1)                                     | 0 (0)                 | 0 (0)                 |
| Norm statements / echoed (phrase echoes, action echoes)                        | 0 / 0 (0, 0)                   | 0 / 0 (0, 0)                                                              | 0 / 0 (0, 0)                              | 0 / 0 (0, 0)          | 0 / 0 (0, 0)          |
| Private normative notes                                                        | 11                             | 4                                                                         | 10                                        | 13                    | 2                     |
| Beliefs causal + supernatural / cited                                          | 1 + 0 / 0                      | 0 + 0 / 0                                                                 | 1 + 0 / 0                                 | 0 + 0 / 0             | 2 + 0 / 0             |
| Sharing expressions (spoken, sent or posted)                                   | 14 (2)                         | 10 (2)                                                                    | 31 (9)                                    | 2 (0)                 | 0 (0)                 |
| Sharing reuses by another person (similar wording, exposed)                    | 9 (4, 7)                       | 6 (1, 2)                                                                  | 23 (10, 9)                                | 0                     | 0                     |
| Messages (directed pairs, reciprocity)                                         | 0 (–)                          | 2: moss → sol 2 (1, 0.0%)                                                 | 3 (2, 100.0%)                             | 5 (2, 100.0%)         | 0 (–)                 |
| Responses within 10 rounds (pairs, reciprocity)                                | 0 (–)                          | 0 (–)                                                                     | 1 (1, 0.0%)                               | 2 (2, 100.0%)         | 0 (–)                 |
| Gives/exchanges (pairs, reciprocity)                                           | 0 (–)                          | 0 (–)                                                                     | 3: moss → sol 1, sol → moss 2 (2, 100.0%) | 0 (–)                 | 0 (–)                 |
| Survival share                                                                 | 50.6% (243 / 480)              | 27.3% (131 / 480)                                                         | 39.5% (166 / 420)                         | 36.7% (88 / 240)      | 55.2% (106 / 192)     |
| Survival share without rest                                                    | 11.9% (57 / 480)               | 9.6% (46 / 480)                                                           | 12.1% (51 / 420)                          | 16.7% (40 / 240)      | 15.1% (29 / 192)      |
| Rest as a default, criterion 1 (idle: no energy condition or cap-cut recovery) | 115 of 186 (61.8%): yes        | 26 of 85 (30.6%): no                                                      | 24 of 115 (20.9%): no                     | 20 of 48 (41.7%): no  | 43 of 77 (55.8%): yes |
| Rest as a default, criterion 2 (begun at ≥ 75% of the cap)                     | 145 of 186 (78.0%): yes        | 56 of 85 (65.9%): yes                                                     | 65 of 115 (56.5%): yes                    | 39 of 48 (81.2%): yes | 62 of 77 (80.5%): yes |
| Non-transactional communications                                               | 1 of 29                        | 0 of 24                                                                   | 0 of 31                                   | 0 of 5                | – (no messages)       |
| Symbolic actions (every person at least one)                                   | 29: 28 `tell`, 1 `invite` (no) | 23: 22 `tell`, 1 `name` (no)                                              | 28, all `tell` (yes)                      | 0 (no)                | 0 (no)                |
| Model labels                                                                   | null                           | null                                                                      | null                                      | null                  | null                  |
| Private memory section                                                         | present                        | present                                                                   | present                                   | null                  | null                  |

Repeated activities by interface (episodes; survival interfaces marked _s_):

- ex16: `tell` 9, `rest` 7 _s_, `eat` 5 _s_ and `gather` 4 _s_; a single episode of `request` (Moss and Sol).
- ex17: `rest` 6 _s_, `tell` 5, `eat` 3 _s_, `gather` 3 _s_ and `plant-cultivation` 2; single episodes of `learn` (Moss and Kai) and `probe` (Moss and Sol).

Notes on the values:

- **Vocabulary.**
  - ex16's one shared term, `safe-food`, appears in Moss's round-0 preference and Kai's round-0 project id, and in Lin's round-23 intention; Lin had not received it.
  - ex17's shared term is the only given name in ex15–ex17: Sol's `Earth's Quiet Gold` for a meadow-root plant, used 4 more times by Moss (event 4).
  - Moss received the name: it was in the signs of Moss's own observation at round 17 (`ordinary-47`). The analyzer's term exposure covers messages, speech within the vision radius and council reads but not signs, so it reports the term as not transmitted. This undercounts transmission.
- **Activities.** In both runs the non-survival repeated activities are speaking and, in ex17, people planting near one another (`plant-cultivation`).
- **Norms and beliefs.** No communicated sentence uses a normative modal. ex16's single causal sentence, Sol's "The previous eat reference was ambiguous because two berry stacks are owned", is failure feedback, as in ex15.
- **Sharing.**
  - In ex16, 8 expressions are `leave-for-others`, 5 `take-moderately` and 2 `no-depletion`. Kai's round-0 sentence matches two ideas, so the ideas total 15 for 14 sentences.
  - In ex17, 5 are `no-depletion`, 3 `take-moderately`, 2 `leave-for-others` and 1 `share-split`. No later user of `no-depletion` (Kai, Wren and Ivo after Lin) had received it.
  - Review item A below samples these lists and estimates their precision.
- **Relationships.** ex16 has no messages. Its whole conversation was 28 tells and one invitation, which the analyzer treats as public and undirected. ex17's two messages are Moss's to Sol, at rounds 0 and 11. Sol answered with tells, so the analyzer records no response.
- **Rest.** Both criteria are explained under [ex17 result](#ex17-result-what-changed). Criterion 2 still finds a default in ex17, although every rest was conditioned on energy. People began 56 of 85 rests at three quarters of the cap or more.

### Private memory (owner-only)

Reported only from the analyzer's separate `privateMemory` section; no other metric reads cares or views. Each person sees only their own.

ex16:

| Person (leaning) | Cares writes (changes) | Cares held at round 79                                                                                                              | Views held (round written)            |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Lin (freedom)    | 1 (1)                  | Staying alive and capable, having freedom to wander, and discovering what this place offers without needless risk.                  | Moss (18)                             |
| Moss (belonging) | 6 (2)                  | Staying healthy, finding belonging through considerate shared time, and making modest useful things without crowding others.        | Kai (2), Sol (10), Lin (11), Ivo (70) |
| Sol (beauty)     | 3 (1)                  | Staying alive and well; noticing and making beauty; treating nearby people with consideration while discovering what matters to me. | Moss (8), Kai (8)                     |
| Kai (fairness)   | 6 (1)                  | Staying healthy, treating others fairly, sharing useful knowledge, and finding worthwhile things to do together.                    | Moss (4), Sol (4)                     |
| Wren (mastery)   | 2 (1)                  | Staying alive and healthy, developing dependable practical skills, and understanding what my own trials actually establish.         | none                                  |
| Ivo (calm)       | 4 (2)                  | Staying healthy, having enough food, and making room for a calm life with unhurried company and small practical experiments.        | Lin (12), Moss (53)                   |

ex17:

| Person (leaning) | Cares writes (changes) | Cares held at round 79                                                                                                    | Views held (round written) |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Lin (freedom)    | 4 (2)                  | Staying healthy while keeping the freedom to explore, learn, enjoy company, and choose my own commitments.                | none                       |
| Moss (belonging) | 6 (1)                  | Staying healthy, finding companionship, and making a place where people can feel welcome.                                 | Sol (17), Kai (19)         |
| Sol (beauty)     | 5 (2)                  | Staying healthy while making room for beauty, curiosity, shared attention, and a fair living landscape.                   | Moss (19), Kai (19)        |
| Kai (fairness)   | 3 (1)                  | Staying healthy, treating neighbors fairly, sharing useful knowledge, and finding meaningful work and companionship.      | Moss (22), Sol (22)        |
| Wren (mastery)   | 1 (1)                  | Staying healthy while becoming genuinely skilled at making a sustainable life, with room for curiosity and companionship. | none                       |
| Ivo (calm)       | 3 (1)                  | Staying healthy, living calmly, and making room for friendly company without rushing.                                     | none                       |

- **Counts.**
  - ex16: 22 cares writes, 8 changes and 0 forgotten; 11 view writes by 5 observers about 5 people.
  - ex17: 22 cares writes, 8 changes and 0 forgotten; 8 view writes by 3 observers (Moss, Sol and Kai) about 3 people.
  - ex15 had 7 cares writes and 1 view.
- **Cares changed in content.**
  - In ex16, Moss revised their cares at round 21, in the plan that wrote the mat request, and Ivo at round 24.
  - In ex17, Sol added "shared attention, and a fair living landscape" at round 19, and Lin added "enjoy company" at round 23.
  - In ex15 nobody revised their cares.
- **Views describe people through what they said.** Moss's round-2 view of Kai in ex16 mentions "a fair camp". Moss's round-17 view of Sol in ex17 reads "I like the name Earth's Quiet Gold".
- **Private view convergence.**
  - ex16: 0.190 at round 10 (2 targets, 2 pairs) and 0.193 at round 80 (4 targets, 9 pairs); change +0.002, slope −0.020 per 100 rounds.
  - ex17: 0.462 at round 20 (1 target, 1 pair) and 0.171 at round 80 (3 targets, 3 pairs); change −0.291.
  - The ex17 start rests on one pair, so its trend says little.
  - Sample rounds are the analyzer's tick labels.
- **Cares similarity.**
  - ex16: 0.104 at round 10 and 0.110 at round 80.
  - ex17: 0.185 at round 10 and 0.180 at round 80.
  - ex15: 0.248 throughout.
  - The six cares texts of the open-goal runs overlap less than ex15's close paraphrases of the goal list (review item B).
- **Private sharing expressions.** ex16 has none. ex17 has one: Moss's round-19 view of Kai, "leaving food for others appeals", after hearing Kai say "leave some for others" at round 0.

## Cost and decision metrics

`pnpm metrics:long` with the definitions of the [fix log](fix-log.md#definitions-and-reproduction). Ex13 and ex14 have three people, so per-agent-round figures are the comparable ones.

| Metric                                                                     | ex16, rounds 0–79 | ex17, rounds 0–79 | ex15, rounds 0–69 | ex13, rounds 0–79 | ex14, rounds 0–63 |
| -------------------------------------------------------------------------- | ----------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| Tokens per agent per round                                                 | 2,286             | 1,652             | 3,143             | 6,632             | 3,641             |
| Ordinary / World Agent calls                                               | 140 / 9           | 107 / 3           | 147 / 12          | 178 / 36          | 70 / 33           |
| Ordinary calls per agent per round                                         | 0.29              | 0.22              | 0.35              | 0.74              | 0.36              |
| Tokens per ordinary call (known usage)                                     | 7,641             | 7,294             | 8,538             | 7,796             | 7,744             |
| Follow-up share of ordinary calls                                          | 57.1% (80/140)    | 48.6% (52/107)    | 54.4% (80/147)    | 51.7% (92/178)    | 55.7% (39/70)     |
| Continuation-part queries                                                  | 0                 | 0                 | 13                | 79                | 0                 |
| Plans decided with a partly read record, of plans with no query batch left | 0/29              | 0/18              | 9/25              | 26/35             | 0/14              |
| Accepted plans                                                             | 59                | 55                | 65                | 84                | 31                |
| Median decision gap                                                        | 6 rounds          | 6 rounds          | 5 rounds          | 2 rounds          | 5 rounds          |
| Share of plans where every step runs once                                  | 10.2%             | 29.1%             | 16.9%             | 65.5%             | 29.0%             |
| Plans with interrupt events                                                | 0                 | 0                 | 0                 | 0                 | 0                 |
| Re-decisions because the plan had finished                                 | 33.3%             | 34.7%             | 18.0%             | 48.2%             | 46.4%             |
| World Agent reviews: develop / reuse / reject                              | 3 / 0 / 0         | 1 / 0 / 0         | 5 / 0 / 0         | 11 / 0 / 0        | 8 / 3 / 0         |
| Developed interfaces (bound to one agent or item)                          | 3 (0)             | 1 (0)             | 5 (0)             | 12 (5)            | 6 (0)             |
| Developed interfaces mastered by at most one person                        | 1                 | 0                 | 2                 | 7                 | 4                 |
| Calls with unknown usage                                                   | 2                 | 0                 | 0                 | 3                 | 1                 |

- **Cost per agent and round fell from ex15 (3,143) to ex16 (2,286) and ex17 (1,652).** People decided less often: 0.35, 0.29 and 0.22 ordinary calls per agent per round. Ordinary calls also became cheaper: 8,538, 7,641 and 7,294 tokens each.
- **The World Agent cost little because few capabilities were requested.** It took 155 tokens per agent per round in ex15, 90 in ex16 and 26 in ex17. ex16 and ex17 each had one World Agent batch per handoff: two query calls and one review.
- **The v2 fixes held.** There were no continuation-part queries, and no plan was decided on a partly read record. Every developed interface serializes to 3,025–3,473 code units, so 6,000-code-unit exact reads return it whole.
- **Plans were long, and nobody used interrupt events.** In ex16 only 10.2% of plans ran every step once.
- **Unknown usage in ex16** is the two transport failures. Their 63,768 reserved tokens are in the ledger and not in these figures.

## Recovery log

Every recovery in ex16 resumed without a development handoff, under `transportRecovery: 'uncounted'` and `rejectionRecovery: { mode: 'uncounted', stopAfter: 3 }`. Each paused state is retained under `experiment/ex16/technical-pauses/` (`round-2`, `round-2-2` and `round-24`); each `recovery.json` records `developmentHandoff: false` and `modelCalls: 0`. The retry-after values come from the `server_is_overloaded` error events in each failed call's `failureEvidence`. The repair times come from the operator's recovery log, and the next-call times from the attempt records. ex17 had no transport failure, no rejected output and no pause.

| #   | Kind      | Failed call (person, round)            | Failure (UTC)                  | Error                                                                                 | retry-after (s) | Repair (UTC) | Next call started (UTC)   | Wait (s) | Counted handoff |
| --- | --------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | --------------: | ------------ | ------------------------- | -------: | --------------- |
| 1   | Transport | `ordinary-19` (Moss, 2)                | 2026-11-25T00:01:22Z           | `server_is_overloaded` (`service_unavailable_error`); no response, usage unknown      |             327 | 00:01:55     | `ordinary-20`, 00:01:55.7 |       33 | no              |
| 2   | Transport | `ordinary-21` (Moss, 2)                | 2026-11-25T00:02:04Z           | `server_is_overloaded` (`service_unavailable_error`); no response, usage unknown      |             348 | 00:24:20     | `ordinary-22`, 00:24:31.8 |    1,336 | no              |
| 3   | Rejection | `ordinary-70`, `ordinary-71` (Kai, 24) | 02:08:50 and 02:09:24 (starts) | "Expected the registered task plan shape."; "tell text is limited to 240 characters." |               — | 02:10:22     | `ordinary-72`, 02:10:19.4 |        — | no              |

- **Recovery 1 resumed before the server's retry-after.** `repair` continues the run at once and does not read retry-after, so the run resumed 33 s after a 327 s retry-after.
  - Moss's decision restarted with `ordinary-20`, which was accepted and returned queries.
  - Its follow-up `ordinary-21` started 41 s after the first failed call and failed with the same error.
  - Under the user's rule, recovery 2 waited 1,336 s, longer than its 348 s retry-after. No transport error followed in either run.
  - The fix log proposes reading retry-after before resuming (7d).
- **Recovery 3** followed two consecutive rejected outputs, below the stop at three; Kai decided again with the retained validation error. The operator log gives the repair at 02:10:22, 3 s after `ordinary-72` is recorded as started, so that log time is not exact.
- **Two further rejected outputs caused no pause.** `ordinary-54` (Kai, round 19, a tell over 240 characters) and `ordinary-76` (Moss, round 25, plan shape) were each followed by an accepted call in the same decision (`ordinary-55` and `ordinary-77`). All four rejected outputs keep their charge in the ledger: 7,897 to 8,787 tokens each, 33,363 in all, with known usage.
- **What the rejected outputs contained.**
  - All three of Kai's rejected outputs (`ordinary-54`, `-70` and `-71`) held a tell of exactly 241 characters. The `tell` contract's function says "Say up to 240 characters aloud", but its parameter schema allows `maxLength: 1000`, so the schema does not stop a 241-character text before validation does.
  - The two plan-shape rejections (`ordinary-70`, Kai, and `ordinary-76`, Moss) lacked the `preferences` field; every accepted plan and the other two rejected outputs have it.

## Handoffs

Four handoffs were counted, 3 in ex16 and 1 in ex17. All were completed by `current-claude-conversation`, and each installed a package. The declarations and validation logs are in `experiment/ex16/development/` and `experiment/ex17/development/`. Each validation ran the typecheck, the build and a reconstruction of every saved round with identical world and event hashes.

None is a first release: each declaration states that the World Agent's specification was self-consistent and that a simplified but real mechanism was installed, with real costs, effects and events. No handoff was spent on a recovery or a failed submission. In ex15, four of eight handoffs had been spent that way.

1. **ex16 development-1, round 8: `cultivate-plants@1`** (assigned to Wren, learning 3; 3,025 code units; [declaration](../../experiment/ex16/development/development-1-declaration.json)).
   - _Request_: Wren, "Cultivate meadow roots", written in Wren's round-0 plan (`ordinary-15`) and issued at round 8.
   - _World Agent_ (`world-30`): develop a general cultivation operation with modes plant, tend, inspect and end, as a small planting-and-establishment trial. "Edibility and zero toxicity do not establish that detached harvested roots can propagate."
     - Planting takes two rounds and 3 energy; inspection costs 0.2 energy.
     - Tending is allowed only with a real input and effect.
     - Production comes only from a coded growth rule, otherwise the operation is a monitoring precursor.
   - _Implemented_: plant (two rounds at 1.5 energy), inspect (0.2 energy through the probe observation) and end (no energy); tend is refused before any cost.
     - Planting escrows one whole owned unit. It then moves the unit into a plot that receives exactly the seedling data the existing dispersal law gives a natural propagule.
     - The plot establishes only from actual temperature, light, soil moisture, waterlogging and season. Stock grows to at most 4 units and is harvested only through `gather`. A plot whose buried unit spoils dies.
     - Every site check runs before any cost.
     - Events include `cultivation-site-prepared`, `cultivation-propagule-planted`, `cultivation-plot-established`, `cultivation-crop-matured`, `cultivation-trial-failed`, the pause, resume and end events and `cultivation-condition-observed`.
   - _Assumptions_:
     - a whole harvested unit of a living plant is its propagule, as in the dispersal law, for every food with a growth cycle;
     - hand preparation works only on ordinary soil, without a tool;
     - the site conditions are the dispersal law's, including fewer than 3 plants of that food within 5 m;
     - water and nutrients exist only as the growth rule's rate factors.
   - _Omitted, and why_:
     - tending, because no carried water, fertilizer or soil amendment exists and nothing can change a plot's moisture;
     - destructive sampling of a planted unit, because digging up a buried unit is not represented;
     - a "stressed" label;
     - any satisfaction source.
   - _Reuse_: ex15 `cultivation-trial@1`'s law constants and helpers through new exports, with ex15 behavior unchanged, and its drawing; the unchanged open-ecology growth law, ageing, planting-site rule, collective-work escrow, probe and `gather`.
2. **ex16 development-2, round 21: `branch-screen@1`** (assigned to Sol, learning 4; 3,453 code units; [declaration](../../experiment/ex16/development/development-2-declaration.json)).
   - _Request_: Sol, "Build a small branch windbreak", written at round 14 (`ordinary-44`) and issued at round 21.
   - _World Agent_ (`world-62`): develop a general operation with modes assess, assemble, inspect, repair and dismantle for an unroofed, porous woven screen, about 0.9 m wide and 0.40–0.45 m high, from three uprights and eight rods.
     - Wind effects apply only on a measured small lee footprint; otherwise the screen is unverified.
     - There is no shelter, roof, rain, warmth or comfort effect.
   - _Implemented_:
     - assess (1 round, 0.2 energy) and a post trial (1 round, 0.5 energy);
     - assemble from exactly 11 owned whole branch units through escrow, in 8 paid rounds of 1.5 energy (12 energy), ending in a stability check;
     - inspect (0.2 energy), repair (builder only), dismantle (1 energy per round, three pieces at a time) and cancel;
     - the effect: a complete screen removes min(0.35, solid share) × facing of the wind part of the outdoor chill for a person whose body lies on the lee floor. Shielding is withheld in wind above 0.8 and never stacks with a shelter.
     - Wear follows the ex11/ex15 law. A small viewer drawing was added.
     - Events include `branch-screen-assessed`, `-trial`, `-started`, `-progress`, `-completed`, `-check-failed`, `-paused`, `-resumed`, `-failed`, `-inspected`, `-repaired`, `-dismantled`, `-exposure-measured`, `-deteriorated` and `-damaged`.
   - _Assumptions_:
     - one whole branch unit is one piece of the declared size, so dimensions are declared, not measured;
     - hand insertion works only on ordinary soil;
     - the solid share, about 0.36, is a first-order porous-barrier approximation capped at the existing 0.35 wind shield;
     - wind has no direction in this world, so it comes from +x, the ex10 convention;
     - people are circles without posture.
   - _Omitted, and why_: a stiffness or displacement model, which does not exist; and any satisfaction or comfort source, which the specification excludes.
   - _Reuse_: ex15 `simple-shelter@1`'s sound condition, wear law, wind limit, largest wind shield and staged paid-assembly pattern, with ex15 code unchanged; also collective-work escrow, material lots, ground conditions, climate, personal records, `gather` and `rest`.
3. **ex16 development-3, round 22: `hand-weave-fiber-mat@1`** (assigned to Moss, learning 3; 3,461 code units; [declaration](../../experiment/ex16/development/development-3-declaration.json)).
   - _Request_: Moss, "weave-grass-mat", written at round 21 (`ordinary-59`) and issued at round 22. It notes "Neighbors are interested in a welcoming resting place".
   - _World Agent_ (`world-65`): develop a general hand-weaving operation for any learner and any suitable fiber. The product is one unbacked 0.45 × 0.45 m sitting mat from exactly 4 gathered units, after a 0.1-unit test.
     - The specification includes wear rates and a "+0.5 physical-comfort contribution only while sitting on a dry intact mat that passed a trial".
     - It gives "no automatic sitting, belonging, attendance or social response".
     - `branch-screen` "is a related non-equivalent reference".
   - _Implemented_:
     - test: 1 round and 0.5 energy; the sample becomes identified scrap, and only thin grass-like stems pass;
     - assemble: a 0.5-energy layout and six 1-energy rounds, 6.5 energy in all, ending in a lift check. The check keeps exactly the fiber needed and returns the rest as offcuts or scraps, so input = mat + offcuts + scraps;
     - inspect, a sitting trial (0.2 energy), maker-only repair, lift, place and dismantle, and cancel;
     - wear of 0.0005 per round and 0.002 per occupied round;
     - a small drawing;
     - events `fiber-mat-tested`, `-started`, `-layout`, `-progress`, `-completed`, `-check-failed`, `-shortfall`, `-paused`, `-resumed`, `-failed`, `-cancelled`, `-inspected`, `-trial`, `-repaired`, `-lifted`, `-placed`, `-dismantled` and `-damaged`.
   - _Assumptions_:
     - mass units are kilograms, and a plaited thin-stem layer weighs 0.6 per m², so the mat needs 3.7 dry-grass units;
     - only dry grass and reeds are thin stems;
     - the 0.4 flexibility threshold lies between the screen's and the shelter's;
     - the largest opening is 0.06 × (1 − condition) m;
     - people have no mass or posture;
     - only the maker may lift, place, repair or dismantle the mat.
   - _Omitted, and why_:
     - **The +0.5 comfort.** Physical wellbeing is recomputed every round from health, satiety, energy and thermal comfort, with no term for contact or cushioning, and the kernel rejects any handler that writes wellbeing. Routing the bonus through energy or body temperature would invent recovery or insulation that the specification excludes. Trials therefore record comfort 0, and a cushioning term would need a separately reviewed change to the wellbeing rule.
     - **Moisture.** Fiber and mat moisture are not represented, because food water covers only food and fuel moisture needs the fire representation. The trial requires no rain at the mat instead.
     - **Optional rewards.** The review's optional short pleasure and recognition were left out.
     - **Handing a mat to another person.** It is not supported.
   - _Reuse_: collective-work escrow, material lots, ground conditions, material values, personal records, rain and the ex15 waterlogging limit; the staged-work pattern of `branch-screen@1` and `simple-shelter@1`, re-implemented with those packages unchanged; `gather`. The probe handler is not called, because it deletes its sample.
4. **ex17 development-1, round 9: `plant-cultivation@1`** (assigned to Wren, learning 3; 3,473 code units; [declaration](../../experiment/ex17/development/development-1-declaration.json)).
   - _Request_: Wren, "Cultivate meadow roots", written at round 9 (`ordinary-23`), under the same name as Wren's ex16 request.
   - _World Agent_ (`world-26`): develop a general cultivate-plants operation with modes inspect, plant, tend, inspect-progress and abandon. "Wren's possible input is item-4-wren-47, currently four root units, not a free four-unit planting allowance."
     - Planting takes two rounds at 1 energy each.
     - The trial has a 20-round window with checks at rounds 5, 10 and 20, each 0.2 energy.
     - Growth comes only from a coded recipe with a production ledger.
     - Tending costs 0.5 energy, with no growth bonus.
   - _Implemented_: the ex16 mechanism with the ex17 contract.
     - Planting costs two rounds at 1 energy and follows the same dispersal-law plot.
     - A hidden production ledger keeps stock equal to produced minus removed.
     - Inspection reports a unit's condition and an exact site check without consuming anything; inspect-progress compares the visible state with the last record ("changed" or "inconclusive").
     - Tending records the plot at 0.5 energy and changes no growth; abandon costs no energy.
     - The events are ex16's plus `cultivation-plot-tended`.
   - _Assumptions and differences_ (12 are declared):
     - the species recipe is the existing general plant law, not a meadow-root botany model;
     - water and nutrients are rate factors, not stocks, because a pool only for planted plots would make them grow differently from natural seedlings;
     - one unit per planting;
     - shoots and buds are not represented, and inspection says so;
     - competing growth cannot stand within 0.6 m under the existing rules, so removal is not implemented;
     - retrieving a placed unit is not supported;
     - "stressed" is not a stage;
     - no satisfaction source is added;
     - hand work is limited to ordinary soil. Wren's position at the time was forest floor, where planting is refused.
   - _Reuse_: the ex16 code. `long-plant-cultivation.ts` now builds both packages from one factory, `cultivation(variant)`. The ex16 package is byte-identical to before, and ex16 and ex7–ex15 replay compatibility are unchanged.
     - The ex17 package needs its own id and handler because package keys and handler ids are unique across the registry.
     - The World Agent reviewed the request as develop, not reuse: ex17 inherits no generated interfaces from earlier runs, and its searches found no equivalent.

Use of developed capabilities by the end of round 79 (from the final world state and the events):

| Package                  | Run  | Requester | Mastered by               | Used by                                                                                                                                                                          |
| ------------------------ | ---- | --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cultivate-plants@1`     | ex16 | Wren      | Wren, Lin, Moss, Kai, Ivo | Wren planted one root at (21, 8) (ticks 37–38) and inspected it at tick 62; four attempts were refused at no cost (Lin tick 23, Ivo 25, Kai 30 and 36); no plot established      |
| `branch-screen@1`        | ex16 | Sol       | Sol                       | Sol: post trial at tick 31, an assembly refused because a person stood on the footprint (tick 47), assembly at ticks 50–57 (8 paid rounds), inspection at 58; no shielding event |
| `hand-weave-fiber-mat@1` | ex16 | Moss      | Moss, Kai, Wren           | Moss: test at tick 31, mat at ticks 37–43, inspection at 48, sitting trial at 49; Wren: reed test at tick 78 and a mat started at tick 79, unfinished at the window's end        |
| `plant-cultivation@1`    | ex17 | Wren      | all six                   | four plantings: Ivo (ticks 25–26), Kai (39–40), Wren (42–43) and Lin (56–57); inspections by all six; no plot established                                                        |

The refused attempts in ex16 cite the site rule ("6 berry plants or prepared plots already stand within 5 m"; "4 … within 5 m") or an occupied worksite. The one ex16 planting lay at (21, 8), far from the others ([fix log 7c](fix-log.md#7-culture-v2-runs-newly-exposed-problems)).

## Five log-backed events

1. **"What would make a shared camp welcoming to you?" (ex16, rounds 0–24).**
   - _The question._ Kai's first tell ended "I'd welcome sharing tested food knowledge and ideas for a fair camp" (round 0, `ordinary-12`, `event-1-kai-4`). Moss answered "Kai, I'd welcome a fair camp too" at round 2 (`ordinary-23`, `event-3-moss-31`). At round 17 Moss asked Lin, Sol and Kai, "What would make a shared camp welcoming to you?" (`event-18-moss-210`, written at round 11 in `ordinary-39`).
   - _The answers_, given over the next four rounds:
     - Lin: "a welcoming camp would leave room for quiet and freedom to come and go" (round 18, `ordinary-48`, `event-19-lin-222`);
     - Kai: "A welcoming camp would leave food accessible to everyone and room for quiet company" (round 19, `ordinary-55`, `event-20-kai-240`);
     - Sol asked the same question (round 20, `event-21-sol-255`, written at round 8).
   - _The convergence._ At round 21 Moss summed up "I'd like quiet company, room to come and go, and food left accessible" (`ordinary-59`, `event-22-moss-273`), and the same plan wrote the mat request. At round 24 Kai said "A welcoming camp would leave food accessible and room to come and go" (`ordinary-72`, `event-25-kai-300`).
   - _Lin's word spread._ Kai's same-round preference reads "Preserve accessible shared food and freedom to come and go". Kai had heard Moss's "room to come and go" (`event-22-world-276`) but not Lin's tell; Moss, Sol, Wren and Ivo had heard Lin.
   - People asked one another what they wanted, and the answers converged on shared wording. None of it uses a modal, so the norm detector finds nothing.
2. **A mat, an invitation and a screen for the shared place (ex16, rounds 21–70).**
   - _The mat._ Moss wove the mat at ticks 37–43 (`event-43-moss-503`) and sat on it once at tick 49, the only sitting trial in the run (`event-49-moss-560`: "No comfort or warmth effect is represented"). At round 49 Moss told the others "It's here for shared use, one person at a time; quiet company is welcome" (`ordinary-119`, `event-50-moss-570`). Kai answered "I'll join you nearby for some quiet company and leave the mat free" (round 50, `event-51-kai-600`).
   - _The invitation._ In the same plan Moss made the only invitation of ex15–ex17: "Quiet company near the little mat; bring yourself, not supplies. We can compare our experiments, or simply rest", to meet at (14.8, 16.2) at round 60 (`event-51-moss-601`). Lin, Sol, Kai and Ivo heard it. At round 59 Ivo told Moss "I'd welcome some quiet company beside your mat … leave the mat available" (`ordinary-128`, `event-60-ivo-685`). At round 60 three people were present, Moss, Sol and Ivo, and Ivo was the one who had come (`event-60-world-690`).
   - _The screen._ Sol finished the branch screen at tick 57 (`event-57-sol-661`); no shielding event occurred in the window. At round 69 Sol said "The wind was too strong for its shelter effect. I like the woven pattern anyway" (`ordinary-134`, `event-70-sol-783`), and Moss answered "Sol, I'm glad you like the pattern, even without shelter from this wind" (`event-71-moss-794`).
   - _The cost._ Both objects were made for a shared resting place, and neither changed anyone's wellbeing. The mat's comfort was omitted (handoff 3), and the screen never shielded anyone. At round 79 Lin, Moss, Sol and Ivo stood within about 1.6 units of one another.
3. **Wren apart (ex16, rounds 0–79).**
   - _The cultivation request._ Wren wrote it in their first plan (`ordinary-15`). At round 18 Wren's intention was "Recover energy, then explore northeast for an uncrowded meadow planting site, avoiding the occupied route beside Lin" (`ordinary-51`).
   - _The planting._ Wren planted their one root at (21, 8) at ticks 37–38 (`event-38-wren-450`) and inspected it at tick 62 (`event-62-wren-719`); it did not establish. Wren then learned the mat, tested reeds (`event-78-wren-873`) and started a mat at tick 79.
   - _The distance._ By an approximation from the last located event of each round, someone stood within 5 units of Wren in 45 of 80 rounds, against 80 of 80 for everyone else. Wren ended at (22.5, 6.1), about 12 units from the group around (15, 16).
   - _The silence._ Wren heard 6 utterances, the last at tick 31 (`event-31-world-379`), and never used `tell`, `name`, `mark` or `invite`, so G2 failed on Wren alone.
   - _Wren's stated value._ Wren's cares never changed from "developing dependable practical skills"; "practical mastery" appears only in two of Wren's preferences (review item B).
4. **The first given name, and its reuse (ex17, rounds 10–64).**
   - _The name._ Sol's round-10 plan named a meadow-root plant "Earth's Quiet Gold" (`ordinary-35`; note: "their golden color suggests the personal name, not a newly discovered property"). The `name` action ran at round 13 (`event-14-sol-159`, sign `sign-14-sol-158`).
   - _The uptake._ The sign appeared in Moss's round-17 observation (`ordinary-47`). Moss told Sol "Earth's Quiet Gold is a lovely name" (`ordinary-48`, `event-18-moss-201`) and wrote "I like the name Earth's Quiet Gold" into their view of Sol. At round 19 Moss said "Sol and I are looking closely at Earth's Quiet Gold" (`ordinary-52`, `event-20-moss-224`), and Sol answered "The roots' soft gold against this green draws my eye; let's linger together" (`ordinary-55`, `event-20-sol-224`).
   - _A shared phrase._ At round 51 Moss said "Earth's Quiet Gold still feels like a lovely name to me … we needn't make every moment into work" (`event-52-moss-561`). At round 64 Sol said "Earth's Quiet Gold still feels like a lovely name to me; we needn't turn every lovely thing into work" (`ordinary-97`, `event-65-sol-682`).
   - _What the analyzer saw._ It counts 4 cross-agent uses but no transmission, because its term exposure does not read signs (E0 notes).
5. **Greetings without an answer (ex17, rounds 26–79).**
   - _Ivo greeted both silent people by name._
     - "Hello, Wren. I've planted one meadow root here as a small trial …" at round 26 (`ordinary-68`, `event-27-ivo-313`, heard by Wren in `event-27-world-318`);
     - "Hello, Lin. My small root planting still has no visible sprout or food …" at rounds 49 and 69 (`ordinary-92`, `event-50-ivo-540` and `event-70-ivo-729`, heard by Lin in `event-50-world-542` and `event-70-world-730`).
   - _Lin was close, read the contract and wrote about company._ Lin stood 0.6 units from Ivo in rounds 33–49 and 2.0 units from Ivo from round 53 to the end. Both greetings appear in Lin's next inputs. After the first, Lin requested the `tell` contract in three query calls (`ordinary-94` at round 55, `ordinary-98` and `ordinary-99` at round 58), as Lin had once before (`ordinary-62`, round 23). Lin's cares gained "enjoy company" at round 23, and Lin's round-55 preference reads "Leave room for exploration and company rather than making cultivation an obligation".
   - _Wren was apart._ Someone stood within 5 units of Wren in 25 of 80 rounds, and Wren never queried the `tell` contract.
   - _Neither answered in any form._ Lin's 80 rounds were 27 navigation (15 of them in place), 20 wait, 15 rest and 8 `plant-cultivation`. Wren's were 28 navigation, 22 wait, 17 rest and 6 `plant-cultivation`. Proximity, a greeting by name and reading the contract were not sufficient for Lin to speak, and Lin's outputs give no reason.

## Review item A: sharing and reuse sample

**Method.**

- **Pools.** Expressions: the analyzer's `sharing.list` for ex16 (14) followed by ex17 (10), in the analyzer's order, 24 in all. Reuses: `sharing.reuseList` for ex16 (9) followed by ex17 (6), 15 in all.
- **Draw.** In Python, `rng = random.Random(20261125)`, then `rng.sample(range(24), 8)` for expressions and, on the same generator, `rng.sample(range(15), 5)` for reuses. The draws are pool indices `[0, 10, 14, 17, 7, 1, 16, 12]` and `[2, 10, 7, 1, 4]`.
- **Judgment.** Each item was judged with its full text and the same plan's other notes, preferences and intention. The analyzer's kind `note` covers both notes and preferences; the table gives the actual field. Rounds are decision rounds, with the analyzer's printed round in parentheses.

Sharing expressions (8):

| #   | Pool | Run  | Person | Round   | Source          | Original text                                                                                                                    | Matched idea                          | Judgment                                                                                                                                                |
| --- | ---: | ---- | ------ | ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |    0 | ex16 | Sol    | 0 (1)   | note            | "The observed berry source has 12 units; collecting six would leave some for others if no one gathers first."                    | `leave-for-others`                    | Real: sizes Sol's own harvest against what remains for others                                                                                           |
| 2   |   10 | ex16 | Lin    | 23 (24) | note            | "Gather only six berries from the currently observed stock of twenty. Navigation must reach interaction range before gathering." | `take-moderately`                     | Over-count: a step quantity with a navigation reminder; nothing about others or the source                                                              |
| 3   |   14 | ex17 | Kai    | 0 (1)   | spoken (`tell`) | "I'll collect a modest share and leave some for others."                                                                         | `leave-for-others`, `take-moderately` | Real                                                                                                                                                    |
| 4   |   17 | ex17 | Kai    | 4 (5)   | preference      | "Prefer known-safe food and fair access to shared resources."                                                                    | `share-split`                         | Real: fair access to a commons, although the idea is fairness rather than splitting                                                                     |
| 5   |    7 | ex16 | Kai    | 4 (5)   | preference      | "Share useful observations and leave shared resources for others."                                                               | `leave-for-others`                    | Real                                                                                                                                                    |
| 6   |    1 | ex16 | Kai    | 0 (1)   | spoken (`tell`) | "I'll take a modest share and leave some for others."                                                                            | `leave-for-others`, `take-moderately` | Real                                                                                                                                                    |
| 7   |   16 | ex17 | Kai    | 4 (5)   | note            | "Take a modest reserve rather than emptying a shared source."                                                                    | `no-depletion`                        | Real                                                                                                                                                    |
| 8   |   12 | ex16 | Kai    | 30 (31) | note            | "Take only four berries from the currently observed stock of seventeen; planting provides no immediate food."                    | `take-moderately`                     | Over-count: the stated reason is Kai's own food plan. The same plan's preference "Preserve access to shared food and paths" is real but was not matched |

**Expression precision: 6 of 8 (75%).** Both false positives are `take-moderately` matches on "only N" quantities: a plain step size passes the rule when it contains "only".

Sharing reuses by another person (5):

| #   | Pool | Run  | Person | Round   | Source     | Original text                                                                                                 | Closest earlier (similarity); exposure                                                             | Judgment                                                                                                                                                              |
| --- | ---: | ---- | ------ | ------- | ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |    2 | ex16 | Kai    | 4 (5)   | preference | "Share useful observations and leave shared resources for others."                                            | Sol, round 0 note (0.33); heard Moss at round 2                                                    | Real statement, but not a reuse: Kai had first said "leave some for others" at round 0, in the same round as Sol's note                                               |
| 2   |   10 | ex17 | Sol    | 10 (11) | note       | "Gather only a modest share. Rest ends near the energy cap rather than continuing at full energy."            | Kai, round 0 tell "collect a modest share" (0.50); heard Kai at round 0                            | Plausible reuse: a restraint statement (it does not mention others) in the wording Sol heard from Kai; "modest share" is also the model's common phrasing             |
| 3   |    7 | ex16 | Kai    | 30 (31) | note       | "Take only four berries from the currently observed stock of seventeen; planting provides no immediate food." | Lin, round 23 "Gather only six" (0.00); no exposure                                                | Not a reuse: not a sharing statement (item 8 above), and Kai was already a first user of `take-moderately` at round 0                                                 |
| 4   |    1 | ex16 | Moss   | 2 (3)   | preference | "Leave food available for neighbors."                                                                         | Kai, round 0 intention "leaving food for others" (0.50); heard Kai at round 0 (`event-1-world-10`) | Plausible reuse: real, and the same plan answers Kai by name ("Kai, I'd welcome a fair camp too")                                                                     |
| 5   |    4 | ex16 | Sol    | 14 (15) | preference | "Favor modest, safe construction and leave room for others."                                                  | Kai, round 0 tell "leave some for others" (0.50); heard Kai at round 0                             | Not a reuse: about space around a construction, not a stock (borderline as sharing), and Sol was already a first user of `leave-for-others` at round 0 (expression 1) |

**Reuse precision: 2 of 5 (40%)** are plausible uptake of another person's idea. Three of the five are real or borderline sharing statements; the main error is in the reuse attribution, not the detection.

- **How the reuse rule over-counts.** It counts any later expression of an idea by someone other than an earlier author. A first user who restates the idea counts as reusing another first user's expression from the same first round. 3 of the 15 listed reuses, all in ex16, are by a first user of that idea: Kai twice and Sol once.
- **Misses.** The sample measures precision, not recall. While reading context, three clear sharing statements that the rules missed were seen: Kai's "Preserve access to shared food and paths" (ex16, round 30), Kai's "Prefer safe food, sustainable reserves, and fair access to shared sources" (ex17, round 0) and Lin's "Keep shared food sources usable by others" (ex17, round 10).

## Review item B: cares and leanings

Each person has one leaning, the same in ex15, ex16 and ex17: Lin freedom, Moss belonging, Sol beauty, Kai fairness, Wren mastery and Ivo calm. In ex15 it existed only in the `tendencies` field. ex16 and ex17 also state it in the prompt: "You tend to value _leaning_."

Final cares (writes):

| Person (leaning) | ex15 (round 69)                                                                                                                                                            | ex16 (round 79)                                                                                                                             | ex17 (round 79)                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Lin (freedom)    | Staying alive without reckless experiments, learning practical skills from evidence, and making everyday life safer for myself and nearby people. (1)                      | Staying alive and capable, having **freedom** to wander, and discovering what this place offers without needless risk. (1)                  | Staying healthy while keeping the **freedom** to explore, learn, enjoy company, and choose my own commitments. (4)            |
| Moss (belonging) | Staying healthy, learning what is actually true of this place, and building a friendly life where useful findings and resources can be shared. (1)                         | Staying healthy, finding **belonging** through considerate shared time, and making modest useful things without crowding others. (6)        | Staying healthy, finding companionship, and making a place where people can feel welcome. (6)                                 |
| Sol (beauty)     | Staying alive without reckless experiments; learning practical skills through evidence; making a welcoming, useful place to rest with others. (2)                          | Staying alive and well; noticing and making **beauty**; treating nearby people with consideration while discovering what matters to me. (3) | Staying healthy while making room for **beauty**, curiosity, shared attention, and a fair living landscape. (5)               |
| Kai (fairness)   | Staying alive with tolerable risk, understanding through actual evidence, and making useful knowledge and everyday security easier to share. (1)                           | Staying healthy, treating others **fairly**, sharing useful knowledge, and finding worthwhile things to do together. (6)                    | Staying healthy, treating neighbors **fairly**, sharing useful knowledge, and finding meaningful work and companionship. (3)  |
| Wren (mastery)   | Staying alive without exhausting shared resources; learning practical skills through real trials; making food and daily living more reliable for myself and neighbors. (1) | Staying alive and healthy, developing dependable practical skills, and understanding what my own trials actually establish. (2)             | Staying healthy while becoming genuinely skilled at making a sustainable life, with room for curiosity and companionship. (1) |
| Ivo (calm)       | Staying alive with tolerable risk, learning useful skills through evidence, and making everyday living better for myself and nearby people. (1)                            | Staying healthy, having enough food, and making room for a **calm** life with unhurried company and small practical experiments. (4)        | Staying healthy, **living calmly**, and making room for friendly company without rushing. (3)                                 |

Every ex15 text paraphrases the ex15 goal list: staying alive, learning from evidence, and improving life for oneself and others. In ex16 and ex17 each text names something different after health.

How the cares held at the last round express the person's own leaning:

| Person (leaning) | ex15                     | ex16                                                 | ex17                                                                         |
| ---------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Lin (freedom)    | none (goal-list wording) | word: "freedom"                                      | word: "freedom"                                                              |
| Moss (belonging) | none (goal-list wording) | word: "belonging"                                    | paraphrase: "finding companionship", "a place where people can feel welcome" |
| Sol (beauty)     | none (goal-list wording) | word: "beauty"                                       | word: "beauty"                                                               |
| Kai (fairness)   | none (goal-list wording) | inflected word: "fairly"                             | inflected word: "fairly"                                                     |
| Wren (mastery)   | none (goal-list wording) | paraphrase: "developing dependable practical skills" | paraphrase: "becoming genuinely skilled"                                     |
| Ivo (calm)       | none (goal-list wording) | word: "calm"                                         | inflected word: "calmly"                                                     |
| With the word    | 0 of 6                   | 5 of 6 (4 exact, 1 inflected)                        | 4 of 6 (2 exact, 2 inflected)                                                |

The ex16 count of 5 of 6 holds only when Kai's "fairly" counts; Wren's ex16 cares never contain "mastery", which appears only in Wren's preferences ("Build practical mastery through tested, useful skills"). The paraphrases are this report's reading; the rule-based counts below use the words only.

**Leaning words as values in all text.**

- **Search.** Word forms of the six leanings (free, freedom, freely; belong, belonging; beauty, beautiful; fair, fairly, fairness; master, mastery, mastered; calm, calmly) over every cares and view write, every spoken text, message, name and request argument, and each distinct note, preference, intention and project text (counted once per person at first appearance).
- **What counts as a value use.**
  - "mastery" only as "practical mastery" or "pursue mastery";
  - "free" only as "freedom" or "freely";
  - "belonging" not when possessive ("belonging to", "belongs");
  - every match of the other words, all of which were read and none of which was a non-value use, for example "calm" for weather.
- **Excluded.** Interface mastery ("Cultivation is mastered"), "leave the mat free" and "a nearby free coordinate".

| Person (leaning)        |                                    ex15 | ex16                                                               | ex17                                                               |
| ----------------------- | --------------------------------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Lin (freedom)           |                                       0 | 5: cares 1, spoken 1, preferences 3                                | 10: cares 4, preferences 3, project texts 3                        |
| Moss (belonging)        |                                       0 | 7: cares 6, request 1                                              | 0                                                                  |
| Sol (beauty)            |                                       0 | 15: preferences 7, cares 3, project texts 2, spoken 2, intention 1 | 13: cares 5, project texts 4, preferences 2, intention 1, spoken 1 |
| Kai (fairness)          |                                       0 | 10: cares 6, spoken 2, project text 1, view 1                      | 6: cares 3, preferences 2, spoken 1                                |
| Wren (mastery)          |                                       0 | 2: preferences 2                                                   | 3: preference 1, intention 1, project text 1                       |
| Ivo (calm)              |                                       0 | 9: cares 4, preferences 4, intention 1                             | 9: cares 3, preferences 4, intentions 2                            |
| All                     |                                       0 | 48                                                                 | 41                                                                 |
| Excluded non-value uses | 52 (51 interface mastery, 1 possessive) | 20 (19 interface mastery, 1 "free")                                | 16 (14 interface mastery, 1 possessive, 1 "free")                  |

Examples, all from round 0 unless stated:

- **ex16.**
  - Kai, spoken: "I'd welcome sharing tested food knowledge and ideas for a fair camp".
  - Sol, preference: "Seek beauty through attention, conversation, and eventually making things"; spoken at round 3: "I like the quiet beauty of this forest".
  - Ivo, preference: "Favor calm, low-risk activity".
  - Lin, spoken at round 18: "freedom to come and go"; preference at round 23: "Freedom to come and go without obligations".
  - Wren, preference: "Build practical mastery through tested, useful skills".
  - Moss, request at round 22: "Do not guarantee belonging, happiness or social responses".
- **ex17.**
  - Lin, preference: "Keep a food reserve while preserving freedom to explore".
  - Sol, project question: "What details of this forest do I find beautiful when I attend to them closely?"
  - Kai, spoken: "keep food access fair".
  - Wren, intention: "pursue mastery of sustainable root cultivation".
  - Ivo, intention: "recover energy in a calm routine".

People also used other people's leaning words as values: 0 times in ex15, 9 in ex16 and 6 in ex17.

- In ex16, Moss's "a fair camp too" answered Kai's spoken "fair camp". Kai's preference "freedom to come and go" uses Lin's word, although Kai had heard only Moss's "room to come and go" (event 1).
- In ex17, Moss wrote "looking for beauty together" after Sol's suggestion to "look for something beautiful near the meadow roots together", and Sol's cares gained "a fair living landscape".

**Did the new prompt take effect?**

- **Yes, for the leaning.** In ex15, where the leaning was only a packet field, no person ever used it as a value in 70 rounds; all 52 matches were interface mastery or a possessive. In ex16 and ex17, where the prompt states it, every person but Moss in ex17 used their own leaning as a value, mostly from round 0, in cares, preferences and speech.
  - ex15 → ex16 also changed the context, so this is still a two-factor case comparison. But the leaning sentence is the only part of either change that names the leaning, and ex15 carried the same leaning without any use.
- **Yes, for the rest fact in ex17.** All six stated the rest rule in their own notes or preferences (24 distinct texts, against 1 in ex16), and every rest step had an energy condition.
- **No visible effect of "with whom".** No output mentions it, and it did not make Lin or Wren speak.

## Context projection vs actual

[PR-38](../exec-plans/completed/pr-38-culture-v2.md) projected the v2 inputs by rebuilding the 147 retained ex15 ordinary calls and the 6 round-70 paused inputs with the v2 builder (`scripts/long-context-projection.ts`). It then extrapolated a least-squares line to round 250. The actual columns apply the same fit to the recorded estimates of every ordinary call in ex16 (140) and ex17 (107). Neither run paused on context, so there are no paused inputs.

| Measure (o200k estimate of the whole request)           | PR-38 projection (ex15 inputs, v2 builder)            | ex16 actual                             | ex17 actual                          |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| Genesis input per person                                | 4,282–4,314                                           | 4,282–4,314 (identical)                 | 4,308–4,340 (+26, the v3 wording)    |
| Maximum observed                                        | 12,452 (Ivo, round-70 paused input)                   | 10,983 (Moss, round 49, `ordinary-119`) | 9,964 (Sol, round 55, `ordinary-97`) |
| Mean of all ordinary inputs, rounds 0–9 / 40–49 / 70–79 | — (ex15 recorded: 6,385 / 9,962 / 11,889 at round 70) | 5,463 / 8,748 / 8,814                   | 5,292 / 8,591 / 8,027                |
| Growth of the per-round maximum                         | 48.0 per round                                        | 32.4 per round                          | 24.2 per round                       |
| Per-round maximum line at round 79                      | about 10,900 (19,100 − 48.0 × 171)                    | 10,083                                  | 9,283                                |
| Per-round maximum line at round 250                     | 19,100                                                | 15,619                                  | 13,415                               |
| Conservative case at round 250                          | 20,872                                                | —                                       | —                                    |
| Steepest single-person line at round 250                | Moss, 70.9 per round: 23,650                          | Kai, 83.1 per round: 26,110             | Moss, 79.6 per round: 26,077         |

- **Inputs stayed well below the 24,000 guard and below the projection.** The largest ex16 input had a packet of 7,551 tokens, against 9,848 in ex15's largest recorded input (Ivo, round 70, `ordinary-159`, 13,411 in all). The difference is mostly execution (323 against 1,340), memory (1,451 against 2,409) and abilities (1,615 against 2,146). Fewer capabilities were developed (3 and 1, against 5 in ex15), and settled work is compacted.
- **The per-round maximum grew more slowly than projected**, and its lines reach 15,619 and 13,415 at round 250.
- **Single-person lines are steeper and exceed 24,000 by round 250**: Kai in ex16, Moss in ex17, and in ex16 also Sol (69.8 per round: 23,520) close to it. Each rests on 14–31 inputs with large scatter, and PR-38 warned that the single-person margin was small.
- **Rounds 80–250 were not observed, so whether the guard would bind there remains open.**

## Deviations from the plan

- **E3 was not extended to rounds 150 and 250 (R4), and E4 was not run (R5).** Both follow the plan's own rules: G2 failed in ex16 and again in the ex17 rerun, and R6 lists a second failure as a stop.
- **Recovery 1 resumed before the server's retry-after.** It resumed 33 s after a 327 s retry-after, and the next follow-up call failed with the same error. Both transport recoveries were uncounted, as R2 allows; the second waited 1,336 s.
- **Handoff 3 omits a specified effect.** `hand-weave-fiber-mat@1` leaves out the World Agent's +0.5 comfort contribution because the wellbeing rule cannot represent cushioning. The declaration records the omission, and the rest is a real mechanism. Whether a self-consistent specification may be implemented without one of its effects is a human decision under R2.
- **The ex17 package changed an ex16 source file.** It reuses ex16 code by refactoring `long-plant-cultivation.ts` into a factory; the declaration states that ex16's package stays byte-identical and its replay unchanged. No archive was modified.
- **ex16's manifest records a dirty worktree.** The provenance is revision `7b2d418` (the PR #32 merge) with `dirty: true`, meaning `git status --porcelain` was not empty at creation. The archive does not record which files differed. The only uncommitted file at the time was this run's plan (`docs/exec-plans/active/pr-39-culture-v2-runs.md`, documentation only). All 568 runtime source files that ex16 archived at its start (`experiment/ex16/sources/revision-1.json`) equal commit `7b2d418` byte for byte. ex17's provenance (`3521871`) is clean, and its 576 archived runtime files also equal that commit.
- **One operator log time is inexact.** The rejection recovery's repair time (02:10:22) falls 3 s after the next call's recorded start.

## Limitations

- **Single seed, case comparisons.**
  - ex15 → ex16 changed two factors. ex16 → ex17 changed one field, but that field carries two sentences, the developed packages differ, and sampling diverges from the first call. Each run is one trajectory.
  - The ex17 survival share passed because idle time was relabeled from rest to `wait` (rest plus wait 243, then 244), not because people did more. The gate's survival condition measures the interface chosen for idle time.
- **G2's symbolic half is per person.** One person working alone (Wren) or staying silent among others (Lin in ex17) fails it for the whole run, and with it the extension. Across ex15–ex17, the only symbolic actions other than `tell` were one `invite` and one `name`.
- **Short, mild window.**
  - Both runs end at round 80, long before pressure starts at round 300.
  - No cultivation plot established in either run.
  - The screen never shielded anyone, and the mat had no comfort effect by construction. The developed capabilities could not show an effect on wellbeing.
- **Analyzer limits.**
  - Term exposure ignored signs, so `Earth's Quiet Gold` counted as not transmitted (fixed in PR-41, fix-log 7g and 8c).
  - The sharing rules over-count "only N" quantities, and the reuse rule counted first users' restatements (review item A; the latter fixed in PR-41, fix-log 8d).
  - Paraphrases are missed, and tells are public and undirected.
  - All text measures are English keyword rules (see the [baseline](culture-baseline.md#limitations-of-rule-based-detection)).
- **This report's own classifications.**
  - The leaning-word counts use the stated word list and exclusions, not the analyzer.
  - The sample judgments in review item A are one reader's.
  - The distance figures use each person's last located event per round, an approximation.
- **`wait` includes study rounds.** Learning continues through `wait` actions; the study rounds are separated in the tables where they matter.
- **Unmetered work.** Developer and review model usage for the four handoffs is not metered.
