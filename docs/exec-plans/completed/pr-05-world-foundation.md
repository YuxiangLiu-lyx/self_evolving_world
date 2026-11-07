# PR-05: Fixed World Foundation Specification

## Requirement summary

Create one clear English reference for the permanent base-world specification, focused on starting items and the three base skills. Distinguish founding definitions from changing runtime state and future extensions. Preserve existing behavior and custom-world support.

The user subsequently requested completing and publishing PR-05 before PR-06. The requirements below make the existing scope explicit before finalization; they do not claim that numbering preceded the original draft.

## Requirements

- R1: Document all six starting items, their identities, counts, positions, and shared behavior against the existing viewer scenario.
- R2: Define the three base skills, automatic vision, world bounds, and action timing consistently with the version-1 core.
- R3: Preserve the founding specification during evolution and record future extensions separately without changing existing world behavior.
- R4: Integrate the foundation reference into project navigation, agent guidance, documentation ownership, and required-document checks.
- R5: Record semantic review and complete local validation, archive the plan, and prepare a focused PR with accurate remote-check limitations.

## Scope and exclusions

Change the foundation specification, its navigation and ownership rules, the feature inventory, this plan, and the required-document list. Do not change the core, viewer scenario, item effects, replay compatibility, or PR-06 tooling. Publishing does not authorize merging or weakening repository protection.

## Acceptance criteria

- Each item and initial agent matches `apps/viewer/src/scenario.ts` at tick 0; the loaded tick-12 demo is clearly distinguished.
- Skill, vision, settings, rejection, and immutability semantics match `packages/world-core/src/world.ts`.
- Evolution cannot rewrite the version-1 catalogue or base skill definitions; custom initial setups remain supported.
- Required-document, Markdown, link, formatting, architecture, type, unit, build, CLI, and browser checks pass.
- Every current screenshot and behavior result is reviewed, and the completion gate passes after the final source edit.
- The PR distinguishes successful local acceptance and observed remote results from unavailable checks and human merge acceptance.

## Progress

Inspected the fixed core and viewer scenario. The six named items are collectible instances with identical base behavior; there is no crafting, food, planting, or hydration system. The viewer's initial loaded demo is already at tick 12, while New world restores the documented tick-0 setup. Core custom setups and empty-world creation remain supported.

## Validation and semantic review

The pre-publication audit on macOS arm64 with Node 24.22.2, pnpm 10.34.9, and Chromium passed the complete validation chain: 77 unit tests, 7 browser tests, and 25 Markdown documents. All five screenshots were actually inspected, the HTML report was opened in Chromium, and `pnpm task:finish -- "Audit current PR improvements and world foundation"` passed for run `5fba27cc-e0b4-424a-8be1-56c0ecbd1ae6`.

- R1: Compared Wood, Stone, Berry, Crystal, Seed, Water, and all three initial agents with the scenario. IDs, counts, coordinates, and empty starting inventories match.
- R2: Read the core transitions and tests. Cardinal movement, occupancy and boundary rejection, unique same-cell pickup, record-only tries, circular inclusive vision, and logical action ticks match the specification.
- R3: Reviewed the explicit separation of permanent definitions from live ownership and future extensions. The core and application source remain unchanged; custom and empty setups are preserved.
- R4: Reviewed every changed navigation and ownership document and the required-document list. The existing checker tests and full documentation checks pass; no runtime mechanism is implied by a document-presence check.
- R5: Desktop and mobile layouts fit; initial agent vision, pickup and repeated tries, and historical frame 3 agree with the inspector and logs. Movement, collisions, ownership, visibility, replay invariance, import/export, and browser health assertions pass.

This archive and the feature-status update require a fresh `pnpm validate -- "PR-05 fixed world foundation"`, actual review of all new evidence, and `pnpm task:finish` before commit. The PR records the final task/run ID and reviewed commit, avoiding a self-referential commit hash in this file.

## Publication and limitations

Publish `docs/world-foundation` against `main` before PR-06. At finalization, `main` requires both `quality` and `pr-policy`, while the new policy workflow exists only in the separate PR-06 worktree. Inspect the actual PR-05 quality run and explicitly report the unavailable policy check. It must not be reported as successful or bypassed. The policy rollout and a subsequent current check are prerequisites for merging this PR.

This task adds a specification and documentation navigation/checking only. It does not implement evolution or add runtime item effects, and a required-document check does not enforce semantic immutability. Human architectural acceptance and merging remain separate. Remote CI results are recorded in the published PR; local success does not establish them.
