# Pull Request

## Objective and scope

Describe the concrete problem, resulting behavior, and Feature IDs. Link the execution plan.

## Changes and validation

- Main changes:
- Commands actually run, environment, and results:
- Unexecuted checks and reasons:
- Known limitations and risks:
- Validation task name, run ID, plan, report, and screenshot locations:
- Visual review findings for desktop, mobile, vision, actions, and replay:
- Agent behavior review findings:

## Documentation synchronization

Explain any items that do not apply. Write repository content and this PR description in English; communicate with the user in Chinese.

- [ ] PRODUCT reflects changed features, acceptance criteria, and evidence.
- [ ] ARCHITECTURE and dependency checks reflect module or interface changes.
- [ ] Important decisions have an ADR with alternatives, reasons, costs, and consequences.
- [ ] The execution plan records results and is archived when complete.
- [ ] README and development instructions match current commands and navigation.
- [ ] `pnpm check` ran; failed or unavailable checks are reported honestly.
- [ ] The [validation workflow](../docs/VALIDATION.md) was followed: `pnpm validate` opened the actual page, every current screenshot was inspected, and findings were recorded.
- [ ] All issues are fixed; validation ran after the final edit; `pnpm task:finish` succeeded and the report is `passed`.

## Semantic review

Static checks cannot establish complete agreement between documentation and implementation.

- [ ] Documented behavior, interfaces, and architecture diagrams match the code.
- [ ] Planned work is distinct from delivered features; PRODUCT alone owns status.
- [ ] Evidence and claims are accurate; local results do not substitute for remote CI or branch protection.
- [ ] The PR matches its plan without unrelated refactors or premature future features.
