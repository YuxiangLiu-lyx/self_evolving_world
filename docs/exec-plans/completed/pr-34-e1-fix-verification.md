# PR-34: E1 fix-verification run (long-fixes)

## Requirement summary

E1 checks whether the three opt-in long-run fixes of PR-33 lower ex13's cost and narrow development without changing its world. The user pre-authorized this model-calling run: 3 agents × 80 rounds on the ex13 rules and seed with whole exact reads (`exactRecordWidth` 4000), `plan-horizon` and `general-capabilities`, at most 8 development handoffs and a hard ceiling of 1,600,000 tokens. Development handoffs are completed by Claude Code and recorded as `current-claude-conversation`. Planned numbering: E1 = ex14.

## Requirements

- R1: Allocate the next archive with `pnpm experiment:continuous -- new long-fixes` from merged `main`, with no source change before the first call.
- R2: Stop at the round-40 gate. If tokens per agent per round over rounds 0–39 are not below ex13's same window, stop and investigate instead of extending.
- R3: Otherwise extend to round 80 with `extend exN 80`, without changing any budget after the first call.
- R4: Complete each development handoff under the existing protocol with the smallest conservative implementation, record assumptions in the declaration review, and stop at the 8-handoff cap.
- R5: Report the fix-log metrics against ex13 rounds 0–79 with `pnpm metrics:long`, apply gate G1 (at most 4,500 tokens per agent per round), and write the companion behavioral analysis.
- R6: Append the result to `docs/presentation/fix-log.md` as problem → evidence → fix → metrics, with up to three log-backed events (round and call IDs). A single seed is a case comparison, not a statistical result.

## Scope and exclusions

In scope: the new archive, its companion analysis, development handoffs required by the run, and the fix log.

Out of scope: any change to existing archives, ex13's configuration, the transport or budgets after the first call; E2–E4.

## Acceptance criteria

- The archive validates and replays; `pnpm validate` passes.
- The analysis exists in `experiment/analyses/exN/`; the PR lists every handoff and its developer.
- CI `quality` and `pr-policy` pass.

## Results

- R1: `new long-fixes` allocated ex14 from merged `main` (provenance clean) with no source change before the first call.
- R2: the round-40 gate passed: 3,337 tokens per agent per round against ex13's 5,962 over rounds 0–39.
- R3: `extend ex14 80` preserved the 40-round window and continued without a budget change.
- R4: all 8 handoffs were completed and recorded as `current-claude-conversation`, and the run stopped at round 64 when a ninth develop review arrived with the budget exhausted.
  - Development-1 recovered the round-0 server overload of ordinary-3; the call was not resent and its reservation stayed charged.
  - Development-2, -4 and -7 installed working general operations: `cultivate-plant@1` (a root planting trial with no propagation), `controlled-food-processing-trial@1` (paired ground exposure with existing decay) and `arrange-resting-material@1`.
  - Development-3 assigned the existing cultivation operation because no propagation biology exists.
  - Development-5, -6 and -8 installed first releases that check real prerequisites and report the unsupported physics without spending anything: `weather-barrier@1`, `air-dry-food@1` and `make-and-test-cordage@1`.
  - The development-6 record corrects an incomplete statement in development-4 about the ex10 preservation model.
  - `long-planting.ts` was parameterized by plot revision with ex13 defaults unchanged.
- R5: metrics are compared with ex13 rounds 0–63 and with rounds 0–79.
  - Tokens per agent per round: 3,641, against 6,320 and 6,632. G1 (at most 4,500) passed.
  - Continuation-part queries: 0 against 55.
  - Partly read decisions: 0/14 against 22/29.
  - Median decision gap: 5 against 2 rounds.
  - Single-execution plans: 29% against 69%.
  - World Agent reuse: 3/11 against 0/8.
  - Bound interfaces: 0/6 against 2/9.
  - Follow-up share did not fall: 55.7% against 52.5%.
  - The companion analysis is `experiment/analyses/ex14/pr-34-e1-fix-verification.md`.
- R6: `docs/presentation/fix-log.md` section 5 records the run and three log-backed events, with call IDs.

Because the handoff budget ended the run, rounds 64–79 were not observed. G1 failed nowhere, so E3 keeps its planned 6 agents and 250 rounds.
