import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Spatial,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7Signature,
  v7String,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7ShapesOverlap,
  v7TerrainObstacles,
  v7Visible,
  v7Walls,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { rootPlacement } from './collective-tray-placement.js';
export const TRAY_CLEARANCE = 'root-tray-clearance';
export function trayClearanceHistory(a: V7Actor): V7Data[] {
  const value = a.extensionState[TRAY_CLEARANCE + ':history'];
  return Array.isArray(value)
    ? value
        .filter(
          (v): v is V7Data => !!v && typeof v === 'object' && !Array.isArray(v),
        )
        .map(v7Clone)
    : [];
}
export function trayClearanceResult(a: V7Actor): V7Data | null {
  const r = a.extensionState[TRAY_CLEARANCE + ':result'];
  return r && typeof r === 'object' && !Array.isArray(r) ? v7Clone(r) : null;
}
export function assessTray(c: V7ActionContext) {
  if (c.actor.vitals.health <= 0)
    throw new Error('A living performer is required.');
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'read') {
    const id = v7String(c.action.args.assessmentId, 'assessmentId');
    const old = trayClearanceHistory(c.actor).find(
      (r) => r.assessmentId === id,
    );
    if (!old) throw new Error('No such retained personal assessment.');
    v7Spend(c.actor, 0.2);
    c.actor.extensionState[TRAY_CLEARANCE + ':result'] = v7Clone(old);
    c.emit(
      'tray-clearance-read',
      'Read dated evidence without recomputing or reserving the site.',
      { ...old, readAt: c.world.tick, historicalRead: true },
      c.actor.id,
    );
    const event = c.world.events.at(-1);
    if (event) event.position = null;
    return { complete: true, writes: [] };
  }
  if (mode !== 'assess') throw new Error('Choose assess or read.');
  const raw = c.action.args.site;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Supply explicit finite site coordinates.');
  const x = v7Number(raw.x, 'site x'),
    y = v7Number(raw.y, 'site y');
  const angle =
    c.action.args.angle === undefined
      ? 0
      : v7Number(c.action.args.angle, 'angle');
  if (x < 0 || y < 0 || x > c.world.config.width || y > c.world.config.height)
    throw new Error('Site center must be inside world bounds.');
  // The existing construction footprint is a circle. Angle has no physical effect.
  const spatial: V7Spatial = {
    x,
    y,
    angle,
    shape: { kind: 'circle', radius: 0.4 },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const physical = rootPlacement(c.world, c.actor, spatial, 0.4);
  const seen = (p: { x: number; y: number }) =>
    v7Distance(c.actor.position, p) <= c.world.config.vision &&
    v7Visible(c.world, c.actor.position, p);
  const perimeter = Array.from({ length: 32 }, (_, i) => ({
    x: x + 0.4 * Math.cos((i * Math.PI) / 16),
    y: y + 0.4 * Math.sin((i * Math.PI) / 16),
  }));
  const visible = physical.samples.every(seen) && perimeter.every(seen);
  const observation = v7Observe(c.world, c.actor.id);
  const blockers: V7Data[] = [];
  for (const o of observation.objects) {
    const walls = v7Walls(o.spatial).filter((s) => v7ShapesOverlap(spatial, s));
    const reserved =
      !!o.spatial.reserved && v7ShapesOverlap(spatial, o.spatial);
    if (walls.length || reserved)
      blockers.push({
        id: o.id,
        kind: o.kind,
        predicate: reserved ? 'reserved-surface' : 'solid-obstacle',
        spatial: v7Json(o.spatial),
        intersections: v7Json(reserved ? [...walls, o.spatial] : walls),
      });
  }
  for (const a of c.world.actors.filter(
    (a) =>
      a.vitals.health > 0 &&
      (a.id === c.actor.id || observation.actors.some((v) => v.id === a.id)),
  )) {
    const body: V7Spatial = {
      ...a.position,
      angle: 0,
      shape: { kind: 'circle', radius: a.radius },
      solid: true,
      interaction: 0,
      entrances: [],
    };
    if (v7ShapesOverlap(spatial, body))
      blockers.push({
        id: a.id,
        kind: a.id === c.actor.id ? 'performer-body' : 'person',
        predicate: 'living-body',
        spatial: v7Json(body),
        intersections: [v7Json(body)],
        centerDistance: v7Distance(spatial, body),
        requiredCenterDistance: 0.4 + a.radius,
      });
  }
  for (const terrain of v7TerrainObstacles(c.world).filter(
    (s) => seen(s) && v7ShapesOverlap(spatial, s),
  ))
    blockers.push({
      id: `terrain:${String(Math.floor(terrain.x))},${String(Math.floor(terrain.y))}`,
      kind: 'terrain',
      predicate: 'solid-terrain',
      spatial: v7Json(terrain),
      intersections: [v7Json(terrain)],
    });
  const checks: V7Data[] = [];
  const add = (
    code: string,
    pass: boolean | null,
    observed: V7Data[string],
    required: V7Data[string],
    basis: string,
  ) =>
    checks.push({
      code,
      status: pass === null ? 'unknown' : pass ? 'pass' : 'fail',
      observed,
      required,
      basis,
    });
  add(
    'bounds',
    physical.inside,
    v7Json(spatial),
    'Entire radius 0.4 footprint inside world bounds.',
    'Existing construction predicate.',
  );
  add(
    'reach',
    physical.reach,
    {
      distanceToFootprint: physical.distance,
      actorRadius: c.actor.radius,
      actorPosition: v7Json(c.actor.position),
    },
    { maximumDistance: c.actor.radius + 0.65 },
    'Existing construction reach; your body must also clear the site.',
  );
  add(
    'observability',
    visible ? true : null,
    {
      visibleSamples: physical.samples.filter(seen).length,
      totalSamples: 9,
      visiblePerimeterSamples: perimeter.filter(seen).length,
      totalPerimeterSamples: 32,
    },
    'Local vision and enclosure line of sight across the proposed footprint.',
    'Visibility coverage, not a hidden-obstacle query.',
  );
  add(
    'support',
    visible ? physical.support : null,
    physical.samples.filter(seen),
    { excludedGround: ['~', '=', ','], maximumWaterlogging: 0.1 },
    'Unchanged nine-point support rule; unobservable support stays unknown.',
  );
  // Never disclose hidden identities or derive a failure from an unseen object.
  add(
    'clearance',
    blockers.length ? false : visible ? true : null,
    { blockers },
    'No living body, solid obstacle, solid terrain or reserved surface overlap. Nonsolid unreserved plants are not blockers.',
    'Observed intersections only. Unknown coverage cannot certify clearance. Construction always evaluates the complete live physical state.',
  );
  v7Spend(c.actor, 0.2);
  const result: V7Data = {
    assessmentId: v7Id(c.world, 'assessment'),
    tick: c.world.tick,
    actor: c.actor.id,
    contractRevision: 'root-air-drying@1:placement',
    site: v7Json(spatial),
    workArea: v7Json(spatial),
    contact: { interaction: 0.65, actorRadius: c.actor.radius },
    checks,
    suitable: checks.every((r) => r.status === 'pass'),
    failedChecks: checks
      .filter((r) => r.status === 'fail')
      .map((r) => r.code ?? ''),
    unresolvedChecks: checks
      .filter((r) => r.status === 'unknown')
      .map((r) => r.code ?? ''),
    costs: { rounds: 1, energy: 0.2 },
    remainingWork: 0,
    guarantee: false,
  };
  c.actor.extensionState[TRAY_CLEARANCE + ':result'] = v7Clone(result);
  c.actor.extensionState[TRAY_CLEARANCE + ':history'] = [
    ...trayClearanceHistory(c.actor),
    v7Clone(result),
  ].slice(-8);
  c.emit(
    'tray-clearance-assessed',
    'Paid dated placement evidence; no construction or reservation.',
    v7Clone(result),
    c.actor.id,
  );
  // A bounded vocabulary of physical predicates prevents reward farming by shifting coordinates or IDs.
  const facts = checks
    .filter(
      (r) =>
        typeof r.code === 'string' &&
        ['support', 'clearance'].includes(r.code) &&
        r.status !== 'unknown',
    )
    .map(
      (r) =>
        `${typeof r.code === 'string' ? r.code : ''}:${typeof r.status === 'string' ? r.status : ''}`,
    );
  if (blockers.some((b) => b.kind === 'performer-body'))
    facts.push('clearance:performer-body');
  const old = c.actor.extensionState[TRAY_CLEARANCE + ':learned-facts'];
  const prior = Array.isArray(old)
    ? old.filter((x): x is string => typeof x === 'string')
    : [];
  const novel = facts.filter((f) => !prior.includes(f));
  if (novel.length) {
    c.actor.extensionState[TRAY_CLEARANCE + ':learned-facts'] = [
      ...prior,
      ...novel,
    ];
    c.emit(
      'information-confirmed',
      'A paid observation established a previously unrecorded personal placement fact.',
      {
        qualified: true,
        participant: c.actor.id,
        practiceEligible: false,
        key: 'roots:tray:placement:' + v7Signature(novel),
        assessmentId: result.assessmentId ?? null,
        facts: novel,
      },
      c.actor.id,
    );
  }
  return { complete: true, writes: [] };
}
