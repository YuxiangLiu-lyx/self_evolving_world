# Ex11 round 1: collective response decoding repair

The first formal call began at `2026-11-22T13:34:34.910Z`. A's 1,600-round
preflight matched the retained B fixture: no lost lives, zero action failures and
68.2743% optional activity time. Formal policy then remained frozen.

The first three ordinary responses completed at the provider, but the inherited
single-person response reader rejected text over 10,000 characters. The first
response contained 14,952 characters and six assignments, with 14,716 input and
3,536 output tokens. Raw SSE responses and measured usage remain in their
original failed-call records. This is an implementation failure, not a decision
failure or a model token-limit failure.

The operator terminated the actual simulator process with SIGTERM after detecting
the repeated reader failure. Its command exited with code 143. The world had
advanced one queued-wait round and had started `ordinary-4`. That invocation's
outcome and usage are unknown. The task repair entry preserved the original
checkpoint under `technical-pauses/round-1`, recorded an explicit operator
interruption with no invented API response, and retained its positive reservation
and attempted-call count. It does not resend that invocation or recover unobserved
decisions. No earlier failed response is retroactively marked accepted.

The same existing repair/handoff route pre-counts `development-1`. The reader now
accepts up to 100,000 characters for collective requests only, sufficient for the
already declared bounded multi-member payload. The 8,192 output-token cap,
2,000,000-byte stream cap, exact assignment/schema validation, per-plan limits,
prompts, model, environment and all phase budgets stay fixed. Legacy callers keep
the 10,000-character default. Exact protected source hash pairs are recorded in
the existing compatibility-repair allowlist.

Offline regression reads all three actual retained responses through the repaired
provider and parses their six member assignments without inference. It also
checks that the terminated invocation remains unknown, charged and non-retriable,
without changing world time or prior outcomes. The versioned handoff must still
pass full unit, type, architecture, build and exact saved-prefix replay checks.
No success is claimed for the discarded plans, and this repair consumes the
campaign's existing development allocation.

Development-1 failed the architecture gate because the simulator regression
imported the task coordinator, exposing script dependency cycles. The coordinator
assertion was moved to its existing scripts test file; the same assertions remain.
The failed attempt is retained and the retry is development-2. No round or model
call occurred during this failed acceptance attempt.

The unit runner uses at most four workers. Preparation exposed CPU contention
timeouts when all files ran alongside the population preflight; the full suite
passed with four workers. This preserves every test and its existing timeout,
and applies the same resource bound to local handoff validation and CI.
