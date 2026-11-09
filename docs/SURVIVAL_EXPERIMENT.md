# Survival Programs and ChatGPT Plan Usage

This opt-in experiment extends the version-1 [foundation](WORLD_FOUNDATION.md) without changing its catalogue, three base skills or old replays. Feature acceptance belongs to [PRODUCT](PRODUCT.md); measured runs belong to the [experiment archive](../experiment/README.md).

## Supported local integration

The local simulator uses the official [Sign in with ChatGPT token-sharing flow](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). After explicit browser consent, the application uses its own direct plan grant against the public Responses API. It reads the account's visible model catalogue, prefers gpt-6.1-sol when available and records the selected model. No private ChatGPT endpoint, borrowed application token, API key, credit purchase or paid fallback participates.

This uses subscription entitlement, subject to account availability and plan limits. It is not unlimited inference or a claim about the user's billing balance. The [preview contract](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) requires non-stored streaming requests and limits supported parameters. Only completed ordinary assistant output is accepted. Authentication/model-catalog success alone is not inference success.

```bash
pnpm experiment:login
pnpm experiment:survival
pnpm experiment:check
pnpm dev
```

Login opens the user's browser and verifies identity and granted scopes. Credentials stay outside the repository under the user's private application configuration directory. An expired authorization must be renewed with the login command. The experiment command builds the current viewer, checks previous archives, verifies authorization/catalogue access and exclusively allocates the next exN. Never invoke it again just to view a completed run. Select the run in **Experiment archive** or use its `?experiment=exN` URL.

## Survival-v1 rules

Each actor has satiety, cold exposure, heat exposure and health, all bounded to 0–100. Configuration is copied and deeply frozen at creation. Each synchronous round first resolves movement/pickup and records waiting or learning, then updates living actors:

1. Subtract the configured satiety loss, clamped to the valid range.
2. Below 10 C, increase cold by exposureRate; otherwise reduce it by recoveryRate. Above 30 C, increase heat by exposureRate; otherwise reduce it by recoveryRate.
3. After these updates, satiety below 20, cold at least 70 and heat at least 70 each independently cause the configured damage. Damage adds across hazards. Values are clamped and rounded to three decimal places.
4. Health zero is irreversible death. Dead actors cannot move, collect or learn. Their bodies retain occupancy and carried items; no revival, dropping or item consumption exists.

The initial protocol uses 22 C, satiety/health 100, cold/heat 0, satiety loss 0.5, exposure rate 2, recovery rate 1 and damage 2. After 60 mild rounds, satiety is 70 and health remains 100. This deliberate margin checks real calls without making death likely; adverse-condition tests still exercise continuing damage and death.

All actors choose from the same round-start state. Network requests are sequential but no actor moves before the whole batch is ready. The conservative simultaneous collision rules remain: initially occupied cells are blocked, and competing destinations reject all contenders. A wait occupies a round without movement. A learn intent occupies a round and always records learning-denied because no World Agent is connected. Neither intent adds a base skill or changes try semantics.

## Behavior code and budgets

The model produces JSON containing only code and a short outcome-oriented summary. Code is a finite command language, not JavaScript:

```text
move("east", 1);
pickup("wood");
learn("shelter");
wait(9);
```

Each move repeats a cardinal one-cell intent for its integer duration; wait repeats idle intents. Pickup and learn take one round each. Programs contain at most 4,000 characters and at most the remaining part of the 60-round horizon. There are no variables, loops, imports, functions, tools, eval or host execution. Rejected world actions still consume their scheduled round.

The application binds the actor ID locally and provides only that actor's observation, vital signs, previous program/outcome and public configuration. The model selects durations. It is asked to cover the horizon within five attempted requests and to include one diagnostic learning request in its first program. A new request is eligible only after the previous program ends. Every request, including failure or invalid output, consumes one of five attempts per actor: at most 15 for the founding population. A failed/invalid response waits for that round; later eligible calls remain within the cap. After exhaustion, uncovered rounds explicitly use wait fallback and are counted separately from model-controlled rounds.

The attempt ledger is written before each request and after each outcome. There are no transport-level retries. An interrupted request remains visible; inference cannot be resumed in the same archive. Browser capture can be resumed from a complete saved simulation with `pnpm experiment:resume -- exN`; this never calls the model. A failed simulation must be investigated and cannot pass acceptance by inventing missing output.

## Replay and validation

Replay version 3 contains initial conditions, survival configuration, the ordered program records (including rejected attempts as null code) and round count. The pure interpreter reconstructs all snapshots and validates eligibility, actor binding, ordering, durations and budgets. The viewer displays vitals, current code/progress and learning denials; playback is read-only and never performs inference.

The archive also retains model-calls.json: exact request template, per-call private input, attempt status, bounded completed ordinary response and HTTP metadata. Credentials and reasoning traces are excluded. Repository tooling verifies response-to-program correspondence, inputs against the actual round-start observation, exact reconstructed replay, the mild vital trajectory, item conservation, occupancy, outcomes and file hashes. Browser checks inspect each actor at initial/middle/final frames, verify export invariance and decode saved images. These checks establish consistent client evidence, not provider cryptographic attestation.

Ordinary build, test, replay and CI commands never run inference. The original one-round command and random experiment command retain their existing semantics. See [ADR-0012](decisions/0012-survival-programs.md) and [architecture](../ARCHITECTURE.md).
