# PR-46: Experiment D, two villages meet

## Requirement summary

Experiment D asks what two separately formed groups do when hunger brings them together. Six people form two groups of three that start far apart, each with food for about 80–100 rounds. Between them lies a richer, regenerating food area. Nothing in any input mentions the other group or the area between them. The new tag `long-culture-v2-villages` keeps the `long-culture-v2` prompt and rules and changes only the world layout and the starting arrangement ([design](../../CULTURE_SCENARIO.md#villages)).

## Requirements

- R1: The tag `long-culture-v2-villages`, already implemented on this branch:
  - a 144 × 36 map of two mirrored ex13 neighborhoods joined by a meadow;
  - West: Lin (freedom), Moss (belonging) and Sol (beauty);
  - East: Kai (fairness), Wren (mastery) and Ivo (calm).

  Each similar pair of leanings is split between the groups.
  - Food: 264 nutrition per village, which lasts 87–98 rounds for three people, and a middle area of 48 sources with 20 times both villages' initial food, which regrows faster than six people eat.
  - Inputs are byte-identical to culture v2 apart from the fields that show the world, which a test proves.

- R2: Separation is proved offline for the first 60 rounds: 2 × 60 × 0.8 + 5 = 101 < 111.6, the minimum distance between the groups' starts.
  - The channels outside the distance bound are named in the design: invitation attendance at a freely chosen meeting point, the shared interface catalogue and World Agent reviews.
  - The analysis checks the first 60 rounds of the replay for any cross-group contact through these channels, and for any developed interface that moves people faster than 0.8 per round.
- R3: 6 people × 200 rounds, with a checkpoint at round 100. The first window ends at round 100, and `extend exN 200` follows. The development handoff budget is 16 and the hard token budget is 3,000,000.
  - Handoffs, recovery and stopping follow the standing rules: simplified but real mechanisms, briefs in `validation-results/handoffs/`, transport waits of retry-after + 60 s, at most 6 recoveries per 60 minutes, rejected outputs and empty handoffs uncounted.
  - A technical stop keeps its results and is reported.
- R4: Observations, all from the archive with round and call id:
  1. names, sayings and norms in each group before they meet;
  2. first contact: round, place, who, and what was said and done;
  3. whether the groups' names conflict, coexist or merge, and whether one group adopts the other's names;
  4. how norms are negotiated between the groups;
  5. competition for food: who eats where, depletion of the middle area, and taking or giving across groups.
- R5: Annotation with `pnpm labels:culture` over ticks 1–200, blind to the scenario and experiment:
  - every positive verified against the archive;
  - 20 random negatives re-checked;
  - agreement rates reported;
  - a timeline of events.
- R6: Deliver:
  - the archive and its companion analyses (round 100 and round 200);
  - the annotation outputs;
  - the English report with its configuration, stop reason, rounds, tokens, handoffs, annotation agreement, deviations and limitations;
  - up to 5 moments in `docs/presentation/highlights.md`;
  - fix-log entries.

  ex7–ex18, the B and C archives and the new archive must replay identically, and `pnpm validate` must pass.

## Scope and exclusions

In scope: the tag (already implemented on this branch), the run, its packages, analyses, annotation and report.

Out of scope: changes to earlier archives, the transport and the v2 prompt. That prompt includes the pre-existing sentence that names "stories", which every culture v2 person receives. The invitation meeting-point rule stays as in culture v2 and is checked after the run, not changed.

## Acceptance criteria

- The new archive validates and replays through round 200.
- Earlier archives replay identically.
- CI `quality` and `pr-policy` pass.

## Results

Pending.
