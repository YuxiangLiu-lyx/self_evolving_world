# PR-16: Heterogeneous Survival and World Evolution

## Requirement summary

Extend the delivered ex4 loop into a shared heterogeneous world whose resource definitions, ecological assignments and executable mechanics can grow in response to autonomous requests. Preserve previous protocols and archives, run a fixed 120-round real-model ex5 when the configured account/runtime permits, and analyze actual differences, failures and limits without scripted strategies.

## Requirements

- R1: Inspect and reuse current core, synchronous scheduling, model transport, learning, archive/viewer and task harness; preserve versions 1-4 and ex1-ex4 byte-for-byte.
- R2: Add a seeded connected 48 by 48 map with forests, grasslands, riverbanks/crossings, rocks and damp mushroom regions. Four actors have comparable stats/prompts and different surroundings, with no hardcoded personalities, routes, skills or milestones.
- R3: Support persistent dynamically proposed resource definitions and terrain/object-conditioned ecological distributions. Seed each eligible assignment once, including zero stock; repeated requests and multiple actors cannot reroll, replenish or duplicate it. Quantities and type properties remain coherent.
- R4: Support World Agent-designed executable mechanics over generic constrained transitions, including extraction, consumption, transformation, material costs and identification, without skill-name gameplay branches or arbitrary state/host access. New resource names and interactions need no prewritten activity-specific implementation.
- R5: Keep semantic review/reuse separate from deterministic validation and individual proficiency. Record reasons, prerequisites, variable learning time and versions; equivalent same-round implementations share registration. Learning consumes game rounds and is usable only after completion.
- R6: Ordinary inputs reveal only own state, visible geography/entities, legitimate public capabilities and personal experience; conceal unfamiliar food toxicity, distant resources, private inventories and hidden ecological assignments. Identification and harmful consumption can teach persistent personal facts.
- R7: Keep one synchronous round-start snapshot and a development/review barrier. Retain finite action batches, meaningful interruption causes and bounded calls/retries; harmless satiety decline must not interrupt safe plans. Never let the scheduler choose a survival strategy.
- R8: Before the main run, perform and retain a short explicitly offline smoke test and freeze configuration. Target 120 rounds, four actors, seed 20261109, health100/satiety60, satiety loss2, zero-satiety damage10, at most60 ordinary attempts per actor and48 world attempts, at most12 planned rounds and two review attempts per batch. No mid-run rescue or inference reruns to improve outcomes; preserve deaths and external failures.
- R9: Extend current viewer/replay to show heterogeneous terrain, resources, world changes, vitals, skills and learning; deterministic reconstruction must not call models. Preserve human global inspection versus private actor information boundaries.
- R10: Retain complete ex5 goals/configuration/calls/world decisions/replay/results/visuals and per-actor health, food, exploration, discoveries, requests, learning, failures, danger, encounters, interruptions and call counts; report resource/mechanic growth and actual uses.
- R11: Write retained behavioral analysis answering all twelve requested questions, compare with ex4, distinguish predefined mechanisms, real observations and speculation, and propose improvements only. Do not claim personality or causal intelligence from different paths.
- R12: Use the unified harness for the new protocol, full unfiltered validation, every current image/file review, reviewed commit, requirement-mapped PR, current remote quality/pr-policy, version-bound self-review and explicitly authorized default merge with independent integration verification.

## Scope and exclusions

A versioned generic ecology/mechanism extension, bounded runtime and new ex5. No rewrite of the foundation, historical archives, arbitrary JavaScript, paid API fallback, additional model service, independent review agent, elaborate personality or forced cooperation/fishing. No CI/protection changes or large new verification framework. The new operations define a physical envelope; arbitrary novel physics and unbounded autonomous source editing remain outside scope and will be reported honestly.

## Acceptance criteria

The same seed and accepted proposals reconstruct identical persistent assignments and transitions. Repeated empty-site requests cannot create resources. Hidden toxicity is absent from naive inputs and stable after discovery. Generated resource/mechanic definitions execute real costed transitions; failed/conflicting transactions cannot create free effects. Learning, round barriers and interruption/budget accounting are testable. Four distinct starts have a reasonable initial survival window but no guaranteed full-horizon local food supply. Real inference, simulated smoke coverage and scientific outcomes remain distinct. Existing full checks and all archived replays pass before delivery.

