# ADR-0008: Numbered Offline Experiments and Task Routing

- Date: 2026-11-07
- Status: Accepted
- Extends: [ADR-0005](0005-browser-validation-gate.md) and [ADR-0006](0006-requirement-traceability.md), preserving complete tests and actual visual review.

## Context

The user requests the first random-action world experiment, retained goals/results/visualizations under `experiment/ex1`, increasing experiment numbers, and separate harness flows for code and experiment changes. The existing optional model experiment is a different operation and must not be invoked for an offline run.

## Decision

Keep seeded random selection in the simulator application and file/report/browser orchestration in repository tooling. Reuse the founding scenario and public action protocol. Use bounded round-robin turns, explicit xorshift32 state, and observation-based target selection. Preserve the core, initial catalogue, three skills and replay version.

Allocate a new directory exclusively above the greatest existing experiment number. Save a versioned manifest, original replay, recomputable results/report/chart and actual viewer captures. Preserve failed records as failures. Validate every snapshot's rules/settings, positions, ownership, observations and transition effects; compare artifacts against seeded reconstruction. Hash retained files and include all experiment content in task fingerprints. Historical provenance describes the actual capture; current browser checks create separate fresh review evidence without rewriting historical images.

The harness classifies the union of committed branch differences from `origin/main`, staged/unstaged edits, deleted paths and untracked files. Only numbered experiment artifacts plus their execution-plan files can form experiment-only work. Documentation, configuration, harness or application changes route through the code workflow; combined work is mixed. Experiment-only work validates records first, then runs the complete regression and browser workflow. Mixed work requires both. Every PR still runs the complete unfiltered suite, and the same completion gate checks fresh screenshots, behavior and requirements. No mode flag can relabel code as experiment-only work.

## Alternatives and reasons

- Unseeded randomness cannot reproduce the observed behavior. A fixed script would not exercise random selection.
- An external model would add a different experiment and account dependency beyond this request.
- Ignoring experiment output would lose retained results and stale-artifact detection. Keep this archive distinct from temporary validation and legacy model output.
- Skipping the full suite for experiments would conflict with the PR contract. Different ordering and additional artifact/visual checks provide separate workflows while retaining acceptance requirements.
- Importing viewer production code from the simulator would break application boundaries. Development tooling can compare formats and exercise real browser import without production coupling.

## Costs and consequences

The archive grows by a few images and a bounded replay per run. Each experiment adds browser replay and visual review work. The 500-action limit bounds this protocol; longer runs need a separate retention and viewer design. Exact report/chart generation constrains manual edits: change the generating tooling or protocol deliberately while preserving historical semantics. Digests and structural checks detect accidental changes but cannot prove honest review or resist rewriting all evidence and checker code.

See [experiment usage](../../experiment/README.md), [architecture](../../ARCHITECTURE.md) and [validation](../VALIDATION.md).
