# Ex9: final observed results

One real run reached **1,200 of 1,200 rounds**, covering 1.5 seasonal cycles. All three actors survived with their three original lives; no formal death or respawn occurred. Five new functional capabilities were requested, reviewed and implemented. Three were actually used by all three actors. Fire and rain-canopy mastery never became construction or benefit. One separate repair addressed an actual paid-operation failure.

[Behavioral analysis](../../../../experiment/analyses/ex9/pr-23-forest-experience.md), [generated report](../../../../experiment/ex9/report.md), [counting method](analysis-method.md) and [machine-readable measurements](formal-metrics.json) retain the distinctions and evidence. Open the local read-only ex9 replay after setup to seek the rounds below. Fixtures and all four no-model feasibility calibrations are excluded from formal behavior counts.

## Policy and cost

The frozen policy uses gpt-6.1-sol, seed 20261121, three actors, a 48 × 36 continuous forest, vision 5, 80-round days, an 800-round year, hunger 0.9, growth scale 0.85, weather exposure 0.6, carrying scale 1.2 and remote initial food stock scale 3. The latter was fixed before the first inference after three retained failed calibrations; there was no subsequent food gift or difficulty change. Checkpoints and stage reports exist at 200, 400, 600, 800, 1,000 and 1,200. The initial catalogue has 17 interfaces: 11 authored initial abilities and six ex8 interfaces requiring individual study.

| Role     | Attempts / limit | Failed | Known input tokens | Known output tokens | Summed call seconds |
| -------- | ---------------- | ------ | ------------------ | ------------------- | ------------------- |
| ordinary | 404 / 650        | 4      | 6928131            | 161305              | 4659.56             |
| world    | 7 / 60           | 1      | 81707              | 11498               | 386.45              |

The ordinary failure rate is 0.99%; the world failure rate is 14.29%. Four ordinary failures have unknown token usage: timeouts at rounds 18 and 453, a fetch failure at 150, and a response-stream error at 752. The world failure at 450 violated the bounded-output contract and retains known usage. All attempts count. The summed call durations are not total experiment wall time. Development used **13 of 20** current-conversation handoffs: ten accepted, three failed. Internal development model calls/tokens, preparation, review and monetary charges are **unknown, not zero**.

Ordinary frequency was 0.1122 attempts per actor-round (one per 8.91 actor-rounds), versus ex8's 0.1486 over its 897-round window. These differ in seed, rules, catalogue, budget and duration, so this is an exploratory comparison rather than a causal effect. Six executed requests over 3,600 actor-rounds comprise five new functions and one repair; the seven world attempts include one retry.

## Capability phases and actual benefit

| Function / request round               | Implemented boundary | Personal mastery                    | Formal execution                                               | Measured outcome                                                                                                             |
| -------------------------------------- | -------------------- | ----------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Portable insulation / 447              | source 2 at 447      | Moss 451; Sol 453; Lin 507          | Four mantles crafted; two paid repairs; three actual wearers   | 619 of 1,024 exposure measurements reduced cooling; same-round component sum 13.1144, not cumulative causal temperature gain |
| Local fire / 450                       | source 3 at 450      | Lin 456; Sol 553; Moss 570          | No tool, hearth, fuel or ignition action                       | No formal heat or fire satisfaction                                                                                          |
| Willow processing / 458                | source 5 at 458      | Lin 462; Sol 910; Moss 966          | 14 full strip/twist completions; one retained cancellation     | Real panels/cord entered mantle production and repair; bounded maintained tactile satisfaction                               |
| Rain canopy / 515                      | source 8 at 515      | Sol 520                             | No construction                                                | No formal rain interception or canopy benefit                                                                                |
| Recuperation / 777                     | source 10 at 777     | Lin 780; Moss 821; Sol 889          | 11 complete operations, 105 paid rounds                        | 25.8249 actual health restored, with additional paid costs and eligibility                                                   |
| Existing willow execution repair / 495 | source 7 at 495      | Existing mastery retained; no grant | Actual failed work retained; later work restarts/pays normally | Plan-independent operation identity; not a sixth discovered function                                                         |

