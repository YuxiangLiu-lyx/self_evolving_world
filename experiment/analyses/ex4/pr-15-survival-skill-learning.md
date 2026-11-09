# ex4: Behavioral Analysis

Reviewer: Current Codex conversation; non-independent semantic review. Task: pr-15-survival-skill-learning. Recommendations are analysis only; no world, prompt or agent change is authorized by this report.

## Summary

The real gpt-6.1-sol run completed 18 synchronous rounds with 27 model attempts: 24 ordinary decisions and three World Agent reviews. All provider responses completed; 26 decisions were accepted directly and one world response requested conversation development. Two initially absent implementations were registered and used: finite owned-food consumption and adjacent tree-fruit harvest. All three actors finished at health100/satiety81; each consumed five fruit units, harvested four and waited only in the final four rounds. The offline all-wait control died at round15. This demonstrates functioning generation/reuse/learning/use and resource-backed survival in this scenario, not a causal estimate or open-ended survival competence.

## Per-agent findings

### lin

Lin made nine ordinary calls. It requested eating at tick0, completed learning at round1, moved and picked up fruit in rounds2–3, and consumed it in round4. It requested tree-fruit harvesting at tick5, learned in round6, then harvested/consumed finite stock. Five food units supplied 120 nutrition; 18 rounds cost 54, so final satiety was 15+120-54=81. Health remained100, with two learned skills, nine successful uses and four final waits.

No failed action or starvation occurred. Learning before pickup differed from the other actors but still met the initial survival window. Smaller plan batches explain the higher call count; this is observable policy variation without evidence of a durable personality. Local tree fruit was exhausted, but the 18-round horizon ended before further exploration was needed.

