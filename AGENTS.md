# Agent Guide

Humans own product direction and architectural acceptance; agents implement the requested scope. Keep changes focused, verifiable and honest.

## Language policy

- Communicate with the user in Chinese, including progress updates, questions and final responses.
- Write all repository content in English: documentation, code comments, UI copy, error messages, tests, plans and PR text.
- Preserve support for user-provided Unicode data and legacy replay inputs; fixtures may use Unicode escapes with English explanations.
- [agent.md](agent.md) is a short entry point; this file is the canonical agent guide.

## Workflow

Follow the [development workflow](docs/DEVELOPMENT.md#workflow):

1. Check `git status`, preserve unrelated work and branch from current `origin/main`. One concern per branch and PR.
2. For features and experiments, write a short [execution plan](docs/exec-plans/README.md) with numbered requirements (`- R1: ...`) before implementing. Small fixes may skip it.
3. Implement, then run `pnpm validate`. It selects checks from the actual changes. Fix failures; never skip, focus or delete tests to pass. For viewer changes, look at the new screenshots it lists.
4. Commit, then `pnpm pr -- body.md "Title" --merge` (template: [.github/pull_request_template.md](.github/pull_request_template.md)). CI `quality` and `pr-policy` must pass before merge. The user has authorized merging by default; follow an explicit task-level "no PR" or "no merge" instruction.

Read the [overview](docs/PROJECT_OVERVIEW.md), [architecture](ARCHITECTURE.md) and relevant [ADRs](docs/decisions/README.md) before structural changes. Escalate destructive changes, major architectural conflicts and substantial scope expansion to the user.

## Experiments

- Every requested experiment gets the next `exN` (allocated by the command, never chosen by hand). Existing archives are immutable unless the user explicitly asks to reuse one, recorded in the plan as `- Experiment reuse: exN — reason`.
- Random runs never call a model. Model-calling runs require the user's request.
- Each new experiment keeps its goals, results, replay, screenshots and a [behavioral analysis](experiment/README.md#behavioral-analysis). Recommendations remain analysis only unless separately requested.

## Code constraints

- Core logic in `packages/world-core` must not depend on UI, applications, Node I/O, networking or AI services. Cross-package imports use public entry points.
- Keep founding rules in `packages/world-core/src/world.ts` and preserve [WORLD_FOUNDATION](docs/WORLD_FOUNDATION.md) version-1 semantics; document extensions separately.
- Strict types: no explicit `any`, implicit randomness or system-clock-driven core behavior.
- [PRODUCT.md](docs/PRODUCT.md) is the only source of feature status. Never describe Planned work as implemented or invent results. Update PRODUCT, ARCHITECTURE and ADRs when features, boundaries or important decisions change.
- Use `origin` for `https://github.com/YuxiangLiu-lyx/self_evolving_world.git`. Never force-push shared history. Local success does not establish remote CI success; report failures and blockers as incomplete work.
