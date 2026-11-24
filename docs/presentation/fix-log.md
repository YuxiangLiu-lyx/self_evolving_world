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

## Limitations

- Fixes 2–4 are turned on together in E1, so one run cannot separate their effects causally; section 5 attributes them by mechanism only. Each switch can be turned on alone; a short run with only `plan-horizon` would show its effect on decision frequency.
- The effect of fix 2 is an offline estimate. Fixes 3 and 4 are prompt guidance; only a new run shows whether agents follow it.
- The bound-interface rule is lexical. It counts an interface named after a person but generic in function as general, and may miss bindings expressed only in code.
- These fixes lower cost and raise capability reuse. They do not guarantee more interesting behavior; that depends on the next steps, the changes to the environment and incentives.
