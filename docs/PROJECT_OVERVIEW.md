# Project Overview

## Vision

Self-Evolving World explores how autonomous agents might interact in a shared world and how world capabilities could evolve under controlled review. Humans own product direction, rules, and acceptance; Codex helps implement the system. Future autonomous NPCs are distinct from the coding agent.

The current focus is a stable, understandable foundation: base rules stay fixed during a run, and every state transition can be observed and replayed.

The main page now opens the [continuous-world game observatory](CONTINUOUS_WORLD.md). It renders saved continuous or historical worlds without advancing simulation. The founding-grid descriptions below apply to the original protocol and the manual inspector at `/classic.html`; they do not restrict the independently versioned continuous world.

## Collective life observation

The latest [collective protocol](COLLECTIVE_LIFE.md) keeps eighteen independent
members in three groups. Each group shares a bounded scheduler and model entry,
with separately constructed public coordination and personal contexts. A uses
shared observed information; B retains private knowledge, mild seeded preferences
and persistent intentions. Messages, reports, transfers and learning require
real actions. Fresh skill scopes isolate both arms and every historical run.

The [retained campaign](exec-plans/evidence/pr-25-collective-life/final-results.md)
paused A at 7 rounds, B short at 37, and the same B checkpoint at 136 cumulative
rounds. Bark extraction, material combination, sample opening, one stone transfer
and an unfinished tray are observed outcomes. The intended matched 200-round
comparison and 1,600-round continuation were not achieved within the frozen
allocations; sustained collective productivity remains unproven. The viewer
shows group identity, each member's actual knowledge, intent and task alongside
physical state. Feature acceptance remains in [PRODUCT](PRODUCT.md).

## How the founding world runs

The world is a bounded two-dimensional grid, 16×12 by default, with origin `(0, 0)` at the top left. Agents have names, positions, and inventories. Items start on the ground. World dimensions and vision radius are configured at creation and remain fixed.

In the original single-action API, each well-formed action from a known agent advances the logical tick by one. Successful actions, boundary collisions, and unsupported skill attempts all leave records. A tick counts actions, not elapsed seconds. Earlier experiments requested one model decision per founding agent or ran bounded survival programs for 60 synchronous rounds; the browser never starts model requests.

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
    CLI[Experiment commands] --> Core[Fixed world core]
    Human[Manual controls] --> Viewer[Browser observatory]
    Viewer --> Core
    Core --> Snapshots[Read-only state and automatic vision]
    Snapshots --> Viewer
    Viewer --> Replay[Seek / play / import / export]
