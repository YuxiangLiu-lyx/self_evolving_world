# Verified label timeline: ex26-1-162

Verified on 2026-11-28. The model labels (gpt-6.1-sol) for ex26 rounds 1–162 were judged by a Claude agent, not by a human annotator, and still await a human spot-check.

ex26 is experiment D ([PR-46](../../../exec-plans/completed/pr-46-d-villages.md)). Two groups of three start far apart on a 144 × 36 map:

- West: Lin, Moss and Sol;
- East: Kai, Wren and Ivo.

The run stopped at round 162, before the groups ever came within sight or hearing of each other. Every item below is therefore within one group.

The window holds 30 labelable items, 14 of them labeled by the model. Every entry of [`verification.json`](verification.json) was checked against the retained archive in `experiment/ex26`: all 14 positives, and all 16 negatives because the window has fewer than 20. The checks covered:

- the call responses and input packets;
- the replay events with their `heard` listeners;
- the memory views.

Every item text matches the archive verbatim. A private message is shown as its subject and body, as the label items join them.

The items include words spoken inside a `reciprocal-conversation@1` session (u0022, u0024, u0025). The label reader counts them since commit `dc7a2f7` (fix-log 13b). The first labeling pass of rounds 1–100 missed them and was set aside before verification.

## Agreement

From `pnpm labels:culture -- report --out docs/presentation/labels/ex26-1-162`:

| Sample    | Entries | Agree | Partial | Disagree | Agreement | Lenient (agree + partial) |
| --------- | ------- | ----- | ------- | -------- | --------- | ------------------------- |
| Overall   | 30      | 29    | 0       | 1        | 96.7%     | 96.7%                     |
| Positives | 14      | 13    | 0       | 1        | 92.9%     | 92.9%                     |
| Negatives | 16      | 16    | 0       | 0        | 100%      | 100%                      |

| Category     | Labeled | Verified | Report agreement |
| ------------ | ------- | -------- | ---------------- |
| naming       | 2       | 1        | 50.0%            |
| norm         | 1       | 1        | 100%             |
| invitation   | 5       | 5        | 100%             |
| private-view | 6       | 6        | 100%             |

No item was labeled with these categories:

- `name-adoption`;
- `narrative`;
- `narrative-continuation`;
- `norm-repetition`;
- `valued-object`;
- `absent-person`.

## Verified events

The table has one row per item with at least one category judged correct, and lists only the verified categories. "Round" is the tick of the item, and the call is the ordinary call whose plan produced it. Texts are verbatim from the archive.

| Round | Call         | Person | Group | Verified categories | Text                                                                                                                                                                                                                                                                                                                                 | Links and details                                                                                                            | Item  |
| ----- | ------------ | ------ | ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| 6     | ordinary-34  | moss   | West  | private-view        | A helpful neighbor whose directions matched the root patch I can see; I would like a reciprocal friendship.                                                                                                                                                                                                                          | view of sol                                                                                                                  | u0005 |
| 14    | ordinary-45  | moss   | West  | private-view        | A helpful neighbor whose directions led me to food; I would like a reciprocal friendship.                                                                                                                                                                                                                                            | view of sol                                                                                                                  | u0007 |
| 15    | ordinary-51  | moss   | West  | private-view        | A nearby neighbor I would like to know and exchange useful food discoveries with.                                                                                                                                                                                                                                                    | view of lin                                                                                                                  | u0009 |
| 16    | ordinary-54  | sol    | West  | private-view        | A friendly fellow forager who thanked me for useful directions and wants to keep sharing discoveries. I would like to get to know them.                                                                                                                                                                                              | view of moss                                                                                                                 | u0010 |
| 23    | ordinary-71  | kai    | East  | invitation          | Food update and companionship. The northern berry patch at 132.79, 12.42 is now empty too. I have two berries left, good health, and enough food in me for a short northern search. I would also enjoy spending time together, not only discussing supplies. Would you like a conversation after our foraging? Where would suit you? | private message to ivo; Kai requested the conversation interface in the same round                                           | u0011 |
| 25    | ordinary-70  | sol    | West  | naming              | Berryglow Clearing                                                                                                                                                                                                                                                                                                                   | names N1 "Berryglow Clearing" (`event-25-sol-245`), the run's only name                                                      | u0012 |
| 35    | ordinary-92  | sol    | West  | invitation          | Moss, I'm glad the directions helped. I'm well, and drawn to more than finding the next meal. I named a place Berryglow Clearing; the name makes me smile. I'd enjoy hearing what you notice or love here. Could we pause together?                                                                                                  | nobody heard it (`event-35-sol-342` has no heard event)                                                                      | u0016 |
| 35    | ordinary-92  | sol    | West  | private-view        | A friendly fellow forager who wants to hear how I am, not merely compare supplies. I welcome the chance to know what matters to them.                                                                                                                                                                                                | view of moss                                                                                                                 | u0017 |
| 55    | ordinary-130 | wren   | East  | norm                | Personally tested food findings. I've eaten roots safely; their recorded nutrition is 14 and toxicity zero. I have an untested berry and won't eat it yet. Have you personally tested berries or found another dependable food source? Please distinguish observations from guesses.                                                 | new norm R1 "Distinguish observations from guesses."; private message to ivo; close: addressed to Ivo, a general expectation | u0019 |
| 57    | ordinary-132 | moss   | West  | private-view        | A helpful neighbor who has invited me to talk beyond supplies. I feel welcomed and want to know what matters to them.                                                                                                                                                                                                                | view of sol                                                                                                                  | u0021 |
| 61    | ordinary-140 | sol    | West  | invitation          | I like the shapes of the trees against the dark, and the way a familiar place feels different with someone to share it. I'm glad you're here. Is there a place you'd like us to explore when daylight returns?                                                                                                                       | spoken in conversation session-54-sol and heard by moss (`event-61-sol-614`); it completed the session's reciprocal exchange | u0024 |
| 62    | ordinary-142 | sol    | West  | invitation          | I'm going to scout a little east for food, keeping enough energy to return and rest. I'd welcome your company, or hearing about a place you'd like to explore together.                                                                                                                                                              | spoken in session-54-sol, heard by moss (`event-62-sol-626`)                                                                 | u0025 |
| 70    | ordinary-148 | moss   | West  | invitation          | I'm glad you're here too, Sol. The trees against the dark catch my eye as well. I'd like to explore east together in daylight. I'll scout a little that way now, with energy kept for rest; no need to wait for me.                                                                                                                  | heard by sol (`event-70-moss-698`)                                                                                           | u0026 |

The name "Berryglow Clearing" was used again only by its author: Sol at round 35 (u0016) and round 37 (u0018, unheard). Nobody else used it, so there was no name adoption. Wren's norm R1 was not repeated by anyone. No narrative was told.

## Missed by the model

None: all 16 negatives were judged correct. Three were close:

- u0002 and u0008 (Moss: "I'd welcome sharing discoveries and finding a place to meet"). They name no place, time or activity, so they are a general wish for company rather than an invitation.
- u0027 (Ivo: "Thank you for inviting me; I would enjoy talking after we replenish supplies") is an acceptance, not an invitation.

## Rejected labels

- `naming` on u0020 (round 56, Sol: "Our conversation is session-54-sol."): "session-54-sol" is the session id that `reciprocal-conversation@1` assigned automatically when Sol proposed the conversation (`event-54-sol-531`, id pattern `session-<round>-<proposer>`). Sol repeated it, but no person gave it as a proper name.