Paid recuperation settles after injury, rather than preventing damage or resurrecting anyone:

| Actor | Paid rounds | Health restored | Extra energy charged | Extra satiety charged | Actual energy recovered |
| ----- | ----------- | --------------- | -------------------- | --------------------- | ----------------------- |
| lin   | 48          | 11.8517         | 24.0000              | 9.6000                | 37.2570                 |
| moss  | 41          | 10.1841         | 20.5000              | 8.2000                | 37.1064                 |
| sol   | 16          | 3.7891          | 8.0000               | 3.2000                | 18.2382                 |

These charges are additional to normal metabolism. Rest energy and recuperation energy are counted separately. Restoring health is a persistent state benefit; this experiment does not establish a counterfactual reduction in total future labor.

## Body, meals and mental state

| Actor | Final health / satiety | Minimum health / satiety | Mental min / max / mean | Monotony max / mean | Actual rest factor min / max |
| ----- | ---------------------- | ------------------------ | ----------------------- | ------------------- | ---------------------------- |
| lin   | 99.70 / 68.50          | 88.55 / 19.50            | -0.319 / 0.103 / -0.035 | 1.000 / 0.095       | 0.9536 / 1.0103              |
| moss  | 100.00 / 77.80         | 89.82 / 15.50            | -0.245 / 0.085 / -0.001 | 1.000 / 0.181       | 0.9645 / 1.0081              |
| sol   | 100.00 / 69.90         | 96.21 / 27.70            | -0.130 / 0.110 / 0.020  | 0.917 / 0.180       | 0.9815 / 1.0109              |

All final monotony values were zero. Actual rest recovered 4208.08 energy across 1,108 rounds. Three zero-recovery rests occurred with Moss already full of energy; no basic rest action failed because of mental state. Actual factors stayed well within the configured 0.85–1.10 bounds. Initial mental state was neutral; absence of a temporary source alone did not create low mood. Late Lin fern-root assessment at round 1,193 caused 0.3 health loss; the final 99.7 is retained rather than reported as full health.

| Actor | Successful eating events by actual resource identity            | Meal-experience events | Peak maintained willow source |
| ----- | --------------------------------------------------------------- | ---------------------- | ----------------------------- |
| lin   | root: 16; berry: 14; hazelnut: 13; tuber: 5                     | 47                     | 0.227                         |
| moss  | root: 21; berry: 9; hazelnut: 13; apple: 6; tuber: 2; walnut: 4 | 57                     | 0.154                         |
| sol   | root: 14; berry: 3; hazelnut: 12; plum: 10; tuber: 10           | 49                     | 0.151                         |

Eating-action counts, consumed quantities, meal-experience events and distinct ten-meal history episodes are different counts: small assessment samples can contribute to actual intake, and near or tiny portions merge before history/reward settlement. Nutrition is not multiplied by mood. The food repertoire remained gathered raw ingredients; there was no new cooking or preservation process. Meal quality and monotony varied, with modest negative mental excursions; they did not create a recovery spiral. Bounded pleasure, slow mental state and maintained satisfaction remain separate measured fields.

## Action allocation and failures

| Action              | Actor-rounds | Share of 3,600 |
| ------------------- | ------------ | -------------- |
| navigate            | 1336         | 37.11%         |
| rest                | 1108         | 30.78%         |
| active-warming      | 381          | 10.58%         |
| eat                 | 152          | 4.22%          |
| assess-food         | 143          | 3.97%          |
| gather              | 118          | 3.28%          |
| recuperate          | 105          | 2.92%          |
| wait                | 67           | 1.86%          |
| observe-wildlife    | 59           | 1.64%          |
| process-willow      | 51           | 1.42%          |
| portable-insulation | 33           | 0.92%          |
| learn               | 20           | 0.56%          |
| message             | 9            | 0.25%          |
| build-shelter       | 6            | 0.17%          |
| request             | 6            | 0.17%          |
| drop                | 3            | 0.08%          |
| inspect-route       | 2            | 0.06%          |
| give                | 1            | 0.03%          |

