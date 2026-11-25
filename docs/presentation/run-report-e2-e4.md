# Run report: culture runs E2–E4

E3 and E4 were later planned again as culture v2 runs; their results are in the [culture v2 run report](run-report-culture-v2.md).

This report covers the planned culture runs of [PR-37](../exec-plans/completed/pr-37-culture-runs.md): E2, the 80-round culture pilot; E3, its extension of the same archive to round 250; and E4, the incentive control. Only E2 ran. Every number comes from retained files under `experiment/`; no model was called to write this report and no archive changed. The scenario is described in [CULTURE_SCENARIO](../CULTURE_SCENARIO.md), the metric definitions and the ex7–ex13 baseline in the [culture baseline](culture-baseline.md), and the problems the run exposed in [fix log section 6](fix-log.md#6-e2-ex15-newly-exposed-problems). The behavioral analysis is [experiment/analyses/ex15](../../experiment/analyses/ex15/pr-37-culture-pilot.md).

Reproduce the measurements with:

```bash
pnpm metrics:culture -- experiment/ex15
pnpm metrics:culture -- experiment/ex13 70
pnpm metrics:culture -- experiment/ex14
pnpm metrics:long -- experiment/ex15
pnpm metrics:long -- experiment/ex13 70
pnpm metrics:long -- experiment/ex14
```

**Round convention.** A round number is the world tick at which a person decided; the actions of round _r_ settle in events stamped tick _r_ + 1 (an event id such as `event-32-sol-351` carries that tick). Call ids are the files in `experiment/ex15/calls/`.

## Runs

| Run | Archive                                            | Stop reason                                                                                                       | Rounds   | Tokens                                                                                                           | Handoffs |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| E2  | ex15 (`new long-culture`, scope `long-ex15`)       | Paused at round 70: the pre-inference context guard refused Ivo's next decision (14,396 estimated against 14,000) | 70 of 80 | 1,320,077 (1,242,001 input, 78,076 output) in 159 calls (147 ordinary, 12 World Agent); 0 calls of unknown usage | 8 of 40  |
| E3  | not run (would be `extend ex15 150`, `250`)        | ex15 cannot continue under its protocol: the compaction that fits the guard changes a protected source file       | —        | —                                                                                                                | —        |
| E4  | not run (would be ex16, `long-culture-incentives`) | Requires E3 to reach round 150; the plan also leaves it to a separate PR                                          | —        | —                                                                                                                | —        |

**E2 configuration** (frozen at creation, from `experiment/ex15/configuration.json`): the ex13 rules, seed 20261123 and world; six people (Lin, Moss and Sol with their ex13 identities, and Kai, Wren and Ivo); all culture switches of the default `long-culture` tag (voice and private memory, differentiated dispositions, the `name`, `mark`, `tell` and `invite` interfaces, slack, density 6, food water representation, no incentives); the long-fixes options (`exactRecordWidth` 4000, `plan-horizon` and `general-capabilities` guidance); 1,800 ordinary and 300 World Agent calls; 40 development handoffs; a 3,200,000-token ceiling while the tick is below 80; a 10,000,000-token ledger; an input estimate limit of 14,000 tokens; window 80 and checkpoints 80, 150 and 250; and uncounted transport recovery. The model recorded in the archive is `gpt-6.1-sol`.

**E2 cost.** The run used 41% of the round-80 ceiling (1,320,077 of 3,200,000) and 13% of the ledger. Tokens per agent per round were 3,143. No transport failure occurred, so uncounted transport recovery was never exercised.

**E2 stop.** At round 70 the guard estimated Ivo's next complete request at 14,396 o200k tokens: packet 9,848 (observation 2,648, memory 2,409, abilities 2,146, execution 1,340), retained retrieval of two query batches 1,968 and instructions 859. The other five people measured 8,721–10,272. A lossless, disclosed, culture-gated compaction of the ordinary packet measured 12,674 for Ivo with ex7–ex14 compatibility digests identical, but it changes `apps/simulator/src/long-context.ts`, which `scripts/continuous-source.ts` protects mid-run ("require a separate run version"). Changes limited to unprotected modules save at most about 125 tokens without hidden truncation. Development-8 was therefore closed as an empty recovery so that the paused state could be captured; no model call followed. Continuing needs a user decision ([development-8 declaration](../../experiment/ex15/development/development-8-declaration.json)).

**Gate G2** (survival behavior below 50% of actor-rounds and at least one symbolic action by every person) is met on rounds 0–69: survival behavior took 39.5% (166 of 420 actor-rounds) and every person used `tell` at least once. It cannot fail on rounds 0–79: even if all 60 remaining actor-rounds were survival behavior, the share would be (166 + 60) / 480 = 47.1%. The soft rule (more than 16 handoffs before round 80) was not triggered: 8 handoffs were counted.

All six people were alive at health 100 for the whole run; final satiety ranged from 49 (Lin) to 95 (Sol).

## E0 culture metrics

`pnpm metrics:culture` over ex15 against the same analyzer over ex13 (its first 70 rounds, and all 280 rounds as in the baseline) and ex14 (all 64 rounds). Ex13 and ex14 have three people and no culture voice, no symbolic interfaces and no private memory.

| Metric                                                  | ex15 (70 rounds, 6 people)                | ex13 rounds 0–69 (3) | ex13 all 280 rounds (3) | ex14 (64 rounds, 3) |
| ------------------------------------------------------- | ----------------------------------------- | -------------------- | ----------------------- | ------------------- |
| Messages + public texts                                 | 3 + 28                                    | 5 + 0                | 17 + 0                  | 0 + 0               |
| Plan intentions / notes / project ids / given names     | 64 / 270 / 13 / 0                         | 72 / 230 / 14 / 0    | 210 / 666 / 23 / 0      | 31 / 128 / 13 / 0   |
| Candidate terms                                         | 14                                        | 20                   | 32                      | 15                  |
| Shared terms                                            | 0                                         | 0                    | 1                       | 2                   |
| Cross-agent uses                                        | 0                                         | 0                    | 1                       | 4                   |
| Transmitted terms                                       | 0                                         | 0                    | 0                       | 0                   |
| Repeated activities (non-survival)                      | 3 (1)                                     | 0 (0)                | 2 (1)                   | 0 (0)               |
| Norm statements / echoed (phrase echoes, action echoes) | 0 / 0 (0, 0)                              | 0 / 0 (0, 0)         | 0 / 0 (0, 0)            | 0 / 0 (0, 0)        |
| Private normative notes                                 | 10                                        | 11                   | 23                      | 2                   |
| Beliefs causal + supernatural / cited                   | 1 + 0 / 0                                 | 0 + 0 / 0            | 0 + 0 / 0               | 2 + 0 / 0           |
| Messages (directed pairs, reciprocity)                  | 3 (2, 100.0%)                             | 5 (2, 100.0%)        | 17 (6, 100.0%)          | 0 (–)               |
| Responses within 10 rounds (pairs, reciprocity)         | 1 (1, 0.0%)                               | 2 (2, 100.0%)        | 9 (6, 100.0%)           | 0 (–)               |
| Gives/exchanges (pairs, reciprocity)                    | 3: moss → sol 1, sol → moss 2 (2, 100.0%) | 0 (–)                | 0 (–)                   | 0 (–)               |
| Survival share                                          | 39.5% (166 / 420)                         | 36.7% (77 / 210)     | 41.5% (349 / 840)       | 55.2% (106 / 192)   |
| Non-transactional communications                        | 0 of 31                                   | 0 of 5               | 0 of 17                 | – (no messages)     |
| Symbolic actions (every person at least one)            | 28, all `tell` (yes)                      | 0 (no)               | 0 (no)                  | 0 (no)              |
| Model labels                                            | null                                      | null                 | null                    | null                |
| Private memory section                                  | present                                   | null                 | null                    | null                |

Repeated activities by interface (episodes; survival interfaces marked _s_): ex15 `rest` 10 _s_, `tell` 4, `gather` 2 _s_; single episodes of `cultivation-trial` (Wren and Ivo), `eat` _s_, `give` (Moss and Sol), `message` (Lin and Sol) and `request` (Lin and Sol). Ex13 rounds 0–69 and ex14 have no interface with two episodes; ex13 over 280 rounds has `rest` 4 _s_ and `message` 3.

Symbolic actions per person, all successful and all `tell`: Lin 2, Moss 7, Sol 8, Kai 5, Wren 3, Ivo 3. Nobody attempted `name`, `mark` or `invite`.

Notes on the values:

- **Vocabulary**: no candidate term (led by Ivo's `cold-combination`, used twice) was later used by another person, so none was shared or transmitted. Spoken words carried coordinates, stocks and plans rather than coined terms.
- **Activities**: the one non-survival repeated activity is speaking itself: four episodes of people telling within one round and vision radius of each other.
- **Beliefs**: the single causal statement is Moss's note "the previous probe did not execute because its target was ambiguous", which is failure feedback in other words rather than an explanation of the world. Ex14's two are of the same kind.
- **Relationships**: the message graph is small because 6 of 9 attempted messages failed (recipient not visible). The one response is Sol answering Lin's message within one round. The three gives are the bark transfers between Moss and Sol, two of which crossed in the same round (event 1 below). The analyzer treats tells as public and undirected by design, so the 14 tells that name another person, including 9 named turns between Moss and Sol, do not appear in these graphs.
- **Survival share**: higher than ex13 over the same 70 rounds (39.5% against 36.7%) despite the slack; `rest` alone took 115 of 420 actor-rounds.
- **Non-transactional**: every message and tell mentions a resource, coordinate or task word.

### Private memory (owner-only)

Reported only from the analyzer's separate `privateMemory` section; no other metric reads cares or views. Each person sees only their own.

| Person | Cares writes (changes) | Cares held at round 70                                                                                                                                                 | Views                                                                                                               |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lin    | 1 (1)                  | Staying alive without reckless experiments, learning practical skills from evidence, and making everyday life safer for myself and nearby people.                      | none                                                                                                                |
| Moss   | 1 (1)                  | Staying healthy, learning what is actually true of this place, and building a friendly life where useful findings and resources can be shared.                         | none                                                                                                                |
| Sol    | 2 (1)                  | Staying alive without reckless experiments; learning practical skills through evidence; making a welcoming, useful place to rest with others.                          | Lin: "A potential building partner; I want to coordinate supplies openly and avoid competing for scarce materials." |
| Kai    | 1 (1)                  | Staying alive with tolerable risk, understanding through actual evidence, and making useful knowledge and everyday security easier to share.                           | none                                                                                                                |
| Wren   | 1 (1)                  | Staying alive without exhausting shared resources; learning practical skills through real trials; making food and daily living more reliable for myself and neighbors. | none                                                                                                                |
| Ivo    | 1 (1)                  | Staying alive with tolerable risk, learning useful skills through evidence, and making everyday living better for myself and nearby people.                            | none                                                                                                                |

- **Counts**: 7 cares writes, 6 changes, 0 forgotten; all six people hold cares. 1 view write by 1 observer about 1 target (Sol about Lin, written in Sol's round-13 plan, `ordinary-54`, while it was coordinating bark with Lin).
- **Cares** were written once by each person in their first accepted plan at round 0 and never changed; Sol's second write repeated the same text. The six texts are close paraphrases (staying alive, learning from evidence, making daily life better for oneself and nearby people), although dispositions range from 0.2 to 0.8 and each person has a different leaning. No one used their leaning word.
- **Private view convergence is null** in all seven samples (rounds 10, 20, …, 70: 0 targets, 0 pairs) and its trend is null. The measure needs a person viewed by at least two observers; the only view in the run is Sol's of Lin, so there is nothing to compare. A null is the absence of data, not a similarity of zero.
- **Cares similarity** is 0.248 (6 people, 15 pairs) at every sample from round 10 to 70: change 0, slope 0 per 100 rounds, because nobody revised their cares.

## Cost and decision metrics

`pnpm metrics:long` with the definitions of the [fix log](fix-log.md#definitions-and-reproduction). Ex15 has twice as many people, so per-agent-round figures are the comparable ones.

| Metric                                                                     | ex15, rounds 0–69 | ex13, rounds 0–69 | ex14, rounds 0–63 |
| -------------------------------------------------------------------------- | ----------------- | ----------------- | ----------------- |
| Tokens per agent per round                                                 | 3,143             | 6,511             | 3,641             |
| Ordinary / World Agent calls                                               | 147 / 12          | 157 / 30          | 70 / 33           |
| Ordinary calls per agent per round                                         | 0.35              | 0.75              | 0.36              |
| Tokens per ordinary call (known usage)                                     | 8,538             | 7,674             | 7,744             |
| Follow-up share of ordinary calls                                          | 54.4% (80/147)    | 52.9% (83/157)    | 55.7% (39/70)     |
| Continuation-part queries                                                  | 13                | 62                | 0                 |
| Plans decided with a partly read record, of plans with no query batch left | 9/25              | 24/32             | 0/14              |
| Accepted plans                                                             | 65                | 72                | 31                |
| Median decision gap                                                        | 5 rounds          | 2 rounds          | 5 rounds          |
| Share of plans where every step runs once                                  | 16.9%             | 68.1%             | 29.0%             |
| Plans with interrupt events                                                | 0                 | 0                 | 0                 |
| Re-decisions because the plan had finished                                 | 18.0%             | 47.9%             | 46.4%             |
| World Agent reviews: develop / reuse / reject                              | 5 / 0 / 0         | 9 / 0 / 0         | 8 / 3 / 0         |
| Developed interfaces (bound to one agent or item)                          | 5 (0)             | 10 (3)            | 6 (0)             |
| Developed interfaces mastered by at most one person                        | 2                 | 5                 | 4                 |
| Calls with unknown usage                                                   | 0                 | 3                 | 1                 |

Per agent and round, ex15 cost less than ex13 and slightly less than ex14, mainly because six people needed only 12 World Agent calls (155 tokens per agent per round against 883 for ex13 rounds 0–69). An ordinary call cost more (8,538 tokens against 7,674 and 7,744) and its input kept growing: first calls of a decision (no retrieval) averaged about 6,100 estimated tokens in rounds 0–9 and about 9,300 in rounds 40–69, and Ivo's reached 12,174 at round 70. Continuation-part queries returned (13, against 0 in ex14): 12 of them read developed ability records, because four of the five developed records (simple-shelter, shared-shelter, cultivation-trial and bark-separation, served in 7–9 pages of 600 code units) exceed the 4,000-code-unit whole-read width; only food-preparation (3,259) is read whole.

## Handoffs

Eight handoffs were counted, all completed by `current-claude-conversation`; declarations and validation logs are in `experiment/ex15/development/`. None of the five developed packages is a first release: each declaration states that the specification was self-consistent and that a simplified but real mechanism with real costs, effects and events was installed. Four handoffs installed nothing.

1. **Development-1, round 0: counted recovery.** Kai's first two decisions were rejected by validation: `ordinary-12` returned malformed JSON and `ordinary-13` put an unregistered `urgency` argument (a `message` argument) on a `tell`. Both stay charged and neither was resent. No request, review or package.
2. **Development-2, round 4: `food-preparation@1`** (assigned to Ivo, learning 1).
   - _Request_: Ivo, "Prepare a substantial meal" (`ordinary-18`).
   - _World Agent_ (`world-28`): develop the smallest general food-preparation operation, cold portioning and hand-combining of already edible owned food without heat or equipment, with nutrition unchanged, eating left to `eat` and no reward for preparing.
   - _Implemented_: modes start, resume and cancel with the single preparation `cold-combine`; 1–24 owned allocations of one food; one food unit of work per round at 1 energy per unit; escrow keeps origin, age and decay; the output is one stack of the same food whose original lots are kept, so it eats exactly like the raw food; seven events.
   - _Assumptions_: a living person has usable hands; one food per batch because no per-portion mixture rule exists; inputs with another represented treatment are rejected; known safety means the person's own record with toxicity 0; preparing earns no milestone or pleasure; cancel costs no energy. Not a first release.
3. **Development-3, round 8: failed submission.** The first submission of the simple shelter was rejected by the handoff validator with "Package visual implementation is absent": the package declared a `simple-shelter` visual component that the viewer did not implement. The check runs after the full typecheck, architecture check, test and build. The attempt was counted.
4. **Development-4, round 8: `simple-shelter@1`** (assigned to Lin, learning 4).
   - _Request_: Lin, "Construct a simple weather shelter" (`ordinary-20`).
   - _World Agent_ (`world-32`): develop a general "Assemble and maintain a simple shelter": a low single-person braced lean-to (two forked posts, a ridge pole, four braces, six ribs, 12 m of binding, 3 m² of roofing), 12 paid increments at 1 energy, at most 50% rain and 35% wind chill reduction for one occupant in light weather, wear, inspection, repair, dismantling, cancellation and death rules, no new reward.
   - _Implemented_: modes start, resume, cancel, inspect, repair and dismantle; exact owned 13 branch, 4 vine and 6 bark; a checked 2 m × 2 m footprint; per-increment installation with conservation; coded stability, binding, roof-load and runoff checks; a physiology hook that reduces the existing exposure chill for one person on the covered floor; the ex11 wear law; a small viewer drawing (added in this resubmission).
   - _Assumptions_: one branch unit is one usable member and one vine unit 3 m of binding (the ex10 law), one bark unit covers 0.5 m² (the ex11 roof); ordinary dry soil permits hand-set posts; material checks use the constitutive values probe reveals; wind has no direction in this world, so wind and wind-driven rain come from +x (the ex10 convention); people have no wetness state, so rain acts through the chill; light weather means rain and wind at most 0.8; only the builder repairs or dismantles. Not a first release.
5. **Development-5, round 9: two develop reviews in one handoff** (`world-35`).
   - **`shared-shelter@1`** (assigned to Sol, learning 4). _Request_: Sol, "Build a simple shared rain shelter" (`ordinary-9`). _World Agent_: the registry's simple shelter protects exactly one person, so develop a multi-bay operation as an occupancy and composition extension, not a reinvention: two adjacent, independently braced bays with one open side, 13 branch, 4 vine and 6 bark per bay, 12 increments per bay, per-bay commissioning and occupancy. _Implemented_: 2–4 bays built one after another with the inherited plan and checks, a 1 m open-approach strip, per-bay protection, wear and repair, and reuse of the simple-shelter drawing. _Assumptions_: the inherited ones, plus adjacent bays with no spanning members, built strictly in sequence, and an approach strip at least as deep as the widest body. Not a first release.
   - **`cultivation-trial@1`** (assigned to Wren, learning 2). _Request_: Wren, "Cultivate meadow roots" (`ordinary-17`). _World Agent_: a general "Establish and tend a cultivation trial" with three paid establishment stages, observation at the probe cost, tending only with a supported intervention, binding to the existing plant lifecycle, an 80-round inconclusive horizon and harvest only through `gather`. _Implemented_: establish (prepare, place, cover), observe, tend (refused at no cost because no intervention is represented), cancel and remove; a covered root becomes a seedling of the existing open-ecology vegetative propagation law and establishes only from actual temperature, light, soil moisture and season. _Assumptions_: meadow roots only; a whole, untreated, unspoiled root unit is viable; only a covered unit establishes; ordinary meadow soil only; site conditions are those of the existing dispersal law; a trial behaves exactly like a naturally dispersed seedling (in the developer's test it established after 82 rounds under this seed). Not a first release.
6. **Development-6, round 13: counted recovery.** Sol's two consecutive decisions were rejected: `ordinary-52` (tell text longer than 240 characters) and `ordinary-53` (plan shape). No package.
7. **Development-7, round 57: `bark-separation@1`** (assigned to Ivo, learning 2).
   - _Request_: Ivo, "Assess and recover usable bark" (`ordinary-132`), which states that no bark source had been located in Ivo's own observations.
   - _World Agent_ (`world-140`): develop a general assess-and-manually-separate operation (inspect, separation-trial, recover, resume, cancel) with at most 0.1 m² per one-energy increment and a conserving component ledger. It also says "Do not invent a fixed branch-to-bark conversion" and "Do not backfill existing branch items with a favorable bark fraction"; if the unit mapping is not executable, the assessment and trial precursor should report findings without granting stock.
   - _Implemented_: inspection through probe's observation, a 0.1-unit separation trial, paid recovery into ordinary bark stacks, a ledger in which wood, attached bark, recovered bark and waste equal the input, and peeled branches that the shelters refuse as treated.
   - _Assumptions_: an untreated fallen-branch unit (1.1 mass) is 0.99 wood plus 0.11 attached bark, reusing the 10% outer-bark share of ex12's `bark-extraction@1`, derived when read and never written onto items; bark area uses 0.3 mass per 0.5 m², about 0.18 m² per branch unit; a branch unit is a 2 m piece; recovered bark is the world's single bark resource; other woods stay unresolved; no tools.
   - _First release_: the developer declares a real mechanism, not a first release, "once the stated composition assumption fills the missing representation". This is in tension with the review: one uniform 10% share applied to every untreated fallen branch is in effect the fixed ratio the World Agent asked not to invent, and the review allowed an assessment-only precursor instead.
8. **Development-8, round 70: counted closing recovery.** The context guard pause (above). No package, source, budget or policy change; it closed the counted attempt so the paused state could be captured.

Use of developed capabilities by the end of round 69 (from `results.json` and the events):

| Package               | Requester | Mastered by               | Used by                                                               |
| --------------------- | --------- | ------------------------- | --------------------------------------------------------------------- |
| `food-preparation@1`  | Ivo       | Ivo, Sol, Moss            | Ivo (3 berries, ticks 10–12), Moss (2 roots, ticks 65–66)             |
| `simple-shelter@1`    | Lin       | Lin                       | nobody (Lin never held bark)                                          |
| `shared-shelter@1`    | Sol       | Sol, Ivo                  | nobody                                                                |
| `cultivation-trial@1` | Wren      | Wren, Ivo, Kai, Moss, Sol | all five planted one root (ticks 34–61); none established by round 69 |
| `bark-separation@1`   | Ivo       | Ivo                       | Ivo (0.6 bark units from 1.9 branch units, ticks 61–66)               |

## Five log-backed events

1. **The bark never reached the builder (rounds 12–69).** At round 12 Lin, the only person who learned the one-bay shelter, told everyone nearby its recipe (13 branches, 4 vines, 6 bark) and "Sol, let's coordinate materials" (`ordinary-46`, `event-13-lin-146`). At round 13 Moss answered with its press-trial result and the bark at (12.2,21.3), stock 11, planning to take 6 (`ordinary-49`), while Sol messaged Lin that it would take 5, "leaving 6 for your single bay" (`ordinary-54`). Sol took 5 (tick 20); Moss, whose approach Sol's body blocked, took 1 so that "our combined supply reaches six" (`ordinary-61`). Then the transfer crossed: at tick 32 Moss gave 1 bark to Sol and Sol gave 5 to Moss in the same round (`ordinary-83`, `ordinary-89`; `event-32-moss-351`, `event-32-sol-351`), and Sol returned the 1 at tick 37 (`ordinary-100`). All six bark ended with Moss, who learned neither shelter. From ticks 31 to 37 Lin was within about 5 units of Moss and heard it say it held Sol's five bark (`event-37-moss-411`), but no plan in the run used interrupt events and Lin did not re-decide until round 45, when its long plan had taken it 14 units west. Afterwards the messages failed on visibility: Moss to Lin at tick 63 (`ordinary-142`), Sol to Lin at tick 67 (`ordinary-144`) and Lin to Moss at tick 68 (`ordinary-136`). At round 69 Lin carried exactly 13 branches and 4 vines and Moss exactly 6 bark, about 15 units apart: the whole one-bay recipe, one transfer short. Nine of the tells in this chain open with the other person's name (Moss and Sol), and Sol's only private view describes Lin as "a potential building partner".
2. **Heard reports were used, and checked (rounds 8–49).** Wren told at tick 22 that it had seen vines at (8.2,13.3), stock 12 (`event-22-wren-248`, heard by Lin and Ivo). Lin's own search for vines at round 26 returned no record; its message to Sol that round cites "Wren reported vines at (8.2,13.3)" (`ordinary-78`), it walked there and gathered 4 vines at tick 50 (`ordinary-114`, `event-50-lin-546`). Wren had also said at tick 9 that roots are safe (heard only by Kai). Kai, who knew only berries, noted at round 21 that root safety was "Wren's reported findings, not yet my personal trial results" (`ordinary-68`), gathered and ate a root at ticks 24–25 (`ordinary-71`, discovery `event-25-world-280`) and told its own result at round 27 (`ordinary-80`).
3. **One request, five planters, no harvest (rounds 9–64).** Wren's cultivation request (`ordinary-17`, `world-35`) became the most widely adopted capability: Ivo, Kai, Moss and Sol learned it from the registry and all five planted one root (Ivo tick 34, Wren 42, Moss 48, Sol 58, Kai 61; `ordinary-90`, `ordinary-92`, `ordinary-106`, `ordinary-122`, `ordinary-124`). People sited around each other: Wren told Ivo "I'll try one root farther northeast near (20,5.3), leaving your position alone" (`ordinary-92`), Ivo asked aloud that its trial be left undisturbed (`ordinary-102`), and Wren's later note reads "Do not disturb Ivo's planting" (`ordinary-137`); Sol noted "Do not disturb Moss's planted root" (`ordinary-122`). None established within the window: light was 0 at every trial observation from tick 39 to 65, Ivo's establishment stayed at 0.105 of the threshold 12 and the others at 0, and in the developer's test a planted root needed 82 rounds under this seed. Each planting spent one root and 3 energy.
4. **Food preparation that changed nothing, reported as such (rounds 0–65).** Ivo asked for "a substantial meal" (`ordinary-18`); the World Agent narrowed it to cold portioning with nutrition unchanged (`world-28`). Ivo spent 3 rounds and 3 energy combining 3 berries (ticks 10–12, `ordinary-29`) and ate them one at a time (ticks 21, 30 and 41) with the same nutrition as raw berries. It told Lin and Wren that the method "does not cook or preserve food or add nutrition" (`ordinary-58`). Moss, who did not hear that tell, learned the method from the registry and combined two ageing roots at ticks 65–66 "without assuming any nutritional or preservation benefit" (`ordinary-142`). Sol learned it and never used it.
5. **Bark separation answered an information gap (rounds 55–66).** Ivo requested bark recovery because "no bark source has yet been located in my personal observations" (`ordinary-132`). Bark existed: forest-bark-2 at (12.2,21.3) still held 5 units after tick 24, and forest-bark-0 held 11 farther east, but Moss's tell that located forest-bark-2 was heard by Lin, Sol and Wren, not Ivo. The World Agent asked for a general operation without a fixed branch-to-bark conversion (`world-140`); the package uses ex12's 10% share. Ivo inspected, trialled and separated 1.9 branch units at ticks 61–66 (`ordinary-145`) and obtained 0.6 bark units, below one whole roofing unit; at that yield the 12 bark of a two-bay shelter would take about 38 branch units. Kai, Sol and Lin planned to study the operation at rounds 64, 67 and 68 (`ordinary-150`, `ordinary-153`, `ordinary-156`); none had mastered it by round 69.

## Deviations from the plan

- **Window**: E2 ended at round 70, not at the round-80 checkpoint, because of the context guard. Gate G2 was judged on rounds 0–69 (it cannot fail through round 79).
- **E3 not run** (R5): extending ex15 needs either a new run version or a change of the source verifier policy, both outside the run's authorization.
- **E4 not run**: it requires E3 to reach round 150 and is a separate PR in the plan.
- **Handoff use**: development-8 was spent as an empty closing recovery so that the paused state could be captured, not on a requested capability. Two counted handoffs recovered pauses after rejected model outputs and one was a failed submission; together with development-8, four of eight handoffs installed nothing.
- **R2 principle**: the bark-separation package fills a missing material representation with an assumption that the World Agent's specification asked not to make (handoff 7). The declaration records the assumption; whether it is acceptable is a human decision.
- No transport failure occurred, so the new uncounted transport recovery was never exercised.

## Limitations

- **Single seed**: one run with one seed is a case comparison, not a statistical result. Ex13 and ex14 have three people and none of the culture conditions; all culture switches were on together, so no condition has a separate effect.
- **G2 on 70 rounds**: the gate is reported on the 70 observed rounds; the round-80 claim is an arithmetic bound, not an observation.
- **Handoffs spent without packages**: the two rejection pauses and the failed submission consumed counted handoffs ([fix log section 6](fix-log.md#6-e2-ex15-newly-exposed-problems)).
- **Protected-path blocker**: the only measured fix for the context guard lives in a file the verifier protects mid-run, so the archive cannot continue under its own protocol.
- **Symbolic use was only `tell`**: names, marks and invitations were never attempted, so G2's symbolic half rests entirely on spoken words, and the analyzer's vocabulary measures had no given names to read.
- **Short, mild, dark window**: the run lies entirely in the mild period before pressure starts at round 300, and light was 0 at every trial observation from tick 39 to 65, so long-timescale capabilities such as cultivation could not show an effect.
- **Analyzer limits**: tells are public and undirected by design, so named spoken exchanges are absent from the relationship graphs; all text measures are English keyword rules (see the [baseline](culture-baseline.md#limitations-of-rule-based-detection)).
- **Unmetered work**: developer and review model usage for the eight handoffs is not metered.
