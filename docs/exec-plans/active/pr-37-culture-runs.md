# PR-37: E2 culture pilot and E3 main run (long-culture)

## Requirement summary

E2 is the first model-calling run of the culture scenario (PR-36): six people on the ex13 rules and seed with voice and private memory, differentiated dispositions, symbolic interfaces, survival slack and the general food water representation. It runs to the round-80 checkpoint under a 3,200,000-token ceiling. If gate G2 passes, E3 extends the same archive to round 250 under the 10,000,000-token ledger, with a checkpoint at round 150. The user pre-authorized both runs and their rules. Development handoffs are completed by Claude Code and recorded as `current-claude-conversation`. Planned numbering: E2/E3 = ex15.

## Requirements

- R1: Allocate the next archive with `pnpm experiment:continuous -- new long-culture` from merged `main`, with no source change before the first call and no budget change after it.
- R2: Development handoffs: when the World Agent's specification is self-consistent, implement a simplified but real mechanism with real costs, effects and observable events, and record the modeling assumptions in the declaration. Deliver an honest first release only for a contradictory or unimplementable specification. Transport failures resume through `repair` without a handoff.
- R3: At round 80, apply gate G2 with `pnpm metrics:culture`: survival behavior below 50% of actor-rounds and at least one symbolic action (`name`, `mark`, `tell` or `invite`) by every person. If more than 16 handoffs occur before round 80, stop at the checkpoint and analyze the causes, then follow the G2-failure path.
- R4: G2-failure path: write a diagnosis, make at most one adjustment (the wording of part A's prompt or part D's slack) as a new scenario tag in its own PR, and rerun an 80-round pilot under the next experiment number. A second failure stops the work.
- R5: If G2 passes, extend the same archive to round 250 (`extend ex15 150`, then `extend ex15 250`). Stop at the next checkpoint if more than 8 handoffs occur in any 50 consecutive rounds or tokens per agent per round exceed 6,000. Stop by protocol when handoffs run out.
- R6: Stop and wait for the user on: an unrenewable login, persistent rate limiting or consecutive transport errors, any compatibility difference, more than 16,000,000 tokens across all experiments, or any need to change an archive, rewrite history, force-push or change a budget after the first call.
- R7: Keep goals, results, replay, screenshots and a behavioral analysis in `experiment/analyses/ex15/`.

## Scope and exclusions

In scope: the new archive and its extension, the handoff packages and their tests, the companion analysis and the fix log.

Out of scope: any change to earlier archives, the transport, the World Agent prompt or the frozen budgets; E4 and the final report (separate PRs).

## Acceptance criteria

- The archive validates and replays; `pnpm validate` passes; ex7–ex14 compatibility digests are identical.
- The analysis exists in `experiment/analyses/ex15/`; the PR lists every handoff, its decision, its assumptions and whether it is a first release.
- CI `quality` and `pr-policy` pass.

## Results

Pending.
