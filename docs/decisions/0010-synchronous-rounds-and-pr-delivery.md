# ADR-0010: Synchronous Collection Rounds and Default PR Delivery

- Date: 2026-11-08
- Decision status: Accepted

## Context

The user requests ex2 to correct sequential movement, demonstrate successful pickups, improve character/item visuals and remove the learning-attempt control. ex1 recorded 41 pickup attempts but no successful collections. The user also requires a fresh number for each new experiment unless explicitly overridden, and automatic PR delivery for code and experiment work.

## Decision

Keep the founding single-action reducer and archived ex1 unchanged. Add the separately versioned [simultaneous-v1 extension](../SYNCHRONOUS_ROUNDS.md) in the existing pure core file and replay version 2 in the viewer. Resolve every actor from the same starting state; reject initially occupied cells and all competing moves to one destination. One round creates one snapshot with all outcomes.

Use an explicit seeded local collection policy: always collect same-cell items; otherwise combine visible-item attraction with random exploration. No try requests or model calls participate. Preserve the old generator for exact archived reconstruction. Use local SVG illustrations, retain accessible text and safe imported names, and remove only the current try control.

Exclusive exN allocation remains the default. The harness and PR preflight compare existing archives against origin/main and reject modification, deletion or added files. A current changed execution plan may record the user's explicit exception as `- Experiment reuse: exN — reason of at least twenty characters`; semantic review verifies that authorization. This exception never waives artifact, full-suite or PR requirements. Failed visual capture may be explicitly resumed without replacing the recorded simulation.

All task routes continue automatically after local review to a clean reviewed commit, exact requirement-mapped PR body and `task:publish`. The publisher checks the canonical repository and branch, fetches main, requires it as an ancestor, runs PR preflight, pushes without force, creates/updates an open PR and verifies matching head/body and successful current quality/pr-policy checks. It keeps a local delivery receipt and never merges. Authentication uses an existing Git credential or GITHUB_TOKEN; errors do not expose credentials. A connector-created PR can use verify-only mode. Local validation alone is not delivery.

## Alternatives and reasons

- Sequential updates with grouped animation would still bias collision resolution and observations by turn order. Actual simultaneous state transitions are required.
- Changing replay version 1 would invalidate historical artifacts and blur the foundation contract. A separate schedule and replay version keep both auditable.
- Random pickups of merely visible items reproduce ex1's failed collection behavior. Same-cell priority respects the founding reach constraint.
- Allowing swaps or movement chains adds conflict semantics outside this bounded correction. Conservative start occupancy is deterministic and easy to inspect.
- Automatically approving visual/requirement review would fabricate evidence. Publication begins only after an actual completed review and clean commit; agents perform those steps without repeatedly asking the user.

## Costs and consequences

The archive validator supports two policy/replay generations. Rounds require extra events and explicit action/round counts. Conservative collisions can cause temporary congestion; random exploration is not guaranteed to collect every item for every seed. Default PR delivery needs GitHub access and remote CI availability; missing access/checks is an incomplete task, not permission to claim delivery. The publisher cannot prove honest review, and the recorded reuse exception requires semantic inspection. Neither workflow changes nor this ADR alter GitHub protection settings or authorize merging.

See [PR-10](../exec-plans/completed/pr-10-synchronous-ex2.md), [architecture](../../ARCHITECTURE.md), [validation](../VALIDATION.md) and the [PR contract](../PULL_REQUESTS.md).