Evidence: [experiment/ex4/model-calls.json#ordinary-lin](../../../experiment/ex4/model-calls.json), [experiment/ex4/replay.json#rounds-1-18](../../../experiment/ex4/replay.json), [experiment/ex4/results.json#actors-lin](../../../experiment/ex4/results.json).

### moss

Moss made eight ordinary calls. Its first program moved east, picked up fruit and requested eating; the World Agent reused skill-1 at tick2 with one learning round and the canonical parameter food. At tick5 its harvesting request shared the newly generated skill-2 implementation with Lin and Sol, while proficiency remained individual. Moss harvested its last two tree fruits in rounds11–12 and consumed them in rounds13–14. It ended at health100/satiety81, with no action failures.

The final wait(4) was a rational finite-horizon choice with satiety93 at round14. The scheduler nevertheless interrupted after three waits because satiety declined by nine, prompting another call at tick17 despite ample reserves. This is conservative replanning overhead, not evidence of model freezing. No policy change is made in this analysis.

Evidence: [experiment/ex4/model-calls.json#ordinary-moss-ticks-0-17](../../../experiment/ex4/model-calls.json), [experiment/ex4/execution.json#world-ticks-2-5](../../../experiment/ex4/execution.json), [experiment/ex4/results.json#actors-moss](../../../experiment/ex4/results.json).

### sol

Sol made seven ordinary calls, the fewest. It collected before learning, reused the eating implementation, and followed the canonical food argument despite requesting itemId. It learned the same batch-deduplicated harvesting implementation at round6, consumed five fruit units and harvested four. The tick12 program combined two meals with two waits; a final two-round wait at tick16 completed the horizon. Final health100/satiety81 matched the others without failures or poison consumption.

Longer safe program batches explain lower call count. Sol correctly distinguished food acquisition from actual nourishment and stopped harvesting when its nearby tree was empty. Its similar overall strategy is consistent with symmetric local resources and common incentives, while batch duration differs. The record does not test scarce-food competition, prolonged exploration or a distinct personality specification.

Evidence: [experiment/ex4/model-calls.json#ordinary-sol](../../../experiment/ex4/model-calls.json), [experiment/ex4/replay.json#rounds-11-18](../../../experiment/ex4/replay.json), [experiment/ex4/results.json#actors-sol](../../../experiment/ex4/results.json).

## Isolation

The validator reconstructs each ordinary input from its own round-start observation, visible environment, owned inventory and recent own feedback. These inputs exclude distant resources and other inventories; core and input tests also exercise that boundary. Shared public skills and World Agent review are intentional communication through the world catalogue. Same eating/harvesting requests do not demonstrate private-memory leakage. This experiment cannot prove isolation against every future adapter or adversarial input; the browser global view is a human inspection tool, not secrecy enforcement.

## Individuality

All actors have identical health/satiety, the same survival objective, a translated copy of the same nearby resource arrangement and the same model/prompt. Eating then harvesting is an effective shared response to those inputs. Lin learned before collection, Moss/Sol collected before learning, and call counts were9/8/7 with different batching. The run shows some planning variation but does not establish rich individual traits. There are no explicit personality or heterogeneous experience variables, so convergent behavior is expected and not itself a defect.

## Behavior

Every actor performed 18 intents: two moves, one pickup, two learning requests, nine successful skill uses and four waits. All first ate in round4 before the starvation threshold; they learned harvesting in round6 and used it in round7. Five safe meals each and no toxic food yielded the exact final accounting. All nearby tree fruit was consumed, while distant fruit and fisheries remained unused. Waiting in rounds15–18 is consistent with a known short horizon and abundant satiety, unlike the earlier ex3 concern about ineffective waiting after collecting items. It provides no evidence of survival strategy beyond the horizon. All real learning durations were one round; two-to-four-round progress and tooling/fishing were verified offline only.

## Causes

Observed mechanism: generated consume code applies fixed nutrition while removing owned units; generated harvest code converts finite tree stock into owned fruit; both are unavailable until the actor learns. World tick2 reviews explicitly reused skill-1 for different names/argument requests. The three equivalent tick5 harvest proposals became one skill-2 with three separate learning completions. The idle control establishes the new starvation baseline but changes all actions together, so it cannot isolate the causal effect of learning versus an already-known-skill policy. One conservative deterioration interrupt caused an avoidable late Moss call. The first World Agent unnecessarily requested conversation development for already valid code, adding wall-clock overhead without a game tick.

## Limitations

Only three actors and 18 rounds were observed with abundant symmetric local fruit, known resource nutrition/toxicity and a shared model. This is not a repeatable model-sampling claim: replay is deterministic, fresh inference may differ. No live multi-round skill, crafting, fishing, poison exposure, resource competition or river crossing occurred; these have separate offline tests. Generated code composes only fixed consume/harvest/craft primitives and cannot introduce arbitrary physics. Semantic equivalence and feasibility depend on model/current-conversation judgment. Correction to the retained first development note: it mistakenly describes a quote-escaping repair; direct comparison of barrier.proposed and submitted specification proves the code was identical, consume("food", 1);. That handoff approved existing valid code and did not modify it. The original note is retained for audit; this correction supersedes that wording. The record is current-conversation self-review, not independent approval.

## Proposed improvements

1. Evaluate a longer, separately authorized horizon with food reserves that eventually require travel. The current local fruit supply covers the entire known18-round task, making late waiting and no exploration rational. Verification: Run a fresh exN with preregistered duration/resource conditions; compare survival time, travel, starvation exposure and productive versus unproductive waits without rewriting ex4.
2. Add a matched policy control with eating/harvesting already known at initialization. The all-wait baseline does not isolate learning costs or benefits from food-directed behavior itself. Verification: Use matched maps and budgets across replicated model runs; compare health trajectories, learning delay, consumption and calls, reporting sampling variation and failures.
3. Test deliberate differences in starting resources, experience and constraints before attributing uniform behavior to missing individuality. Symmetric survival incentives currently favor equivalent capabilities and similar trajectories; common names are not evidence of memory leakage. Verification: Audit each private input and use controlled heterogeneous scenarios to measure policy differences, while keeping the public skill registry explicitly shared.
4. Consider a context-sensitive deterioration interrupt and clearer guidance on when development handoff is necessary. Moss replanned with ample food reserve and the first World Agent escalated valid code; both consume effort without improving this run. Verification: Use offline boundary tests and a fresh limited experiment to compare calls and health while preserving immediate interruption on actual harm/failure and never bypassing code validation.
5. Extend behavioral coverage to multi-round learning, tool prerequisites, dangerous food and shared resource conflicts. These mechanisms passed deterministic tests but this live trajectory exercised only safe one-round food skills. Verification: Create separately labeled real scenarios with reachable recovery options and bounded budgets; retain rejected requests, learning progress, actual tool/material costs and all deaths.

## Evidence binding

The companion JSON records SHA-256 digests of every original archive artifact. Validation checks completeness and freshness, not the truth of the reviewer's causal judgment.
