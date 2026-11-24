# PR-36: Opt-in culture scenario

## Requirement summary

Stage 1 of the culture work adds an opt-in "culture" long-development condition for the planned E2/E3 runs. It keeps the ex13 rules and seed and the long-fixes options, and changes the conditions of shared life: a prompt that leaves views and stories to the agents, private memory, differentiated dispositions, simple symbolic means, survival slack, six nearby people and, in a separate variant, bounded incentives. The principle is to give possibilities, not goals: no instruction says what to produce, and a fixed vocabulary never reaches ordinary agents. Every part is a separately switchable configuration field, absent from ex13 and earlier and from long-fixes, whose genesis, configuration, requests and inputs stay byte-identical. The budget mechanics of E2/E3 are frozen at creation. The user authorized opening the PR but not merging it; no model-calling or random run is started.

## Requirements

- R1: `pnpm experiment:continuous -- new long-culture` (`scenario: 'culture'`) and `new long-culture-incentives` (`scenario: 'culture-incentives'`, identical plus incentives) start from the ex13 rules and seed with `exactRecordWidth` 4000 and both guidance addenda; each part is a field of `longDevelopment.culture` (`voice`, `differentiation`, `symbols`, `slack`, `density`, `incentives`).
- R2 (A): A culture-only ordinary prompt variant keeps "physical facts need evidence", frees names, stories, views, values, explanations and impressions of others, and removes the suppressing wording; private `cares` (≤ 300) and `views` (≤ 8 people × 200) are written through the plan and shown only in the owner's packet. The legacy prompt is byte-identical.
- R3 (B): Spread `long:tendencies`, rename the visible `socialNeed` key to `closeness` in this scope, give each person a different one-word leaning with no attached content, and differentiate starting food knowledge and authored mastery while keeping survival feasible.
- R4 (C): Authored `name`, `mark`, `tell` and `invite` with no physical effect beyond action time: observable events, reusable visual metadata, persistence (names, marks, invitations with expiry), nearby observation, exact retrieval through `observed`, bounded text, no hidden disclosure, replay reconstruction and a minimal viewer glyph; follow the merged `pnpm metrics:culture` conventions.
- R5 (D): Slack that reduces survival pressure (later pressure, higher growth floor, renewable food near the starts), with values documented and the offline preflight numbers reported.
- R6 (E): Six people with nearby collision-free starts; the two-person object is optional.
- R7 (F): Separately switched, bounded, decaying, deduplicated satisfaction for being answered or remembered, two-way contact and noticed own work, from real events only, never rewarding a specific behavior, queries, requests, naming, marking or telling as such, through the existing wellbeing machinery.
- R8: Frozen budget mechanics: six people, 15 development handoffs (raised to 40 by R11), a first window to round 80, checkpoints 80, 150 and 250, a 10,000,000-token ledger and `tokenCeilings: [{ through: 80, tokens: 3_200_000 }]` enforced like the ledger; `extend exN 250` continues without a configuration change; the store accepts unchanged and rejects altered or untagged checkpoints.
- R9: Tests for each part, the excluded vocabulary over instructions and full inputs at round 0 and after symbolic actions, and ex7–ex13 compatibility digests compared after every protocol or prompt change.
- R10: Documentation: `docs/CULTURE_SCENARIO.md`, ADR-0028, PRODUCT F-139, the DEVELOPMENT command row, ARCHITECTURE, this plan and its README entry.

Follow-up requirements before E2 (requested after review; ex15 does not exist yet, so the frozen budgets can still change):

