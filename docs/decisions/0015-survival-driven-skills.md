# ADR-0015: Survival-driven Constrained Skill Learning

- Date: 2026-11-09
- Decision status: Accepted

## Context

The current task requests a small real-model experiment in which survival pressure drives functional capability requests. Version-3 survival programs have immutable skills, denied learning and a deliberately mild environment. Changing that protocol would invalidate historical evidence. Generated code must not acquire authority over survival rules or resources.

## Decision

Add a separate learning-v1 extension and version-4 replay/archive. Keep fixed physical operations in a pure resource-checked interpreter. A separate World Agent generates bounded compositions, with compiled effects/costs, functional equivalence signatures and persisted versioned implementations. Individual proficiency and learning duration are separate from shared world registration.

Decisions use one round-start snapshot. Complete all review/development before an atomic action/learning transition and exact starvation settlement. Finite attempts and a durable checkpoint expose development failures through the existing current-conversation harness handoff. The process returns control instead of waiting for another agent. Preserve explicit authorization, full checks and delivery gates.

## Alternatives and reasons

Arbitrary JavaScript or generated core edits would require a much larger isolation/governance system and allow resource/rule bypass. A fixed menu of named skills would not demonstrate newly generated implementations. The chosen finite language allows new compositions without granting host execution or arbitrary effects. Model semantic judgment and deterministic implementation equivalence serve different purposes; neither is described as universal equivalence checking.

Replacing survival-v1 would silently rewrite ex3 behavior. A separate protocol preserves old replay and archive contracts. An autonomous development agent would add an unrequested service and expense; the existing conversation handoff supplies bounded implementation review instead.

## Costs and future consequences

Capabilities are limited to supported physical primitives; complex technologies are rejected. Worlds need deliberate versioned extensions for new physics. A three-actor, 18-round trial and idle control are not sufficient for causal survival claims. Source changes during a paused run block continuation rather than silently changing history. Interrupted uncertain requests require investigation and never automatic resending. A future recovery policy for uncertain provider outcomes requires a separate design.

[Protocol](../SKILL_LEARNING_EXPERIMENT.md), [architecture](../../ARCHITECTURE.md), [features](../PRODUCT.md), and [execution plan](../exec-plans/completed/pr-15-survival-skill-learning.md) own implementation details and acceptance evidence. Prior protocol decisions remain effective for their existing versions.
