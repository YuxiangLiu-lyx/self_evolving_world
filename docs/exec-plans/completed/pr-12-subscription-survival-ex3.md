# PR-12: Subscription-Funded Survival Programs in ex3

## Requirement summary

After completing the authorized merge-lifecycle harness task, implement and run a new ex3 using the user's ChatGPT Pro subscription without paid API-key fallback. Each of the three agents runs for 60 synchronous world rounds. The user explicitly chose repeated model decisions after each generated behavior program finishes, capped at five calls per agent (15 total). The world gains satiety, cold exposure, heat exposure and health, with deterioration and death under adverse conditions. The first run should primarily validate real calls and use mild conditions to avoid deaths. Agents may request learning skills, but all requests are denied because no World Agent/model is present.

## Requirements

- R1: Verify and document an officially supported ChatGPT plan-funded local integration, require valid consent, avoid API-key billing or purchasing credits, and report actual entitlement/transport failures without claiming successful inference.
- R2: Implement a separately versioned deterministic survival extension with satiety, cold, heat, health and death; preserve version-1 semantics and ex1/ex2; use mild recorded parameters for the initial 60-round experiment.
- R3: Ask each agent for bounded behavior code specifying actions and durations using only its own current observation and public rules; execute through a constrained validated interpreter without host-code execution, and replan only when the program ends, at most five requests per agent and 15 total.
- R4: Support recorded skill-learning requests with explicit default denial, no skill unlocking and no World Agent/model; retain plans, request counts, execution and rejection evidence.
- R5: Create only fresh ex3 with objective, method/configuration, live call evidence, code programs, measured results/report, replay and real browser visualizations; expose its interactive history and survival/skill states in the archive selector and validate artifact consistency.
- R6: Complete meaningful tests, full unfiltered local/browser/visual/requirement review, synchronized documentation, reviewed PR, conflict checks, current remote CI, merge and final task completion; report any unresolved authorization or execution blocker honestly.

## Scope and exclusions

No API-key fallback, credit purchase, automatic retry beyond the explicit per-agent cap, World Agent, learned skill activation, arbitrary code execution, foundation rewrite or archive reuse. The request budget counts attempted inference, including failed requests. Non-model fallback behavior must be labeled as such. Authentication and network access remain outside the pure core. User conversations are Chinese; repository artifacts remain English.

## Acceptance criteria

- Every agent has at most five attempted calls; world execution stops at round 60. No model call occurs in ordinary checks or replay reconstruction.
- Completed provider responses alone count as successful model calls; all errors and exact counts are retained with credentials excluded.
- Programs are validated and execution bounded; hostile/unsupported code cannot invoke the host or access another agent's private state.
- Adverse survival conditions cause health loss and eventual death in tests; the mild live experiment aims to keep all three alive without disabling death semantics.
- Learning requests always receive explicit denial and never change the fixed skill set.
- ex3 can replay full state/program/vital/skill history without new inference; ex1/ex2 remain unchanged.
- Report local review, PR checks and actual merged status separately; final default completion requires all gates.

## Research so far

Official OpenAI documentation confirms Sign in with ChatGPT can authorize eligible locally hosted/open-source app requests against the public Responses API using chatgpt.tokens.use.direct, store=false and stream=true. The existing project adapter follows that route; no private backend proxy is needed. Fresh browser consent has been verified and stored privately outside the repository. A live model-catalog read selected gpt-6.1-sol; inference had not yet run at that preflight stage. The completed live run is recorded below. The globally installed codex command also has a missing binary, but the direct official integration does not require that CLI.

Sources: [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Implementation steps

1. Add immutable survival-v1 state and synchronous idle/learning intents while retaining the founding reducer and old replay formats.
2. Interpret bounded move, pickup, wait and learn statements as one intent per world round. Keep program scheduling pure, with a maximum of five attempted requests per actor.
3. Add a plan-authenticated application adapter and durable attempt ledger, a version-3 replay and archive validation that reconstructs all results without network calls.
4. Display vital signs, active program and denied learning history in the viewer; test adverse survival, malformed programs, budget/failure cases, replay and browser behavior.
5. Run exactly one new live ex3 after local implementation checks, preserve provider outcomes, capture actual visuals, document measured results and finish full review, PR and merge.

## Validation results

The preceding merge-harness correction completed via PR #6 and its independent task:finish gate. Before live inference, types/lint, architecture, 231 unit tests and 15 browser tests passed. The two new survival desktop/mobile scenes were individually inspected. The build warning about a missing root workspace dependency was fixed by declaring the public core as a development dependency; the next build completed without that warning.

Exactly one live ex3 ran using gpt-6.1-sol and the verified direct-plan grant. All 12 requests completed and produced accepted code. Each actor chose four 15-round programs, covering 60 rounds without fallback. Final health 100, satiety 70 and cold/heat 0 for all three; no deaths. Six moves, four pickups, three denied shelter-learning requests and 167 model-chosen waits produced 180 intents. No World Agent calls or skill unlocks occurred. The saved record has a completed manifest and real browser captures at rounds 0/30/60 plus its measured overview; all four retained images were individually inspected. The first full task run passed 231 unit tests, 17 browser tests, types, lint, formatting, architecture, build, deterministic CLI and ex1/ex2/ex3 checks, then correctly failed three bare-URL documentation checks. These links were corrected; fresh full validation and review are required.

The corrected full validation run 5dff036f-be18-460c-b831-36a68e43cbc8 passed with 231 unit tests in 24 files, 17 browser tests and all 23 current screenshots individually inspected. task:review accepted the complete visual, behavior and R1-R6 review. The full diff includes code, tests, configuration, documentation and all eleven new ex3 files; no unresolved requirement mismatch remains. The base archives and founding catalogue are unchanged. pnpm demo also passed. Fresh zsh resolves pnpm 10.34.9 and Node v24.22.2. The local viewer serves ex1, ex2 and ex3, including direct ex3 history links. Checks and replay reconstruction made no additional model requests.

This plan archives the implementation and experiment evidence. The final documentation edit requires another complete validation and review before publication. Its current run ID and reviewed head belong in the PR body; current CI, conflict checks, merge SHA and independent completion result belong in the delivery receipt. Do not infer remote acceptance from these local results.

## Delivery and limitations

Default PR and merge delivery applies, with no archive-reuse or publication exception. Task completion still requires the current quality and pr-policy checks, conflict-free integration and task:finish. Subscription usage is subject to account entitlement and limits; no unlimited-usage or successful-inference claim follows from login alone. The mild experiment verifies invocation and bounded execution, not long-term survival intelligence. It intentionally has no consumption effects, successful learning, varying climate or World Agent.

## Follow-up suggestions

Evaluate harsher environments and skill-review models only in separately authorized experiments.
