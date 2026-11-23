# EX9 Ashen replay preview

## Requirement summary

Create a separate presentation-quality, Ashen-inspired forest replay of the real
ex9 archive. Reuse existing assets and verified replay infrastructure, clearly
separate presentation from simulation, and preserve every historical entry and
artifact. The two explicitly requested navigation/provenance labels retain the
user's Chinese wording; other repository content remains English.

## Requirements

- R1: Add an independent ex9 preview URL and navigation entry while preserving all original viewer entries and every historical experiment artifact; perform no inference or simulation continuation.
- R2: Inspect and adapt a small, attributed subset of actual Ashen assets to the real ex9 map and entities, using the existing Canvas and verified replay infrastructure without changing engines or importing game rules.
- R3: Provide readable local follow views, actor selection, pan, zoom, overview and minimap, with grounded movement, direction, generic actions, equipment, construction and recorded enclosure presentation.
- R4: Keep every displayed entity, quantity, position, progress and outcome faithful to the archive; distinguish requests, approval, mastery, work and use, and never depict unbuilt fire or canopy as real.
- R5: Verify and provide a few real-event bookmarks with concise source-based explanations, pause, speed, stepping, seeking and a return to the original replay at the selected round.
- R6: Validate archive preservation, original-entry compatibility, new navigation and state fidelity, actual browser clarity and responsiveness; retain separate same-round comparison images and a short recording when supported, and complete the existing review, PR, CI and guarded merge flow.

## Scope and exclusions

An independent ex9 presentation page, small reusable asset subset, read-only
presentation projections, bookmarks, tests and synchronized documentation.
No world/core rules, prompts, model calls, new runs, historical archive edits,
Ashen map imports, fabricated results, new rooms or interactive facilities.
No per-action image generation or whole-engine migration.

## Acceptance criteria

A directly loadable preview defaults to ex9 and a readable follow camera. Bookmarks
resolve to independently checked records for shelter, insulation, cave occupancy
and equipment maintenance. Controls preserve exact state and latest-request
semantics; interpolation uses only safe adjacent recorded motion. Existing archive
selection and analysis remain accessible. Programmatically selected validation
passes, new screenshots receive actual inspection, raw assets have source hashes,
and comparison/video evidence lives outside historical archives.

## Steps

1. Inspect viewer, Ashen assets, ex9 index and bounded key-event records.
2. Implement an isolated presentation renderer, interface and grounded bookmarks.
3. Validate real browser scenes, controls, fidelity and responsive interaction.
4. Retain visual evidence and limitations, review the complete diff and deliver.

## Progress and results

- Started from clean main `26ed6271223ab73dcdee350391674fa043ba73fb`.
- Existing archive-owned workers and verified prefix cancellation will be reused.
- The retained ex9 analysis confirms actual shelter, mantle and repair chains;
  fire and rain canopy were never built or used. Ten exact event bookmarks have been verified against source events and indexed bytes.
- Implemented `/ashen.html`, attributed assets, read-only Canvas projection, follow/pan/zoom/minimap, guarded movement interpolation and original same-round return.
- Nine targeted unit tests passed. Three targeted Chromium cases passed in 18.3 seconds before the final label-placement adjustment; the coordinator will check the final rendering.
- Same-round original/enhanced images and an approximately 31-second recording are retained in `docs/presentation/ex9/evidence/`. Actual inspection corrected occlusion, sprite fringes, expired cover and label overlap.
- Final source-bound local measurements: cold open 1,392 ms; cold seeks 820 / 1,308 ms; cached seek 50 ms; six seconds of playback had 17 ms p95/max main-thread frame gaps.
- The coordinator's automated run `30864a14-84cc-4098-988e-441fd517b98f` passed 783 unfiltered unit tests and 79 browser tests, selecting 180 review images. Archive preservation passed; twelve unchanged archive checks reused authenticated receipts with zero additional deep rebuilds.
- Visual review also found the existing narrow-screen link-hiding rule; the new preview link remains visible on narrow screens and its return path has a browser regression.
- Final semantic/visual review and current-head PR/CI/guarded-merge requirements remain enforced by the coordinator. Local results do not assert remote success.
- See [presentation acceptance](../../presentation/ex9/acceptance.md) for source-bound measurements, original/enhanced comparisons, recording and limitations.

## Limitations and follow-up

Visuals cannot supply missing historical paths or unrecorded outcomes. Sparse
records require conservative movement presentation. Asset reuse does not import
Ashen characters' identities, mechanics, map layouts or narrative.

## Delivery

- Task: EX9 Ashen replay preview
- Mode: merge
