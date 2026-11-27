# Verified label timeline: ex20-1-80

Verified on 2026-11-27: verdicts on the model labels (gpt-6.1-sol) for ex20 rounds 1–80 were set by a Claude agent, not by a human annotator, and await a human spot-check. ex20 is the open-goal arm of seed 20261201 in experiment B.

The window holds 37 labelable items, all labeled by the model. Every entry of [`verification.json`](verification.json) (17 positives and all 20 negatives, because the run has no more than 20) was checked against the retained archive in `experiment/ex20`: the call responses, the replay events with their `heard` listeners, positions within the 5-unit hearing and vision range, and the memory views. Every item text matches the archive verbatim; a private message is shown as its subject and body, as the label items join them.

Only verified model positives count toward the pre-registered measures of [PR-44](../../../exec-plans/completed/pr-44-b-goal-pairs.md) (R5). Misses found among the negatives enter the agreement rates, not the measures.

## Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex20-1-80`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 37      | 33    | 1       | 3        | 89.2%     | 91.9%                     |
| Positives | 17      | 13    | 1       | 3        | 76.5%     | 82.4%                     |
| Negatives | 20      | 20    | 0       | 0        | 100.0%    | 100.0%                    |

The report's per-category rates count whole entries, so a partial entry lowers every category it holds. Counted per category instead:

| Category        | Labeled | Verified | Report agreement |
| --------------- | ------- | -------- | ---------------- |
| naming          | 1       | 1        | 100%             |
| norm            | 2       | 2        | 100%             |
| norm-repetition | 3       | 3        | 66.7%            |
| invitation      | 6       | 6        | 83.3%            |
| valued-object   | 8       | 4        | 50.0%            |
| private-view    | 3       | 3        | 100%             |

No item was labeled `name-adoption`, `narrative`, `narrative-continuation` or `absent-person`.

## Verified events

One row per item with at least one category judged correct; only the verified categories are listed. Round is the tick of the item, and the call is the ordinary call whose plan produced it. Texts are verbatim from the archive.

