# Agent Instructions

- Use Chinese when communicating with the user.
- Use English for all repository content, including documentation, code comments, interface text, examples, tests, and validation records.

Follow the canonical [AGENTS.md](AGENTS.md) for the full workflow, compatibility requirements, and mandatory task completion checks.

Use the [task harness](docs/VALIDATION.md#task-harness-routing) to distinguish code and experiment changes. Offline experiments follow the [numbered experiment workflow](experiment/README.md) and retain their goals, measured results, replay and visualizations.

Every new experiment uses a fresh exN unless the user explicitly requests reuse. All code and experiment tasks automatically continue from validation/review to commit, PR publication and current remote-check verification via `pnpm task:publish`. Merging still requires explicit authorization.
