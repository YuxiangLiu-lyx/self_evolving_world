# Culture scenario

The opt-in culture scenario builds on the [long-fixes scenario](LONG_DEVELOPMENT.md#opt-in-run-fixes-and-the-long-fixes-scenario).
It keeps the ex13 rules and seed and changes the conditions under which people live
together: more people, less survival pressure, differing dispositions, a voice of their
own and simple symbolic means. The design principle is **give possibilities, not goals**:
it removes suppressors and provides carriers, and it never tells agents what to make,
say, value or believe in. No particular outcome is required; this is an exploratory
condition, not a causal comparison. See [ADR-0028](decisions/0028-culture-scenario.md).

| Command                                                     | Scenario tag         | Incentives |
| ----------------------------------------------------------- | -------------------- | ---------- |
| `pnpm experiment:continuous -- new long-culture`            | `culture`            | off        |
| `pnpm experiment:continuous -- new long-culture-incentives` | `culture-incentives` | on         |

Both variants have the same physical genesis; they differ only in the incentive switch,
its three satisfaction rules and their event names. Checkpoints are verified against the
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

`longDevelopment.transportRecovery: 'uncounted'` (absent in every earlier run): when a
pause is caused by an ordinary call that ended without any response but with recorded
transport evidence (for example `server_is_overloaded`), or by a proved abandoned
invocation, `repair exN` retains the pause under `technical-pauses/` and resumes the run
without a development handoff. The failed call is never resent and keeps its charge in
the ledger. Rejected model output, context and computation pauses still need a counted
handoff, and a second failure in the same round still pauses the run.

These numbers were checked against the measured E1 (ex14) rates; the derivation is in
[PR #29](https://github.com/YuxiangLiu-lyx/self_evolving_world/pull/29).

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
