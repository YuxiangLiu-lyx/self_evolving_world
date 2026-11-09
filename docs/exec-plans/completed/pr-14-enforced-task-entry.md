# PR-14: Enforced Task Entry and Traceable Self-review

## Requirement summary

Close the legacy entry bypass in the programmatic harness and publish an honest, version-bound GitHub self-review record. Continue the existing PR #8 so its original refactor, retained ex3 analysis and these corrections are reviewed and integrated together. The latest user explicitly authorizes PR and merge for both changes; this supersedes the earlier PR-only instruction for this delivery, without rewriting the historical PR-13 record.

## Requirements

- R1: Preserve the PR-13 coordinator, typed intent, actual classification, complete validation, archive protection, analysis, recovery, exception behavior and exact-head integration checks while closing alternate task entry paths.
- R2: Route harness and legacy acceptance, publication, completion and numbered-experiment commands through the same coordinator; reject missing or mismatched context before external writes and remove the legacy automatic merge path. Keep standalone automated checks usable for CI.
- R3: Keep publication and actual merge authority separate on every supported task entry; only issue a guarded connector merge request for the current reviewed head with an actual scoped grant, and independently confirm integration.
- R4: Require a GitHub COMMENT review bound to the current task, run, source, complete local review and commit before published delivery completes or a merge handoff is issued; verify the remote record and reuse it on continuation.
- R5: Label the review as current-conversation Codex self-review, never independent approval or proof of honest visual inspection or correct causality; retain full screenshot, behavior and complete-diff judgment by this conversation.
- R6: Test observable entry guards, authorization, stale/missing review evidence, remote review identity, interruption and idempotency without real merges, model calls or archive rewrites; run the complete existing suite and current visual/semantic review.
- R7: Synchronize the entry, policy, architecture and feature records, update PR #8 with current requirements and evidence, verify current quality and pr-policy plus conflict checks, and merge both changes under the latest explicit user instruction.

## Scope and exclusions

Only workflow code, boundary tests and necessary English documentation. No independent reviewer agent, model/API usage, new experiment, world/viewer/adapter changes, experiment metric changes, historical archive changes, PR template changes, CI requirement changes or branch-protection changes. The clean starting branch is refactor/programmatic-task-harness at df99fe154d2c6fd6bd5a17b50a29d598d6366ec7; origin/main is 05f45386c860e2984c03804a41615ee79e98cecb. Existing PR #8 has no GitHub reviews at inspection time.

## Acceptance criteria

Legacy entry invocation cannot independently publish, merge or complete a task outside the coordinator. Missing authorization cannot yield a merge action even with green CI. Missing, changed or wrong-head review records cannot complete published delivery. Continuation reuses the existing PR and matching review; local-only remains offline. All current screenshots and changed files are inspected, and exact current remote checks and merged main ancestry are verified before reporting completion.

## Migration map

| Existing step and evidence                        | Original trigger                           | Enforced counterpart                                                                                                    | Verification                                                    |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| task-flow/task-runtime typed routing and journals | pnpm task only                             | All task aliases enter the same coordinator; internal worker execution requires its current journal and execution lease | Real CLI and worker guard fixtures                              |
| harness alias in package.json                     | Task name invokes validate only            | Unified syntax or existing task name continues the recorded task                                                        | Alias dispatch tests                                            |
| publish-task default HTTP merge                   | Direct legacy publication after local gate | Prepare-only or verify-only worker, with no automatic HTTP merge branch                                                 | Missing-context/authority tests and exact connector parameters  |
| validate review and finish-task                   | Direct acceptance commands                 | Coordinator-bound workers reuse original gate checks                                                                    | Original gate fixtures with an explicit worker lease            |
| experiment run/resume/survival                    | Direct numbered experiment commands        | Match recorded intent and allocation journal, then invoke the existing algorithms                                       | Parameter and interruption fixtures; no inference               |
| Current Codex review.json                         | Local screenshot/behavior/diff review      | Preserve judgment and publish its exact version-bound self-review provenance as a COMMENT review                        | Remote API substitutes reject absent, stale and altered records |
| Existing connector merge / final verification     | Explicit actual grant                      | Require current remote self-review as well as original checks, then independently verify merge facts                    | Guard tests and this delivery                                   |

## Execution and results

Repository and live PR review inspection confirmed both reported limitations before implementation. The original publisher defaults to merging without reading task authority; harness only aliases automated validation. Structural review checks cannot establish judgment quality, and PR #8 has no submitted GitHub review. The remedy makes provenance auditable and closes supported entry bypasses; it does not claim independent review or tamper-proof local files.

The aliases and raw workers now share the coordinator lease, task identity, parameters and evidence checks. The publisher has no automatic HTTP merge branch. The current conversation receives a GitHub COMMENT payload with complete local review findings and exact version provenance; remote reads verify it before merge handoff and again during completion. Explicit capture recovery preserves the existing saved-data-only path, and verify-only checks existing delivery without preparing or publishing anything.

The first complete coordinator run passed on macOS with project-managed Node 24.22.2 and pnpm 10.34.9: 269 unit tests, 17 Chromium tests, all type/lint/format/architecture/build/demo/archive/analysis/documentation checks, and 23 screenshot artifacts. Subsequent compatibility refinements add three cases; the focused boundary suite passes all 45 cases. Final source/plan archival requires a fresh complete run and individual image/diff inspection, enforced by the coordinator. Exact final run, review, PR, remote checks and merge identities are retained in the generated task/report/review/publication/completion records, rather than predeclared in tracked source.

Tests retain all previous cases and adapt the four original final-gate fixtures to carry an explicit isolated coordinator lease. Added cases exercise actual raw CLI rejection before credentials or allocation, matching legacy task/parameter dispatch, missing grants, changed local review/source, wrong-head/dismissed/pending/altered remote reviews, bounded pagination, actual review-body evidence binding, read-only verification and recovery. External writes use substitutes; no production merge or model call is performed by a test. No world, viewer, adapter, historical experiment, metric, PR template, CI or protection changes are included.

The earlier PR-13 evidence and PR-only delivery are preserved as history. This continuation updates PR #8 and uses the latest scoped grant for both changes together. Final remote CI and merge are still prerequisites at the time this plan is finalized; only independently verified receipts establish completion.

The first published correction passed local full validation with 272 unit tests and 17 browser tests, but Linux CI exposed a clean-checkout test-launch issue: raw CLI subprocess fixtures launched from a temporary directory omitted the repository tsconfig and resolved missing pre-build package outputs. The fixture now passes the explicit repository tsconfig, matching the existing final-gate fixtures. The failure blocked delivery; local build output is moved aside before another complete validation, review and current-head publication. No test assertion, required check or production world behavior is weakened.

## Delivery

- Task: PR-14 enforced task entry and traceable self-review
- Mode: merge

The latest user asks to fix both issues and perform PR plus merge for the previous and latest changes. This scope is the existing PR #8 plus its corrections; it does not authorize unrelated merges.

## Limitations and follow-up

The repository command boundary is enforceable against accidental alternate command use, not a security sandbox against someone editing source, state or credentials. A GitHub COMMENT records self-review provenance, not independent approval. Correctness of causal explanations still requires human/current-conversation judgment and, where needed, future controlled experiments.
