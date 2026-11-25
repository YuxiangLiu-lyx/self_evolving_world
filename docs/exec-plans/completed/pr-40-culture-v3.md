# PR-40: Culture v3 scenario (G2-failure adjustment)

## Requirement summary

ex16, the first culture v2 run, failed gate G2 at round 80. Under the pre-authorized G2-failure rule, the next step is to diagnose the failure, make at most one adjustment (the wording of part A's prompt or part D's slack) as a new scenario tag in its own PR, and rerun an 80-round pilot under the next experiment number. A second failure stops the work.

## Requirements

- R1: Write the diagnosis of the ex16 G2 failure from `pnpm metrics:culture -- experiment/ex16 80`.
- R2: Add `long-culture-v3` and `long-culture-v3-incentives`. Each must equal the matching culture v2 genesis except for `culture.goal: 'open-2'`.
- R3: Make exactly one adjustment, to part A's wording:
  - the open goal also leaves open with whom to live;
  - a fact about the existing rest rule follows the leaning;
  - the prompt adds no guidance about `name`, `mark`, `tell` or `invite`, prescribes no activity and contains no excluded word.
- R4: The ex7–ex16 requests and paused inputs stay identical.

## Scope and exclusions

In scope: the tags, the prompt wording, the tests and the docs.

Out of scope:

- slack, budgets, the context and the handoff rules;
- the World Agent prompt;
- the run itself.

## Acceptance criteria

- `pnpm validate` passes.
- The compatibility digests are identical.
- CI `quality` and `pr-policy` pass.

## Results

- **R1.** The diagnosis is in [CULTURE_SCENARIO](../../CULTURE_SCENARIO.md#culture-v3).
  - Survival took 50.6% of actor-rounds, and 186 of its 243 rounds were `rest`; without rest the share is 11.9%.
  - Rest was a default idle behavior. 62% of rests were idle by the step-condition criterion, and 78% began at 75% or more of the energy cap.
  - Wren worked alone about 12 units away and never spoke.
- **R2–R3.** `apps/simulator/test/long-culture-v3.test.ts` checks the following:
  - each v3 genesis equals its v2 genesis apart from the goal switch;
  - the request equals v2 apart from the goal sentence and the rest fact;
  - the request contains no excluded word.
- **R4.** `compat:long` is identical for ex7–ex15 (110, 406, 411, 224, 17, 436, 524, 103 and 159 requests; 27, 3 and 18 paused inputs) and for ex16 (149 requests, 18 paused inputs), whose archive is on the unmerged run branch.

**Validation:** VALIDATE_SUMMARY
