# Problems exposed by experiments, and their fixes

Each entry follows the same four steps: the problem a real experiment exposed → the evidence in the archives → the fix → the metrics the next run uses to check it. All numbers come from retained files under `experiment/`; none comes from a new run. Figures marked "estimated" come from offline replay of those archives.

## Definitions and reproduction

- **Tokens per agent per round**: the known input plus output tokens of every ordinary and World Agent call made before the given round, divided by agents × rounds. Calls whose usage is unknown (failed or interrupted) add nothing and are counted separately; their reservations are not tokens.
- **Follow-up call**: an ordinary call made in the same round after a query response, so it has fewer than the full query batches left.
- **Decision gap**: rounds between two consecutive accepted plans of the same agent.
- **Bound interface**: a developed interface whose id says `source-bound`, whose function names a person, or whose function or equivalence key names one item, surface or forest-source instance.
- `pnpm metrics:long -- experiment/ex13 [rounds]` reproduces the ex13 figures; [its test](../../scripts/long-metrics.test.ts) pins them. Cross-run figures (ex7–ex12) were measured once with read-only scripts over the call files and are not pinned.

Planned runs and archive numbers: E1 (fix verification) = ex14, E2 (culture pilot) and E3 (its continuation) = ex15, E4 (incentive control) = ex16, if no other experiment is allocated first.

## 0. Cross-experiment review (ex7–ex13)

Before fixing anything, the existing experiments were reviewed with one set of metrics.

| Finding                                          | Evidence                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The capability catalogue dominates inputs        | In ex7–ex12 the catalogue took a median 34–58% of a call's input JSON, and up to 85% of single World Agent calls; one added capability enlarged the catalogue by about 1.0–2.8KB                                                                     |
| Requests are almost all survival and measurement | Of 76 requests in ex7–ex12, 3 were about experience or creation (ex7: observing nature and a stone mosaic; ex8: observing wildlife); none was social                                                                                                 |
| Prompt wording shapes the type of request        | After ex10 added "understand unknowns through evidence" to the goal, 9–12 of its 14 requests (64–86%, depending on whether gathering material for a test counts) were testing or assessment                                                          |
| Incentives barely exist                          | Mean wellbeing per archive stayed at 8.5–9.6/100; no satisfaction came from social life, and the ex7 mosaic produced none                                                                                                                            |
| Most runs stopped early on a resource limit      | ex8 used all 400 ordinary calls (round 897/1000), ex10 hit context protection (358/1600), ex11 used all 4 development handoffs (7/200), ex12 could not reserve tokens for the next call (136/1600), ex13 used all 40 development handoffs (280/1600) |

## 1. Context grows with the capability catalogue (exposed by ex10, fixed in PR #25)

