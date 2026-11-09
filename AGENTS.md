# Agent Guide

This project prioritizes Human Legibility, Agent Legibility, Enforceable Architecture, and Incremental Development. Humans own product direction and architectural acceptance; agents implement the authorized task scope.

## Language policy

- Communicate with the user in Chinese, including progress updates, questions, and final responses.
- Write all repository content in English: documentation, instructions, code comments, UI copy, error messages, examples, test descriptions, and validation reviews.
- Keep this policy in effect for future tasks. Preserve support for user-provided Unicode data and legacy replay inputs; compatibility fixtures may use Unicode escapes with English explanations.
- [agent.md](agent.md) is the user-requested entry point; this file remains the canonical agent guide.

## Unified task entry

Use the [programmatic task harness](docs/TASK_HARNESS.md): `pnpm task -- start validation-results/intent.json`. The program controls execution order and returns structured work to this current conversation; `submit`, `next`, `amend` and `status` continue the same task. Do not invent approval, permission or completion evidence.

Before preparation, inspect Git status and preserve unrelated work; read the [overview](docs/PROJECT_OVERVIEW.md), [feature inventory](docs/PRODUCT.md), [architecture](ARCHITECTURE.md) and relevant [ADRs](docs/decisions/README.md). Summarize the user's request in Chinese and record numbered requirements, exclusions and acceptance criteria in an English [execution plan](docs/exec-plans/README.md) before implementation. Follow the [documentation policy](docs/DOCUMENTATION_POLICY.md) and [PR contract](docs/PULL_REQUESTS.md).

Task routing uses actual changes, not an input label. Every newly requested experiment gets the next exN unless explicit reuse is recorded. Random-only experiments never call a model. Each experiment needs retained goals, results, visuals and [behavioral analysis](experiment/README.md#behavioral-analysis); recommendations remain analysis only unless separately requested.

## Required constraints

- Use `origin` for `https://github.com/YuxiangLiu-lyx/self_evolving_world.git`. Follow the [version control workflow](docs/DEVELOPMENT.md#version-control-and-ci): base focused branches on `main`, retain history, and inspect GitHub Actions for published commits. Local success does not establish remote CI success.
- Core logic must not depend on UI, applications, Node I/O, networking, or external AI services. Cross-package imports use public entry points.
- Keep base rules in `packages/world-core/src/world.ts`. Runtime settings and the skill set are immutable; `try` only records unsupported requests.
- Read [WORLD_FOUNDATION](docs/WORLD_FOUNDATION.md) before changing items, skills, or world behavior. Preserve its version-1 semantics during evolution; document future extensions separately instead of rewriting the founding catalogue or base skills.
- Preserve strict types. Do not introduce explicit `any`, implicit randomness, or system-clock-driven core behavior.
- `PRODUCT.md` is the sole source of feature status. Never describe Planned functionality as implemented or invent validation results.
- Synchronize feature records, architecture, ADRs, and execution plans when functionality, boundaries, important decisions, or completion status changes.
- Require the complete unfiltered test suite for every PR. Review every changed file against the numbered requirements, resolve all mismatches, and record current findings. Skipped tests, incomplete checks, stale reviews, or missing requirements block acceptance. Run `pnpm pr:check` before publishing and verify current `quality` and `pr-policy` checks before merging.
- Code, documentation, experiment-only and mixed tasks automatically proceed through reviewed commit, PR and guarded merge into `main`. The unified entry enforces current review, the complete PR body, current `quality` and `pr-policy`, no merge conflicts, and independently verified integration. Publication and merge authority are separate; a missing grant stops before merge. The user has authorized this default workflow. Only an explicit task-scoped no-PR or no-merge instruction permits the recorded exception in the [delivery contract](docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task). Missing access, checks or unresolved conflicts mean incomplete work, never an inferred exception.
- Preserve existing experiment archives. An explicit user-requested reuse must be recorded in the current plan using the [exception contract](docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task).
- Keep each PR focused. Escalate destructive changes, major architectural conflicts, and substantial scope expansion to the user.
- Before completing every task, including documentation tasks, use the unified entry and [validation criteria](docs/VALIDATION.md). Inspect every current screenshot, behavior result and changed file when requested. Only the independent completion gate establishes completion.
- Fix validation failures and rerun. Any source or documentation edit requires fresh validation. Do not reuse old task evidence, skip the browser, approve unseen screenshots, or substitute automated assertions for visual review. Report unresolved environment blockers as incomplete work.
