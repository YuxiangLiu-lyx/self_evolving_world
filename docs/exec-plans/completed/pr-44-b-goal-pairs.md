# PR-44: Experiment B, goal sentence pairs on three new seeds

## Requirement summary

Experiment B tests whether the goal sentence changes what people build together. It also tests how robust the result is across seeds. The two arms differ only in two places of the ordinary input:

- `long-culture-v2` uses the open goal and the leaning sentence "You tend to value _leaning_.";
- `long-culture-v2-oldgoal` uses ex15's original goal sentence, with the leaning only as a data field.

`apps/simulator/test/long-culture-v2-oldgoal.test.ts` proves that the inputs are otherwise byte-identical. Both arms run on the same three new seeds, so each seed forms a pair.

This plan fixes the outcome measures before any B run. They are not changed after the runs.

## Requirements

- R1: Seeds 20261201, 20261202 and 20261203, chosen before any B run and never used before.
  - A seed changes the climate phases and the ecological and material randomness, not the map or the people.
  - None of the three is congruent with 20261123 or with another chosen seed modulo 23,408, the period of the seed-dependent climate and dispersal terms.
- R2: Six runs of 6 people × 80 rounds, allocated with `pnpm experiment:continuous -- new <tag> --seed <s> --development 8 --tokens 1500000`. Each run's handoff budget is 8 and its hard token budget is 1,500,000.
  - Run order: seed 1 old goal, seed 1 v2, seed 2 old goal, seed 2 v2, seed 3 old goal, seed 3 v2.
  - Runs are serial.
- R3: Handoffs, recovery and stopping follow the standing rules:
  - simplified but real mechanisms;
  - briefs in `validation-results/handoffs/`;
  - transport waits of retry-after + 60 s, at most 6 recoveries per 60 minutes;
  - rejected outputs and empty handoffs uncounted.

  A run that reaches a technical limit, such as its token budget, the context guard or its handoff budget, keeps its results, and the report says why it stopped.

- R4: The program's cumulative cap is 28,000,000 tokens. Annotation has a separate 1,000,000-token ledger.
- R5: Outcome measures, fixed now. Each is computed per run over ticks 1–80.
  1. **Names adopted by others**: distinct names (annotation `naming`) with at least one verified `name-adoption` by a different person.
  2. **Narratives and continuations**: the number of distinct verified `narrative` items, and the number of verified `narrative-continuation` items by a person other than the narrative's author.
  3. **Non-transactional share**: `nonTransactional.share` from `pnpm metrics:culture`, the existing rule-based definition, unchanged.
  4. **Cares naming the person's own leaning**: the number of people (0–6) whose cares, in any version, contain their own leaning word or an inflection of it. This uses the word list and exclusions of review item B in the first culture v2 report.
  5. **Repeated sayings and norms**: verified `norm-repetition` items, in which a person repeats or endorses a normative statement or maxim that another person said first.
  6. **Invitations with attendance**: invitations whose world `attendance` record lists at least one person other than the host present.
  7. **Objects valued for non-functional reasons**: distinct objects with at least one verified `valued-object` item.

  Measures 1, 2, 5 and 7 come from the GPT annotation:
  - the input is blind to the scenario and the experiment;
  - every positive is verified against the archive text;
  - a random 20 of each run's negatives are re-checked.

  Only verified items count, and the report gives the agreement rates.

  Counting procedure, fixed before any B annotation (`scripts/culture-metrics-pairs.ts`):
  - an `agree` verdict confirms every labelled category; a `partial` verdict confirms only the categories the verifier lists in `confirmed`; a `disagree` verdict confirms none;
  - a linked category (adoption, continuation, repetition) counts only when its link points to an entry by another person;
  - a confirmed valued object carries the `object` the verifier identified in the archive, and measure 7 counts distinct such objects;
  - items the verifier finds missing in the negative sample enter the agreement rates, not the measures, because only a sample of negatives is re-checked;
  - measure 4 reads every cares write of ticks 1–80; measure 6 reads the world's `attendance` events of ticks 1–80.

- R6: Report each pair side by side (old goal against v2 on the same seed) and the totals of each arm. Report the number of pairs in which each arm is higher.
  - No significance test is claimed with three pairs; the report describes, it does not generalize.
  - ex15 (ticks 1–70) and ex16 (ticks 1–80) are shown as references and are not part of any pair.
- R7: Deliver:
  - the six archives;
  - a companion analysis per archive;
  - the annotation outputs and the timeline of events per run;
  - the English report with its configuration, stop reasons, rounds, tokens, handoffs, annotation agreement, deviations and limitations;
  - up to 5 moments in `docs/presentation/highlights.md`;
  - fix-log entries.

  ex7–ex18 and the new archives must replay identically, and `pnpm validate` must pass.

## Scope and exclusions

In scope: the tag and allocation options (already implemented on this branch), the six runs, their packages, analyses, annotation and report.

Out of scope: changes to earlier archives, to the transport or to the v2 prompt shared by both arms. That prompt includes the pre-existing sentence that names "stories", identical in both arms.

## Acceptance criteria

- The six archives validate and replay.
- The compatibility digests of ex7–ex18 are identical.
- The outcome measures are reported exactly as defined in R5.
- CI `quality` and `pr-policy` pass.

## Results

See the [run report](../../presentation/run-report-b-goal-pairs.md).

- R1: seeds 20261201, 20261202 and 20261203, each shared by one old-goal and one open-goal run.
- R2: six serial runs in the planned order, ex19 (seed 1, old goal) to ex24 (seed 3, open goal), each with a handoff budget of 8 and a token budget of 1,500,000.
  - ex19 stopped at round 76 on its token budget (1,463,499 of 1,500,000), and ex21 at round 44 on the rejection stop: three consecutive rejected outputs without `preferences` (fix-log 11a, 11b). Both keep their results.
  - ex20, ex22, ex23 and ex24 completed 80 rounds. All six people survived in every run.
- R3: 22 counted handoffs (old goal 4, 4, 4; open goal 2, 2, 6), each a simplified but real mechanism.
  - Rejected outputs: 24 of 445 ordinary calls in the old-goal arm and 8 of 375 in the open-goal arm, all uncounted.
  - One transport failure (ex20, HTTP 503) was repaired after 60 s. ex23's first handoff ran under the user's narrowed scope after a permission denial.
- R4: the six run ledgers total 7,064,562 tokens. The 14 annotation calls counted 45,466 tokens, and the annotation ledger stands at 68,874 of 1,000,000.
- R5 and R6, measured with `scripts/culture-metrics-pairs.ts` from labels verified by Claude agents (not a human):
  - In 11 of the 24 pair comparisons the open-goal run was higher, in none the old-goal run, and 13 were ties at zero. The old-goal runs had no verified positive label.
  - Measure 4 is partly mechanical (the open-goal prompt states the leaning), measure 3 rests on 6–24 messages per run, ex21 covers 44 rounds, and three pairs support no significance test or generalization.
  - ex15 (ticks 1–70) and ex16 (ticks 1–80) are reported separately, from a fresh labeling pass. A supplementary, not pre-registered, ticks 1–44 window for the seed-2 pair gives the same comparison as the full window.
- R7:
  - The six archives, the eight label directories with their verified timelines and the measure outputs in `docs/presentation/b-measures/` are delivered.
  - So are the report, five highlights and fix-log section 11. The companion analyses are `experiment/analyses/ex19` … `ex24/pr-44-b-goal-pairs`.
  - Every archive, ex7–ex24, replays byte-identically on the merged code. `pnpm validate` and CI `quality` and `pr-policy` had not run when this was written; their results belong to the PR.
