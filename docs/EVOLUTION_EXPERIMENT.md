# Heterogeneous World Evolution Protocol

This separate `evolution-v1` protocol preserves founding rules and replay versions 1–4. [PRODUCT](PRODUCT.md) owns feature status; the [execution plan](exec-plans/completed/pr-16-heterogeneous-evolution.md) owns actual acceptance. Its purpose is to observe autonomous demand-driven expansion, including unsuccessful survival, rather than force a named activity.

## Fixed experiment configuration

| Setting            | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Seed and geography | 20261109; connected 48 by 48; vision radius 5                                        |
| Starts             | Lin: forest; Moss: riverbank; Sol: rocky; Reed: damp mushroom region                 |
| Body               | Health 100, satiety 60, satiety cap 100; neutral cold/heat                           |
| Settlement         | Execute action; if satiety is zero, subtract 10 health; then subtract 2 satiety      |
| Idle baseline      | Round30: satiety0/health100; round31: health90; round40: dead                        |
| Horizon            | 120 synchronous rounds, including inert dead actors                                  |
| Budgets            | 60 attempted ordinary calls per actor, 48 world attempts total, two per review batch |
| Plans              | At most 12 rounds; one action or learning increment per actor per round              |
| Provider           | Existing authorized ChatGPT-plan OAuth transport; no API-key fallback                |

The four ordinary actors have one shared prompt, identical statistics and no assigned strategies or personality. The initial map and six material types are authored and seed-bound; future types, ecology and compositions are proposed by the World Agent. Each starting region has reachable food but cannot sustain the entire horizon using its initially visible stock and maximum latent production. Grasslands permit travel, deep river and standing objects block it, and shallow crossings connect the banks. No actor is required to leave, survive, request a specific skill or meet another actor.

## Resources, ecology and implementation

`evolution-types/schema/environment` define immutable type properties, physical stacks, natural sites, registries and strict proposals. Resource types carry neutral names/appearance, nutrition, toxicity and durability. Ground pickup transfers the whole finite stack; it does not nourish. Stable mushroom types include safe and harmful varieties without an automatic safety label in ordinary inputs.

The World Agent proposes additions in `resources`, `ecology`, `mechanics` and a review for each actual applicant. Ecological rules match existing natural site kinds and biomes. Their finite integer distribution includes zero; a seed/site draw selects the result and the site capacity clamps it. `energyLimit` bounds per-unit nutrition. Each site receives at most one assignment across all rules, including zero; existing branch/stone stock is separate. A new name, rule or repeated request cannot replenish it. Initial food does not regenerate. This conservative single-population design limits richer overlapping ecologies intentionally.

Mechanic code is a JSON string containing one to six typed operations, not evaluated JavaScript. The World Agent chooses resource IDs, recipes, learning effort and compositions within four physical primitives:

- `extract`: take finite stock from an adjacent site; optional resource costs, durable tool requirement and seeded success chance.
- `consume`: spend owned units and apply their actual nutrition/toxicity, with no healing or bypass of metabolism.
- `convert`: consume declared materials and optional owned target units, creating another registered type; output nutritional energy cannot exceed consumed food energy.
- `identify`: reveal an owned/adjacent type's properties or an adjacent site's stock to that actor.

No primitive branches on requested skill names. Previously undefined food/tool types and their costed higher-level interactions need no activity-specific TypeScript. Failed compound transactions roll back, including failed chances; the game round is still consumed. Conflicting resource transactions all reject. Successful tool use loses one durability. Definitions remain immutable; normalized parameter/effect/cost signatures deduplicate equivalent executable compositions. World semantic judgment may recognize broader equivalence, but the structural signature is not a proof of general semantic equivalence.

Registry existence never grants proficiency. Each approval specifies an individual duration; the application counts as its first learning round. Automatic study consumes later rounds and hunger normally. Completed learning is usable from the next round. The world's public ability catalogue exposes executable conditions and parameters, not hidden site assignments. Ordinary prompts contain no fishing, gathering or technology examples; only the World Agent receives illustrative durations and feasibility guidance.

## Information and scheduling

Ordinary inputs contain own body, inventory, learned abilities, visited/discovered objects, visible cells and other actors' public identities/positions, plus eight recent personal outcomes. Unknown type nutrition/toxicity and unexamined site contents are absent. Consumption and identification add persistent personal knowledge. The World Agent sees the hidden physical state to evaluate proposals, but its prompt forbids disclosing hidden facts through public descriptions. Structural input isolation is enforced; free-text semantic leakage still requires actual prompt/output review.

All decisions use the same start snapshot. World review, validation and any conversation development complete before atomic actions and survival settlement. Harmless satiety decline does not cancel a plan. Learning feedback, failed actions, health loss, crossing satiety6/0, a newly visible actor or a depleted upcoming stack can interrupt it. The scheduler supplies no routes or survival choices. Attempts, results and discarded actions remain in evidence.

## Run and continue

Use the [unified task entry](TASK_HARNESS.md) with an explicitly authorized `experiment: {mode: "evolution", allocation: "new", basis: ...}`. `pnpm experiment:evolution` is a guarded compatibility alias. The worker first runs a 12-round offline integration smoke, verifies existing archives and authenticates, then exclusively allocates the next exN. Configuration and core/simulator source hashes bind the running checkpoint.

Before each external call, persist `started`; persist response/parse results and accepted programs before advancing. Saved accepted decisions are reused. Two unsuccessful world attempts or an explicit development request return a structured `development` handoff to this conversation. Submit `{barrierId,tick,proposal,notes}` through the task response; no game tick passes during this work. Unknown interrupted call outcomes or changed execution source block continuation, rather than repeating inference or rewriting conditions. Existing capture-only recovery remains available after simulation. Failures and deaths are retained.

## Archive, replay and limits

Version5 adds `smoke.json` to the version4 artifact set. `skills.json` retains resource types, ecological rules, mechanics and skills; `execution.json` preserves every program, round, attempted call and development result. `model-calls.json` contains both prompt templates, private inputs and observable outputs, never credentials or hidden reasoning. Only those two long ledgers may use the version5 20 MB limit; prior limits remain unchanged. The replay keeps the original environment and accepted programs/proposals under the existing 1 MB import bound. Validation reconstructs decisions, inputs, round barriers, finite stocks, ownership, registry, metabolism, measured report/chart and artifact hashes without inference.

The current UI shows biome colors and authored resource symbols, private identification status, learning and generated code. Map scale offers fit overview or internally scrollable detail. The same archive dropdown, timeline and read-only export handle all five versions. Desktop/mobile fixtures and initial/midpoint/final/archive charts receive actual visual review.

Every run also requires the existing retained behavioral analysis. Answer the twelve research questions in the task plan, compare ex4 descriptively, and distinguish authored setup, simulated smoke, real calls, observed outcomes and hypotheses. This prototype does not provide unrestricted physics, regenerative ecosystems, communication/trade, rich long-term memory, independent scientific review or general semantic equivalence. Dead actors do not make more calls. Scientific objective flags are observations, not reasons to rerun or rescue an experiment.

## Retained ex5 observation

The [real ex5 record](../experiment/ex5/report.md) contains 120 rounds and 140 model responses. Seven mechanics and three new types were registered; four mechanics were successfully used. All four actors died from starvation before the horizon. Two real development pauses rejected unsupported direct site consumption without changing the frozen kernel or advancing game time during review. The [behavioral analysis](../experiment/analyses/ex5/pr-16-heterogeneous-evolution.md) answers the twelve research questions, compares ex4, accounts for food and shared depletion, and proposes future work without applying it.
