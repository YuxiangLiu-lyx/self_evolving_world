# Agent Guide

This project prioritizes Human Legibility, Agent Legibility, Enforceable Architecture, and Incremental Development. Humans own product direction and architectural acceptance; agents implement the authorized task scope.

## Language policy

- Communicate with the user in Chinese, including progress updates, questions, and final responses.
- Write all repository content in English: documentation, instructions, code comments, UI copy, error messages, examples, test descriptions, and validation reviews.
- Keep this policy in effect for future tasks. Preserve support for user-provided Unicode data and legacy replay inputs; compatibility fixtures may use Unicode escapes with English explanations.
- [agent.md](agent.md) is the user-requested entry point; this file remains the canonical agent guide.

## Start a task

1. Inspect Git status and preserve unrelated changes.
2. Read the [project overview](docs/PROJECT_OVERVIEW.md) and [feature inventory](docs/PRODUCT.md); distinguish delivered behavior from plans.
3. Before changing a module, read the [architecture](ARCHITECTURE.md) and relevant [ADRs](docs/decisions/README.md).
4. Before implementation, summarize the current request to the user in Chinese and record numbered requirements, exclusions, and acceptance criteria in an English task plan. Every PR repeats these requirements and maps them to the actual changes and evidence; follow the [PR contract](docs/PULL_REQUESTS.md).
5. Follow the [development workflow](docs/DEVELOPMENT.md) and [documentation policy](docs/DOCUMENTATION_POLICY.md). Maintain an [execution plan](docs/exec-plans/README.md) for substantial tasks.
6. Identify code, experiment-only, or mixed work using the [task harness](docs/VALIDATION.md#task-harness-routing). For requested offline experiments, follow [experiment/README.md](experiment/README.md): allocate a fresh next `exN` for every new experiment unless the user explicitly requests reuse, retain goals/results/visuals, and validate the record. Mixed work must satisfy both flows; never call a model for a random-only experiment.

## Required constraints

- Use `origin` for `https://github.com/YuxiangLiu-lyx/self_evolving_world.git`. Follow the [version control workflow](docs/DEVELOPMENT.md#version-control-and-ci): base focused branches on `main`, retain history, and inspect GitHub Actions for published commits. Local success does not establish remote CI success.
- Core logic must not depend on UI, applications, Node I/O, networking, or external AI services. Cross-package imports use public entry points.
- Keep base rules in `packages/world-core/src/world.ts`. Runtime settings and the skill set are immutable; `try` only records unsupported requests.
- Read [WORLD_FOUNDATION](docs/WORLD_FOUNDATION.md) before changing items, skills, or world behavior. Preserve its version-1 semantics during evolution; document future extensions separately instead of rewriting the founding catalogue or base skills.
- Preserve strict types. Do not introduce explicit `any`, implicit randomness, or system-clock-driven core behavior.
- `PRODUCT.md` is the sole source of feature status. Never describe Planned functionality as implemented or invent validation results.
- Synchronize feature records, architecture, ADRs, and execution plans when functionality, boundaries, important decisions, or completion status changes.
- Require the complete unfiltered test suite for every PR. Review every changed file against the numbered requirements, resolve all mismatches, and record current findings. Skipped tests, incomplete checks, stale reviews, or missing requirements block acceptance. Run `pnpm pr:check` before publishing and verify current `quality` and `pr-policy` checks before merging.
- Code, documentation, experiment-only and mixed tasks all automatically proceed to a reviewed commit and PR targeting `main`. After the local gate, prepare the complete PR body and run `pnpm task:publish`; inspect its current `quality` and `pr-policy` checks before reporting delivery. Do not stop at local changes or ask again for already-authorized publication. Never merge unless explicitly instructed.
- Preserve existing experiment archives. An explicit user-requested reuse must be recorded in the current plan using the [exception contract](docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task).
- Keep each PR focused. Escalate destructive changes, major architectural conflicts, and substantial scope expansion to the user.
- Before completing every task, including documentation tasks, follow the [validation workflow](docs/VALIDATION.md): run `pnpm validate -- "task name"` to open the current build; inspect every current screenshot and behavior result; record the review; complete only after `pnpm task:finish -- "task name"` succeeds.
- Fix validation failures and rerun. Any source or documentation edit requires fresh validation. Do not reuse old task evidence, skip the browser, approve unseen screenshots, or substitute automated assertions for visual review. Report unresolved environment blockers as incomplete work.
