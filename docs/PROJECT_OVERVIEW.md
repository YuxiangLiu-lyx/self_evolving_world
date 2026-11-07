# Project Overview

## Vision

Self-Evolving World explores how autonomous agents might interact in a shared world and how world capabilities could evolve under controlled review. Humans own product direction, rules, and acceptance; Codex helps implement the system. Future autonomous NPCs are distinct from the coding agent.

The current focus is a stable, understandable foundation: base rules stay fixed during a run, and every state transition can be observed and replayed.

## How the world runs

The world is a bounded two-dimensional grid, 16×12 by default, with origin `(0, 0)` at the top left. Agents have names, positions, and inventories. Items start on the ground. World dimensions and vision radius are configured at creation and remain fixed.

Each well-formed action from a known agent advances the logical tick by one. Successful actions, boundary collisions, and unsupported skill attempts all leave records. A tick counts actions, not elapsed seconds. There is currently no automatic AI decision-making.

## Three base skills

- **Move:** travel one cell north, east, south, or west without leaving the world or entering another agent's cell.
- **Pick up:** transfer an item from the agent's current cell to its inventory. The item leaves the ground and is not duplicated.
- **Try:** request an unavailable skill such as `fly`. The world records an unavailable result without executing or unlocking it.

Agents automatically observe other agents and ground items within an inclusive circular radius, 4 cells by default. There are no obstacles or occlusion. Observation consumes no action and updates after every transition.

## Fixed rules and changing state

The [World Foundation](WORLD_FOUNDATION.md) records the permanent starting item catalogue, base skills, and environment. It is not updated with live inventories or future discoveries; evolution must keep extensions separate.

Base settings, types, and skills are concentrated in [world.ts](../packages/world-core/src/world.ts). Rules, settings, and all snapshots are frozen. Actions produce new snapshots without changing history.

Agents can move, collect items, and submit requests while the rules remain fixed. They cannot resize the world or add skills during a run.

## Main modules

```mermaid
flowchart LR
    CLI[CLI example] --> Core[Fixed world core]
    Human[Manual controls] --> Viewer[Browser observatory]
    Viewer --> Core
    Core --> Snapshots[Read-only state and automatic vision]
    Snapshots --> Viewer
    Viewer --> Replay[Seek / play / import / export]
```

- The **core** owns rules and transitions, with no UI, networking, or AI service dependency.
- The **CLI** runs a fixed sequence of move, pickup, and try actions.
- The **observatory** displays the map, inventory, vision, and results, and supports interaction and replay. It loads a 12-action demo with three agents, then allows manual continuation.

Module contracts are in [ARCHITECTURE](../ARCHITECTURE.md). Current feature status and evidence are maintained only in [PRODUCT](PRODUCT.md#current-scope).

## Observing and replaying

Start the viewer using the [quick start](../README.md#five-minute-quick-start). Select an agent on the map or from the dropdown. Global view shows the whole world; agent vision hides entities outside the selected observation. The inspector always shows that agent's inventory and observation at the current frame.

Use direction buttons or WASD to move, then collect items from the same cell. The try field records new capability requests. The timeline supports play, pause, speed changes, stepping, and seeking. Actions are disabled in historical frames; select **Latest frame** to continue.

Export stores initial conditions and actions. Import reconstructs history under the same rules version. Page memory is not automatically persisted across refreshes, so export before leaving. Invalid imports preserve the current world.

## NPC Agent (Planned)

Existing agent entities have positions, inventories, and vision, but their actions come from scripts or manual input. Future NPCs would have needs, goals, memory, and independent decisions submitted through the action protocol. No model is connected.

## World Agent (Planned)

A future World Agent would assess capability requests for suitability, compatibility, permissions, and validation. It would not automatically gain permission to edit production code or execute arbitrary code. No such reviewer currently exists.

## Skill Evolution (Planned)

Future requests may become capabilities through specification, review, isolated testing, and versioning. Current `try` actions only record unavailable names. There is no code generation, sandbox, dynamic registration, activation, or rollback. Attempts do not change the base core.

## Limitations and next steps

There is no terrain collision, occlusion, diagonal movement, continuous physics, trade, or coordinated autonomous decision-making. The browser stores at most 500 actions in memory and accepts replay files up to 1 MB. There is no database, autosave, long-running service, or cross-version migration.

A useful next step is a clear observation-to-action decision interface, tested first with a simple deterministic strategy. The scripted demo must not be presented as autonomous behavior, and attempts must not execute new code without a separate validation and governance design.
