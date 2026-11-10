# Project Overview

## Vision

Self-Evolving World explores how autonomous agents might interact in a shared world and how world capabilities could evolve under controlled review. Humans own product direction, rules, and acceptance; Codex helps implement the system. Future autonomous NPCs are distinct from the coding agent.

The current focus is a stable, understandable foundation: base rules stay fixed during a run, and every state transition can be observed and replayed.

## How the world runs

The world is a bounded two-dimensional grid, 16×12 by default, with origin `(0, 0)` at the top left. Agents have names, positions, and inventories. Items start on the ground. World dimensions and vision radius are configured at creation and remain fixed.

In the original single-action API, each well-formed action from a known agent advances the logical tick by one. Successful actions, boundary collisions, and unsupported skill attempts all leave records. A tick counts actions, not elapsed seconds. Optional CLI experiments request one model decision per founding agent, or run bounded survival programs for 60 synchronous rounds; the browser never starts model requests.

New offline experiments use the [simultaneous-round extension](SYNCHRONOUS_ROUNDS.md): all agents choose from their own round-start observations and commit together. One tick is one complete round; results distinguish rounds from total actions. Existing single-action demos and ex1 retain their original semantics.

## Three base skills

- **Move:** travel one cell north, east, south, or west without leaving the world or entering another agent's cell.
- **Pick up:** transfer an item from the agent's current cell to its inventory. The item leaves the ground and is not duplicated.
- **Try:** request an unavailable skill such as `fly`. The world records an unavailable result without executing or unlocking it.

Agents automatically observe other agents and ground items within an inclusive circular radius, 4 cells by default. There are no obstacles or occlusion. Observation consumes no action and updates after every transition.

## Fixed rules and changing state

The [World Foundation](WORLD_FOUNDATION.md) records the permanent starting item catalogue, base skills, and environment. It is not updated with live inventories or future discoveries; evolution must keep extensions separate.

Base settings, types, and skills are concentrated in [world.ts](../packages/world-core/src/world.ts). Rules, settings, and all snapshots are frozen. Actions produce new snapshots without changing history.

Agents can move, collect items, and submit requests while the rules remain fixed. They cannot resize the world or alter the foundation. The separate learning-v1 protocol can register constrained capabilities under fixed resource rules.

## Main modules

```mermaid
flowchart LR
    CLI[CLI example / bounded model experiment] --> Core[Fixed world core]
    Human[Manual controls] --> Viewer[Browser observatory]
    Viewer --> Core
    Core --> Snapshots[Read-only state and automatic vision]
    Snapshots --> Viewer
    Viewer --> Replay[Seek / play / import / export]
```

- The **core** owns rules and transitions, with no UI, networking, or AI service dependency.
- The **CLI** runs a fixed demo, a [seeded random experiment](../experiment/README.md) without external agents, or the separately invoked [one-round model experiment](ONE_ROUND_EXPERIMENT.md). The model experiment submits each agent's own observation to ChatGPT and validates its returned action before applying it.
- The **observatory** displays the map, inventory, vision, and results, and supports interaction and replay. It loads a 12-action demo with three agents, then allows manual continuation.

Module contracts are in [ARCHITECTURE](../ARCHITECTURE.md). Current feature status and evidence are maintained only in [PRODUCT](PRODUCT.md#current-scope).

## Observing and replaying

Start the viewer using the [quick start](../README.md#five-minute-quick-start). Select an agent on the map or from the dropdown. Global view shows the whole world; agent vision hides entities outside the selected observation. The inspector always shows that agent's inventory and observation at the current frame.

Use direction buttons or WASD to move, then collect items from the same cell. The current interface exposes move and pickup; legacy try records remain readable without a learning-attempt control. The timeline supports play, pause, speed changes, stepping, and seeking. Actions are disabled in historical frames; select **Latest frame** to continue.

Use **Experiment archive** to select a retained run such as **ex2** or **ex1**. The page opens its full interactive timeline, objective, seed and overview chart without file import. Its `?experiment=ex1` URL restores the archive after refresh and supports browser navigation. Archived histories remain read-only at every frame. New runs appear after restarting development or rebuilding the static viewer.

Export stores initial conditions and actions. Import reconstructs history under the same rules version. Local session memory is not automatically persisted across refreshes, so export before leaving. Invalid imports or experiment loads preserve the current world. **Demo / local session**, **New world** and valid file imports leave archive mode.

## Bounded survival programs

The [survival-v1 extension](SURVIVAL_EXPERIMENT.md) adds satiety, cold, heat and health. Dangerous values cause continuing damage and death. The model receives only its actor's observation and public rules, writes finite action/duration code, and replans only when that code finishes, at most five requests per actor. Waiting is explicit; every learning request is denied without a World Agent. The mild ex3 run preserves all three actors through 60 rounds. The viewer shows vital values, active code/progress and learning history at each selected frame. Calls and code are retained for offline validation and replay.

## NPC Agent (Planned)

Existing entities have positions, inventories, and vision. The optional model experiments add a single decision opportunity or a bounded 60-round program controller to scripts and manual input. Future NPCs would have persistent goals, memory, and a continuous decision loop; those capabilities are outside this experiment.

## Bounded World Agent and learning

The [learning-v1 experiment](SKILL_LEARNING_EXPERIMENT.md) uses a separate World Agent to assess functional requests, reuse or generate resource-checked code, and assign individual learning time. A 24 by 18 map adds finite food, terrain, materials and river crossings. Ordinary agents receive survival goals and private recent feedback; plans interrupt on failures, learning feedback and worsening vitals. World development pauses game time and returns to the current coding conversation when needed.

## Skill Evolution (Planned)

Future requests may become capabilities through specification, review, isolated testing, and versioning. Current `try` actions only record unavailable names. The survival controller generates only bounded behavior commands, not new skills. Learning-v1 separately generates bounded resource-operation compositions and tracks individual proficiency. Arbitrary host code, unrestricted new physics and rollback remain outside scope; base try never changes the core.

## Limitations and next steps

The foundation has no terrain collision; learning-v1 adds tree/rock/deep-water blocking. Neither version has occlusion, diagonal movement, continuous physics or trade. The browser stores at most 500 single actions or simultaneous rounds in memory and accepts replay files up to 1 MB. There is no database, autosave, long-running service, or cross-version migration.

The bounded 60-round protocol remains unchanged. The separately designed learning-v1 and evolution-v1 extensions specify their own goals, scheduling, memory and account budgets. Further expansion requires another explicit design decision. The scripted demo must not be presented as model behavior, and founding skill attempts never execute extension code.

## Heterogeneous demand-driven worlds

The [evolution-v1 protocol](EVOLUTION_EXPERIMENT.md) separates unknown resource properties from personal discoveries. Four actors share one autonomous prompt in different regions. The World Agent can add resource types, persistent habitat distributions and costed executable compositions, while the kernel enforces finite stock and survival rules. Version5 histories use the same experiment selector and add map scaling, ecological counts and individual identification. Authored primitives bound this prototype; open-ended physics and social communication remain future scope.
