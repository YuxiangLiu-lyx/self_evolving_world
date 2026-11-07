# ADR-0006: Requirements, Complete Tests, and Current PR Reviews

- Date: 2026-11-06
- Decision status: Accepted

## Context

A passing test suite does not show that a change implements the user's request. The existing PR checklist could omit individual requirements and still appear complete. Unit tests could be skipped while the overall process exited successfully. The user requires a summary before development, explicit PR requirements, all tests, and comparison of code with those requirements.

## Decision

Keep numbered requirements and acceptance criteria in a task plan recorded before implementation. Every PR repeats those requirements and maps each requirement and changed file to implementation and verification findings. A read-only CI check validates the plan, coverage, complete attestations, and latest reviewed head. Local PR preflight additionally verifies the actual completed task/run evidence. Extend the existing task gate with a pending requirement/full-diff review, never automatic semantic approval.

Run the complete existing quality suite for every PR, including documentation-only changes. Forbid focused tests and reject skipped, todo, expected-failure, or incomplete unit runs; retain the browser reporter's equivalent enforcement. GitHub protection separately requires current successful `quality` and `pr-policy` checks, resolved conversations, and PR-based updates, including for administrators. Do not impose an unrequested second-person approval count. [PULL_REQUESTS](../PULL_REQUESTS.md) owns the workflow and explicit enforcement limits.

## Alternatives and reasons

- A prose checklist alone cannot detect missing requirement IDs, unreviewed files, stale commit references, or skipped unit tests.
- An automated model judging every diff would add a service, credentials, nondeterminism, and no guarantee of semantic correctness. Actual review with recorded evidence fits the current scope.
- A separate requirements database would duplicate execution plans. Structured Markdown preserves readability and reuses existing documents and parsing tools.
- Repository files alone cannot block merging. Use independently verified GitHub protection and distinguish rollout state from local acceptance.

## Costs and consequences

Authors must maintain a requirement matrix and update evidence after changes. A concise plan is required even for small PRs. Existing unfinished PRs must adopt the contract when the policy is activated. The PR body and source checks are necessary conditions, not proof that the reviewer read honestly or that all possible bugs are tested. Humans retain architectural acceptance. Changes to checker/workflow code themselves require careful semantic review; repository administrators can change the policy. World behavior and core dependencies remain unchanged.
