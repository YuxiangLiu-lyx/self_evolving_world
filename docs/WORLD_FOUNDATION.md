# World Foundation

**Foundation version: 1. Core rules version: `1`.**

This document defines the fixed foundation of the first world: its starting items, base skills, and basic environment. It remains unchanged as the world runs or evolves. It records the starting specification, not the current inventory, action history, or catalogue of future discoveries.

## Starting items

The initial viewer world contains six individual items, one of each name. All start on the ground. Coordinates refer to tick 0, before any actions.

| Item    | ID        | Initial count | Starting cell `(x, y)` |
| ------- | --------- | ------------- | ---------------------- |
| Wood    | `wood`    | 1             | `(3, 3)`               |
| Stone   | `stone`   | 1             | `(5, 2)`               |
| Berry   | `berry`   | 1             | `(8, 4)`               |
| Crystal | `crystal` | 1             | `(11, 8)`              |
| Seed    | `seed`    | 1             | `(13, 3)`              |
| Water   | `water`   | 1             | `(3, 8)`               |

Every starting item follows the same rules:

- It has a unique ID and a display name. These are individual item instances, not a crafting or resource-type system.
- An agent can see it within vision range and collect it only from the same cell.
- Pickup moves it from the ground into exactly one agent's inventory. Its ID and name remain unchanged; it is not copied or destroyed.
- Ground items do not block movement. Carried items move with their owner and have no separate ground position.
- There is no item weight, stacking, consumption, regeneration, crafting, dropping, or trading in the foundation.

Names do not grant effects: Wood cannot be burned, Stone cannot be crafted into tools, Berry cannot be eaten, Crystal supplies no energy, Seed cannot be planted, and Water cannot be drunk using the base skills. Any future use requires a separately defined extension; it does not change this founding catalogue.

## Base skills

Every agent starts with exactly three base skills. They require no learning, items, or unlocking.

| Skill   | Action ID | Input                                                   | Result and limits                                                                                                                                                                                                                 |
| ------- | --------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move    | `move`    | One direction: `north`, `east`, `south`, or `west`      | Move exactly one cell. Crossing the world boundary or entering another agent's cell is rejected. No diagonal movement, wrapping, or teleportation.                                                                                |
| Pick up | `pickup`  | The ID of a ground item                                 | Transfer the item to the acting agent's inventory if both occupy the same cell. A missing item or an item in another cell is rejected. No duplication or remote pickup.                                                           |
| Try     | `try`     | The name of a requested skill, such as `fly` or `plant` | Record `skill-unavailable` for an unknown skill. The request does not execute, create, or unlock it. Repeated attempts remain unavailable. Requesting an existing base skill returns `skill-already-exists` without executing it. |

Each action identifies its acting agent. A well-formed action from an existing agent advances one tick and records its result, including rejected moves, failed pickups, and unavailable attempts. Rejection leaves positions and ownership unchanged. Malformed commands and unknown agents do not produce a new tick.

**Automatic vision is always available and is not a fourth skill.** It requires no action or tick. At creation and after every action, each agent receives its own state and inventory, other agents' public positions and names, and ground items within its vision radius. Other agents' inventories are not included.

## Basic environment

| Setting          | Foundation value                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------- |
| World            | A bounded, flat two-dimensional grid                                                         |
| Width and height | 16 × 12 cells                                                                                |
| Coordinates      | Integer cells; origin `(0, 0)` at the top left; `x` increases east and `y` increases south   |
| Valid positions  | `0 ≤ x < 16`, `0 ≤ y < 12`                                                                   |
| Vision           | Circular radius of 4 cells, including the boundary; Euclidean distance                       |
| Occlusion        | None; there are no walls, terrain obstacles, or facing restrictions                          |
| Agent occupancy  | At most one agent per cell                                                                   |
| Time             | Tick 0 at creation; one tick per accepted command, including commands with rejected outcomes |

The starting population is Lin (`lin`) at `(2, 3)`, Moss (`moss`) at `(8, 5)`, and Sol (`sol`) at `(12, 8)`. Each has an empty inventory and the same three base skills and vision rules. Actions currently come from manual controls or scripts.

Select **New world** in the viewer to see this starting state. The page initially loads a 12-action demonstration, so its displayed positions and remaining ground items may already differ from tick 0. Those changes are history, not changes to the foundation.

## What evolution may and may not change

The foundation's item identities, starting catalogue, skill definitions, and environment specification are permanent for version 1. The running world may change agent positions, item ownership, observations, ticks, and action history. Picking up Wood does not remove Wood from this document's starting catalogue.

Future evolution must record new items, capabilities, and their effects in separate versioned extension definitions and runtime state that reference this foundation. It must not append discoveries to this document, redefine a base skill, replace a founding item, or rewrite the initial conditions. For example, a future planting capability would be an extension; the base `try` skill would still only record requests. The extension mechanism is not implemented yet.

This is a fixed specification, not a runtime-editable configuration file. Neither simulation code nor future NPC or World agents may rewrite it. Wording corrections may clarify the same semantics; a different foundation requires an explicitly authorized, separately versioned specification that preserves version 1.

## Relationship to the implementation

- [world.ts](../packages/world-core/src/world.ts) implements the fixed rules, three base skills, default dimensions, and vision. Runtime rules and settings are frozen, and transitions preserve earlier snapshots.
- [scenario.ts](../apps/viewer/src/scenario.ts) supplies the six starting item instances and three starting agents above. These entities belong to the initial scenario, not to a hardcoded item-type registry in the core.
- The core API also accepts custom setups when creating a different world; calling `createWorld()` without entities creates an empty world. Custom or imported setups are separate initial conditions and do not revise this founding specification. Their settings remain fixed during their own run.
- [ARCHITECTURE](../ARCHITECTURE.md) owns technical interfaces and dependency boundaries; [PRODUCT](PRODUCT.md) owns implementation status. Neither live state nor future feature progress should be copied into this document.
