# PR-03: English Repository Content

## Objective and scope

Use Chinese in conversations with the user and English throughout the repository. Record this requirement in AGENTS.md and the requested agent.md entry point.

Translate documentation, historical records, UI and accessibility text, messages, demo data, and tests. Preserve world semantics, replay compatibility, Unicode support, and prior validation facts. Adjust layout only if English text causes a visible regression.

## Acceptance

- [x] All project-owned content is in English and the language policy is discoverable.
- [x] UI copy and accessibility labels agree with browser tests; the HTML language is English.
- [x] Legacy input and Unicode regression coverage are preserved without non-English prose.
- [x] Full validation, five screenshot reviews, and the task completion gate pass.
- [x] Record actual results and archive the plan. Final source validation is required after this documentation update.

## Results

Implemented the language policy in AGENTS.md and the requested agent.md entry point, which is now a required document. Translated project documentation, historical plans and ADRs, the PR template, UI and accessibility text, error messages, examples, and tests into English. Historical validation facts remain unchanged. The interface declares `lang="en"` and uses matching English browser selectors.

World rules and replay behavior remain unchanged. Unicode escapes preserve existing non-English skill aliases and Unicode heading coverage without adding non-English repository prose. A source scan found no literal Han characters in project-owned source, configuration, or documentation.

Executed locally on macOS arm64 using Node 24.22.2, pnpm 10.34.9, and Playwright 1.65.0 with Chromium:

- `pnpm validate -- "PR-03 English repository content"`: type checking, lint, formatting, architecture checks, build, compiled CLI verification, and documentation validation passed. All 77 unit tests and 7 browser tests passed; 22 Markdown files were validated.
- `pnpm demo`: produced four frames with English Explorer and Wood labels, ending with a `skill-unavailable` result.
- Inspected all five actual screenshots: desktop, mobile, agent vision, action results, and history. The first visual review found a wrapped desktop `W A S D` hint after translation. Prevented hint shrinking and wrapping, reran full validation, and confirmed the fix in fresh screenshots. The mobile layout remained readable at 390 px.
- Reviewed movement, collision and boundary rejection, unique pickup, automatic observations, unavailable attempts, import/export, and immutable replay. Automated assertions and visible state agreed; browser health checks passed.
- Recorded English visual and behavior reviews and ran `pnpm task:finish -- "PR-03 English repository content"` successfully. The gate confirmed matching source and screenshot fingerprints.

This archive update requires another complete validation and screenshot review before task completion. The final current-state report and review are generated under `validation-results/`; they are not committed documentation.

## Limitations and follow-up

Validation covers local Chromium on macOS, including desktop and mobile viewport layouts. Remote CI and other browser engines were not run. No new dependencies or autonomous agent capabilities were introduced. Future repository edits must retain English content, Chinese user communication, Unicode input support, and the same completion workflow.
