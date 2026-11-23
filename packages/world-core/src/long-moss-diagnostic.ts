import { mossRepresentation as represented } from './long-moss-representation.js';
import type {
  V7ActionContext,
  V7Data,
  V7Package,
  V7Spatial,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { rootPlacement } from './collective-tray-placement.js';
import { longPlantingSite } from './long-planting-site.js';

const ID = 'moss-prepared-surface-diagnostic';
const SOURCE = 'surface-38-moss-234',
  DEPOSIT = 'residue-deposit-49-moss-298';
function execute(c: V7ActionContext) {
  const surface = c.world.objects.find(
    (o) => o.id === c.action.args.preparedSurfaceId,
  );
  if (
    c.actor.id !== 'moss' ||
    !surface ||
    surface.id !== SOURCE ||
    surface.createdBy !== 'moss' ||
    surface.revision !== 'small-soil-patch-preparation@1' ||
    surface.spatial.x !== 14 ||
    surface.spatial.y !== 12.5 ||
    surface.spatial.shape.kind !== 'circle' ||
    surface.spatial.shape.radius !== 0.2
  )
    throw new Error(
      'This diagnostic requires Moss and the exact nominated prepared surface.',
    );
  if (
    !v7Inside(c.world, surface.spatial, 0.2) ||
    v7Distance(c.actor.position, surface.spatial) > c.actor.radius + 0.65 ||
    !v7Visible(c.world, c.actor.position, surface.spatial)
  )
    throw new Error(
      'Reach the visible in-bounds nominated footprint before examining it.',
    );
  if (c.actor.vitals.energy < 0.5)
    throw new Error('The examination requires 0.5 energy.');
  const seen = v7Observe(c.world, c.actor.id),
    footprint = { ...surface.spatial, reserved: true };
  let material: ReturnType<typeof represented> | null = null,
    limitation: string | null = null;
  try {
    material = represented(
      surface,
      seen.objects.find((o) => o.id === DEPOSIT),
    );
  } catch (e) {
    limitation =
      e instanceof Error ? e.message : 'Constituent representation is unknown.';
  }
  const circle = (x: number, y: number, radius: number): V7Spatial => ({
    x,
    y,
    angle: 0,
    shape: { kind: 'circle', radius },
    solid: true,
    interaction: 0,
    entrances: [],
  });
  const parts = [
    ...(material?.parts ?? []),
    ...seen.objects
      .filter(
        (o) =>
          o.id !== SOURCE &&
          o.id !== DEPOSIT &&
          (o.spatial.solid || o.spatial.reserved),
      )
      .map((o) => ({ ref: o.id, shape: { ...o.spatial, solid: true } })),
    ...seen.stacks
      .filter((s) => s.owner === null && s.quantity > 0)
      .map((s) => ({
        ref: s.id,
        shape: circle(s.position.x, s.position.y, 0.05),
      })),
    ...c.world.actors
      .filter(
        (a) =>
          (a.id === c.actor.id || seen.actors.some((p) => p.id === a.id)) &&
          a.vitals.health > 0,
      )
      .map((a) => ({
        ref: a.id,
        shape: circle(a.position.x, a.position.y, a.radius),
      })),
    ...[surface, ...seen.objects.filter((o) => o.id === DEPOSIT)]
      .filter((o) => o.spatial.solid || o.spatial.reserved || o.data.activeWork)
      .map((o) => ({ ref: o.id, shape: { ...o.spatial, solid: true } })),
  ];
  const obstructions = parts.flatMap(({ ref, shape }) => {
    const inFootprint = v7ShapesOverlap(footprint, shape),
      inRoute =
        ref !== c.actor.id &&
        !v7SegmentClear(
          c.actor.position,
          surface.spatial,
          0.01,
          [shape],
          c.work,
        );
    return inFootprint || inRoute
      ? [{ ref, geometry: shape, footprint: inFootprint, route: inRoute }]
      : [];
  });
  const placement = rootPlacement(c.world, c.actor, footprint, 0.2),
    ordinary = longPlantingSite(c.world, c.actor, footprint);
  const unclassified = seen.objects
    .filter(
      (o) =>
        o.id !== SOURCE &&
        o.id !== DEPOSIT &&
        !o.spatial.solid &&
        !o.spatial.reserved &&
        (v7ShapesOverlap(footprint, o.spatial) ||
          !v7SegmentClear(
            c.actor.position,
            surface.spatial,
            0.01,
            [{ ...o.spatial, solid: true }],
            c.work,
          )),
    )
    .map((o) => ({ ref: o.id, geometry: o.spatial }));
  const fullRoute = v7SegmentClear(
    c.actor.position,
    surface.spatial,
    0.01,
    v7Obstacles(c.world),
    c.work,
  );
  const blocked =
    obstructions.length > 0 ||
    (material && (material.cover > 0 || material.residue > 0));
  const uncertain =
    !material ||
    !placement.support ||
    !placement.clearance ||
    !fullRoute ||
    unclassified.length > 0;
  const report = {
    actor: c.actor.id,
    tick: c.world.tick,
    target: SOURCE,
    method: 'paid local prepared-surface constituent and access examination',
    paidEnergy: 0.5,
    rounds: 1,
    observedRevision: surface.revision,
    observedState: v7Json({
      source: surface.data,
      deposit: seen.objects.find((o) => o.id === DEPOSIT)?.data ?? null,
    }),
    physicalClearance: blocked
      ? 'observed obstruction'
      : uncertain
        ? 'inconclusive'
        : 'no obstruction observed',
    obstructions,
    unclassifiedNearbyGeometry: unclassified,
    material: material
      ? {
          cover: material.cover,
          residue: material.residue,
          deposit: material.mass,
          initial: material.initial,
        }
      : null,
    implementationSupport: {
      ordinaryEligible: ordinary.error === null,
      ordinaryLimitation: ordinary.error,
      preparedPlacement:
        'Existing prepared-surface-root-placement@1 is bound to Lin and a different surface. This diagnostic supplies no placement operation or permission.',
    },
    limitation:
      limitation ??
      (uncertain && !blocked
        ? 'Full support or access is not established by these visible facts; no unseen obstruction is identified.'
        : null),
    qualified: false,
    complete: true,
    unknowns: [
      'future occupancy',
      'root availability and freshness',
      'deeper substrate',
      'viability and propagation',
    ],
  };
  v7Spend(c.actor, 0.5);
  c.emit(
    'prepared-surface-diagnosed',
    'Completed a dated diagnostic examination; physical findings and implementation support remain separate.',
    v7Json(report) as V7Data,
    SOURCE,
  );
  c.actor.memory.knowledge ??= {};
  const key = 'prepared-diagnostic:' + SOURCE;
  c.actor.memory.knowledge[key] = {
    key,
    subject: SOURCE,
    property: 'dated physical clearance and implementation support',
    value: v7Json(report),
    method: report.method,
    condition:
      'local current observation only; no certification or granted operation',
    verified: false,
    tick: c.world.tick,
    evidence: c.world.events.at(-1)?.id ?? '',
  };
  return { complete: true, writes: [] };
}
export const LONG_MOSS_DIAGNOSTIC: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'soil-worksite-assessment@1',
    'prepared-surface-root-placement@1',
    'moss-surface-residue-transfer@1',
  ],
  description:
    'A source-bound non-destructive paid diagnostic; no planting, permission change or physical output.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-site-assessment.ts; long-prepared-site.ts; collective-tray-placement.ts; long-planting-site.ts',
    description:
      'Reuses private dated examination, complete constituent geometry and existing placement checks. Adds diagnostic separation of represented matter and interface applicability, not a new planting function.',
  },
  abilities: [
    {
      id: ID,
      name: 'Examine the prepared surface compatibility',
      function:
        'Examine Moss surface-38-moss-234 and its conserved residue links to distinguish observed obstruction, uncertainty and unsupported placement applicability.',
      equivalence: 'prepared-surface:private-diagnostic:moss-source:1',
      parameters: v7ObjectSchema({ preparedSurfaceId: { type: 'string' } }),
      references: { preparedSurfaceId: 'optional-exact-visible' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'One study round and 0.2 energy; each valid atomic examination costs one round and 0.5 energy, with no root or material input/output. Invalid identity, scope, reach or energy does not charge.',
      effects:
        'Private dated report of actual visible geometry, complete conserved source data and implementation applicability. No planting, clearing, resource, reservation, mastery, viability or wellbeing grant. Repeating pays again without reward. No ongoing process or maintenance; cancel/interruption/death before execution has no completed finding; after completion, finding and paid effort persist without refund. Only actual communication can share knowledge.',
      handler: 'long.moss-prepared-diagnostic',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'prepared-diagnostic-qualified-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic non-destructive paid examination; no escrow, resume or unattended retries.',
      },
    },
  ],
  handlers: { 'long.moss-prepared-diagnostic': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'prepared-surface-diagnosed',
    'prepared-diagnostic-qualified-practice',
  ],
};
