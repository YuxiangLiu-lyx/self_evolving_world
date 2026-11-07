# ADR-0003: Separate Documentation Authorities

- Date: 2026-11-06
- Status: Accepted

## Context

Projects maintained by agents can accumulate oversized instruction files, conflicting feature tables, and stale architecture descriptions. Humans need to understand present capabilities quickly, and agents need to find constraints relevant to each task.

## Decision

Keep `AGENTS.md` as a concise principles and navigation entry point. PROJECT_OVERVIEW explains the current project. PRODUCT alone owns feature status; ARCHITECTURE owns responsibilities and dependencies; ADRs preserve reasons; execution plans preserve implementation and actual validation.

The original overview was written in Chinese. PR-03 changes repository content to English while retaining Chinese user conversations, as required by the user. This language update leaves the ownership model unchanged; the current policy lives in [AGENTS](../../AGENTS.md#language-policy).

Establish a [documentation synchronization policy](../DOCUMENTATION_POLICY.md), PR checklist, and offline checks. Markdown lint, parsing, and heading slugs validate structure, links, and formatting. Reviewers verify the semantics of behavior, diagrams, and evidence.

## Alternatives

- Putting everything in AGENTS would make reading expensive and blur ownership.
- Separate status tables in README, overview, and product documentation would drift.
- Manual-only link and formatting checks would repeat work and miss errors.
- Treating structural checks as proof of consistency would overstate what automation can establish.

## Reasons

Every kind of knowledge has a clear home, reducing duplication. A short entry point supports selective reading. Checkers only conclude what they can actually verify, preserving semantic review.

## Costs

Developers maintain several short documents. Status and evidence can still become stale. Naming or format changes may require checker updates. External links are not fetched, avoiding a dependency on remote availability for local checks.

## Consequences

Use plans for substantial PRs, record actual results, and archive on completion. Update ADRs and architecture for major design changes. Change feature status only in PRODUCT. Synchronize policies and regression tests when checker scope changes.
