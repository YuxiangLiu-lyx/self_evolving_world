# Ex10: Fresh cumulative development — measured results

One real observation ended at **358 of 1,600 target rounds**. All three actors
were alive at health 100. The unchanged input guard stopped inference when
Moss's encoded observation reached 60,062 characters: 120,124 bytes under the
runner's UTF-16 accounting, above its 120,000-byte limit. All **20 development
attempts** had already been used. No budget was extended, policy changed, rescue
provided or replacement experiment run. The retained world is paused, not ended.

This is evidence of some accumulated knowledge and reusable mechanisms, but not
of sustained open-ended development. The window covers spring and summer, not a
complete 800-round seasonal cycle or the intended two cycles.

## Baseline and provenance

The [configuration](../../../../experiment/ex10/configuration.json) fixes
`gpt-6.1-sol`, seed 20261122, three actors, continuous 48 × 36 forest, vision 5,
hunger cost 0.9, three lives, a 1,600-round target and budgets 650 / 60 / 20.
`inheritSkills=false` and scope `open-ex10` isolate the registry, learning,
objects, rewards, pending work and extension state. The 14 authored interfaces
are **navigate, rest, wait, pickup, gather, eat, drop, give, message, request,
learn, probe, consult and exchange**. Initial safe berry/root knowledge and the
foundation environment are also authored, not discoveries. Only the two
foundation packages are initially installed. Ex8/ex9 generated skills are
absent from registration, retrieval and personal mastery in this fresh world.

The source retains older implementations for their historical replay. Generic
reference resolution, operation continuity, experience and environmental code
are reused. Ex10 development composes its own earlier mechanisms; these are
implementation dependencies, not independent reinventions. Neither the assay
fixture's enlarged tray nor any test recipe, supplied water or scripted route
was injected into ordinary-agent context. Fixtures prove executability only.

The exact launch baseline's no-model 1,600-round feasibility check had no deaths
or failed actions; first food was obtained in rounds 5–6. Its omniscient
controller spent 75.31% of actor-rounds waiting. This is an existence proof, not
an agent performance prediction. A separate post-launch 10,000-round diagnostic
[failed at round 3,967](fresh-10000-round-stress.json) when Moss lost a life.
Its unchanged scripted controller and ecology are confounded. It provides no
long-horizon survival certificate and did not alter the formal policy.

## Representative evidence chains

Replay references identify settled rounds. A request reviewed at the end of a
round can appear as the following round's committed action; review-boundary
numbers and action numbers are not different attempts. Use the local replay's
timeline and event panel, or the bound replay segments below.

| Problem and request                                                                                 | Implemented and learned                                                             | Actual execution and consequence                                                                                                                                                                                                                                       | Limit                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sol's plum trial did not establish food usefulness; request at 14, then a measurement request at 18 | Personal tissue examination, followed by a costed gravimetric precursor             | Examination at 18; balance built at 65–73 and tray at 77; 0.8-unit plum sample started at 83, paid readings at 84/87                                                                                                                                                   | Spoilage at 87 invalidated the sample at 88; stopped at 89. No successful safety or nutritional assay                                                       |
| Lin sought a workable material after bark inspection remained unknown                               | Woven-support material tests, then finite water access after the request at 194     | The original round-78 vine specimen received 10 ml at 205; the remaining 0.5 energy was paid at 206 and its comparison completed, recording safe working load 74.05                                                                                                    | A real 128-round interrupted-project resumption; no completed woven apparatus or productivity gain                                                          |
| Moss sought stable refuge after hardness/contact tests                                              | Paid metrology and shelter prototypes; short refuge was a smaller subsequent design | Actual spans measured at 123 and 149. Cover trial 184/185 passed its first load but slipped 0.045 at the second, above the 0.02 limit. Paid diagnosis at 210 retained the failed predicate                                                                             | Failure produced useful bounded evidence without certifying the refuge. No formal completed shelter or beneficial shelter rest                              |
| Sol sought reduced deterioration, request at 145                                                    | Three rounds of personal study, preparation using the actual small assay tray       | Prepared 0.1 berry at 169–170. Reading at 171 showed accumulated actual decay 3.394 versus ambient reference 3.127; at 176 actual 9.460 versus reference 11.018. Readings/preparation paid 2.4 energy                                                                  | A tiny real sample eventually deteriorated less over the measured interval; not safe nutrition, household supply or permanent preservation                  |
| Sol independently tried the public short-refuge capability                                          | Personal learning, separate retained material trials                                | Trials at 225/226 and 275/278 failed actual slip limits; 276/277 used invalid operation references before successful resumption                                                                                                                                        | Same-run reuse is real, but use did not produce a usable structure                                                                                          |
| Sol revisited unknown tuber usefulness at 330                                                       | A bounded extraction precursor with explicit personal prerequisites                 | Learned this world's water capability at 334, studied the extraction precursor and inspected it. Formed a cup at 353–355 from 0.6 kg clay: 0.5 kg cup plus 0.1 kg retained surplus. Picked it up at 357 and withdrew 80 ml at 358; 79 ml remained after actual leakage | Prerequisite composition, manufacture and use are real. No formal extraction was prepared or completed, and no long-term water-storage benefit was observed |
| Lin's known food sources were depleted and satiety fell                                             | Basic authored eating, not a new generated skill                                    | Small hazelnut ingestion at 351 yielded 1.8 satiety and observed nutrition/toxicity facts; 0.7 units at 352 yielded 12.6. At 353 Lin sent Moss the actual result and dated resource information                                                                        | Microportions did not independently earn substantial-meal diversity credit. Recipient adoption/benefit was not observed before the pause                    |

