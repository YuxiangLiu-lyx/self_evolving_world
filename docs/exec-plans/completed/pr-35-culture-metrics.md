# PR-35: Culture metrics analyzer and the ex7–ex13 baseline

## Requirement summary

Stage 0b of the culture work needs a deterministic, read-only "culture metrics" analyzer (E0) that measures retained continuous-family archives before any culture run exists, and a baseline report over ex7–ex13. It reads retained files only, never calls a model and never changes an archive. Optional model labeling is out of scope; only an extension point is left. The tool must later gate a culture run (six agents with naming, marking, telling and inviting interfaces) on "every agent has at least one symbolic action". The change is tooling, tests and documentation only, so validation should select code checks without archive reconstruction or browser runs.

## Requirements

- R1: `scripts/culture-metrics.ts` reads one continuous-family archive (`continuous-v1`) from retained files only: hash-checked replay segments, `initial.json`, `execution.json` and the first retained ordinary call of each actor, rebuilt into its request as the authored prompt. It writes nothing under `experiment/` and returns JSON with a stable key order plus a Markdown section.
- R2: Shared vocabulary: conservative candidate terms (multi-word capitalized phrases, hyphenated or quoted coinages, names given through naming actions) excluding stop words, numbers, actor names, ordinary English compounds and environment vocabulary derived per archive from its prompt, catalogue, world objects and world event text. Report candidate and shared terms, cross-agent uses, transmitted terms and the top terms with first users, first round, later users and exposed later users.
- R3: Repeated collective activities: the same interface used successfully by at least two agents within one round and the vision radius forms an episode; an interface with at least two separate episodes is a repeated activity. Report episodes per interface, marked survival or not.
- R4: Norms: normative statements (`should`, `must`, `ought to`, `never`, `always` and negations) in messages and public text, with phrase echoes and action echoes by other agents; questions, counterfactual and descriptive uses are excluded. Private normative notes are counted for context only.
- R5: Beliefs: causal and supernatural explanations in messages, public text and notes, with citations by other agents; failure feedback, reasons for one's own choices, negations and questions are excluded.
- R6: Relationship structure: message, response (reply within 10 rounds) and give/exchange graphs with edge weights and reciprocity.
- R7: Auxiliary metrics: survival share of actor-rounds (documented interface rule), non-transactional communication share (documented keyword rule), and symbolic actions per agent for `name`, `mark`, `tell` and `invite` with an every-agent gate flag.
- R8: Optional model labeling is not implemented; a documented `CultureLabeler` contract and a `modelLabels: null` field are the only extension point.
- R9: CLI `pnpm metrics:culture -- experiment/exN [rounds]`, next to `metrics:long`, with `--markdown file` and `--json file` options and several archives per call.
- R10: Validation classifies `scripts/culture-metrics` as read-only tooling, and a `package.json` change limited to `scripts` entries that run such tooling no longer expands to every archive; scope tests and the VALIDATION table cover both.
- R11: Unit tests with small synthetic fixtures for every metric rule, including false-positive guards, and a test that pins ex13 headline values.
- R12: `docs/presentation/culture-baseline.md` reports definitions, per-archive values of every metric for ex7–ex13, short notes and the limitations of rule-based text detection, with values reported as measured.
- R13: PRODUCT F-138, a DEVELOPMENT command row and this plan's README entry.

## Scope and exclusions

In scope: new `scripts/culture-metrics.ts` and its test, `package.json` (one script entry), `scripts/validation-plan.ts` and its test, `docs/VALIDATION.md`, `docs/DEVELOPMENT.md`, `docs/PRODUCT.md`, `docs/exec-plans/README.md`, this plan and the new baseline report.

Out of scope: any file under `experiment/`, any model-calling or random run, model labeling, culture scenarios and the `name`, `mark`, `tell` and `invite` interfaces themselves (stage 1), runtime and viewer code, and `docs/presentation/fix-log.md`.

## Acceptance criteria

- `pnpm format:check`, `pnpm typecheck`, `pnpm lint` and the culture-metrics and validation-plan tests pass.
- `pnpm validate` selects code checks only (no archive reconstruction, no browser run) and passes.
- Every value in the baseline report matches `pnpm metrics:culture` output for ex7–ex13; ex13 values are pinned by the test.
- CI `quality` and `pr-policy` pass and the PR is merged.

## Results

- R1–R9: the analyzer reads the listed retained files only and runs all seven archives in about 1.2 seconds locally. Two sources of non-actor text found while building it are excluded and documented:
  - the controller's fallback intention after a failed decision (ex7–ex10);
  - world event text such as navigation reason codes (`goal-overlap`).
- R10: `package.json` was the only file that still expanded scope; the planner now compares it with the base and treats a change confined to tooling-script entries as tooling.
- R11: 17 culture-metrics tests (16 synthetic, 1 on ex13) and 11 validation-plan tests pass.
- R12: baseline over ex7–ex13 (details in the [report](../../presentation/culture-baseline.md)):
  - Shared terms: 0–10 per archive, and one transmitted term (`stone-source`, ex12).
  - Norm statements: 0 in every archive; private normative notes: 0–23.
  - Belief statements: 0 in every archive.
  - Repeated non-survival activities: 0–6.
  - Messages: 0–57; reciprocity 66.7–100% where messages exist.
  - Gives/exchanges: 0–1 per archive.
  - Survival share: 23.2–76.1%.
  - Non-transactional share: 0% wherever messages exist.
  - Symbolic actions: 0, because the interfaces do not exist yet.
- R13: PRODUCT F-138, the DEVELOPMENT command row and the README entry are added.

Local `pnpm validate` (macOS, Node 24.22.2, pnpm 10.34.9) selected code checks only: no archive reconstruction and no browser scene. Archive preservation, typecheck, lint, format, architecture, the full unit suite (142 files, 809 tests), analysis, build and documentation checks passed. CI results are reported by the PR checks.
