# ADR-0027: Lean Development Workflow

- Date: 2026-11-23
- Decision status: Accepted
- Supersedes: the task coordinator of [ADR-0013](0013-programmatic-task-harness.md), the enforced entries and GitHub self-review of [ADR-0014](0014-enforced-task-entry.md), the completion gate of [ADR-0011](0011-default-merge-completion.md), the requirement/changed-file matrix of [ADR-0006](0006-requirement-traceability.md), and the one-round runner of [ADR-0007](0007-single-round-model-adapter.md)

## Context

Every task, including one-line documentation fixes, went through a programmatic coordinator. The agent wrote an intent file and five or six bound JSON responses, filled per-scene review verdicts, and wrote a PR body that mapped every changed file in code spans and quoted the exact head SHA and run ID. It then posted a GitHub COMMENT self-review of up to 65,000 characters and recorded merge authority. After that, publication and completion gates each re-verified everything. Any edit invalidated the whole chain, so one heading fix needed a full extra cycle. Whole-tree fingerprints over more than a gigabyte of archives ran several times per step. The validation planner also treated newer continuous-family files as shared, so changing them reconstructed every grid archive. Most bindings guarded the coordinator's own handoffs. The COMMENT explicitly was not independent review, and branch protection already enforced the required checks.

## Decision

Replace the coordinator with standalone commands: branch from `origin/main`, write a short plan for features and experiments, run `pnpm validate`, commit, and publish with `pnpm pr -- body.md "Title" --merge`. CI enforces the safeguards that carry real value:

- types, lint, formatting and architecture boundaries;
- the complete unit suite;
- dependency-scoped archive reconstruction and browser checks;
- archive immutability with an explicit reuse line;
- companion-analysis format checks;
- documentation links;
- a light `pr-policy`: concrete Summary and Validation, a changed plan with numbered requirements when one is referenced, and a plan plus companion analysis for every new `exN`.

Experiment work uses direct commands: `experiment:run`, `experiment:continuous` (`new`, `continue`, `develop`, `extend`, `repair`), `experiment:capture` and `experiment:analysis`. Allocation stays exclusive and automatic, random runs stay model-free, and development barriers, source-boundary checks and the no-resend rule for uncertain calls are unchanged. The continuous family (`open-`, `long-`, `collective-`, `material-`) maps to protocol 7 only, and validation tooling changes run code checks only.

Remove code that only served retired paths: incident-specific checkpoint and ex12 repair branches, unreachable audit scripts, the fixed CLI demo, the one-round model experiment, and the run entry points of survival, learning, evolution and coevolution. Every archive still validates and replays.

## Alternatives and reasons

Trimming the coordinator (keeping the state machine but dropping the COMMENT and matrix) would keep most handoffs and the invalidation cascade. Dropping replay of grid-era archives would remove about 20,000 more lines but lose interactive history and conflicts with preserving the founding semantics; it was not chosen.

## Costs and consequences

Honest visual review, requirement-to-change judgment and documentation synchronization are now conventions recorded in the PR description rather than structurally checked; the previous checks could not prove them either. Local validation no longer produces signed evidence; CI reruns every selected check on the exact head. Validation tooling changes no longer trigger reconstruction automatically; run `pnpm validate:audit` (or the manual CI audit) when such a change affects reconstruction or scenes. Starting a new grid-era experiment would require restoring its entry point from history.
