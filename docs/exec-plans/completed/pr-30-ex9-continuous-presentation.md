# EX9 continuous presentation

## Requirement summary

Make the existing ex9 preview feel like continuous game viewing, with a dominant
canvas, independent following camera and coherent motion. Preserve all historical
records and other entries, and verify real dynamic playback before delivery.

## Requirements

- R1: Upgrade only the independent Ashen preview to a near-window game view: at least 90% viewport width and 85% height on desktop, actual fullscreen, compact HUD, optional evidence/bookmarks drawer, readable local camera and device-pixel-ratio rendering.
- R2: Replace independent round and animation timers with one continuous animation-frame clock. Playback speed affects motion, actions and camera. Bounded verified lookahead covers segment boundaries; unavailable data freezes presentation time with explicit buffering. Consecutive recorded moves retain continuous position and gait; genuine stops and failures remain.
- R3: Follow rendered positions with damping, a small dead zone and bounded lookahead. Smooth zoom and nearby character switches; cut distant changes and seeks. Panning suspends follow; explicit Follow resumes smoothly.
- R4: Preserve gait phase across rounds, use available directional artwork and restrained procedural side motion, and transition naturally between moving, resting and continuous work. Do not display unearned completion or effects.
- R5: Retain replay integrity and collision checks. Never invent paths, outcomes, resources or world actions. Exact boundary states, steps and seeks match the archive. Paused fractional presentation is explicitly distinguished from the last verified boundary.
- R6: Exercise real walking/turning, work transitions, speeds, camera controls and segment crossing in the browser. Inspect 1440x900 and 1920x1080, retain a 30–60 second actual recording and rendered trajectory/phase/camera measurements. Complete selected checks, full diff and visual review, PR, current CI and guarded merge.

## Scope and exclusions

No new experiment, inference, simulation continuation, agent decisions, world rules,
historical archive/evidence changes, original replay redesign, new engine or broad
artwork project. Reuse existing Ashen assets and verified replay worker.

## Acceptance criteria

1. Measure the existing timing gap and inspect directional assets and real routes.
2. Add isolated testable clock, bounded prefetch and camera/motion presentation.
3. Replace the preview layout with a full-window canvas and compact optional HUD.
4. Validate dynamic continuity and exact-state controls using real saved records.
5. Retain separate motion evidence, synchronize feature/architecture documentation,
   and complete the existing coordinator's review/publication/merge gates.

All selected checks must pass. Capture evidence under
`docs/presentation/ex9/motion/`; do not overwrite the first preview's evidence.

## Progress

- Started from clean main `99814e58d3b59ce3e5ae18a2a161911089d8def4`.
- The old preview waits 900 ms per round, then resets a separate 420 ms animation;
  synchronous snapshot-dependent follow and per-round gait resets cause visible stops.
- The existing worker verifies segment hashes and replay prefixes. Reuse it through
  the existing latest-request client with bounded sequential prefetch.

## Results and review

- R1: The independent canvas now fills both 1440x900 and 1920x1080 viewports.
  Real fullscreen, optional drawers and native DPR backing were exercised;
  DPR 2 uses 2880x1800 backing for 1440x900 CSS pixels.
- R2–R4: One RAF presentation clock and ten-frame verified window replace the
  asynchronous timer/animation reset. Independent camera damping, dead zone,
  bounded lookahead, manual follow suspension, cuts and distance-based gait pass
  unit and browser trajectory checks. Existing side poses and continuous work
  gestures retain the original art scope.
- R5: Existing hash verification and swept collision constraints remain intact.
  Explicit buffering freezes time. Failed actions, exact steps, fractional pause,
  foreground verification errors and the final round are checked. All historical
  archives and the previous preview evidence are unchanged; no model was called.
- R6: Actual 44.68-second playback, paired round-25 views, 182 reviewed screenshots,
  raw rendered trajectories and source-bound measurements are retained in
  [motion evidence](../../presentation/ex9/motion/README.md). Walking shows zero
  stationary pairs across 784 samples including 13 round boundaries; the old
  separately sampled route had 483–500 ms inter-round gaps.
- Node 24.22.2 / pnpm 10.34.9 / Chromium on macOS: acceptance run
  `5fcfdc04-d4d3-4721-9050-5c1d059ba5cd` passed 790 unfiltered unit tests in
  107 files and 82 browser tests. Check durations were 45.17 s and 57.29 s.
  Type, lint, format, architecture, build, demo, analysis, documentation and
  archive-preservation checks passed. Twelve unchanged archive validations reused
  authenticated dependency-bound receipts; zero additional deep reconstructions.
- Review resolved an unused parameter, missing final-frame repaint, transient
  foreground error notification and overly narrow tree-occlusion test. All changed
  paths serve R1–R6; no world behavior, model, historical data or other entry changed.
  Final documentation changes require a refreshed selected plan before publication.

## Limitations and follow-up

No selected check is intentionally omitted. Remote CI and integration are enforced
by the task's subsequent publication/completion receipts, not assumed here.
Sparse records still permit only safe straight interpolation; sharp turns stay
sharp, and uncertain paths snap. Two side poses are not a full skeletal animation.
Cold seeks may verify/buffer. The next useful visual improvement would be a small,
consistent directional walking atlas, without changing archived behavior.

## Delivery

- Task: EX9 continuous presentation
- Mode: merge
