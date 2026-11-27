# Verified label timeline: ex23-1-80

Verified on 2026-11-27: verdicts on the model labels (gpt-6.1-sol) for ex23 rounds 1–80 were set by a Claude agent, not by a human annotator, and await a human spot-check. ex23 is the old-goal arm of seed 20261203 in experiment B.

The window holds 9 labelable items, all labeled by the model. Every entry of [`verification.json`](verification.json) (no positives and all 9 negatives, because the run has no more than 20) was checked against the retained archive in `experiment/ex23`: the call responses, the replay events with their `heard` listeners, positions within the 5-unit hearing and vision range, and the memory views. Every item text matches the archive verbatim; a private message is shown as its subject and body, as the label items join them.

Only verified model positives count toward the pre-registered measures of [PR-44](../../../exec-plans/completed/pr-44-b-goal-pairs.md) (R5). Misses found among the negatives enter the agreement rates, not the measures.

## Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex23-1-80`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 9       | 9     | 0       | 0        | 100.0%    | 100.0%                    |
| Positives | 0       | 0     | 0       | 0        | –         | –                         |
| Negatives | 9       | 9     | 0       | 0        | 100.0%    | 100.0%                    |

The model gave no item any category, so there are no positives and no per-category rates. All 9 items were verified as negatives.

## Verified events

None: no item was labeled with a category, and no verified negative was found to need one.

## Missed by the model

None: every verified negative was judged correct.

## Rejected labels

None.
