# ADR-0012: Bounded Survival Programs with Plan-Funded Inference

- Date: 2026-11-09
- Decision status: Accepted

## Context

The user requests a new survival experiment using an existing ChatGPT Pro subscription, with no additional API spend. Each actor must execute 60 rounds, request another model-generated program only when its previous one finishes, and use at most five calls. The first run should validate real invocation under mild conditions. Skill learning can be requested but must always be denied without a World Agent.

## Decision

Use the existing official direct-plan OAuth boundary and public Responses endpoint. Keep all networking and credentials in the simulator. Preserve the one-round adapter and historical archives. Add a separate survival-v1 extension, finite behavior interpreter and deterministic program scheduler to the pure core; preserve base skills in world.ts. The internal synchronous resolver supports idle actors while retaining conservative occupancy and collision semantics.

Use explicit move/pickup/wait/learn statements instead of arbitrary generated host code. The model chooses action durations, but the interpreter binds the actor, rejects unsupported syntax and bounds expansion by the remaining horizon. Keep all program scheduling and replay reconstruction deterministic; an application loop supplies provider results and persists an attempt before making a request. Failures consume budget, remain visible and cause labeled wait fallback. Never silently repeat an interrupted inference or purchase credits.

Introduce replay/manifest version 3, preserving versions 1 and 2. Reconstruct histories from saved programs, then independently compare recorded model inputs/outputs, budgets, vital trajectories and artifacts. New experiments receive fresh numbers. Extend the shared viewer with code, vital and learning history; only validated replay/chart assets are published to the browser. Full request evidence remains in the repository archive, without credentials or reasoning traces.

## Alternatives and reasons

Arbitrary Python/JavaScript would require a much broader isolation and permissions design. A fixed heuristic would not test model-authored code. Per-round requests would spend up to 180 calls and violate the five-call choice. Long-lived external agent sessions would add memory, tools and scheduling outside this bounded test. A private ChatGPT proxy or paid API-key fallback is unnecessary for the documented direct-plan route and conflicts with the requested account boundary.

Rewriting the foundation or old archives would invalidate historical interpretation. Separate versioned rules preserve that history. Adding food effects, terrain or a reviewer model would expand scope; mild exposure validates this integration without those extensions.

## Costs and consequences

This is a bounded controller, not an open-ended autonomous NPC system. Plan eligibility and quotas remain external dependencies. Programs cannot react mid-execution; rejected actions still consume rounds. Cold/heat are uniform environment exposures, and items have no survival effects. All learning requests are denied. Client evidence can detect inconsistency but cannot prove provider authenticity. Future protocols must preserve this version's reconstruction semantics and allocate new experiment records.

This extends [ADR-0007](0007-single-round-model-adapter.md) for a separately invoked controller; its original one-round behavior remains unchanged. [ADR-0010](0010-synchronous-rounds-and-pr-delivery.md) collision semantics and [ADR-0011](0011-default-merge-completion.md) delivery gates remain applicable. See the [protocol](../SURVIVAL_EXPERIMENT.md) and [plan](../exec-plans/completed/pr-12-subscription-survival-ex3.md).
