# ADR-0013: Programmatic Task Continuation and Experiment Analysis

- Date: 2026-11-09
- Decision status: Accepted

## Context

Validation, archive reconstruction, PR policy and guarded delivery already exist as scripts, but conversation instructions manually connect them. Parameters, accepted evidence and the next action can be lost across interruptions. Experiments also lack systematic retained per-actor behavioral interpretation. The user requests both a behavior-equivalent coordinator and an explicitly additional analysis step, without a separate model service or changes to world behavior.

## Decision

Use a thin TypeScript state machine with Node effects that call the original commands. Persist original intent, derived facts and execution evidence separately in ignored validation output. Return a version-bound JSON request and exit for current-conversation preparation, analysis, complete semantic/visual review, PR body writing and authorized GitHub merge operations. Recheck actual gates on continuation; a submitted declaration is never completion.

Keep existing classification, complete tests, review semantics, archive reconstruction, delivery exceptions, bounded polling and final remote verification. Publication and real merge authority are distinct. No grant is inferred from a green PR. Existing grants carry their instruction source and scope. The local-only implementation's reviewed dirty-worktree behavior is preserved even though general prose discusses commits.

As a separately authorized extension, retain analysis JSON and readable Markdown under `experiment/analyses/exN/<task-id>.*`. Bind every original artifact hash, cover every actor and separate isolation evidence, individuality, behavior, causal hypotheses, limitations and proposed controlled improvements. Keep original exN archives immutable. Validate structure/freshness and require current-conversation review, without treating recommendations as implementation authorization or redefining experiment success.

## Alternatives and reasons

Keeping another prose checklist would leave order and branching to memory. A workflow framework, autonomous reviewer or SDK would add unnecessary infrastructure, duplicate judgment and violate the requested current-conversation boundary. Replacing existing gates would risk policy drift. Embedding retrospective analyses inside completed archives would violate their exact file and hash contracts.

## Costs and consequences

Journals need recovery reconciliation, and state machines need failure/interruption tests. Shared current validation evidence permits only one coordinator execution at a time. File structure checks cannot prove honest review, authentic permission or causal correctness; humans/current Codex remain responsible for those judgments. Future experiment analyses propose changes for later authorization, not self-modification.

See [the entry and protocol](../TASK_HARNESS.md), [validation criteria](../VALIDATION.md), [delivery contract](../PULL_REQUESTS.md), and [the migration plan](../exec-plans/completed/pr-13-programmatic-harness.md).
