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

## Writing requirements

Each ADR includes its date, decision status (Accepted / Superseded), context, decision, alternatives, reasons, costs, and future consequences. Decision status describes the decision lifecycle, not PRODUCT feature status.

For a material change to an accepted decision, create a new ADR and mark the old one as superseded where appropriate. Preserve historical reasoning. Routine implementation details do not require separate ADRs.
