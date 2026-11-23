# Round 23: preserve one final decision alongside commentary

The real `ordinary-59` response contains a completed assistant commentary message
and one completed `final_answer` message containing a bounded read-only query batch.
The old transport reader counted both texts as decisions and rejected the response.
This is an execution/transport repair, not a new world capability. Its original
failure, raw response and known 6334 input + 275 output tokens remain unchanged.
The entire world paused at round 23; no text from that response became an action.

For the long-development transport only, the reader now recognizes explicit message
phases. Commentary remains in raw evidence and token usage but cannot be selected
as a decision. Exactly one completed final-answer message and one bounded text are
required. Missing, multiple, mixed untagged/tagged, unsupported-phase, refusal and
incomplete message candidates fail closed. Single untagged responses remain
compatible. Older protocols retain the old reader policy. Output/schema, request
instructions, observation permissions, budgets, incentives and world state do not
change.

Tests replay the actual retained raw response without a model, verify the original
failure status and known usage, and exercise ambiguous/missing outputs and text
bounds. Current-conversation repair retains the pre-repair archive, enters an empty
counted technical handoff and validates the source boundary. Recovery makes a new
counted decision attempt with existing query results and world progress; it does
not overwrite the failed call or retroactively execute its query. Developer usage
remains unmetered and is not charged as zero.
