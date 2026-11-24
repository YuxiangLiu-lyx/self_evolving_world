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

## Limitations

- Fixes 2–4 are turned on together in E1, so one run cannot separate their effects. Each switch can be turned on alone; a short run with only `plan-horizon` would show its effect on decision frequency.
- The effect of fix 2 is an offline estimate. Fixes 3 and 4 are prompt guidance; only a new run shows whether agents follow it.
- The bound-interface rule is lexical. It counts an interface named after a person but generic in function as general, and may miss bindings expressed only in code.
- These fixes lower cost and raise capability reuse. They do not guarantee more interesting behavior; that depends on the next steps, the changes to the environment and incentives.
