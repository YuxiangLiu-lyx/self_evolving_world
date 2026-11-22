# Collective baseline calibration

All records here are isolated, no-model feasibility fixtures before formal
inference. They are not agent discoveries, recipes or decision-context examples.
Historical experiment archives were not changed or rerun.

The final B baseline completed 1,600 rounds with all eighteen members retaining
their lives, zero failed actions and 68.2743% optional activity time. Optional time
counts only fixture waits with satiety at least 78 and energy at least 35; queued
movement waits do not count. Minimum satiety across members was 27.2, and minimum
health was 61.7958. Every member first harvested food at round 4. The nearest safe
food was 0.762–1.063 continuous units away. Initial safe nutrition across the
map was 22,248 units. Runtime was 1,055.7 seconds.

The fixture actually paid 2,314 harvests, 2,313 meals, 2,278 rests and 1,285
movement rounds, alongside 20,610 waits. It used actual safe material definitions,
prioritized hungry members, reserved different harvest sources and permitted one
moving member per group per round. This is a feasibility oracle with coordination
advantages; it does not predict model performance or remove formal collisions.

The fixed final baseline has four authored food patches per member (two berry,
two root), each with finite stock/capacity 6 and base regrowth intervals 6/9.
Existing seasons, local conditions, depletion, carrying, fatigue, exposure,
wildlife and limited lives still operate. No starting tools, generated abilities
or finished projects were granted. These patches are authored population
capacity, not autonomous cultivation.

The retained earlier calibration logs explain the changes:

1. An omniscient all-cell memory expansion was stopped for cost before completion.
2. Two patches per member and fixed source assignment lost Ash 2 at round 331.
3. Four patches with fixed source assignment lost Ash 2 at round 531.
4. Shared source selection exposed movement contention; Cedar 4 died at 636.
5. Serial group movement removed action failures, but Cedar 1 still died at 796
   during the winter shortage. Base regrowth was then changed from 12/18 to 6/9
   before any formal inference. The final full result is `preflight.json`.

The formal launcher separately preflights the frozen A baseline before its first
model call. B's same physical genesis is checked against A, and this retained full
B fixture also covers its preference-bearing initial state. The formal strategy,
choices and outcomes remain separate. No formal world is rescued or retuned.
