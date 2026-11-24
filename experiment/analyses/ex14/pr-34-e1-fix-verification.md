# ex14: Behavioral Analysis

Reviewer: Current Claude Code conversation; behavioral analysis, not independent approval. Task: pr-34-e1-fix-verification. Recommendations are analysis only; no world, prompt or agent change is authorized by this report.

## Summary

E1 ran the ex13 rules, seed and world with whole exact reads (exactRecordWidth 4000), plan-horizon and general-capabilities guidance, 8 development handoffs and a 1,600,000-token ceiling. It stopped at round 64 of 80 when the eighth handoff was spent and a ninth develop review arrived (the same recorded reason as ex13 at round 280). All three people were alive at health 100. 103 ordinary and World Agent calls used 699,010 known tokens (one overloaded call has unknown usage), 3,641 per agent per round against 6,320 for ex13 rounds 0-63 and 6,632 for rounds 0-79, so gate G1 (at most 4,500) passed and the round-40 gate passed (3,337 against 5,962). Continuation-part queries fell from 55 to 0, plans decided on partly read records from 22/29 to 0/14, accepted plans from 65 to 31, the median decision gap rose from 2 to 5 rounds and single-execution plans fell from 69% to 29%. Follow-up share did not fall (55.7% against 52.5%). The World Agent reused probe for three assessment requests (3 of 11 reviews, ex13 0 of 8 in the same rounds) and no developed interface was bound to one actor or item. Of eight handoffs, one was a transport recovery, one reassigned an existing interface, three installed working general operations (cultivation trial, paired food exposure trial, resting-material arrangement) and three installed first releases that only report physics the world does not represent (branch geometry and wind direction, stone support geometry, strand and tension behavior). No messages were exchanged.

## Per-agent findings

### lin

Lin requested root propagation at round 0 (ordinary-4), a weather shelter at 12 (ordinary-26), unfamiliar-food assessment at 58-59 (ordinary-79, ordinary-80) and non-ingestive composition assessment at 63 (ordinary-100). Lin mastered cultivate-plant, weather-barrier and Sol's controlled-food-processing-trial. Lin is the only person who used a developed interface: after learning the food trial, Lin stated the aim of establishing an observed decay baseline rather than assuming preservation (ordinary-59, round 34), retried the start at a site clear of its own body (ordinary-66, round 40), placed a matched berry pair at round 42, waited through the 10-round checkpoint, then inspected and retrieved both samples at rounds 52-54 (ordinary-76). Lin never attempted the weather barrier it had studied for four rounds. Lin ended at health 100 and satiety 91.9.

Lin shows the clearest effect of longer plans and of cross-person reuse: it adopted another person's interface for its own question and kept a multi-round trial running without re-deciding. Its last requests show it distinguished a mechanical press result from food-safety evidence. The unused weather barrier is a direct cost of shipping a first release that cannot build anything.

Evidence: [experiment/ex14/calls/ordinary-4.json](../../../experiment/ex14/calls/ordinary-4.json), [experiment/ex14/calls/ordinary-59.json](../../../experiment/ex14/calls/ordinary-59.json), [experiment/ex14/calls/ordinary-66.json](../../../experiment/ex14/calls/ordinary-66.json), [experiment/ex14/calls/ordinary-76.json](../../../experiment/ex14/calls/ordinary-76.json), [experiment/ex14/calls/ordinary-100.json](../../../experiment/ex14/calls/ordinary-100.json), [experiment/ex14/results.json](../../../experiment/ex14/results.json).

### moss

Moss requested a replenishable food source at round 0 (ordinary-7), which became the first develop review (world-13, round 8), unfamiliar-food assessment at round 25 (ordinary-38), which the World Agent answered by reusing probe (world-42, round 29), and functional food preservation at round 32 (ordinary-51). That request stated that the existing paired ground-exposure trial explicitly cannot preserve food, so an observation-only substitute does not solve the problem. Moss mastered cultivate-plant and air-dry-food but used neither. It ended at health 100 and satiety 80.4.

Moss read interface contracts and rejected a non-solution in its own words, which is the intended effect of honest contracts. Its preservation goal stayed unmet because the world lacks the represented physics, so its studied capabilities did not change its behavior.

Evidence: [experiment/ex14/calls/ordinary-7.json](../../../experiment/ex14/calls/ordinary-7.json), [experiment/ex14/calls/ordinary-38.json](../../../experiment/ex14/calls/ordinary-38.json), [experiment/ex14/calls/ordinary-51.json](../../../experiment/ex14/calls/ordinary-51.json), [experiment/ex14/calls/world-42.json](../../../experiment/ex14/calls/world-42.json), [experiment/ex14/results.json](../../../experiment/ex14/results.json).

### sol

