# Culture program summary: experiments A–D

This page closes the user's culture program, four experiments run from 2026-11-26 to 2026-11-28 ([plan](../exec-plans/completed/pr-47-summary-a-d.md)).

- **Sources:** every statement comes from the merged run reports, the agent-verified labels and the retained archives.
- **Model:** every run called gpt-6.1-sol through the existing ChatGPT channel.
- **Scope:** each experiment is one small set of runs; the page describes what happened and does not generalize.

## Experiment A: the cold season arrives (ex16, rounds 250–400)

[Run report](run-report-a-winter.md), PR #37.

- **Question.** How do six people with an established way of life respond when survival pressure begins?
- **Setup.** ex16, the culture v2 main run, continued from round 250 to round 400. The scenario's pressure starts at tick 300 and reaches full intensity only at tick 440.
- **Conclusion.** By round 400 the pressure had not made life harder. What changed was the people: they spread out, stopped talking and pursued private projects.
- **Numbers.**
  - 150 rounds and 188 calls; 2,044,361 tokens of a 3,500,000 cap.
  - 6 counted handoffs, all Wren's cord and lashing work.
  - All six alive at health 100 throughout.
  - Labels of ex16 rounds 1–400: 76 items, agent-verified agreement 85.7%.
- **Moments.**
  - Tick 373, Sol (`ordinary-508`): "Sol named this place "The Little Apple Pause"." It was the only name in 400 rounds, given alone, and nobody heard or used it.
  - Tick 383, Kai after entering a cave (`ordinary-517`): "no additional shelter effect has been established." It was the only response to the cooling.
- **Limitations.**
  - The window ended before full pressure (tick 440) and before a real winter; fix-log 10b proposes extending to round 600 or more.
  - Two `fetch failed` pauses were closed by empty handoffs.

## Experiment B: goal sentence pairs (ex19–ex24, rounds 1–80)

[Run report](run-report-b-goal-pairs.md), PR #38.

- **Question.** Does the goal sentence change what people build together, and how much does the answer depend on the seed?
- **Setup.** Three new seeds (20261201–20261203), each run twice:
  - the old-goal arm, with ex15's goal sentence: ex19, ex21 and ex23;
  - the open-goal arm, with culture v2's open goal and leaning sentence: ex20, ex22 and ex24.

  Each run lasted 80 rounds, with 8 handoffs and 1,500,000 tokens. Seven measures were pre-registered.

- **Conclusion.** In all three pairs the open-goal run was at least as high as its old-goal partner on every measure, and higher on three or four of them. The old-goal runs produced no verified name, story, norm repetition, attended invitation or valued object.
- **Numbers.**
  - 7,064,562 tokens and 22 counted handoffs.
  - Of 24 pair comparisons, the open-goal run was higher in 11, the old-goal run in 0, and 13 were ties at 0–0.
  - ex19 stopped at round 76 on its token budget, and ex21 at round 44 on the rejection stop.
  - Agent-verified label agreement per run ranged from 89.2% to 100%.
- **Moments.**
  - ex24, tick 70, Moss (`ordinary-129`): "A tiny invented story: a lantern tired of showing the way, so its friends sat beside it until dawn." Kai continued it at tick 73 (`ordinary-137`), then Sol.
  - ex22, tick 9, Sol (`ordinary-9`): "Sol named Red berries "The Red Thread"." Kai took up the name at tick 21 (`ordinary-50`).
- **Limitations.**
  - Most comparisons are ties at zero, and each non-zero count comes from one episode in one run.
  - Measure 4 is partly built into the open-goal prompt.
  - Three pairs support no statistical test.

## Experiment C: newcomers in an existing group (ex25, rounds 120–220)

[Run report](run-report-c-newcomers.md), PR #39.

- **Question.** Do newcomers pick up a group's names, tales and norms?
- **Setup.** ex18's world was imported at round 120 with its six residents and their memories. Two newcomers without memory were added, Tova (curiosity) and Bram (calm), and the run continued for 100 rounds with incentives off. The residents had named their clearing "The Berry Lantern" on a sign and told a lantern tale among themselves.
- **Conclusion.** Bram continued the residents' lantern tale after hearing it. Neither newcomer used the group's name or repeated a resident norm. Tova never received a resident's telling, because her heard list keeps only six entries.
- **Numbers.**
  - 100 rounds and 233 calls; 2,137,045 tokens of 2,500,000.
  - 5 counted handoffs; all eight people alive.
  - Agent-verified agreement 97.7% (ex18 rounds 1–120) and 93.9% (ex25).
