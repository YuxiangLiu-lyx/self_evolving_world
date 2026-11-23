# Round 157: retain failed architecture check and remove the cycle

Development30 passed type checking but failed the actual architecture gate:
`long-context` imported the index helper, whose type-only import referred back to
`long-context`. The dependency rule intentionally also rejects type-only cycles.
The failure and development budget charge remain recorded; no source was installed,
no inference was attempted and no world time passed.

The query type now lives in the dependency-free index module and is re-exported
by the existing context entry. Caller compatibility and all request/response/world
semantics are unchanged. The exact protected hash pair is updated for this
uninstalled correction. The [development30](development-30.md) specification and
14489-to12839-token comparison still apply. The actual architecture check,
typecheck, focused regressions and lint are rerun before resubmission; the adapter
must still pass the complete unfiltered suite and identical prefix replay.
