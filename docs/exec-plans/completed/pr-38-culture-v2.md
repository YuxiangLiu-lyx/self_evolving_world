# PR-38: Culture v2 scenario

## Requirement summary

The user reviewed the E2 pilot (ex15) and chose a new run version: ex15 stays the pilot record, and a new 250-round culture run starts after this PR. ex15 stopped at round 70 because one input outgrew the frozen 14,000-token guard, and the fix lives in a protected file. The new scenario tags carry the context fix, a new ordinary prompt, new handoff-counting rules and the analyzer additions. Every change is gated on the new tags, and ex7–ex15 must replay and rebuild byte-identically.

## Requirements

- R1: Add the scenario tags `long-culture-v2` and `long-culture-v2-incentives`. Each is the matching culture genesis plus the v2 fields. Every v2 behavior is gated on those fields. ex7–ex15 requests, the paused ordinary inputs and the ex15 genesis stay identical.
- R2: Context compaction for v2 ordinary inputs. Apply the lossless compaction proposed after ex15: paging text once, settled work records, items already in retrieval, and joined contiguous fragments. Also encode terrain losslessly as rows. Nothing is hidden: every moved item stays in the same input or is retrievable by an exact query.
- R3: Mastered interfaces carry their full contract only when they are needed now or were used within a recent window chosen from ex15 data. Every other interface gets a summary and stays readable in full by exact id. The window and its rationale are documented.
- R4: v2 limits: `inputEstimateLimit` 24,000 and `exactRecordWidth` 6,000. `computation.inputBytes` rises to 200,000 so that the token guard, not the byte guard, is the binding one; the rationale is documented.
- R5: An offline projection rebuilds the ex15 inputs with the v2 builder, extrapolates the growth rate of rounds 0–70 to round 250 and confirms that the guard is not reached. The PR reports the result.
- R6: The v2 ordinary prompt keeps health and safety as the only required goal and leaves everything else open. It states each person's leaning in the second person ("You tend to value _leaning_."). It adds no guidance about `name`, `mark` or `invite` and contains no excluded word. The report states that the new run changes two factors relative to ex15: context and prompt.
- R7: Handoffs in v2 run as follows:
  - A pause caused by rejected ordinary output resumes without a handoff.
  - An accepted handoff that installs nothing and changes no runtime source is not counted.
  - The run stops for review after three consecutive rejected ordinary outputs.
  - Every developed interface, as ordinary agents see it, must serialize to at most 3,500 code units.
- R8: The analyzer detects sharing and restraint expressions about common resources, and their reuse by other people. The ex15 candidates (Kai at rounds 1 and 5, Wren at round 9, Lin and Sol at round 14) serve as test cases. It also checks whether `rest` acts as a default idle behavior. If it does, the analyzer reports a survival share without `rest` next to the existing one.
- R9: Update `docs/CULTURE_SCENARIO.md`, `docs/LONG_DEVELOPMENT.md`, PRODUCT (F-140), a new ADR, and the command tables.

## Scope and exclusions

In scope: the scenario tags, the ordinary input builder and prompt for v2, the repair and handoff-counting rules for v2, the development validator limit, the analyzer, the projection script, tests and docs.

Out of scope:

- any change to existing archives or to ex7–ex15 behavior;
- the model transport;
- the World Agent prompt;
- the frozen culture budgets: 40 handoffs, 300 World Agent calls, 1,800 ordinary calls, a 10,000,000-token ledger and a 3,200,000-token ceiling through round 80;
- the run itself, which is a separate PR.

## Acceptance criteria

- `pnpm validate` passes.
- The `compat:long` digests for ex7–ex15 are identical to those written on `origin/main`.
- The tests cover R1–R8.
- The projection is reported in the PR.
- CI `quality` and `pr-policy` pass.

## Results

- **R1:** both tags exist, and each genesis equals its culture genesis apart from the v2 fields (`apps/simulator/test/long-culture-v2.test.ts`). The `compat:long` digests written on `origin/main` (871046b) are identical: every ex7–ex15 request (110, 406, 411, 224, 17, 436, 524, 103 and 159) and every paused ordinary input (27 for ex13, 3 for ex14, 18 for ex15).
- **R2–R3:** `long-compaction.ts` and `long-context.ts` (`long-culture-v2-context.test.ts`, 13 tests). The window is 25 rounds. In ex15, 208 of 301 plan steps used an interface the person had used before; the last use was within 20 rounds for 88.0%, within 25 for 93.8% and within 40 for 98.6%. Summaries name their arguments. An interface mastered this round counts as needed now, so 1 of 24 developed-interface steps lacks details.
- **R4:** the limits are frozen in `LONG_CULTURE_V2`. `inputBytes` is 200,000 because ex15 inputs held up to 3.31 code units per estimated token.
- **R5:** `scripts/long-context-projection.ts` reproduces all 147 recorded ex15 estimates with the archive configuration. Projected to round 250:
  - the per-round maximum reaches 19,100;
  - the conservative case (packet-only maximum plus 1.5 × the largest retrieval) reaches 20,872;
  - the highest single-person trend, Moss's, reaches 23,650;
  - all three are below 24,000, but Moss's margin is small.
- **R6:** the open-goal prompt and the leaning sentence. A test asserts that every other sentence is the ex15 voice prompt, apart from the summary sentence, and that no excluded word appears.
- **R7:** uncounted rejection recovery with a stop after three consecutive rejected outputs, uncounted empty handoffs (`countedDevelopments`) and a limit of 3,500 code units per developed interface (`rejection-recovery`, `empty-handoff` and `ability-text-limit` tests). A later pause in the same round is retained as `round-N-2`, in v2 only.
- **R8:** the analyzer additions on ex15:
  - 31 sharing expressions and 23 reuses; 9 reuses came after the speaker had received the idea;
  - the five ex15 candidates are tested, and Lin has no text at round 14;
  - rest is a default by start energy (56.5% of rests began at 75% or more of the cap), but not by the step-condition criterion (20.9%);
  - the survival share is 39.5%, or 12.1% without rest.
- **R9:** CULTURE_SCENARIO (Culture v2, Culture metrics), LONG_DEVELOPMENT, ARCHITECTURE, PRODUCT F-140, ADR-0029 and the command tables.

**Validation:** `pnpm validate` on macOS with Node 24.22.2. VALIDATE_SUMMARY

**Not verified:** no model-calling run uses v2 yet. The projection replays ex15's queries, so it cannot count the extra exact reads that summarized interfaces may cause.
