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