Sol made the most requests: meadow-root cultivation at round 0 (ordinary-10), preservation at 10 (ordinary-18), stating it would investigate preservation before spending time or food on a planting trial that cannot replenish supply, unfamiliar-food assessment at 20, 27 and 31 (ordinary-30, ordinary-39, ordinary-45; the last answered by reusing probe in world-48), a moss bedding trial at 38 (ordinary-63) and vine cordage at 61 (ordinary-92). Sol mastered controlled-food-processing-trial and arrange-resting-material but used neither. It ended at health 100 and satiety 78.4.

Sol redirected its request after reading that cultivation cannot replenish food, which shows contract text steering requests. Its repeated assessment requests were absorbed by reuse rather than new interfaces. Its requests drove three of the eight handoffs, two of which became working operations it then did not use within the window.

Evidence: [experiment/ex14/calls/ordinary-10.json](../../../experiment/ex14/calls/ordinary-10.json), [experiment/ex14/calls/ordinary-18.json](../../../experiment/ex14/calls/ordinary-18.json), [experiment/ex14/calls/ordinary-45.json](../../../experiment/ex14/calls/ordinary-45.json), [experiment/ex14/calls/ordinary-92.json](../../../experiment/ex14/calls/ordinary-92.json), [experiment/ex14/calls/world-48.json](../../../experiment/ex14/calls/world-48.json), [experiment/ex14/results.json](../../../experiment/ex14/results.json).

## Isolation

The fresh scope long-ex14 inherits no generated ability; every developed package is scoped to long-ex14 and records its reuse of ex13 or ex10/ex12 infrastructure. Each person learned interfaces individually. No messages were sent, so all information crossed between people only through public interface contracts and the shared registry.

## Individuality

All three asked for food renewal at round 0, then diverged: Lin pursued shelter, a decay baseline and food assessment; Moss pursued cultivation and preservation; Sol pursued preservation, assessment, bedding and cordage. Only Lin used a developed interface. Tendencies were the ex13 values, which are close together (0.47-0.56).

## Behavior

Decisions were half as frequent as in ex13 over the same rounds and plans were longer: 31 accepted plans against 65, median gap 5 against 2 rounds, 29% single-execution plans against 69%. No plan used interrupt events. Rest remained the most common action and nobody was at risk. Requests concentrated on food renewal, preservation and assessment, as in ex13.

## Causes

Whole exact reads removed every continuation-part query and every partly read decision, and plan-horizon guidance coincided with fewer and longer plans; together these cut tokens per agent per round by 42% against ex13 over rounds 0-63. Follow-ups after queries remained (55.7%), so query batching rather than paging now drives the remaining overhead. General-capabilities guidance coincided with three probe reuses and no person- or item-bound interfaces. Handoffs still ran out: the World Agent still chose develop for 8 of 11 reviews, and three of its specifications required physics the world does not represent, which the developer shipped as reporting first releases under this run's no-invented-physics rule. This is one seed and three people, so these are case comparisons, not causal estimates.

## Limitations

The run covered 64 of 80 planned rounds because the 8-handoff budget ended it; rounds 64-79 are missing, so comparisons use ex13 rounds 0-63 as well as the planned rounds 0-79 baseline. The three fixes were switched on together and cannot be separated. One handoff was consumed by a server overload at round 0. The development-4 record stated that no food moisture model exists in this world; that was incomplete, since ex10's measured-food-preservation@1 holds one bound to ex10 apparatus, as corrected in the development-6 record. Development and review model usage is not metered. The bound-interface rule is lexical.

## Proposed improvements

1. Decide, as a separate human decision, small explicit material and environment representations that the World Agent's specifications keep requiring: branch and stone geometry, wind direction, food water content (possibly by installing the ex10 preservation model with a defined support), and strand tension behavior. Three of six installed packages could only report unsupported physics, and the World Agent kept asking for the same missing properties; learners spent study rounds on interfaces that cannot act. Verification: In a later run with those representations, count developed interfaces that are executed successfully by at least one person, against 3 of 6 here.
2. Let the World Agent see, before choosing develop, which physical properties the world represents, or let it reject a request as unsupported without consuming a development handoff. Develop remained the choice in 8 of 11 reviews and the handoff budget, not tokens or time, ended the run again. Verification: Compare handoffs per 10 rounds and the stop reason against ex14 (8 handoffs in 64 rounds, budget exhausted).
3. Reduce query follow-ups by attaching the most-read records (own projects and recently used interface contracts) proactively within the existing input ceiling. Paging overhead is gone but 55.7% of ordinary calls are still follow-ups after queries. Verification: Follow-up share and tokens per agent per round over rounds 0-63 against ex14 (55.7%, 3,641).

## Evidence binding

The companion JSON records SHA-256 digests of every original archive artifact. Validation checks completeness and freshness, not the truth of the reviewer's causal judgment.
