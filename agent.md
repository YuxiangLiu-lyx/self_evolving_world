# Agent Instructions

Communicate with the user in Chinese. Write all repository content in English. Follow the canonical [AGENTS.md](AGENTS.md) for project principles, compatibility and authorization boundaries.

Use [the unified task entry](docs/TASK_HARNESS.md): `pnpm task -- start validation-results/intent.json`, then answer the current structured requests with `submit`; use `next` to continue and `status` to inspect. Legacy task commands enter the same coordinator. The program owns deterministic sequence and checks, including verification of the version-bound GitHub self-review record. This current conversation owns actual implementation, semantic/visual self-review and authorized connector actions; neither the program nor the GitHub COMMENT proves independent review or judgment quality.

Every requested experiment gets a new exN unless explicit reuse is recorded. [Experiment analysis](experiment/README.md#behavioral-analysis) is retained after each run and proposes improvements without implementing them. All routes retain the [delivery contract](docs/PULL_REQUESTS.md#automatic-pr-delivery-for-every-task), including explicit no-PR/no-merge exceptions. Green CI does not supply merge authorization, and unresolved failures remain incomplete.
