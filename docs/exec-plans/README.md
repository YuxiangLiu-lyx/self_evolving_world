# Execution Plans

Plans help humans and agents track tasks, scope, progress, and evidence. Every PR needs a requirement summary recorded before implementation; small tasks may use a concise plan. PRODUCT remains the only feature status authority.

- [Active plans](active/README.md): work that has not completed acceptance.
- [PR-00](completed/pr-00-bootstrap.md): project bootstrap and documentation system.
- [PR-01](completed/pr-01-world-foundation.md): fixed world core, visualization, and replay.
- [PR-02](completed/pr-02-validation.md): real browser validation, behavior checks, and completion gate.
- [PR-03](completed/pr-03-english-repository.md): English repository content and Chinese user communication.
- [PR-04](completed/pr-04-github-integration.md): GitHub version control, CI execution, and retained validation evidence.
- [PR-05](completed/pr-05-world-foundation.md): permanent founding items, base skills, and environment specification.

- [PR-06](completed/pr-06-strict-pr-requirements.md): numbered requirements, complete tests, and current PR review gates.

## Format and lifecycle

Use `pr-NN-short-title.md` and include `Requirement summary`, numbered `Requirements` (`- R1: ...`), `Scope and exclusions`, `Acceptance criteria`, steps, results, unexecuted checks, limitations, and follow-up suggestions. See the [PR contract](../PULL_REQUESTS.md). Historical completed plans preserve their original format; new PRs and newly submitted work follow this contract. Create plans in active, update them during implementation, then move completed plans to completed and repair references.

Plans must distinguish intended validation from actual passing results. Explain any unavailable checks. Record commands, environment versions, outcomes, and key counts instead of copying full dependency logs. Historical records retain their original results even when translated.
