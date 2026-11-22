# Ex12 development 1: independent root preparation and air drying

## Actual review and boundary

World call 38 at the round-12 barrier approved Birch 5's root preparation
request and Cedar 6's preservation request. No world time advances during this
handoff. The new packages are scoped to `collective-ex12`; no ex11 ability,
mastery, object or historical preservation effect is imported. Shared escrow,
reference resolution and edible-stack adapters reuse attributed ex11 generic
implementation. This is code reuse, not independent reinvention of that code.

`root-preparation@1` reserves actual roots, a stone and bark. Two paid rounds per
root cost one energy each, preserving mass, nutrition, toxins and accumulated
spoilage. Partial processing survives interruption, cancellation and death.
Reusable implements remain actual items. Crushing alone increases decay to
1.25 baseline; it does not cook, detoxify or preserve food.

`root-air-drying@1` uses two stones and bark to construct a reusable tray in two
paid rounds. Loading raw roots pays the same actual crushing work. Previously
crushed compatible food retains its provenance and needs only a transfer round.
Another qualified member can use an empty tray, but cannot take another living
member's stored food without a real transfer. Existing simultaneous-conflict
semantics reject all conflicting actions; no first-writer preference was added.

Actual represented food composition is preserved. Previously unrepresented roots
receive the review's explicit 50% water assumption on first paid processing.
Weather-dependent passive drying removes at most 0.005 water mass per original
root per round down to 12% water. Rain restores at most 0.01, capped by original
water. Dry food decays at 0.35 baseline; rewetting reverses that benefit. Water
loss, intake, actual mass and baseline/actual decay are recorded. Unloading keeps
exposure and age; dismantling releases conserved components. No nutrient or age
reset occurs. Expired food is removed from the tray's visible state.

The world review proposed a shared meal feedback mechanism. The frozen canonical
meal system already implements that function, including its existing eight-round
window and thresholds. It is reused unchanged: no second meal reward, revised
window, preparation reward or policy retuning is installed. The dependency
`root-food-matrix@1` provides only a shared resource schema, not a third skill.
Individual learning still requires two and four actual rounds respectively.

## Verification and visual review

Eight actual-kernel tests passed: paid work, real eating, partial cancellation,
death, invalid placement, reserved inputs, qualified second-member use, an actual
prepared-output-to-drying dependency, same-round contention, moisture conservation,
rate savings, rewetting, idempotent updates, resume, unloading, dismantling,
expiry cleanup, individual mastery and A/B/history isolation. Test stock, mastery
and weather-clock scenes never enter formal model contexts.

The browser fixture passed six scenes. Each final screenshot was personally
inspected: paid crushing, actual output, empty tray, paid loading, actual drying
and rewetting. Real stones/bark, remaining work, moisture, decay multiplier and
shrinking food are visible. Overlapping released-tool labels and stale paid-work
events in passive fixture frames were fixed before recapture. The dry scene shows
12.0% water and 0.35 decay; the wet scene shows 15.2% and 1.25. These are explicitly
isolated fixtures, not autonomous outcomes. The subsequent expiry cleanup does
not alter those surviving-food scenes.

The handoff must still pass the full unit suite, static checks, build and exact
reconstruction of all twelve committed formal rounds before installation.
Development consumes one counted handoff; internal conversation token usage is
unobservable and is not reported as zero. No formal use or lasting benefit is
claimed by this implementation review.
