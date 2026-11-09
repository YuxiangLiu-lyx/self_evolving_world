# PR-15: Survival-driven Skill Generation and Learning

## Requirement summary

Implement and run a minimal versioned experiment in which ordinary actors request functional capabilities from survival pressure, a separate World Agent reviews equivalence and feasibility, constrained generated implementations are validated and registered, and individual learning consumes game rounds. Retain actual outcomes and analysis, then complete the existing reviewed commit, PR and explicitly authorized merge workflow.

## Requirements

- R1: Add a separate rules/replay version preserving the foundation, survival-v1 and all historical experiments. Initial health is 100 and satiety 15 (cap 100); after actions, zero satiety causes 10 damage before losing 3 satiety. No-food health is 100 at round 5, 90 at round 6 and 0 at round 15.
- R2: Accept detailed learning requests describing purpose, target, conditions and expected effect. Separate world implementations from individual proficiency; reuse functional equivalents independently of names and deduplicate equivalent same-round requests. Persist versioned specifications, parameters, conditions, costs, effects, durations and executable implementations.
- R3: Give the World Agent a separate prompt with primitive-era rules, relevant environment/materials, existing skills and applicant abilities. Return structured reuse/create/reject decisions with reasons and learning time. Include the requested eating, tree-felling, fishing and spacecraft examples only in this prompt; feasibility and duration depend on actual conditions.
- R4: Generate capabilities absent from the initial registry using constrained code, validate before registration, and enforce resource costs and immutable survival rules in the core. Code cannot access host I/O or assign arbitrary vital values. Record failed review/development and bounded attempts; support current-conversation development handoffs through the existing task coordinator.
- R5: Collect all decisions against one round-start snapshot; settle only after all review/development/validation/feedback is resolved. One action or learning advancement per living actor per round; one-round learning is usable next round, two-round learning after two advances. External waiting never advances game time. Resume without duplicate allocation, decisions, implementation or game rounds.
- R6: Ordinary inputs contain goals, interfaces, observable resources/terrain, vitals, learned skills and recent private outcomes. Do not seed named skill examples or compulsory diagnostic learning. Interrupt remaining plans on learning feedback, failed actions or significant deterioration, with finite recorded model budgets.
- R7: Provide a 24 by 18 primitive map with trees, rocks, branches, edible/poisonous food, river/shallow crossings and distant resources. Distinguish ground items and environment objects. Ensure initial food is reachable within the survival window; quantities, nutrition, toxicity and consumption are real. Show terrain/resources/vitals/skills/learning in the viewer and replay.
- R8: Add meaningful offline tests for starvation timing, durations, equivalence, batch reuse, generated execution, adversarial code, resource/poison effects, reachability, private observations, plan interruption and paused development. Run a new reproducible small experiment through the existing subscription channel, distinguish real model evidence from deterministic controls, and store goals/results/visuals plus per-actor behavioral analysis and improvement proposals without implementing proposals.
- R9: Reuse and extend the unified harness for the new experiment and structured development handoffs, preserve full checks/archive protection/current review/PR/remote CI/conflict/integration gates, synchronize English documentation, and deliver the reviewed commit, PR and authorized merge. Never treat external failure or experimental survival failure as success without reporting it.

## Scope and exclusions

Versioned primitive-era extension, constrained generated skill programs, bounded ordinary/World Agent adapters, continuation journal, new exN, viewer/replay integration, tests and required documentation. No historical archive rewrite, foundation redefinition, arbitrary JavaScript execution, paid API fallback, new service/SDK, independent review agent, unlimited retries, branch-protection or required-CI changes. The repository is clean at task start; the focused branch is based on main merge ee1fd8afddc39fbb8fd91955e0d19b19976d7a13.

## Acceptance criteria

All numbered requirements have executable checks or retained actual review evidence. Generated code produces a measured resource-backed effect; world registration never grants instant actor proficiency. Malformed/unsafe code and unsupported resource effects fail before any mutation. Failed external work is journaled without ticking the world. Replay reconstructs exact new behavior without inference while all old archives remain byte-identical. Model success, survival success and deterministic control outcomes are separately reported. Full current local and remote gates pass before verified integration.

## Existing implementation and migration map