- **Moments.**
  - Tick 190, Bram (`ordinary-143`): "An invented sequel: beside the lantern, the traveler found a bench. 'Where does this road lead?' 'For now,' said the keeper, 'to somewhere you can sit.'" It is the only continuation by a newcomer.
  - Tick 196, Moss (`ordinary-167`) wrote the only resident view of a newcomer: "A neighbor whose imagined bench beside the lantern feels welcoming to me."
- **Limitations.**
  - One run.
  - The heard-list cap made the two newcomers' exposures unequal.
  - The plan's norm phrase came from ex16, not ex18.

## Experiment D: two separated groups (ex26, rounds 1–162)

[Run report](run-report-d-villages.md), PR #40.

- **Question.** What do two separately formed groups do when hunger brings them together: names, norms and competition for food?
- **Setup.** Two groups of three started 111.6 units apart on a 144 × 36 map, each with food for about 80–100 rounds, and a richer middle food area lay between them. Nothing in any input mentioned the other group. The plan was 200 rounds with 16 handoffs and 3,000,000 tokens.
- **Conclusion.** The groups never met: the closest approach was 49.6 units, and the middle area was never reached. Each group's few names and norms stayed within it, and the two people who knew only berries starved.
- **Numbers.**
  - 162 rounds and 287 calls; 2,105,707 tokens.
  - 8 counted handoffs, one lost to the lead's merge oversight.
  - The run stopped for review after three consecutive rejected outputs, which was not bypassed.
  - The separation held for rounds 1–60 (at least 102.8 units apart), and nobody moved faster than 0.8 per round.
  - Agent-verified agreement 96.7%.
- **Moments.**
  - Tick 25, Sol (`ordinary-70`): "Berryglow Clearing", the only name; nobody else used it.
  - Tick 162, Kai to Wren (`ordinary-276`): "Urgent: I am starving, health 28 and falling by 8 each round, with no food." Wren carried none.
- **Limitations.**
  - No contact occurred, so the questions about names, norms and food across the groups remain unanswered.
  - A false first-step guard ends a plan, which caused the stop (fix-log 13c).
  - `tend-rooted-plants@1` could only inspect.

## Recurring imagery across independent runs

**What was counted.** `scripts/culture-metrics-imagery.ts` reads the spoken, sent and named text of ex15–ex26 (speech, private messages and names, not private notes) and writes [`imagery-a-d.json`](imagery-a-d.json). It counts:

- a declared list of images and phrases;
- every word of five letters or more that the run's own world and prompt text does not contain.

**Independence.** Runs that share no transcript are independent: the twelve runs form eleven lineages, because ex25 was imported from ex18 and belongs to its lineage. They use four seeds:

- 20261123 for ex15–ex18, ex25 and ex26;
- 20261201–20261203 for the B pairs.

The motif list was declared after reading the runs, so it is descriptive, not pre-registered.

| Image or phrase | Independent lineages                      | Seeds | Uses (speakers) | First use                                |
| --------------- | ----------------------------------------- | ----: | --------------: | ---------------------------------------- |
| quiet company   | 5: ex16, ex17, ex18 (in ex25), ex20, ex24 |     3 |         33 (13) | ex16, tick 20, Kai                       |
| no obligation   | 3: ex16, ex18, ex24                       |     2 |           8 (7) | ex16, tick 116, Sol                      |
| no hurry        | 3: ex16, ex17, ex24                       |     2 |           5 (5) | ex16, tick 195, Ivo                      |
| lantern         | 2: ex18, ex24                             |     2 |         22 (12) | ex18, tick 10, Sol ("The Berry Lantern") |
| garden          | 2: ex17, ex20                             |     2 |           2 (2) | ex17, tick 39, Sol                       |
| silence         | 2: ex16, ex18                             |     1 |           4 (4) | ex16, tick 204, Moss                     |
| traveler        | 1: ex18 (also ex25)                       |     1 |           8 (5) | ex18, tick 109, Moss                     |
| song or tune    | 1: ex18 (also ex25)                       |     1 |           8 (5) | ex18, tick 117, Kai                      |
| keeper          | 1: ex18 (in ex25)                         |     1 |           3 (3) | ex25, tick 184, Kai                      |
| beyond supplies | 1: ex26                                   |     1 |           4 (3) | ex26, tick 23, Kai                       |
| thread          | 1: ex22                                   |     1 |           3 (2) | ex22, tick 9, Sol ("The Red Thread")     |
| dawn            | 1: ex24                                   |     1 |           3 (3) | ex24, tick 70, Moss                      |
| no pressure     | 1: ex18                                   |     1 |           3 (2) | ex18, tick 60, Moss                      |

