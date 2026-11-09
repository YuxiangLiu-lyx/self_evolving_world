# Survival-driven Skill Learning

This is the separate `learning-v1` protocol and version-4 replay/archive extension. The founding catalogue, base skills and survival-v1/ex3 remain unchanged. Feature status belongs to [PRODUCT](PRODUCT.md); design rationale is in [ADR-0015](decisions/0015-survival-driven-skills.md).

## Rules and environment

Health starts at 100; satiety starts at 15 and is capped at 100. Every round executes actions first, deducts 10 health if satiety is already zero, then deducts 3 satiety with a zero floor. Falling to zero causes no damage until the next round. Without food or other damage, round 5 ends at health100/satiety0, round 6 at health90, and round 15 at death. Death is irreversible. Cold and heat are zero in this minimal temperate protocol; the old temperature experiment keeps its original rules.

The scenario has three actors on a 24 by 18 map, circular vision radius 5, local edible fruit and more distant stock. Trees and rocks are standing objects, not pickup items. Deep river cells block movement; two shallow crossings allow travel between banks. Trees/rocks block their own cell; harvesting requires Manhattan distance at most one. Fisheries occupy river cells and require a usable rod. Initial food is reachable with time for learning, movement, pickup and use before starvation damage. Ordinary observations include only visible terrain/objects/resources and owned inventory, plus the public skill catalogue. There is no occlusion.

| Resource                | Nutrition per unit | Toxicity per unit | Other constraint                                             |
| ----------------------- | ------------------ | ----------------- | ------------------------------------------------------------ |
| Edible fruit            | 24                 | 0                 | Finite ground/tree stock                                     |
| Poisonous fruit         | 12                 | 35                | Costs health when consumed                                   |
| Fish                    | 30                 | 5                 | Rod, adjacent fishery and finite stock                       |
| Branch / stone / timber | 0                  | 0                 | Inedible materials; timber requires an axe                   |
| Rod / axe               | 0                  | 0                 | Three durability; harvesting fish/timber spends one per unit |

Pickup transfers ownership only. A successful consumption removes units and applies nutrition/toxicity under core rules. Zero-quantity resources remain in the audit record but leave inventory. Failed compound uses are atomic: no partial material loss or free effects. Competing uses of the same resource/object all fail, preserving simultaneous semantics.

## Requests, review and executable code

Ordinary actors choose whether to request a capability from their survival goal; their prompt contains no eating/tree-felling/fishing examples or forced diagnostic request. A request includes `name`, `purpose`, `target`, `conditions`, and `expectedEffect`. Only the World Agent prompt includes the requested examples, including primitive-era rejection of spacecraft construction.

The World Agent sees the round-start era, fixed rules, environment/materials, catalogue and applicants' abilities. Each structured review returns `create`, `reuse` or `reject`, a reason, prerequisites and learning duration. A create specification contains an English functional description, parameter names and generated executable code. The core compiles only these bounded statements:

```text
consume("food", 1);
harvest("tree", "fruit", 1);
harvest("tree", "branch", 1);
craft("rod");
```

This is illustrative language syntax, not a program supplied to ordinary actors. One implementation contains at most four statements; each quantity is 1–3. Target parameters bind resource or environment-object IDs at use time. Rod construction costs two branches and one stone; axe construction costs one branch and two stones. There are no imports, host evaluation, variables, loops or arbitrary vital setters. This supports new composed executable capabilities over fixed physical operations, not invention of unrestricted new physics.

The initial skill registry is empty. The compiler derives actual conditions, costs and effects from code. Its signature normalizes parameter names while retaining operation, quantity and order. Equivalent implementations share one stable ID, even for differently named same-round requests; unequal costs/effects remain distinct. The World Agent performs semantic matching before compiler-level deduplication. Code cannot prove the truth of the model's English feasibility judgment.

