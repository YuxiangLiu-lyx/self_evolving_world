# Documentation Synchronization Policy

## Authoritative sources

| Content                                                       | Owning document                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| Feature status, acceptance criteria, and evidence             | [PRODUCT](PRODUCT.md)                                           |
| Module responsibilities, interfaces, and dependency direction | [ARCHITECTURE](../ARCHITECTURE.md)                              |
| Context and tradeoffs for important choices                   | [ADRs](decisions/README.md)                                     |
| Task scope, implementation, and actual validation             | [Execution plans](exec-plans/README.md)                         |
| Human explanation and first-run instructions                  | [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md), [README](../README.md) |
| Agent navigation and language policy                          | [AGENTS](../AGENTS.md)                                          |
| Task validation, visual review, and completion gate           | [VALIDATION](VALIDATION.md)                                     |

All repository content is in English. Conversations with the user remain in Chinese. Translation of historical records must preserve their original scope, results, and limitations rather than claiming current capabilities existed earlier.

Requirement summaries, the PR requirement-to-change matrix, full-diff review, and current-head acceptance follow [PULL_REQUESTS](PULL_REQUESTS.md). Every requirement and changed file must be accounted for; green structural checks do not substitute for this semantic review.

## Synchronization triggers

1. New or changed functionality: update the corresponding Feature ID, status, acceptance criteria, and evidence in PRODUCT within the same PR.
2. Changed module responsibilities, interfaces, or dependencies: update ARCHITECTURE and automated dependency rules. Mark future modules as Planned.
3. Important architectural decisions: add an ADR or mark a previous decision as superseded. Preserve the decision history.
4. Task completion: record real results, unexecuted checks, and limitations, then archive the plan. Never describe incomplete acceptance as passed. All tasks, including documentation edits, follow [validation](VALIDATION.md); documentation changes invalidate the previous fingerprint.
5. Changed commands, environment versions, or reading paths: update README, the development workflow, and navigation. Do not duplicate feature status tables.

## Automated validation scope

`pnpm docs:check` checks nonempty required documents, active/completed directories, ADR and plan presence, local file/image links, Markdown heading anchors, and Markdown lint. Links are parsed as Markdown, including reference links. Heading anchors use GitHub-style slugs, including duplicate suffixes. `pnpm format:check` checks formatting.

Resolve local links relative to the containing file. Absolute paths, paths escaping the repository, and `file:` URLs are not allowed. `https:`, `http:`, and `mailto:` links are allowed but are not fetched. Use standard Markdown links and ATX headings instead of navigation that depends on HTML or platform-specific rendering. Undefined reference links should also be rejected.

**Structural checks do not prove that documentation matches implementation.** They do not validate the business meaning of Mermaid diagrams, external URL availability, truthful execution claims, or product design quality.

## Required semantic review

- Does the described behavior exist, and was the evidence actually produced?
- Do responsibilities, data flow, and Mermaid diagrams match current boundaries?
- Are Planned features clearly separated from delivered functionality? Do other documents reference PRODUCT instead of duplicating its status table?
- Do new decisions explain alternatives, reasons, costs, and future effects?
- Are unexecuted remote CI, branch protection, and human acceptance clearly identified?

The [PR template](../.github/pull_request_template.md) includes these checks. Mark irrelevant documentation items as not applicable with a reason; do not create unrelated documentation changes.
