# Replay responsiveness measurements

The main defect was synchronous reconstruction on the browser UI thread, not a
model call or a slow experiment server. Incremental loading already displayed
round zero cheaply, but seeking ex12 from 0 to 90 still blocked the main thread
for approximately 25 seconds. Every continuous round retained its full kernel,
state, event and task verification work. Resolved WebCrypto promises did not
reliably yield a browser task between rounds.

## Method and environment

Read-only Chromium 158.0.8127.18, macOS arm64, Apple M4 Pro, Node 24.22.2, viewport
1440 by 1100, built Vite preview over localhost. Each archive used a fresh page:
wait for verified round zero, seek to 90, then drag the camera in twenty mouse
steps. A 16 ms heartbeat measured UI scheduling gaps; PerformanceObserver recorded
main-thread long tasks. Instrumented Canvas dimension setters counted bitmap
resizes. Rendering observations include a 500 ms settling interval. No CPU/network
throttle, model request, new experiment or archive mutation was used.

The [baseline](baseline.json) was measured on main
`5e8f760b6eff19e9b43e2672c23735b7ec86c7b7` before implementation. The
[optimized record](optimized.json) measures the resulting worker/render path.
These are single observations on the same machine, not statistical benchmarks
or guarantees for every device. The final diagnostic uses the same browser
operations as the initial diagnostic, with added environment metadata.

| Replay | Seek 0–90 before / after | Largest seek heartbeat gap before / after | DOM nodes at 90 before / after | Main-thread long tasks during seek before / after |
| ------ | ------------------------ | ----------------------------------------- | ------------------------------ | ------------------------------------------------- |
| ex8    | 787 / 765 ms             | 771 / 17 ms                               | 12,122 / 727                   | 1 / 0                                             |
| ex10   | 1,420 / 1,410 ms         | 1,398 / 24 ms                             | 12,217 / 764                   | 1 / 0                                             |
| ex12   | 25,044 / 24,298 ms       | 24,971 / 71 ms                            | 49,614 / 2,776                 | 2 / 0                                             |

Ex12's twenty-step pan produced twenty long tasks totaling 1,141 ms before, and
one 58 ms long task afterward. Canvas dimension writes during each measured pan
fell from forty to zero in every archive. Initial ex12 display changed from
254 to 177 ms. The total long seek still takes about 24 seconds: moving verified
work off the UI thread preserves its CPU cost while permitting interaction and
cancellation. No claim of universally smooth 60 fps is made.

## Causes and changes

- Reconstruction, JSON parsing and byte hashing now run in one worker per open
  continuous archive. Only requested verified state crosses back. Corrupt input
  remains an error; cancellation happens after complete verified rounds.
- Interval playback previously submitted another target every 900 ms even if a
  seek had not finished. A slow frame could therefore be repeatedly superseded.
  Playback now waits for settlement, with pause/restart protection.
- Forest Canvas previously coexisted with an invisible full SVG scene and a second
  detailed SVG scene in the minimap. Selection now uses accessible bounds; the
  minimap merges terrain runs and uses overview geometry.
- Every animation/pan previously resized and reset the Canvas and redrew all
  terrain cells. Bitmap dimensions now change only on actual resize; camera-bound
  terrain is clipped and cached for the current recorded perspective/frame.
- Ex12 also defaulted to the nonexistent member `lin`, leaving its inspector empty
  and its first personal-view request invalid. The viewer now chooses the first
  actual member when the previous identity is absent. The optimized measurement
  includes this additional real inspector content.
- Changing a member or global/private perspective now immediately projects the
  currently displayed verified world. It does not wait behind a pending worker
  seek or temporarily leave the previous perspective on screen.

## Reproduction and limits

Build with `pnpm build`. In another terminal, run
`pnpm --filter @self-evolving-world/viewer exec vite preview --host 127.0.0.1 --port 4174`.
Then run `pnpm exec tsx scripts/replay-performance.ts local`; results are written
under ignored `validation-results/`. An optional third argument selects the
preview base URL. Run the same script against the previous built revision for
an independent baseline; keep the output outside the checkout when switching.
The diagnostic does not start its own server or alter simulation state.

A temporary timer-based worker yield added about 0.4 seconds to the short replay
seeks. A MessageChannel task boundary removed that timer-clamping cost while still
allowing incoming seek messages to interrupt between verified rounds. The final
record uses this implementation.

Targeted tests cover verified cancellation/resumption, shared loads, cache bounds,
byte/hash/boundary mismatch, poisoned readers, stale worker messages, disposal,
worker failure and settled playback. The actual ex12 browser case checks that a
geometry click completes before the long target, replaces that seek, pauses
playback, validates private member visibility and switches archives. Historical
model inference is never rerun. Full selected acceptance and delivery are recorded
in the [execution plan](../../completed/pr-28-responsive-replay.md) and task receipts.
