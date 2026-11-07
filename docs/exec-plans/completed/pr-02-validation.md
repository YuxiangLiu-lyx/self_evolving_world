# PR-02: Browser and Agent Validation Workflow

## Objective

Open the current built page before completing every task and inspect basic aesthetics and agent behavior. Declare completion only after automated checks, actual visual review, and the completion gate all pass.

## Scope

- Detect browser errors, layout regressions, boundary/occupancy violations, duplicate items, vision issues, and replay anomalies.
- Save desktop, mobile, agent-view, and behavior key frames as reviewable evidence.
- Require complete automated results, individual screenshot reviews, behavior review, and matching fingerprints; reject missing, failed, or stale evidence.
- Update agent rules, development workflow, PR template, architecture, and feature inventory.

Base world rules, autonomous decisions, skill evolution, and server monitoring are outside scope.

## Steps and acceptance

- [x] Add browser layout and behavior anomaly validators.
- [x] Add validation reports, review records, and the completion gate.
- [x] Test failed, missing, and stale evidence paths.
- [x] Pass full validation; actually inspect every screenshot and behavior result.
- [x] Synchronize documentation, pass the completion gate, and archive; revalidate after archival changes.

## Results

Local validation on 2026-11-06 used macOS arm64, Node 24.22.2, pnpm 10.34.9, and Playwright 1.65.0 / Chromium.

| Check                                                       | Actual result                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm validate` for the PR-02 task                          | Full check passed; automated success remained pending review instead of completing the task                 |
| Types, lint, formatting, architecture, build, CLI, and docs | All passed; no dependency violations; built CLI matched across independent processes                        |
| Vitest                                                      | 5 files, 77 tests passed, including 14 completion/evidence tests                                            |
| Chromium                                                    | 7 tests passed, including interactions, rejection paths, unchanged replay files, and layout fault injection |
| `pnpm task:finish` before review                            | Exit 1, identifying the missing reviewer, five screenshot reviews, and behavior review                      |
| Actual visual and behavior review                           | Codex inspected each screenshot, checked results, and recorded specific observations                        |
| `pnpm task:finish` after review                             | Exit 0 and passed status, with matching task, run ID, source, and screenshot fingerprints                   |

Review covered desktop 1440×1100 and mobile 390×844 viewports, agent vision, post-action state, and replay at frame 3. Desktop columns and mobile stacking were complete without horizontal overflow or panel overlap. Initial mobile evidence had a temporary notification covering the timeline; capture was changed to wait for natural dismissal, then rerun and reviewed. Product styles were not changed to conceal the issue.

Behavior evidence showed unchanged positions with recorded boundary/occupancy failures, one inventory owning collected wood, vision updates after movement and pickup, no unlock from repeated flight attempts, no implicit execution of an existing move skill, identical exports before/after replay, no actions from pause, and disabled historical controls. No browser exceptions, console errors, or failed resources occurred.

Reports, individual reviews, HTML details, and screenshots use the locations in the [validation workflow](../../VALIDATION.md#evidence-and-invalidation). Generated directories are not committed documentation. Archival/documentation changes require another full run and completion gate; final reporting uses the last run.

This record was translated in PR-03. The original task name was Chinese; historical checks were actually executed under that name, not rerun under an invented English name. Counts and outcomes are unchanged.

## Limitations and follow-up

- Local Chromium was validated; remote GitHub Actions did not run and branch protection was not configured.
- Automated assertions do not replace aesthetic judgment. The gate validates evidence completeness but cannot prove reviewer honesty.
- Only the World Observatory page is covered. New pages, interactions, or autonomous strategies require new scenarios. No autonomous NPC or runtime world governor was introduced.
- Generated evidence retains the current run and is replaced by later runs. Archive report, review, and attachments together for long-term retention.