## Architecture and execution plan

1. Inspect existing contracts and ex4 limitations. Add a separate version-5 protocol while reusing base snapshot/movement/vision, strict data helpers and the existing OAuth transport boundary.
2. Implement declarative resource/ecology/mechanic schemas and deterministic transactional execution. The model chooses distributions, prerequisites and operations; code enforces bounded generation, material accounting and survival invariants.
3. Add heterogeneous setup, private discovery memory, finite programs and durable synchronous runtime. Extend existing task development handoff; start intent with mode none until the explicit evolution mode exists, then amend before allocation/inference.
4. Add targeted boundary tests and a retained offline smoke record; freeze configuration, allocate the next exN once and run the real model until120 rounds or an accurately recorded external blocker.
5. Extend existing replay/capture/archive checks, inspect actual traces and write the twelve-question analysis and comparison. Complete documentation, full validation, actual review, PR and authorized merge.

| Existing step and evidence    | Trigger                           | New corresponding step                                   | Verification                                                  |
| ----------------------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| world.ts and learning-v1      | Legacy replay                     | Unchanged version routing; new ecology state             | Regression and old archive hashes                             |
| learning-run/provider         | Ordinary plan or learning request | Same transport and round barrier; generic world proposal | Private-input, cost, dedup and resume tests                   |
| task experiment/development   | Explicit new experiment intent    | Evolution worker and structured result                   | No duplicate allocation/calls; source binding                 |
| experiments/capture/analysis  | Completed simulation              | Version5 reconstruction and complete analysis            | Canonical artifacts, browser and actor coverage               |
| validation/review/publication | Mixed actual changes              | Existing full sequence unchanged                         | Full suite, images, file mapping, remote CI and main ancestry |

## Results and limitations

Inspection confirmed that ex4 uses a closed resource enum and activity-specific consume/harvest/craft interpreter, exposes food toxicity to actors, limits plans to four rounds and interrupts after nine satiety loss. The new protocol must not silently alter those archived semantics. ex4's symmetric local fruit supported its complete18-round horizon; its idle comparison was descriptive, not causal. Preflight `pnpm check` passed all 321 unit tests and 21 browser tests, including all old archives, build, type/lint/format/dependency and documentation checks. The deterministic 12-round integration smoke passed without model calls. Configuration was frozen as R8 before the first real request and remained unchanged throughout the run. Desktop and mobile prototype images were inspected; a clipped registry count was fixed with wrapped labels before the full preflight passed. A subsequent same-barrier stock-merge regression passed with all ten evolution core tests.

The real gpt-6.1-sol ex5 completed 120 rounds with 140 provider responses: 115 ordinary and 25 world attempts; 135 accepted, three parser rejections, two development handoffs and no transport failures. The world registered seven skills, three new types and four ecological rules. Moss/Sol/Reed/Lin died from starvation at rounds 55/64/85/102; no rescue or inference rerun occurred. Twenty-three sites received permanent allocations; four skills were successfully used, including finite tree-fruit and fungus extraction. Lin and Sol encountered one another, and prior harvesting changed other actors' available stock. No live poisoning, tool crafting, fishing use or river crossing occurred.

Both real development pauses reviewed unsupported direct site consumption; the current conversation returned explicit rejections without changing source, stock or game time. The protocol implements a general bounded operation language, not arbitrary new engine primitives. The retained twelve-question analysis distinguishes these limits, food/route scarcity, shared depletion, call overhead and descriptive ex4 comparison. Its recommendations were not implemented. All old archives remain byte-for-byte preserved.

Implementation, real experiment, capture and analysis preparation are complete. Final full-suite results, every-image/full-diff review, exact reviewed commit, remote CI and integration are established by the current unified task evidence and PR, not inferred from this plan or preflight. Delivery must satisfy R12 before task completion.

## Delivery

- Task: PR-16 heterogeneous survival and world evolution
- Mode: merge

The current user-provided Agent Guide explicitly authorizes the default reviewed commit, PR and guarded merge workflow for this task. No task-scoped exception was requested.
