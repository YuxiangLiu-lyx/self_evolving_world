# Culture metrics baseline (ex7–ex13)

This report measures the existing continuous-family archives with one deterministic, rule-based culture analyzer (stage E0) before any culture run exists. Every number comes from retained files under `experiment/`; no model was called and no archive changed.

Reproduce it with:

```bash
pnpm metrics:culture -- experiment/ex7 experiment/ex8 experiment/ex9 experiment/ex10 experiment/ex11 experiment/ex12 experiment/ex13 --markdown culture.md
```

`pnpm metrics:culture -- experiment/exN [rounds]` prints the JSON of one archive, optionally for its first `rounds` rounds; `--markdown file` writes the report sections and `--json file` writes the JSON. The [analyzer](../../scripts/culture-metrics.ts) and its [tests](../../scripts/culture-metrics.test.ts) pin the ex13 values below.

## Sources

The analyzer reads only:

- the replay segments listed in `replay.json`, each checked against its SHA-256: submitted actions, settled events, per-round memory (notes, preferences, intentions, projects, collective intents, and the private `cares` and `views` updates read only by the [private memory](#private-memory-owner-only-culture-voice-only) section) and task-cursor intentions;
- `initial.json` and `execution.json` for actors, vision radius, resources, the interface catalogue, energy cap and rest recovery, and whether the scope has a culture voice;
- an exact replay of each segment, checked round by round against its recorded hashes, read only for every person's energy at the start of each round (added later; it takes about 3 s for ex15, 12 s for ex13 and up to about a minute for ex9 and ex12);
- the first retained ordinary call of each actor, rebuilt into its full request (instructions and packet) with the current request builder, as the authored prompt; the owner's private `memory.cares` and `memory.views` are emptied first.

Actor-authored text is split into **utterances**: messages (with their subject) and public council reports or responses, which are communication; and plan intentions, notes, preferences, project ids and names given through naming actions. A note, preference, intention or project id counts once per actor, in the first round it appears, however long it persists in memory. The fallback intention the controller writes after a decision without an accepted call ("One failed-decision interval; …", found in ex7–ex10 from `execution.json` attempts and cursor start rounds) is not actor-authored and is skipped. A round's action succeeded unless that actor has a `failed` event in the round.

## Metric definitions

### Shared vocabulary

- **Candidate term**: a multi-word capitalized phrase (two or more capitalized words, allowing `of`/`the` inside), a hyphenated compound of letter-only parts, a quoted phrase of up to four words (one word only if hyphenated or capitalized), or a name given through a `name` or `mark` action. Terms are compared in lowercase singular form, so `meadow-root` and `Meadow roots` are the same term.
- **Exclusions**: stop words and number words; phrases made only of them or of actor ids and names; hyphenated compounds containing an actor name (this also removes material compounds with `moss` in ex7–ex13, whose actor Moss shares the word); ordinary English compounds (a degree, size or prefix first part such as `low-` or `non-`, an `-ing` or `-ed` last part, or an adjective head such as `-safe` or `-based`); and every term whose words already occur in the environment. The environment is derived per archive: the authored prompt above, the controller's fallback intention, all interface ids, names and descriptions of the initial and final catalogue, objects in every segment's initial world and the final world, resources, satisfaction rules, and the type, description and data of every world event (such as failure reason codes like `goal-overlap`). Events that repeat actor text (messages, requests, council reports, reads and responses, findings, lessons and any event of the symbolic interfaces below) are not environment.
- **Shared term**: a candidate whose first users (all agents using it in its first round) are followed in a later round by at least one other agent. **Cross-agent uses** count those later utterances. A later user is **exposed** when, in an earlier round, it received an utterance containing the term from another agent: a message addressed to it, public text spoken within its vision radius, or a council report it read. **Transmitted terms** are shared terms with at least one exposed later user.

### Repeated collective activities

- A **use** is a successful action of one interface by one agent in one round, located at the agent's first located action event of that round (carried forward otherwise). `navigate` and `wait` are not activities.
- Two uses by different agents link when they are at most 1 round apart and within the vision radius (5 in every archive). An **episode** is a linked group (single linkage) with at least two agents.
- A **repeated collective activity** is an interface with at least two separate episodes. Interfaces are also marked as survival or not, using the survival rule below.

### Norms

- A **norm statement** is a sentence of communication containing `should`, `must`, `ought to`, `never` or `always` (with their negations). Questions, counterfactual or epistemic `should/must have`, and descriptive `has/was/is never/always` are excluded. `never` and negated modals make a statement prohibitive.
- Its **key** is the first three content words (not stop words or actor names) after the modal. A **phrase echo** is a later communication by another agent containing the key (at least two words) in order; a sentence that echoes an earlier statement counts as that echo, not as a new statement.
- An **action echo** applies to prescriptive statements whose clause names an interface id or name: an agent that received the statement performs that interface within 10 rounds of receiving it, having not performed it in the 10 rounds before.
- **Private normative notes** apply the same detection to notes and preferences; they are reported for context only, because a norm that is never communicated is not shared.

### Sharing expressions

Norm detection only sees prescriptive modals, so restraint in, or sharing of, common resources has its own detector (`SHARING_RULES`; added after this baseline was measured).

- A **sharing expression** is a sentence of any utterance (messages, public speech, names and marks, plan intentions, notes and preferences, project ids) that matches one of five **ideas**: `leave-for-others` ("leave some stock for others", "leaving 6 for your single bay"), `take-moderately` ("take a modest share", "take only what you need", "collect only four"), `no-depletion` ("without exhausting shared sources", "don't strip the bush", "not the whole patch"), `share-split` ("share berries", "our combined supply", "split them between us") and `coordinate-collection` (a coordination word with a finite or common stock, a contrast with collecting or duplicating a collection, or doubt that more remains: "coordinate scarce materials rather than duplicate collection"; also "avoid competing for supplies"). Plain quantities ("I'll collect 6"), rationing one's own food ("reserve berries for later"), sharing information ("share measured findings", "share the observed source"), non-interference ("leave it undisturbed") and negated or descriptive forms ("I won't leave any", "not depleted") do not match.
- Each expression has the round it appeared and its **authored round**: the first round of the plan that wrote it. A plan's spoken step can be written many rounds before it is spoken (ex15: Wren's round-9 tell was written at round 1).
- A **reuse** is an expression of an idea whose authored round is later than another person's expression of the same idea. It reports the earlier expression with the most similar phrase (Jaccard similarity of content words with crude suffix folding, so leave, leaves and leaving match; **similar wording** at 0.5 or more) and its **exposure**: the earliest receipt of that idea from another person before the reuse was written, through a message to the person, public speech within the vision radius, a council read, or a name, mark or invitation sign within the vision radius of where it was made. Exposure to a different sharing idea is reported separately.
- Per idea: expressions and how many were communicated, people, first users and round, later users and the later users exposed before their first later expression.

### Beliefs

- A **belief statement** is a sentence of a message, public text, note or preference that explains a cause: **causal** (`because`, `caused by`, `due to`, `the reason`, `as a result of`, `results from`, `explains`, `that/which/this is why`) or **supernatural** (`spirit`, `luck`, `punish`, `bless`, `curse`, `omen`, `god`, `sacred`, `magic`, `ritual`, a possessive `favor` or `favored by`; the verb "favor" does not count).
- A causal sentence is excluded when it is a question, when the marker is negated (`not because`, `not the reason`), when the explained part restates an action failure (`fail`, `rejected`, `blocked`) or when it gives the reason for the author's own choice (`paused`, `keep`, `avoid`, `choose`, `decide`, `plan`, `prefer`, `will`, `wait`, `deliberate`).
- Its key is the first three content words after a causal marker, or from a supernatural marker onward. A **citation** is a later message, public text or note by another agent containing the key in order.

### Relationship structure

- **Messages**: a directed graph sender → recipient, weighted by message count.
- **Responses**: each message from B to A answers the earliest unanswered message from A to B sent at most 10 rounds earlier; the graph is responder → original sender.
- **Gives/exchanges**: completed transfers: `given` events (giver → recipient) and accepted findings or lessons (offerer → accepter).
- **Reciprocity**: the share of directed pairs whose reverse pair also has an edge; undefined (–) without edges.

### Auxiliary metrics

- **Survival share**: actor-rounds whose submitted action is `gather`, `eat` or `rest`, or an interface whose id or name contains a word starting with food, eat, meal, forag, harvest, cook, nutri, edible, water, drink, warm, heat, fire, thermal, insulat, mantle, shelter or refuge, or naming an edible resource (nutrition above zero). Function text is not used, because developed functions mention food incidentally.
- **Survival share without rest** (added later): survival actor-rounds other than `rest` over all actor-rounds, in total and per person. It is a second value next to the survival share; gates keep the survival share.
- **Rest as a default idle behavior** (added later): a submitted `rest` is **idle** when the plan step that produced it has no condition on the person's energy (no `until` or `guard` on energy, and no plan `until` on energy), or when the energy cap cut its recorded recovery (`rested` recovery below nominal times mental factor), so the person began the round within one nominal rest of the cap. The producing step comes from the round's retained cursor (the state after the round). Rest acts as a default when idle rests are at least 50% of rests. Rests from steps that rest until at least 90% of the cap are counted separately. In an archive with the weather lean-to, an unrecorded rain and wind factor can lower recovery, so the cap test is reported as unavailable there (ex11). This is **criterion 1**.
- **Rest by start energy** (criterion 2, reported next to criterion 1 with its own verdict, per person and in total): a rest is not need-driven when the person began the round, by exact replay, with energy at or above 75% of the cap (`REST_HIGH_START`; three quarters of the cap still pays for many rounds of ordinary work, about 18 moves in ex15). Rest acts as a default when such rests are at least 50% of rests with a known start energy.
- **Non-transactional share**: the share of communications that mention no coordinate, no resource id or name (except one that is also an actor name) and no word starting with food, stock, supply, reserve, inventory, material, item, resource, nutrition, toxic, edible, harvest, gather, eat, meal, water, location, position, site, route, coordinate, a compass direction, distance, give, gave, trade, exchange, swap, offer, share, lend, loan, borrow, transfer, handover, accept, please, need, help, request, ask, meet, join, together, build, carry, collect, fetch, bring or cooperat. A whole message counts as transactional if any of these appears.
- **Symbolic actions**: per agent, attempted and successful uses of interfaces named `name`, `mark`, `tell` and `invite`, and whether every agent has at least one successful use. These interfaces do not exist in ex7–ex13, so every value is zero.
- **Model labeling** is not implemented. The output keeps `modelLabels: null` and the module exports a `CultureLabeler` contract as the only extension point; a labeling pass would need a separate request.

### Private memory (owner-only, culture voice only)

In a scope with the culture voice, a plan may update what the person `cares` about and their `views` of other people ([culture scenario](../CULTURE_SCENARIO.md#a-voice-and-private-memory)). Only the owner's own packet shows them; no other person can see them. The analyzer therefore reports them only in a separate `privateMemory` section of the JSON and a "Private memory (owner-only)" Markdown section. The section is present when `execution.json` enables `longDevelopment.culture.voice` or any round records an update, and `privateMemory` is `null` otherwise, as in ex7–ex14.

- **State** is rebuilt from the round-memory updates exactly as replay applies them: omitted fields persist, an empty text forgets, views apply in person-id order and only the eight most recently updated people are kept.
- **Counts**, per person and in total: **writes** (updates recorded with a plan, including unchanged repeats), **changes** (writes that changed the held text, including forgetting) and **forgotten** (empty texts that removed a held one); the people who ever held cares or views and the people viewed; and what is held at the last round, with its text.
- **Private view convergence**: at the end of every 10-round window and at the last round, for each person currently viewed by at least two other people, the Jaccard similarity of the content-word sets (lowercase singular words without stop words or actor names, as for norm keys) of every pair of observers' views, averaged over the pairs and then over those people. Each sample reports the number of targets and pairs behind it and is null when nobody has two observers; a pair whose views both lack content words is skipped. The trend gives the first and last scored samples, their difference and the least-squares slope over all scored samples per 100 rounds.
- **Cares similarity** applies the same similarity to every pair of people currently holding cares; it is null with fewer than two.
- **Private sharing expressions** apply the sharing detector to each distinct cares and view text, with the earliest public receipt of one of its ideas from another person before the write. They never count as public expressions or reuses.
- **Separation**: no metric outside this section reads `cares` or `views`. They are not utterances, so they cannot coin, share, transmit or echo a term, norm, belief or sharing idea, and exposure and transmission are measured from public communication only (messages, public text within the vision radius and council reads). A test shows that private views and cares repeating a shared term, a norm and a belief leave every public metric unchanged.

## Baseline

Culture metrics:

| Archive | Rounds | Agents | Messages + public texts | Candidate terms | Shared terms | Cross-agent uses | Transmitted terms | Repeated activities (non-survival) | Norms / echoed | Private normative notes | Beliefs causal + supernatural / cited |
| ------- | -----: | -----: | ----------------------: | --------------: | -----------: | ---------------: | ----------------: | ---------------------------------: | -------------: | ----------------------: | ------------------------------------: |
| ex7     |   1000 |      3 |                   3 + 0 |               0 |            0 |                0 |                 0 |                              2 (0) |          0 / 0 |                       1 |                             0 + 0 / 0 |
| ex8     |    897 |      3 |                  22 + 0 |              10 |            1 |                1 |                 0 |                              4 (1) |          0 / 0 |                       7 |                             0 + 0 / 0 |
| ex9     |   1200 |      3 |                   9 + 0 |               6 |            0 |                0 |                 0 |                              3 (0) |          0 / 0 |                      17 |                             0 + 0 / 0 |
| ex10    |    358 |      3 |                  11 + 0 |              20 |            0 |                0 |                 0 |                              1 (0) |          0 / 0 |                       9 |                             0 + 0 / 0 |
| ex11    |      7 |     18 |                   0 + 0 |               0 |            0 |                0 |                 0 |                              3 (0) |          0 / 0 |                       0 |                             0 + 0 / 0 |
| ex12    |    136 |     18 |                  57 + 2 |              54 |           10 |               34 |                 1 |                              9 (6) |          0 / 0 |                       6 |                             0 + 0 / 0 |
| ex13    |    280 |      3 |                  17 + 0 |              32 |            1 |                1 |                 0 |                              2 (1) |          0 / 0 |                      23 |                             0 + 0 / 0 |

Relationships and auxiliary metrics:

| Archive | Messages (directed pairs, reciprocity) | Responses within 10 rounds (pairs, reciprocity) | Gives/exchanges       | Survival share        | Non-transactional | Symbolic actions |
| ------- | -------------------------------------- | ----------------------------------------------- | --------------------- | --------------------- | ----------------- | ---------------: |
| ex7     | 3 (2, 100.0%)                          | 1 (1, 0.0%)                                     | 0                     | 76.1% (2,283 / 3,000) | 0 of 3            |                0 |
| ex8     | 22 (6, 100.0%)                         | 7 (4, 50.0%)                                    | 0                     | 48.9% (1,316 / 2,691) | 0 of 22           |                0 |
| ex9     | 9 (3, 66.7%)                           | 5 (2, 100.0%)                                   | 1 (moss → lin)        | 53.9% (1,941 / 3,600) | 0 of 9            |                0 |
| ex10    | 11 (2, 100.0%)                         | 3 (2, 100.0%)                                   | 0                     | 43.5% (467 / 1,074)   | 0 of 11           |                0 |
| ex11    | 0 (–)                                  | 0 (–)                                           | 0                     | 49.2% (62 / 126)      | – (no messages)   |                0 |
| ex12    | 57 (22, 81.8%)                         | 25 (13, 61.5%)                                  | 1 (cedar-2 → cedar-4) | 23.2% (569 / 2,448)   | 0 of 59           |                0 |
| ex13    | 17 (6, 100.0%)                         | 9 (6, 100.0%)                                   | 0                     | 41.5% (349 / 840)     | 0 of 17           |                0 |

Repeated activities by interface (episodes; survival interfaces marked _s_):

| Archive | Interfaces with at least two episodes                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ex7     | `rest` 21 _s_, `gather` 2 _s_                                                                                                   |
| ex8     | `rest` 24 _s_, `active-warming` 9 _s_, `message` 3, `eat` 2 _s_                                                                 |
| ex9     | `rest` 21 _s_, `active-warming` 7 _s_, `eat` 2 _s_                                                                              |
| ex10    | `rest` 7 _s_                                                                                                                    |
| ex11    | `eat` 3 _s_, `gather` 3 _s_, `rest` 3 _s_                                                                                       |
| ex12    | `rest` 22 _s_, `eat` 18 _s_, `gather` 16 _s_, `consult` 10, `message` 8, `request` 5, `bark-extraction` 4, `probe` 3, `learn` 2 |
| ex13    | `rest` 4 _s_, `message` 3                                                                                                       |

Shared terms (first users and round → later users):

- ex8: `safe-food` (sol, round 266 → lin), both in plan intentions.
- ex12: ten terms, led by `bark-separation` (cedar-5, round 38 → ash-3 and five Birch members), `root-preservation` (birch-2, 18 → five members) and `food-preservation` (cedar-6, 13 → three). Only `stone-source` (ash-3, 91 → ash-4) reached its later user through a message first.
- ex13: `resting-surface` (lin, 48 → moss), both in plan intentions.
- ex7, ex9, ex10 and ex11: none.

## Notes

- **Vocabulary**: shared terms are few (0–10 per archive) and are descriptive noun compounds of the current task, not names. Apart from `stone-source` in ex12, no later user had received the term from another agent beforehand, so the overlap is better explained by the same model describing the same world in the same style than by transmission. No naming action exists, so no term was given as a name.
- **Activities**: the repeated co-located activities are almost entirely survival behavior, mostly resting. The non-survival episodes are exchanges of messages (ex8, ex12, ex13) and, in the 18-member ex12, members consulting records, requesting capabilities, probing, studying and extracting bark near one another.
- **Norms**: no message or public text contains any of the normative words. Private notes contain procedural self-rules such as "current stock must be checked on arrival" (0–23 per archive), which are never communicated.
- **Beliefs**: every causal sentence the patterns matched in ex7–ex13 was excluded as failure feedback, a reason for the author's own choice, a negation or a question; no message, public text or note matches the supernatural patterns at all.
- **Relationships**: messages flow mostly in reciprocated pairs, but volumes are small (0–57 messages). A transfer happened once each in ex9 and ex12, both material gives; no finding or lesson was ever accepted.
- **Auxiliary**: survival behavior takes 23–76% of actor-rounds; it is lowest in ex12, where 1,005 of the 2,448 submitted actions were `wait`. Every message mentions a resource, coordinate or task word, so the non-transactional share is zero wherever messages exist; even ex7's "Is there anything nearby you have enjoyed doing or would like to do together?" follows a sentence about staying near a berry shrub in the same message. Symbolic actions are zero because `name`, `mark`, `tell` and `invite` do not exist yet.

## Limitations of rule-based detection

- The patterns are English keyword rules. Paraphrases, synonyms, irony and context are invisible; a match is not an interpretation. Norm and belief keys are two or three literal content words, so a citation must repeat words in order, while a mundane repetition can still match.
- Exclusions are deliberately conservative. A term that also appears anywhere in the prompt, catalogue or world event text is never counted, even if an agent coined it first and a developer later adopted it as an interface name. Single uncapitalized, unquoted words are never candidates unless given through a naming action.
- Agents share one model, so similar wording emerges independently. The exposure and transmitted counts separate the two only approximately: exposure covers messages, public text within the vision radius and council reads, but not what an agent observed of another's actions.
- Sharing ideas are coarse keyword classes. "Collect only four" or "take a modest share" cannot tell restraint for others from personal need, coordination phrases can be logistics, and paraphrases outside the patterns (a bare "let's coordinate materials") are missed. A reuse of an idea is not proof of transmission; exposure narrows it to what the person could have received, but sign visibility ignores caps, expiry and obstacles.
- Positions come from each agent's first located action event per round, not from full reconstruction. Co-located use of one interface is not proof of joint activity, and the window (1 round), radius (vision, 5), response window (10 rounds) and echo window (10 rounds) are fixed choices.
- The survival and non-transactional rules use word lists. A message is classified as a whole, so a social question inside a resource report counts as transactional. Survival counts submitted actions, including failed ones.
- Archives differ in length, population and protocol (ex11 has 7 rounds; ex11 and ex12 have 18 members), so values are descriptive baselines, not comparable rates.

## Requirements for the culture run

A later culture run (six agents with naming, marking, telling and inviting interfaces) can gate on `symbolic.everyAgentAtLeastOne` and read its culture values with the same command. The analyzer needs from those interfaces:

- interface ids exactly `name`, `mark`, `tell` and `invite`, with a failure recorded as a `failed` event of the acting agent;
- the given name in an argument named `name`, `label`, `title`, `text`, `mark` or `symbol` for `name` and `mark`;
- the spoken text in `text`, `message`, `content` or `invitation`, and an addressed agent in `recipient`, `participant`, `invitee` or `target` for `tell` and `invite`; without an addressed agent the text counts as public, heard within the vision radius;
- if a telling interface also emits `message` events, their text must equal the argument text, so the reader does not count it twice.

Different argument names or event shapes need a matching change to the analyzer before the run is measured.
