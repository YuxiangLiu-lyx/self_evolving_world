# ex5: Behavioral Analysis

Reviewer: Current Codex conversation; non-independent semantic and visual review. Task: pr-16-heterogeneous-evolution. Recommendations are analysis only; no world, prompt or agent change is authorized by this report.

## Summary

The real gpt-6.1-sol run reached 120 synchronous rounds with four comparable actors in different regions. All died: Moss at round 55, Sol at 64, Reed at 85 and Lin at 102; rounds 103-120 contain only inert dead actors. There were 140 completed provider responses: 115 ordinary and 25 world attempts; 135 accepted decisions, three parser rejections and two conversation development handoffs. There were no transport failures. Two empty ordinary programs were rejected and produced the documented one-round wait fallback. The first world output used an invalid camelCase parameter identifier; its bounded retry succeeded.

The shared registry grew from six to nine resource types, zero to seven executable mechanics/skills, and zero to four ecological rules. Twenty-three existing sites received permanent assignments. Three previously undefined types were silver river fish, amber tree fruit and oval tree leaves. Four of seven implementations were successfully used; only tree fruit and fungus extraction yielded additional food. This is real demand-driven expansion within authored primitives, not unrestricted physics or proof of survival competence. The 12-round smoke and all-wait control are explicitly deterministic offline tests. No condition or kernel change rescued this run.

| Actor | Death round | Ordinary calls | Visited cells | Food units / nutrition | Learned skills | Successful uses |
| --- | --- | --- | --- | --- | --- | --- |
| Lin | 102 | 35 | 68 | 8 / 124 | 3 | 21 |
| Moss | 55 | 23 | 27 | 2 / 30 | 5 | 9 |
| Sol | 64 | 25 | 45 | 3 / 48 | 3 | 8 |
| Reed | 85 | 32 | 57 | 5 / 90 | 5 | 11 |

All four lived beyond the offline no-action death round 40. That comparison changes every behavior at once and is not a causal estimate of skill-learning benefit. The archive reconstructs 121 snapshots and 480 round intents; only 306 intents occurred while actors were alive. Dead-actor wait intents must not be counted as model idling.

## Per-agent findings

### lin

Lin initially asked for conditional identification, harvesting and eating; this was rejected because the operation language cannot branch on newly identified safety. Lin then learned examination and eating, collected two berries and consumed them at rounds 9 and 15. It autonomously requested reachable tree-fruit gathering at tick 24; the world created amber fruit and a forest distribution. It harvested four fruits, consumed them at rounds 29, 35, 46 and 47, and later ate two remote mushrooms at rounds 54-55. It explored 68 distinct cells and first saw Sol at round 23. Satiety reached zero at round 92; ten starvation penalties in rounds 93-102 caused death.

The longest survival coincided with access to forest fruit and two remote mushrooms, not superior performance established by a controlled comparison. Lin consumed the last tree-13-16 fruit at round 30 while Sol finished learning the same capability nearby. Later it crossed sparse grass/rock terrain, returned to empty forest sites and attempted unsupported emergency browsing. Two real development pauses at ticks 99 and 100 resulted in explicit rejections; no new primitive, food or game tick was introduced during review. The only living wait was the fallback after an empty final program, not prolonged idle behavior.

