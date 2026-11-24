# ADR-0029: Culture v2 run version

- Date: 2026-11-24
- Decision status: Accepted (implementation; no run started)
- Builds on: [ADR-0028](0028-culture-scenario.md)

## Context

The culture pilot ex15 stopped at round 70. Ivo's next ordinary input was estimated at 14,396
tokens, against a frozen guard of 14,000. A lossless compaction would have fixed it, but it
lives in `long-context.ts`, which the source verifier protects inside a run: the
input builder is part of the experiment's identity. The pilot also showed three other
problems:

- people wrote cares that paraphrased the prompt's goal sentence, and never mentioned their
  value leaning, which existed only as a data field;
- two rejected outputs and one empty closing handoff consumed counted handoffs;
- developed interface records longer than the exact-read width forced paged
  continuation reads.

The user decided to keep ex15 as the pilot record and start a new run version.

## Decision

Add two scenario tags, `long-culture-v2` and `long-culture-v2-incentives`. Each is the matching
culture genesis plus new opt-in fields, so every existing archive keeps its own genesis,
builder output and protocol:

- `longDevelopment.compaction`: lossless ordinary-input compaction. Full contracts are given
  only for interfaces needed now or used within the last 25 rounds; the rest get summaries
  that can be read in full by exact id.
- `inputEstimateLimit` 24,000 and `exactRecordWidth` 6,000. `computation.inputBytes` rises to
  200,000 so the byte guard does not bind before the token guard.
- `culture.goal: 'open'`: health and safety are the only required goal, everything else is
  the person's own, and the leaning is stated to the person in the second person.
- `rejectionRecovery`: a pause after rejected output resumes without a handoff, and the run
  stops after three consecutive rejected outputs.
- `emptyHandoffs`: a handoff that installs nothing and changes no runtime source is not
  counted.
- `abilityTextLimit` 3,500: the development validator rejects longer developed interfaces.

## Alternatives and reasons

The following alternatives were rejected:

- **An exception to the verifier for ex15.** It would weaken the rule that a run's input
  builder is fixed.
- **Accepting ex15 at round 70.** It would leave E3 and E4 unrun.
- **Truncating or paging the packet when the guard approaches.** It would hide information.
  Compaction moves content only where it stays in the same input or one exact read away.
- **Telling people to form norms or use the symbolic interfaces.** It would measure prompt
  compliance. The new prompt only removes the paraphrasable goal list.

## Costs and consequences

The new run changes two factors relative to ex15, the context and the prompt. A comparison
of the two runs therefore cannot attribute a difference to either factor alone.

Summarized interfaces need an exact read before first use. That can add query batches or
rejected outputs, which v2 no longer counts as handoffs but which do count toward the stop
rule. Handoff counts in v2 measure installed code changes only, so they are not directly
comparable with ex15's eight. All new behavior is inert without the v2 fields, as the
compatibility digests confirm.

See the [design](../CULTURE_SCENARIO.md#culture-v2) and the [plan](../exec-plans/completed/pr-38-culture-v2.md).