| Round | Call         | Person | Verified categories            | Text                                                                                                                                                                                                                            | Links and details                                                                                                                                                                                                                     | Item  |
| ----- | ------------ | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 3     | ordinary-9   | sol    | naming                         | The Redberry Pause                                                                                                                                                                                                              | names N1 "The Redberry Pause"; sign-3-sol-26, subject place:13,16                                                                                                                                                                     | u0003 |
| 12    | ordinary-36  | moss   | invitation                     | A small neighborly pause: introductions, food knowledge, and ideas for something we could make together. All welcome.                                                                                                           | meeting at (14.99, 17.7), round 18; heard by lin, sol, kai and ivo; sign-12-moss-136; present at round 18: lin, moss, sol (event-18-world-223)                                                                                        | u0005 |
| 18    | ordinary-50  | kai    | norm                           | I'm Kai. I'd like to join your pause after a short rest. I've eaten red berries safely and have four left. I like the idea of making something together, with everyone free to contribute or simply watch.                      | new norm R1 "Everyone is free to contribute or simply watch shared making."                                                                                                                                                           | u0010 |
| 24    | ordinary-54  | moss   | valued-object                  | Sol, your berry colour interests me. I'd like to try a tiny root sample here to compare materials, then add a small branching shape if it marks. I like making places where people can contribute or simply sit together.       | object `mark-11-sol-117`; Sol's berry mark, which Moss heard Sol describe at rounds 16 and 23                                                                                                                                         | u0014 |
| 24    | ordinary-59  | sol    | norm-repetition, invitation    | The little berry drawing now has three visible strokes meeting in a branch on the forest floor at The Redberry Pause. Its durability is untested. I'm happy to sit together; anyone may add an idea or simply watch.            | repeats Kai's R1 "Everyone is free to contribute or simply watch shared making." (u0010, round 18, ordinary-50); heard by lin, moss, kai, wren and ivo; Sol heard u0010 at round 18; invites listeners to add to or watch the drawing | u0015 |
| 24    | ordinary-54  | moss   | private-view                   | A welcoming fellow experimenter; I enjoy their interest in small shared drawings.                                                                                                                                               | view of sol                                                                                                                                                                                                                           | u0016 |
| 24    | ordinary-54  | moss   | private-view                   | An inviting neighbor who makes room for both contributing and watching.                                                                                                                                                         | view of kai                                                                                                                                                                                                                           | u0017 |
| 28    | ordinary-50  | kai    | valued-object                  | Sol, your berry drawing sounds interesting. Moss, thanks for welcoming everyone. What would each of you enjoy adding or trying? I'd like us to choose something together, rather than assume everyone wants the same thing.     | object `mark-11-sol-117`; Sol's berry mark, which Kai heard Sol describe at rounds 16, 23 and 24                                                                                                                                      | u0020 |
| 31    | ordinary-67  | moss   | invitation                     | My root test left a pale mark here; durability is untested. I've tried a little sprout beside it. Sol, I liked your branching idea. Kai and everyone nearby: you're welcome to look, suggest something, or rest together.       | heard by sol, kai and ivo; invites Kai and the listeners to look at the drawing or rest together                                                                                                                                      | u0023 |
| 33    | ordinary-76  | moss   | norm-repetition, invitation    | Kai, I'd enjoy choosing together. My little root sprout now has three visible strokes. Would you prefer another drawing, exchanging practical findings, or simply resting here? Watching is welcome too; I'll rest for a while. | repeats Kai's R1 "Everyone is free to contribute or simply watch shared making." (u0010, round 18, ordinary-50); heard by sol, kai and ivo; Moss heard u0010 at round 18; offers Kai a drawing, findings or rest here                 | u0024 |
| 39    | ordinary-83  | kai    | norm, invitation               | Moss, I'd like a little drawing and a quiet rest together. My berry test left a muted rose mark; durability is unknown. I'm keeping the strokes closer to my hand. I enjoy your company; nobody needs to contribute materials.  | new norm R2 "Nobody needs to contribute materials to enjoy company."; heard by moss and sol; answers Moss's offer of round 33 (u0024)                                                                                                 | u0028 |
| 45    | ordinary-92  | sol    | valued-object, private-view    | A welcoming neighbor whose little pale sprout feels gentle and companionable to me.                                                                                                                                             | object `mark-26-moss-335`; view of moss; Moss's root-mark sprout                                                                                                                                                                      | u0030 |
| 48    | ordinary-92  | sol    | norm-repetition, valued-object | Moss, I like the pale sprout beside the berry branches. To me they feel like a tiny garden made of gestures. I'll sit nearby for a while; quiet company is welcome, with no need to make anything more.                         | repeats Kai's R1 "Everyone is free to contribute or simply watch shared making." (u0010, round 18, ordinary-50); object `mark-26-moss-335`; Sol heard u0010 at round 18; Moss's root-mark sprout                                      | u0031 |
| 72    | ordinary-121 | lin    | invitation                     | I've been making a tiny branching drawing with berry juice here on the meadow ground. The test dab was visible but muted; durability remains untested. You're welcome to look or simply keep me company.                        | heard by wren and ivo; invites the listeners to look at the drawing                                                                                                                                                                   | u0037 |

## Missed by the model

None: every verified negative was judged correct.

## Rejected labels

- `valued-object` on u0008: the system completion report of mark-11-sol-117 ("3 visible stroke(s) drawn …") states no valuation; the identical reports of Moss, Kai and Lin were left unlabeled.
- `valued-object` on u0009 and u0013: Sol describes the colour of the test mark and a planned drawing but expresses no liking or meaning for them; "I like the thought of making something small together" values an activity.
- `valued-object` on u0015: "now has three visible strokes meeting in a branch" only describes the drawing (its `norm-repetition` and `invitation` are confirmed).
