# ADR-0031: Two villages on a wide map

- Date: 2026-11-26
- Decision status: Accepted (implementation; first use is experiment D)
- Builds on: [ADR-0029](0029-culture-v2.md)

## Context

Experiment D asks what happens when two groups, each with its own names, sayings and ways,
meet. They must not be able to see or hear each other at first. Hunger, not a prompt, must
bring them together. The ex13 world is too small for this: any two starts can be reached
within a few dozen rounds.

## Decision

- `long-culture-v2-villages` keeps the culture v2 prompt and rules. A test shows that the
  instructions and every non-world input field are byte-identical to `long-culture-v2`.
- The scenario builds a 144 × 36 map: the ex13 neighborhood in the west, its mirror image in
  the east and a meadow between them with 48 regenerating food plants. The village larders feed
  three people for about 98 rounds.
- The groups' closest starts are 111.6 units apart. The bound 2 × 60 × 0.8 + 5 = 101 proves
  that no one can see or hear the other group in the first 60 rounds. One channel is outside the
  bound: an `invite` may name any dry meeting point. It is left as in v2 and checked after
  the run.
- Herds now follow peers of the same `data.group`, which defaults to the species, so the
  mirrored herds do not walk across the map toward each other. Every existing archive has
  group equal to species and replays exactly.
- `longDevelopment.firstWindow` sets the first observation window (100) without changing
  `experience.targetRounds`, which the World Agent input shows.
- The per-round computation budget is three times v2's (6,000,000 work units), for the map's
  three times the area. It is an engine limit, not a rule people see.

## Alternatives and reasons

- **Placing the groups on the ex13 map.** No two starts are far enough apart.
- **Telling people about the meeting area.** It would make the encounter an instruction.
- **Hiding the groups behind obstacles.** Line of sight is not modeled, and hearing uses the
  vision radius, so distance is the only reliable separation.

## Costs and consequences

The genesis oracle had to share food sources among people, for this tag only, because the
nearest-source assignment starves one person per group. The longer trips raise computation
per round. The viewer frames wide maps by their proportions. Earlier maps keep their
framing; only minimap clicks were corrected. See [Villages](../CULTURE_SCENARIO.md#villages).
