# PR-47: Culture program A–D summary and recurring imagery check

## Requirement summary

The user's culture program ran four experiments, merged as PRs #37 (A), #38 (B), #39 (C) and #40 (D). This PR closes it with one English summary page. It adds a check of images and phrases that recur across runs that share no transcript.

## Requirements

- R1: `docs/presentation/summary-a-d.md`. One section per experiment gives:
  - the question, the setup and a one-sentence conclusion;
  - the most important numbers and at most two selected moments with call ids;
  - the limitations.

  Every statement comes from the merged run reports, verified labels and archives.

- R2: A recurring-imagery check over the spoken, sent and named text of ex15–ex26 (`scripts/culture-metrics-imagery.ts`, with tests).
  - It counts a declared list of images and phrases, among them the lantern, and words absent from each run's own world and prompt text. It reports the independent lineages, runs and seeds in which each occurs.
  - An imported run belongs to its source's lineage (`manifest.importedFrom`).
  - The motif list was declared after reading the runs and is descriptive, not pre-registered.
- R3: The summary states two things:
  - imagery that recurs across independent runs more likely comes from the model's prior than from creation inside a world;
  - evidence of shared practice is transmission: adoption by others, continuation, repetition and pickup by newcomers. The verified transmission events are tabulated per run from the label directories.
- R4: Totals:
  - the tokens per experiment and in all;
  - the counted development handoffs per experiment and in all;
  - the annotation ledger, reported separately.
- R5: No archive, runtime code or earlier document changes. `pnpm validate` passes.

## Scope and exclusions

In scope: the summary page, the imagery script, its test and its JSON output.

Out of scope: new runs, model calls, label changes and any change to earlier reports.

## Acceptance criteria

- The imagery test passes, and its output is reproducible from the archives.
- `pnpm validate` and CI `quality` and `pr-policy` pass.

## Results

- R1: [`summary-a-d.md`](../../presentation/summary-a-d.md) gives each experiment's question, setup, one-sentence conclusion, numbers, two moments with call ids, and limitations. Each comes from the merged reports (PRs #37–#40).
- R2: `scripts/culture-metrics-imagery.ts` and its test (6 tests, including a pinned check on ex18 and ex24). [`imagery-a-d.json`](../../presentation/imagery-a-d.json) covers 12 runs, 11 independent lineages and 4 seeds.
  - "quiet company" occurs in 5 lineages under 3 seeds.
  - "no obligation" and "no hurry" occur in 3 lineages each.
  - The lantern occurs in 2 lineages (ex18, ex24) with different seeds and no shared transcript.
- R3: the summary states that imagery recurring across independent runs more likely comes from the model's prior than from creation inside a world, and that the evidence of shared practice is transmission. Its table lists the verified adoptions, continuations and repetitions per run.
- R4: A–D spent 13,351,675 tokens (A 2,044,361; B 7,064,562; C 2,137,045; D 2,105,707), and 41 handoffs were counted (6, 22, 5 and 8). The cumulative total, with ex15–ex18, is 21,351,661 of 28,000,000. The annotation ledger stands at 99,470 of 1,000,000.
- R5: no archive, runtime code or earlier report changed. `pnpm validate` had not run when this was written; its result belongs to the PR.
