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

### 7b. The per-person symbolic condition fails on people who work alone

- **Problem**: G2 requires at least one symbolic action from every person. A person who works away from the others, or who chooses to remain silent, fails it for the whole run.
- **Evidence**:
  - In ex16, Wren made 0 symbolic actions (others 3–10). She worked about 12 units from the others' clearing and heard 6 utterances.
  - In ex17, Lin and Wren made 0 (others 4–7). Both spent their time on cultivation: `plant-cultivation` 8 and 6 rounds. They ended at (22.0, 14.0) and (19.4, 8.5), while Moss, Sol and Kai ended near (18, 19).
  - In ex15, which passed G2, every person used `tell` at least once, but nobody used `name`, `mark` or `invite`.
  - Across the three runs, the only symbolic actions besides `tell` were one `invite` (Moss, ex16) and one `name` (Sol, ex17).
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
  - In ex17, the handoff test showed that Wren's own position was forest ground, where planting is refused.
- **Fix (proposed, not applied)**: none is required by the rules. If 7b is addressed through the scenario, measure how far cultivators are from the others before changing the site rule.
- **Metrics**: distance of cultivators from the group centroid, and refused versus accepted planting attempts by location.

### 7d. `repair` resumes a transport pause before the server's retry-after

- **Problem**: `repair` resumes the run immediately, so the next call can hit the same overload.
- **Evidence**: at ex16 round 2, `ordinary-19` failed with `server_is_overloaded` and retry-after 327 s. The repair resumed about 30 s later. One call succeeded, and `ordinary-21` failed again 40 s after the first failure, with retry-after 348 s. Under the user's rule, the second recovery waited 1,336 s and the run then continued without further transport errors. The [run report](run-report-culture-v2.md) has the full log.
- **Fix (proposed, not applied; a protocol change for a later run version)**: read `retry-after` from the retained failure evidence and refuse to resume before it has elapsed, plus a margin. Each recovery would record its wait.
- **Metrics**: transport failures within one retry-after window of a previous recovery (1 in ex16), and recoveries per 60 minutes.

### 7e. The ex13 Ashen recording test runs at 85% of its CI timeout

- **Problem**: the browser test that records ex13 playback has a 120 s limit and passes in about 1.7 minutes on CI. It failed on the first attempt of both PR #32 and PR #33, stopping at exactly 120 s, and both reruns passed. This follows the user's rule for this timeout, given before PR #29: rerun first, then compare durations, then raise it to 180 s.
- **Fix (applied in this PR)**: `test.setTimeout(180_000)` for that test only, with its assertions unchanged.
- **Metrics**: first-attempt failures of this test on later PRs (2 of 2 before), and its CI duration.

## Limitations

- Fixes 2–4 are turned on together in E1, so one run cannot separate their effects causally; section 5 attributes them by mechanism only. Each switch can be turned on alone; a short run with only `plan-horizon` would show its effect on decision frequency.
- The effect of fix 2 is an offline estimate. Fixes 3 and 4 are prompt guidance; only a new run shows whether agents follow it.
- The bound-interface rule is lexical. It counts an interface named after a person but generic in function as general, and may miss bindings expressed only in code.
- These fixes lower cost and raise capability reuse. They do not guarantee more interesting behavior; that depends on the next steps, the changes to the environment and incentives.
