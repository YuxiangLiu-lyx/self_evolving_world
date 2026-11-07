# ADR-0005: Real Browser Validation and Task Completion Gate

- Date: 2026-11-06
- Decision status: Accepted

## Context

Types and unit tests cannot reveal missing styles, cramped layouts, or UI behavior disconnected from the core. The user requires opening the relevant page for each task, checking basic aesthetics and agent behavior, and finishing only after validation succeeds.

## Decision

Reuse Playwright and Chromium to validate actual built pages. Monitor runtime and resource failures in every browser test. Check layout, boundary/occupancy rejection, ownership, skill attempts, vision, and replay invariance. Save five required scenes and provide an HTML report for review.

`pnpm validate` wraps the full `pnpm check` and produces a pending report with task name, run ID, source fingerprint, and screenshot hashes. A human or Codex actually inspects every screenshot and behavior result and records findings. `pnpm task:finish` rejects failed, missing, or stale evidence. Source or documentation edits require a new run and review.

Validation belongs to development tooling. It adds no I/O, clock, or validation state to the fixed core and no review controls to the product interface. [VALIDATION](../VALIDATION.md) owns the detailed process; AGENTS and development documentation link to it.

## Alternatives and reasons

- Unit tests alone do not cover real rendering and interaction.
- Automatically approving captured screenshots does not establish visual quality.
- Pixel snapshots alone still need an initial review and introduce font/platform noise; objective layout checks plus direct inspection fit the current stage.
- External vision services add dependencies and credentials when local tools already meet the need.

## Costs and consequences

Every task must run a browser and inspect images. Automation can validate evidence completeness and freshness but cannot prove an honest review. Agent instructions and code review still enforce that responsibility. Add scenes for new pages, viewports, or autonomous behavior. Remote CI can provide automated results but cannot replace aesthetic judgment.
