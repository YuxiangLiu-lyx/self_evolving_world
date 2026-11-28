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

See the [run report](../../presentation/run-report-d-villages.md).

- R1: ex26 was allocated with the planned tag on the D branch after main was merged (`535e19d`), and ex7–ex25 replayed identically there.
- R2: the separation held in rounds 1–60.
  - The minimum distance between the groups was 102.8, above the bound of 101.
  - Every person moved at most 0.8 per round in every round, including through the seven developed interfaces.
  - No `invite` was used; all messages and tells stayed within a group; no ordinary input of rounds 1–162 names a person of the other group.
- R3: the first window completed at round 100 (checkpoint `7e34bdf`), and `extend ex26 200` continued it.
  - The run stopped for review at round 162 after three consecutive rejected outputs from Kai (`ordinary-285`–`-287`). This is a technical stop, and it was not bypassed (fix-log 13c), so the user's extension rule past round 200 did not apply.
  - 287 calls (263 ordinary, 24 World Agent), 2,105,707 of 3,000,000 tokens, 8 of 16 handoffs counted (one lost to the lead's merge oversight, fix-log 13a) and 12 rejected outputs uncounted.
  - Technical pauses at rounds 13 (`fetch failed`, an empty, uncounted handoff) and 162. All six people were alive at the stop.
- R4, each answered in the report with round, call id and verbatim text:
  1. West: the name "Berryglow Clearing" (Sol, round 25), invitations, a conversation session with one reciprocal exchange, and private views. East: the norm "Please distinguish observations from guesses." (Wren, round 55) and invitations.
  2. No first contact: the closest approach was 49.6 (Sol and Ivo, round 162).
  3. Not observable without contact.
  4. Not observable without contact.
  5. Every gather was from a group's own sources, and the middle area was untouched (960 of 960 units). Kai starved from round 144 (health 20 at the stop), Lin from round 161; nothing was given or taken across the groups.
- R5: rounds 1–162 were labeled blind (30 items, 6,546 tokens). Every positive and all 16 negatives were verified by a Claude agent, not a human, with 96.7% agreement. A first pass of rounds 1–100 (5,615 tokens) was set aside because the reader missed conversation speech; it is fixed and tested (fix-log 13b). The annotation ledger stands at 99,470 of 1,000,000.
- R6: the archive, the companion analyses `experiment/analyses/ex26/pr-46-d-villages-100` (round-100 window) and `pr-46-d-villages` (final), the verified label timeline, the report, five highlights and fix-log section 13.
  - The lead compared ex13, ex16, ex18, ex22, ex24 and ex25 after each shared change, and ex26 against its own digest.
  - `pnpm validate` and CI `quality` and `pr-policy` had not run when this was written; their results belong to the PR.
- Deviations: the run ended at round 162, not 200; the analyses and labels cover rounds 1–162; one counted handoff was lost to a merge oversight.
- Limitations: one run without contact, so R4.2–R4.4 remain unanswered; agent verification; `tend-rooted-plants@1` could only inspect (fix-log 13d).
