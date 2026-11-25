# PR-42: Culture v2 extension (ex16 and ex17 to round 250) and E4

## Requirement summary

After reviewing ex16 and ex17, the user revised gate G2 after the fact (PR-41). Both runs pass the revision. The user decided to extend both archives to round 250, with a checkpoint at round 150, running ex16 first. After ex16 reaches round 150, E4 runs: `long-culture-v2-incentives`, with ex16's seed, for 120 rounds, compared with ex16's first 120 rounds. Monitoring, transport recovery and checkpoint pushes stay as before. All experiments together stay within 16,000,000 tokens. Development handoffs are completed by Claude Code and recorded as `current-claude-conversation`.

- Experiment reuse: ex16 — the user explicitly asked to extend this archive from round 80 to round 250 (checkpoint 150); its first window is preserved by `extend` under `windows/through-80/`.
- Experiment reuse: ex17 — the user explicitly asked to extend this archive from round 80 to round 250 (checkpoint 150); its first window is preserved by `extend` under `windows/through-80/`.

## Requirements

- R1: Extend ex16 with `pnpm experiment:continuous -- extend ex16 150`, then to 250. Extend ex17 the same way after ex16. Allocate E4 with `pnpm experiment:continuous -- new long-culture-v2-incentives` from a clean worktree after ex16 reaches round 150, and run it to round 120. Do not change a budget or a genesis.
- R1a: Source lineages. `continue` and `extend` refuse a run whose runtime sources differ from its last recorded source revision. After ex16's round-80 window, main gained the culture v3 code and ex17's package, so ex16 no longer matches main. Each continued archive therefore runs in its own branch, whose runtime equals its own last revision; nothing in the protocol is relaxed.
  - ex16 runs on `experiment/ex16-extension`, branched from `2409b37`, its round-80 checkpoint, which is an ancestor of main with an identical ex16 archive. The branch adds only `scripts/continuous-repair.ts` from PR #35, which is outside the runtime identity.
  - ex17 runs on this branch, whose runtime equals ex17's last revision.
  - E4 runs on its own branch from main.

  The branches are merged at the end. Their archives and packages are separate files, and only the package registration lists overlap.

- R2: Handoffs follow the ex15 rule. When the World Agent's specification is self-consistent, implement a simplified but real mechanism with real costs, effects and observable events, and record the modeling assumptions. Deliver an honest first release only for a contradictory or unimplementable specification. Rejected outputs and empty handoffs are uncounted; three consecutive rejections stop the run.
- R3: Transport recovery follows the user's rule. `repair` waits for the retry-after plus 60 s (PR-41), at most 6 automatic recoveries per experiment within any 60 minutes. Each recovery is logged with its time, error type, retry-after and wait, and none takes a handoff.
- R4: Monitoring. Stop a run at its next checkpoint when either occurs:
  - more than 8 counted handoffs in any 50 consecutive rounds;
  - total ledger tokens / (6 × rounds observed) above 6,000.

  At each checkpoint (150, 250, and E4's 120), push the progress to the remote branch without merging or opening a PR.

- R5: Stop and wait for the user on any of these:
  - an unrenewable login;
  - persistent rate limiting, or more than 6 recoveries in 60 minutes;
  - any compatibility difference;
  - more than 16,000,000 tokens across all experiments;
  - any need to change an archive outside the protocol, rewrite history, force-push or change a budget;
  - the three-rejection stop.
- R6: Keep each archive's goals, results, replay, screenshots and a behavioral analysis.
- R7: Deliver the review package, with the same content as the previous one:
  - the run report: per experiment its config, stop reason, rounds, tokens and handoffs; metrics against ex13/ex14 and between runs; every handoff; at most 5 log-backed events; deviations and limitations;
  - review item A: a fixed-seed sample of 8 sharing expressions and 5 reuses;
  - review item B: cares and leanings;
  - the revised G2;
  - fix-log entries for newly exposed problems.

  Also deliver a timeline of events per run: names, rules, invitations and attendance, and works, each with its round and call.

## Scope and exclusions

In scope:

- the extended archives and the new E4 archive;
- the handoff packages and their tests;
- the companion analyses;
- the run report;
- the fix log.

Out of scope:

- changes to world rules, prompts, transports or budgets;
- changes to earlier archives other than the authorized extension.

## Acceptance criteria

- The archives validate and replay, and `pnpm validate` passes.
- The ex7–ex15 compatibility digests are identical. The digests of the ex16 and ex17 first windows stay unchanged.
- The analyses and the report exist.
- CI `quality` and `pr-policy` pass.

## Results

Pending.
