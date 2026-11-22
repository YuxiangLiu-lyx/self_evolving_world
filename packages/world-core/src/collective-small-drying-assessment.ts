import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Number,
  v7Record,
  v7Signature,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Obstacles,
  v7ShapeDistance,
  v7SegmentClear,
} from './continuous-geometry.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestResolveReference } from './forest-references.js';
import { surfaceGeometry } from './collective-root-surface.js';
import { smallSite, smallSpatial } from './collective-small-drying-site.js';

export const SMALL_RESULT = 'root-small-drying:assessment';
export function smallDryingAssessment(a: V7Actor): V7Data | null {
  const r = a.extensionState[SMALL_RESULT];
  return r && typeof r === 'object' && !Array.isArray(r) ? v7Clone(r) : null;
}
export function smallOwned(c: V7ActionContext, ref: unknown, quantity = 0.1) {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(ref, 'item reference'),
      'owned',
      quantity,
    ),
    s = c.world.stacks.find((s) => s.id === id);
  if (!s) throw new Error('Owned material is unavailable.');
  return s;
}
export function smallGeometry(w: V7World, s: V7Stack) {
  const g = surfaceGeometry(w, s),
    lot = s.componentLots?.[0] ?? s;
  if (!s.processing?.rootSurface && !lot.materialLayer) {
    g.width = v7RoundNumber(Math.sqrt(Number(g.mass) / 500 / 0.003));
    g.height = g.width;
    g.basis =
      'Model-derived square sheet: density 500 kg/m3 and thickness 0.003 m. Shape and dimensions are uncertain, not personal measurements.';
  }
  return g;
}
export function smallStone(w: V7World, s: V7Stack) {
  return (
    s.resource === 'stone' &&
    (collectiveFoodProfile(w, s)?.properties?.hardness ?? 0) >= 3 &&
    !s.processing?.wovenDamage &&
    !s.processing?.gravimetricAssay
  );
}
export function smallSample(w: V7World, s: V7Stack) {
  const r = collectiveFoodProfile(w, s),
    volume = s.processing?.unitVolume;
  return {
    safe:
      ['root', 'crushed-root'].includes(s.resource) &&
      !s.componentLots &&
      r?.nutrition === 14 &&
      r.toxicity === 0 &&
      (s.decay ?? 0) < (r.properties?.decay ?? 0),
    volume:
      typeof volume === 'number'
        ? volume * 0.1
        : (foodUnitMass(w, s) * 0.1) / 1000,
    basis:
      typeof volume === 'number'
        ? 'Retained per-original-unit represented volume.'
        : 'Uncertain volume model: actual mass / 1000 kg/m3; not a personal measurement.',
  };
}
export function smallAssess(c: V7ActionContext) {
  const bark = smallOwned(c, c.action.args.barkId),
    sample = smallOwned(c, c.action.args.sampleId),
    raw = c.action.args.stoneIds;
  if (!Array.isArray(raw) || !raw.length || raw.length > 5)
    throw new Error('Name one to five exact owned stone stacks.');
  const stones = raw.map((id) => smallOwned(c, id));
  if (new Set(stones.map((s) => s.id)).size !== stones.length)
    throw new Error('Duplicate stone identity.');
  const site = v7Record(c.action.args.site),
    x = v7Number(site.x, 'site.x'),
    y = v7Number(site.y, 'site.y');
  const checks: V7Data[] = [];
  const check = (
    code: string,
    pass: boolean | null,
    observed: V7Data[string],
    required: string,
  ) =>
    checks.push({
      code,
      status: pass === null ? 'unknown' : pass ? 'pass' : 'fail',
      observed,
      required,
    });
  check(
    'ownership-availability',
    true,
    { barkId: bark.id, stoneIds: stones.map((s) => s.id), sampleId: sample.id },
    'Exact actual owned unreserved items, each at least 0.1 units.',
  );
  let geometry: V7Data | null = null;
  try {
    geometry = smallGeometry(c.world, bark);
  } catch (e: unknown) {
    check(
      'geometry',
      null,
      e instanceof Error ? e.message : 'Unknown geometry.',
      'Connected single sheet with retained or explicit mass-conserving geometry.',
    );
  }
  if (geometry)
    check(
      'geometry',
      true,
      geometry,
      'Retained representation or explicitly uncertain square-sheet model.',
    );
  check(
    'sheet-condition',
    geometry
      ? geometry.connected === true &&
          Number(geometry.holes) === 0 &&
          Number(geometry.condition) >= 0.8
      : null,
    geometry
      ? {
          connected: geometry.connected ?? null,
          holes: geometry.holes ?? null,
          condition: geometry.condition ?? null,
        }
      : null,
    'Intact connected sheet, no holes, condition >=0.8.',
  );
  check(
    'food-and-ballast-rectangle',
    geometry
      ? Number(geometry.width) >= 0.2 - 1e-8 &&
          Number(geometry.height) >= 0.2 - 1e-8
      : null,
    geometry
      ? { width: geometry.width ?? null, height: geometry.height ?? null }
      : null,
    '0.16 x 0.16 m clear food area and exterior 0.02 m margins on all sides.',
  );
  check(
    'stone-contact',
    stones.every((s) => smallStone(c.world, s)),
    stones.map((s) => ({
      id: s.id,
      quantity: s.quantity,
      hardness: collectiveFoodProfile(c.world, s)?.properties?.hardness ?? null,
    })),
    'Actual undamaged stone hardness >=3; intrinsic contact property, not a personal measurement.',
  );
  check(
    'ballast-quantity',
    stones.reduce((n, s) => n + s.quantity, 0) >= 0.5,
    stones.reduce((n, s) => n + s.quantity, 0),
    '0.5 stone unit reserved from the explicitly named stacks.',
  );
  const food = smallSample(c.world, sample);
  check(
    'sample-capacity',
    food.safe &&
      Number.isFinite(food.volume) &&
      food.volume > 0 &&
      food.volume <= 0.16 * 0.16 * 0.003,
    { ...food, quantity: 0.1 },
    '0.1 owned safe unspoiled original-root equivalent; maximum food layer volume 0.0000768 m3.',
  );
  const spatial = smallSpatial(x, y, geometry ?? { width: 0.2, height: 0.2 }),
    reachable =
      v7ShapeDistance(c.actor.position, spatial) <= c.actor.radius + 0.65;
  check('reach', reachable, { x, y }, 'Site within actual 0.65 surface reach.');
  const local = reachable ? smallSite(c.world, spatial) : null;
  check(
    'bounds',
    local?.bounds ?? null,
    { x, y },
    'Complete sheet inside the world.',
  );
  check(
    'firm-ground',
    local?.firm ?? null,
    local?.firm ?? null,
    'Non-waterlogged accessible supporting ground; unreachable ground is unknown.',
  );
  check(
    'clearance',
    local?.clear ?? null,
    local?.clear ?? null,
    'Clear of actual obstacles, living bodies including performer, and reserved surfaces.',
  );
  check(
    'access',
    reachable
      ? v7SegmentClear(c.actor.position, spatial, 0, v7Obstacles(c.world))
      : null,
    reachable,
    'Unobstructed physical access.',
  );
  v7Spend(c.actor, 0.2);
  const r: V7Data = {
    id: v7Id(c.world, 'assessment'),
    tick: c.world.tick,
    actor: c.actor.id,
    site: { x, y },
    geometry,
    barkId: bark.id,
    stoneIds: stones.map((s) => s.id),
    sampleId: sample.id,
    checks,
    suitable: checks.every((r) => r.status === 'pass'),
    costs: { energy: 0.2, rounds: 1 },
  };
  c.world.state['small-drying:binding:' + c.actor.id] = {
    id: r.id ?? null,
    signature: smallMaterialRevision([bark, ...stones]),
  };
  c.actor.extensionState[SMALL_RESULT] = v7Clone(r);
  c.emit(
    'small-drying-assessed',
    'Dated physical assessment; no food, construction or wellbeing granted.',
    r,
    c.actor.id,
  );
  const event = c.world.events.at(-1);
  if (event) event.position = null;
  return { complete: true, writes: [] };
}

export function smallMaterialRevision(items: V7Stack[]) {
  return v7Signature(
    items.map((s) => {
      const copy = v7Clone(s);
      delete copy.quantityTenths;
      return copy;
    }),
  );
}
