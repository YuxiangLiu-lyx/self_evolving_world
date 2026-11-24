# Agent Instructions

Communicate with the user in Chinese and write all repository content in English. [AGENTS.md](AGENTS.md) is the canonical guide.

In short: branch from `origin/main`, plan features and experiments with numbered requirements, run `pnpm validate`, then publish with `pnpm pr -- body.md "Title" --merge` once CI passes. New experiments always get a fresh `exN` and a retained [behavioral analysis](experiment/README.md#behavioral-analysis).