Evidence: [experiment/ex5/model-calls.json#lin-ticks-0-101](../../../experiment/ex5/model-calls.json), [experiment/ex5/execution.json#developments](../../../experiment/ex5/execution.json), [experiment/ex5/results.json#actors-lin](../../../experiment/ex5/results.json).

### moss

Moss collected the bank berry before learning examination/eating and consumed it at round 9. Its autonomous tick-13 bank-fishing request created a new fish type, river distribution and a four-round skill. The local water-27-10 assignment was zero; after completing learning at round 17 it left for the forest without attempting fishing. At round 38 it harvested the last fruit at tree-15-8, examined it while starving at round 39, then ate at round 40. Later fruit attempts failed on empty sites. Emergency cambium and metabolism requests were rejected. A fallen-berry extraction implementation was registered at round 53, but there was no suitable site stock. Moss died at round 55 with five learned skills and only two meals.

This is the clearest capability-versus-utility mismatch. Fishing was plausible but offered no local yield, and learning spent four game rounds. The additional berry skill was executable only in a state that never occurred: initial berries were ground stacks, not natural-site berry stock. Registration did not create a usable food source. Late inspection and learning consumed the remaining survival window. These are documented opportunity costs and scarcity, not evidence that skill registration alone improves survival. Moss never waited while alive, never consumed fish and never encountered another actor in vision.

Evidence: [experiment/ex5/model-calls.json#world-ticks-13-53](../../../experiment/ex5/model-calls.json), [experiment/ex5/skills.json#hand-catch-river-fish](../../../experiment/ex5/skills.json), [experiment/ex5/results.json#actors-moss](../../../experiment/ex5/results.json).

### sol

Sol learned examination, inspected the rocky-start berry, learned eating and ate at round 10. It chose sustained northward exploration rather than tool-making. It reached forest tree-13-16, found one fruit at round 28 and completed two-round gathering learning at round 30; Lin had taken the remaining fruit in that same round. Sol moved east, collected two remote berries and ate at rounds 38-39. Subsequent trees were empty, including tree-15-8 after Moss's round-38 extraction. Starvation started at round 55; direct browsing and body-reserve requests were rejected; death occurred at round 64.

The record shows resource-mediated interaction without scripted competition: another actor's earlier consumption changed Sol's available food. It does not establish deliberate competitive intent. Three meals supplied 48 nutrition, and many rounds were spent moving or examining empty trees. Late health loss repeatedly interrupted its urgent route, causing extra model calls while it continued essentially the same movement plan. Its empty tick-63 program could not stop the world clock and became a fatal wait fallback. No tools, crafting or poisonous consumption emerged from its rocky starting environment.

Evidence: [experiment/ex5/replay.json#rounds-23-40](../../../experiment/ex5/replay.json), [experiment/ex5/model-calls.json#sol-ticks-28-63](../../../experiment/ex5/model-calls.json), [experiment/ex5/results.json#actors-sol](../../../experiment/ex5/results.json).

### reed

Reed requested examination at tick 0 and eating at tick 5, then consumed its first ochre mushroom at round 7. Its tick-10 harvesting request created a finite fungus distribution; one actual mushroom was extracted at round 13 and eaten at round 18. Examination revealed russet toxicity 8 at round 17 and ivory toxicity 18 at round 21; Reed avoided both and ate another safe ground mushroom at round 28. It then travelled north through sparse grassland. It learned fruit gathering but the grassland tree had no fruit. Its tick-57 leaf request created a new leaf type/distribution and two-round skill, but the local assignment was zero. Starvation reduced health to 10 by round 66. Two distant mushrooms eaten at rounds 67-68 stopped further loss without healing. Reed later returned toward the known empty tree, requested bark, roots and fasting conservation, and died at round 85.

Reed used personal identification feedback to avoid known harmful mushrooms. No poisoning occurred, so this is learning from examination, not adaptation after harmful ingestion. Its 57 visited cells and emergency new-resource requests differ from the other paths. Returning to a depleted site may reflect sparse alternatives and limited remembered site information: the input retains discovered IDs and eight recent outcomes, but not a durable spatial notebook of distant stock observations. This is a hypothesis, not a demonstrated cause. Learned leaves were never extracted or consumed, and food did not restore lost health.

Evidence: [experiment/ex5/model-calls.json#reed-ticks-0-84](../../../experiment/ex5/model-calls.json), [experiment/ex5/execution.json#world-ticks-10-57](../../../experiment/ex5/execution.json), [experiment/ex5/results.json#actors-reed](../../../experiment/ex5/results.json).

## Isolation

Ordinary input reconstruction binds every request to its actor's own state, local cells/entities, owned/visible resources, individual discoveries and eight recent personal outcomes. Initial unknown food has no nutrition/toxicity fields, and other actors' private inventories and distant site distributions are absent. The world sees hidden state to adjudicate. Shared public skill code is intentional; it explains convergence on examination, eating and tree gathering without implying shared private memory. Inspection of the actual review reasons/public descriptions found no distant coordinate or other-inventory disclosure; known safe-food references concerned the applicant's already examined food. Structural checks cannot prove all free-text semantics leak-free or establish isolation of future adapters.

Human global screenshots intentionally reveal more geography. The original archive images were captured through the existing import workflow before ex5 joined the completed catalogue, so they show a local-session selector with four prior records. Current validation separately opens the completed ex5 catalogue entry. Neither view is an ordinary-agent input.

## Individuality

### Questions 1-2: Initial survival attempts and environmental effects

Lin and Moss requested a conditional assess-and-eat combination, then separated it after rejection. Sol and Reed requested examination first. All eventually learned examination and eating; common needs, one prompt and a shared catalogue make this unsurprising. Different accessible resources prompted Lin's tree fruit, Moss's fishing, Reed's fungus and later leaf proposals, while Sol explored out of the rocky region. No actor was assigned these actions.

### Question 9: Did behavior diverge over time?

Yes in paths, requests, food intake, call counts and survival duration. Lin obtained the most nutrition, Moss learned the most joint-with-Reed but ate least, Sol sought forest food rather than tools, and Reed identified three mushroom types and sought distant safe food. This is behavioral differentiation under different observations and histories. A single run with no personality variables, replicated seeds or matched policy controls cannot establish stable personality or improved general intelligence.

## Behavior

### Questions 3-4: Scarcity and voluntary exploration

All actors voluntarily travelled after local supplies or prospects declined. There were 201 move actions and 197 summed distinct actor-cell visits (the sum is not a count of globally unique tiles). Only two waits occurred while alive, both rejected-empty-program fallbacks immediately before death; there was no collect-then-idle pattern. Dangerous hunger triggered repeated urgent replanning. Thirty-eight actual batch truncations were retained: 28 vital deterioration, seven learning feedback, one rejected-learning feedback and two new-actor visibility events. Harmless abundant-satiety decline did not cancel safe batches. Not every one-action failure counts as a truncation because no suffix remains to discard.

### Question 5: What capabilities were requested?

Requests included examination, eating, fungus harvest, bank fishing, fruit harvest, leaf harvest, ground-berry foraging, direct cambium/leaf feeding, roots, body reserves and fasting conservation. Twenty-seven applicant reviews produced eight create decisions, eight reuse decisions and eleven rejections. Sol/Reed's equivalent first requests shared one implementation but each learned for two rounds. Eating took one round, gathering generally two, fishing four; per-agent proficiency remained separate.

### Questions 6-7: Which requests grew the world, and were they useful?

| Trigger tick | Applicant | Addition | Observed execution |
| --- | --- | --- | --- |
| 0 | Sol/Reed | Shared examination | 25 successful uses across four actors |
| 5 | Reed | Owned-food consumption | 18 meals across four actors |
| 10 | Reed | Ochre fungus ecology + extraction | One harvested mushroom, then consumed |
| 13 | Moss | New silver fish + river ecology + fishing | Two fish allocated elsewhere; local zero, no fishing attempt |
| 24 | Lin | New amber fruit + forest ecology + gathering | Seven fruits allocated, five harvested and consumed by Lin/Moss |
| 52 | Moss | Site-based fallen-berry gathering | No matching site stock; never used |
| 57 | Reed | New oval leaves + tree ecology + gathering | One portion allocated elsewhere; local zero, never used |

Twenty-three sites were assigned once: five fungus, five water and thirteen trees. Generated edible stock totalled two ochre mushrooms, two fish, seven fruits and one leaf portion. Existing branch/stone stock stayed separate. The results field emptyAssignedSites=7 tests whether *all* current site stock is zero, including branches; it must not be interpreted as the number of zero-food or initially empty assignments. Tree-10-8 and tree-8-11 retain branches but never acquired fruit. No refill/reroll occurred. Four of seven mechanics had successful uses; only two of five extraction mechanics yielded food. Tool-making and food preparation were exercised in deterministic tests, not in this live run.

### Question 8: Learning from harmful experience

No actor consumed toxic food and no poisoning damage occurred. Reed identified toxic mushrooms and subsequently avoided them. Actual failures/empty sites changed subsequent requests or movement, but no controlled comparison establishes how much experience improved decisions. Poison ingestion and property persistence are offline-tested capabilities only.

### Question 10: Did actors interact?

Lin and Sol entered each other's vision at round 23, and the remaining planned movement was interrupted accordingly. No conversation, trade, cooperation or collision conflict occurred. Shared depletion mattered: Lin took the final tree-13-16 fruit at round 30 as Sol finished learning; Moss took tree-15-8's final fruit at round 38 before Sol inspected it at round 54 and Lin tried it at round 99. This is consequential shared-world state, not evidence of intentional competition. No river crossing occurred.

## Causes

### Question 11: What caused success, failure or death?

Every death was starvation: ten penalties of ten health, no poison or other damage. Food acquisition worked but was insufficiently timely and sustained. Lin consumed 124 nutrition, Moss 30, Sol 48 and Reed 90, for 292 total. Initial ground food contained 384 nutrition; actual generated allocations added 187, leaving 279 nutrition in unconsumed ground/site stocks at the end. Thus deaths did not mean that the whole map was empty. Distances, unknown geography, empty local allocations, toxic resources avoided, learning/inspection costs and scarce remembered distant information all matter.

For scale, four actors losing two satiety over 120 rounds require 960 nutrition units including initial reserves to avoid any empty-reserve interval. Initial body reserves were 240 and all initial plus actually allocated food supplied 571, totalling 811 even before toxicity, travel, unavailable skills or capped-waste costs. This accounting shows a deliberately harsh realized supply; it does not apportion the effect of planning versus geography or prove every individual death unavoidable. Health grace permits some zero-satiety rounds. Retained food and unused generation potential mean a different policy could plausibly change outcomes, which requires a separately designed comparison.

Moss spent four rounds learning an ability at a river reach with zero stock. Sol spent two rounds learning while Lin removed the last nearby fruit. Reed's late meal stopped damage at health 10 but could not heal it. Lin's long route returned to fruit already taken by Moss. Late emergency requests often targeted missing resources or unsupported physics. Registering an implementation is therefore not equivalent to executable local opportunity, and opportunity is not equivalent to nutrition consumed.

### Comparison with ex4

ex4 had three symmetric actors, 18 rounds, initial satiety 15 with loss 3, 27 model responses, two generated skills and three survivors at health 100/satiety 81. Each ate five fruit units and waited only in the last four rounds. ex5 had four heterogeneous actors, 120 rounds, satiety 60 with loss 2, 140 responses, seven skills, unknown food properties and no survivors. It exercised multi-round learning, long travel, zero-yield assignments, new resource types, shared depletion and late failure. Map, resources, body rules, prompts, memory and horizon all changed together; lower survival does not establish that dynamic evolution made agents worse. Neither the all-wait controls nor this cross-experiment comparison isolates a causal learning effect.

## Limitations

### Question 12: What still limits open-ended evolution?

The authored envelope consists of four generic primitives over existing site kinds and a fixed map. The model chooses new types, distributions, probabilities, recipes and compositions; it cannot add arbitrary physics, new sites, metabolism, regeneration, social exchange or host code. One ecological assignment per site prevents infinite rerolls but also prevents plausible fruit-and-leaf coexistence. Conversion enforces nutritional conservation and material costs, not a general physical mass or chemistry model. Exact identification gives reliable properties after learning, simplifying real uncertainty. Functional signatures normalize parameter names and effects but cannot prove broad semantic equivalence.

The live development handoffs at ticks 99 and 100 expose a real boundary: the requested single-target extract-then-eat mechanism cannot bind the intermediate output with this operation language. Current Codex reviewed the exact source/snapshot, accepted the first proposed rejection and authored a final rejection reason on the second. No source change or tick occurred during either pause; later starvation followed ordinary round settlement. These are two real interventions ending in unsupported-capability rejections, not successful autonomous engine development. Tests separately verify that valid compositions can be returned through the same handoff.

The larger sparse map, fixed finite populations, one seed/model sample, only eight recent feedback events and a public catalogue constrain interpretation. Repeated health-loss interrupts create model-call overhead even when urgent routes remain unchanged. All ordinary call counts remained below 60 and world attempts below 48; no budget exhaustion caused death. The three parse rejections, two development requests and eleven gameplay review rejections are different categories. All inference used the configured ChatGPT-plan transport with no paid API-key fallback; replay and validation made no inference calls. The reviewer is this implementing conversation, not an independent scientific reviewer. Recommendations below remain analysis only.

## Proposed improvements

1. Measure food reachability and realized energy supply before preregistering the next experiment. The sparse 48 by 48 map and zero-stock allocations create travel/learning costs that may dominate policy quality; resource counts alone do not describe a feasible meal. Verification: On fresh seeds, report shortest legal move + learning + extraction + eating times, aggregate nutrition, toxic fractions and per-start usable supply without prescribing actor routes or changing a live run.
2. Add explicit intermediate-output references or a generic costed site-consumption transition in a separately versioned protocol. Several plausible direct-feeding requests were blocked by representation rather than unrestricted physics, and the live development handoffs could only reject them. Verification: Test atomic extraction/consumption, ownership, toxicity, adjacency, zero stock, conflict rollback and no resource duplication; compare new runs without rewriting ex5.
3. Evaluate a persistent personal spatial notebook of actually observed site conditions. Visited/discovered IDs and eight recent outcomes do not preserve a useful distant stock history; Reed returned toward a known empty tree. Verification: Use matched runs with and without actor-local remembered positions, observed stock and observation ticks; audit that no distant live state or other private memory leaks.
4. Assess executable local opportunity separately from skill validity during world review. Moss learned a berry-site extraction skill with no matching site and fishing at a zero-yield reach. Valid code alone is not a useful local capability. Verification: Report registration, learned proficiency, available target count, attempts, successful units and consumed nutrition separately; any new review feedback must preserve unknown distant distributions and autonomous choice.
5. Compare bounded danger replanning policies without prescribing survival strategies. Twenty-eight danger interruptions repeatedly replaced substantially similar urgent routes, increasing calls without clear evidence of benefit. Verification: Preregister matched policies that still interrupt newly invalid targets or health thresholds, then compare call counts, discarded actions and survival without disabling required failures.
6. Replicate heterogeneous starts and include a matched already-known-skill control. A single run and idle control cannot distinguish learning costs, shared-resource competition, geography and model variation. Verification: Allocate new exN records with fixed budgets and seeds, retain deaths, and compare meals, travel, useful skills, survival curves and actual poisoning rather than only survivor counts.

## Evidence binding

The companion JSON records SHA-256 digests of every original archive artifact. Validation checks completeness and freshness, not the truth of the reviewer's causal judgment.