**The lantern.**

- ex18 used seed 20261123 and the culture v2 prompt with incentives. There Sol named the clearing "The Berry Lantern", and Kai told a story at tick 79 in which "a lantern learns its purpose is helping others find one another".
- ex24 used seed 20261203 and the open-goal arm of B. There Moss told an unrelated story at tick 70 of "a lantern tired of showing the way, so its friends sat beside it until dawn".
- No transcript, memory or world object connects the two runs. Neither run's prompt or world text contains the word "lantern"; only ex25's imported world does.
- The phrase "quiet company" arose in five independent lineages under three seeds, and "no obligation" and "no hurry" in three.

**Interpretation.** Imagery that recurs across independent runs is more likely to come from the model's prior than from creation inside a world. These motifs, the lantern, quiet company and no obligation, are better read as the model's stock images for gentle company than as something a group invented.

The data-driven word list supports this. Of the 65 words outside each run's own world text that occur in three or more lineages, the most widespread are ordinary vocabulary of the same register: resting (7 lineages), enjoy, company, quiet, comparing, hearing, sharing and modest (6 each).

**Evidence of shared practice** is therefore not a motif's presence but its transmission: another person adopting a name, continuing a tale or repeating a norm after hearing it, or a newcomer picking it up. The verified transmission events in the label directories are few:

| Run (labels)         | Name adoptions | Tale continuations | Norm repetitions | Verified entries |
| -------------------- | -------------: | -----------------: | ---------------: | ---------------: |
| ex16, rounds 1–400   |              0 |                  0 |                1 |               56 |
| ex18, rounds 1–120   |              2 |                  3 |                0 |               44 |
| ex19, ex21 and ex23  |              0 |                  0 |                0 |               28 |
| ex20                 |              0 |                  0 |                3 |               37 |
| ex22                 |              1 |                  0 |                0 |               40 |
| ex24                 |              0 |                  2 |                0 |               31 |
| ex25, rounds 121–220 |              0 |                  6 |                0 |               33 |
| ex26, rounds 1–162   |              0 |                  0 |                0 |               30 |

Only these items show something passing from one person to another inside a world:

- in ex18 and ex25, the lantern tale, carried across the import and continued by a newcomer, Bram;
- in ex22, the name "The Red Thread";
- in ex24, one story continued by two others;
- in ex20, three verified norm repetitions;
- in ex16, one norm repetition.

ex15 rounds 1–70 has no verified transmission either.

## Totals

| Experiment | Runs                 |     Tokens | Counted handoffs |
| ---------- | -------------------- | ---------: | ---------------: |
| A          | ex16, rounds 250–400 |  2,044,361 |                6 |
| B          | ex19–ex24            |  7,064,562 |               22 |
| C          | ex25                 |  2,137,045 |                5 |
| D          | ex26                 |  2,105,707 |                8 |
| A–D        |                      | 13,351,675 |               41 |

- **Before the program.** The runs ex15–ex18 had spent 7,999,986 tokens.
- **Cumulative.** The total is 21,351,661 tokens of the program's 28,000,000 cap.
- **Uncounted handoffs.** These are not in the table: the empty handoffs that closed `fetch failed` pauses (two in A, one in D) and the requests answered by reuse.
- **Annotation.** The annotation ledger is separate: 99,470 of 1,000,000 tokens over all label runs, including two calibration calls and one superseded pass.
- **Supplement.** An experiment A supplement (ex17 to round 400) was cancelled by the user before it ran.
