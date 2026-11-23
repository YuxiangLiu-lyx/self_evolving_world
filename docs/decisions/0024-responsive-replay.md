# ADR-0024: Verified Replay in an Archive-Owned Browser Worker

- Date: 2026-11-22
- Status: Accepted
- Extends: [ADR-0009](0009-static-experiment-browser.md) and [ADR-0018](0018-continuous-world-and-wellbeing.md).

## Context

Incremental reconstruction made initial frames inexpensive, but a long forward
seek still ran the deterministic kernel on the UI thread. Ex12 blocked that thread
for about 25 seconds when seeking to round 90. Forest presentation also rebuilt
hidden terrain SVG, a detailed SVG minimap and Canvas terrain on every animation
frame. Its recorded 96 by 72 map produced nearly 50,000 DOM nodes.

## Decision

Give each opened continuous archive one dedicated browser worker. It fetches and
hashes exact segment bytes, parses them and runs the existing incremental reader
with unchanged state, event, task and precision checks. The main thread receives
only the requested verified world and task state. Three least-recently-used
segment promises retain verified prefixes. No server or model is involved.

A newer seek supersedes old work only after a complete verified round. A worker
task boundary allows incoming requests to run; cancellation never retains a
half-applied transition. Integrity failures poison the reader as before. Archive
switching terminates the worker and settles pending consumers; stale messages
cannot replace the current frame. Playback waits for a settled seek before
scheduling the next, including pause/restart races.

Member and global/private perspective changes reproject the displayed verified
world immediately on the UI thread; they require no further reconstruction.

Forest Canvas remains the visible scene. Its transparent SVG contains accessible
selection bounds only; the minimap merges terrain color runs and shows simplified
entity geometry. A per-canvas terrain surface is reused only for the same immutable
scene, camera and pixel dimensions, with offscreen cells excluded. Changing the
frame, perspective, camera or resolution invalidates that surface. Dynamic world
objects and effects continue to render from actual recorded state.

## Alternatives and consequences

Yielding on the UI thread between rounds cannot prevent a single expensive round
from blocking controls. Skipping checks or serving unverified future states would
weaken the replay contract. Precomputing another full set of snapshots adds a new
archive format and storage burden. Neither is needed here.

A worker adds a browser bundle and structured-clone cost for displayed worlds.
It improves responsiveness, not the underlying simulation's total CPU cost. Large
uncached seeks can still take seconds; verified progress remains visible and the
request can be replaced. Historical grid reconstruction keeps its original path.
Failure to create or run the worker is surfaced, never bypassed by an unverified
fallback. See the [measurement record](../exec-plans/evidence/pr-28-responsive-replay/performance.md).
