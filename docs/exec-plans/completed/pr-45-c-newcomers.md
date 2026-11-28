# PR-45: Experiment C, newcomers in an existing group

## Requirement summary

Experiment C asks whether two newcomers pick up the local names, sayings and norms of a group that already has them. It starts from ex18's world at round 120 and adds two people without memory. ex18 is the culture v2 incentive control. Its six residents gave the clearing the name "The Berry Lantern" on a sign, and Kai, Lin and Moss told a lantern tale among themselves. The run uses the `long-culture-v2` prompt and rules with incentives off.

## Requirements

- R1: Import ex18's completed window at round 120 with `pnpm experiment:continuous -- new long-culture-v2 --import ex18 --newcomers apps/simulator/test/fixtures/import-newcomers.json`.
  - The source world equals its exact replay, the recorded round hash and the stage checkpoint: `d21459c66264e4645651e4f6f0287070e18c125261eb522dcf77bdada6f42e2d`.
  - The new archive records this as `importedFrom`. The source archive is only read.
- R2: Every change from ex18's configuration is listed in `configuration.json` `importChanges` and in [the design](../../CULTURE_SCENARIO.md#import-and-newcomers):
  - the scenario tag;
  - incentives off;
  - the culture v2 checkpoints `[80, 150, 250]`;
  - 2,500,000 tokens and 12 development handoffs;
  - the window target, round 220;
  - the new development scope, plus `inherited: ['long-ex18']`;
  - the two newcomers.

  Everything else is byte-identical to the source world.

- R3: Newcomers, chosen before the run:
  - **Tova**, leaning `curiosity`. No resident has this leaning, so any adoption of the residents' words cannot come from a shared leaning.
  - **Bram**, leaning `calm`, the same as Ivo. This lets the report compare one newcomer whose leaning matches the norm of quiet company with one whose leaning does not.

  Neither leaning is `beauty`. Both newcomers:
  - have the residents' median temperament;
  - start with no memory, knowledge or relationships;
  - stand 6–7 units from the clearing centre on opposite sides: Tova at (9.23, 19.77), Bram at (18.6, 10.4).

  Nothing in their input mentions place names, sayings or the residents' history.

- R4: 8 people × 100 rounds (ticks 120 → 220), a development handoff budget of 12 and a hard token budget of 2,500,000.
  - Handoffs, recovery and stopping follow the standing rules: simplified but real mechanisms, briefs in `validation-results/handoffs/`, transport waits of retry-after + 60 s, at most 6 recoveries per 60 minutes, rejected outputs and empty handoffs uncounted.
  - A technical stop keeps its results and is reported.
- R5: Observations, all from the archive with round and call id:
  1. when each newcomer first sees or hears "Berry Lantern" or the lantern tale, and from whom;
  2. whether a newcomer uses the name, in speech, a sign or a note;
  3. whether a resident tells a newcomer the tale;
  4. whether a newcomer continues the tale or tells one of their own;
  5. whether a newcomer repeats or follows a resident norm such as "quiet company, no need to talk";
  6. the residents' private views of the newcomers, in order.
- R6: Annotation with `pnpm labels:culture` over ticks 120–220, blind to the scenario and experiment:
  - every positive verified against the archive;
  - 20 random negatives re-checked;
  - agreement rates reported;
  - a timeline of events.
- R7: Deliver:
  - the archive and its companion analysis;
  - the annotation outputs;
  - the English report with its configuration, stop reason, rounds, tokens, handoffs, annotation agreement, deviations and limitations;
  - up to 5 moments in `docs/presentation/highlights.md`;
  - fix-log entries.

  ex7–ex18, the B archives and the new archive must replay identically, and `pnpm validate` must pass.

## Scope and exclusions

In scope: the import feature (already implemented on this branch), the run, its packages, analysis, annotation and report.

Out of scope: changes to ex18 or any other archive, the transport and the v2 prompt. That prompt includes the pre-existing sentence that names "stories", which every culture v2 person receives.

## Acceptance criteria

- The new archive validates and replays.
- The source archive's files are unchanged.
- ex7–ex18 and the B archives replay identically.
- CI `quality` and `pr-policy` pass.

## Results

See the [run report](../../presentation/run-report-c-newcomers.md).

- R1: ex25 was allocated with the planned command. ex18's saved world at round 120, its exact replay, the recorded round hash and the stage checkpoint all hash to `d21459c6…2e2d`; the archive records this as `importedFrom`, and ex18 is unchanged.
- R2: `configuration.json` lists exactly the 10 planned `importChanges`; the design's table gives their old and new values.
- R3: Tova (`curiosity`) at (9.23, 19.77) and Bram (`calm`) at (18.6, 10.4), with the residents' median temperament and no memory.
- R4: 8 people × 100 rounds, ticks 120 → 220, window complete; all eight alive with health 100.
  - 233 calls (210 ordinary, 23 World Agent) and 2,137,045 of 2,500,000 tokens.
  - 5 of 12 handoffs counted, each a simplified but real mechanism. 3 rejected outputs were uncounted, and there was no technical pause.
- R5, each answered in the report with round, call id and verbatim text:
  1. Each newcomer saw the name only on Sol's sign: Bram from tick 133, Tova from tick 156. Bram first heard a lantern reference from Ivo at round 122. The first lantern text in Tova's input was Bram's sequel (tick 194).
  2. Neither newcomer used the name, and nobody spoke it in rounds 120–220.
  3. No resident addressed the tale to a newcomer. Bram received three residents' episodes in his input; Tova received none, because her six-entry heard list rolled before her next decision.
  4. Bram continued the tale at round 190 after hearing Lin at round 186. Tova told no narrative.
  5. Neither newcomer repeated a resident norm verbatim. The plan's phrase "quiet company, no need to talk" comes from ex16, not ex18.
  6. One resident view of a newcomer: Moss's of Bram at round 196. No resident wrote a view of Tova.
- R6: ex18 rounds 1–120 were labeled first to build the registry, then ex25 rounds 121–220, both blind.
  - Agreement, verified by a Claude agent (not a human): 97.7% and 93.9%. All 18 ex25 negatives were re-checked, because there were fewer than 20.
  - The five calls counted 18,435 tokens; the annotation ledger stands at 87,309 of 1,000,000.
- R7: the archive, the companion analysis `experiment/analyses/ex25/pr-45-c-newcomers`, both label directories with verified timelines, the report, five highlights and fix-log section 12.
  - The lead compared ex7–ex24 on the C branch after merging main; all replay identically.
  - `pnpm validate` and CI `quality` and `pr-policy` had not run when this was written; their results belong to the PR.
- Deviations: the norm phrase premise (R5.5); the leaning comparison of R3 could not be made, because Tova's input never held a resident's telling; the extra ex18 annotation pass. Limitations: one run, agent verification, sung words not counted (none were sung) and the heard-list cap ([fix-log 12](../../presentation/fix-log.md#12-experiment-c-newly-exposed-problems)).
