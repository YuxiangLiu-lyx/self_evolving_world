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

Pending.