```

- The **core** owns rules and transitions, with no UI, networking, or AI service dependency.
- The **experiment commands** run a [seeded random experiment](../experiment/README.md) without external agents or a model-driven continuous world; see the [development workflow](DEVELOPMENT.md#experiments).
- The **classic inspector** displays the map, inventory, vision, and results, and supports interaction and replay. It loads a 12-action demo with three agents, then allows manual continuation.

Module contracts are in [ARCHITECTURE](../ARCHITECTURE.md). Current feature status and evidence are maintained only in [PRODUCT](PRODUCT.md#current-scope).

## Observing and replaying

Start the viewer using the [quick start](../README.md#quick-start). Select an agent on the map or from the dropdown. Global view shows the whole world; agent vision hides entities outside the selected observation. The inspector always shows that agent's inventory and observation at the current frame.

On `/classic.html`, use direction buttons or WASD to move, then collect items from the same cell. The current interface exposes move and pickup; legacy try records remain readable without a learning-attempt control. The timeline supports play, pause, speed changes, stepping, and seeking. Actions are disabled in historical frames; select **Latest frame** to continue.

Use **Experiment archive** to select a retained run such as **ex2** or **ex1**. The page opens its full interactive timeline, objective, seed and overview chart without file import. Its `?experiment=ex1` URL restores the archive after refresh and supports browser navigation. Archived histories remain read-only at every frame. New runs appear after restarting development or rebuilding the static viewer.

Export stores initial conditions and actions. Import reconstructs history under the same rules version. Local session memory is not automatically persisted across refreshes, so export before leaving. Invalid imports or experiment loads preserve the current world. **Demo / local session**, **New world** and valid file imports leave archive mode.

## Bounded survival programs

The [survival-v1 extension](SURVIVAL_EXPERIMENT.md) adds satiety, cold, heat and health. Dangerous values cause continuing damage and death. The model receives only its actor's observation and public rules, writes finite action/duration code, and replans only when that code finishes, at most five requests per actor. Waiting is explicit; every learning request is denied without a World Agent. The mild ex3 run preserves all three actors through 60 rounds. The viewer shows vital values, active code/progress and learning history at each selected frame. Calls and code are retained for offline validation and replay.

## Unattended NPC service (Planned)

Existing entities have positions, inventories, and vision. Earlier model experiments added a single decision opportunity or a bounded 60-round program controller. The continuous protocol separately provides persistent individual memory, goals and conditional tasks. An unattended production service remains outside the bounded experimental controllers.

## Bounded World Agent and learning

The [learning-v1 experiment](SKILL_LEARNING_EXPERIMENT.md) uses a separate World Agent to assess functional requests, reuse or generate resource-checked code, and assign individual learning time. A 24 by 18 map adds finite food, terrain, materials and river crossings. Ordinary agents receive survival goals and private recent feedback; plans interrupt on failures, learning feedback and worsening vitals. World development pauses game time and returns to the current coding conversation when needed.

## Founding skill boundary and later extensions

Later protocols turn functional requests into capabilities through specification, review, testing and versioning. Current `try` actions only record unavailable names. The survival controller generates only bounded behavior commands, not new skills. Learning-v1 separately generates bounded resource-operation compositions and tracks individual proficiency. The continuous protocol accepts reviewed versioned host-code packages; unrestricted unreviewed code and general rollback remain outside scope. Base try never changes the founding core.

## Limitations and next steps

The foundation has no terrain collision; learning-v1 adds tree/rock/deep-water blocking. Neither version has occlusion, diagonal movement, continuous physics or trade. The classic importer stores at most 500 single actions or simultaneous rounds in memory and accepts replay files up to 1 MB; the continuous viewer uses separately indexed segments. The founding demo has no database, autosave or migration. Continuous experiments separately retain durable checkpoints, calls, source versions and explicit package migrations; they are not a long-running service.

The bounded 60-round protocol remains unchanged. The separately designed learning-v1 and evolution-v1 extensions specify their own goals, scheduling, memory and account budgets. Further expansion requires another explicit design decision. The scripted demo must not be presented as model behavior, and founding skill attempts never execute extension code.

## Heterogeneous demand-driven worlds

The [evolution-v1 protocol](EVOLUTION_EXPERIMENT.md) separates unknown resource properties from personal discoveries. Four actors share one autonomous prompt in different regions. The World Agent can add resource types, persistent habitat distributions and costed executable compositions, while the kernel enforces finite stock and survival rules. Version5 histories use the same experiment selector and add map scaling, ecological counts and individual identification. Authored primitives bound this prototype; open-ended physics and social communication remain future scope.

## Development beyond survival

The [coevolution-v1 protocol](COEVOLUTION_EXPERIMENT.md) adds a separate three-actor observation of reliable supply, reduced repetitive work and living conditions. Costed carrying/rest, persistent shared objects, delayed resource processing and personal projects give goals observable consequences. Basic eating is authored initial knowledge; later capabilities still require reviewed implementation and individual learning. The existing task harness and viewer retain the real observation and stop the entire world when attempted-call budgets are exhausted.

## Continuous world and persistent wellbeing

The independent [continuous protocol](CONTINUOUS_WORLD.md) uses fractional positions, swept collision, private-knowledge navigation and distance-based energy costs. Ordinary goals are health, survival and happiness; personal tasks and preferences are optional. Happiness combines actual physical comfort with reviewed event-grounded sources. New executable, spatial, lifecycle, presentation or private-memory mechanisms return to the current conversation for versioned development. Installation does not grant objects, materials or mastery.

The main game observatory provides zoom, pan, follow, minimap, timeline comparison, event location and recorded actor/task/source panels. It reconstructs checksummed segments and keeps historical grid semantics explicit. Three initial actors share attempted-call budgets of 400 ordinary, 60 world and 20 current-conversation development handoffs across a first 1,000-round target window; developer-internal usage is unknown. Checkpoints preserve identities and budgets for later authorized continuation. Current acceptance and experiment evidence remain in [PRODUCT](PRODUCT.md).

## Forest ecology and finite lives

The opt-in [forest extension](FOREST_WORLD.md) preserves the founding catalogue and all earlier replay semantics. A 48 by 36 continuous environment contains 26 material/resource definitions, regional terrain, real enclosure passages, deterministic animals, finite food, gradual climate and condition-based growth. Each identity has three lives; actual death drops conserved possessions, cancels current work and preserves learned skills and important history. World time continues across lives but pauses during inference and development.

Experience review covers executable effects, personal conditions and visible results. The real ex8 window added attention, food assessment, a shared insulating shelter, paid warming and route inspection through the current conversation. Their use and limitations are retained in the [behavioral analysis](../experiment/analyses/ex8/pr-21-forest-lives.md). No death occurred before the original budget stopped the window at 897 rounds, and Lin's final food risk remained unresolved. Isolated lifecycle and maintenance tests remain explicitly separate from formal discoveries. Feature acceptance remains in [PRODUCT](PRODUCT.md).
