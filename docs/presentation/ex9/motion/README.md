# Continuous-motion acceptance

This refinement changes only `/ashen.html`. Historical ex9 files, decisions,
results and the first preview's evidence remain unchanged. No experimental model
or world continuation was used. Run `pnpm build && pnpm preview`, then open
[local preview](http://127.0.0.1:4173/ashen.html?round=93&actor=lin).

## Method

The baseline is main `99814e58d3b59ce3e5ae18a2a161911089d8def4`.
[Baseline samples](baseline.json) capture the selected actor's actual Canvas foot
ring at animation-frame frequency, with the camera fixed during Sol's recorded
rounds 25–31. [Before](before-1440.png) shows the original layout at round 25.
The 900 ms round timer waited separately from a reset 420 ms animation, including
fresh replay loading between timers.

The new browser checks consume read-only `ashen-frame` diagnostics enabled only
by `?trace=1`: actual rendered foot, camera, cumulative gait phase, fractional
clock, speed, working blend and buffering state. No diagnostic can mutate the
world. Tests compare trajectory distance against elapsed presentation time,
check phase continuity and camera velocity, cross the verified 100/101 segment
boundary, exercise all three speeds and explicitly delay the next segment to
verify a frozen clock. They also inspect a real failed round and exact steps.

The actual recording exercises Lin's turn and long walk from round 93, speeds
1×/2×/4×, round 39–44 movement/gathering/movement, paid willow processing at
463–469, nearby and distant selection, pan, zoom, Follow, overview and a cave
bookmark. It is a browser recording of retained experiment data, not a synthetic
animation or a new experiment.

## Results

[Watch the actual 44.68-second recording](continuous-playback.webm), or compare
[before, 1440x900](before-1440.png) with [after, 1440x900](after-1440.png) and
[after, 1920x1080](after-1920.png). All three stills show Sol at saved round 25.
The recording was compressed to VP9 without resizing, interpolation or timeline
edits; original and retained hashes are in [measurements](measurements.json).

| Observation                 | Before                               | After                                                                           |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| Canvas at 1440x900          | 1025x583; 71.2% width / 64.8% height | 1440x900; 100% / 100%, with compact HUD overlays                                |
| Canvas at 1920x1080         | Not measured                         | 1920x1080; 100% / 100%                                                          |
| Backing resolution at DPR 2 | Not measured                         | 2880x1800 for a 1440x900 CSS canvas                                             |
| Recorded walking boundaries | Six stationary gaps of 483–500 ms    | 13 moving boundaries; zero zero-motion pairs among 784 adjacent walking pairs   |
| Gait                        | Reset each round; static side frame  | Distance-based phase, two existing side poses; measured phase error below 1e-14 |
| Camera                      | Reset with each snapshot             | Independent rendered-position follow, dead zone, damping and bounded lookahead  |

The [rendered trace](rendered-trace.jsonl) records actual presentation frames.
Walking samples had a maximum 33.4 ms frame gap; this recording had no natural
buffering. The intentionally delayed-segment browser test separately confirms
that missing verified data freezes round 100, displays buffering and resumes
without catch-up. These are bounded observations on this machine and routes,
not a claim that every device or cold seek is hitch-free.

Acceptance run `5fcfdc04-d4d3-4721-9050-5c1d059ba5cd` passed 790 unit tests
(107 files; 45.17 s check) and 82 browser tests (57.29 s check). Seven unit tests
cover clock, buffer and camera semantics. Dynamic browser coverage includes
walking/turning, work transitions, all speeds, full screen, pan/zoom/selection,
100/101 segment crossing, explicit buffering, failed actions and the final round.

All 182 selected screenshot pixels were inspected: the preceding run's inspected
images were compared by SHA-256, then all 26 changed captures were inspected again.
Full-size desktop images and frames sampled throughout the recording confirm
readable people and equipment, legible compact controls, natural work poses and
clear camera cuts. Trajectory, phase and camera checks supplement that frame
inspection. Existing original replay and archive compatibility scenes passed.
The shared scene inventory change conservatively selected those scenes; this did
not run historical models. Twelve unchanged archive checks reused authenticated
input-bound receipts, with zero additional local deep reconstructions.

Environment: Node 24.22.2, pnpm 10.34.9 and Playwright Chromium on macOS. The task
coordinator also enforces current diff review, PR CI and guarded merge; its final
receipt is separate from this source-bound browser measurement.

## Limits

Only recorded safe straight segments can interpolate. Unknown paths and failed
moves remain exact boundary changes. Sharp recorded turns remain sharp spatial
turns; no curve is invented through obstacles. Two side poses and restrained
body movement improve the limited atlas, but this is not a full skeletal rig.
The first cold seek still requires verification; unavailable lookahead explicitly
buffers. The display retains the true river and enclosure geometry.
