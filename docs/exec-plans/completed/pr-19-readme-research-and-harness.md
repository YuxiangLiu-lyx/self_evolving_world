# PR-19: Research-first README and Development Harness Guide

## Requirement summary

Make the current project understandable in one to two minutes: lead with the research question, executable evolution loop, measured experimental outcomes and a real demo image. Explain the existing code-development harness and replace stale or distracting entry-point material with accurate links.

## Requirements

- R1: Lead the README with the research objective, core mechanism and evidence-backed experimental outcomes, including negative findings and causal limits.
- R2: Show a retained real experiment screenshot and provide a working local replay quick start with current pinned tools and no inference requirement.
- R3: Explain the existing development harness structure with detailed task/protocol branches, paused development and recovery, conversation handoffs, persisted evidence and validation-to-merge gates without changing the framework.
- R4: Keep the README concise, remove obsolete or redundant entry-point content, preserve useful navigation and complete the existing documentation validation and delivery workflow.

## Scope and exclusions

Update README and this plan/index only. Inspect current main, PRODUCT, architecture, harness implementation and retained reports as factual sources. Preserve every experiment and protocol. No new experiment, inference, feature implementation, harness refactor, dependency change or new image generation. PRODUCT, architecture and ADRs remain authoritative and unchanged because functionality and boundaries do not change.

## Acceptance criteria

- The opening overview conveys the question, request-to-execution loop, actual ex5/ex6/ex7 outcomes and a real screenshot within a short introductory read.
- Distinguish capability implementation, mastery, execution and sustained benefit; do not describe ex7 mental satisfaction or cooperation as observed.
- The screenshot and repository links resolve. The saved ex7 viewer loads without authentication or model calls; historical grid records remain explicitly historical.
- Harness explanation matches task.ts, task-context.ts, task-flow.ts, task-runtime.ts and the existing guarded entry/review/delivery contracts. Diagrams distinguish code/documentation, experiment and mixed change classification; no-run and protocol branches; retrospective analysis; frozen development handoffs; failure recovery; and explicit delivery exceptions. Do not imply that requestedType chooses the route or bypasses checks.
- All changed files are reviewed against R1-R4; full unfiltered checks, every current screenshot, behavior review, current-head PR checks and independent merge verification remain required.

## Steps

1. Inspect the clean main baseline, documentation owners, reports, screenshot and harness implementation.
2. Rewrite the README around research, evidence, replay and the development harness; preserve the existing quick-start anchor.
3. Check links and rendered readability, then run the full harness validation and inspect current evidence.
4. Commit reviewed changes, publish the complete PR and exact-head self-review, and merge only after current gates pass.

## Results and validation

The user subsequently requested more detailed harness diagrams because the initial linear flow omitted the actual branching structure. Revision 3 replaces it with separate execution and delivery diagrams, keeping the short research overview intact. Recheck their semantics against the coordinator and their rendered readability. This amendment continues PR #13 and invalidates the previous source-bound acceptance; it does not change harness behavior or authorize another experiment.

Based on clean main 3f665df26a4017b27f8282f109fa46eccfd4fdf5, the README now opens with approximately 300 words covering the research question, executable request/review/development/learning loop and measured ex5-ex7 outcomes. The retained ex7 round-1,000 screenshot follows that overview. The remaining sections provide pinned setup, a harness flowchart, source-linked responsibilities and focused navigation. Removed the duplicated protocol tour, long command catalogue, classic-control walkthrough and founding-only module descriptions. No experiment or implementation file changed.

Verified claims against PRODUCT, ex5 report, ex6/ex7 reports and behavioral analyses, and the actual task coordinator modules. The experiment summary retains both starvation and absent mental satisfaction, separates implemented capability from actual use/benefit, and disclaims causal comparison. The existing quick-start anchor remains valid.

Earlier checks, superseded for acceptance by the diagram amendment:

- Node 24.22.2, pnpm 10.34.9; local macOS Chromium.
- Full unfiltered harness validation run d5d6984c-96b0-4fc0-9fe5-50a545741916 passed: 367 tests across 41 unit files, 28 browser tests, all type/lint/format/architecture/build/CLI/archive/analysis/documentation gates; 51 current screenshots generated for review.
- Inspected the actual retained demo image and a Chromium Markdown preview of the opening; the linked image loaded and the research/results hierarchy was readable. Local Markdown preview does not render Mermaid; its diagram source was checked against the coordinator.
- Started the documented pnpm dev entry, opened /?experiment=ex7 in Chromium and sought to 1,000 / 1,000 successfully. An initial probe preceded server readiness and was repeated after Vite announced the URL; no application fix or model call was involved.
- Documentation links and anchors passed. No new experiment or live inference was requested.

For revision 3, traced the run selector and checkpoint continuation in task-runtime.ts, route classification in harness.ts, and the analysis, review, delivery exceptions and completion conditions in task-flow.ts. Rendered both detailed Mermaid diagrams in Chromium and inspected their actual images, including branching labels, repair loops and conversation/pause colors. Preserved the short research opening and source-module table. Earlier GitHub rendering confirmed the real image and introductory layout; the revised diagrams still require current-head publication checks.

This diagram/plan edit requires fresh full validation and actual review before delivery. The coordinator receipt and exact-head PR self-review bind the final run, every screenshot, full-diff findings and remote integration; the preliminary run above is not final acceptance.

## Unexecuted checks and limitations

At this documentation freeze, final-source validation/review and remote delivery are still gated and are not claimed complete here. Their results are retained by the coordinator and PR. Reading time is a design target, not a measured user study. Experimental summaries describe individual exploratory runs, not controlled comparisons. No public hosted demo is assumed; the retained image and local replay are the demo entry.

## Follow-up suggestions

None required for this documentation task.

## Delivery

- Task: Research-first README and development harness
- Mode: merge
