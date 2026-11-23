# ADR 0026: Bounded control context and a shared long-run token ledger

- Status: Accepted for the opt-in long-development policy; ex13 retained through its round-280 development-budget boundary
- Context: Ex10 stopped at round 358 on a growing context guard. Ex12 spent much of
  its budget on detailed interfaces and repeated control diagnostics. Byte-sharing
  compression preserved text but did not bound semantic context; fixed phase
  allocations also stranded otherwise available tokens.

## Decision

Keep the existing continuous runner and current-conversation development barriers.
Add an opt-in projection and read-only batch-query envelope. Detailed active work
and escrow remain lossless; nonessential history and catalogues are paginated.
Execution retains complete runtime schema and permission validation. Queries are
journaled model responses within the same round barrier, not world skills or
physical discovery. Persist their results so recovery does not repeat paid calls.

Use a constant output schema and validate the decoded plan/review. Meter complete
requests with a pinned offline tokenizer, label estimates explicitly, retain actual
provider usage, and reserve a conservative upper bound for unknown failures. A
single fungible ordinary/world ledger spans every observation stage. No protected
budget, transport, goals or observation policy can be modified by generated skills.

Version the small recurring pressure and experience adjustments in configuration.
Historical policies remain byte-compatible when the option is absent. The Ashen
viewer selects a numbered archive and separate event-bound presentation metadata;
it cannot mutate the world or invoke agents.

## Tradeoffs and limits

Pagination can require extra model responses; proactively attaching current task
contracts reduces this cost. The generic JSON payload makes full runtime validation
more important; bounded correction and explicit pause retain failures. Approximate
BPE counts are not provider billing, while conservative reservations can stop short
of the nominal token ceiling. Large indispensable operations may still pause rather
than silently discard control facts. No compression policy guarantees interesting
behavior, successful invention or 1600 completed rounds.

A full catalogue in every response, automatic history inheritance, a second service
and unbounded retry loops were rejected. This is a joint exploratory protocol,
not evidence isolating the causal effect of any one mechanism.

See [protocol](../LONG_DEVELOPMENT.md), [plan](../exec-plans/active/pr-31-long-open-development.md)
and [regressions](../../apps/simulator/test/long-development.test.ts).
