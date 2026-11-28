# Culture scenario

The opt-in culture scenario builds on the [long-fixes scenario](LONG_DEVELOPMENT.md#opt-in-run-fixes-and-the-long-fixes-scenario).
It keeps the ex13 rules and seed and changes the conditions under which people live
together: more people, less survival pressure, differing dispositions, a voice of their
own and simple symbolic means. The design principle is **give possibilities, not goals**:
it removes suppressors and provides carriers, and it never tells agents what to make,
say, value or believe in. No particular outcome is required; this is an exploratory
condition, not a causal comparison. See [ADR-0028](decisions/0028-culture-scenario.md).

| Command                                                                           | Scenario tag            | Incentives |
| --------------------------------------------------------------------------------- | ----------------------- | ---------- |
| `pnpm experiment:continuous -- new long-culture`                                  | `culture`               | off        |
| `pnpm experiment:continuous -- new long-culture-incentives`                       | `culture-incentives`    | on         |
| `pnpm experiment:continuous -- new long-culture-v2`                               | `culture-v2`            | off        |
| `pnpm experiment:continuous -- new long-culture-v2-incentives`                    | `culture-v2-incentives` | on         |
| `pnpm experiment:continuous -- new long-culture-v2-oldgoal`                       | `culture-v2-oldgoal`    | off        |
| `pnpm experiment:continuous -- new long-culture-v3`                               | `culture-v3`            | off        |
| `pnpm experiment:continuous -- new long-culture-v3-incentives`                    | `culture-v3-incentives` | on         |
| `pnpm experiment:continuous -- new long-culture-v2 --import exN --newcomers file` | `culture-v2-import`     | off        |
| `pnpm experiment:continuous -- new long-culture-v2-villages`                      | `culture-v2-villages`   | off        |

Both variants of each version have the same physical genesis; they differ only in the
incentive switch, its three satisfaction rules and their event names. The
[villages](#villages) tag has its own wide map and starts. Checkpoints are verified against the
genesis of their own tag, so an altered or untagged checkpoint is rejected.

## Switches

Every part is a separately switchable field of `longDevelopment.culture`, so ablations can
build a world with any subset through `applyCulture(world, options)`. A new ablation needs
its own scenario tag before it can be started, because checkpoints are verified against a
named genesis.

| Field             | Default (`long-culture`)                  | Part                                                |
| ----------------- | ----------------------------------------- | --------------------------------------------------- |
| `voice`           | `true`                                    | A. Ordinary prompt variant and private memory       |
| `differentiation` | `true`                                    | B. Tendencies, leanings, knowledge and mastery      |
| `symbols`         | `true`                                    | C. `name`, `mark`, `tell` and `invite`              |
| `slack`           | `true`                                    | D. Later pressure, higher growth floor, nearby food |
| `density`         | `6`                                       | E. Number of people (3 keeps the ex13 actors)       |
| `incentives`      | `false` (`true` in the incentive variant) | F. Bounded satisfaction sources                     |
| `foodWater`       | `true`                                    | G. Food water representation (no interface)         |

Both variants also carry the long-fixes options: `exactRecordWidth` 4000 and both
guidance addenda. None of these fields exists in ex13, long-fixes or earlier archives.

## Budget mechanics

Frozen at creation and never changed after the first call:

- six people, a cumulative development cap of 40 handoffs, 300 World Agent calls and the
  long-scenario ceiling of 1,800 ordinary calls;
- a first observation window ending at round 80; checkpoints 80, 150 and 250;
- a shared ledger of 10,000,000 tokens;
- `longDevelopment.tokenCeilings: [{ through: 80, tokens: 3_200_000 }]`: every attempt
  made while the world tick is below 80 must fit its complete reservation under
  3,200,000 tokens, exactly like the ledger, or the run pauses with the reason
  `Frozen token ceiling of 3200000 before round 80 cannot reserve the next complete attempt`.

`extend exN 250` then continues from round 80 under the 10,000,000 ledger with no
configuration change: the ceiling no longer applies once the tick reaches 80.

`long-culture-incentives` is the incentive control for the first 120 rounds of a culture
run. It keeps the same world, seed, switches, call ceilings and round-80 ceiling, but its
frozen limits are smaller: one 120-round window (checkpoints 80 and 120), 16 development
handoffs and a 4,000,000-token ledger.

`longDevelopment.transportRecovery: 'uncounted'` (absent in every earlier run): when a
pause is caused by an ordinary call that ended without any response but with recorded
transport evidence (for example `server_is_overloaded`), or by a proved abandoned
invocation, `repair exN` retains the pause under `technical-pauses/` and resumes the run
without a development handoff. The failed call is never resent and keeps its charge in
the ledger. Since PR-41 (fix-log 7d), a transport recovery first waits for the retry-after in
the retained failure evidence plus 60 seconds, records the wait in its `recovery.json`, and
refuses a seventh dated transport recovery of the same experiment within 60 minutes. In `long-culture`, rejected model output, context and computation pauses still
need a counted handoff, and a second failure in the same round still pauses the run. Culture
v2 also resumes rejection pauses without a handoff (see [Culture v2](#culture-v2)).

These numbers were checked against the measured E1 (ex14) rates; the derivation is in
[PR #29](https://github.com/YuxiangLiu-lyx/self_evolving_world/pull/29).

## Culture v2

`long-culture-v2` and `long-culture-v2-incentives` are the run version that follows the ex15
pilot ([ADR-0029](decisions/0029-culture-v2.md)). Each is the matching culture genesis,
with the same world, seed, switches, budgets, checkpoints and ceilings, plus these fields.
None of them exists in ex15 or any earlier archive.

| Field                                | Value                                     | Effect                                                        |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| `culture.goal`                       | `'open'`                                  | Open-goal ordinary prompt with the person's leaning           |
| `longDevelopment.compaction`         | `{ version: 1, recentAbilityRounds: 25 }` | Lossless ordinary-input compaction                            |
| `longDevelopment.inputEstimateLimit` | 24,000 (ex15: 14,000)                     | Pre-inference context guard                                   |
| `longDevelopment.exactRecordWidth`   | 6,000 (ex15: 4,000)                       | Whole exact reads                                             |
| `computation.inputBytes`             | 200,000 (ex15: 120,000)                   | Byte guard, raised so the token guard binds first (see below) |
| `longDevelopment.rejectionRecovery`  | `{ mode: 'uncounted', stopAfter: 3 }`     | Rejection pauses resume without a handoff; stop after three   |
| `longDevelopment.emptyHandoffs`      | `'uncounted'`                             | A handoff that installs nothing is not counted                |
| `longDevelopment.abilityTextLimit`   | 3,500                                     | Developed interfaces serialize to at most 3,500 code units    |

**Two factors change at once.** Compared with ex15, the v2 run changes both the context and
the ordinary prompt. A difference between the runs cannot be attributed to either factor
alone, and one seed gives a case comparison, not a statistical result.

### Open-goal prompt

The ex15 prompt began with a goal list: maintain health and tolerable risk, understand
unknowns through evidence, develop reusable abilities, and improve personal and shared
living. All six people in ex15 wrote cares that paraphrased it. None ever referred to their
leaning, which existed only as a `tendencies` field. The v2 prompt replaces the list with:

> Keep yourself healthy and safe; that is required. Beyond that, how you live, what you do and
> what you care about is up to you. You tend to value _leaning_.

The leaning (freedom, belonging, beauty, fairness, mastery or calm) is inserted for each
person; the `tendencies` field keeps it too. The packet's `goal` field carries the same two
sentences, without the leaning. Every other sentence is the ex15 voice prompt. It adds no
guidance about `name`, `mark`, `tell` or `invite` and contains no excluded word.

### Context compaction

`longDevelopment.compaction` changes only ordinary inputs, and nothing is hidden: everything
moved out of the packet is either still in the same input or one exact query away, with
the same permissions. Each compaction that applies adds one sentence to `packet.access`
saying what it did (`apps/simulator/src/long-compaction.ts`).

1. **Paging notes once.** Paged records no longer repeat their page note, and reprojected
   retrieval results no longer repeat their projection note; `packet.access` states both.
2. **Already in retrieval.** A packet record, ability candidate or detail whose content is
   verified to equal, or to be an exact part of, a record already in the same input's
   retrieval becomes `{id, inRetrieval: true}`. A personal `mastered` flag is kept.
3. **Joined fragments.** Consecutive fragments of one exact record in retrieval are joined
   in order into one fragment listing `joinedParts`.
4. **Settled work.** In `execution.activeState`, completed, stopped or cancelled `:work:`
   records keep their identity, ability, mode, status, target, products and last payment,
   marked `settled: true`. An exact `state` query returns the full record. Active and
   paused work, bindings, reserved items and pointers stay complete.
5. **Terrain rows.** Visible terrain is a list of `"y:x:cells"` strings, one character per
   cell for each run of consecutive visible cells in a row, instead of `[x, y, kind]` tuples.
6. **Recent-use window.** An authored interface keeps its full contract only if it is
   needed now or was used recently. Every other interface becomes a summary
   `{id, function, args}` whose `args` names the arguments in order, with types, bounds
   and choices. Long string limits and references stay in the exact record, which an
   abilities query by id returns. Developed interfaces get full details under the same
   rule; otherwise they appear only as compact candidates.
   - "Needed now" means the bound operation, any step of the current plan, the current
     learning or operation, or an interface the person mastered this round.
   - "Used recently" means it appears as an action in the person's `experience.recent`
     history within the last 25 rounds.

   The ex15 heuristic that always detailed the most recently mastered developed interface
   is dropped.

**Why 25 rounds.** In ex15, 65 accepted plans had 301 steps. 208 of those steps used an
interface the person had used in an earlier round. The last use was within 20 rounds for
88.0% of them, within 25 rounds for 93.8% and within 40 rounds for 98.6%. The history
keeps 40 rounds; 25 covers almost all reuse while summarizing what has gone unused for a
long time. Summaries name their arguments because 63 of the 277 authored-interface steps
would have used a summarized interface. Without names, each of those would need a read or
risk a rejected output, and rejected outputs count toward the stop rule.

**Offline projection.** `npx tsx scripts/long-context-projection.ts` rebuilds every retained
ex15 ordinary input with the current builder; the archive configuration reproduces all 147
recorded estimates. It then rebuilds the same inputs with the v2 settings and fits the
growth of rounds 0–70 by least squares.

| Projection to round 250                                                   | Estimate |
| ------------------------------------------------------------------------- | -------: |
| Per-round maximum (48.0 per round)                                        |   19,100 |
| Packet-only maximum (41.7 per round) plus 1.5 × largest retrieval (2,724) |   20,872 |
| Highest single-person trend (Moss, 70.9 per round)                        |   23,650 |

Every case stays below 24,000, but the single-person margin is small. A linear fit is
pessimistic for bounded pages and optimistic for spikes: ex15's own maximum at round 70
lay about 3,100 above its trend, and the same excess on the v2 per-round trend gives about
22,200 at round 250. At round 70, v2 lowers the six estimates by 3–18%:
Ivo 14,396 → 12,452 and Lin 8,721 → 7,153. At genesis it saves 870–910 per person. The
reduction is largest early, because few interfaces have been used then. Later, recently
used developed interfaces carry their details, so v2 grows at about the same rate as ex15.

The byte guard rejects an input whose code-unit length times two exceeds
`computation.inputBytes`. In ex15, inputs held between 2.55 and 3.31 code units per estimated
token, so the historical 120,000 bytes (60,000 code units) would bind near 18,000 tokens.
200,000 bytes (100,000 code units) leaves the 24,000-token guard binding.

### Handoff counting

A handoff remains the unit of reviewed code change, and in v2 only such changes are counted.

- A pause after rejected ordinary output resumes through `repair` without a handoff, as a
  transport failure does.
- An accepted handoff that installs no package and changes no runtime source is recorded but
  not counted.
- After three consecutive rejected ordinary outputs, the run stops for review instead.

See [LONG_DEVELOPMENT](LONG_DEVELOPMENT.md) for the exact rules. The development validator
rejects any developed interface that serializes to more than 3,500 code units, so a
6,000-code-unit exact read always returns it whole.

## Culture v3

`long-culture-v3` and `long-culture-v3-incentives` are the G2-failure rerun of culture v2. Each
is the matching culture v2 genesis, with the same world, seed, fields, budgets and limits;
only `culture.goal` is `'open-2'` instead of `'open'`. This is the single permitted
adjustment, to the wording of part A's prompt.

**Diagnosis (ex16, `long-culture-v2`, rounds 0–79).** G2 failed on both conditions:

- **Survival share 50.6%.** Survival took 243 of 480 actor-rounds. 186 of those 243 rounds
  were `rest`; without `rest` the share is 11.9%. Rest was a default idle behavior by both
  analyzer criteria:
  - 115 of 186 rests (62%) were idle: 96 came from plan steps with no energy condition, and
    the cap cut the recovery of the others.
  - 145 of 186 rests (78%) began at 75% or more of the energy cap.
  - Lin, Moss and Kai rested in 45–55% of their rounds, mostly idle. Ivo waited instead
    (40 rounds), and waiting is not survival behavior.
  - With nothing required beyond health and safety, idle time was filled with rest, which
    the gate counts as survival.
- **Wren made no symbolic action.** Wren travelled about 12 units from the others' clearing,
  to "an uncrowded meadow planting site", and spent the window on cultivation and weaving
  alone. Wren heard 6 utterances and never spoke. The other five each used `tell`.

**Adjustment.** Part A's open goal now also leaves open with whom to live. After the leaning
comes one fact about the existing rest rule, which restores only missing energy:

> Keep yourself healthy and safe; that is required. Beyond that, how you live, what you do,
> with whom, and what you care about is up to you. You tend to value _leaning_. Rest restores
> missing energy up to the cap; at full energy it restores nothing.

The packet `goal` carries the first two sentences. Nothing else changes: the prompt gives no
guidance about `name`, `mark`, `tell` or `invite`, prescribes no activity and contains no
excluded word. Slack (part D) was not changed, because survival without `rest` was already
11.9%: the share came from idle rest, not from survival need. One seed gives a case
comparison: the adjustment may lower idle rest without changing what people do.

## Culture v2 old-goal

`long-culture-v2-oldgoal` (label `culture-v2-oldgoal`) asks whether the goal sentence is a
cause of the differences between ex15 and the culture v2 runs. It is the culture v2 genesis
with `culture.goal: 'original'` instead of `'open'`. The ordinary request differs from
culture v2 in two places only:

- **The goal sentence.** The open goal is replaced, in the instructions and in the packet
  `goal`, by the sentence that opened the ex15 prompt, verbatim:

  > Maintain health and tolerable risk, understand unknowns through evidence, develop
  > reusable abilities and improve personal and shared living. Choose your own questions,
  > projects and activities; none is required.

  The ex15 packet `goal` carried an older wording of the same list (`OPEN_GOAL`). This tag
  uses the prompt sentence in both places, as culture v2 does with its open goal.

- **The leaning.** The sentence "You tend to value _leaning_." is removed. As in ex15, the
  leaning appears only as the `leaning` field of `memory.tendencies` (and of `long:tendencies`
  in `state` query results). The context header (`longContext`) carries no `goal` or `leaning` marker, as in
  ex15, so neither the goal switch nor the scenario label reaches any agent.

Everything else equals culture v2: world, seed, rules, budgets, compaction, limits, culture
switches, the rest of the prompt (including the sentence beginning "Names, stories, views"),
packet fields, output schema and the World Agent input. The prompt is the ex15 voice prompt
with the v2 compaction sentence (`ORIGINAL_GOAL_ORDINARY`). The
[test](../apps/simulator/test/long-culture-v2-oldgoal.test.ts) replaces the two places with
placeholders and then asserts byte equality of all six round-0 ordinary requests. It also
asserts byte equality of the World Agent request and of the genesis apart from the goal
switch and the label. At round 0 no ordinary request contains culture, belief, religion,
ritual, social, story, myth, legend or tradition in any case or inflection, except
"stories" in that shared sentence.

### Allocation options

For every long culture tag, `new` also accepts `--seed N`, `--development N` and
`--tokens N`. Each value must be a positive integer, and each flag may be given once:

| Flag            | Field                    | Without the flag                              |
| --------------- | ------------------------ | --------------------------------------------- |
| `--seed`        | `config.seed`            | 20261123                                      |
| `--development` | `budgets.development`    | 40, or 16 for an incentive tag                |
| `--tokens`      | `longDevelopment.tokens` | 10,000,000, or 4,000,000 for an incentive tag |

The values are set at genesis, before the first call, and the offline preflight runs on
the same genesis, so it uses the chosen seed. Without flags the genesis is byte-identical
to the tag's frozen genesis, and with flags it differs only in these three fields. The
fields are in `configuration.json`. The manifest records them as `allocation` and appends
one sentence to its objective. The checkpoint verifier rebuilds the genesis with the
recorded allocation, so a later change to any of the three is rejected. The same flags on
`long-culture-v2` and `long-culture-v2-oldgoal` give a pair the same seed and budgets.

A different seed does not change the map, the authored objects, the people or the World
Agent input; at round 0 it changes only the climate in the ordinary packet (see the
[allocation tests](../scripts/long-allocation.test.ts)). Over a run it changes the seeded
parts of the world:

- the climate phases of rain, wind and weather temperature, which depend on the seed
  modulo 11, 7 and 19, and through them plant growth and stock;
- where spreading plants place their seedlings, which depends on the seed modulo 16;
- the seeded per-item draws of material models, such as pole geometry and the nut,
  exterior and joining models of developed interfaces.

## Import and newcomers

`pnpm experiment:continuous -- new long-culture-v2 --import exN --newcomers file.json`
starts a new experiment from the retained world of a completed culture window and adds
newcomers at its genesis. It was added for experiment C: whether newcomers learn the local
names and sayings of an existing group. Its scenario tag is `culture-v2-import`. The run
uses the `long-culture-v2` prompt and rules with incentives off, and it has its own frozen
limits (`LONG_IMPORT` in `long-import.ts`): 100 rounds from the imported round, 12
development handoffs and a 2,500,000-token ledger. For ex18 the window runs from round 120
to round 220 with 8 people.

The newcomers file lists one to six people as `{ "newcomers": [{ "id", "name", "leaning" }] }`.
Each person needs a lowercase id, the same name capitalized and a one-word leaning.
[`import-newcomers.json`](../apps/simulator/test/fixtures/import-newcomers.json) holds the
two people of experiment C, Tova (leaning `curiosity`) and Bram (leaning `calm`):

```sh
pnpm experiment:continuous -- new long-culture-v2 --import ex18 --newcomers apps/simulator/test/fixtures/import-newcomers.json
```

**Source and proof.** The source must be a completed window with no pending call or
barrier; for ex18 this is the window that completed at round 120. The import only reads the
source archive. It reads `execution.json` `world` and computes its `continuousHash`. The
hash must equal three others:

- the hash of the world rebuilt by exact replay of every segment in `replay.json` (each
  segment's SHA-256 is checked against the index first);
- the `after` hash recorded with the last replayed round (`replay.json` records segment
  file hashes, not a world hash);
- the world of the scheduled stage checkpoint at that round, if one is kept.

`manifest.json` and `preflight.json` record these values as `importedFrom`, with the source
id, round and scope, the SHA-256 of `execution.json`, the replay index, the last runtime
source revision and the source provenance. For ex18 all four hashes are
`d21459c66264e4645651e4f6f0287070e18c125261eb522dcf77bdada6f42e2d`; the source revision
is revision 4 (round 73, `efcd206b…`).

**Genesis changes.** `configuration.json` is the world configuration plus `importChanges`,
a machine-readable list of every change with its old value, new value and reason. Any
other configuration difference from `long-culture-v2` is refused. Checkpoints of the run are
verified against the configuration derived in code (`longImportConfig`) from the source
scope and round recorded in `manifest.json`. Like the other run policy files, `long-import.ts`
cannot be changed by a development handoff. For ex18 the list is:

| Path                                        | ex18                    | Import              |
| ------------------------------------------- | ----------------------- | ------------------- |
| `config.longDevelopment.scenario`           | `culture-v2-incentives` | `culture-v2-import` |
| `config.longDevelopment.culture.incentives` | `true`                  | `false`             |
| `config.longDevelopment.checkpoints`        | `[80, 120]`             | `[80, 150, 250]`    |
| `config.longDevelopment.tokens`             | 4,000,000               | 2,500,000           |
| `config.budgets.development`                | 16                      | 12                  |
| `config.experience.targetRounds`            | 120                     | 220 (window target) |
| `config.development.scope`                  | `long-ex18`             | `long-exN`          |
| `config.development.inherited`              | absent                  | `['long-ex18']`     |
| `actors.6`, `actors.7`                      | absent                  | Tova and Bram       |

The checkpoints are the culture v2 values, so the new window has one scheduled stage, at
round 150. Every other value is byte-identical to the source: tick, time, terrain, plants,
objects, signs, items, processes, events, world state and the residents' vitals,
inventories, memories, cares, views and mastered abilities. A test diffs the two worlds and
compares every other field byte by byte.

**Inherited packages.** `development.inherited` (absent in every world that was not
imported) lists earlier scopes. `continuousRegistry` then also includes those scopes'
packages, so ex18's `plant-establishment-trial@1`, `unheated-food-preparation@1` and
`thermal-food-preparation@1` keep their handlers, processes and state schemas for the
people who mastered them. `v7Install` is unchanged: new installs still need the current
scope, and the inherited packages, like every other foreign scope, are rejected. Every
other world's registry is unchanged.

**Newcomers.** They are made from the culture genesis person, like the new people of the
culture scenario:

- temperament: the median of the six residents' values for each dimension. For ex18 this
  is curiosity 0.525, risk tolerance 0.5, closeness 0.475 and comfort preference 0.5;
- start: health 100, satiety 80, energy 40 and temperature 22, the genesis wellbeing and
  experience, and an empty inventory, as the residents had at round 0; `bornAt` is the
  imported round;
- no memory: no cells, objects, notes, preferences, cares, views, projects or knowledge
  (also no food knowledge, which the residents received at genesis), no relationships and
  only the authored baseline of the scope (the 18 baseline interfaces);
- start position: 6–7 units from `CULTURE_CENTER` (14, 15) on opposite sides, on dry
  ordinary ground (`.` or `f`, ordinary soil) clear of every body, and at least 0.5 units
  clear of objects and ground items. Of the 24 directions where both people have such a
  start, the one farthest from the nearest resident is used.

For ex18 this places Tova at (9.23, 19.77), 6.75 units south-west of the centre, with no
resident or sign within the vision radius 5. Bram is at (18.6, 10.4), 6.5 units north-east,
and sees Wren (3.76) and Ivo (4.17). No newcomer sees the sign naming the clearing at
round 120. No prompt text, packet field or note mentions place names, sayings or the
residents' history. A newcomer learns only what the world shows: observation, hearing and
signs in sight. The test checks each newcomer's first ordinary input. It contains no
excluded word, no "Berry" or "Lantern" and no resident note, care, view, intention,
project goal or heard text. It names only residents in sight. For an import, the excluded
words also include _story_, _myth_, _legend_ and _tradition_ (`IMPORT_EXCLUDED_WORDS`). This
covers newcomer names, leanings and interfaces developed in the new run. The unchanged
ordinary instructions still contain the culture voice sentence about names and stories,
the same text every culture v2 person receives.

**Execution.** The new execution has no attempts, plans, retrieval, barrier or pending
call, so every person decides afresh at the imported round. The residents keep their
memories in the world. Ex18's incentive state stays inert with incentives off:

- the three derived satisfaction rules remain registered, but nothing can produce their
  events;
- the `expression:contacts`, `expression:acknowledged`, `expression:bonds` and
  `expression:noticed` bookkeeping is never updated again;
- the only residue is Kai's last `answered` award: 0.5 until round 126, plus a sustained
  part of 0.017 at round 120 that reaches 0 by round 132.

**Preflight.** The genesis oracle cannot be reused unchanged. It tried to eat Lin's 0.9-unit
hazelnut, which `eat` refuses because it takes whole units, so Lin starved at round 218. It
now skips owned items below one unit, which never exist at a genesis. The import's baseline
oracle covers the imported window: 100 rounds, all 8 people alive. Over 1,600 rounds it
loses Wren at round 336, after pressure starts at round 300. The cause is the oracle
assigning each food source to the nearest person at the start, whose positions are no
longer the genesis ring. The stationary counterexample still runs 1,600 rounds and is
reported without a hardship requirement, as in every slack scenario.

Replay, analysis and the observatory start at the imported round: segments are named from
it (`replay/execution-000120-000220.json`), the browser frames are the imported, middle and
final rounds, and the slider starts at the imported round. Every earlier archive starts at
round 0 and is unchanged. The viewer gives Tova and Bram their own body colors. The
browser capture of an imported window works for ex25, the first imported archive: its
frames are rounds 120, 170 and 220, the slider starts at round 120 (120 / 220), and Tova
and Bram are labelled on the map.

## Villages

`long-culture-v2-villages` (scenario tag `culture-v2-villages`, experiment D) is the culture v2
genesis with the same prompt, switches (incentives off, goal `open`), compaction, context and
handoff limits, and with a different world layout and starting arrangement. Six people form
two groups of three that start far apart. Each group has food nearby for about 80–100 rounds;
between them lies a richer, regenerating food area. Nothing in any input mentions the other
group, the area between them, villages or neighbors, so hunger, not the prompt, is what can
bring them together. The run plan is 6 people × 200 rounds.

| Field                         | Culture v2                       | Villages                             |
| ----------------------------- | -------------------------------- | ------------------------------------ |
| `config.width`                | 48                               | 144 (height 36 unchanged)            |
| `longDevelopment.checkpoints` | 80, 150, 250                     | 100, 200                             |
| `longDevelopment.firstWindow` | absent (window = `targetRounds`) | 100                                  |
| `longDevelopment.tokens`      | 10,000,000                       | 3,000,000                            |
| `budgets.development`         | 40                               | 16                                   |
| `config.development.hazards`  | 4                                | the same 4 and their 4 mirror images |

The first window ends at round 100, then `extend exN 200` follows. `firstWindow` is new and
absent in every earlier run. It replaces `experience.targetRounds` as the window because
World Agent inputs show the experience configuration, which therefore keeps the culture v2
value of 80. The culture v2 ceiling of 3,200,000 tokens before round 80 is kept unchanged; it
cannot bind under the 3,000,000-token ledger. Every other configuration field, the abilities,
resources, rules, revisions, event types and state flags are those of culture v2.

### Map

The map (`apps/simulator/src/long-villages.ts`) is 144 × 36:

- **West neighborhood, x 0–48.** The ex13 terrain and every ex13 object of the culture v2
  genesis at its v2 place: start sources, forest sources, canopy branches, both caves and the
  five animals. Only the food amounts change (below). The v2 clearing commons are not placed.
- **East neighborhood, x 96–144.** The exact mirror image about x = 72. Terrain rows are
  palindromes, and each object is copied to x' = 144 − x with the same kind, shape, stock
  and data. Ids follow the ex13 scheme with shifted indices: `start-3..5-*`, `forest-*-3..5`,
  `canopy-75..149`, `cave-3` and `cave-4`, and animals named by their mirrored home (for
  example `wolf-104-18`). The ex13 hazards are mirrored as `east-drought-1/2` and
  `river-waterlogging-3/4`. All of them start at round 260 or later.
- **Meadow, x 48–96.** It continues the ex13 terrain rule east of x = 31, which gives one
  column profile: rocky ground in rows 0–16, grass in rows 17–25 and forest in rows 26–35. Its
  only objects are the middle food plants.

Water, fords, forest and ordinary soil are therefore those of ex13 on both sides. Each group
has the same materials, caves, wildlife and hazards at ex13 density. Animals group only with
their own herd: the east copies carry `group: '<species>-2'`, and the open ecology now
matches peers by group, which defaults to the species. Every earlier archive has
`group === species`, so its grouping is unchanged. Without this, every herd member would walk
toward the first animal of its species in the other neighborhood.

**People.** The culture v2 people keep their order, tendencies, leanings, knowledge, mastery and
vitals. Lin (freedom), Moss (belonging) and Sol (beauty) start in the west on the v2 ring
(radius 2.2, 120 degrees apart) around the v2 clearing (14, 15): Lin at (16.2, 15), Moss at
(12.9, 16.91), Sol at (12.9, 13.09). Kai (fairness), Wren (mastery) and Ivo (calm) start at
the exact mirror images of Moss, Sol and Lin, so each similar pair (belonging/fairness,
beauty/mastery, freedom/calm) is split between the groups. Within a group, people start 3.81
units apart, and everyone sees the other two at round 0.

### Food

Satiety falls by `hunger` = 0.9 per round and person, and a unit eaten adds its nutrition
(berry 8, root 14). Three people therefore need 2.7 nutrition per round.

**Near each village** (both identical, mirrored):

- **Larder.** Each person has one berry bush and one root patch at the v2 ring-0 places
  (radius 3.8, 0.3 rad either side of their start). Each holds 4 units (capacity 4) and grows
  four times slower than the v2 commons (intervals 20 and 32). That is 3 × (4 × 8 + 4 × 14) =
  264 nutrition per village.
- **Copied ex13 food plants.** Every one keeps its kind, place, toxicity and capacity, but
  starts harvested (stock 0) and grows ten times slower (intervals × 10). Fish has no
  regrowth, as in ex13.

The food lasts T rounds, where 264 + R(T) = 2.7 × T + U. U is what people eat above the
drain, for example to raise satiety from the starting 80, and R is regrowth. Integrating the
growth model (`forestGrowth` with the seasonal and soil factors of the open ecology, no
depletion) gives cumulative growth of about 21 by round 100 and 48 by round 200. No larder
unit regrows before about round 97, and no copied ex13 plant regrows within 200 rounds; the
first berry needs growth 120, reached after about 900 rounds. So R = 0 before round 97, and
T = 264 / 2.7 = 98 rounds with U = 0, or 87 rounds with U = 30 (everyone topping up to 90).
After that, regrowth is limited to the larder: one berry per bush at about rounds 97 and 170
and one root per patch at about round 140. That is 90 nutrition per village by round 200,
about a third of what three people eat. The isolated preflight oracle eats only when satiety
is below 78 (U ≈ 0), and it emptied both larders by round 100.

**The middle area** consists of 24 berry bushes and 24 root patches. They have the culture v2
commons capacity (20) and growth intervals (5 and 8). They stand in four rows (y = 18.5,
20.5, 22.5 and 24.5) at x = 72 ± 1, 3, …, 11 on the meadow grass, alternating kinds
symmetrically about x = 72.

- **Initial food:** 10,560 nutrition, 20 times both villages' 528.
- **Regrowth:** ideal regrowth is about 7,660 nutrition a year (800 rounds), against about
  760 for both villages together. Six people eat 4,320 a year, so the area keeps
  regenerating. The 24 commons sources alone (about 3,830) would not.
- **Distance:** its nearest plant is 47.1 units from the west centre (44.9 from Lin).
- **Visibility:** nobody remembers it at genesis, and no text points to it. People find it
  only by going there.

### Separation in the first 60 rounds

Offline proof: `apps/simulator/test/long-culture-villages.test.ts`.

**Maximum movement per round.**

- `navigate` is the only interface whose handler (`kernel.navigate`) changes a position. One
  round is one `v7Step`, and every person runs one action.
- Navigation moves at most `speed × dt / travelFactor` along its path per round.
  `travelFactor` is 1 + 0.6 × waterlogging with waterlogging ≥ 0 (`open-physical.ts`), so the
  step is at most 0.8 × 1 / 1 = 0.8. The kernel only rejects or reverts conflicting moves; it
  never adds distance.
- The only other position change is respawn after a death (`forest-lives.ts`). It places the
  person within 3 units of their own start.

**Perception.**

- Vision and hearing share `config.vision` = 5. Other people are seen within 5 of a person's
  position.
- `tell` and `invite` are heard within 5 of the speaker.
- Signs (names, marks and invitation signs) stand where their maker stood. They are seen when
  their 0.06-radius circle is within 5.

**Bound.** The brief's bound is 2 × 60 × 0.8 + 5 = 101. The closest pair of starts across the
groups (Lin and Ivo) is 111.6 apart, a margin of 10.6. A stricter bound also counts a respawn
ring on both sides and the sign radius: 2 × (48 + 3) + 5 + 0.06 = 107.06, which still leaves
4.54. In the first 60 rounds, no person of one group can therefore see or hear a person of
the other group, or see their names, marks or invitation signs. A 60-round run in which both
groups rush toward each other, speak, mark and invite confirms it.

**Other channels checked.**

- **Messages** need the recipient within 5. Gifts need handoff reach, and finding exchange
  needs distance ≤ 2 and sight. Each is rejected across the gap (tested).
- **Events** reach a person only if the person is the actor, if a message is addressed to them
  within range, or if the event's position is within 5 and visible. `heard` events have no
  position and go only to their listener.
- **Memory** is filled only from the person's own observation.
- **Shared state:** finding offers are keyed to their recipient and need the exchange range.
  There are no councils (no collective policy), no incentive bookkeeping (incentives off) and
  no world-wide broadcast event.
- **Exception: invitation attendance.** `invite` accepts any dry meeting point in the world, by
  the culture v2 rules, which this tag keeps. At the meeting round an `attendance` event appears
  at that point and names the host and the invitation. Anyone within 5 of the point sees it, so
  a person who names a point where someone of the other group happens to stand would reach
  them. The distance bound does not cover this channel, and a test demonstrates it. It needs a
  meeting point chosen within 5 units of an unseen person more than 100 units away. An analysis
  can detect it in the replay.
- **Global by design.** The interface catalogue and World Agent reviews are shared, as in every
  run:
  - An interface developed for anyone appears to everyone, without its requester.
  - A World Agent rejection reason is free text written for a batch that can include requesters
    of both groups.
  - A `views` key must be the id of an existing person, so a plan with a correctly guessed id is
    accepted.
  - A developed interface could also add movement faster than 0.8 per round. The bound holds for
    the genesis interfaces.

### Identical inputs

The test builds every person's round-0 ordinary request and World Agent inputs (one request
from each person, then all six together) for both tags. The instructions, request envelope,
`longContext`, catalogue, retrieval and every non-world packet field are byte-identical:
goal, identity, time, vitals, wellbeing, learning, load, experience, execution, inventory,
tendencies, cares, views, heard, offers, messages, projects, knowledge, records, abilities and
access. The v2 sentence that names stories is unchanged. The fields that differ show the world:

- **Ordinary input:** `state.position`, `state.life.spawn`, `environment.temperature` and
  `environment.local.ground` (the ground under the start), `observation.actors`,
  `observation.objects` and `observation.terrain`, and `rules.bounds` (144, 36).
- **World Agent input:** `applicants[].observed`, `rules.bounds` and
  `rules.fresh.hazards`.

New agent-visible text (ids, names, labels, data values and hazard ids) contains none of
culture, belief, religion, ritual, social, story, myth, legend or tradition. It does not
mention villages, neighbors, a meeting or a middle.

### Preflight

Allocation runs both offline preflights on the new genesis. The isolated feasibility
oracle (`openPreflight`) gives each food source to the person whose start is nearest. Here
the far middle area falls in the start sectors of at most two people per group, so the
third person would starve by construction once the local food is gone. For this tag only,
sources are therefore shared and reserved per round, as in the collective arms
(`scripts/open-preflight.ts`). Results on the final genesis:

- **Open preflight:** 258 s for 1,600 rounds (culture v2: 134 s). No life was lost, and the
  optional (waiting) share was 68.8%. Minimum health was 78.9 (Ivo, one round of
  starvation) and minimum satiety 0. Initial safe nutrition was 11,088 and the nearest safe
  food was 0.9–1.8 units away. There were no failed actions.
- **The oracle's trip:** both larders were empty at round 100. Everyone then walked 80–100
  rounds to the middle and arrived with satiety 4–14.
- **Long preflight** (single-source counterexample, reported rather than required, because
  slack is on): 24 s. Every person loses all three lives (first deaths at rounds 102 and 147),
  since a single local source cannot feed anyone.
- **Runtime:** allocation therefore spends about 4.7 minutes on preflights.

### Viewer

`apps/viewer/src/observatory-camera.ts` frames maps more than twice as wide as tall:

- **Fit** fits the whole map to the stage and centres it.
- **Zoom** reaches the whole map.
- **Minimap** takes the map's proportions, and its camera rectangle shows the area actually
  visible.

Every earlier map (24 × 24, 48 × 36 and the legacy grids) keeps the historical square
framing and the 48-unit zoom limit, so existing archives render as before. Minimap clicks now
account for the letterbox on every map. They previously ignored it, about 4.5 units off
vertically on ex13.

### Limits

- **Computation budget.** Six far navigations that each exhaust their bounded search (450,000
  work units) in one round exceed the culture v2 round budget of 2,000,000 units. That happened
  on round 14 of the offline rush test, when both groups reached their rivers at once. A
  computation pause would replay the same round and exhaust it again. This tag therefore sets
  `computation.workPerRound` to 6,000,000, three times v2's for three times the area. It is an
  engine limit, not part of any input (ADR-0031).
- **Distance to the middle.** The middle area is about 47 units from each start. With rest
  stops, the oracle needed 80–100 rounds for the trip and arrived nearly starving. People
  who wait until their larder is empty before searching can run short of food on the way.
- **Remote invitations.** See the attendance exception above.
- **Viewer capture.** The observatory and capture were checked with unit tests of the
  framing only. A real wide archive is needed to see the screenshots.
- **No run.** No model-calling run has been made with this tag.

## A. Voice and private memory

The culture ordinary prompt is the legacy prompt with four phrases replaced
(`VOICE_REPLACEMENTS` in `long-request.ts`); every other sentence, and the legacy prompt
itself, is unchanged:

- Physical facts still need evidence: "never invent resources, completed progress or
  physical effects". Names, stories, views, values, explanations and impressions of other
  people are the agent's own and may be formed, shared, revised or dropped freely.
- "No query, request, registration or mastery earns happiness" drops the word _label_,
  which suppressed naming without adding information.
- The plan may carry `cares` (what the person cares about, at most 300 characters) and
  `views` (person id to how the person sees them, at most 8 people of 200 characters;
  an empty string forgets one). Both are private, persist when omitted and appear only in
  the owner's packet as `memory.cares` and `memory.views`. Oversized values or views of
  unknown people reject the decision with one bounded correction. Updates apply when the
  plan starts and are recorded in the round memory, so replay reconstructs them.
- **Metrics:** `pnpm metrics:culture` reports `cares` and `views` only in its separate,
  owner-only `privateMemory` section: update counts, what each person holds, and private
  view convergence, the similarity of different observers' views of the same person over
  time. No public or transmission metric reads them; see the
  [metric definitions](presentation/culture-baseline.md#private-memory-owner-only-culture-voice-only).

## B. Differentiation

`long:tendencies` values spread across 0.2–0.8 (ex13 values all lie in 0.47–0.56). In this
scope the visible key `socialNeed` is called `closeness`; experience weighting reads either
key, so ex13 is unchanged. Each person also has a one-word `leaning`: freedom, belonging,
beauty, fairness, mastery or calm. A leaning is a tendency only: no rule reads it and no
content or instruction is attached.

| Person | curiosity | riskTolerance | closeness | comfortPreference | leaning   | Known food  | Starts without |
| ------ | --------- | ------------- | --------- | ----------------- | --------- | ----------- | -------------- |
| Lin    | 0.80      | 0.30          | 0.40      | 0.55              | freedom   | berry       | —              |
| Moss   | 0.25      | 0.75          | 0.65      | 0.30              | belonging | root        | `probe`        |
| Sol    | 0.60      | 0.45          | 0.20      | 0.75              | beauty    | berry, root | —              |
| Kai    | 0.35      | 0.65          | 0.80      | 0.45              | fairness  | berry       | `exchange`     |
| Wren   | 0.70      | 0.20          | 0.55      | 0.25              | mastery   | root        | `consult`      |
| Ivo    | 0.45      | 0.55          | 0.30      | 0.70              | calm      | berry, root | —              |

Everyone knows at least one safe food that grows by their start. A missing authored
interface is shown as `mastered: false` in the packet and `learn` restores it in one round.

## C. Symbolic interfaces

The authored package `foundation-expression@1` adds four interfaces with no physical effect
beyond one round of action time and no energy or material cost:

| Interface | Arguments                         | Effect                                                                                                            |
| --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`    | `subject`, `text` (≤ 60)          | Name this place (empty subject) or a visible object or nearby item; renaming the same subject replaces one's name |
| `mark`    | `subject`, `text` (≤ 120)         | Leave a mark on the ground here or on an object or item within reach                                              |
| `tell`    | `text` (≤ 240)                    | Say it aloud; every living person within the vision radius (5 units) hears it, seen or not                        |
| `invite`  | `x`, `y`, `round`, `text` (≤ 120) | Heard like `tell`; an invitation sign stays until 10 rounds after the meeting round (≤ 200 rounds ahead)          |

- **Events:** `named`, `marked`, `told` and `invited` for the actor; a private `heard`
  event (no position) for each listener; at the invited round an `attendance` event at the
  place lists who is within 2.5 units and, separately, who heard the invitation away from
  the place and came. A failed attempt is an ordinary `failed` event of the actor.
- **Persistence:** names, marks and invitations are non-solid world objects of kind
  `name`, `mark` or `invitation` with the `sign` visual component, placed where the person
  stands. Each person's 24 most recent names and marks and 3 most recent invitations
  persist; expired invitations disappear. Each listener keeps its 6 most recent heard items.
- **Observation:** nearby signs appear in `observation.signs` (nearest 6, paged) instead
  of the physical object page, `memory.heard` lists heard items, and full sign records are
  read by exact id through the `observed` query section, including remembered ones.
- **Bounds and disclosure:** text bounds are checked when a plan is parsed and again at
  execution. The speaker learns nothing about who heard; hidden properties stay hidden.
- **Replay:** everything follows from recorded actions and the deterministic environment
  hook; the reconstruction test rebuilds signs, heard lists and private memory exactly.
- **Viewer:** a small post with a kind glyph (T name, X mark, O invitation) and its label.
- **Metrics:** text is in `text`, there is no addressee argument (spoken words are public
  within the vision radius) and `tell` emits no `message` events, as
  `pnpm metrics:culture` expects.

## D. Slack

`pressureStart` 220 → 300, `difficultyStart` 380 → 440 and `growthFloor` 0.3 → 0.6; the
cycle, cold, rain and hazards are unchanged, so rounds 0–299 are mild. Pressure starts at
round 300, so the 80-round pilot and a main run to round 250 lie entirely in the mild
period: neither observes behavior under seasonal pressure. Each person has two
renewable berry bushes (capacity 20, growth interval 5) and two renewable root patches
(capacity 20, interval 8) just outside their start, 24 commons sources in all. The
[offline preflight](exec-plans/evidence/pr-36-culture-scenario/preflight.json) over 1,600
rounds: no life lost, optional (waiting) share 76.1% and survival action share 23.9%
(ex13: 74.9% and 25.1%), minimum health 64.4 (ex13: 25.8), nearest safe food 0.9–1.8
units (ex13: 1.5–2.2), initial safe nutrition 9,654 for six (ex13: 4,374 for three). The
deliberately naive single-source counterexample is reported, not required to fail: in the
dense start two pairs pick the same nearest source and deadlock on conflicting gathers.
The oracle waits whenever satiety is at least 78, so these shares bound feasibility; they
do not forecast how much time model agents spend on survival.

## E. Density

Six people: Lin, Moss and Sol keep their ex13 identities, bodies, vitals and experience;
Kai, Wren and Ivo are new. Starts lie on a ring of radius 2.2 around (14, 15), between the
three ex13 starts, each moved to the nearest collision-free point; everyone sees at least
three others at round 0 and respawns at their start. The optional object that needs two
people to move was skipped: it would need a new joint-action mechanism in the kernel.

## F. Incentives

Only in `long-culture-incentives`. An environment hook of the authored package derives
interface-free evidence events from other people's real actions in the round, private to
the person concerned. Rules marked `derived` match them by event type; only this authored
foundation may install such rules.

| Source (name)                             | Evidence                                                                                                                                                                                        | Amount / cap | Hold / cooldown | Maintenance gain / decay / cap |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- | ------------------------------ |
| `answered` (Being answered or remembered) | Someone addresses you (message, gift, finding offer or acceptance, spoken words naming you, coming to your invitation) within 60 rounds of your own contact, or after 40 rounds without contact | 0.5 / 0.6    | 8 / 12          | 0.02 / 0.0015 / 0.4            |
| `two-way` (Two-way contact)               | You and another person each addressed the other at least twice within 120 rounds; once per pair per 60 rounds                                                                                   | 0.6 / 0.8    | 10 / 30         | 0.03 / 0.001 / 0.6             |
| `work-noticed` (Own work noticed)         | Another acting person first sees, or acts on, an object you made (signs excluded); once per person and object, again for use after 40 rounds                                                    | 0.5 / 0.6    | 8 / 16          | 0.02 / 0.0015 / 0.4            |

Each pair is acknowledged at most once per 12 rounds, several answers in one round form
one event, and the rewarded person's own naming, marking, telling, inviting, queries and
requests never qualify. Answered and two-way awards weigh with `closeness` like evidence
exchange. Bookkeeping lives in world state, which ordinary inputs never show.

## G. Food water representation

`foodWater` makes ex10's reviewed food moisture model (`open-preservation-physics.ts`)
available as a general representation that is not bound to ex10's drying tray, packages
or interfaces. It sets `state.foodWater = 1`, which ordinary inputs never show, and adds
no interface, event or rule. At genesis no food has a water composition and no object is a
food surface, so a round is identical with and without the flag. It exists for interfaces
developed later, such as air-drying food, which call the public API in
`packages/world-core/src/food-water.ts` after their own reach, ownership and cost checks:

| Function                                           | Effect                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `foodWaterInitialize(world, stack)`                | Gives food its water composition                                                        |
| `foodWaterSurfaceArea(world, surface, sample?)`    | Exposed area the surface offers now, or throws the reason                               |
| `foodWaterExpose(world, stack, surface, prepared)` | Lays an unowned stack at the surface's centre                                           |
| `foodWaterWithdraw(world, stack)`                  | Ends the exposure in place                                                              |
| `foodWaterRead(stack)`                             | Water fraction, mass ratio, exposed area, preparation, decay rate and last exchange row |

**Equations.** The environment runs ex10's per-tick exchange unchanged for every stack
with a composition: evaporation toward an equilibrium water content set by air humidity,
limited to 0.025 × area × a temperature factor, only for prepared food in a thin layer
(mass at most 0.2 per unit area); rain × area × 0.01 added unless indoors or under an open
refuge roof; decay multiplied by the opening damage and, for prepared food, by a
water-fraction factor between 0.15 and 1.5. Air humidity uses ex10's formula
(0.65 + 0.2 × rain − 0.1 × wind) for the exchange only, so the climate in ordinary inputs
gains no `airHumidity`. Ex10's food tenths and reference prefixes are not installed.

**Surfaces** (`{ kind: 'object', id }` or `{ kind: 'ground', x, y, area }`):

- An object marked `data.foodSurface === true` that is not an enclosure, with the area of
  its shape. It is obstructed by an overlapping solid, reserved or food-surface object
  (open refuges only shade it), wears 0.01 per drying round only when it carries
  `data.service`, is unusable at service 0, and shows ex10's `data.preservation` view
  while food lies on it.
- A circular ground footprint entirely inside the world, on firm ordinary ground (no
  water, shallow-water or wet-bank cell and waterlogging at most 0.1 at its centre and
  eight rim points, the rule of earlier ground drying sites), unobstructed in the same way.
- One sample per surface: another exposed sample, an overlapping footprint or other loose
  material on it gives area 0 until it is gone.
- Exposure lasts while the food lies there. Picking it up, giving or moving it, or its
  spoiling releases the surface. Withdrawal leaves the food in place, where it occupies
  the surface until someone takes it.

**Assumptions** (declared model choices, not measured knowledge):

- Berry and root water fractions are 0.85 and 0.75 (ex10's version-1 assumption); other
  foods are rejected rather than given an invented composition.
- There is no moisture transfer between soil and food; wet ground only excludes footprints.
- Unprepared whole food neither evaporates nor absorbs vapour, exactly as in ex10, but
  still receives rain on its exposed area.
- Preparation (opened and spread thin) is irreversible and carries ex10's persistent
  opening damage 1.1.
- As in ex10, the exposed area is the surface area, not the food's own spread, so callers
  should choose footprints that match the batch.
- Carried food keeps its composition and exchanges no water. Drying never sterilizes food
  or removes toxins.
- The exchange emits ex10's `preservation-progress` event for exposed food; a package
  that uses the representation declares it.

## Culture metrics

`pnpm metrics:culture` measures culture archives with deterministic rules; the full
definitions are in the [metric definitions](presentation/culture-baseline.md#metric-definitions).
Besides the measures above and gate G2, it reports the items below.

**Gate G2, revised after the fact (2026-11-25).** After reviewing ex16 and ex17, which both
failed the original gate, the user revised G2 to a group measure. The original gate (survival
share below 50% with `rest` counted as survival, and a symbolic action by every person) failed
a whole run on one solitary or silent person and counted idle rest as survival. The revised
gate passes when:

1. survival actor-rounds other than `rest` are below 50% of actor-rounds, with `rest` and
   `wait` reported apart as idle time;
2. at least half of the people make a successful symbolic action;
3. at least one name, saying or rule is adopted by another person who had received it.

The analyzer reports the original gate next to the revision. The
[metric definitions](presentation/culture-baseline.md#gate-g2-revised-after-the-fact) give
the adoption rules. The other measures are:

- **Sharing expressions:** sentences of spoken, sent or posted text and of plan notes and
  intentions that match keyword rules for five ideas about common resources: leave some for
  others, take only a modest share or what is needed, do not exhaust a source, share or pool,
  and coordinate a finite stock instead of competing for it or duplicating its collection.
  A **reuse** is a later expression of an idea by someone other than an earlier author, with
  the most similar earlier phrase and the earliest receipt of the idea (message, speech within
  the vision radius, council read or sign within sight) before the reuse was written. Spoken
  text is dated by the first round of the plan that wrote it. Cares and views get the same
  detection only in the private section.
- **Rest as a default**, by two criteria side by side, each with its own verdict per person
  and in total (default when at least half of the rests qualify): (1) the plan step has no
  energy condition or the energy cap cut the recorded recovery (within one rest of full
  energy); (2) the rest began, by exact replay, at or above 75% of the energy cap.
- **Survival share without rest:** survival actor-rounds other than `rest` over all
  actor-rounds, per person and in total, next to the survival share; **idle time** counts
  `rest` and `wait`.
- **Phrase propagation:** clauses another person had communicated that a later clause follows
  closely (at least four shared words in order, half of the shorter clause, two content
  words), written after receipt; propagations into spoken text are adopted sayings.
- **Invitations and attendance:** each invitation with the world's attendance record, the
  guests who arrived during the grace period and what was said there.
- **Works valued for their appearance despite a functional failure,** with acknowledgements
  by people who had received the statement.
- **Timeline:** names, rules, adoptions, invitations, attendance and works, each with its round
  and the call that produced the person's plan.

Term transmission counts sign texts seen within the vision radius (fix-log 7g). A sharing reuse
excludes the idea's first users (7h), and `heard` events and signs are not environment
vocabulary (8e).

### Model labels

`pnpm labels:culture` is a separate, model-assisted labeling pass for human verification. The
rule-based analyzer never calls it, and its `modelLabels` field stays null. The pass labels every
item of an archive with these categories; an item can have several or none:

- `naming`: a person names a place, thing, group or event;
- `name-adoption`: a person uses a name another person gave;
- `narrative`: a story or fictional narrative;
- `narrative-continuation`: someone extends or retells an earlier narrative;
- `norm`: a normative statement about how people should act;
- `norm-repetition`: a person repeats or endorses another person's norm;
- `invitation`;
- `valued-object`: an object valued for its appearance or meaning, not its function;
- `private-view`: a private view of another person;
- `absent-person`: remembering or mentioning a person who is not present, has died or has left.

The subcommands are:

1. `prepare experiment/exN [--from N] [--through N] [--out dir]` reads the archive with the
   culture-metrics reader and writes `items.json`. Items are speech (told texts, messages and
   public reports, with their hearers from `heard` events), names and marks (with what was named),
   invitations (place, meeting round and note; the spoken note is labeled once, here), works (each
   person-made object's creation, completion, status changes and first use by another person) and
   owner-only private view updates. Each item has an opaque id, the round, the person, the kind
   and the text; a separate local mapping gives its round, actor, call and event. The model input
   never contains the scenario tag, scope, experiment number, file paths, call ids or event ids.
   Items before `--from` are read-only context for a continuation. `prepare` prints the batches
   and an offline token estimate; it calls no model.
2. `label --out dir --ledger file --cap tokens --seed N` labels chronological batches (default 20
   items, `--batch`), each with the 4 preceding items as read-only context (`--context`) and a
   registry of the names, narratives and norms seen so far (id, first item, round, author and
   gist). Requests go to the same Responses endpoint, with the same headers and streaming, as
   `continuousProvider`, using a strict JSON schema; evidence is redacted the same way. A response
   is rejected unless it matches the schema and labels each batch id exactly once, every set field
   has its category, its evidence is a verbatim quote of the item, and every link names a known
   entry from another person. The ledger file is cumulative across runs and archives: each call
   counts its reported usage, or its reservation (request bytes, the output limit and 4,096) when
   none was reported, and a batch whose reservation would exceed `--cap` is not started. A rejected
   or failed call stops the run, and the next run sends that batch again as a new attempt. A
   completed batch is never resent. `--batches N` stops after N calls, and
   `--registry earlier/labels.json` seeds a continuation's registry from an earlier run.
3. When every item is labeled, `label` writes `labels.json` (labels and the final registry),
   `positives.json`, `negatives-sample.json` (20 items without a category, drawn with `--seed`),
   `timeline.md` (one row per positive with its round, call, person, categories, text and links)
   and `verification.json`, with an empty `verdict` (`agree`, `disagree` or `partial`) and
   `note` per positive and sampled negative. `timeline --out dir --seed N` rewrites these files;
   it refuses to replace a verification file holding verdicts unless `--force` is given.
4. `report --out dir [--json file]` computes agreement rates from the filled verification file:
   agreement (agree over verified entries) and lenient agreement (agree or partial), overall, for
   positives, for negatives and per category.

Outputs go to `docs/presentation/labels/<archive>-<from>-<through>/`, the default of `prepare`,
with the ledger in `docs/presentation/labels/ledger.json`. The archive checks accept only
numbered archives and paired companion analyses under `experiment/`, while presentation files are
checked only for format and links; every output is written Prettier-formatted. Each call is kept
in `calls/<batch>-<attempt>.json` with the redacted request, the response text, usage and ids,
not the event stream. Labels are unverified model output until the verification file is filled in.

## Excluded vocabulary

Nothing an ordinary agent can see contains _culture_, _cultural_, _belief_, _believe_,
_religion_, _religious_, _ritual_ or _social_ in any case or inflection: instructions,
packets, tendency keys, interface texts, event names, satisfaction names, rules and access
text. A test scans the instructions, the full serialized inputs of all six people and
their query results at round 0 and after symbolic actions. A development handoff in this
scope is rejected if its interfaces, events or satisfaction names use the vocabulary;
handler event descriptions cannot be checked statically. Agents' own words are not
filtered. The World Agent keeps its existing satisfaction-source policy text.

## Compatibility and limits

Ex7–ex13 requests and ex13 paused inputs are byte-identical (`pnpm compat:long`), and
the ex13 and long-fixes genesis tests pass unchanged. Reverting the culture fields of the
culture genesis recovers the long-fixes configuration, terrain, resources, authored
objects, abilities and rules; only the symbolic package, the 24 commons sources, the
`foodWater` state flag and the people (count, starts, memory, tendencies, knowledge and
mastery) differ. Ex10's tray rules, records and arithmetic are unchanged by the food
water representation, and old records gain no field.

- Names and marks do not follow items: a name or mark of a carried item stays where it
  was made, with the item id, when the item moves.
- Hearing ignores obstacles: everyone within the vision radius hears spoken words, even
  behind a solid object. Hearing does not interrupt plans unless `heard` is a chosen
  interrupt event.
- Pressure starts at round 300, so runs that end by round 250 observe only the mild
  period.
- Answers through interfaces developed later do not count as evidence for `answered`.
- Clustered starts make simultaneous conflicting gathers at one source more likely.
- Estimated ordinary inputs grow from about 5,200 tokens at round 0 to about 6,100 after a
  few symbolic actions (o200k estimate, below the 14,000 guard); this is not provider usage.
- No model-calling run has been made with this scenario.
