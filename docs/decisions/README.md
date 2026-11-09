# Architecture Decision Records

ADRs explain why a design was chosen rather than duplicating module descriptions or feature status. Use increasing four-digit identifiers and filenames such as `NNNN-short-title.md`. Link related architecture, features, or execution plans.

| ADR                                     | Decision                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| [0001](0001-typescript-workspace.md)    | Pin TypeScript / pnpm workspace and Node ESM tooling                         |
| [0002](0002-functional-core.md)         | Pure world core, outer CLI, and executable dependency boundaries             |
| [0003](0003-documentation-authority.md) | Separate documentation authorities and combine structural checks with review |
| [0004](0004-fixed-world-and-replay.md)  | One fixed world core, automatic vision, and verifiable replay                |
| [0005](0005-browser-validation-gate.md) | Real pages, individual screenshot reviews, and a task completion gate        |

- [0006](0006-requirement-traceability.md): numbered requirements, complete test execution, and current PR review gates.

- [0007](0007-single-round-model-adapter.md): local ChatGPT authorization, bounded external decisions, and unchanged core semantics.

- [0008](0008-numbered-experiments-and-task-routing.md): numbered offline experiments, validated artifacts and task-specific harness routing.

- [0009](0009-static-experiment-browser.md): static validated experiment data, dropdown navigation and read-only archived histories.

- [0010](0010-synchronous-rounds-and-pr-delivery.md): simultaneous collection rounds, preserved legacy archives and mandatory PR delivery for every task route.

- [0011](0011-default-merge-completion.md): default guarded PR merge, explicit task exceptions and independently verified completion.

- [0012](0012-survival-programs.md): bounded ChatGPT plan-funded behavior code, survival-v1, denied learning and version-3 archives.

- [0013](0013-programmatic-task-harness.md): programmatic task continuation, unchanged acceptance boundaries and retained experiment analysis.

## Writing requirements

Each ADR includes its date, decision status (Accepted / Superseded), context, decision, alternatives, reasons, costs, and future consequences. Decision status describes the decision lifecycle, not PRODUCT feature status.

For a material change to an accepted decision, create a new ADR and mark the old one as superseded where appropriate. Preserve historical reasoning. Routine implementation details do not require separate ADRs.

- [0014](0014-enforced-task-entry.md): coordinator-bound legacy commands and version-bound GitHub self-review provenance.

- [0015](0015-survival-driven-skills.md): versioned survival pressure, generated constrained implementations, individual learning and durable round barriers.
