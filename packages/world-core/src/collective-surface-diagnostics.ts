import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7Signature,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Inside,
  v7Walls,
  v7Obstacles,
  v7SegmentClear,
  v7ShapeDistance,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { openConditions } from './open-physical.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  surfaceGeometry,
  surfaceOwned,
  surfaceRemember,
} from './collective-root-surface.js';

export const SURFACE_DIAGNOSTICS = 'root-surface-diagnostics';
const HISTORY = 'root-surface-diagnostics:history';
const RESULT = 'root-surface-diagnostics:result';
interface Check extends V7Data {
  code: string;
  status: 'pass' | 'fail' | 'unknown';
  observed: V7Data[string];
  required: V7Data[string];
  evidenceIds: string[];
  basis: string;
}
export function surfaceDiagnosticHistory(a: V7Actor): V7Data[] {
  const value = a.extensionState[HISTORY];
  return Array.isArray(value)
    ? value
        .filter(
          (v): v is V7Data => !!v && typeof v === 'object' && !Array.isArray(v),
        )
        .map(v7Clone)
    : [];
}
export function surfaceDiagnosticResult(a: V7Actor): V7Data | null {
  const value = a.extensionState[RESULT];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? v7Clone(value)
    : null;
}
function save(a: V7Actor, result: V7Data) {
  a.extensionState[RESULT] = v7Clone(result);
  a.extensionState[HISTORY] = [
    ...surfaceDiagnosticHistory(a),
    v7Clone(result),
  ].slice(-8);
}
/** Legacy personal evidence is retained as unknown detail, never reconstructed from today's objects. */
export function migrateSurfaceDiagnostics(w: V7World) {
  for (const a of w.actors) {
    if (a.extensionState[HISTORY]) continue;
    const rows = Object.values(a.memory.knowledge ?? {}).filter((k) =>
      k.key.startsWith('bark:grounded-root-surface:assessed:'),
    );
    for (const k of rows) {
      save(a, {
        assessmentId: `legacy:${a.id}:${k.key}`,
        tick: k.tick,
        legacy: true,
        suitable: null,
        priorClaim: v7Json(k.value),
        site: null,
        geometry: null,
        checks: [
          {
            code: 'legacy-diagnostics',
            status: 'unknown',
            observed: null,
            required: 'An assessment-time checklist',
            evidenceIds: [k.key],
            basis:
              'Legacy personal finding retained; requirement-level evidence and historical site were not recorded here.',
          },
        ],
        failedChecks: [],
        unresolvedChecks: ['legacy-diagnostics'],
        remainingWork: 0,
      });
    }
  }
}
export function diagnoseSurface(c: V7ActionContext) {
  if (c.actor.vitals.health <= 0)
    throw new Error(
      'A living performer is required before assessment commitment.',
    );
  const retainedId = c.action.args.assessmentId;
  if (retainedId !== undefined) {
    if (typeof retainedId !== 'string')
      throw new Error('Use an exact retained personal assessment ID.');
    const old = surfaceDiagnosticHistory(c.actor).find(
      (r) => r.assessmentId === retainedId,
    );
    if (!old) throw new Error('No such retained personal assessment.');
    v7Spend(c.actor, 0.2);
    c.actor.extensionState[RESULT] = v7Clone(old);
    c.emit(
      'root-surface-assessed',
      'Read an unchanged dated personal assessment; no current-state assessment or new feedback.',
      {
        ...v7Clone(old),
        readAt: c.world.tick,
        historicalRead: true,
        costs: { rounds: 1, energy: 0.2 },
      },
      c.actor.id,
    );
    const e = c.world.events.at(-1);
    if (e) e.position = null;
    return { complete: true, writes: [] };
  }
  // Resolve both authorizations before constructing any material result. The shared resolver supplies only observable candidates.
  const sheet = surfaceOwned(c, 'barkId'),
    stone = surfaceOwned(c, 'toolId');
  const checks: Check[] = [];
  const check = (
    code: string,
    pass: boolean | null,
    observed: V7Data[string],
    required: V7Data[string],
    evidenceIds: string[],
    basis: string,
  ) => {
    checks.push({
      code,
      status: pass === null ? 'unknown' : pass ? 'pass' : 'fail',
      observed,
      required,
      evidenceIds,
      basis,
    });
  };
  check(
    'ownership-availability',
    true,
    {
      sheet: sheet.id,
      tool: stone.id,
      sheetQuantity: sheet.quantity,
      toolQuantity: stone.quantity,
    },
    'Actually owned, unreserved and at least 0.1 units of each referenced implement.',
    [sheet.id, stone.id],
    'Shared exact-reference and real ownership checks; carried implements move with their owner.',
  );
  let geometry: V7Data | null = null;
  try {
    geometry = surfaceGeometry(c.world, sheet);
  } catch (error: unknown) {
    check(
      'sheet-geometry',
      null,
      error instanceof Error ? error.message : 'Unavailable geometry.',
      'An established connected sheet with mass-conserving dimensions.',
      [sheet.id],
      'Existing geometry rules; missing evidence is not fabricated.',
    );
  }
  if (geometry)
    check(
      'sheet-geometry',
      true,
      geometry,
      'Retained represented geometry or the registered single-lot model.',
      [sheet.id],
      typeof geometry.basis === 'string'
        ? geometry.basis
        : 'Unknown geometry basis.',
    );
  check(
    'sheet-continuity-condition',
    geometry
      ? geometry.connected === true &&
          Number(geometry.holes) <= 0 &&
          Number(geometry.condition) >= 0.8
      : null,
    geometry
      ? {
          connected: geometry.connected ?? null,
          holes: geometry.holes ?? null,
          condition: geometry.condition ?? null,
        }
      : null,
    { connected: true, maximumHoles: 0, minimumCondition: 0.8 },
    [sheet.id],
    'Existing containing-sheet prerequisite; modeling assumptions remain labeled.',
  );
  check(
    'sheet-dimensions',
    geometry
      ? Number(geometry.width) >= 0.16 && Number(geometry.height) >= 0.16
      : null,
    geometry
      ? { width: geometry.width ?? null, height: geometry.height ?? null }
      : null,
    { minimumWidth: 0.16, minimumHeight: 0.16 },
    [sheet.id],
    'Existing rectangle including containment margin.',
  );
  const flexibility = collectiveFoodProfile(c.world, sheet)?.properties
    ?.flexibility;
  check(
    'sheet-flexibility',
    flexibility === undefined ? null : flexibility >= 1,
    flexibility ?? null,
    { minimum: 1 },
    [sheet.id],
    'Resolved runtime material property used by the existing rule; not a personal flexibility measurement.',
  );
  const hardness = collectiveFoodProfile(c.world, stone)?.properties?.hardness;
  check(
    'tool-hardness',
    hardness === undefined ? null : hardness >= 3,
    hardness ?? null,
    { minimum: 3 },
    [stone.id],
    'Resolved runtime material property; this check does not claim a physical hardness measurement.',
  );
  check(
    'tool-form-quantity',
    stone.resource === 'stone' &&
      stone.quantity >= 1 &&
      !stone.processing?.wovenDamage &&
      !stone.processing?.gravimetricAssay,
    {
      resource: stone.resource,
      quantity: stone.quantity,
      damaged: !!stone.processing?.wovenDamage,
      assayAltered: !!stone.processing?.gravimetricAssay,
    },
    {
      resource: 'stone',
      minimumQuantity: 1,
      damaged: false,
      assayAltered: false,
    },
    [stone.id],
    'Unchanged usable-stone prerequisite.',
  );
  check(
    'personal-contact-inspection',
    true,
    'Not separately required by this preparation interface.',
    'No new inspection prerequisite.',
    [stone.id],
    'Bark extraction has its own contact inspection. That separate capability requirement is not imported here.',
  );
  const radius = geometry
    ? Math.max(
        0.2,
        Math.hypot(Number(geometry.width), Number(geometry.height)) / 2,
      )
    : 0.2;
  const raw = c.action.args.site;
  if (
    raw !== undefined &&
    (!raw || typeof raw !== 'object' || Array.isArray(raw))
  )
    throw new Error('Site requires actual x and y coordinates.');
  const site = raw as V7Data | undefined;
  const spatial: V7Spatial = {
    x: site
      ? v7Number(site.x, 'site x')
      : c.actor.position.x + c.actor.radius + radius + 0.05,
    y: site ? v7Number(site.y, 'site y') : c.actor.position.y,
    angle: 0,
    shape: { kind: 'circle', radius },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const inside = v7Inside(c.world, spatial, radius),
    distance = v7ShapeDistance(c.actor.position, spatial),
    reachable = inside && distance <= c.actor.radius + 0.65;
  check(
    'bounds',
    inside,
    v7Json(spatial),
    'Entire represented footprint inside the world.',
    [],
    'Shared world geometry.',
  );
  check(
    'reach',
    reachable,
    { distanceToFootprint: distance, actorRadius: c.actor.radius },
    { interactionDistance: 0.65 },
    [c.actor.id],
    'Shared shape-distance query from the actual body.',
  );
  const samples = reachable
    ? [-radius, 0, radius].flatMap((dx) =>
        [-radius, 0, radius].map((dy) => {
          const p = { x: spatial.x + dx, y: spatial.y + dy },
            local = openConditions(c.world, p);
          return {
            ...p,
            ground: local.ground,
            waterlogging: local.waterlogging,
          };
        }),
      )
    : [];
  check(
    'support',
    reachable
      ? samples.every(
          (p) => !['~', '=', ','].includes(p.ground) && p.waterlogging <= 0.1,
        )
      : null,
    samples,
    { excludedGround: ['~', '=', ','], maximumWaterlogging: 0.1 },
    [],
    'Existing nine-point local support and waterlogging checks; unreachable support is not inspected remotely.',
  );
  const observation = v7Observe(c.world, c.actor.id);
  const objects = c.world.objects.filter(
    (o) =>
      (o.spatial.reserved && v7ShapesOverlap(spatial, o.spatial)) ||
      v7Walls(o.spatial).some((wall) => v7ShapesOverlap(spatial, wall)),
  );
  const people = c.world.actors
    .filter((a) => a.vitals.health > 0)
    .map((a) => ({
      id: a.id,
      spatial: {
        ...a.position,
        angle: 0,
        shape: { kind: 'circle' as const, radius: a.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      },
    }))
    .filter((a) => v7ShapesOverlap(spatial, a.spatial));
  const blockers = reachable
    ? [
        ...objects.map((o) => ({
          id: observation.objects.some((v) => v.id === o.id) ? o.id : null,
          kind: 'object',
          spatial: observation.objects.some((v) => v.id === o.id)
            ? v7Json(o.spatial)
            : null,
        })),
        ...people.map((a) => ({
          id:
            a.id === c.actor.id || observation.actors.some((v) => v.id === a.id)
              ? a.id
              : null,
          kind: a.id === c.actor.id ? 'performer-body' : 'person',
          spatial:
            a.id === c.actor.id || observation.actors.some((v) => v.id === a.id)
              ? v7Json(a.spatial)
              : null,
        })),
      ]
    : [];
  const ids = blockers.flatMap((b) => (b.id ? [b.id] : []));
  const solidOverlap =
    reachable && v7Obstacles(c.world).some((o) => v7ShapesOverlap(spatial, o));
  check(
    'clearance',
    reachable && geometry
      ? !solidOverlap && !objects.length && !people.length
      : null,
    {
      blockers,
      unidentifiedPhysicalObstruction: solidOverlap && !objects.length,
    },
    'No overlap with actual solid obstacles, reserved work or living bodies, including the performer.',
    ids,
    'Shared shape overlap; only locally observable blocker identities/geometry are disclosed. Unknown sheet extent prevents a final clearance verdict.',
  );
  check(
    'access',
    reachable
      ? v7SegmentClear(c.actor.position, spatial, 0, v7Obstacles(c.world))
      : null,
    reachable
      ? { start: v7Json(c.actor.position), end: { x: spatial.x, y: spatial.y } }
      : null,
    'Unobstructed direct access to the supporting patch.',
    [],
    'Unchanged access predicate; no remote survey.',
  );
  const failedChecks = checks
      .filter((x) => x.status === 'fail')
      .map((x) => x.code),
    unresolvedChecks = checks
      .filter((x) => x.status === 'unknown')
      .map((x) => x.code);
  // All checks are complete before the atomic debit and result commitment.
  v7Spend(c.actor, 0.2);
  const result: V7Data = {
    assessmentId: v7Id(c.world, 'assessment'),
    tick: c.world.tick,
    actor: c.actor.id,
    sheetId: sheet.id,
    toolId: stone.id,
    site: v7Json(spatial),
    geometry,
    checks: v7Json(checks),
    suitable: !failedChecks.length && !unresolvedChecks.length,
    failedChecks,
    unresolvedChecks,
    geometryRevision: v7Signature({
      site: v7Json(spatial),
      geometry,
      checks: v7Json(checks),
    }),
    costs: { rounds: 1, energy: 0.2 },
    remainingWork: 0,
    commitment:
      'One paid round completed atomically; no escrow or automatic continuation.',
  };
  if (geometry) {
    sheet.processing ??= {};
    sheet.processing.rootSurface = v7Clone(geometry);
  }
  save(c.actor, result);
  c.emit(
    'root-surface-assessed',
    'Recorded independent pass, fail and unknown checks at the actual assessment boundary.',
    v7Clone(result),
    sheet.id,
  );
  if (geometry) surfaceRemember(c, geometry, result.suitable === true);
  return { complete: true, writes: geometry ? [sheet.id] : [] };
}