Evidence: [rounds 0–100](../../../../experiment/ex10/replay/execution-000000-000100.json),
[100–200](../../../../experiment/ex10/replay/precision-000100-000200.json),
[200–300](../../../../experiment/ex10/replay/execution-000200-000300.json),
[300–358](../../../../experiment/ex10/replay/execution-000300-000358.json),
[measurements and event aggregates](../../../../experiment/ex10/results.json).

The final extraction implementation conserves actual tissue, water and material
lineage, progresses persistent contact/drying after departure, and supports
pause/cancel/death without duplicate charges or pristine refunds. Its porous
cups and unresolved contamination make quantitative extractability inconclusive
in this version. Only isolated fixtures exercise the complete two-arm procedure;
those fixtures deliberately use a larger tray. They do not establish that Sol's
actual small tray can execute that procedure. No toxin-safety conclusion exists.

## Survival, activity and experience

| Actor | Final health / satiety / energy | Minimum satiety | New personal mastery events | Final slow mental state | Final diet monotony |
| ----- | ------------------------------- | --------------- | --------------------------- | ----------------------- | ------------------- |
| Lin   | 100 / 14.9 / 20.960             | 7.7             | 5                           | 0.02406                 | 0                   |
| Moss  | 100 / 28.5 / 23.636             | 26.3            | 9                           | 0.02803                 | 0.14286             |
| Sol   | 100 / 69.8 / 29.529             | 42.3            | 10                          | 0.03509                 | 0.42857             |

No death or revival occurred. Lin's health does not imply secure future supply.
Of 1,074 actor-rounds, 390 were navigation, 273 rest, 54 gathering, 57 eating,
49 waiting and 3 pickup: 76.91% combined. Some navigation served projects; this
is not a causal estimate of compulsory subsistence. There were 28 failed action
rounds (2.61%). Ongoing or stalled successful work rounds are not completed
operations: the woven work spent many such rounds awaiting real water.

There were 14 capability-request action attempts, including one failed personal
prerequisite execution after approval; 14 functional world approvals, 15
implemented interface entries and 24 personal mastery events. Diagnostics,
project archival and alternative design upgrades are included in that catalogue;
15 entries do not mean 15 independent inventions. Actual usage, completion and
benefit are separate event types. The apparatus, altered trial material, a cup
and knowledge persisted. No completed shelter, shared-facility benefit or broad
reduction in repetitive production cost was demonstrated.

Successful eating occurred in 50 rounds: Lin consumed root in 6, berry in 8 and
hazelnut in 2; Moss root in 5 and berry in 13; Sol root in 14 and berry in 2.
There were 46 substantial meal events. Mean happiness remained 8.16 / 8.62 / 8.75
out of 100; it must not be confused with the separate slow mental state.
Across 273 rests, actual recorded mental recovery multipliers ranged from
1 to 1.004134. Recorded positive energy bonuses summed to only 2.6042; capped
rest gains make mean recovered energy unsuitable for isolating mental effects.
There were 24 information-confirmed, 11 practice-confirmed, 29 satisfaction and
35 maintenance events. Naming, registration and mastery alone earned no reward.

