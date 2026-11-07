# ADR-0001: Pinned TypeScript Workspace and Node ESM

- Date: 2026-11-06
- Status: Accepted

## Context

The project began in an empty directory and needed reproducible commands for humans and Codex. PR-00 contained only a core and CLI, without a need for application frameworks, task orchestration platforms, or external services.

## Decision

Use pnpm workspace, strict TypeScript, Node ESM / NodeNext, Vitest, ESLint, and Prettier. Pin Node to 24.22.2, pnpm to 10.34.9, and direct dependencies to exact versions. Record transitive dependencies in the lockfile. CI uses frozen installation and GitHub Actions pinned by commit SHA.

Choose the established Node 24 LTS and TypeScript 5.9 lines rather than treating the latest major release as a goal. Manifests, the lockfile, and [.node-version](../../.node-version) own exact versions. Initial setup consulted [Node release status](https://nodejs.org/en/about/previous-releases), [TypeScript strict mode](https://www.typescriptlang.org/tsconfig/strict.html), [pnpm installation](https://pnpm.io/installation), and the [Vitest guide](https://vitest.dev/guide/), then verified compatibility through installation.

## Alternatives

- A single npm package would reduce manifests but make real core/application package boundaries harder to enforce.
- npm or Yarn workspaces would also work; the requested stack favored pnpm without a compelling reason to change.
- CommonJS would run but add future conversion work for ESM integrations.
- Nx or Turborepo could supply caching and task graphs; two packages did not justify the extra abstraction.

## Reasons

Workspaces express dependency direction directly. TypeScript and simple tsc builds are easy to inspect. Shared commands reduce local/CI differences, and a framework-independent core remains reusable.

## Costs

An exact Node patch requires environment management. Strict typing may require more initial code. Upgrades need explicit maintenance instead of tracking latest automatically. A lockfile fixes dependency resolution but does not make native optional dependencies identical across operating systems.

## Consequences

Upgrade tooling in a focused PR that updates versions and the lockfile and repeats clean installation, full checks, and built-output validation. Add task caching infrastructure only when build scale warrants it.
