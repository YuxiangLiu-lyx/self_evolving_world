# PR-07: Three Agents, One Decision Each

## Requirement summary

Try ChatGPT OAuth with the public Responses API for the three existing world agents. Run one bounded experiment: Lin, Moss, and Sol each receive one decision opportunity, with no autonomous loop or automatic inference retry. The original experiment did not include publication. On 2026-11-07, the user requested delivery of the latest version, extending this plan to review, validate, publish and integrate the existing implementation while preserving its recorded live-inference limitation.

## Requirements

- R1: Authenticate the local experiment through the documented ChatGPT OAuth flow and use only the authorized public Responses endpoint, keeping credentials outside the repository and browser application.
- R2: Initialize the version-1 foundation with Lin, Moss, and Sol and request one decision per agent, using only that agent's observation plus public rules and settings.
- R3: Accept only validated base actions for the designated agent, apply accepted decisions through the unchanged core in a fixed order, and stop after one round without inference retries or tools.
- R4: Record actual decision outcomes and produce a compatible replay without tokens; distinguish live model results from deterministic test fixtures and report authentication or service blockers honestly.
- R5: Document the experiment's boundary, commands, limitations and actual acceptance; run complete validation, inspect current visual and behavior evidence, and pass the completion gate.
- R6: Prepare a focused, requirement-traceable PR against current main using completed local validation and PR preflight; integrate only after current remote quality and pr-policy checks pass, retain history, and synchronize the local integration branch after merging.

## Scope and exclusions

Add a local CLI experiment and its OAuth/Responses adapters in the simulator application, with deterministic network substitutes in tests. Preserve the core and founding catalogue. Keep the browser free of secrets and networking; its existing import flow can inspect a produced replay. This is a single-round proof of concept, not a continuous NPC controller, memory system, World Agent, skill evolution engine, general account manager, or deployment. No API-key billing fallback or private ChatGPT endpoints.

The delivery request includes necessary review fixes and GitHub integration. It does not authorize another live inference round, a package release/version change, or hosted deployment. Keep F-117 at Implemented until a separately authorized live round meets its acceptance criteria; delivery of this bounded implementation must not be described as successful live model operation.

## Acceptance criteria

- OAuth uses loopback, state, nonce, PKCE, signature/issuer/audience/expiry validation and the explicit ChatGPT plan scope. Missing or invalid authorization causes no inference.
- A successful live round makes exactly three Responses requests, with `store: false`, `stream: true`, no model tools, and no retries. Terminal failure or incomplete streams cannot become accepted decisions.
- Each prompt excludes other agents' private inventories and unobserved world state. Agent identity is bound locally, and all model output is treated as untrusted data.
- Replay contains at most three validated actions in Lin/Moss/Sol order, with no generated code execution or changes to version-1 semantics.
- Tests verify request count, observation boundaries, actor binding, response/stream failure handling, and replay compatibility without consuming live inference.
- A live run is recorded only if it actually occurs. OAuth browser consent remains the user's action; missing consent is an explicit live-experiment blocker.
- Delivery requires a clean committed worktree, complete current local validation and visual/behavior/requirement review, a passing PR contract, and successful current remote checks before merge. Preserve the two previous failed rounds as historical evidence and report live acceptance separately.

## Steps and evidence

1. Inspect the repository and current official Sign in with ChatGPT documentation.
2. Implement the local OAuth and single-round experiment, retaining application/core boundaries.
3. Complete browser authorization and one live round if the account grants access; save sanitized results and a replay.
4. Synchronize feature and architecture records, run full validation, inspect all current screenshots, and record completion evidence.

Official references checked on 2026-11-07: [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), and [preview constraints](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations). Public Responses usage requires a separately authorized `chatgpt.tokens.use.direct` scope; an existing Codex login is not assumed to grant it. No live inference has run at plan creation.

## Implementation and observed results

The local adapter, single-round runner and importable replay export are implemented without changing world-core or viewer production code. Credential handling stays in the simulator, and generated experiment results are excluded from source fingerprints, lint and formatting. The new tests cover signed identities, grant validation, per-agent observations, request counts, actor binding, terminal response handling and replay compatibility.

Browser authorization completed on 2026-11-07 with verified direct plan permission. The first ID-token validation exposed a single-element audience array; the validator now accepts the valid OIDC form and tests scalar/array audiences, authorized-party checks and invalid claims. No inference occurred during authorization.

The first live invocation selected `gpt-6.1-sol` from the authorized catalog and sent exactly three Responses requests without retries. All three were rejected locally because the returned content type was not the requested event stream; no actions executed and the world remained at tick 0. The original parser did not retain the body, so the returned payload cannot be identified retrospectively. The failure record and empty replay are saved locally under `experiment-results/round-1794030133873/`.

The parser now also validates complete JSON responses and records the received response format, while continuing to reject incomplete, failed, refused, malformed and tool outputs. A deterministic regression test covers this compatibility path; it does not establish a successful live round. An additional live round required the user's explicit authorization because the original three requests had already been sent. No automatic retry is implemented.