Eleven messages were sent (Lin 7, Moss 4); no message-triggered decision reason
was recorded. There were no item handoffs or accepted structured finding
exchanges. Plain factual messages still occurred. Sol learned and used public
capabilities originating with other actors, but there was no observed joint
construction, entertainment, art or animal management. Absence in 358 rounds is
not evidence of impossibility.

Authored ecology produced 23 seed dispersals, 12 established plants, 8 feeding
events and 7 animal alerts. These were code-driven ecology, not agent farming.
After drought onset at 260, Lin was within its radius in 9 rounds and Moss in 3;
the onset ramps from zero, and proximity alone does not establish causation.
Waterlogging, scheduled from 520, was not reached. Formal animal reproduction,
injury/death, mature cultivation and multi-generation maintenance remain unobserved.

## Model, context and development cost

| Role                 | Attempts / cap | Accepted / failed | Reported input / output tokens | Sum of call latency                 |
| -------------------- | -------------- | ----------------- | ------------------------------ | ----------------------------------- |
| Ordinary             | 209 / 650      | 208 / 1           | 3,715,291 / 108,780            | 2,745.663 s                         |
| World                | 15 / 60        | 14 / 1            | 214,448 / 22,767               | 765.431 s                           |
| Development handoffs | 20 / 20        | 19 / 1            | Not directly metered           | Internal model latency not measured |

Known reported tokens total **4,061,286**, excluding the failed ordinary fetch
whose usage is unknown. The malformed world response at round 100 consumed
14,686 input and 2,311 output tokens; the failed ordinary fetch at 202 remains
counted. Failure rates were 0.48% ordinary and 6.67% world. Ordinary frequency
was 0.1946 calls per actor-round, or one attempt per 5.14 actor-rounds. Summed
model latency is 58.52 minutes, not wall time. Development work inside this
conversation has no reliable token/call/monetary meter; handoff count is a
partial cost measure and must not be presented as total development cost.

Nine accepted decisions corrected ambiguous/unavailable/insufficient references;
11 failed action events explicitly report reference errors. The actual shelter
prefix errors and later wrong operation IDs are retained. No duplicate-charge
or duplicate-refund event was found in the inspected traces; this is not a
proof that every generated mechanism is free of execution bugs.

Five accepted technical repairs at rounds 114, 123, 149, 200 and 210 preserved
lossless inputs and the executed prefix. A separate declaration failed and still
consumed its development attempt. Fourteen accepted functional handoffs plus
these five technical repairs account for 19 accepted handoffs. Source revisions
1–20 and original pause/capture failures are retained. The final stop at 358
permits no sixth repair under the original budget.

At the stop, plain inputs were 94,633 / 107,813 / 106,135 characters and encoded
inputs 54,933 / 60,062 / 59,349 for Lin / Moss / Sol. Catalogue, personal memory
and detailed observations grew despite a four-detail catalogue window and
bounded project/knowledge summaries. Wire compression delayed the problem but
did not bound total semantic context. No inference was made with the offending
input and no hidden truncation occurred. Earlier successful ordinary input
reached 59,937 encoded characters. Character accounting is not provider token
accounting. Raw requests, responses, usage and errors remain in the archive.

## Interpretation and next experiment

Ex10 supports a narrow claim: fresh actors can pose and test concrete questions,
retain altered materials and projects, resume old work, and personally learn
and compose mechanisms originating in their own world. It does not demonstrate
a sustainable innovation rate, communal production, broad labor savings or
civilization. Most novelty remained metrology and subsistence-related; a large
amount of paid effort failed to produce serviceable equipment.

Ex9 reached 1,200 rounds with inherited ex8 skills, 404 ordinary attempts and
13 development attempts. Ex10 changes initial skills, ecology, prompts and
observation length together. This exploratory comparison cannot attribute the
outcome to fresh isolation or any single motivation mechanism.

The highest-value next experiment is a separately preregistered fresh run with
**a genuinely bounded, on-demand capability and evidence context**, tested on
large synthetic catalogues before launch. Keep the same budgets and distinguish
retrieval misses from reasoning failures. Verify at least a complete season,
project recovery and real post-investment cost before claiming improved
accumulation. This is a recommendation only; ex10 is not resumed or retuned.
