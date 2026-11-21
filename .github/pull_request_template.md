# Pull Request

Copy numbered requirements from the task plan created before implementation. Replace every `REPLACE_ME`, review the complete diff, and check boxes only after the work and evidence exist. Draft PRs may be incomplete, but cannot pass this gate. Write the PR in English.

## Requirements

- R1: REPLACE_ME with the exact requirement from the task plan.

## Scope

- Plan: `docs/exec-plans/active/pr-00-replace-me.md`
- In scope: REPLACE_ME with authorized changes and Feature IDs.
- Out of scope: REPLACE_ME with explicit exclusions.

## Requirement review

List exact changed paths in code spans. Include every changed file, including tests, documentation, deletions, and configuration. Use multiple rows for a requirement when useful. Describe what was inspected and verified; filenames alone are insufficient.

| Requirement | Changed files and implementation                | Verification evidence and findings                        | Result  |
| ----------- | ----------------------------------------------- | --------------------------------------------------------- | ------- |
| R1          | `REPLACE_ME` implements the requested behavior. | REPLACE_ME with actual checks and requirement comparison. | PENDING |

## Validation

- Reviewed head: REPLACE_ME with the full latest PR head commit SHA.
- Task: REPLACE_ME with the actual validation task name.
- Run ID: REPLACE_ME with the completed local validation run ID.
- Selected checks: PENDING
- Results: REPLACE_ME with environment, selected check reasons, counts, durations, deep rebuilds, reuse/not-applicable entries, evidence locations, and actual remote CI state.
- Visual and behavior review: REPLACE_ME with concrete findings from each selected or dependency-bound reused screenshot and behavior result.

Remote `quality` and `pr-policy` checks must both pass for the current revision before merging. An unavailable check is a blocker, not a waiver. Changes require a fresh impact plan and current diff review; matching trusted check evidence may be reused; a new head requires updating this description.

## Code review

- Reviewer: REPLACE_ME
- Findings: REPLACE_ME with the full-diff comparison against each requirement, regression risks, scope deviations, and their resolution. All requirement mismatches must be resolved before PASS.

## Documentation synchronization

REPLACE_ME with affected PRODUCT records, architecture, ADRs, execution plan, and usage documentation, or a specific reason each is unchanged. Planned functionality must remain distinct from delivered behavior.

## Completion checklist

- [ ] All requirements are satisfied.
- [ ] Every changed file was reviewed against the requirements.
- [ ] No unrelated changes or unresolved requirement mismatches remain.
- [ ] All selected checks passed without skipped or focused tests; exclusions and reuse are recorded.
- [ ] Current visual, behavior, and requirement reviews passed.
- [ ] The local review gate passed after the final edit.
