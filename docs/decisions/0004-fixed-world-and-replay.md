# ADR-0004: Fixed World Core and Verifiable Replay

- Date: 2026-11-06
- Status: Accepted
- Extends: the state structure and freezing strategy in [ADR-0002](0002-functional-core.md), preserving the pure core and outer applications.

## Context

The user requested one file for immutable base settings and three skills: move, pickup, and try. Requirements also included automatic vision, world bounds, visualization, and history replay. This authorization expanded the PR-00 tick example into a grid world without autonomous decisions or dynamic skill generation.

## Decision

1. Put base types, settings, rules, validation, transitions, and observations in `world.ts`; let `index.ts` only export the public API.
2. Use a bounded integer grid, single-cell cardinal moves, non-overlapping agents, same-cell pickup, and Euclidean vision without occlusion. Settings are fixed at creation; rules and nested snapshots are frozen.
3. Advance one tick per ordered action. Well-formed but rejected actions still record outcomes; malformed input and unknown agents throw without a new snapshot. There is no concurrent action scheduler.
4. `try` only records unavailable requests. Repeated attempts do not register abilities, and existing-skill requests do not imply execution.
5. Use native TypeScript, DOM/CSS, and Vite for the viewer. Reuse the core without CLI/viewer coupling. View selection and playback timing belong to the application.
6. Keep immutable snapshots for constant-time seeking; playback only reads them. Export initial conditions and actions; validate file format, rules version, and limits before reconstruction. Do not accept arbitrary snapshots or executable code.
7. Test the built page with Playwright and include browser tests in check and CI. Tool references were the [Vite guide](https://vite.dev/guide/) and [Playwright webServer documentation](https://playwright.dev/docs/test-webserver).

## Alternatives

- Continuous coordinates, collision engines, and ECS would increase validation costs without requirements for velocity, physics, or complex entity composition.
- Dynamic skill registration would contradict immutable base rules; future extensions need a separate design.
- Storing actions alone and resimulating every seek would save snapshot memory but repeat transitions during navigation.
- Trusting imported snapshots could accept invalid worlds and unverifiable trajectories.
- React or a game framework would add runtime machinery unnecessary for this grid, form, and timeline.
- Automatic database or cloud storage would introduce services without a multi-device requirement.

## Reasons

One compact, deterministic rule file is easy to read and test. Computing observations in the core avoids duplicate vision implementations. Snapshots support smooth playback, while import reconstruction applies the same rules to saved histories. Native browser APIs provide an adequate interactive validation surface.

## Costs

Nested freezing and observations increase allocations; snapshots consume memory. This stage limits worlds to 32 agents, 256 items, and 500 history actions. Files are limited to 1 MB and browser history is not automatically persisted. Revisit the single-file boundary if the core grows, while preserving a clear fixed foundation.

Initialization and returned state changed from PR-00, and `stepWorld` now requires an action. Callers, tests, and documentation were upgraded together. There were no published external API consumers.

## Consequences

Rule changes need explicit versioning; old histories must not silently replay under different semantics. Future decision makers should consume observations and submit the existing action protocol. Future skills require independent review and isolation rather than changes to base skills during a run. Concurrent actions, occlusion, server storage, and cross-version migration await explicit requirements.
