# One-Round Model Experiment

This optional local experiment asks Lin, Moss, and Sol for one decision each through ChatGPT OAuth and the public Responses API. All agents see the version-1 starting world through their own observation. Each receives the same small goal: collect a nearby visible item or move one cell toward it. Feature acceptance and current evidence are in [PRODUCT](PRODUCT.md#current-scope).

## Run locally

Use the repository's [Node and pnpm versions](../README.md#five-minute-quick-start), then run from the repository root:

```bash
pnpm experiment:login
pnpm experiment:once
```

The first command opens the official ChatGPT authorization page for **Self-Evolving World**. Complete sign-in and grant ChatGPT plan permission in that page. The CLI verifies the signed identity, callback state, nonce, audience, expiry, and explicit scopes before saving credentials. Logging in does not request a model decision.

The second command checks the account model catalog, preferring `gpt-6.1-sol` when listed, then requests exactly one decision per agent. `SEW_MODEL` can select another listed model. Account catalog visibility alone does not prove inference entitlement. Missing or expired authorization stops before inference; rerun login to reauthorize. There is no automatic token refresh or API-key fallback in this proof of concept.

Every invocation of `experiment:once` starts a new initial world and consumes a new set of decision opportunities. It does not resume or retry a previous round. Do not rerun it when only inspecting existing results.

## Results and replay

The command prints each agent's action, summary and core outcome, or a failure. It writes results under the printed `experiment-results/round-<timestamp>/` directory:

- `decisions.json`: source label, selected model, observed tick, response ID and format when available, validated action/summary, outcome or error, final state, and replay.
- `replay.json`: the version-1 initial world and accepted action sequence, importable through the observatory's existing **Import history** control.
- `response-<agent>.json`: up to 2 MB of received response text, HTTP status, content type, request ID, and `bodyComplete` indicating whether EOF was observed. The bearer value is redacted from the body and captured metadata; request headers are excluded. Files use mode `0600` in a mode-`0700` round directory. A stream can contain a completed inference before EOF, so `bodyComplete: false` alone does not imply an incomplete decision. These records support offline parsing without new inference. Responses rejected in the two earlier runs were not retained and cannot be recovered.

All three prompts use tick 0. Accepted actions apply in Lin/Moss/Sol order, producing at most three ticks. Invalid outputs and request failures produce records without actions, and the CLI returns a nonzero exit code if any decision fails. A syntactically valid action rejected by the core still consumes a tick and records its rejection, as with manual actions. The round ends without a follow-up pickup after a move; another invocation starts a fresh world instead of continuing this one.

The request uses `store: false`, `stream: true`, a strict decision schema, and no tools or previous response. Both a completed stream and a complete JSON response must pass the same validation. When Content-Type is absent, the parser recognizes SSE or JSON from the bounded body; unknown formats remain failures. Partial deltas, refusals, incomplete responses, unsupported output, unexpected fields and model-supplied actor IDs cannot execute. Model text is never executed as host instructions. Completed decision text or response IDs that echo the bearer are rejected; recorded transport failure messages are also redacted.

## Credentials and boundaries

Registration and session files live under `~/.config/self-evolving-world/`, outside the repository. The directory is created with mode `0700` and session files with mode `0600`; replacements are atomic. Keep this directory private. The command supports one selected identity and rejects an identity change. It does not implement general account management or sign-out. Tokens never enter the viewer or replay, and existing Codex credentials are not read.

This adds no continuous loop, memory, new skills, World Agent, database or browser networking. The core remains deterministic and service-independent. Tests use explicit local fixtures; only a recorded live run demonstrates service access. See the [execution record](exec-plans/active/pr-07-three-agent-decision.md) for actual results and limitations.

The implementation follows the official [Sign in with ChatGPT flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and [models and inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), checked on 2026-11-07. It uses the public API endpoint and the separately granted `chatgpt.tokens.use.direct` permission.
