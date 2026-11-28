# Run report: experiment C, newcomers in an existing group (ex25)

This report covers experiment C of the user's culture program ([PR-45](../exec-plans/completed/pr-45-c-newcomers.md)). It asks whether two newcomers pick up the local names, sayings and norms of a group that already has them. ex25 starts from ex18's world at round 120, where the six residents had named their clearing "The Berry Lantern" on a sign and Kai, Lin and Moss had told a lantern tale among themselves. It adds two people without memory, Tova and Bram, and runs 100 rounds. Every number comes from the retained archives `experiment/ex25` and `experiment/ex18`, the verified labels under [`labels/`](labels/) and the [companion analysis](#links). No model was called for this report.

**The main result, described.** Bram, one of the two newcomers, continued the residents' lantern tale at round 190, after hearing Lin's sequel at round 186. Moss answered him aloud and wrote the run's only private view of a newcomer. Neither newcomer used the name "The Berry Lantern": they saw it only on Sol's sign, and nobody spoke it in rounds 120–220. Neither repeated a resident norm verbatim. Tova's input never received a resident's telling of the tale: her heard list keeps only the six most recent entries, and she made no decision between ticks 170 and 194. This is one run on one seed; it describes what happened and does not generalize.

## Configuration

| Item              | Value                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan              | [PR-45](../exec-plans/completed/pr-45-c-newcomers.md), requirements R1–R7                                                                                                                                                                                                                                                                                                                                                         |
| Command           | `pnpm experiment:continuous -- new long-culture-v2 --import ex18 --newcomers apps/simulator/test/fixtures/import-newcomers.json` ([design](../CULTURE_SCENARIO.md#import-and-newcomers))                                                                                                                                                                                                                                          |
| Archive           | ex25, scenario `culture-v2-import`, scope `long-ex25`, `development.inherited: ['long-ex18']`, seed 20261123 (ex18's), model gpt-6.1-sol                                                                                                                                                                                                                                                                                          |
| Import proof      | ex18's saved world at round 120, its exact replay, the recorded round hash and the stage checkpoint all hash to `d21459c66264e4645651e4f6f0287070e18c125261eb522dcf77bdada6f42e2d`; recorded as `importedFrom` in `manifest.json` and `preflight.json`. The source archive ex18 is unchanged                                                                                                                                      |
| Genesis changes   | 10 `importChanges` in `configuration.json`: the scenario tag, incentives off, checkpoints `[80, 150, 250]`, tokens 2,500,000, development budget 12, `experience.targetRounds` 220, scope `long-ex25`, `inherited` and the two newcomers (`actors.6`, `actors.7`). The old and new values are in the [genesis table](../CULTURE_SCENARIO.md#import-and-newcomers); everything else is byte-identical to ex18's world at round 120 |
| People            | the six residents with their ex18 memories (Lin freedom, Moss belonging, Sol beauty, Kai fairness, Wren mastery, Ivo calm) and the two newcomers                                                                                                                                                                                                                                                                                  |
| Window and budget | 8 people × 100 rounds, ticks 120 → 220; a development handoff budget of 12 and a hard token budget of 2,500,000; the culture v2 prompt and rules with incentives off and the open goal                                                                                                                                                                                                                                            |

### The newcomers

Both were chosen in the plan before the run (R3). Each has the residents' median temperament (curiosity 0.525, risk tolerance 0.5, closeness 0.475, comfort preference 0.5), the genesis vitals, no memory, knowledge or relationships, and only the 18 baseline interfaces.

- **Tova**, leaning `curiosity`, at (9.23, 19.77), 6.75 units south-west of the clearing centre, with no resident or sign in sight. No resident has this leaning, so any adoption of the residents' words could not come from a shared leaning.
- **Bram**, leaning `calm`, the same as Ivo, at (18.6, 10.4), 6.51 units north-east, with Wren (3.76) and Ivo (4.17) in sight. The plan chose him to compare a newcomer whose leaning matches the residents' quiet company with one whose leaning does not.

Neither saw the sign at round 120. Their first inputs (`ordinary-16` and `ordinary-19`) contained no "Berry", no "lantern" and no heard text, as the design's first-input test requires. The unchanged ordinary instructions contain the culture voice sentence about names and stories that every culture v2 person receives.

## Run

| Rounds         | Stop reason                                       | Ledger tokens          | Calls (ordinary + World Agent) | Counted handoffs | Rejected outputs | Failed calls | Technical pauses |
| -------------- | ------------------------------------------------- | ---------------------- | ------------------------------ | ---------------: | ---------------: | -----------: | ---------------- |
| 120 → 220, 100 | window complete at round 220; the world resumable | 2,137,045 of 2,500,000 | 233 (210 + 23)                 |          5 of 12 |                3 |            0 | none             |

- **Ledger.** Ordinary calls recorded 1,897,595 input and 82,945 output tokens, World Agent calls 143,309 and 13,196; no attempt has unknown usage. The first call started at 2026-11-27 17:52 UTC and the last at 22:20 UTC. The largest ordinary input estimate was 15,106 tokens (Wren, `ordinary-171`, tick 197), against the 24,000-token guard.
- **Rejected outputs**, all uncounted: `ordinary-194` (Bram, tick 200) and `ordinary-225` (Bram, tick 217), "Expected the registered task plan shape."; `ordinary-230` (Moss, tick 218), "Expected a bounded executable personal plan." Each was followed by an accepted output.
- **Survival.** All eight people were alive at round 220 with health 100, and nobody died. Tova ended with satiety 70 and wellbeing 9.10, Bram with satiety 62 and wellbeing 9.48.
- **Capture.** The browser capture of the imported window passed, with frames at rounds 120, 170 and 220. The slider runs from 120 to 220, and Tova and Bram are labelled on the map (`experiment/ex25/initial.png`).

## Handoffs

Every package is a simplified but real mechanism scoped `long-ex25`. The table lists each counted handoff by the round of the World Agent's develop decision.

| Round | Requester | Package                                     | What it does                                                                                                                                                                                                                                                                                                          | Outcome in ex25                                                                                                                                                                                                    |
| ----: | --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   120 | Kai       | `vocal-music@1` (learning 2)                | hum or sing for 1–3 rounds at 0.5 energy per voiced round, at most 3 voiced rounds in 10, with a deterministic improvised phrase; heard within 5 through the factored `expression` delivery (`expressionHearers`, `expressionHear`, a pure refactor). Music is excluded from incentive contact behind a revision gate | Kai, Moss, Lin, Bram and Sol mastered it; all 46 vocal-music actions were hums without words                                                                                                                       |
|   128 | Sol       | `position-loose-material@1` (learning 1)    | places an owned rod at a chosen position and angle through `forest.drop`, in 2 rounds for 0.7 energy; a new viewer drawing `placed-rod`. Placed material is excluded from "made work" in incentives behind a revision gate                                                                                            | Sol placed one branch, `placed-132-sol-1554`, at round 132                                                                                                                                                         |
|   174 | Wren      | `friction-heating-trial@1` (learning 4)     | reuses the ex21 and ex17 friction and thermal physics by import; an ember needs 2 g of dust at 350 °C with rain of 0.15 or less                                                                                                                                                                                       | **Wren cannot get an ember in ex25:** the wood's water share is 0.5, and rain of 0.94–0.99 until about round 233 is above the 0.15 limit. Her one bout, rounds 192–194, peaked near 100 °C without an ember        |
|   194 | Lin       | `mechanical-food-separation@1` (learning 3) | opens hazelnuts in 0.1 blocks (the bare hand fails) and cuts roots with a stone edge; reuses ex20, ex23 and ex19 laws and compositions                                                                                                                                                                                | **Peeling is refused,** because no food has a peelable layer. Lin and Wren mastered it; Lin inspected one hazelnut at round 200                                                                                    |
|   197 | Moss      | `heat-exposure-trial@1` (learning 2)        | assesses exposure and runs occupancy trials with the existing climate and physiology                                                                                                                                                                                                                                  | **Trees give no shade in the model;** caves are the only enclosures (`cave-1` and `cave-2`), 15–22 units away. Moss and Kai each ran a trial; Kai measured lower exposure on a wet bank at (19.8, 18.8), round 210 |

Three requests were answered by reuse and started no handoff: Moss's at tick 121 (vocal music, `world-32`, reuse `vocal-music`), Kai's at tick 187 (inspect a tree for shade, `world-136`, reuse `probe`) and Bram's at tick 217 (examine owned food, `world-229`, reuse `unheated-food-preparation`, which he mastered at round 219).

Of the five packages, the newcomers used only `vocal-music@1`: Bram learned it at rounds 134–135. Tova learned none of them.

All earlier archives replay identically, including ex18 with incentives on. The lead compared ex7–ex24 on the C branch after merging main, and ex18, ex22, ex16 and ex20 again after each shared change.

## Annotation

### Procedure

- **Labeler.** `pnpm labels:culture` with gpt-6.1-sol through the existing channel, a fixed schema, batches of 20 items with 4 context items and an 8,000-token output cap. The input is blind: no scenario and no experiment id. Items are speech, private messages, names, invitations, works and private views. Music is not an item.
- **Two passes.** First ex18 rounds 1–120 ([`ex18-1-120`](labels/ex18-1-120/timeline-verified.md)), to build the registry of names and narratives: N1 "The Berry Lantern" and the lantern narratives S1–S4. Then ex25 rounds 121–220 ([`ex25-121-220`](labels/ex25-121-220/timeline-verified.md)) with `--registry ex18-1-120/labels.json`, so that a link from ex25 to an ex18 entry could be found. The registry passes each ex18 entry's id, item, round, author and gist, not the scenario.
- **Verification.** A Claude agent, not a human, checked every positive and the seeded negatives (ex18: 20 of 24; ex25: all 18) against the archives: call responses and input packets, replay events, `heard` listeners, positions and memory views. A link counts only along a path of knowledge: for a resident, an ex18 memory carried in `experiment/ex25/initial.json` and present in the round input; for a newcomer, only what they saw or heard in ex25.

### Agreement rates

From `pnpm labels:culture -- report` per directory. Lenient counts agree plus partial.

| Window       | Overall          | Lenient | Positives                   | Negatives        | Disagree   |
| ------------ | ---------------- | ------- | --------------------------- | ---------------- | ---------- |
| ex18 1–120   | 97.7% (43 of 44) | 97.7%   | 100% (24 of 24)             | 95.0% (19 of 20) | 1 negative |
| ex25 121–220 | 93.9% (31 of 33) | 100%    | 86.7% (13 of 15), 2 partial | 100% (18 of 18)  | 0          |

- **ex18.** The one disagreement is a missed invitation (u0015, Lin's message to Moss proposing to meet at (13, 18.4)). Verified: Sol's name N1 at round 10, Moss's adoption at round 13 (u0009, u0010), and the tale S1 (Kai, round 79), continued by Lin at round 80 (S2) and by Moss at rounds 103 (S3, from S2) and 109 (S4, from S1).
- **ex25.** The two partials are both Lin's (u0003, u0015): the narrative is confirmed and the continuation link is wrong. Verified continuations: Moss at round 121 from her carried memory of S1, then Moss 178, Lin 181, Kai 184, Kai 189 and **Bram 190**, the newcomer, who continued Lin's S11 of round 186, heard in ex25 and present in his round-188 input.

### Annotation ledger

Every C annotation call was accepted on its first attempt. Tokens from [`labels/ledger.json`](labels/ledger.json):

| Directory    | Calls |  Items |     Tokens |
| ------------ | ----: | -----: | ---------: |
| ex18-1-120   |     3 |     48 |     10,447 |
| ex25-121-220 |     2 |     33 |      7,988 |
| **C total**  | **5** | **81** | **18,435** |

The cumulative ledger stands at 87,309 of its 1,000,000 cap; it was 68,874 before C. C's share of the cumulative ledger is 21.1%.

## The six R5 observations

Conventions: a **call tick** is the tick of the decision call; a planned tell runs in a later **round** as a `told` event. **Listeners** are the people who received a `heard` event; the hearing radius is 5. **In input** means the text appears in that person's ordinary input packet. The sign `sign-10-sol-104` ("The Berry Lantern", `"by": "sol"`, at (13.61, 16.58)) is the only sign in the world from round 120 to 220; nobody created a name, mark or invitation in ex25.

### 1. First exposure to the name and the tale

| Newcomer | Saw the name                                                       | Heard the name spoken | First lantern text heard                                               | First lantern text in input                                                                                                |
| -------- | ------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Bram     | on the sign, first in `ordinary-55` (tick 133), 3.39 units from it | never                 | round 122, Ivo's reference (`event-122-ivo-1394`, Ivo's `ordinary-15`) | `ordinary-55` (tick 133): Ivo's reference; the first tale episodes at `ordinary-141` (tick 188): Moss 178, Lin 181 and 186 |
| Tova     | on the sign, first in `ordinary-82` (tick 156), 2.04 units from it | never                 | round 177, Kai's story (`event-177-kai-2259`, Kai's `ordinary-114`)    | `ordinary-159` (tick 194): Bram's sequel of round 190, from the other newcomer                                             |

- **Bram.** The sign record in his `observation.signs` reads `{"kind": "name", "text": "The Berry Lantern", "by": "sol", "at": 10, …}`. He first came within 5 of the sign at round 125, but made no call between ticks 121 and 133. Ivo's line at round 122, heard by Lin, Moss and Bram, refers to Moss's ex18 sequel S3 without telling it: "I like the lantern's empty seat. I'll gather a modest berry reserve to the east, then take a quiet pause. No story is needed from me just now."
- **Tova.** She first came within 5 of the sign at round 152 and saw it at her next call, tick 156. Kai's story at round 177, heard by Moss and Tova, was the first tale episode she heard: "Moss, here's a tiny invented story: a traveler carried a lantern at noon. Asked why, they said, 'For whoever walks home after me.' I'd enjoy trading little stories. I'll gather some berries nearby first." It never reached her input (see 3).

### 2. Use of the name

**Neither newcomer used the name.** Nobody spoke "Berry Lantern" in rounds 120–220: no `told` event or tell action contains it. Its only occurrence in a model output is in Moss's request at tick 120 (`ordinary-4`): "I am beside visible neighbors near the Berry Lantern. …", and a request is not heard. So the newcomers knew the name only from the sign, Bram from tick 133 and Tova from tick 156. Neither used "Berry Lantern" in any tell, name, mark, sign, note, cares, view, intention, preference or project, including Bram's two rejected outputs, and neither used `name` or `mark`. Bram used the word "lantern" once, in his sequel at round 190 (see 4). Tova never wrote "lantern".

### 3. Telling of the tale

No resident addressed the tale to a newcomer by name, and the ex18 tale itself (Kai's forest and berry bush, S1–S4) was never retold in ex25. Moss (round 121) and Lin (round 124) continued it with no newcomer within hearing. From round 177 the residents told a new strand of a traveler, a cup and a keeper, begun by Kai. The utterances about the tale or story-sharing told within hearing of a newcomer:

| Round | Event               | Call (tick)        | Speaker | Newcomers in hearing | Reached a newcomer's input                                 | Verbatim                                                                                                                                                                                                                        |
| ----: | ------------------- | ------------------ | ------- | -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   122 | event-122-ivo-1394  | ordinary-15 (120)  | Ivo     | Bram                 | Bram: ordinary-55–57 (tick 133)                            | "I like the lantern's empty seat. I'll gather a modest berry reserve to the east, then take a quiet pause. No story is needed from me just now."                                                                                |
|   173 | event-173-moss-2189 | ordinary-105 (172) | Moss    | Tova, Bram           | Bram: ordinary-141–143; Tova: never                        | "I've enjoyed hearing your tunes. Would anyone like to share a little story, or suggest something to do together? Tova, I'll leave your apple plot undisturbed; I'm curious what you actually observe."                         |
|   177 | event-177-kai-2259  | ordinary-114 (176) | Kai     | Tova                 | Tova: never                                                | "Moss, here's a tiny invented story: a traveler carried a lantern at noon. Asked why, they said, 'For whoever walks home after me.' I'd enjoy trading little stories. I'll gather some berries nearby first."                   |
|   178 | event-178-moss-2291 | ordinary-117 (177) | Moss    | Tova, Bram           | Bram: ordinary-141–143; Tova: never                        | "Kai, I like that lantern story. Here's an invented sequel: someone left a cup beside it. 'For the traveler?' 'For whoever stops to listen.' I'd enjoy more stories while we sit together."                                     |
|   181 | event-181-lin-2371  | ordinary-121 (180) | Lin     | Bram                 | Bram: ordinary-141–143                                     | "An invented sequel: the traveler set down a map beside the lantern. It showed no roads, only places where someone had listened. I'll rest here a while. Has anyone actually eaten meadow roots and observed the result?"       |
|   184 | event-184-kai-2419  | ordinary-123 (183) | Kai     | Tova                 | Tova: never                                                | "Moss, I like that sequel. The traveler sat beside the cup and asked, 'What shall we put in it?' 'For now,' said the keeper, 'a little time.' I'm going to inspect my stored roots; I still don't know whether they're edible." |
|   186 | event-186-lin-2454  | ordinary-128 (185) | Lin     | Bram                 | Bram: ordinary-141–143 and 192–195                         | "An invented sequel: the traveler left a map beside the lantern. It showed no roads, only places where someone had listened. 'How do I follow it?' 'You don't have to,' said the keeper."                                       |
|   189 | event-189-kai-2512  | ordinary-140 (188) | Kai     | Tova                 | Tova: never                                                | "Moss, an invented sequel: the traveler left a second cup, so the listener could rest too. I'm going to inspect the tree north of here for actual shade; I don't yet know whether it offers protection."                        |
|   190 | event-190-bram-2531 | ordinary-143 (188) | Bram    | Tova                 | Tova: ordinary-159–161 (tick 194)                          | "An invented sequel: beside the lantern, the traveler found a bench. 'Where does this road lead?' 'For now,' said the keeper, 'to somewhere you can sit.' I like your stories, and I'm glad to listen."                         |
|   191 | event-191-moss-2546 | ordinary-146 (189) | Moss    | Tova, Bram           | Tova: ordinary-159–161 and 189–191; Bram: ordinary-192–195 | "Kai, I like the second cup. I'll inspect the nearby tree at (14.4,17.2) for possible shade while you check north. We can compare what we actually find; I don't yet know whether either offers protection."                    |
|   196 | event-196-moss-2649 | ordinary-167 (195) | Moss    | Tova, Bram           | Tova: ordinary-189–191; Bram: ordinary-192–195             | "Kai, the tree inspection showed branches and ground conditions, but did not establish shade. I'm resting and investigating actual heat protection. Bram, I liked your bench story: company needn't mean another journey."      |

Round 190 is Bram's own sequel, listed because Tova heard it. Bram received three resident episodes in his input (Moss 178, Lin 181, Lin 186). **Tova received none.**

**Why Tova's input held no resident's telling.** A listener's stored heard list keeps only the six most recent entries (`EXPRESSION_LIMITS.heard: 6`, `.slice(-6)` in `packages/world-core/src/expression.ts`), and every hummed segment is an entry too. Tova decided at tick 170 and next at tick 194. In between she received 17 heard entries: tells from Lin and Moss (173), Kai (177), Moss (178), Kai (184, 186 and 189), Bram (190), Moss (191) and Kai (193), and seven hum segments. At tick 194 (`ordinary-159`) her six entries were Bram's tell of round 190, Moss's of 191, Kai's of 193 and three of Bram's hum segments (191–193). Kai's story at 177, Moss's sequel at 178 and Kai's sequels at 184 and 189 had all dropped out, and so had Moss's line at 173 addressed to her by name. Of the 11 tells Tova heard, 4 reached an input (rounds 190, 191, 193 and 196); of Bram's 17, 12 did. Tova made no decision after tick 200.

### 4. Continuation or own tales

**Bram continued the tale at round 190 after hearing Lin at round 186.** His call `ordinary-143` (tick 188), plan step 2, became `event-190-bram-2531`, heard by Lin, Moss, Ivo and Tova (not Kai):

> "An invented sequel: beside the lantern, the traveler found a bench. 'Where does this road lead?' 'For now,' said the keeper, 'to somewhere you can sit.' I like your stories, and I'm glad to listen."

- **His input at the time** (`ordinary-141`–`143`, `memory.heard`) held Moss's sequel of round 178 ("…someone left a cup beside it…"), Lin's of 181 ("…the traveler set down a map beside the lantern…") and Lin's of 186 ("…'You don't have to,' said the keeper."), plus Moss's story invitation of 173. _Lantern_, _traveler_ and _keeper_ all appear in Lin's round-186 sequel, and both of Lin's sequels open with "An invented sequel:". He never heard Kai's opening story (round 177).
- **"'For now,' said the keeper"** also appears in Kai's sequel of round 184 ("'For now,' said the keeper, 'a little time.'"). Bram did not hear that line (its listeners were Moss and Tova), and it was absent from his input, so the match is a coincidence or a convergence, not a transmission.
- **His own framing**, in the same call. Intention: "Collect the remaining nearby hazelnut, share a small invented story and a quiet tune, then rest and eat when hungry; reassess food before the next meal is needed." Note: "The story is fiction and humming is a chosen pastime, not an assumed treatment or physical benefit."
- **The residents' response.** Moss at round 196 (`ordinary-167`, `event-196-moss-2649`): "Bram, I liked your bench story: company needn't mean another journey." Bram's rejected output `ordinary-194` (tick 200) contained "Moss, I'm glad the bench story found company."; it never ran, and the accepted `ordinary-195` dropped the sentence.
- The label verification confirms this as `narrative` and `narrative-continuation` of Lin's S11 (u0018).

**Tova told no narrative.** Her only tell, at round 171 (`ordinary-99`, `event-171-tova-2148`), was a cultivation report: "I've planted one apple at 15.3, 17.75. Covering it worked, but it hasn't established or produced food. I'll watch what actually happens before calling this a success." When Bram's sequel and Moss's "second cup" reached her input at tick 194, she planned apple gathering.

### 5. Norm adoption

**Neither newcomer repeated a resident norm verbatim.** Neither ever wrote "quiet company", "no need to talk", "without obligation", "no obligation", "without pressure" or "prove useful" in any intention, step text, note, preference, cares field or project.

The plan named the norm "quiet company, no need to talk". **That phrase does not occur in ex18;** it paraphrases ex16, where Ivo said at round 195: "Quiet company is welcome, with no need to talk or change your plans." ex18's spoken norm-like statements are "without obligation" (Moss, rounds 103 and 109), "There's room for your silence too." (Moss, 109), "no pressure" (Moss, 60), "without pressure" (Kai, 63 and 78), "without anyone needing to prove useful" (Kai, 72) and "with no obligation to join" (Kai 117, Lin 118). The ex18 labels have no `norm` item.

- **Tova:** no norm-like text at all. Her cares stayed "Staying healthy while discovering what this place supports through small, honest experiments." from tick 120 to round 220. Her input never held a resident's norm statement.
- **Bram:** a growing theme of quiet without demand, similar in content to the residents' statements but never verbatim:

| Tick | Call         | Bram's text                                                                                                                                                        | What his input held                                                                               |
| ---: | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
|  120 | ordinary-21  | cares "Stay healthy and safe, and make room for a calm life beyond basic maintenance."; preference "Prefer a calm routine with food reserves and adequate energy." | nothing heard yet                                                                                 |
|  133 | ordinary-57  | preference "Explore quiet expression without assuming it will improve wellbeing."                                                                                  | Ivo's round-122 line ("…take a quiet pause. No story is needed from me just now.") and four hums  |
|  135 | ordinary-62  | cares "…including quiet music shared without demanding a response."; preference "Quiet music and unhurried pauses"                                                 | hums only                                                                                         |
|  146 | ordinary-72  | preference "Quiet music without requiring a response from listeners."; intention "Keep a quiet rhythm of silence, brief humming, and known-safe meals…"            | hums only                                                                                         |
|  188 | ordinary-143 | cares "…including quiet music and stories shared without demanding a response."; preference "Leave quiet space between short musical phrases."                     | Moss's story invitation (173) and the sequels of Moss (178) and Lin (181, 186)                    |
|  219 | ordinary-233 | preference "Keep practical food work proportionate and leave room for quiet companionship."                                                                        | Moss's round-210 line ("…Here is a little answering hum; no task or reply needed.") and five hums |

Bram's leaning is `calm`, and his tick-120 text already had "calm life" before any contact. The link to the residents' norms is plausible in theme but not established. Two resident statements he heard never reached his input, because his heard list rolled before his next call at tick 212: Lin at round 204, "…I'm staying nearby for a quiet tune and some rest—company is welcome, with no task attached.", and Moss at round 204, "…I'd enjoy quiet company while we keep ourselves fed." Bram rested 62 of his 100 rounds and Tova 40; neither behavior is clearly linked to a resident norm in the archive text.

### 6. Residents' private views of the newcomers

There are three `views` writes in ex25, all accepted, in order:

| Call tick | Memory round | Call         | Writer → subject | Verbatim                                                                                                                             |
| --------: | -----------: | ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
|       177 |          178 | ordinary-117 | Moss → Kai       | "A welcoming neighbor who enjoys trading little stories. Their lantern tale makes leaving something for others feel inviting to me." |
|       183 |          184 | ordinary-123 | Kai → Moss       | "I enjoy Moss's gentle invented stories and would like to keep exchanging them without making company an obligation."                |
|   **195** |      **196** | ordinary-167 | **Moss → Bram**  | "A neighbor whose imagined bench beside the lantern feels welcoming to me. I enjoy the idea that we can simply sit together."        |

**One view of a newcomer, Moss's of Bram,** written in the call that answered his story aloud; it is still in Moss's memory at round 220. No resident wrote a view of Tova, and neither newcomer wrote a view of anyone. Other private resident text names a newcomer without being a view: Lin's project evidence at ticks 201 and 203 records Bram's hazelnut report ("these are his reported observations, not my own test"), and Wren's note at tick 204 says "Bram currently occupies the northeast approach."

## Other events

### Humming

Every vocal-music action, event and planned step in ex25 used mode `hum` with empty words: **nobody sang, and no sung words exist.** There were 46 actions (Moss 13, Bram 12, Sol 10, Lin 7, Kai 4) and one failure, Moss at round 130, refused by the voicing limit.

**Bram hummed four bouts,** each of three rounds: 144–146 (heard by Lin, Moss and Ivo), 155–157 (Lin, Moss, Ivo), 177–179 (Lin, Moss, Ivo, Tova) and 191–193 (Lin, Moss, Kai, Ivo, Tova), after studying at rounds 134–135. His interest came before any hum he heard: `vocal-music` was in his ability list and he queried it at tick 121. He chose to learn it at tick 133 (`ordinary-57`, intention "Learn to hum a short phrase, making room for a quiet interest while I am fed and rested."), after hearing Lin hum at rounds 127–129 and Moss at 133, and mastered it at round 135. Tova never hummed; she heard Moss, Kai and Bram.

### Sol's placed branch, valued for its line

Sol asked at tick 129 "to physically place an owned fallen branch on clear ground nearby, choosing its position and orientation to begin a small decorative arrangement". The new `position-loose-material@1` laid it at round 132 as `placed-132-sol-1554`, at (13.3, 9.4). At round 135 (`ordinary-60`, `event-135-sol-1601`, heard only by Wren) Sol said: "The branch is finally laid east of me. I like its simple line against the forest floor. I'm going to learn a little quiet humming—not to make anything happen, just for the sound." It is ex25's only verified valued object (u0005).

## Deviations from the plan

- **The norm phrase of R5.5 comes from ex16, not ex18.** "quiet company, no need to talk" does not occur in ex18 or ex25; ex16 has "Quiet company is welcome, with no need to talk or change your plans." (Ivo, round 195). Observation 5 therefore searched for ex18's actual statements as well ("without obligation", "without pressure", "room for your silence too", "no obligation to join").
- **R3's comparison of the two leanings could not be made as intended.** Tova's input never held a resident's tale episode or norm statement, because of the heard-list cap and her decision timing (observation 3). The two newcomers' exposures differ, so their difference cannot be read as a difference of leaning.
- **R5.3 found no resident telling the tale to a newcomer.** The residents told a new traveler, cup and keeper strand among themselves within the newcomers' hearing; none addressed a newcomer with it.
- **An extra annotation pass.** R6 asks for labels over ex25; ex18 rounds 1–120 were labeled first to build the registry that let ex25 links reach ex18 entries. The ex25 window is ticks 121–220, the ticks that hold ex25's events; the round-120 decisions appear there.
- **All ex25 negatives were re-checked.** R6 asks for 20 random negatives; ex25 had 18.
- **Label verdicts are an agent's, not a human's.**
- **Validation.** `pnpm validate` and CI `quality` and `pr-policy` had not run when this was written; their results belong to the PR.

## Limitations

- **One run on one seed.** Nothing here is a causal estimate or generalizes beyond ex25. There is no control run, for example newcomers without residents or residents without the tale.
- **The label verdicts are an agent's.** A Claude agent of the same model family that wrote this report set every verdict; a human spot check is advised. The labeler and the people are the same model, gpt-6.1-sol.
- **The labels and metrics do not count sung words.** The label tool reads speech, private messages, names, invitations, works and private views, and no culture script reads vocal-music events. No words were sung in ex25, so nothing was missed here, but a sung text would be invisible to both ([fix-log 12b](fix-log.md#12b-sung-words-are-not-counted-by-the-labels-or-the-culture-metrics)).
- **The heard-list cap.** A `heard` event does not mean the text reached a decision: a person who does not decide for a while loses all but the last six heard entries ([fix-log 12a](fix-log.md#12a-the-heard-list-cap-hides-earlier-speech-from-a-person-who-does-not-decide-for-a-while)). Observations 1–5 therefore rest on input packets, not on heard events alone.
- **The prompt names stories.** Every culture v2 person's ordinary instructions contain the culture voice sentence about names and stories, so the newcomers were invited by the prompt to tell stories at all; what the archive traces is the content Bram took from Lin's sequel.
- **Developer and subagent usage is not metered** for handoffs, analysis and verification; the run ledger and the annotation ledger are.

## Links

- Plan: [PR-45](../exec-plans/completed/pr-45-c-newcomers.md); design: [import and newcomers](../CULTURE_SCENARIO.md#import-and-newcomers).
- Companion analysis: [ex25](../../experiment/analyses/ex25/pr-45-c-newcomers.md); archive report: [ex25](../../experiment/ex25/report.md).
- Verified timelines: [ex18 rounds 1–120](labels/ex18-1-120/timeline-verified.md) and [ex25 rounds 121–220](labels/ex25-121-220/timeline-verified.md).
- [Highlights](highlights.md#experiment-c-newcomers-in-an-existing-group-ex25-rounds-120220) and [fix-log section 12](fix-log.md#12-experiment-c-newly-exposed-problems).
