# PR-41: Revised gate G2, transport retry waits and new culture detections

## Requirement summary

After reviewing ex16 and ex17, the user decided that G2 failed because of how the gate was designed, not because the runs failed. Both runs showed negotiated camp terms, a shared mat, an invitation that people attended, a screen valued for its pattern although it gave no shelter, a coined name another person used, and a repeated saying. The two silent people were the ones whose leanings are mastery and freedom.

This PR changes the analysis and run tooling before the two archives are extended:

- it revises gate G2 to a group measure, after the fact;
- `repair` waits for the server's retry-after (fix-log 7d);
- it fixes analyzer problems 7g and 7h;
- it adds three detections and a timeline of events per run.

Fixes 7c and 7f stay unchanged; they are listed as limitations for later scenarios. Nothing here changes a world rule, a prompt, a budget or an archive. The ex7–ex17 compatibility digests must stay identical.

## Requirements

- R1: Revise G2 to a group measure. It passes when all three conditions hold:
  - survival behavior is below 50% of actor-rounds, with idle `rest` and `wait` excluded;
  - at least half of the people make at least one symbolic action;
  - at least one name, saying or rule is adopted by another person who had received it.

  `rest` and `wait` are reported separately as idle and are not counted as survival. The original G2 stays in the output next to the revision.

- R2: Mark the revision as made after the fact, with its date and the reasons, in the analyzer output, CULTURE_SCENARIO and the run report.
- R3: Re-evaluate ex16 and ex17 at round 80 under the revised G2 and record the results in the run report.
- R4 (7d): For a transport pause whose retained failure evidence carries a retry-after, `repair` waits until the failure time plus the retry-after plus 60 seconds before it resumes the run.
  - It refuses a seventh transport recovery of the same experiment within 60 minutes.
  - Each recovery records the failure time, error code, retry-after and the time waited.
- R5 (7g): Names, marks and invitation signs within the vision radius of where they were made count as received text for term transmission. This is the visibility rule the sharing measure already uses.
- R6 (7h): A sharing reuse no longer counts a restatement by any of the idea's earliest authors.
- R7: Add phrase propagation. A clause in another person's later text that closely follows a clause the first person had communicated to them counts as propagation. Tests: ex17 Moss round 52 and Sol round 65.
- R8: Add invitation attendance. For each invitation, report who was present at the invited round and who came after hearing it, from the world's `attendance` event. Also report who arrived within the grace period. Test: ex16's invitation at round 51, attended at round 60, and Sol's speech at round 61.
- R9: Add objects valued for their appearance despite a functional failure. Test: Sol's screen in ex16 at round 70, and Moss's reply at round 71.
- R10: Add a timeline of events per run: names, rules, invitations and attendance, and works, plus adopted sayings. Each item carries its round and the model call that produced it.
- R11: Add fix-log entries for this PR, and list 7c and 7f as limitations left for later scenarios.

## Scope and exclusions

In scope:

- `scripts/culture-metrics.ts` and its tests;
- `scripts/continuous-repair.ts` and the `repair` command, with tests;
- CULTURE_SCENARIO, the fix log, the culture v2 run report, PRODUCT and ADR-0029 where the gate is described.

Out of scope:

- world rules and packages;
- prompts and transports;
- budgets and archives;
- the extension runs, which follow in a separate PR.

## Acceptance criteria

- `pnpm validate` passes.
- The ex7–ex17 compatibility digests are identical.
- The user's test cases are detected in the real ex16 and ex17 archives.
- CI `quality` and `pr-policy` pass.

## Results

- R1–R3: `metrics:culture` reports the revised gate next to the original one. At round 80, ex16 and ex17 pass the revision and fail the original; ex15 (round 70) passes both. The table and the adopted items are in the [run report](../../presentation/run-report-culture-v2.md#revised-g2-after-the-fact) and [fix log 8a](../../presentation/fix-log.md#8a-g2-is-revised-to-a-group-measure-after-the-fact).
- R4: `repair` waits for the retry-after plus 60 s, refuses a seventh dated transport recovery within 60 minutes and records the wait (`scripts/transport-wait.test.ts`, on the retained ex16 `ordinary-19` overload).
- R5: ex17 transmitted terms 0 → 2; `Earth's Quiet Gold` is adopted by Moss through Sol's sign.
- R6: reuses ex15 23 → 17, ex16 9 → 6, ex17 unchanged at 6.
- R7–R9: the user's test cases are detected in the retained archives (`scripts/culture-events.test.ts`): ex17 ticks 52 → 65, ex16's tick-51 invitation with the tick-60 attendance and the ticks 60–61 speech, and Sol's tick-70 screen with Moss's tick-71 acknowledgement.
- R10: every timeline item with a person carries the call that produced that person's plan; call ids were checked against the retained responses.
- R11: fix log section 8 (8a–8f); 7c and 7f are listed as limitations.
- Found while implementing R7 and fixed (8e): world `heard` events and sign objects had put spoken text into the environment vocabulary, hiding spoken coinages. Candidate terms change in ex15 (14 → 16) and ex17 (6 → 8).
- The ex7–ex17 compatibility digests are identical.

Limitations: phrase propagation is lexical; 2 of the 5 private-note propagations at round 80 are status reports, so notes do not count for G2. The revised gate was set after the runs had been seen.
