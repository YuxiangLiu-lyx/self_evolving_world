# Responsive experiment replay

## Requirement summary

Investigate severe stuttering in existing experiment replays and optimize the
measured loading, seeking, playback and rendering paths without changing recorded
worlds or weakening verification. Continue the existing task and PR harness.

## Requirements

- R1: Measure representative retained replays before and after changes, separating reconstruction, main-thread responsiveness and presentation costs.
- R2: Keep continuous replay reconstruction from blocking interaction; bound redundant work during playback, rapid seeks and archive changes while retaining exact integrity, state, event and cursor checks.
- R3: Reduce unnecessary forest rendering work while preserving visible state, private views, object selection, camera controls and historical replay compatibility.
- R4: Add focused regressions for concurrency, cancellation, integrity failures and responsive playback, and pass all programmatically selected checks with actual visual review.
- R5: Preserve all experiment archives and rules, perform no model calls or new experiment, and deliver measured findings through the existing review, PR, CI and authorized merge process.

## Scope and exclusions

Viewer replay execution, scheduling, rendering, tests and synchronized documents.
No simulation semantics, agent policies, archive edits, inference, new service,
framework replacement, weaker verification or longer acceptance deadlines.

## Acceptance criteria

Retain repeatable browser measurements of ex8, ex10 and ex12, including a long
seek and user interaction during replay work. Validate latest-request behavior,
backward reuse, archive isolation, fail-closed corruption, playback settlement,
private visibility and unchanged recorded positions. Run the complete unit suite
and selected browser/archive checks; inspect selected new screenshots. Complete
current-head quality, PR policy, self-review and independently verified merge.

## Steps

1. Inspect main, prior fixes and retained archives; measure the baseline.
2. Implement the smallest changes addressing the measured bottlenecks.
3. Compare performance, add regressions and synchronize documentation.
4. Run selected acceptance, review all changed files/images and deliver via PR.

## Progress and results

- Started from clean main `5e8f760b6eff19e9b43e2672c23735b7ec86c7b7`.
- Existing prefix replay and canonical equality optimizations are retained.
- Measured ex8/ex10/ex12 baseline and final presentation; [raw results and method](../evidence/pr-28-responsive-replay/performance.md) retain actual timings.
- Implemented archive-owned verification workers, verified-boundary cancellation,
  settled playback, accessible hit layers, a compact minimap and cached terrain.
- Fixed the actual-member default exposed by ex12 private-view regression.
- Full selected acceptance passed: 774 unfiltered unit tests, 76 browser cases,
  type/lint/format/architecture/build/documentation checks and preservation of all
  twelve archives. Local unit execution took 44.419 seconds; browser execution
  took 45.052 seconds. Twelve authenticated archive receipts were reused, with
  zero deep reconstructions and no model calls.
- Run `364ca831-682a-4dce-9ceb-05c2fefbe16b` produced 169 selected images: 35
  changed images were inspected, and 134 unchanged image hashes matched prior
  actual review evidence from PR #20. Recorded states, private visibility,
  facilities and progress remain legible. Existing high-zoom fixture label
  clipping is unchanged and its complete details remain in the inspector.
- The first complete browser run exposed a perspective-switch race in six
  historical continuous archives. Perspective changes now immediately reproject
  the already verified displayed state; all 76 browser cases then passed.
- Initial focused browser validation found an obsolete network-idle wait after
  terminating a held worker request; the test now waits for that exact response
  and asserts the selected archive/state. No timeout was extended.
- Current-head remote quality, PR policy, published self-review and independent
  integration verification remain required delivery gates; the coordinator
  records their eventual results. Local acceptance alone does not complete them.

## Limitations and follow-up

Performance measurements apply to the recorded browser and hardware. Long seeks
must still verify the required history; responsiveness is distinct from total
reconstruction time. No experimental behavior is inferred from viewer tests.

## Delivery

- Task: Responsive experiment replay
- Mode: merge
