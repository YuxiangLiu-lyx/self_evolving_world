# ex3: ChatGPT Survival Programs

## Objective

Verify ChatGPT plan-funded behavior programs for three agents over 60 synchronous survival rounds, with at most five calls per agent, mild conditions and every learning request denied without a World Agent.

## Method

Three founding actors execute 60 synchronous rounds under survival-v1. The environment is fixed at 22 C, initial health/satiety 100, cold/heat 0, and satiety loss 0.5 per round. Low satiety below 20 or cold/heat at least 70 causes 2 health loss per hazard per round after exposure updates. Death remains enabled; this mild protocol deliberately avoids the thresholds. Items retain their founding pickup-only semantics.

Model: gpt-6.1-sol. Authentication uses the user's direct ChatGPT plan grant at the public Responses endpoint, with store=false and streaming completion. No API key or paid fallback is used. Subscription limits still apply; this record does not establish unlimited access or a billing balance. The exact request template, private-per-actor inputs, attempt statuses, HTTP metadata and completed ordinary outputs are retained in [model-calls.json](model-calls.json); credentials and reasoning traces are excluded.

The model writes bounded move, pickup, wait and learn statements. Move/wait durations are chosen by the model; pickup/learn each take one round. The interpreter never executes host code. Requests occur only when a program ends, with five attempted calls per actor maximum, including failures. Missing/invalid programs consume their attempt and use explicitly counted wait fallback. The first prompt asks for one diagnostic learning request. All such requests are denied because no World Agent exists; no skills are activated.

## Results

- Status: completed; 60 rounds, 180 intents, 61 independently checked snapshots, 0 invariant failures.
- Model attempts: 12; completed responses: 12; accepted programs: 12; transport failures: 0; rejected outputs: 0.
- Survivors: 3 / 3; deaths: 0; successful pickups: 4.
- Learning requests denied: 3; learned skills: 0; World Agent calls: 0.

| Actor | Calls | Model rounds | Fallback rounds | Health | Satiety | Cold / heat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lin | 4 | 60 | 0 | 100 | 70 | 0 / 0 |
| Moss | 4 | 60 | 0 | 100 | 70 | 0 / 0 |
| Sol | 4 | 60 | 0 | 100 | 70 | 0 / 0 |

## Visualizations and history

Open the viewer and select ex3, or use its ?experiment=ex3 URL. Seek any round and select an actor to inspect position, inventory, vital signs, code, progress and learning denials. [Replay](replay.json) reconstructs all transitions without inference. [Measured overview](overview.svg), [initial](initial.png), [midpoint](midpoint.png), [final](final.png) and [overview capture](overview.png) retain actual browser evidence; [browser checks](browser.json) bind it to this replay.

## Interpretation and limitations

This is a bounded invocation and execution test under deliberately mild conditions, not evidence of long-term survival intelligence. Items cannot be consumed, learning cannot succeed, and the environment is uniform. Saved model outputs make reconstruction deterministic; another live inference can choose different code. The validator checks attempt budgets, private observations, response-to-program correspondence, scheduling, all vital trajectories, occupancy, inventory conservation and artifact hashes. Local records establish what this client observed; they are not cryptographic attestation from the provider. Adverse environments and irreversible death are covered separately by tests.