| Existing evidence                                             | Trigger                                  | Extension                                                                                            | Verification                                                                        |
| ------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| world.ts fixed foundation; survival.ts survival-v1            | Version 1-3 replay or current experiment | Separate primitive learning extension and replay version 4                                           | Original suite and archive digests; explicit starvation regression                  |
| program.ts / survival-run.ts finite long plans and five calls | Existing survival-v1 only                | Bounded short plans, private recent memory and event-triggered interruption                          | Scheduler and provider fixtures; recorded real calls                                |
| program-provider.ts always-denied diagnostic learning         | Existing ex3 protocol                    | Separate ordinary and World Agent prompts; functional review and constrained implementation registry | Prompt isolation, equivalence and execution tests                                   |
| task-context/flow/runtime and worker guards                   | Recorded intent and preparation          | New learning protocol, journaled allocation and paused development response                          | Real continuation and worker-boundary fixtures                                      |
| experiments.ts / experiment-cli.ts                            | New allocation or capture-only resume    | Version-4 reconstruction, model and development evidence, shared capture and archive publication     | Artifact consistency and current browser reconstruction                             |
| task analysis/review/commit/publication/merge                 | Actual route and scoped authority        | Preserve the same sequence and current-conversation review                                           | Full suite, every screenshot/diff, GitHub COMMENT, current checks and main ancestry |

The existing coordinator initially accepts only none/random/survival intent. Start this task in preparation with mode none, recording the requested new experiment in the original request; amend to the new explicit learning mode before any allocation or inference. The new protocol uses three actors and 18 rounds, at most 12 ordinary calls per actor and 12 World Agent attempts total, with at most two attempts for a failed review/development batch. These are ceilings, not a quota to consume. Credentials use the existing subscription grant; no API-key fallback.

## Execution steps

1. Inspect current contracts and introduce the pure versioned environment, resource and skill interpreter with focused regression tests.
2. Add deterministic round/learning/program scheduling and independently reconstructable replay; preserve old paths.
3. Add separate model prompts, bounded durable execution and coordinator development handoff; validate with controlled providers before inference.
4. Extend existing archive, viewer, capture and analysis tooling; run the fresh small real-model experiment and retain its exact evidence.
5. Analyze individual outcomes and causal limits, synchronize records, run full validation, inspect every current image and changed file, and use the existing PR/merge gate.

## Results and limitations

The first complete implementation preflight passed 300 unit tests and 18 Chromium tests on macOS, Node24.22.2 and pnpm10.34.9, including both new desktop/mobile screenshots inspected in this conversation. Subsequent boundary cases test the raw learning worker, mode/stage matching, source-bound paused development and nutrition cap; the focused43-case suite passed. The first full coordinator acceptance run then passed all 304 unit tests and 20 Chromium tests, with 29 current screenshots and complete type/lint/format/architecture/build/demo/archive/analysis/documentation checks. Plan archival triggers fresh complete validation and image/diff review before delivery.

The first live start stopped before allocation because the existing OAuth grant expired. The user completed the repository browser login and the coordinator continued without allocating a duplicate experiment. New ex4 completed18 rounds with27 real gpt-6.1-sol calls:24 ordinary decisions (Lin9/Moss8/Sol7) and3 World Agent responses. All27 responses completed,26 were accepted directly, and one requested conversation development at tick0. Game time stayed0 until the validated result was returned; continuation reused the decisions and the same ex4. Two generated implementations were persisted: consume one owned edible unit and harvest one adjacent tree fruit. World review reused eating at tick2 and batch-deduplicated all three harvesting proposals at tick5. Each actor learned two skills, successfully used them nine times, consumed five fruit units, harvested four and waited only in rounds15–18. All three ended health100/satiety81 with no failed action or poison ingestion. The independent all-wait control died at round15; health100 at round5 and90 at round6 matched the requested timeline. Archive capture/reconstruction passed before behavioral analysis.

The companion ex4 analysis records every actor, similarity/isolation distinctions, finite-horizon waiting, causal limits and proposed improvements only. It also corrects the first handoff note: the note mistakenly described fixing quote escapes, but the submitted code is byte-identical to the original valid proposal. The handoff approved the implementation without changing it; the original note remains as audit history and the companion correction supersedes that wording.

The trial demonstrates resource-backed skill generation/reuse/learning/use, not unrestricted invention or a causal estimate of learning benefit. Only one-round safe food skills occurred live; two-to-four-round learning, compound skills, tool crafting/wear, fishing prerequisites, poison and unsafe code were tested offline. The fixed primitive language cannot invent arbitrary physics. Symmetric resources/common incentives limit individuality conclusions, and the known18-round horizon makes late waiting rational. No historical ex1–ex3 content or experiment recommendations were changed. Exact final run, reviews, PR, remote CI and authorized integration are established by the existing generated receipts; none is predeclared as passed in this plan.

## Delivery

- Task: PR-15 survival-driven skill generation and learning
- Mode: merge

The current user explicitly requests development, validation, PR and the already authorized merge workflow for this task. This grant covers this focused PR only.