- **Problem**: ex10 was stopped by context protection at round 358 of 1600.
- **Evidence**: the full capability catalogue went into every call. Ex10's input averaged 80KB per call (median 87KB) as JSON, about 51KB after lossless compaction.
- **Fix** ([ADR 0026](../decisions/0026-bounded-long-development.md), PR #25): the catalogue is given as summaries, full specifications are queried by id, history is paged, and all phases share one token ledger.
- **Effect**: ex13 ordinary calls used 8,460 input tokens on average (ex9: 17,320). Per-call input rose from 6,390 in rounds 0–39 to 8,300–9,600 in later 40-round windows, growing about 10% after round 80; ex13 did not stop on context.

## 2. Pages too narrow, so one record takes several round trips (exposed by ex13)

- **Problem**: after fix 1 each call was smaller, but tokens per agent per round rose from 1,995 in ex9 to 5,254 in ex13 (6,632 in rounds 0–79).
- **Evidence**:
  - 219 of 433 ordinary calls were follow-ups, and each resent the whole input packet (8,960 input tokens on average).
  - Retrieval was paged at 600 characters. The 56 records read in paged form spanned 2–6 pages (median 2, at most 3.6KB), and ex13 issued 163 continuation-part queries.
  - 87 plans were decided with no query batch left; 52 of them still held a partly read record, 28 of those a capability specification.
- **Fix**: optional `longDevelopment.exactRecordWidth`. Exact reads by id return a whole record up to that length, and repeated whole reads in one round are shown once. Proactive views, broad searches and longer records keep the 600-character pages.
- **Verification**: with the option off, the requests of all 524 ex13 calls, the ordinary inputs of all 9 retained ex13 pauses (27 actor inputs) and all 1,604 ex7–ex12 requests are byte-identical to before the change.
- **Estimated effect**: whole reads remove 22 to 88 follow-up calls (those answering only, or at least partly, continuation queries), 5.2%–20.9% of ex13's ordinary-call input, and no plan is decided on a half-read record within the width.

## 3. Plans too short, decisions too frequent (exposed by ex13)

- **Problem**: ex13 decided more than twice as often as ex9: 0.25 accepted plans per agent per round, against 0.11.
- **Evidence**:
  - The median decision gap was 3 rounds (2 in rounds 0–79), against 9 in ex9; 47% of gaps were at most 2 rounds.
  - In 54% of plans every step ran once; no plan used interrupt events, while every ex9 plan did.
  - 54% of re-decision opportunities came because the plan had finished.
- **Fix**: optional `guidance: ['plan-horizon']`, which tells agents that decisions cost money while executing a plan is free, and encourages repeat/until, guards and interrupt events that cover the routine ahead.
- **Cost**: about 93 more tokens per ordinary call (o200k_base estimate).

## 4. Capabilities grow narrower and exhaust the development budget (exposed by ex13)

- **Problem**: ex13 stopped at round 280 of 1600 because its 40 development handoffs ran out, not time or tokens.
- **Evidence**:
  - Accepted World Agent responses contained 29 reviews: 28 developed a new capability and 1 reused an existing one. (The two rejected round-7 responses are excluded.)
  - Of the 28 developed interfaces, 19 were bound to one actor or item (for example `source-bound-plum-food-assessment` or `sol-surface-residue-transfer`, keyed to `surface-34-sol-201`), 22 were assessment, trial, diagnostic, feasibility, examination or reconciliation variants, and 23 were learned by at most one agent.
- **Fix**: optional `guidance: ['general-capabilities']`, which asks the World Agent to check first whether an existing capability can be reused through its arguments, to build new capabilities as general operations any agent can learn, and to name them by function rather than by agent.
- **Cost**: about 132 more tokens per World Agent call (o200k_base estimate).

## Metrics to compare in the next run (ex13 as baseline)

E1 runs `pnpm experiment:continuous -- new long-fixes` (ex13 rules and seed, all three fixes, `exactRecordWidth` 4000, 8 development handoffs) and is compared with ex13 rounds 0–79.

| Metric                                                                     | ex13 rounds 0–79 | ex13 all 280 rounds                       | Fix  |
| -------------------------------------------------------------------------- | ---------------- | ----------------------------------------- | ---- |
| Tokens per agent per round                                                 | 6,632            | 5,254                                     | 2, 3 |
| Follow-up share of ordinary calls                                          | 51.7% (92/178)   | 50.6% (219/433)                           | 2    |
| Continuation-part queries                                                  | 79               | 163                                       | 2    |
| Plans decided with a partly read record, of plans with no query batch left | 26/35            | 52/87                                     | 2    |
| Median decision gap                                                        | 2 rounds         | 3 rounds                                  | 3    |
| Share of plans where every step runs once                                  | 65.5%            | 54.0%                                     | 3    |
| World Agent reuse rate                                                     | 0/11             | 1/29                                      | 4    |
| Interfaces bound to one agent or item                                      | 5/12             | 19/28                                     | 4    |
| Calls with unknown usage                                                   | 3                | 6                                         | —    |
| Stop reason                                                                | —                | development handoffs exhausted (280/1600) | 4    |

E1's gate is at most 4,500 tokens per agent per round; if rounds 0–39 are not below ex13's same window, the run stops for investigation.

## 5. E1 (ex14): fixes 2–4 verified in one run

- **Problem**: fixes 2–4 were offline estimates and prompt guidance; only a run could show their effect.
- **Run**: `new long-fixes` on the ex13 rules, seed and world, 3 agents, 8 development handoffs and a 1,600,000-token ceiling. The window passed the round-40 gate and was extended toward 80, but it stopped at round 64 when the eighth handoff was spent and a ninth develop review arrived (the same recorded reason as ex13). All three were alive at health 100. One handoff was a recovery from a server overload at round 0.
- **Comparison window**: 64 rounds. ex14 observed rounds 0–63 before it stopped at round 64, so rounds 64–79 of the planned 80-round window were never observed. Every comparison below is against ex13 rounds 0–63; the ex13 rounds 0–79 column is the planned baseline, shown for reference only.
- **Metrics** (`pnpm metrics:long`):

| Metric                                                                     | ex14, rounds 0–63 | ex13, rounds 0–63 | ex13, rounds 0–79 |
| -------------------------------------------------------------------------- | ----------------- | ----------------- | ----------------- |
| Tokens per agent per round                                                 | 3,641             | 6,320             | 6,632             |
| Follow-up share of ordinary calls                                          | 55.7% (39/70)     | 52.5% (74/141)    | 51.7% (92/178)    |
| Continuation-part queries                                                  | 0                 | 55                | 79                |
| Plans decided with a partly read record, of plans with no query batch left | 0/14              | 22/29             | 26/35             |
| Accepted plans                                                             | 31                | 65                | 84                |
| Median decision gap                                                        | 5 rounds          | 2 rounds          | 2 rounds          |
| Share of plans where every step runs once                                  | 29.0%             | 69.2%             | 65.5%             |
| World Agent reuse                                                          | 3/11              | 0/8               | 0/11              |
| Interfaces bound to one agent or item                                      | 0/6               | 2/9               | 5/12              |
| Calls with unknown usage                                                   | 1                 | 3                 | 3                 |

- **Token count**: the ex14 value of 3,641 counts all 103 calls, including the three World Agent calls at the round-64 boundary that ended the run; without them it is 3,553.

**Effects of fix 2 and fix 3, separated by mechanism.** All fixes were on together, so this is an attribution within one run, not a causal separation.

- **Fix 2 (whole exact reads)** removed what it targeted: continuation-part queries fell from 55 to 0, and plans decided with a partly read record fell from 22/29 to 0/14. It did not lower the follow-up share (55.7% against 52.5%): agents still spent follow-up calls on queries for other records. Whole records also made no call cheaper: an ordinary call used 7,744 tokens against ex13's 7,597 (+2%).
- **Fix 3 (plan-horizon guidance)** changed how often agents decide: the median decision gap rose from 2 to 5 rounds, accepted plans fell from 65 to 31, and the share of plans whose every step runs once fell from 69% to 29%. Ordinary calls halved (141 to 70).
- **Cost**: tokens per agent per round fell 42% (6,320 to 3,641). Ordinary-call tokens per agent per round fell from 5,461 to 2,783 because there were half as many ordinary calls at the same cost per call; World Agent tokens per agent per round stayed about the same (859 against 858). The reduction therefore comes mainly from fix 3's fewer decisions, not from fix 2.

- **Culture metrics** (`pnpm metrics:culture -- experiment/ex14`): survival behavior took 55.2% of actor-rounds (ex13: 41.5% over 280 rounds); there were no messages and no symbolic actions; 2 terms were later used by another agent, neither through communication.
- **Gates**: G1 (at most 4,500 tokens per agent per round) passed at 3,641. The round-40 gate passed at 3,337 against ex13's 5,962.
- **What did not improve**: the follow-up share stayed above 50%, and no plan used interrupt events. Develop was still chosen in 8 of 11 reviews, so the handoff budget again ended the run.
- **Handoffs**: three handoffs installed working general operations: a cultivation trial, a paired food exposure trial and resting-material arrangement. Three installed first releases that only report physics the world does not represent: branch geometry and wind direction for a wind screen, stone support geometry for air-drying, and strand and tension behavior for cordage. One handoff reassigned the existing cultivation operation because no propagation biology exists, and one recovered the overloaded call. Every handoff is recorded as `current-claude-conversation`.
- **Next step**: separately decide the missing material and environment representations, and consider letting the World Agent reject unsupported requests without spending a handoff.

Three log-backed events:

1. **Contracts steered requests.** At round 10, Sol chose to investigate preservation before spending time or food on a planting trial that cannot replenish the supply (`ordinary-18`). At round 32, Moss asked for functional preservation because the existing ground-exposure trial explicitly cannot preserve food (`ordinary-51`).
2. **Reuse instead of new assessment variants.** The World Agent answered three food-assessment requests by reusing `probe` through its arguments: Moss at round 29 (`world-42`), Sol at round 31 (`world-48`) and Lin at round 59 (`world-83`). In ex13, 22 of 28 developed interfaces were assessment, trial or diagnostic variants.
3. **One person used another's capability.** Lin learned Sol's food trial to establish an observed decay baseline (`ordinary-59`, round 34). Lin retried the site after its own body blocked it (`ordinary-66`, round 40), exposed a matched berry pair from round 42, and inspected and retrieved both samples at rounds 52–54 (`ordinary-76`). Both samples showed decay 34.09 after 10 rounds, identical as the contract states.

This is one seed with three people, so the comparison is a case comparison, not a statistical result. The behavioral analysis is in [experiment/analyses/ex14](../../experiment/analyses/ex14/pr-34-e1-fix-verification.md).

## 6. E2 (ex15): newly exposed problems

E2 ran `new long-culture` as ex15: the ex13 rules, seed and world with six people and every culture switch on, under the frozen budgets of the [culture scenario](../CULTURE_SCENARIO.md#budget-mechanics). It paused at round 70 of the 80-round window with all six alive at health 100, after 159 calls and 1,320,077 tokens (3,143 per agent per round) and 8 counted handoffs. E3 (extending ex15 to round 250) and E4 (which requires E3 to reach round 150) were not run. The [run report](run-report-e2-e4.md) has the configuration, every handoff, all culture metrics against ex13 and ex14 and five log-backed events; the behavioral analysis is in [experiment/analyses/ex15](../../experiment/analyses/ex15/pr-37-culture-pilot.md). The four problems below are new; every fix is **proposed, not applied**.

### 6a. Context growth reaches the pre-inference guard, and the fix is in a protected file

- **Problem**: ex15 stopped at round 70 on context protection, before the round-80 checkpoint, and cannot continue under its own protocol.
- **Evidence**:
  - The guard estimated Ivo's next decision at 14,396 tokens against the frozen `inputEstimateLimit` of 14,000: packet 9,848 (observation 2,648, memory 2,409, abilities 2,146, execution 1,340), retained retrieval of two query batches 1,968, instructions 859. The other five people measured 8,721–10,272 ([development-8](../../experiment/ex15/development/development-8-declaration.json)).
  - Inputs grew steadily: the first call of a decision (no retrieval) averaged about 6,100 estimated tokens in rounds 0–9 and about 9,300 in rounds 40–69, and Ivo's reached 12,174 at round 70. Average packet memory grew from about 400 to about 1,600 tokens and execution from about 200 to about 520; Ivo, with four mastered interfaces and long-running work records, had the largest packet. The scenario document expected about 6,100 after a few symbolic actions.
  - A culture-gated, lossless and disclosed compaction of the ordinary packet (settled work records summarized with exact-query access, duplicate catalogue entries and page notes removed, contiguous parts joined) measured 12,674 for Ivo with ex7–ex14 compatibility digests identical. It changes `apps/simulator/src/long-context.ts`, which `scripts/continuous-source.ts` protects mid-run ("require a separate run version"). Changes limited to unprotected modules save at most about 125 tokens without dropping retained retrieval, which would be hidden truncation.
- **Fix (proposed, not applied)**: a user decision between a new run version of the culture scenario that includes the compaction from its first call, and a verifier policy that admits a lossless, disclosed, scenario-gated packet change mid-run when every compatibility digest is unchanged.
- **Metrics**: the largest per-person decision estimate at round 70 (14,396; below 14,000 required, 12,674 measured offline), ex7–ex14 compatibility digests, and the round reached before any context pause (70).

### 6b. Whole exact reads do not cover long developed ability records

- **Problem**: fix 2 removed continuation reads in ex14, but they returned in ex15 for the records of developed interfaces.
- **Evidence**:
  - 13 continuation-part queries (ex14: 0), 12 of them on developed abilities (`cultivation-trial` 8, `shared-shelter` 4; for example `ordinary-94`, `ordinary-147`, `ordinary-159`).
  - 9 of the 25 plans decided with no query batch left still held a partly read record (ex14: 0 of 14; ex13 rounds 0–69: 24 of 32).
  - Four of the five developed ability records were served in 7–9 pages of 600 code units (`simple-shelter` 8, `shared-shelter` 9, `cultivation-trial` 8, `bark-separation` 7), so each exceeds `exactRecordWidth` 4000; only `food-preparation` (3,259) was read whole.
  - The cost is still small: follow-ups that answered continuation queries took 1.6–3.2% of ordinary-call input (ex13 rounds 0–69: 5.1–26.2%).
- **Fix (proposed, not applied)**: either let exact reads of ability records use a larger width through a new scenario option (earlier archives unchanged), or check at handoff that a developed interface record fits 4,000 code units, with longer contracts split into a summary and an exact-id detail.
- **Metrics**: continuation-part queries (13), plans decided with a partly read record (9/25) and the continuation share of ordinary input (1.6–3.2%), over the same rounds.

### 6c. Rejected model output pauses consume counted handoffs

- **Problem**: two consecutive rejected outputs in one decision pause the run, and the recovery is counted as a development handoff although nothing is developed. Uncounted transport recovery covers only calls that ended without a response.
- **Evidence**:
  - 8 of 147 ordinary outputs were rejected: the registered plan shape 4 times (`ordinary-19`, `-53`, `-64`, `-131`), the `message` argument `urgency` placed on a `tell` twice (`ordinary-13`, `-57`), malformed JSON once (`ordinary-12`) and a tell longer than 240 characters once (`ordinary-52`).
  - Four single rejections were fixed by the one bounded correction (`ordinary-20`, `-58`, `-65`, `-132`). Two pairs paused the run: Kai at round 0 (`ordinary-12`, `-13`, recovered by development-1) and Sol at round 13 (`ordinary-52`, `-53`, development-6). Each recovery installed nothing and changed no source.
- **Fix (proposed, not applied)**: treat a pause after rejected model output like the uncounted transport recovery (retain it under `technical-pauses/`, keep both charges and resume with a fresh decision without a handoff, still stopping on a repeat for the same person in the same round), and name the offending field in the bounded correction, for example that `urgency` belongs to `message`.
- **Metrics**: counted handoffs spent on rejection pauses (2 of 8) and rejected outputs per ordinary call (8/147, 5.4%).

### 6d. A failed handoff submission consumes a counted handoff

- **Problem**: a submission that the handoff validator rejects still counts, because handoffs are counted before work.
- **Evidence**: development-3 (round 8) submitted `simple-shelter@1` with a declared `simple-shelter` visual component that the viewer did not yet implement. The validator ran typecheck, the architecture check, the full test suite and the build, and reconstructed every saved round, before its cheap structural check rejected the package with "Package visual implementation is absent" (`scripts/continuous-source.ts`). Development-4 resubmitted the same package with a small viewer drawing. The round-8 review therefore used two of the eight counted handoffs.
- **Fix (proposed, not applied)**: a non-counting pre-submission check that runs the structural checks (declared visual components, the excluded vocabulary, declared source paths) before the expensive commands, or counting only accepted submissions.
- **Metrics**: failed submissions per installed package (1 failed against 5 packages) and handoffs per installed package (8 for 5).

Together, 6a, 6c and 6d account for four of the eight handoffs: two rejection pauses, one failed submission and one closing recovery, none of which installed a package.

## 7. Culture v2 runs: newly exposed problems

After reviewing ex15, the user chose a new run version ([CULTURE_SCENARIO](../CULTURE_SCENARIO.md#culture-v2)). PR #32 applied the fixes for 6a–6c in `long-culture-v2`:

- lossless compaction with a 24,000-token guard (6a);
- 6,000-code-unit exact reads with a 3,500-code-unit limit on developed interfaces (6b);
- uncounted rejection and empty handoffs (6c).

6d was left unchanged.

ex16 (`long-culture-v2`) ran 80 rounds and failed gate G2. Following the pre-authorized procedure, ex17 (`long-culture-v3`, PR #33) reran it with one change to the wording of part A, and it failed G2 again. Two failures stop the work, so E3 was not extended and E4 was not run. The [run report](run-report-culture-v2.md) has the details; the behavioral analyses are [ex16](../../experiment/analyses/ex16/pr-39-culture-v2-run.md) and [ex17](../../experiment/analyses/ex17/pr-39-culture-v3-rerun.md).

**Verification of 6a–6c in ex16 and ex17:**

- **6a:** no context pause. The largest input estimate was 10,983 in ex16 and 9,964 in ex17; ex15 reached 14,396 by round 70.
- **6b:** 0 continuation-part queries in both runs (ex15: 13). Every developed interface was 3,025–3,473 code units.
- **6c:** one rejection pause (ex16 round 24) resumed without a handoff, and no run reached three consecutive rejections. Every counted handoff installed a package: 3 in ex16 and 1 in ex17.

### 7a. Idle rest inflates the G2 survival share

- **Problem**: the G2 gate counts every `rest` as survival behavior, even when there was little energy to restore. In ex16 the gate failed on the survival condition at 50.6%, although survival actions other than rest took only 11.9% of actor-rounds.
- **Evidence** (`pnpm metrics:culture -- experiment/ex16 80`):
  - 186 of the 243 survival actor-rounds were rest.
  - 115 of the 186 rests (62%) were idle by the step-condition criterion. 96 came from plan steps with no energy condition, and for the others the energy cap cut the recovery.
  - 145 of the 186 rests (78%) began at 75% or more of the cap.
  - Lin, Moss and Kai rested in 45–55% of their rounds.
- **Fix (applied in `long-culture-v3`, the single G2-failure adjustment)**: the open goal also leaves open with whom to live, and a fact follows the person's leaning: "Rest restores missing energy up to the cap; at full energy it restores nothing."
- **Metrics (ex16 → ex17, rounds 0–79)**:

  | Metric                                |  ex16 |  ex17 |
  | ------------------------------------- | ----: | ----: |
  | Rests                                 |   186 |    85 |
  | Idle rests (step-condition criterion) |   62% |   31% |
  | Survival share                        | 50.6% | 27.3% |
  | Survival share without rest           | 11.9% |  9.6% |
  | `wait` rounds                         |    57 |   159 |

  Idle time moved from rest to `wait`, which the gate does not count. The share fell without people doing more of anything else, so this is a measurement fix, not a behavioral one.

### 7b. The per-person symbolic condition fails on any single silent person

- **Problem**: G2 requires at least one symbolic action from every person. A single person who works far away, or who stays silent among others, fails it for the whole run.
- **Evidence**:
  - In ex16, Wren made 0 symbolic actions (others 3–10). Wren worked about 12 units from the others' clearing, heard 6 utterances (none addressed to Wren) and never read the `tell` contract.
  - In ex17, Lin and Wren made 0 (others 4–7), for different reasons.
    - Wren again went far: Wren was within hearing distance (5 units) of someone in only 25 of 80 rounds and did not answer "Hello, Wren".
    - Lin was within 5 units of another person in all 80 rounds and was greeted by name twice. Lin queried the `tell` contract 4 times, 3 of them after a greeting, and never spoke. Lin's silence was a choice, not distance.
  - In ex15, which passed G2, every person used `tell` at least once. Across ex15–ex17, the only symbolic actions besides `tell` were one `invite` (Moss, ex16) and one `name` (Sol, ex17).
- **Fix (proposed, not applied; a user decision)**: decide whether the per-person condition measures what G2 is meant to measure. Options:
  - keep it unchanged and accept that solitary people fail the gate;
  - judge it on the group, for example a share of people or of actor-rounds;
  - change the scenario so that people are not pulled apart (see 7c).

  Any change to the gate or the scenario is outside the pre-authorized procedure.

- **Metrics**: per-person symbolic actions, distance of each person from the group centroid over time, and utterances heard per person.

### 7c. The cultivation site rule pulls cultivators away from the shared clearing

- **Problem**: the only interface everyone requested first, cultivation, can be used only away from the commons. That separates the people who plant from the others.
- **Evidence**:
  - The planting check in `cultivate-plants@1` and `plant-cultivation@1` comes from the existing `long-planting-site` and propagation rules. It requires ordinary soil, a clear 0.6 m radius and fewer than 3 same-species plants within 5 m.
  - The clearing between the starts holds the renewable commons food, so it fails the density rule.
  - Wren's plans in ex16 say "explore northeast for an uncrowded meadow planting site" and "move beyond the crowded root patches".
  - In ex16, 4 planting attempts near the camp were refused (2 for density, 2 for occupancy or obstacles). Lin, Kai and Ivo then stopped trying.
  - An offline check of `initial.json` found no eligible cell for berries or roots within 5 units of the starts' centroid (14, 15). The nearest eligible cells lie about 7.4–7.5 units away.
  - In ex17, Moss's and Kai's attempts near the camp were refused for density, and four people later planted 8–9 units from the starts.
  - Wren's own position at the ex17 barrier was forest ground, where planting is refused.
- **Fix (proposed, not applied)**: none is required by the rules. If 7b is addressed through the scenario, measure how far cultivators are from the others before changing the site rule.
- **Metrics**: distance of cultivators from the group centroid, and refused versus accepted planting attempts by location.

### 7d. `repair` resumes a transport pause before the server's retry-after

- **Problem**: `repair` resumes the run immediately, so the next call can hit the same overload.
- **Evidence**: at ex16 round 2, `ordinary-19` failed with `server_is_overloaded` and retry-after 327 s. The repair resumed 33 s later. The next call (`ordinary-20`) succeeded, and its follow-up `ordinary-21` failed again 41 s after the first failure, with retry-after 348 s. Under the user's rule, the second recovery waited 1,336 s and the run then continued without further transport errors. The [run report](run-report-culture-v2.md) has the full log.
- **Fix (proposed, not applied; a protocol change for a later run version)**: read `retry-after` from the retained failure evidence and refuse to resume before it has elapsed, plus a margin. Each recovery would record its wait.
- **Metrics**: transport failures within one retry-after window of a previous recovery (1 in ex16), and recoveries per 60 minutes.

### 7e. The ex13 Ashen recording test runs at 85% of its CI timeout

- **Problem**: the browser test that records ex13 playback has a 120 s limit and passes in about 1.7 minutes on CI. It failed on the first attempt of both PR #32 and PR #33, stopping at exactly 120 s, and both reruns passed. This follows the user's rule for this timeout, given before PR #29: rerun first, then compare durations, then raise it to 180 s.
- **Fix (applied in this PR)**: `test.setTimeout(180_000)` for that test only, with its assertions unchanged.
- **Metrics**: first-attempt failures of this test on later PRs (2 of 2 before), and its CI duration.

### 7f. The `tell` schema allows longer text than the interface accepts

- **Problem**: the `tell` description says 240 characters, but the argument schema's `maxLength` is 1000, the default of `text()` in `packages/world-core/src/expression.ts`. A model that trusts the schema writes text the handler then rejects.
- **Evidence**:
  - In ex16, all three of Kai's rejected outputs held a 241-character `tell`, and two of them caused the round-24 rejection pause.
  - In ex15, `ordinary-52` was rejected for the same reason.
  - `name` (60), `mark` and `invite` notes (120) have the same mismatch.
- **Fix (proposed, not applied; a change for a later run version, because the interface text is part of the run's genesis)**: set each argument's `maxLength` to the limit the handler enforces.
- **Metrics**: rejected outputs caused by over-long symbolic text (ex15: 1; ex16: 3).

### 7g. The vocabulary analyzer misses a name transmitted through a sign

- **Problem**: `metrics:culture` reports 0 transmitted terms in ex17, although one coined name spread from one person to another.
- **Evidence**: Sol named a root patch "Earth's Quiet Gold" (`sign-14-sol-158`), the only `name` in ex15–ex17. Moss saw the sign in its observation and then used the name.
- **Fix (proposed, not applied)**: count sign texts, including names and marks, as public sources for term transmission, using the same visibility rule the sharing measure already uses for signs.
- **Metrics**: transmitted terms in ex17 (0 reported, at least 1 observed).

### 7h. The sharing-reuse rule counts an author restating their own idea

- **Problem**: in the sharing measure, a reuse is supposed to mean someone else adopting an idea. The rule also counts a later restatement by one of the idea's first authors.
- **Evidence**:
  - In the review sample of the [run report](run-report-culture-v2.md), drawn with seed 20261125 over ex16 and ex17, 6 of 8 detected sharing expressions were real sharing or restraint statements. The two misses were plain "only N" quantities.
  - Only 2 of 5 detected reuses were plausible uptake by another person.
  - Of all 15 listed reuses, 3 (Kai twice and Sol once, all in ex16) were first users repeating their own idea.
- **Fix (proposed, not applied)**:
  - Exclude anyone who expressed the idea before the first reuse.
  - Require a mention of other people or of leaving something for others before a quantity statement counts as restraint.
- **Metrics**: precision on a fresh fixed-seed sample (6/8 for expressions and 2/5 for reuses before the change).

## 8. Revised G2 and analyzer fixes before the extension

The user reviewed ex16 and ex17 and concluded that G2 failed because of the gate's design, not because the runs failed. Both runs showed negotiated camp terms, a shared mat, an attended invitation and a screen valued for its pattern; ex17 also showed a coined name another person used and a repeated saying. The user then decided to revise the gate, fix 7d, 7g and 7h, add three detections and a timeline, and extend both archives to round 250 ([PR-41](../exec-plans/completed/pr-41-culture-g2-revision.md)). 7c and 7f stay unchanged (see the limitations below). None of this changed a world rule, a prompt, a budget or an archive; the ex7–ex17 compatibility digests are identical.

### 8a. G2 is revised to a group measure, after the fact

- **Problem**: see 7a and 7b. The original survival condition counted idle rest as survival, and the per-person symbolic condition failed a run on one silent person. Neither half measures shared culture by itself.
- **Evidence**: under the original gate, ex16 failed both conditions (50.6%; Wren silent) and ex17 failed the symbolic condition (Lin and Wren silent). Yet both runs contain adopted content, listed in 8f.
- **Fix (applied in `metrics:culture`; a post-hoc revision by the user on 2026-11-25, after both runs had failed the original gate)**: G2 passes when all three conditions hold:
  1. survival actor-rounds other than `rest` are below 50%, with `rest` and `wait` reported as idle time;
  2. at least half of the people make a successful symbolic action;
  3. at least one name, saying or rule is adopted by another person who had received it.

  The analyzer prints the original gate next to the revision.

- **Metrics (rounds 1–80 as the analyzer prints them; ex15 rounds 1–70)**:

  | Archive | Survival without rest | Idle (rest + wait) | People with a symbolic action | Adopted names / sayings / rules | Revised G2 | Original G2 |
  | ------- | --------------------: | -----------------: | ----------------------------- | ------------------------------- | ---------- | ----------- |
  | ex15    |                 12.1% |  142 / 420 (33.8%) | 6 of 6                        | 0 / 3 / 3                       | pass       | pass        |
  | ex16    |                 11.9% |  243 / 480 (50.6%) | 5 of 6 (not Wren)             | 0 / 4 / 3                       | pass       | fail        |
  | ex17    |                  9.6% |  244 / 480 (50.8%) | 4 of 6 (not Lin, Wren)        | 1 / 3 / 1                       | pass       | fail        |

  Idle time is about half of all actor-rounds in both v2 runs. The revised gate passes them on adoption and group participation; it does not show that idle time fell.

### 8b. `repair` waits for the retry-after (7d)

- **Problem**: see 7d.
- **Fix (applied)**: for a transport pause, `repair` reads `retry-after-ms` or `retry-after` from the retained failure evidence. It waits until the failure time (attempt start plus elapsed time) plus the retry-after plus 60 seconds, then resumes.
  - Without a retry-after it resumes at once, as before.
  - It refuses a seventh dated transport recovery of the same experiment within 60 minutes, before and after waiting, and asks for the user.
  - Each new recovery record adds `recoveredAt` and `transportWait`: the failure time, error code, retry-after, margin, earliest resume time and the time waited. Earlier records are unchanged and are not counted, because they carry no recovery time.
- **Metrics**: the retained ex16 overload (`ordinary-19`, retry-after 327 s) gives a resume time 387 s after the failure. A repair started 33 s after the failure now waits 354 s (`scripts/transport-wait.test.ts`).

### 8c. Sign texts count as received for term transmission (7g)

- **Fix (applied)**: names, marks and invitation notes count as received by each other person at the first round they come within the vision radius of where the sign was made. Sign caps, expiry and obstacles are ignored, as in the sharing exposure.
- **Metrics**: ex17 transmitted terms 0 → 2. `Earth's Quiet Gold` went from Sol (round 14, sign) to Moss (round 18, `ordinary-48`). The second, `Quiet Gold`, is part of Sol's own name and is not counted as an adopted name in G2. ex15 (no signs) and ex16 (its only sign, the invitation, carries no term) are unchanged.

### 8d. A sharing reuse excludes the idea's first authors (7h)

- **Fix (applied)**: an expression by any of an idea's first users is no reuse. The second proposal of 7h (requiring a mention of other people before a quantity counts as restraint) was not requested and is not applied.
- **Metrics**: reuses ex15 23 → 17, ex16 9 → 6, ex17 6 → 6. The 3 ex16 restatements of the review sample (Kai twice, Sol once) are gone.

### 8e. Listeners' `heard` events and signs leaked actor text into the environment vocabulary

- **Problem**: found while adding phrase propagation. The environment, which excludes words that were not coined, included the description and data of every world event and every world object. In the culture voice scopes (ex15 onward), each listener's `heard` event copies spoken text, and name, mark and invitation signs are world objects. So every spoken coinage counted as authored environment and was never a candidate term or phrase.
- **Evidence**: in ex17, the `heard` event of Sol at tick 52 holds Moss's whole round-52 speech, which made the saying of 8f match the environment.
- **Fix (applied)**: `heard` events are actor-text events, and sign objects are not environment.
- **Metrics**: candidate terms ex15 14 → 16 (shared 0 → 1), ex17 6 → 8. ex16 is unchanged at 5. ex7–ex14 have no `heard` events or signs.

### 8f. New detections: phrases, invitations, appearance and a timeline

- **Problem**: the user's review found sayings, an attended invitation and an object valued for its look that the analyzer did not detect.
- **Fix (applied)**: see the [metric definitions](culture-baseline.md#phrases-invitations-works-and-the-timeline-added-later).
  - **Phrase propagation**: at least 4 shared words in order covering half of the shorter clause, including 2 content words, written after receipt.
  - **Invitation attendance**: from the world's `attendance` event, plus guests who arrived during the grace period and what was said there.
  - **Appearance despite failure**: a work named by its head word, a functional failure and appreciation of its look in one utterance, plus acknowledgements by people who had received it.
  - **Timeline**: dated items per run, each with the call that produced the person's plan.
- **Evidence and metrics (the user's test cases, all detected; settle ticks as the analyzer prints them)**:
  - ex17 tick 52 → 65: Moss (`ordinary-89`): "we needn't make every moment into work"; Sol (`ordinary-97`, heard at tick 52): "we needn't turn every lovely thing into work". Kai's tick-71 note continues it ("without turning every encounter into work"). The pleasantry "I'm glad you're here" is not a saying.
  - ex16 tick 51 invitation by Moss (`ordinary-119`, `sign-51-moss-600`) for tick 60. Attendance at tick 60: Ivo, Moss and Sol present, Ivo came after hearing it away. Ivo spoke there at tick 60 and Sol at tick 61.
  - ex16 tick 70: Sol (`ordinary-134`) said that the wind was too strong for the screen's shelter effect and that Sol liked the woven pattern anyway (`screen-50-sol-571`); Moss acknowledged it at tick 71 (`ordinary-138`).
  - Counts at round 80: phrase propagations ex16 9 (4 into spoken text), ex17 7 (3). The 5 private-note propagations include 2 status reports ("the berry bush is empty", "no visible sprout"), so precision on notes is low and notes do not count for G2.

## 9. Culture v2 extension: newly exposed problems

After the revision in section 8, ex16 and ex17 were extended to round 250 and E4 ran as ex18 for 120 rounds ([PR-42](../exec-plans/completed/pr-42-culture-v2-extension.md), [run report](run-report-culture-v2-extension.md)). The entries below are problems the extension exposed. 9b and 9c were fixed in this PR; the others are proposals.

### 9a. A connection failure without a response leaves no transport evidence

- **Problem**: the opt-in transport recovery requires retained failure evidence. A request that fails before any response is retained with an empty `failureEvidence`, so `repair` cannot recognize it as a transport failure. It issues a technical development handoff instead.
- **Evidence**: ex16 round 99, `ordinary-168` (Lin) failed with `fetch failed` 163 ms after it started, with no response and empty evidence. `repair` issued development attempt 4; an empty declaration closed it, and it stayed uncounted only because v2 does not count empty handoffs. The [recovery log](run-report-culture-v2-extension.md#recovery-log) has the times.
- **Fix (proposed, not applied)**: record the client-side error (its name, message and elapsed time) as transport evidence when a call ends without any response, and classify it as a transport failure. Keep the wait rule: no retry-after means the 60 s margin.
- **Metrics**: technical handoffs caused by evidence-free transport failures (1 in the extension).

### 9b. An archive cannot continue after other runs change shared runtime code

- **Problem**: `continue` and `extend` refuse a run whose runtime sources differ from its last recorded revision. After ex16's first window, main gained the culture v3 code and ex17's package, so ex16 could not be extended on main. Every later handoff in any run invalidates every other paused archive in the same tree.
- **Evidence**: `extend ex16 150` on main failed with "Continuous run source changed outside a versioned development handoff". Eight runtime files differed from ex16's revision 4; ex17 matched main exactly.
- **Fix (applied with the user's approval)**: each continued archive ran on its own branch, starting at its last checkpoint commit (ex16 `2409b37`, ex17 `b643e48`). The only change brought onto those branches is the PR #35 repair script, which is outside the runtime identity. Before the merge, every continued archive was replayed in full on the merged code: requests and paused inputs were byte-identical (ex16 340 and 24, ex17 285 and 0, ex18 190 and 0), and so were ex7–ex15.
- **Metrics**: compatibility digests of each continued archive on main (all identical).

### 9c. Analyses of an extended archive failed the analysis check

- **Problem**: a companion analysis binds the hashes of every archive file. Extending ex16 changed those files, so the round-80 analysis `pr-39-culture-v2-run` failed `pnpm analysis:check`. Published analyses are preserved and cannot be rewritten.
- **Evidence**: "Analysis artifacts changed; inspect the actual record again." The analysis's 222 artifacts equal, hash for hash, the copies that `extend` preserved under `experiment/ex16/windows/through-80/`.
- **Fix (applied)**: `parseAnalysis` also accepts an analysis whose artifacts equal one preserved window, after hashing every preserved copy again (`windowMaterial`, `scripts/analysis-window.test.ts`).
- **Metrics**: `pnpm analysis:check` passes with the round-80 and round-250 analyses of ex16 and ex17 side by side.

### 9d. Package ids can collide across run branches

- **Problem**: handoffs on separate branches cannot see each other's packages, so two of them can pick the same id, handler or export name. Validation on each branch passes, and the clash only appears at the merge.
- **Evidence**: ex18's round-73 handoff and ex17's round-156 handoff both produced `thermal-food-preparation@1`. The clash was caught before the ex17 submission, and the ex17 package was renamed to `hearth-food-preparation@1` before any call used it. After all merges, the 99 packages have unique ids and handlers.
- **Fix (proposed, not applied)**: a unit test that asserts unique package revisions, handler ids and exported names in `V7_PACKAGES`. Each handoff brief should also list the ids already taken on other open branches.
- **Metrics**: duplicate ids at merge time (1 caught by hand).

### 9e. Long plans and hearing that does not trigger a decision leave speech unanswered

- **Problem**: in the long windows, idle time grew and people stopped responding to each other. Hearing someone does not start a new decision, and no plan used interrupts, so a person can reply only when its own plan ends. Plans of 60–70 rounds made that rare.
- **Evidence**:
  - Idle share (`rest` plus `wait`) rose from 50.6% (ex16 ticks 1–80) to 59.7% over 250 rounds, and in ex17 from 50.8% to 67.6%.
  - In ex16, Moss's plan from tick 127 ran 61 rounds and Ivo's from tick 124 ran 70.
  - Symbolic actions fell from 29 in ex16 ticks 1–80 to 16 in ticks 81–250. Sol's direct question to Moss at tick 220 (`event-220-sol-2460`) was never answered.
  - Wren's first `tell` (tick 204) reached nobody: Moss had moved 5.16 units away. The [ex16 analysis](../../experiment/analyses/ex16/pr-42-culture-v2-extension.md) has the details.
- **Fix (proposed, not applied; a scenario change)**: let hearing an utterance addressed to the person by name end the current plan step at the next safe boundary, or cap plan length. Measure it as a new scenario version, not on these archives.
- **Metrics**: share of addressed utterances answered within 10 rounds, plan length distribution, and idle share.

### 9f. The analyzer misses named places, stories and shared tastes in speech

- **Problem**: the term and phrase rules are lexical. They do not see a place name given in speech, an invented story told over several utterances, or a shared liking expressed in different words.
- **Evidence**:
  - In ex18, Sol named its clearing "The Berry Lantern" at tick 10 (`event-10-sol-105`) and Moss praised the name. Kai, Lin and Moss then built a lantern story over five utterances (ticks 79, 80, 103, 109, 117). The metrics count neither.
  - In ex16, a liking for the woven objects ("woven things give this place a character", Sol, tick 134) spread without a shared phrase.
- **Fix (proposed, not applied)**: count capitalized names whose words include a resource or object word when they are introduced as a name ("call it", "named"). Report recurring motifs (a content word repeated by several people across utterances) as candidates for review, not as adoptions.
- **Metrics**: recall on a hand-labelled sample of named places and motifs.

### 9g. The incentive rules are invisible to the people they reward

- **Problem**: E4 adds incentive events, but the people's inputs do not describe them. So the incentive control measures reward events, not a behavioral response to incentives.
- **Evidence**:
  - ex18's `ordinary-1` input differs from ex16's only in the scope string.
  - Ten awards went to three people (Kai 4, Lin 3, Moss 3) for named speech within their trio, and Sol, Wren and Ivo got none.
  - Award events reached a decision input 6 times, all Moss's, and no output mentions them. The [ex18 analysis](../../experiment/analyses/ex18/pr-42-e4-incentive-control.md) has the details.
- **Fix (proposed, not applied; a design decision for the user)**: decide whether an incentive control should state its rules, as other world rules are stated, or stay implicit. Report the per-person award count next to any comparison.
- **Metrics**: awards per person, and outputs that refer to awarded events.

### 9h. The climate leaves little room for a developed capability

- **Problem**: a package can be correct and still unusable in the remaining window.
- **Evidence**: ex17's `hearth-food-preparation@1` (round 156) allows friction ignition only at rain ≤ 0.15. Under the frozen climate that is from about round 232, so the hearth had about 18 rounds of usable weather before round 250. Nobody cleared a hearth or tried friction fire: Wren mastered the package at tick 159 with rain at 0.85 and had no hardwood drill (`ordinary-167`), and Lin, who mastered it at tick 243, wrote that learning it did not mean it would light a fire.
- **Fix (proposed, not applied)**: none to the package. The handoff brief could ask the developer to report when, under the frozen climate, a weather-gated mode first becomes usable, so the report can separate "not used" from "not usable".
- **Metrics**: rounds between installation and the first usable round of each weather-gated mode.

### 9i. The revised G2 adoption counts over-count in long runs

- **Problem**: the adoption lists behind the revised G2 (section 8a) mix in items that are not adoptions.
  - A rule adoption pairs the closest earlier wording, which can be a private note the adopter never saw, with a receipt of any spoken expression of the same idea.
  - Phrase propagation accepts status reports and pleasantries that reuse another person's sentence frame.
- **Evidence** ([review item A](run-report-culture-v2-extension.md#review-item-a-sharing-reuse-and-saying-sample-extended-runs), seed 20261126):
  - 4 of 8 sampled sharing expressions are real, against 6 of 8 at round 80; the misses are mostly per-meal quantities such as "only three" or "a modest portion" in private notes.
  - 1 of 5 sampled reuses is real, against 2 of 5.
  - 0 of 5 sampled adopted sayings is a saying.
  - Every rule adoption listed after tick 80 (3 in ex16, 5 in ex17) takes its wording from a private note or intention and its receipt from Kai's tick-1 tell.
- **Impact on G2**: each run still has at least one clear adoption, so no revised G2 pass depends on these errors:
  - ex16: "room to come and go", Lin to Moss at tick 22;
  - ex17: the sign name `Earth's Quiet Gold` and the "needn't make every moment into work" saying;
  - ex18: Moss's take-one-and-leave-the-other reply to Kai at tick 20.

  The counts at round 250 are upper bounds.

- **Fix (proposed, not applied)**:
  - Require the closest wording of a rule adoption to come from a text the adopter received.
  - Exclude clauses that report an inspection, trial or eating result from adopted sayings.
  - Require a mention of other people before a quantity counts as `take-moderately` (the second proposal of 7h).
- **Metrics**: precision on a fresh fixed-seed sample of each list.

## 10. Experiment A: newly exposed problems

Experiment A extended ex16 from round 250 to 400 ([PR-43](../exec-plans/completed/pr-43-a-winter.md), [run report](run-report-a-winter.md)).

### 10a. Window-bound analyses missed nested windows and the history of their time

- **Problem**: the window check of 9c matched an analysis only against the files that one extension preserved. An analysis written after an earlier extension also binds the earlier preserved copies and `window-history.json` as it was then, and the next extension appends to that history.
- **Evidence**: after ex16 was extended past round 250, `pnpm analysis:check` failed on `pr-42-culture-v2-extension`. Its 1,006 artifacts include `windows/through-80/*`, `windows/through-150/*` and a two-entry `window-history.json`.
- **Fix (applied)**: `windowMaterial` now adds the earlier windows' preserved copies, which stay at their own paths, and the history file rebuilt from the earlier entries exactly as `continuousAtomic` wrote it (`scripts/analysis-window.test.ts`).
- **Metrics**: `pnpm analysis:check` passes with ex16's round-80, round-250 and round-400 analyses.

### 10b. The pressure that A was meant to observe barely starts within the window

- **Problem**: the culture scenario's pressure ramps from tick 300 to full at tick 440, and the season label reaches winter only at tick 600. A 400-round window shows the onset, not a hard season.
- **Evidence**:
  - At tick 400 the intensity is 0.714: cold +1.07 °C and plant growth 0.714.
  - Mean body temperature fell from 28.6 to 25.4 °C, out of the too-warm range, and thermal comfort rose from 0.865 to 0.992.
  - No injury, no death and no mention of cold.
- **Fix (proposed, not applied)**: to observe scarcity and cold, extend to at least round 600, where pressure is full from 440, or start a run with an earlier `pressureStart`. Either is a user decision.
- **Metrics**: body temperature, satiety and deaths per 25-tick block.

### 10c. Evidence-free transport failures keep recurring

- **Problem**: see 9a.
- **Evidence**: two more `fetch failed` pauses in A: rounds 282 and 365, 117–124 ms, no response. Each was closed by an empty handoff.
- **Fix (proposed, not applied)**: as 9a.
- **Metrics**: 3 such pauses in ex16 since round 99.

### 10d. The annotation over-labels invitations

- **Problem**: the model labels a general wish for company as an invitation even after the definitions were tightened.
- **Evidence**: 1 of 6 invitation labels in ex16 was verified (the round-51 meeting). The other five are "I'd enjoy resting together" without a place or time.
- **Fix (proposed, not applied)**: require a place, time or named activity in the schema (an `invitation` field), or verify invitations against `invited` events only.
- **Metrics**: invitation precision on the next verified sample.

## 11. Experiment B: newly exposed problems

Experiment B ran three seed pairs of the old-goal and open-goal arms, ex19–ex24 ([PR-44](../exec-plans/completed/pr-44-b-goal-pairs.md), [run report](run-report-b-goal-pairs.md)). 11d–11g are applied fixes or process rules now in force; 11a–11c and 11h are proposals.

### 11a. A rejection stop ended ex21 at round 44

- **Problem**: the culture v2 recovery stops a run for review after three consecutive rejected outputs (`rejectionRecovery.stopAfter: 3`), and `repair` refuses to resume it by design. A person who keeps omitting one required plan field therefore ends the whole run.
- **Evidence**:
  - Moss's `ordinary-137`, `-138` and `-139` at tick 44 of ex21 were rejected with "Expected the registered task plan shape."; each omitted the required `preferences` field. The lead did not bypass the stop, so ex21 covers 44 of 80 rounds.
  - Two-rejection pauses of the same kind came earlier: ex19 rounds 39 (Lin) and 50 (Kai), ex21 round 20 (Lin).
  - 29 of B's 32 rejected outputs were this error, and all 29 omitted `preferences`: 23 in the old-goal arm (24 rejected of 445 ordinary calls) and 6 in the open-goal arm (8 of 375). In ticks 1–80, ex15 had 8 rejected of 147, ex16 4 of 140, ex17 0 of 110 and ex18 3 of 151.
- **Fix (proposed, not applied; a scenario change)**: in a new run version, either accept an omitted `preferences` as an empty list, or return the validation message to the person in the next decision's input. Either change must not apply to B's archives, whose inputs are frozen.
- **Metrics**: rejected outputs per ordinary call, the share that omit `preferences`, and rejection stops per run.

### 11b. The token budget ended ex19 at round 76

- **Problem**: B fixed the hard token budget at 1,500,000 per run (R2). A run with many calls exhausts it before round 80.
- **Evidence**: ex19 stopped at round 76 with 1,463,499 tokens on its ledger, because the frozen budget could not reserve the next complete attempt. It made 176 calls (161 ordinary, 15 World Agent). ex23 reached round 80 with 1,410,016 tokens and 179 calls. The open-goal runs used 1,011,619–1,140,358 tokens.
- **Fix (proposed, not applied; a user decision for the next allocation)**: size the budget from measured usage, for example the largest B ledger at round 80 plus one attempt's reservation, or report a run that stops on its budget separately from runs that complete their window, as this report does.
- **Metrics**: ledger at the last round, and rounds reached per run.

### 11c. `repair` can start while a pause capture is still running

- **Problem**: after a technical pause, the develop process captures the paused archive's screenshots. If `repair` starts before that capture finishes, the capture fails.
- **Evidence**: at ex21's round-20 rejection pause, the capture failed with "Invalid or unfinished continuous archive". The retained `technical-pauses/round-20/recovery.json` records `captureStatus: running`. The simulation was preserved, and the final capture of round 44 ran normally.
- **Fix (proposed, not applied)**: let `repair` refuse, or wait, while the latest pause's capture is still running.
- **Metrics**: technical pauses whose `captureStatus` is not `completed` (1 in B).

### 11d. Permission denials and the rules that followed

- **Problem**: the permission system refused two writes. One was the implementing agent's new source file for ex23's watering handoff, which paused that handoff. The other was the lead's brief in a newly created worktree, `sew-lab`. The user said neither denial was intended.
- **Evidence**: the ex23 handoff resumed under a scope the user narrowed (see the [run report](run-report-b-goal-pairs.md#handoffs)). `sew-lab` (branch `tmp/b-labels`) was used only to label ex19–ex22; its results were moved into the B worktree, and it is no longer used.
- **Fix (applied as process rules by the user)**: no new worktrees; test a target location with a harmless file before writing there; report a denial with its full path and message, without a workaround.
- **Metrics**: denials per experiment, and workarounds after a denial (none should occur).

### 11e. A zsh loop passed an empty seed

- **Problem**: an earlier labeling loop relied on word splitting of an unquoted variable, which zsh does not do by default. The `--seed` argument was empty.
- **Evidence**: that run made no model call. The lead re-ran it with explicit seeds, and each label directory's negative sample now records the archive's own seed (20261201–20261203 for B, 20261123 for the references).
- **Fix (applied)**: one explicit command per label run instead of a word-split loop.
- **Metrics**: label directories whose `negatives-sample.json` seed differs from the archive seed (0).

### 11f. Handoffs need hooks in shared runtime modules

- **Problem**: some B packages could only work through hooks in shared runtime modules, which every archive replays.
- **Evidence**: ex21 `small-combustion-source` (`forest-environment`: warmth and burns), ex22 `sleep-in-place` (`open-experience`: the routine list), ex23 `rooted-plant-watering` (`open-physical` `openConditions`: root-zone water), ex24 `prepare-ventilated-food-storage` (`forest-environment`: a decay multiplier of 0.8, the specification's declared coefficient) and ex24 `construct-weather-shelter` (`forest-environment`: exposure). The ex19 lever comparator was refactored into a factory.
- **Fix (applied)**: each hook is gated on its own package revision, so it changes nothing in a world that has not installed the package. Every archive, ex7–ex24, replays byte-identically on the merged code.
- **Metrics**: compatibility digests of ex7–ex24 after each merge (all identical).

### 11g. A subagent wrote to `/tmp/null`

- **Problem**: temporary files outside the worktree can collide across agents.
- **Evidence**: a subagent briefly wrote `/tmp/null` and deleted it. That also removed an older `/tmp/null` left by the D subagent.
- **Fix (applied as a brief rule)**: temporary files go only in the worktree's git-ignored `validation-results/scratch/`, never in `/tmp`.
- **Metrics**: files written outside the worktree during an experiment (none should occur).

### 11h. The annotation ledger total was overstated after A

- **Problem**: the experiment A report and the PR-43 results give the annotation ledger after A as 31,004 tokens, which counts the two calibration calls twice. A share computed from that figure understates B's annotation cost.
- **Evidence**: before B, the six calls in `labels/ledger.json` sum to 23,408 tokens: 7,596 for the two calibration calls and 15,812 for the four ex16-1-400 batches. B's 14 calls sum to 45,466, and the ledger now stands at 68,874.
- **Fix (proposed, not applied)**: correct the A figure, and take ledger totals from the file with a command rather than by hand.
- **Metrics**: report figures that differ from the ledger file's sums (0).

## Limitations

- Fixes 2–4 are turned on together in E1, so one run cannot separate their effects causally; section 5 attributes them by mechanism only. Each switch can be turned on alone; a short run with only `plan-horizon` would show its effect on decision frequency.
- The effect of fix 2 is an offline estimate. Fixes 3 and 4 are prompt guidance; only a new run shows whether agents follow it.
- The bound-interface rule is lexical. It counts an interface named after a person but generic in function as general, and may miss bindings expressed only in code.
- **7c and 7f are left for later scenarios** (user decision before the extension). The cultivation site rule still keeps cultivators away from the commons clearing, and the `tell`, `name`, `mark` and `invite` schemas still allow longer text than their handlers accept. Both remain part of the extended ex16 and ex17 runs, whose genesis cannot change.
- The revised G2 (8a) was set after both runs had been seen. It is a judgment about what the gate should measure, not a pre-registered test, and the runs pass it on items that the review had already found.
- These fixes lower cost and raise capability reuse. They do not guarantee more interesting behavior; that depends on the next steps, the changes to the environment and incentives.
