# PR-01: Fixed World Core and Visualization Replay

- Date: 2026-11-06
- Source: user request for a base world, move/pickup/try, automatic vision, and visual history.

## Objective and scope

Concentrate base rules, types, initialization, transitions, and observations in `packages/world-core/src/world.ts`. Configure bounds and vision at creation and keep them fixed at runtime. Do not dynamically extend the base skill set. Provide a local browser viewer and replayable history without models or skill generation.

Default semantics: 16×12 grid, cardinal one-cell moves, non-overlapping agents, same-cell pickup, inclusive Euclidean vision radius 4 without occlusion, and unavailable skill requests recorded without execution. Well-formed commands advance one tick whether accepted or rejected; malformed commands and unknown agents do not advance.

## Implementation steps

1. Inspect PR-00 code and documentation; define immutable rules and action contracts.
2. Implement the core and behavior tests; upgrade CLI and built-output validation.
3. Add the viewer with map, observations, controls, replay/seeking, and import/export.
4. Extend boundaries, type checks, and browser tests while keeping the core host-independent.
5. Update architecture, product, ADRs, overview, setup instructions, and plan.
6. Run full checks and real browser validation, record results, and archive.

## Acceptance

- [x] Settings and base skills stay fixed through transitions and imported replay.
- [x] Tests cover movement boundaries, occupancy, pickup range, and unique ownership.
- [x] Every agent's observation updates automatically; unseen content is excluded.
- [x] Unknown skills only produce unavailable results without execution or registration.
- [x] Snapshots are immutable and seekable; replay does not re-execute actions.
- [x] Validated initial conditions and actions reconstruct the same history; invalid files preserve the current session.
- [x] Real browser interaction, vision, replay, and file round trips are verified; full check passes.
- [x] Documentation and limitations are synchronized.

## Results

Validation used macOS arm64, Node 24.22.2, pnpm 10.34.9, and Playwright Chromium through the isolated PR-00 toolchain. The host Node version was not changed.

| Command or check                  | Actual result                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`  | Clean temporary install succeeded from 56 source files without node_modules/dist; reused the local pnpm download cache |
| `pnpm typecheck`                  | Root, host-free core, and browser-only viewer checks passed                                                            |
| `pnpm lint` / `pnpm format:check` | Passed without lint errors or warnings                                                                                 |
| `pnpm architecture:check`         | 12 modules, 21 dependencies, no violations                                                                             |
| `pnpm test`                       | 4 files, 63 passing tests: core 38, CLI 3, history 7, documentation 15                                                 |
| `pnpm build`                      | Core, CLI, and static viewer built successfully                                                                        |
| `pnpm demo:check`                 | Built CLI output matched tested source in two processes/timezones                                                      |
| `pnpm test:e2e`                   | 5 Chromium tests passed against built output                                                                           |
| `pnpm docs:check`                 | 17 Markdown files, local links, and heading anchors passed                                                             |
| `pnpm check`                      | Full chain passed locally and in a clean copy without dependencies/build output                                        |
| `pnpm dev`                        | Local observatory started for interactive user acceptance                                                              |

Browser tests covered movement, same-cell pickup, repeated unavailable attempts, global/agent vision, playback/pause/seeking, disabled historical controls, appending only at the latest frame, file round trips, rejected imports preserving sessions, empty worlds, and imported names treated as text. Desktop 1440px and mobile 390px screenshots were inspected without horizontal overflow.

Implementation resolved Node timer versus browser handle types, stale dist resolution during viewer type checking, and Markdown lint only ignoring root node_modules. Failures were fixed without disabling type or lint rules. Negative-zero coordinates and radius were normalized for exact JSON round trips.

## Documentation and boundary review

README, overview, architecture, features, development workflow, agent guide, and CI were updated. [ADR-0004](../../decisions/0004-fixed-world-and-replay.md) was added while preserving PR-00 records. Rules/settings remained in one `world.ts`; the viewer did not create a second rules implementation. PRODUCT remained the sole feature status source, with human readability acceptance pending.

This record was translated into English in PR-03; the validation counts and original scope remain historical facts.

## Limitations and next steps

- Discrete grid only, without terrain obstacles, occlusion, diagonal movement, or continuous physics.
- Manual/scripted agents only, with no autonomous NPCs, World Agent, or model calls.
- Try records unavailable requests without generating, registering, or executing new skills.
- Page-memory history is limited to 500 actions; files are limited to 1 MB and the current rules version. Export is needed across refreshes.
- No branching history, autosave, database, server, or concurrent multi-user scheduling.
- macOS Chromium was verified; remote GitHub Actions, Linux/Windows, and Firefox/WebKit were not. No remote was configured and no PR was created, pushed, or merged.

A suggested next task is a decision interface consuming `Observation` and producing `WorldAction`, tested first with a deterministic strategy. Autonomous decisions and skill evolution were excluded from this PR.
