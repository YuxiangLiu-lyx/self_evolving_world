# Ex9 analysis method

The formal archive is one fixed-seed observation, not a selected rerun. Its
`execution.json` is the authoritative attempted-call ledger, development ledger
and final world. `calls/` retains the original observations and responses;
`source-history.json` and `sources/` retain activation boundaries. `replay.json`
selects authoritative execution segments; original superseded segments remain
archived and are not counted twice. `results.json` is generated from validated
reconstruction, never model-generated arithmetic.

## Counting rules

- A model attempt counts when started, including failed or rejected attempts.
  Recorded token usage is summed separately by ordinary/world role. Missing
  usage is unknown, never zero. Counted current-conversation development
  handoffs are separate from unmetered internal developer calls, reasoning,
  preparation, review and monetary charges.
- Decision frequency is ordinary attempts divided by observed actor-rounds.
  Completed full operations, their progress rounds and individual mastery are
  different quantities. Existing ex8 interfaces in the initial world require
  personal learning but are not new ex9 developments.
- Reference failures before execution appear in ordinary call reasons; failures
  during execution appear in replay events. Report both without double-counting
  one underlying incident as two failed world actions. Self-message events and
  message-triggered decisions are counted separately.
- Body, temporary meal pleasure, slow mental state and source satisfaction are
  separate fields. The ten-meal history counts actual substantial intake episodes,
  not every mouthful. Food-event counts use actual resource identities and processing; they count successful `ate` events, not consumed units.
  Mental rest factors and recovered energy come from actual `rested` events;
  paid recuperation has separate charges, recovery and healing measurements.
- A successful completion does not establish sustained benefit. Insulation,
  shelter, fire and canopy events contain same-round component measurements;
  their sum is a diagnostic total, not a causal estimate of total temperature,
  health or lifetime labor savings. Count positive measurements and actual users.
  Durable item/structure identity, paid repair, transferred material, repeated
  use and retained restored health are stronger evidence than names or grants.
- Inspect every200-round checkpoint and classify action rounds consistently.
  Navigation can serve food, exploration or a project, so do not label every
  navigation round as survival labor. Report the actual action distribution,
  representative plans and stated purposes before interpreting repetitive work.
- Death/respawn conclusions use formal `died`/`respawned` events. Isolated attacks,
  deliberate fixture boundary states and feasible survival oracles do not count.

## Reproduction and limitations

Install the pinned repository toolchain and run the existing scoped task checks
or explicit `pnpm validate:audit -- "Ex9 archive audit"`. These commands perform
no inference. Open the local read-only replay after setup and seek the cited
rounds; the selected actor view must be distinguished from global inspection.
Raw recorded inputs, actual event IDs and source versions explain each claim.
The generated results expose role costs, actions, requests, learned baseline
interfaces, new interface execution, complete operations, reference invalidations,
meals, recovery,20-round trajectories and physical benefit events.

The retained technical pauses and four reversible input-representation changes
are experimental interpretation limitations even though expansion preserves all
facts. Generated mechanisms were activated only after full prior-prefix replay.
Comparisons with ex8 also differ in seed, pressure, baseline catalogue, budget
and observation duration. They are exploratory comparisons, not effects of an
isolated mechanism. No learning claim means model-weight training.
