# PR-43: Experiment A (winter arrives) and model-assisted culture labels

## Requirement summary

This PR delivers experiment A of the user's culture program (A–D) and the annotation tool all program experiments use.

**Experiment A.** The culture scenario's survival pressure starts at round 300: `pressureStart` 300 and `difficultyStart` 440 in a cycle of 800, confirmed in the archived configuration. At round 400 the intensity is 0.71: cold +1.07, rain +0.57 and plant growth at 71%. ex16 continues from round 250 to round 400 on its own branch. That branch starts at the round-250 checkpoint commit `4c108a4` (continuation-branch rule), with checkpoint backups at rounds 300 and 350. The hard cap is 3,500,000 tokens spent in A; ex16's ledger was 2,903,618 at round 250. The report compares rounds before and after 300:

- food stocks and hoarding;
- giving and sharing;
- whether the norms of moderate taking, leaving some for others and open access are raised or broken;
- health and survival;
- mentions or remembrance of anyone who falls;
- the camp and the works;
- how often people communicate.

- Experiment reuse: ex16 — the user explicitly asked to extend ex16 from round 250 to 400 (experiment A). `extend` preserves the earlier windows under `windows/`.

**Annotation tool.**

The rule-based culture analyzer is unreliable in long runs. The user requested a labeling pass with the existing GPT channel: every utterance, name, invitation, work and private view of an archive gets fixed categories in a fixed JSON schema. A human then verifies every positive label and a random sample of 20 negatives against the archive text. The tool was built and tested offline with a fake transport. The real labeling runs call the model, as the user requested for the program, and are counted in a separate annotation ledger capped at 1,000,000 tokens.

## Requirements

- A1: Extend ex16 with `pnpm experiment:continuous -- extend ex16 300`, then `350` and `400`, on branch `experiment/ex16-winter` from `4c108a4`. Commit and push a checkpoint backup at each target. The only change brought onto the branch beyond ex16's runtime is PR #35's repair script, which is already in `4c108a4`'s ancestry. No budget or genesis changes.
- A2: Follow the standing handoff, recovery and stopping rules. The new extended list of excluded words applies to every newly developed interface. Briefs go in `validation-results/handoffs/`.
- A3: Measure the before/after comparison listed above per 25-round block from the retained archive.
- A4: Label ex16 ticks 1–400 with the tool below:
  - verify every positive against the archive;
  - re-check 20 seeded negatives;
  - report the agreement rate;
  - publish the timeline of events, with each item's tick, call, text and who adopted whom.

  Annotation tokens are counted in their own ledger, separate from the experiment's.

- A5: Before the merge, replay ex7–ex18 and the full ex16 on the merged code with byte-identical requests and paused inputs, and pass `pnpm validate`.
- A6: Deliver the English report, up to 5 moments in `docs/presentation/highlights.md` and fix-log entries.

- R1: Build blind items (speech, name, invitation, work, view) from an archive with the culture-metrics reader, the retained events and memory. Each item has an opaque id, the tick, the person, the kind, the hearers of speech and the text. The model input contains no scenario tag, scope, experiment number, file path or call id. A separate local mapping gives each item's tick, actor, call and event. `--from` and `--through` select a round range; earlier items are read-only context.
- R2: Use the categories `naming`, `name-adoption`, `narrative`, `narrative-continuation`, `norm`, `norm-repetition`, `invitation`, `valued-object`, `private-view` and `absent-person`; an item can have several or none.
- R3: Label chronologically in batches, each with a few preceding items as read-only context and a compact registry of names, narratives and norms. Adoption, continuation and repetition links need a different author.
- R4: Use strict Responses structured output. Validate every response against the schema and the batch ids, and reject anything else.
- R5: Send requests to the endpoint, headers and streaming of `continuousProvider`, with `renewableAccessToken()`, `selectModel(token, 'gpt-6.1-sol')` and `readDecisionStream`. Redact the token as `continuousProvider` does. The transport is injectable. The transport files are not modified.
- R6: Record each call's usage in a cumulative annotation ledger, count a call without usage at a conservative reservation, refuse a batch whose reservation would exceed the command-line cap, never resend a completed batch and retain every redacted request and response.
- R7: Write `items.json`, `labels.json`, `positives.json`, `negatives-sample.json` (seeded), `timeline.md` and `verification.json`, and compute agreement rates with `report`. The output location must pass the repository validators.
- R8: Add `pnpm labels:culture -- prepare|label|report|timeline` and document it in CULTURE_SCENARIO and the DEVELOPMENT command table.
- R9: Test offline with a fake transport: ex16 items through round 80 with blindness, schema rejection, self-adoption rejection, the ledger, the cap and resume, the timeline and agreement rates.
- R10: `pnpm typecheck`, ESLint, Prettier and the new tests pass. `packages/world-core`, archives and simulation behavior are unchanged.

## Scope and exclusions

In scope: `scripts/culture-labels.ts` and its test, one `package.json` script, the tooling class in `scripts/validation-plan.ts` and `docs/VALIDATION.md`, CULTURE_SCENARIO, DEVELOPMENT and PRODUCT.

Out of scope: the transport and login files, `scripts/culture-metrics.ts`, world rules, archives and the human verification.

## Acceptance criteria

- The tests in `scripts/culture-labels.test.ts` pass, and `pnpm typecheck`, ESLint and Prettier pass on the changed files.
- `pnpm validate` and CI `quality` and `pr-policy` pass.
- No earlier archive changes. ex16 changes only by the authorized extension.

## Results

- R1–R10 are implemented. Output location: `docs/presentation/labels/<archive>-<from>-<through>/`, with the ledger at `docs/presentation/labels/ledger.json`. `experiment/` accepts only numbered archives and paired companion analyses, and presentation files are checked only for format and links. Outputs are written Prettier-formatted, and a generated timeline passes markdownlint.
- Offline estimate (o200k_base, 20 items per batch, reasoning tokens excluded): about 2,300 input tokens and 900–1,500 output tokens per batch, or about 14,000 input and 5,700–8,900 output tokens per 100 items. The reservation per batch is about 23,000 tokens. The full ex16 (67 items), ex17 (56) and ex18 (48) archives need 4, 3 and 3 batches.
- Not yet run: `pnpm validate`, CI and any labeling call. No archive is labeled and no label is verified.
