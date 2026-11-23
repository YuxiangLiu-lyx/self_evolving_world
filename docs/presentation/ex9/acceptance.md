# EX9 presentation acceptance

## Scope

R1–R6 in the [execution plan](../../exec-plans/completed/pr-29-ex9-ashen-preview.md).
The preview reads ex9 only. No experiment, source snapshot, historical screenshot,
report, replay or result file is changed. No model inference is performed.

## Initial targeted checks

- Nine unit regressions passed: actual bookmark events and index hashes, source
  asset hashes, camera transforms, conservative motion and obstruction handling,
  failed actions, ownership/equipment and the actual cave entrance boundary.
- Three Chromium tests passed in 19.1 seconds in the initial targeted run. They
  exercised ten bookmarks, completion/equipping/repair distinctions, paid work,
  the original same-round return, latest-seek cancellation, play/pause/speed,
  stepping, timeline scrubbing, pan/zoom/minimap and a 390-pixel viewport.
- Browser inspection identified and corrected purple sprite edges and foreground
  foliage obscuring the selected actor. Subsequent evidence will bind the final
  rendering and actual delivery checks.

## Saved visual evidence

The pairs below show the same recorded round and actor. The original page's
Follow control is used for comparable framing; the new page uses its default
close camera. These are new presentation captures, not replacements for archive
screenshots.

| Scene                | Original                              | Enhanced                              |
| -------------------- | ------------------------------------- | ------------------------------------- |
| Shelter complete, 79 | [Original](evidence/original-79.png)  | [Enhanced](evidence/enhanced-79.png)  |
| Mantle equipped, 519 | [Original](evidence/original-519.png) | [Enhanced](evidence/enhanced-519.png) |
| Cave entry, 721      | [Original](evidence/original-721.png) | [Enhanced](evidence/enhanced-721.png) |

[Short browser recording](evidence/preview.webm) shows paid construction at
74–79, mantle completion/equipping at 516–520, cave entry at 719–724 and repair
followed by cord processing at 925–931. It is a roughly 31-second Chromium
recording, resized to 960×810 and VP9-compressed for sharing; no scene, object or
result is synthesized in postproduction. The brief loading transitions are real.
Sampled video frames were inspected for progress, equipment and entrance behavior.

The visual pass corrected sprite fringes, foreground occlusion, overlapping
building/actor labels, nearest-character picking, and the expired shelter cover.
The worn versus inventory mantle and actual cave position agree with the paired
original inspector. No fire or rain canopy is rendered.

## Playback measurements

[Raw measurements and presentation source hashes](evidence/performance.json)
record macOS Chromium, a production Vite preview, 1440×1100 and no CPU throttling.
Cold opening at 79 took 1,392 ms; cold seeks to 519 and 721 took 820 / 1,308 ms.
A cached return to 519 took 50 ms. During six seconds of 2× playback, 365 main-thread
animation samples had 17 ms p95 and maximum gaps, reaching round 531. These are
local observations, not guarantees for every browser or a cross-machine benchmark.

[Bookmark source events](evidence/bookmark-sources.json) retain exact event IDs,
positions and after-state hashes for all ten milestones. The archive worker still
verifies the complete relevant segment prefix before displaying each state.

## Delivery checks

The coordinator's first complete local run
`30864a14-84cc-4098-988e-441fd517b98f` passed 783 unfiltered unit tests and 79
browser cases with 180 selected review images. Unit execution took 44.7 seconds,
browser execution 47.2 seconds, build 3.9 seconds and documentation 1.0 second.
Type, lint, format and architecture checks passed. Full historical archive
preservation passed in 0.4 seconds. All twelve archive validations reused
authenticated matching dependency receipts: zero additional deep rebuilds and
zero model calls. The conservative plan covers old viewers because the shared
navigation, build entry and validation scene registry changed.

The browser suite includes eleven presentation review scenes: partial and
completed shelter, expired covering, mantle, cave, repair, overview, mobile and
three same-round original comparisons. It also verifies nearest-character picking,
failed round 495, source identity, and changing the original archive without
retaining a stale round in the URL. Later documentation-only edits reuse these
unchanged code/browser receipts. Every selected visual result still requires the
current conversation's actual inspection; no test assertion substitutes for it.

The current task's version-bound review, PR preflight and remote `quality` /
`pr-policy` checks remain mandatory before guarded merge. Local passing results
do not themselves claim remote CI success.
