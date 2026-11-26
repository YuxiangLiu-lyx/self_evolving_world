# PR-42: Culture v2 extension (ex16 and ex17 to round 250) and E4

## Requirement summary

After reviewing ex16 and ex17, the user revised gate G2 after the fact (PR-41). Both runs pass the revision. The user decided to extend both archives to round 250, with a checkpoint at round 150, running ex16 first. After ex16 reaches round 150, E4 runs: `long-culture-v2-incentives`, with ex16's seed, for 120 rounds, compared with ex16's first 120 rounds. Monitoring, transport recovery and checkpoint pushes stay as before. All experiments together stay within 16,000,000 tokens. Development handoffs are completed by Claude Code and recorded as `current-claude-conversation`.

- Experiment reuse: ex16 — the user explicitly asked to extend this archive from round 80 to round 250 (checkpoint 150); its first window is preserved by `extend` under `windows/through-80/`.
- Experiment reuse: ex17 — the user explicitly asked to extend this archive from round 80 to round 250 (checkpoint 150); its first window is preserved by `extend` under `windows/through-80/`.

## Requirements

- R1: Extend ex16 with `pnpm experiment:continuous -- extend ex16 150`, then to 250. Allocate E4 with `pnpm experiment:continuous -- new long-culture-v2-incentives` from a clean worktree after ex16 reaches round 150 (allocated as ex18), and run it to round 120 after ex16 reaches round 250. Then extend ex17 the same way as ex16. Do not change a budget or a genesis.
- R1a: Source lineages (approved by the user on 2026-11-25). `continue` and `extend` refuse a run whose runtime sources differ from its last recorded source revision. After ex16's round-80 window, main gained the culture v3 code and ex17's package, so ex16 no longer matches main. Each continued archive therefore runs on its own branch, which starts at that archive's last checkpoint commit. Nothing in the protocol is relaxed.

  | Branch                            | Worktree      | Base commit                               | Runs                                     |
  | --------------------------------- | ------------- | ----------------------------------------- | ---------------------------------------- |
  | `experiment/ex16-extension`       | `../sew-x16`  | `2409b37` (ex16 round-80 checkpoint)      | ex16 rounds 80 → 150 → 250               |
  | `experiment/e4-incentives`        | `../sew-e4`   | `987c968` (main `612a0fa` plus this plan) | ex18 (E4), a new archive, rounds 0 → 120 |
  | `experiment/ex17-extension`       | `../sew-x17`  | `b643e48` (ex17 round-80 checkpoint)      | ex17 rounds 80 → 150 → 250               |
  | `experiment/culture-v2-extension` | `../sew-runs` | main `612a0fa`                            | integration, report and analyses         |

  At each base commit, the archive equals main's copy byte for byte, and `currentContinuousRuntimeMatches` is true.

  Only changes that cannot affect simulation output may be brought onto a continuation branch. So far there is one: PR #35's `scripts/continuous-repair.ts` (the retry-after wait) with its test `scripts/transport-wait.test.ts`, on the ex16 and ex17 branches. The file is outside the runtime identity, and it decides only when a paused run resumes. Handoff packages are added on the branch of the run that requested them.

- R1b: Before merging, replay every continued archive in full on main's code: ex16 through round 250, ex18 and ex17 through round 250.
  - Write each archive's compatibility digest (`scripts/long-compatibility.ts --write`) on its own branch, then compare it (`--compare`) on the integration branch after the merge. Every request and paused input must be byte-identical, and `pnpm validate` must pass.
  - On any difference, do not change main's code to make it pass; stop and report the difference to the user.
  - The ex7–ex15 digests must also stay identical.
  - Every package added by a handoff (for example `hand-break-food@1` and the cordage package) enters main with the merge. Confirm that each one installs only in its own scope and that no other archive's world contains it.
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
- R6a: Handoff briefs for subagents are written to the worktree's git-ignored `validation-results/handoffs/` (user decision), never committed.
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
- The ex7–ex15 compatibility digests are identical, and the full ex16, ex17 and ex18 archives replay on main with byte-identical requests and paused inputs (R1b).
- The analyses and the report exist.
- CI `quality` and `pr-policy` pass.

## Results

The [run report](../../presentation/run-report-culture-v2-extension.md) has all figures.

- R1: ex16 ran to round 250 (checkpoints 150 and 250). ex18 (E4) was allocated after ex16 reached round 150 and ran to round 120. ex17 ran to round 250 last. No budget or genesis changed.
  - E4 first ran in parallel with ex16's rounds 150–221. The user's later instruction fixed the order (ex16 to 250, then ex18, then ex17), and the runs were sequential from then on.
- R1a: each continued archive ran on its branch from its checkpoint commit (table above). The only change brought in was the PR #35 repair script.
- R1b: on the merged code, ex7–ex15, ex16 (340 requests, 24 paused inputs), ex17 (285, 0) and ex18 (190, 0) replay with byte-identical requests and paused inputs.
  - The 12 developed packages are scoped to their own experiments.
  - The 99 packages have unique ids and handlers.
- R2: 12 handoffs in the three runs, 11 counted, all simplified but real mechanisms.
  - ex18's thermal package and the maintenance mode of its cultivation package reject what the world cannot represent, before costs.
  - ex17's round-156 package was renamed before submission to avoid an id clash (fix-log 9d).
- R3: one recovery, ex16 round 99 (`fetch failed`, no evidence), closed by an uncounted empty handoff after 62 s. In-round rejections: ex16 1 and ex18 4. No three-rejection stop.
- R4: no monitoring rule triggered. The largest number of counted handoffs in 50 rounds was 3, and the cost was 1,536–2,045 tokens per person per round. Checkpoints were pushed to the continuation branches.
- R5: no stop condition occurred. Cumulative tokens across ex15–ex18 were 7,999,986.
- R6–R7: archives, screenshots, analyses (ex16 and ex17 rounds 0–250, ex18), the run report with review items A and B and the per-run timelines, and fix-log section 9 (9a–9i). The analysis check now accepts analyses bound to a preserved window (fix-log 9c).

Limitations: single seeds and case comparisons; the revised G2 is post hoc and its adoption counts are upper bounds (fix-log 9i); the incentives are invisible to the agents (9g).
