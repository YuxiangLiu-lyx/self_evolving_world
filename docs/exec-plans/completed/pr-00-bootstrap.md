# PR-00: Project Bootstrap and Documentation System

- Date: 2026-11-06
- Working branch: `pr-00/bootstrap-documentation`
- Initial environment: empty directory with no Git repository or remote; host Node 25.2.1 and no pnpm.

## Objective and boundaries

Establish an understandable, verifiable, reproducible TypeScript project and documentation system, originally written in Chinese. Deliver two real modules: a pure tick core and CLI. Exclude NPC decisions, models, trade, skill evolution, UI, persistence, and servers. This historical record was translated into English in PR-03 without changing its original acceptance claims.

## Implementation steps

1. Inspect repository conventions and tools; define directories and one-way dependencies.
2. Pin Node LTS, pnpm, dependencies, and Actions; create the workspace.
3. Add a human overview, architecture, product inventory, ADRs, execution plans, and agent navigation.
4. Implement read-only tick state and a fixed CLI example with meaningful tests.
5. Add type, lint, formatting, dependency, documentation, and CI gates.
6. Validate installation, the full check, built output, and checker failure paths.
7. Review documentation against implementation, update PRODUCT and this plan, and archive.

## Acceptance checklist

- [x] Frozen installation succeeds from a clean directory with consistent versions and lockfile.
- [x] Strict TypeScript and enforceable one-way core/CLI dependencies are active.
- [x] Tests cover determinism, input immutability, invalid ticks, and boundaries.
- [x] Full `pnpm check` passes; built CLI output is correct and reproducible.
- [x] Required documents, navigation, ADRs, plans, PR template, and synchronization policy exist.
- [x] PRODUCT separates delivered functionality from Planned work; architecture reflects real modules.
- [x] CI is configured, with local and remote results clearly distinguished.
- [x] No unrelated features, refactors, or unnecessary services were introduced.

## Validation results

Validation ran on 2026-11-06 with macOS / arm64, Node 24.22.2, and pnpm 10.34.9. The host tools were not replaced. The official Node archive was downloaded and its SHA-256 checked; isolated tools in `/tmp/sew-pr00-toolchain` were added to validation processes through PATH.

Clean-install validation copied 44 source files into a fresh temporary directory without `.git`, `node_modules`, or `dist` and used an empty local `.pnpm-store`. This tested installation without dependency caches or build outputs; it did not constitute another OS or a wholly new machine.

| Command                                                  | Actual result                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile --store-dir .pnpm-store` | Clean copy installed successfully; unchanged lockfile; 277 packages for the current platform     |
| `pnpm typecheck`                                         | Root source/tests/scripts and independent host-free core check passed                            |
| `pnpm lint`                                              | Passed without warnings                                                                          |
| `pnpm format:check`                                      | Prettier passed                                                                                  |
| `pnpm architecture:check`                                | 6 modules, 7 dependencies, no violations                                                         |
| `pnpm test`                                              | 3 files, 28 passing tests: core 10, CLI 3, documentation 15                                      |
| `pnpm build`                                             | world-core and simulator compiled                                                                |
| `pnpm demo:check`                                        | Complete built CLI stdout matched expectations in independent UTC and Pacific/Honolulu processes |
| `pnpm docs:check`                                        | 15 Markdown files and required documents, local links, and anchors passed                        |
| `pnpm check`                                             | Full chain passed in the working directory and clean copy                                        |
| `pnpm demo`                                              | Clean copy built and printed `[{"tick":0},{"tick":1},{"tick":2},{"tick":3}]`                     |

Nine faults were injected and restored individually in a temporary copy: core Node I/O import, core-to-application import, CLI import of core internals, a dependency cycle, `Math.random()`, missing AGENTS, a broken local link, an undefined reference link, and changed built CLI output. Each relevant check failed with a nonzero exit code and expected diagnostic. Dependency-cruiser can return a violation count rather than exactly 1. These were execution-time fault experiments, not a new permanent test suite.

Implementation fixed a documentation encoding test that misunderstood Markdown normalization, added URL scheme checking, and added a missing top-level PR template heading. Installation selected a pinned ESLint 10 version instead of the no-longer-maintained ESLint 9. The full checks passed after these fixes.

The agent compared the overview and architecture with actual APIs, dependency configuration, manifests, commands, and tests. PRODUCT accurately retained pending human readability acceptance; other documents did not duplicate feature status tables.

## Limitations and follow-up

- GitHub Actions was configured, but no remote existed. No remote CI, PR, branch protection, Git commit, or push was performed. Changes remained in the local working branch for review.
- No local Linux/Windows validation ran; the first GitHub Actions run would cover Linux. Human readability and final acceptance had not occurred.
- Documentation checks did not prove semantics, Mermaid rendering, or external link availability. Dependency/lint rules were not a proof of purity.
- At PR-00, only ticks and snapshots existed: no NPC, World Agent, skill evolution, UI, persistence, or model calls.

The suggested PR-01 was minimal state and typed actions, with deterministic sequences, immutable inputs on invalid actions, documented/tested errors, an I/O-free core, passing checks, and synchronized product, architecture, ADRs, and plans. PR-01 was not implemented as part of PR-00.
