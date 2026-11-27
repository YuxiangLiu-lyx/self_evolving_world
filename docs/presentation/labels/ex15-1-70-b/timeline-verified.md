# Verified label timeline: ex15-1-70-b

Verified on 2026-11-27: verdicts on the model labels (gpt-6.1-sol) for ex15 rounds 1–70 were set by a Claude agent, not by a human annotator, and await a human spot-check. This is a reference for experiment B (ex15 is not part of any pair), labeled freshly with B's procedure; it is separate from experiment A's ex16-1-400 pass, whose batches and counting predate B.

The window holds 32 labelable items, all labeled by the model. Every entry of [`verification.json`](verification.json) (6 positives and 20 seeded negatives of 26) was checked against the retained archive in `experiment/ex15`: the call responses, the replay events with their `heard` listeners, positions within the 5-unit hearing and vision range, and the memory views. Every item text matches the archive verbatim; a private message is shown as its subject and body, as the label items join them.

Only verified model positives count toward the pre-registered measures of [PR-44](../../../exec-plans/completed/pr-44-b-goal-pairs.md) (R5). Misses found among the negatives enter the agreement rates, not the measures.

## Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex15-1-70-b`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 26      | 22    | 0       | 4        | 84.6%     | 84.6%                     |
| Positives | 6       | 3     | 0       | 3        | 50.0%     | 50.0%                     |
| Negatives | 20      | 19    | 0       | 1        | 95.0%     | 95.0%                     |

The report's per-category rates count whole entries, so a partial entry lowers every category it holds. Counted per category instead:

| Category      | Labeled | Verified | Report agreement |
| ------------- | ------- | -------- | ---------------- |
| invitation    | 3       | 0        | 0.0%             |
| private-view  | 1       | 1        | 100%             |
| absent-person | 2       | 2        | 100%             |

No item was labeled `naming`, `name-adoption`, `narrative`, `narrative-continuation`, `norm`, `norm-repetition` or `valued-object`.

## Verified events

One row per item with at least one category judged correct; only the verified categories are listed. Round is the tick of the item, and the call is the ordinary call whose plan produced it. Texts are verbatim from the archive.

| Round | Call         | Person | Verified categories | Text                                                                                                                                                                                                                              | Links and details                                                                  | Item  |
| ----- | ------------ | ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| 14    | ordinary-54  | sol    | private-view        | A potential building partner; I want to coordinate supplies openly and avoid competing for scarce materials.                                                                                                                      | view of lin                                                                        | u0010 |
| 23    | ordinary-69  | sol    | absent-person       | Moss, I heard your revised plan to collect one bark. My five are still available for a coordinated transfer; nothing built yet. Lin is out of my messaging range. I will eat, recover energy and learn food preparation here.     | absent: lin; Lin stood 7.35 from Sol; Sol's message to Lin at round 22 had failed  | u0015 |
| 69    | ordinary-153 | sol    | absent-person       | Moss, I now carry eight harvested vines. My message to Lin failed because Lin isn't visible. You reported six bark and four vines; two shared bays still need 12 bark and 26 branches total. I'll rest, then study bark recovery. | absent: lin; Lin stood 15.49 from Sol; Sol's message to Lin at round 67 had failed | u0032 |

## Missed by the model

- u0023 (round 40, ordinary-78, lin), a sampled negative: "… Wren reported vines at (8.2,13.3), stock 12 at tick 14; I am approaching to check. Moss planned to gather 6 bark …" Wren stood 13.45 and Moss 6.48 from Lin, both outside vision 5. It should be `absent-person`.

The 6 unsampled negatives were not verified.

## Rejected labels

- `invitation` on u0006: "I'd like to investigate replenishing food together" names no one and gives no place, time or specific activity.
- `invitation` on u0007 and u0017: "let's coordinate materials" and "let's coordinate before another attempt" coordinate resources in conversation, without a meeting or a joint activity.
