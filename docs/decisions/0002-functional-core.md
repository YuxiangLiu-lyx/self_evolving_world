# ADR-0002: Pure World Core and Outer CLI

- Date: 2026-11-06
- Status: Accepted

[ADR-0004](0004-fixed-world-and-replay.md) extends the state structure and nested freezing strategy for PR-01. This record preserves the original PR-00 context.

## Context

The long-term simulation may involve UI, models, persistence, and autonomous agents, but PR-00 only needed to demonstrate a working engineering path. Business logic must run independently of UI and external AI services.

## Decision

Create `world-core` and `simulator`. The core exposes `createWorld`, `stepWorld`, and read-only `WorldState`; the CLI holds snapshots, orchestrates three steps, and prints JSON. The core has no Node types or runtime dependencies and returns new frozen state objects. Cross-package access uses the public entry point.

Use [dependency-cruiser](../../dependency-cruiser.config.cjs) for core independence, allowed application dependencies, public entry points, cycles, and resolution errors. ESLint restricts common implicit clock and randomness access. Rules target existing modules and must expand when modules are added.

## Alternatives

- Keeping rules in the CLI would initially reduce files but mix orchestration and transitions.
- A mutable global World object would increase implicit state, ordering dependencies, and test isolation costs.
- An early ECS, plugin system, agent framework, or shared-types package would lock in design without demonstrated requirements.

## Reasons

Pure functions make determinism and input immutability testable. Two real packages make architecture enforceable and data flow understandable without speculative interface layers.

## Costs

Read-only snapshots allocate new objects. At this decision's original PR-00 stage, `Object.freeze` protected shallow state only. A simple tick does not establish an entity or action design. Lint and import rules constrain known patterns; they are not a proof of purity or an execution sandbox.

## Consequences

Nested state, actions, explicit randomness, and event ordering need concrete designs and tests. Future models and I/O should provide explicit inputs through outer adapters. The bootstrap example must not be presented as an NPC or skill evolution engine.
