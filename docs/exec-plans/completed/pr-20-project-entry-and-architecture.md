# PR-20: Clear Project Entry and Versioned Architecture

## Requirement summary

Clarify that the README replay URL runs on the reader's computer after setup, populate the public repository's discovery metadata, and distinguish historical foundation contracts from the current continuous world and development harness. Correct stale future-work wording without changing the implementation.

## Requirements

- R1: Label the README loopback link as Local replay (after setup), explain its local prerequisite and retain the publicly viewable real screenshot without claiming a hosted demo.
- R2: Set and verify the requested repository description and five topics; use the existing public README as the Homepage and identify it as project documentation rather than a hosted replay.
- R3: Clearly distinguish Legacy Foundation, Current Continuous World and Development Harness in ARCHITECTURE, preserving historical contracts and correcting obsolete unimplemented claims against PRODUCT and existing code.
- R4: Keep the change focused, preserve navigation and archives, and complete current full validation, actual review, PR and guarded merge through the existing task harness.

## Scope and exclusions

README, ARCHITECTURE, this plan/index and the repository's Description, Topics and Homepage fields. No application or harness changes, new architecture decision, experiment, model inference, dependency, deployment or video production. The user offered local labeling as an acceptable alternative to hosting or video. PRODUCT remains the status authority; no feature status changes are intended. Preserve all other repository settings.

## Acceptance criteria

- The link text explicitly says Local replay (after setup); surrounding text makes clear that pnpm dev must run on the reader's computer. A public retained screenshot is available before installation.
- Read GitHub metadata before mutation, write only the requested fields, then read back the exact description, topics and public documentation Homepage. Never imply that the Homepage is a running demo.
- Architecture opens with version-aware navigation; its fixed-grid diagram and limits are explicitly historical. Current continuous behavior, bounded World Agent review, skill extensions and persistent tasks/memory are not classified as wholly unimplemented. General governance, general rollback, shared storage and unattended production remain distinct future scope.
- Links, actual rendered documentation, all current browser evidence and the complete changed-file diff are reviewed. Full unfiltered tests and current remote delivery checks pass without altering gates.

## Steps

1. Inspect clean main, documentation authorities, protocol modules and remote repository metadata.
2. Start the unified task, make the focused documentation edits and update/verify repository metadata.
3. Check rendered content and navigation, freeze the plan, run complete validation and inspect every current artifact.
4. Deliver a reviewed PR, exact-head self-review and guarded merge; independently verify integration.

## Results and validation

Baseline: main fd0828176d6481c425498de612c9decbe1146535, with a clean worktree. GitHub metadata initially has null description/homepage, no topics and has_pages false. PRODUCT records experimental World Agent/skill extensions and the continuous world as implemented; the old ARCHITECTURE future-modules paragraph incorrectly says these are unimplemented. This task corrects documentation, not feature status.

The README now labels its loopback URL Local replay (after setup), states that pnpm dev must run on the reader's computer, and distinguishes the public saved screenshot from local interactive replay. ARCHITECTURE now opens with version-aware navigation and the existing continuous-world explanation, labels the original diagram/table as Legacy Foundation, identifies Development Harness, and replaces the obsolete future-work claim with the actual F-102 through F-106 boundaries. Original protocol contracts and the harness diagram in README remain unchanged.

Updated only the repository metadata fields below using the existing credential-backed GitHub API helper, then fetched the repository again and verified exact values:

- Description: Research prototype for autonomous LLM agents, skill discovery, evolving environments, and auditable AI-assisted development.
- Topics: harness-engineering, llm-agents, multi-agent-systems, skill-discovery, typescript.
- Homepage: [public project documentation](https://github.com/YuxiangLiu-lyx/self_evolving_world#readme).
- GitHub Pages remains disabled. No application was deployed and no other repository setting was changed. Before/after readbacks are retained in ignored task evidence.

Preliminary checks completed before the final documentation freeze: docs:check passed all local links, heading anchors and Markdown lint; Chromium previews of the changed README passage, architecture opening and future scope were personally inspected; the real retained image loaded; the local ex7 URL loaded verified saved state for 1,000 observed rounds without authentication or inference. The unchanged foundation Mermaid is source-reviewed, not rendered by that prose preview. Baseline main CI was independently observed successful.

PRODUCT, overview and ADRs remain unchanged because feature status, behavior, module dependencies and architecture decisions are unchanged. The plan is archived at documentation freeze; final current-source acceptance is recorded by the coordinator and PR receipts, not inferred from preliminary checks.

## Unexecuted checks and limitations

Fresh full validation, current screenshot/full-diff review and remote delivery remain gated at this documentation freeze. The Homepage is the existing public project README, not a new hosted application. Public hosting and a demonstration video remain outside this focused correction.

## Follow-up suggestions

Consider a separately scoped read-only hosted replay if an installation-free interactive demonstration is needed.

## Delivery

- Task: Clear project entry and versioned architecture
- Mode: merge
