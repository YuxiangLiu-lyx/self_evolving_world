# Verified label timeline: ex21-1-80

Verified on 2026-11-27: verdicts on the model labels (gpt-6.1-sol) for ex21 rounds 1–80 were set by a Claude agent, not by a human annotator, and await a human spot-check. ex21 is the old-goal arm of seed 20261202 in experiment B.

The window holds 7 labelable items, all labeled by the model. Every entry of [`verification.json`](verification.json) (no positives and all 7 negatives, because the run has no more than 20) was checked against the retained archive in `experiment/ex21`: the call responses, the replay events with their `heard` listeners, positions within the 5-unit hearing and vision range, and the memory views. Every item text matches the archive verbatim; a private message is shown as its subject and body, as the label items join them.

ex21 stopped at round 44 of 80 (three consecutive rejected outputs), so the window 1–80 holds items of ticks 1–44 only.

Only verified model positives count toward the pre-registered measures of [PR-44](../../../exec-plans/completed/pr-44-b-goal-pairs.md) (R5). Misses found among the negatives enter the agreement rates, not the measures.

## Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex21-1-80`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 7       | 7     | 0       | 0        | 100.0%    | 100.0%                    |
| Positives | 0       | 0     | 0       | 0        | –         | –                         |
| Negatives | 7       | 7     | 0       | 0        | 100.0%    | 100.0%                    |

The model gave no item any category, so there are no positives and no per-category rates. All 7 items were verified as negatives.

## Verified events

None: no item was labeled with a category, and no verified negative was found to need one.

## Missed by the model

None: every verified negative was judged correct.

## Rejected labels

None.
