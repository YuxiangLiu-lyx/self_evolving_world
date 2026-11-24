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

- R1: `new long-culture` allocated ex15 from merged `main` (only this plan committed on top) with no source change before the first call and no budget change after it.
- R2: eight counted handoffs, all `current-claude-conversation` (declarations in `experiment/ex15/development/`):
  - five developed packages, none a first release: `food-preparation@1` (Ivo), `simple-shelter@1` (Lin), `shared-shelter@1` (Sol), `cultivation-trial@1` (Wren) and `bark-separation@1` (Ivo);
  - two counted recoveries after two rejected model outputs each (Kai at round 0, Sol at round 13);
  - one failed submission (development-3: the shelter package declared a visual the viewer lacked), resubmitted as development-4;
  - one closing recovery at round 70 (below).
    No transport failure occurred, so uncounted transport recovery was never exercised.
- R3: gate G2 is met on rounds 0–69: survival behavior took 39.5% of actor-rounds and every person used `tell` at least once. It cannot fail on rounds 0–79 (the largest possible survival share is 47.1%). The soft rule was not triggered (8 handoffs before round 80).
- R4: not needed.
- R5: **not run.** At round 70 the pre-inference guard refused Ivo's next decision: 14,396 estimated tokens against the frozen limit of 14,000. A lossless, disclosed, culture-gated compaction measured 12,674 with ex7–ex14 compatibility identical, but it changes `apps/simulator/src/long-context.ts`, which the source verifier protects mid-run ("require a separate run version"); unprotected modules save at most about 125 tokens without hidden truncation. Changing the verifier policy or starting a new run version needs the user's decision, so ex15 stops at round 70 and E3 cannot extend it. Development-8 was closed as an empty recovery so that the paused state could be captured; no model call followed.
- R6: no stop condition of R6 occurred; 1,320,077 tokens were used in total.
- R7: see the companion analysis in `experiment/analyses/ex15/` and `docs/presentation/run-report-e2-e4.md`.

Unexecuted: E3 and E4 (E4 requires E3 to reach round 150).