Navigation, rest, eating, gathering and active warming total 3095 actor-rounds. This is an activity classification, not a causal survival-work estimate: navigation also served exploration and projects. Learning progressed for 88 actual actor-rounds; some appear as wait actions, so wait is not equivalent to idleness. Repeated warming/rest and movement still dominate. No matched strategy establishes that new equipment reduced total maintenance labor.

There were **10 pre-action reference invalidations**, and **23 failed execution events**: 18 navigation goal-overlap failures, one bounded navigation search failure, three wildlife observation failures after the animal was unavailable, and the actual round-495 missing-reference failure. Reference rejection protected against substitution and overspending but still incurred decisions. Nine successful messages and one material transfer occurred; **zero ordinary decision reasons were message-triggered**. The shared-operation repair reproduced the real round-495 failure; no later willow continuation failure appears. Isolated ex8 repeat regressions are not evidence that every repeated formal action was semantically desired; successful intentional repetition and inefficient repetition remain distinguishable only with the saved plans/events.

## Replay landmarks

- **35–96:** real messages lead to Moss's eight-grass transfer at 71, Lin's paid shelter at 74–79 and two actors using its interior. All 22 actual shelter exposure measurements show zero avoided cold, because use occurred in warm conditions. Its cover expired at 239.
- **447–519:** actual cold and material shortages lead to reviewed insulation and willow processing, then paid learning, processing and three mantle completions. Lin's interruption at 495 is a real retained failure, not a fixture success; its later restart preserves the paid loss.
- **638–639, 681, 721–745:** Sol repairs the same mantle; Lin drops its worn 2.2-mass mantle; Sol enters the cave through the real entrance and uses its thermal buffer. These simple adaptations are valid outcomes without inventing a complex facility.
- **820–905:** all three actors pay for recuperation after independently learning it, restoring measured health. Fish sampling hurts Lin at 986; paid recuperation at 1,017–1,018 restores that 0.4 loss.
- **916–930:** Sol processes actual willow, consumes its panels in the original mantle's second repair at 926–927, and twists the remaining bast. Persistent item identity and input provenance make the benefit traceable.
- **971–982, 1,160–1,185:** Moss processes two sets of actual willow materials and finally completes a new mantle at 1,185. This late extension of the material chain was retained rather than ending the report at the earlier check-in.
- **1,191–1,200:** Lin's adverse fern-root assessment reduces health by 0.3. All actors remain alive; active warming, rest and food acquisition still shape their plans. No hidden rescue or second trial occurred.

Recurring wildlife observation and tactile processing are voluntary experiences, but do not prove persistent personality, complex entertainment or long-term social relationships. Public catalogue adoption by other actors is cross-actor reuse, not evidence of social teaching or consent to an unperformed interaction.

## Version boundaries and limitations

Eleven source revisions activate at rounds 0, 447, 450, 451, 458, 478, 495, 515, 689, 777 and 974. The original calls, cursor-free segments, cursor-bearing authoritative segments, checkpoints and source snapshots remain. Each activation passed the full prior world/event/cursor reconstruction. Three failed handoffs remain counted: missing replay cursor at 86 discovered at the 447 gate; a 103-round replay fixture timeout resolved by reducing irrelevant scene size without increasing timeout; and a duplicate assignment-duration adapter check at 495 synchronized with the existing-master-only rule.

Four pre-inference input-limit pauses at 451, 478, 689 and 974 retain complete captures. Reversible shared values/tables/record shapes and profitable nested sharing preserve every fact under the unchanged 120,000-byte cap, but changing representation may still change model interpretation. More growth can still pause. The paid-operation failure and protocol repairs are experimental limitations, not invisible cleanup. User-authorized world extensions do not amount to policy retuning; no initial environmental or reward coefficient changed after the first call.

The next most useful experiment is a preregistered comparison of free-form notes versus a structured persistent project record with matched world policy, seeds and budgets. Measure actual project resumption, abandoned paid work, useful execution and later cost/health outcomes, without prescribing projects or rewarding requests. This would help distinguish forgetting from rational avoidance of costly fire/canopy projects. It is a recommendation only; no follow-up was run.
