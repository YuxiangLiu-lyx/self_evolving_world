# ADR-0028: Opt-in Culture Scenario

- Date: 2026-11-24
- Decision status: Accepted (implementation; no run started)
- Builds on: [ADR-0026](0026-bounded-long-development.md) and the long-fixes options

## Context

Ex7–ex13 produced subsistence, investigation and capability development, but little that
people made of each other: three people started about ten units apart, survival took much
of their time, their tendencies were nearly identical, and the ordinary prompt said
"never invent ... benefits" and that labels earn nothing. The planned E2/E3 runs ask what
six people do when those suppressors are removed and simple carriers exist. They must not
be told what to produce, and every existing archive and the long-fixes run must stay
byte-identical.

## Decision

Add two named long scenarios, `long-culture` and `long-culture-incentives`, on the ex13
rules and seed with the long-fixes options. Store each part as a separately switchable
field of `longDevelopment.culture` (`voice`, `differentiation`, `symbols`, `slack`,
`density`, `incentives`) and verify checkpoints against the tagged genesis, as for
long-fixes.

- The prompt variant replaces four phrases of the legacy prompt; physical facts still need
  evidence, while one's views and stories are one's own. Private `cares` and `views` are
  written through the plan, bounded and shown only to their owner.
- Symbolic interfaces live in an authored, scope-bound `foundation-expression@1` package
  installed at genesis. Its signs are ordinary non-solid world objects, so observation,
  memory, exact retrieval, the conflict check, replay and the viewer reuse existing paths;
  spoken words and attendance are derived by the package's environment hook.
- Slack and density are genesis data: a later, gentler pressure schedule and renewable
  food per person, and six collision-free starts around a shared clearing.
- Incentives reuse the satisfaction machinery. A new optional `derived` rule flag lets
  the authored foundation match interface-free evidence events that its hook derives from
  other people's real actions; historical rules never carry it, and other packages cannot
  install it.
- An additional frozen token ceiling applies before round 80 and is enforced like the
  ledger; afterwards the run continues under the full ledger without a configuration change.
- A fixed vocabulary never reaches ordinary agents; a test and the development validator
  guard it.
- Before the first culture run, the frozen budgets became 300 World Agent calls and 40
  development handoffs, and an opt-in `longDevelopment.transportRecovery: 'uncounted'` lets
  `repair` resume a provider transport failure without a handoff. A handoff stays the unit
  of reviewed code change; a transport failure needs no code, so counting it would only
  shorten the observation.
- Ex10's food water-content model becomes a general world representation behind a new
  `foodWater` culture field: the reviewed ex10 equations, with general object and ground
  surfaces instead of ex10 trays. No interface uses it at genesis; it gives later
  developed drying or storage interfaces real physics to build on instead of a first
  release that only reports missing physics.

## Alternatives and reasons

Telling agents to form traditions, values or rituals was rejected: it would measure prompt
compliance, not what people make. Storing symbols in hidden world state would need new
observation, memory and retrieval paths; world objects reuse them. Rewarding naming,
telling or marking directly would reward a behavior; incentives reward only what others
actually do in response, with caps, cooldowns, deduplication and decay. Giving derived
events a nominal interface would show agents a misleading "satisfaction from tell"; the
explicit `derived` flag keeps the evidence honest. Moving the oracle to shared sources so
that a denser world passes was rejected in favor of enough nearby renewable food under the
existing preflight.

## Costs and consequences

Core paths change in a few guarded places: registry inclusion and validation, plan
parsing, wellbeing trigger matching and the experience weighting key. Each is inert without the new fields, which the
compatibility digests and genesis tests confirm. Six people in one clearing raise the input
size and the chance of conflicting simultaneous actions. The scenario remains an
exploratory joint treatment; no single part's effect can be isolated from one run, which
is why every part is separately switchable. Uncounted transport recoveries make the
handoff count a measure of code changes only; consecutive failures still pause the run.
The food water representation adds guarded branches to ex10's physics module, inert
without the flag. No model-calling run has been made.

See the [design](../CULTURE_SCENARIO.md) and the [plan](../exec-plans/completed/pr-36-culture-scenario.md).
