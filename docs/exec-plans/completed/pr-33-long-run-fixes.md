# PR-33: Opt-in long-run fixes and the long-fixes scenario

## Requirement summary

Ex13 spent about 6,600 tokens per agent per round in its first 80 rounds, re-decided every 2–3 rounds and exhausted its development budget on narrow, person- or item-bound interfaces. The user supplied a patch with three opt-in fixes and a fix log, and asked for them to be integrated without changing any retained run, with a scenario entry for the fix-verification run (E1). Development handoffs are now completed by Claude instead of Codex, so new records must say so.

Decisions confirmed by the user: the fixes stay opt-in and default off; ex13's entry, configuration and archives stay unchanged; a separate `new long-fixes` entry uses the ex13 rules and seed with `exactRecordWidth` 4000 and both guidance addenda; a declaration gets an optional developer field written only in new records; tokens per agent per round mean the input plus output tokens of all ordinary and World Agent calls divided by agents × rounds; this PR merges automatically. Experiment numbering is planned as E1 = ex14, E2/E3 = ex15 and E4 = ex16; this PR starts no run.

## Requirements

- R1: Apply the supplied patch: `longDevelopment.exactRecordWidth` (whole exact-id reads up to the width, repeated whole reads shown once per round) and `longDevelopment.guidance` (`plan-horizon` for ordinary actors, `general-capabilities` for the World Agent), all absent by default.
- R2: Prove compatibility: rebuilding every retained ex13 call request with `continuousRequest` and every paused ex13 actor's `longOrdinaryInput` gives identical hashes before and after the change (524 requests, 9 pauses × 3 actors), and the same holds for ex7–ex12 requests.
- R3: Add `pnpm experiment:continuous -- new long-fixes`: the ex13 genesis plus the three fixes, 8 development handoffs, a 1,600,000-token ceiling and a first window ending at round 40, tagged `scenario: 'fixes'` so checkpoints verify against this genesis. The ex13 entry and genesis stay byte-identical.
- R4: Record the developer honestly: a `DevelopmentReviewer` union of `current-codex-conversation` and `current-claude-conversation` for grid-era records, and an optional `developer` on continuous declarations and accepted handoffs, required in named scenarios and absent from every retained archive.
- R5: Recompute the fix-log numbers from archives with one deterministic script under explicit definitions (ex13 rounds 0–79 and all rounds), correct the patch comments and documents to match, and place the log at `docs/presentation/fix-log.md` with the E1–E4 to ex14–ex16 mapping.
- R6: Add a `CLAUDE.md` that only imports `AGENTS.md`, and document the options, scenario, commands and developer field.

## Scope and exclusions

In scope: `apps/simulator/src/long-*`, `continuous-run-types.ts`, the grid-era run files' reviewer type, `scripts/continuous-{cli,files,source,store,analysis}.ts`, the three grid analyses' provenance checks, new `scripts/long-metrics.ts` and `scripts/long-compatibility.ts`, tests and documentation.

Out of scope: any file under `experiment/`, ex13's scenario and configuration, the model transport, starting any model-calling run, the culture metrics analyzer (stage 0b) and culture scenarios (stage 1).

## Acceptance criteria

- `pnpm compat:long` reports identical digests for ex7–ex13 before and after the change.
- The ex13 baseline genesis test equals `experiment/ex13/initial.json` and `configuration.json`.
- Format, typecheck, lint and the long-exact-read, long-guidance, long-pagination, long-development, long-scenario, long-metrics, continuous-store and developer tests pass; `pnpm validate` passes.
- CI `quality` and `pr-policy` pass and the PR is merged.

## Results

- R1: the supplied patch applied cleanly. The only code change to it is a template-literal lint fix; its comment figures were corrected under R5. The options are off by default.
- R2: `pnpm compat:long` digests written on `origin/main` before the patch and compared after all changes are identical. This covers all 524 ex13 requests, the 27 paused ex13 ordinary inputs, and all 1,604 ex7–ex12 requests.
- R3: `new long-fixes` changes only the tagged fixes and limits. A test reverts exactly those fields and recovers the baseline genesis. Another test shows that the baseline genesis and configuration equal `experiment/ex13/initial.json` and `configuration.json`. The store accepts an unchanged long-fixes checkpoint and rejects altered or untagged ones.
- R4: grid-era acceptors default to Codex and accept Claude. The analysis provenance checks accept either value. Continuous declarations record an optional `developer`, required in named scenarios; the retained ex13 declaration without one stays valid.
- R5: `scripts/long-metrics.ts` and its test pin the ex13 figures.
  - Tokens per agent per round: 6,632 (rounds 0–79) and 5,254 (all rounds).
  - Follow-up share: 51.7% and 50.6%.
  - Median decision gap: 2 and 3 rounds.
  - World Agent reviews: 1 reuse of 29.
  - Bound interfaces: 19 of 28.
  - Cross-run claims were re-measured read-only and corrected: catalogue share, ex10 request mix, ex10 per-call size and ex13 per-call growth.
  - The log is at `docs/presentation/fix-log.md`.
- R6: `CLAUDE.md` imports `AGENTS.md`. The options, scenario, commands, metric definitions and developer field are documented in [Long Development](../../LONG_DEVELOPMENT.md#opt-in-run-fixes-and-the-long-fixes-scenario), DEVELOPMENT, VALIDATION and PRODUCT F-137. The read-only metric scripts are classified as tooling, so later edits to them run code checks only.

Local `pnpm validate` (macOS, Node 24.22.2) selected the full scope because runtime and shared files changed, and every check passed:

- archive preservation;
- typecheck, lint, format and architecture;
- the full unit suite;
- reconstruction of all 13 archives;
- analysis and build;
- 84 browser tests;
- documentation checks.

No model-calling run was started, so the fixes' effect on tokens, plan length and reuse remains unmeasured until E1.
