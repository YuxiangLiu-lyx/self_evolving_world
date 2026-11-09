# Synchronous Round Extension

This extension preserves the [version-1 foundation](WORLD_FOUNDATION.md). It adds scheduling, not skills, items, learned behavior or external agents. [ADR-0010](decisions/0010-synchronous-rounds-and-pr-delivery.md) records the decision; [PRODUCT](PRODUCT.md) owns feature status.

## Atomic round semantics

`stepWorldRound(state, actions)` accepts exactly one valid action for every existing agent. Duplicate, missing, unknown or malformed actor commands, empty populations and invalid/overflowing ticks throw before a result is returned. The input stays immutable. The core uses no clocks, I/O or randomness.

All candidates are evaluated against the same starting snapshot using the existing base action semantics. Initially occupied destinations remain blocked, even if their occupants intend to move; swaps and following into a vacated cell in the same round are blocked. When multiple valid movers target the same empty cell, all receive `occupied` and stay at their starting positions. Other agents can still move or collect. Input array order does not confer priority; committed events follow the stable state-agent order.

Same-cell pickups transfer an item exactly once. Movement and independent pickups commit together; observations are rebuilt only for the committed frame. Each round advances `tick` by one, with `event: null` and a frozen `events` array containing every actor's result at that tick. The public `stepWorld` API retains its original single-action behavior and singular event, including its record-only `try` outcomes.

## Replay and interface

Replay format `self-evolving-world/replay`, version `2`, keeps `coreVersion: "1"`, adds `schedule: "simultaneous-v1"`, and stores `rounds: WorldAction[][]` instead of `actions`. Initial settings/entities remain explicit. Imports reconstruct every round, enforce one action per actor, and cap history at 500 rounds / 501 frames and 1 MB. Version 1 continues to reconstruct single actions exactly as before.

The viewer labels these frames **ROUND**, shows all actor outcomes together, and advances every agent on the same playback step. Round histories are read-only even when imported locally; **New world** returns to manual single-action controls. The current interface provides move and pickup controls with local vector illustrations. Legacy try records remain visible; there is no learning-attempt control.

## Seeded collection policy

New numbered experiments use `xorshift32-collection-v2` with an explicit nonzero 32-bit seed. Default seed `20261107` and 160 rounds yield 480 actions for the three founding agents. Supported runs contain 3–500 rounds. Each actor receives only its own round-start observation. A same-cell item always triggers a uniformly selected pickup. Otherwise, with visible items, a 65% branch chooses a nearest visible item and a random cardinal direction that reduces Manhattan distance; a 35% branch chooses any cardinal direction uniformly. Ties are random. Without visible items, movement is uniform. Rejected moves are recorded without retry.

The policy never issues try requests or model calls. It is a fixed heuristic, not learning or intelligent planning. A seed need not collect all items, especially in a short run. The collection experiment validator requires at least one successful pickup and rejects a run that fails to demonstrate its stated objective. Failed records remain visible to validation and are never silently discarded.

## Evidence and compatibility

Experiment manifest version 2 records this policy/schedule; `steps` remains the frame index limit, now rounds. Results additionally distinguish `rounds`, `totalActions`, and `framesChecked`. Independent validators check all snapshots, simultaneous destinations/outcomes, item transfers, observations, fixed rules and conserved ownership; archives must match seeded reconstruction, canonical reports/charts and content hashes.

The [ex2 report](../experiment/ex2/report.md) records the actual outcome. The [ex1 archive](../experiment/ex1/report.md) retains its original version-1 generator, sequential actions, try records, reports and images. Current browser validation produces fresh review images without rewriting those historical artifacts. Compare action counts across schedules, not tick counts.
