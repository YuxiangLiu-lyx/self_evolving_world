# ADR-0020: Dependency-scoped acceptance with authenticated evidence

- Date: 2026-11-21
- Decision status: Accepted
- Supersedes: the unconditional execution and screenshot freshness rules in [ADR-0005](0005-browser-validation-gate.md) and [ADR-0006](0006-requirement-traceability.md). Their actual-review and PR integration requirements remain in force.

## Context

Reading an experiment reconstructed its entire history. Builds, analysis, browser reference checks and repeated completion gates each invoked that reader. Every documentation edit invalidated all images, and push, PR and body-edit events duplicated quality jobs. The ex8 delivery retained timeout failures before increasing its CI limit. The user explicitly authorized impact-based acceptance and requires preserved scientific archives.

## Decision

Keep the existing coordinator. A deterministic planner reads actual changed paths and maps known protocol ownership; shared or unknown dependencies expand coverage. Code changes retain all unit tests. Documentation changes run documentation/format and contract checks; new archives select their own deep and browser checks. Shared viewer changes select affected protocol loads, state comparisons and representative images. Explicit `validate:audit` runs every check with a fresh evidence domain.

Separate metadata reads, complete archive integrity and deep reconstruction. Deep acceptance executes once for an archive/dependency fingerprint and saves its reference states. Build/analysis readers do not reconstruct. Completion verifies matching signed receipts and input/artifact hashes, without recomputing the experiment. All historical files, including ignored additions, nested calls, replay segments and source snapshots, are compared against one Git tree inventory using Git blob hashes in-process.

Local evidence is authenticated with a private ignored runner key. It binds validator/runtime/archive/toolchain inputs, result provenance and output bytes. Unsigned old PASS records, failed receipts, missing output and changed dependencies cannot qualify. This protects against accidental or supplied-cache substitution, not arbitrary code/key access by the repository owner. CI rotates its key and never imports local acceptance. Keys are excluded from uploaded artifacts. Original source snapshots remain intact; runtime continuity compares executable runtime content separately from acceptance tooling.

Screenshot reuse requires matching browser dependencies, retained pixel hashes and an authenticated prior actual review. New or affected scenes require direct inspection. A repository-wide fingerprint still binds the current requirement/diff review; it no longer forces unrelated expensive checks to recompute. Every result reports its trigger, elapsed time, reconstruction count and executed/reused/not-applicable disposition.

Quality runs on PR commit events and main pushes, not development-branch pushes or PR-body edits. `quality` and `pr-policy` retain stable names. Quality freshness follows the exact head; policy follows the reviewed body revision, without treating a COMMENT as a code change. Conflict, complete requirement mapping, current self-review and independently verified merge gates remain.

## Alternatives and reasons

- Increasing timeout preserves wasted work and does not solve repeated review.
- Path-only CI workflow skipping can leave required checks pending; one always-present quality job instead derives its internal scope.
- Trusting cached PASS JSON loses provenance; fingerprints and authenticated receipts are required.
- A service or recursive agent adds unnecessary operational complexity. Small repository modules suffice.

## Costs and consequences

Protocol ownership rules require maintenance. Unknown changes conservatively widen coverage, and missing/invalid evidence reruns the selected checks. Cache loss costs time, never correctness. Browser playback still executes the application's replay code; eliminating duplicate validation does not remove compatibility checks. Full audits remain useful after dependency or architectural changes. No model calls, experiment reruns or world changes are introduced by this decision.