Local validation ran on macOS arm64 with Node 24.22.2 and pnpm 10.34.9. `pnpm validate -- "PR-07 three-agent single decision"` passed all 118 unit tests, 7 Chromium tests, 31 Markdown documents, types, lint, formatting, dependency boundaries, builds and independent CLI determinism checks. `pnpm demo` also passed. The current Playwright report was opened in Chromium; every desktop, mobile, agent-vision, after-actions and history image was inspected with passing findings. `pnpm task:finish -- "PR-07 three-agent single decision"` passed with matching source and screenshot fingerprints. This documentation update requires the final fresh validation and review recorded in `validation-results/report.json` and `review.json`.

The full diff review covers R1 through R5: OAuth and identity tests; own-observation decisions and fixed application order; Responses validation and failure handling; CLI records and replay compatibility; command configuration, generated-artifact exclusions, fingerprint regression coverage and synchronized documentation. The original audience mismatch was corrected and tested. The original live response rejection remains distinct from offline compatibility tests.

## Authorized second round and remaining limitation

The user explicitly authorized one additional round after the first failure. On 2026-11-07, the unchanged, locally validated compatibility parser sent three additional requests with `gpt-6.1-sol`, one each for Lin, Moss and Sol, with no automatic retry. Each response lacked `Content-Type`, so all three were rejected before reading the body. The second result is saved under `experiment-results/round-1794031791410/`. The total is two separately authorized rounds, six requests, zero accepted decisions and tick 0 in each world. Both saved replays were parsed with the viewer's actual import parser and reproduced their recorded final state exactly.

Neither invocation retained a response body, so the content of those six responses cannot be recovered or claimed to contain valid decisions. JSON compatibility alone did not resolve the missing-header case. The subsequent local correction recognizes SSE or JSON from a bounded body when the header is absent, preserves completed-response checks, and adds an explicit streaming Accept header. It does not treat an absent header as success.

Future invocations preserve up to 2 MB of received response data per agent, along with HTTP status, Content-Type, request ID and whether EOF was observed. The current bearer value is redacted; request headers are never stored. Capture files use mode 0600 in a mode-0700 round directory. These files support offline parser diagnosis without repeating inference, including errors and disconnected streams. The first two rounds predate capture and do not gain fabricated evidence retroactively.

Six new deterministic cases exercise headerless JSON/SSE, offline re-parsing without another request, HTTP failure capture and redaction, malformed/incomplete/oversized bodies, and read failures. The adapter test file passes 18 cases. Full fresh validation and visual review after these changes are recorded in `validation-results/report.json` and `review.json`.

At the end of the original experiment session, live acceptance remained pending and this plan stayed active. No third round was authorized or executed. Local fixture success did not establish successful live inference. No PR publication, merge, or remote CI had been requested or performed at that point.

## Latest-version delivery review

The 2026-11-07 delivery request extends the original scope to GitHub integration under R6. The existing branch starts at current `origin/main` (`585141296d9a8d0ab05782b997bad610405bfce8`). The complete review includes all simulator source and tests, generated-output exclusions, validation fingerprint handling, scripts and documentation. No core or viewer production code changes are required. Official OAuth and inference contracts were checked again; the public endpoint, direct plan grant, PKCE and terminal completion requirements remain consistent with the implementation.

Review found that body-only bearer redaction left response metadata and network-failure messages exposed to credential reflection. The provider now redacts captured Content-Type and request IDs as well as bodies, sanitizes transport failure messages before recording them, and rejects completed decision text or response IDs containing the bearer. Three regression cases cover metadata/network failures and both completed-output fields, preserving exactly three requests and zero applied actions on those failures. Exception causes remain available in process for debugging; persisted decision failures contain only the sanitized message.

The first delivery validation stopped at the error-cause lint rule after this fix. The wrapper now retains its original exception cause without changing the sanitized persisted message, and no check was disabled. A subsequent full `pnpm validate -- "PR-07 latest version delivery"` passed 127 unit tests across nine files, seven Chromium scenarios, 31 Markdown documents, strict types, lint, formatting, architecture checks, all builds and the independent-process CLI determinism check on macOS arm64 / Node 24.22.2 / pnpm 10.34.9. Documentation changes after that run require fresh evidence before publication.

The branch metadata confirms main protection and required `quality` and `pr-policy` contexts for everyone. The integration connection cannot read the administration-only detailed protection endpoint (HTTP 403), so this delivery does not claim to have reverified every protection setting or modify repository settings. Current remote check results and merge evidence will be recorded after publication.

The saved artifacts from the two historical live rounds were inspected: each contains three failed decisions, zero replay actions and final tick 0. No new OAuth or inference request was made during delivery. F-117 remains Implemented, with live acceptance pending. A future live round needs separate authorization and must retain response evidence; automated checks cannot establish model access or decision quality.