- R11: Culture-scope budgets: 300 World Agent calls and a cumulative cap of 40 development handoffs; 1,800 ordinary calls, the 10,000,000-token ledger and the 3,200,000-token ceiling before round 80 are unchanged. Check the numbers against the measured E1 (ex14) rates and record the derivation in the PR.
- R12: Opt-in `longDevelopment.transportRecovery: 'uncounted'` in the culture scope: `repair` resumes a provider transport failure (no response, recorded transport evidence, or a proved abandoned invocation) without a development handoff; every other pause stays counted and earlier runs are unchanged.
- R13: ex10's food water-content model becomes a general world representation, not bound to ex10 apparatus, switched on by a culture field and used by no interface at genesis; ex10 behavior is byte-identical.
- R14: `pnpm metrics:culture` reads private `cares` and `views` and reports them separately from public behavior, with a private-view convergence metric (how similar different people's views of the same person become over time); transmission metrics keep using public behavior only.
- R15: Documentation states that pressure starts at round 300, so a run to round 250 lies wholly in the mild period, and lists unobstructed hearing and names and marks that do not follow items as limits.
- R16: The observatory header link reads "Ashen-style replay (preview)"; the fix log states E1's 64-round comparison window and separates the effects of fix 2 and fix 3.
- R17: If the CI Ashen recording test times out again after a rerun, compare its CI duration on main and on this branch and, with that evidence, raise its timeout to 180 seconds.

## Scope and exclusions

In scope: world-core `expression*.ts` and guarded changes to the registry, plan parser, wellbeing matching, experience weighting and types; simulator `long-culture.ts`, `long-scenario.ts`, `long-context.ts`, `long-request.ts`, `long-tokens.ts` and the runner; the store, CLI, preflight, source validator and validation family prefix; the viewer sign visual, replay memory and actor colors; tests and documentation.

Out of scope: any file under `experiment/`, starting any model-calling or random run (E2 follows the merge in its own PR), the World Agent prompt, the object that needs two people to move (skipped: it needs a new joint-action mechanism in the kernel), a Playwright scene for signs (no culture archive exists yet), and merging the PR.

## Acceptance criteria

- `pnpm compat:long` reports identical digests for ex7–ex13 before and after the change; the ex13 and long-fixes genesis tests pass unchanged.
- Format, typecheck, lint, architecture and the culture, long, store and validation tests pass; `pnpm validate` passes.
- The PR is opened without merging and CI starts.

## Results

- R1: `initialLongWorld(scope, 'long-culture' | 'long-culture-incentives')` applies `applyCulture(world, options)`; the two variants differ only in `incentives`, the three rules and their event names. The CLI lists both scenarios.
- R2: `VOICE_REPLACEMENTS` replaces four legacy phrases; a test checks every source phrase still exists in the legacy prompt. Private memory is parsed with ordinary errors, applied when a plan starts, recorded in round memory and replayed by the store and viewer.
- R3: Tendencies span 0.2–0.8 per key; leanings freedom, belonging, beauty, fairness, mastery and calm; knowledge berry, root or both; Moss, Kai and Wren start without `probe`, `exchange` and `consult` respectively, shown as `mastered: false`.
- R4: `foundation-expression@1` creates `name`, `mark` and `invitation` sign objects; hearing uses the vision radius; attendance records who came from away; signs live in `observation.signs` and are retrievable by exact id. A test feeds a stepped round to `utterances` from `scripts/culture-metrics.ts`.
- R5: `pressureStart` 300, `difficultyStart` 440, `growthFloor` 0.6 and 24 renewable commons sources (berry capacity 20 interval 5, root capacity 20 interval 8). The 1,600-round [preflight](../evidence/pr-36-culture-scenario/preflight.json) lost no life, with a 76.1% optional share and a 23.9% survival action share (ex13: 74.9% and 25.1%) and minimum health 64.4 (ex13: 25.8). The single-source counterexample is reported without being required to fail, because in the dense start two pairs deadlock on conflicting gathers at a shared source. The `longPreflight` hardship requirement is therefore off for slack scenarios.
- R6: Lin, Moss, Sol, Kai, Wren and Ivo start on a ring of radius 2.2 around (14, 15); the occupancy test checks bodies, obstacles and mutual visibility and runs a crowded navigation round.
- R7: `answered`, `two-way` and `work-noticed` use a new optional `derived` rule flag that only the authored foundation may install. Tests cover on/off, cap, cooldown, pair deduplication, one event per round, decay to zero, two-way windows, once-per-person sightings, excluded signs and no award for solo symbolic actions, queries or requests.
- R8: `longTokenCeiling` and the runner pause with an explicit reason before round 80 and continue at round 80 with the same configuration. The store test accepts unchanged and extended checkpoints and rejects changed development caps, ceilings, incentive switches and untagged ones.
- R9: The vocabulary test scans instructions, all six serialized inputs and query results at round 0 and after symbolic and incentive rounds in both variants; the development validator rejects the vocabulary in new culture-scope interfaces.
- R10: Documentation is updated as listed; `expression` modules join the continuous validation family.

Compatibility: digests written on `origin/main` before any change and compared after every protocol and prompt change are identical for all 524 ex13 requests, the 27 paused ex13 ordinary inputs and all 1,604 ex7–ex12 requests. The existing ex13 and long-fixes genesis tests pass unchanged.

Local `pnpm validate` (macOS, Node 24.22.2) selected the full scope because world-core, simulator and viewer files changed, and every check passed:

- archive preservation;
- typecheck, lint, format and architecture;
- the full unit suite, including 25 new culture tests and the store and validation-scope tests;
- reconstruction of all 13 archives;
- analysis and build;
- 85 browser tests;
- documentation checks.

No new browser scene exists for signs because there is no culture archive yet. The `sign` SVG was rendered offline through Chromium and inspected: a post with a T, X or O glyph and its label. The existing ex13 Ashen and observatory screenshots are unchanged in appearance. No model-calling or random run was started, so agent behavior, token use and survival share under this scenario remain unmeasured until E2/E3.