Registered skills carry version 1, functional description, parameters, conditions, resource costs, effects, default learning duration and code. World registration is separate from each actor's learned IDs and pending progress. Review duration may vary by applicant. Application counts as the first learning round; each subsequent study action advances once. A one-round skill is usable next round; a two-round skill requires two advances. Learning still consumes satiety. Preconditions are enforced when using the capability, even if the actor learned it before obtaining tools.

## Decisions and the round barrier

The fixed experiment lasts 18 rounds, with at most 12 attempted ordinary calls per actor and 12 World Agent attempts total. Plans contain at most four rounds. Every actor decides from the same round-start physical snapshot; sequential network requests do not reveal other actors' current intentions. Recent own feedback is retained for six frames. Learning feedback, action failure, health loss, crossing zero satiety or a nine-point satiety decline interrupts remaining code for replanning. Studying advances automatically without extra model calls. Exhausted ordinary budgets produce explicit waits; exhausted world budgets reject new requests with a reason.

The World Agent reviews a whole request batch before any round transition. Invalid/failed world responses have at most two attempts per batch. Unresolved development or an explicit development request creates a durable barrier. The process exits and the current Codex conversation receives the existing harness handoff. The response can supply or reject constrained implementations; it cannot edit survival rules or tick time. The world advances only after validating the entire response batch. No new coding agent or SDK is involved.

Model calls use the existing ChatGPT-plan OAuth/Responses transport, a 90-second timeout, completed responses only, and no paid API-key fallback. Each attempted call is saved before sending. A crash with an uncertain `started` call blocks continuation without reissuing it. Saved completed decisions are reused. A source fingerprint binds continuation to the same core/simulator implementation; completed historical archives continue to reconstruct by version.

## Run and continue

Record explicit `experiment.mode: "learning"`, `allocation: "new"` and actual instruction basis in a [task intent](TASK_HARNESS.md). No seed or horizon override is supported. Continue through `pnpm task -- next ID`; `pnpm experiment:learning` is a guarded compatibility entry for the same recorded task. The next `exN` is allocated exclusively once. Explicit reuse retains the existing capture-only exception contract; it cannot rerun inference or overwrite a completed archive.

When the coordinator returns `step: "development"`, inspect the supplied barrier and save a result in `validation-results/`:

```json
{
  "barrierId": "COPY_SAVED_BARRIER_ID",
  "tick": 0,
  "reviews": [],
  "notes": "Describe the actual implementation review, costs and validation limits."
}
```

`reviews` must contain exactly every pending applicant's actual structured decision, never an empty approval shortcut. Submit the common handoff binding with `kind: "development"` and `file` pointing to that result. The program validates it, persists the implementation response without advancing a round, and continues the saved execution. A stale barrier, changed source or incomplete response fails closed. Capture recovery remains `pnpm experiment:resume -- exN` and cannot call a model.

## Evidence and limits

Each archive contains the standard goal/results/report/chart/replay/browser images, plus `execution.json` (durable attempts, programs, reviews, development), `model-calls.json` (both exact templates and actual private inputs/outputs), and `skills.json` (persisted executable registry). Replay imports only initial conditions, bounded programs and reviewed action batches, reconstructing all effects without inference. The viewer exposes terrain, resources, vitals, generated implementations and individual learning history.

Validation binds actual model responses to reconstructed inputs, program eligibility, call budgets, review batches and resulting actions. It checks quantities/ownership, independently accounts for survival, compares canonical reports/registry and hashes all archive artifacts. A deterministic all-wait control uses zero model calls and dies at round15. This is a descriptive baseline, not a causal estimate of learning benefit. A completed run can fail its scientific objectives; goal checks are separate from execution integrity.

The existing harness requires a retained per-agent analysis of anomalies, isolation, individuality, causes, uncertainty and proposed improvements after every run. It does not implement those proposals. Full unfiltered checks, every screenshot/full-diff review, reviewed commit, current remote CI, traceable self-review and separately authorized merge remain required. The reviewer is the current conversation, not an independent agent.
