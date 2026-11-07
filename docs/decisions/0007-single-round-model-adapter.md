# ADR-0007: Keep Model Decisions in a Bounded CLI Adapter

- Date: 2026-11-07
- Status: Accepted

## Context

The user requested ChatGPT OAuth with Responses, three agents, and one decision each. Existing entities and observations already provide a deterministic action boundary. Connecting a model must preserve the version-1 foundation and must not imply a complete autonomous NPC system.

## Decision

Add the experiment to the Node simulator application. Authenticate the user's own local app using the documented authorization-code flow with PKCE, state, nonce, verified ID token and explicit direct plan scope. Store credentials outside the repository and browser, and call only the public Responses API. Do not reuse another application's credentials or fall back to API-key billing.

Give Lin, Moss and Sol only their respective initial observation plus public rules/settings. Each receives a fixed collection goal and one sequential request. Bind the actor locally, validate one base action, then apply it through the public core API. Preserve fixed application order and record failures without retrying. All agents observe tick 0 even though accepted actions apply sequentially; this makes the initial information boundary explicit without inventing simultaneous conflict rules.

Request non-stored streaming structured output. Accept only a terminal completed response and ordinary assistant text, with the same validation for a complete JSON response if the server returns it. When Content-Type is missing, identify SSE or JSON from the bounded body and apply the same strict checks. Record the received format. Preserve bounded, bearer-redacted response evidence locally so parser failures can be investigated offline without additional inference. Never execute model tools, generated code, or partial output. Write sanitized decisions and the existing replay format for inspection through the viewer.

## Alternatives and reasons

A continuous agent loop would require scheduling, goals, memory and usage controls outside the requested scope. Calling models from the core would break determinism and dependency boundaries. Putting tokens in the viewer would add an unnecessary credential boundary. A deterministic strategy alone would not test the requested OAuth/Responses connection. API keys would use a different authorization and billing path.

## Costs and future consequences

The CLI is a single-account proof of concept with manual reauthorization and no automatic token refresh. It duplicates the small application scenario; a test compares it with the founding viewer setup to detect drift without coupling production applications. Model outputs may fail; failures remain in the record and cannot become successful acceptance. CI uses network fixtures and does not consume plan inference. Live access depends on the user's actual grant and service response.

This decision does not change core rules, base skills, observation semantics or replay versions. Continuous NPC control, broader account lifecycle support and additional providers require separate plans. See [architecture](../../ARCHITECTURE.md), [usage](../ONE_ROUND_EXPERIMENT.md), and the [execution plan](../exec-plans/active/pr-07-three-agent-decision.md).
