import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7Number } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import {
  JOIN_ID as ID,
  JOIN_REV as REV,
  JOIN_VINE,
  JOIN_BRANCH,
  installJoinGeometry,
  joinSources,
  measuredGeometry,
} from './long-joining-geometry.js';
import { joiningWork, joiningDeath, joinSite } from './long-joining-work.js';
function execute(c: V7ActionContext) {
  if (c.actor.id !== 'lin')
    throw new Error(
      'This source-bound trial applies only to the reviewed Lin sources; no individual knowledge is transferred.',
    );
  const mode = c.action.args.mode;
  if (typeof mode !== 'string')
    throw new Error('Supply a known operation mode.');
  if (['wrap', 'resume', 'cancel'].includes(mode)) return joiningWork(c);
  if (mode === 'separate')
    throw new Error(
      'Separation is unavailable: no calibrated force measurement, bounded actuator or reaction support exists. A probe intensity is not force. No test or charge performed.',
    );
  if (mode === 'assess') {
    if (
      c.action.args.vineStackId !== JOIN_VINE ||
      c.action.args.branchStackId !== JOIN_BRANCH
    )
      throw new Error('Name both exact nominated owned source lots.');
    joinSources(c);
    const p = {
      x: v7Number(c.action.args.x, 'x'),
      y: v7Number(c.action.args.y, 'y'),
    };
    joinSite(c, p);
    const report = measuredGeometry(c);
    v7Spend(c.actor, 0.5);
    c.emit(
      'joining-geometry-measured',
      'Paid local piece and continuity examination; approximate dimensions, not strength or calibrated metrology.',
      { ...p, paidEnergy: 0.5, pieceCount: 3, qualified: false },
    );
    c.actor.memory.knowledge ??= {};
    c.actor.memory.knowledge['joining-geometry'] = {
      key: 'joining-geometry',
      subject: REV,
      property: 'approximate source-bound piece geometry',
      value: report,
      method: 'direct visual body-scale comparison',
      condition: 'these unchanged surviving sources only',
      verified: false,
      tick: c.world.tick,
      evidence: c.world.events.at(-1)?.id ?? '',
    };
    return { complete: true, writes: [] };
  }
  if (!['inspect', 'recover'].includes(mode))
    throw new Error('Unsupported joining operation.');
  const o = c.world.objects.find(
    (o) => o.id === c.action.args.arrangementId && o.revision === REV,
  );
  if (!o || v7Distance(c.actor.position, o.spatial) > 0.65)
    throw new Error('Reach the exact extant arrangement.');
  const sources = joinSources(c, o.id);
  joinSite(c, o.spatial, o);
  if (mode === 'inspect') {
    v7Spend(c.actor, 0.2);
    c.emit(
      'joining-inspected',
      'Inspected actual local arrangement; no force or practical benefit inferred.',
      {
        arrangementId: o.id,
        stage: o.data.stage ?? null,
        paidEnergy: 0.2,
        qualified: false,
      },
      o.id,
    );
    return { complete: true, writes: [] };
  }
  if (o.data.activeWork)
    throw new Error(
      'Complete or cancel the exact unfinished process before recovery.',
    );
  v7Spend(c.actor, 0.5);
  for (const s of sources) {
    delete s.reservedFor;
    s.owner = c.actor.id;
    s.position = { ...c.actor.position };
  }
  c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  // This loose, unknotted kinematic operation has no cutting, damage or force law.
  // Recovery unfolds the same intact portions; no strength or condition is reset.
  c.emit(
    'joining-recovered',
    'Paid local unwrapping and retrieval recovered the same surviving whole identities.',
    {
      arrangementId: o.id,
      paidEnergy: 0.5,
      recovered: v7Json(
        sources.map((s) => ({ id: s.id, quantity: s.quantity })),
      ),
      qualified: false,
    },
    o.id,
  );
  return { complete: true, writes: [o.id, ...sources.map((s) => s.id)] };
}
export const LONG_JOINING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['recoverable-vine-joining-assessment@1'],
  description:
    'Source-bound physical piece model, approximate paid observation and conserved recoverable loose wrapping; no calibrated force or structural law.',
  reuse: {
    experiment: 'ex13; ex10 implementation pattern',
    source:
      'long-join-assessment.ts; open-material-geometry.ts; collective-work.ts; continuous-geometry.ts',
    description:
      'Reuses previous assessment and paid-work primitives. The deterministic source-slot modeling pattern is adapted from historical material geometry; historical packages are not activated. Dimensions and continuity are explicit new versioned model assumptions, not independently rediscovered implementation or old measurements. No destructive open.probe trial is invoked.',
  },
  abilities: [
    {
      id: ID,
      name: 'Source-bound geometry and loose wrapping',
      function:
        'Examine actual piece geometry of Lin nominated surviving vine and branches, then optionally position, loosely wrap, inspect and recover those whole pieces.',
      equivalence: 'joining:source-bound-measure-and-loose-wrap:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'assess',
              'wrap',
              'inspect',
              'recover',
              'resume',
              'cancel',
              'separate',
            ],
          },
          vineStackId: { type: 'string' },
          branchStackId: { type: 'string' },
          measurementId: { type: 'string' },
          branchPieceA: { type: 'string' },
          branchPieceB: { type: 'string' },
          vinePiece: { type: 'string' },
          segmentStart: { type: 'number' },
          segmentEnd: { type: 'number' },
          x: { type: 'number' },
          y: { type: 'number' },
          processId: { type: 'string' },
          arrangementId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        vineStackId: 'optional-owned',
        branchStackId: 'optional-owned',
        arrangementId: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Study2 rounds at0.2 energy each. Assess(vineStackId=item-66-lin-388,branchStackId=item-76-lin-448,x,y):1 round/0.5 energy; no consumption. Query personal knowledge joining-geometry for measurement event/piece IDs. Wrap(measurementId,branchPieceA,branchPieceB,vinePiece,segmentStart=0,segmentEnd=1,x,y):2 rounds at0.5 energy, first actual placement then loose unknotted wrap. Entire0.9 vine section and two branches allocated; no arbitrary fractional cut. Inspect(arrangementId):1 round/0.2 energy. Recover(arrangementId):1 round/0.5 energy. Resume/cancel require exact processId. Clear radius0.2 footprint within0.65; all extents must fit/reach. Separate is explicitly unavailable without calibrated measurement, actuator and reaction support; no force result or charge.',
      effects:
        'New deterministic physical model reconciles only nominated surviving sources, with no stock or mastery. Paid direct body-scale observation gives approximate world-distance dimensions, resolution0.02/uncertainty0.01, visible continuity and whole endpoints0..1. This is not calibrated SI metrology or a strength measurement. Changed source quantities/processing invalidate geometry. Only entire measured pieces can be placed; original identities leave inventory and remain conserved in the actual arrangement. Two paid stages preserve process and remaining labor. Actual obstruction or insufficient energy pauses before further charge. Cancel/death ends work while placed matter persists in containment, never free recovery or remote return. Recovery preserves source identity, quantity and condition; no damage/strength restoration. This kinematic loose-wrap model does not implement tension, friction, calibrated forces, knots, durability, functional tool or utility. No passive work, upkeep charge, pleasure or satisfaction. No historical skill inheritance.',
      handler: 'long.joining',
      revision: REV,
      authored: false,
      practiceEvidence: 'joining-qualified',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Assessment/inspection/recovery atomic. Wrap has two paid stages, retained physical placement, exact processId and remaining work. Separate unavailable.',
      },
    },
  ],
  handlers: { 'long.joining': execute },
  resources: [],
  satisfaction: [],
  processes: {},
  visualComponents: ['loose-wrap'],
  events: [
    'joining-geometry-measured',
    'joining-positioned',
    'joining-wrapped',
    'joining-inspected',
    'joining-recovered',
    'joining-qualified',
  ],
  migrate: installJoinGeometry,
  onDeath: joiningDeath,
};
