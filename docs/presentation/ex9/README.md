# EX9 Ashen replay preview

An independent, read-only presentation of the retained ex9 experiment. Open
[Local preview after setup](http://127.0.0.1:5173/ashen.html) after `pnpm dev`.
The default is Lin at round 79. This is a local address, not a hosted public demo.
Use `/ashen.html?round=721&actor=sol` to share an exact saved boundary. After
`pnpm build`, `pnpm preview` serves the same page on port 4173.

The original observatory, experiment selector, analysis and classic inspector
remain available. **Original replay** opens the same round and actor. No API key,
model call, world continuation or historical archive write is involved.

## Controls and story

Select Lin, Moss or Sol to follow their real position. Drag the canvas, scroll to
zoom, use Full map, or click the minimap. Arrow keys pan the focused canvas;
plus/minus zoom. Pause, 1×/2×/4×, previous/next and the range slider select saved
rounds. Speed changes playback delay, never simulation time. Inventory and
individual mastery expand separately from the main picture.

| Round | Focus      | What actually happened                                                                       |
| ----- | ---------- | -------------------------------------------------------------------------------------------- |
| 71    | Lin / Moss | Moss gives Lin eight dry-grass units; no shelter exists yet.                                 |
| 76    | Lin        | Three of six paid shelter construction rounds; material remains reserved.                    |
| 79    | Lin        | Shelter completion, an actual doorway and 160 service units.                                 |
| 448   | Moss       | Portable-insulation request and personal study, following the need recorded in decision 444. |
| 469   | Lin        | Willow processing produces two bark, one bast and one offcut after four paid rounds.         |
| 518   | Lin        | A mantle is completed after five rounds, still unequipped.                                   |
| 519   | Lin        | The actual round-518 mantle is equipped.                                                     |
| 721   | Sol        | Sol is inside the existing cave at (6, 30.1), after using its entrance.                      |
| 927   | Sol        | The round-489 mantle is repaired to condition 160 and remains unequipped.                    |
| 930   | Sol        | Three paid rounds produce cord from the remaining round-919 bast.                            |

The [bookmark definitions](../../../apps/viewer/src/presentation/ex9/bookmarks.ts)
are checked against original successful events and indexed segment hashes.
See the [original behavioral analysis](../../../experiment/analyses/ex9/pr-23-forest-experience.md)
for interpretation. Fire and rain canopy were learned but never built or used;
this preview does not add either. A failed round-495 willow operation remains a
failure, including its historical diagnostic text.

## Presentation boundary

The existing archive-owned worker verifies segment bytes and reconstructed state
hashes. Only the requested immutable snapshot reaches the renderer. New requests
supersede unfinished seeks. No new replay decoder, world kernel or AI service is
introduced. Terrain textures are cached; sprite sheets are decoded and cropped
once. Idle paused scenes do not run an endless animation loop.

Camera and animation are separate from world state. Adjacent successful recorded
movement is interpolated only if its distance fits the event and the swept disc
is clear in both snapshots. Discontinuous seeks and uncertain transitions snap.
Generic work and rest gestures illustrate an event, not additional production.
Equipment appears only on an owned, equipped mantle. Unfinished shelter work has
a separate paid-progress outline; it is not a completed usable object.

Trees and rocks use actual entity anchors; floor textures and fallen leaves are
non-interactive decoration. The pale doorway marker identifies the actual
entrance. Cave and shelter walls use the existing enclosure geometry. Cutaways
reveal only the recorded footprint; there are no extra rooms. Presentation
lighting deliberately keeps night scenes readable. Illustrative faces, ordinary
costume, shadows and a garment's drawn folds are not additional inventory or
claims about recorded appearance.

## Asset provenance

Five original image files (11.29 MB combined) are reused from the user's
[Ashen repository](https://github.com/YuxiangLiu-lyx/Ashen/tree/557644e30e22797ed7494e4f52ba753886ef5006),
under the user's explicit instruction to adapt that project's assets. This does
not assert a new third-party license. The
[manifest](../../../apps/viewer/public/presentation/ex9/assets/provenance.json)
records each original path, commit, byte count and SHA-256. Copies retain exact
bytes. Selected crops, magenta removal, sprite foot anchors and mild foreground
transparency are applied at display time. Armed sprites and unused buildings are
not rendered. Ashen's map, gameplay code, character identities and narrative are
not imported.

## Evidence and limits

[Acceptance record](acceptance.md) contains paired original/enhanced screenshots,
a short actual browser recording and measured checks. These presentation artifacts
live here, outside every historical experiment directory.

The source map still has tile-defined river banks and rectangular enclosure
footprints. These are kept faithful rather than replaced with an invented map.
The small reused art set repeats some trees and plants. Buildings, animals and
work gestures use modest generic rendering, not bespoke art for every capability.
The presentation is an ex9 preview, not a replacement for the original inspector
or a general renderer for future generated skills.
