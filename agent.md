# Agent Instructions

- Use Chinese when communicating with the user.
- Use English for all repository content, including documentation, code comments, interface text, examples, tests, and validation records.

Follow the canonical [AGENTS.md](AGENTS.md) for the full workflow, compatibility requirements, and mandatory task completion checks.

Use the [task harness](docs/VALIDATION.md#task-harness-routing) to distinguish code and experiment changes. Offline experiments follow the [numbered experiment workflow](experiment/README.md) and retain their goals, measured results, replay and visualizations.

Every new experiment uses a fresh exN unless the user explicitly requests reuse. All code and experiment tasks automatically continue from validation and `task:review` to commit, PR, current remote checks and guarded merge via `pnpm task:publish`. `task:finish` requires verified integration into main. Explicit task-scoped no-PR or no-merge instructions use the recorded exceptions in the [delivery contract](docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task); failures leave the task incomplete.
