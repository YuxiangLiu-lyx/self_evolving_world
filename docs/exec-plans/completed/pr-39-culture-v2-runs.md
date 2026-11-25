# PR-39: Culture v2 runs (E3 main run and E4 incentive control)

## Requirement summary

After reviewing the ex15 pilot, the user chose a new run version (PR-38). E3 is the main culture v2 run, `long-culture-v2`, with six people on the ex13 rules and seed. It is gated at round 80, checked at round 150 and runs to round 250. E4 is the incentive control, `long-culture-v2-incentives`, with six people for 120 rounds. It runs only if E3 reaches round 150 or later and the cumulative tokens of all experiments stay within 16,000,000. Both use the v2 context and prompt. The user pre-authorized both runs and their rules. Development handoffs are completed by Claude Code and recorded as `current-claude-conversation`.

## Requirements

- R1: Allocate each archive with `pnpm experiment:continuous -- new <tag>` from merged `main`. Make no source change before the first call and no budget change after it.
- R2: Development handoffs follow the ex15 rule.
  - When the World Agent's specification is self-consistent, implement a simplified but real mechanism with real costs, effects and observable events, and record the modeling assumptions. Deliver an honest first release only for a contradictory or unimplementable specification.
  - Transport failures, rejected outputs and empty handoffs resume without a counted handoff. The run stops for review after three consecutive rejected outputs.
- R3: At round 80, apply gate G2 with `pnpm metrics:culture`: survival behavior below 50% of actor-rounds, and at least one symbolic action (`name`, `mark`, `tell` or `invite`) by every person.
  - If more than 16 counted handoffs occur before round 80, stop at the checkpoint and analyze the causes, then follow the G2-failure path.
  - G2-failure path: diagnose, make at most one adjustment (the wording of part A's prompt or part D's slack) as a new tag in its own PR, and rerun an 80-round pilot under the next experiment number. A second failure stops the work.
- R4: If G2 passes, extend the same archive to round 150 and then to round 250. The monitor stops the run at the next checkpoint if either occurs:
  - more than 8 counted handoffs in any 50 consecutive rounds;
  - cumulative tokens per person per round above 6,000, measured as total ledger tokens / (6 × rounds observed), the measure ex15 reported.

  Stop by protocol when handoffs run out.

- R5: E4 runs only if E3 reaches round 150 or later and the cumulative tokens of all experiments (ex15 included) are at most 16,000,000. Its comparison with E3's first 120 rounds must note that the two runs fork from the same genesis and are a case comparison.
- R6: Stop and wait for the user on any of these:
  - an unrenewable login;
  - persistent rate limiting or consecutive transport errors;
  - any compatibility difference;
  - more than 16,000,000 tokens across all experiments;
  - any need to change an archive, rewrite history, force-push or change a budget after the first call;
  - G2 failing twice;
  - the three-rejection stop.
- R7: Keep goals, results, replay, screenshots and a behavioral analysis for each archive. Write the English run report and the fix-log entries for newly exposed problems.

## Scope and exclusions

In scope:

- the new archives;
- the handoff packages and their tests;
- the companion analyses;
- the run report;
- the fix log.

Out of scope:

- any change to earlier archives;
- any change to the transport, the World Agent prompt or the frozen budgets.

## Acceptance criteria

- The archives validate and replay, and `pnpm validate` passes.
- The ex7–ex15 compatibility digests are identical.
- The analyses and report exist.
- CI `quality` and `pr-policy` pass.

## Results

The work stopped at R3: gate G2 failed twice, which R6 lists as a stop. E3 was not extended to rounds 150 and 250, and E4 was not run. The [run report](../../presentation/run-report-culture-v2.md) has the details; the problems are in [fix log section 7](../../presentation/fix-log.md#7-culture-v2-runs-newly-exposed-problems).

| Archive | Tag                                  | Rounds | Ledger tokens | Calls (ordinary / World Agent) | Counted handoffs | G2                                                             |
| ------- | ------------------------------------ | -----: | ------------: | ------------------------------ | ---------------: | -------------------------------------------------------------- |
| ex16    | `long-culture-v2`                    |     80 |     1,161,283 | 140 / 9                        |                3 | failed: survival 50.6%; Wren 0 symbolic actions                |
| ex17    | `long-culture-v3` (G2-failure rerun) |     80 |       793,053 | 107 / 3                        |                1 | failed: survival 27.3% passes; Lin and Wren 0 symbolic actions |

- **R1:** both archives were allocated from merged `main`: ex16 after PR #32, and ex17 after PR #33 was merged into the run branch. No budget changed after a first call.
- **R2:** four packages were installed, all simplified but real mechanisms and none a first release:
  - ex16: `cultivate-plants@1`, `branch-screen@1` and `hand-weave-fiber-mat@1`;
  - ex17: `plant-cultivation@1`, which reuses the ex16 code through a factory.

  Recoveries cost no handoff: two transport recoveries and one rejection recovery in ex16, logged with time, error, retry-after and wait.

- **R3:** ex16 failed G2. The diagnosis and the single adjustment (part A wording, PR #33) are in [CULTURE_SCENARIO](../../CULTURE_SCENARIO.md#culture-v3). ex17 failed G2 again, so the work stopped. The soft rule did not trigger: 3 and 1 counted handoffs before round 80.
- **R4:** the runs did not reach this step.
- **R5:** not run, because E3 never reached round 150. After PR #33, E4 would have used `long-culture-v3-incentives`, so that it carries the same prompt as the rerun; the requirement summary, written before PR #33, names the v2 tag. Cumulative tokens over ex15–ex17 are 3,274,413 of the 16,000,000 limit.
- **R6:**
  - the transport errors were single temporary overloads, handled under the user's recovery rule;
  - compatibility digests stayed identical (ex7–ex16);
  - no archive was changed and no history was rewritten.
- **R7:** the archives, companion analyses, run report and fix-log entries are in this PR. Backups of the round-80 checkpoints were pushed to `experiment/culture-v2-runs` before merging.

**Validation:** `pnpm validate` passed: 168 unit test files with 992 tests, reconstruction of ex1–ex17, both companion analyses, documentation checks and 89 browser tests.
