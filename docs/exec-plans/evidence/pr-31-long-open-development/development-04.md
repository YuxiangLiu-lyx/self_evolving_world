# Round 19: externally interrupted invocation

The conversation turn was externally interrupted while the coordinator was running.
Inspection found no remaining coordinator or continuous inference worker, a dead
execution lease for PID 48819, and no durable result for `ordinary-38`. The retained
checkpoint still had one started Lin invocation at tick 19. Its API outcome, elapsed
request duration and token usage are unknown; none is inferred from process death.

The existing `task repair` entry now verifies the dead lease and absent workers,
requires exactly one final started ordinary call in this task's unpublished long
run, and refuses a durable result or ambiguous call journal. It retains the original
checkpoint under `experiment/ex13/technical-pauses/round-19/`, writes the explicit
unknown failure record, preserves all previous outcomes/work and keeps the full
33758-token reservation. The original invocation is never resent. A fresh counted
decision after the empty technical handoff receives an abandonment notice. No model
response, exit status, action or success is fabricated.

A real follow-up failed with `Development baseline changed` after a test-only lint
format correction. The baseline comparison had rechecked the complete source hash
even after confirming identical runtime source. The fix preserves the original
source receipt and still requires the runtime guard plus exact world, attempts,
barrier and source-history identity. Test/tool formatting cannot invalidate paid
work; runtime or evidence changes remain blocking. This affects acceptance only,
not goals, scheduling, physics, prompts or budgets.

This fourth counted handoff is technical recovery, not an actor request, world
approval or learned capability. No packages, assignments or actions are supplied.
Isolated regression coverage verifies retained reservations, no invented responses,
ambiguous-call rejection, dead-process prerequisites and baseline identity guards.
Full adapter checks and exact prior replay are required before continuation.
