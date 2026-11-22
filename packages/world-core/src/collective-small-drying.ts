import type { V7ActionContext, V7Package, V7Data } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Clone, v7String } from './continuous-data.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { rootProcessing } from './collective-root-food.js';
import { openRemember } from './open-foundation.js';
import { collectiveJobs, workResult } from './collective-work.js';
import { smallAssess } from './collective-small-drying-assessment.js';
import {
  SMALL_DRYING,
  smallSupportValidity,
  smallFoodEvidence,
} from './collective-small-drying-site.js';
import {
  smallAdvance,
  smallBeginBuild,
  smallBeginLoad,
  smallCurrent,
  smallStop,
} from './collective-small-drying-work.js';

function actual(c: V7ActionContext) {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args.supportId, 'supportId'),
      'visible',
    ),
    o = c.world.objects.find(
      (o) => o.id === id && o.kind === 'small-root-drying-support',
    );
  if (
    !o ||
    v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65
  )
    throw new Error('Move within actual reach of an existing small support.');
  return o;
}
function execute(c: V7ActionContext) {
  if (c.actor.vitals.health <= 0)
    throw new Error('A living performer is required.');
  const op = v7String(c.action.args.operation, 'operation');
  if (op === 'assess') return smallAssess(c);
  const j = smallCurrent(c);
  if (op === 'cancel') {
    if (!j || !c.action.args.processId)
      throw new Error('Name the exact personal ongoing process.');
    smallStop(
      c.world,
      c.actor,
      j,
      'Cancelled; paid progress and actual material remain at the site without refunds.',
    );
    return workResult(j);
  }
  if (['build', 'load', 'continue'].includes(op)) {
    if (j) {
      if (op !== 'continue' && c.operation?.first !== false)
        throw new Error(
          'Continue or cancel existing work before starting another operation.',
        );
      return smallAdvance(c, j);
    }
    if (op === 'continue')
      throw new Error('No actual ongoing personal operation.');
    return smallAdvance(
      c,
      op === 'build' ? smallBeginBuild(c) : smallBeginLoad(c, actual(c)),
    );
  }
  const o = actual(c),
    parts = c.world.stacks.filter((s) => s.reservedFor === o.id),
    food = parts.find((s) => s.id === o.data.foodId);
  if (op === 'inspect') {
    v7Spend(c.actor, 0.2);
    const evidence = {
      support: o.id,
      tick: c.world.tick,
      state: v7Clone(o.data),
      validity: smallSupportValidity(c.world, o),
      food: smallFoodEvidence(c.world, o),
    };
    c.actor.extensionState['root-small-drying:inspection'] = v7Clone(evidence);
    c.emit(
      'process-inspected',
      'Dated actual support and food; dryness does not imply safety.',
      evidence,
      o.id,
    );
    const record = o.data.loadRecord as V7Data | undefined,
      p = food ? rootProcessing(c.world, food) : null;
    if (
      record?.actor === c.actor.id &&
      Number(record.tick) < c.world.tick &&
      p &&
      p.history.length &&
      food?.physical &&
      food.physical.unitWater < Number(record.water) - 1e-8
    ) {
      openRemember(c, {
        key: 'root:small-support:measured-water-loss',
        subject: 'root',
        property: 'water loss on a ground-supported trial',
        value: {
          before: record,
          after: food.physical.unitWater,
          history: v7Clone(p.history),
        },
        method:
          'Personally loaded a paid sample and compared dated before/after exposure records',
        condition:
          'Actual recorded geometry, weather and composition assumptions; no safety or nutrition inference.',
        verified: true,
      });
      const e = c.world.events.at(-1);
      if (e?.type === 'information-confirmed') e.data.practiceEligible = false;
    }
    return { complete: true, writes: [] };
  }
  if (!['unload', 'dismantle'].includes(op))
    throw new Error('Unknown small-support operation.');
  if (o.data.activeWork)
    throw new Error('Finish or cancel actual work before moving materials.');
  if (op === 'dismantle' && food)
    throw new Error('Unload the actual sample before dismantling.');
  if (op === 'unload' && !food) throw new Error('No actual sample is loaded.');
  if (food) {
    const p = rootProcessing(c.world, food);
    if (
      p?.depositor !== c.actor.id &&
      c.world.actors.some((a) => a.id === p?.depositor && a.vitals.health > 0)
    )
      throw new Error(
        'Another living depositor owns this food; no automatic transfer.',
      );
  }
  v7Spend(c.actor, 0.5);
  const released = op === 'unload' && food ? [food] : parts;
  for (const s of released) {
    delete s.reservedFor;
    s.owner = op === 'unload' ? c.actor.id : null;
    s.position =
      op === 'unload'
        ? { ...c.actor.position }
        : { x: o.spatial.x, y: o.spatial.y };
    const p = rootProcessing(c.world, s);
    if (p) {
      p.tray = '';
      delete p.smallSupport;
    }
    if (op === 'dismantle')
      s.processing = {
        ...s.processing,
        collectiveWorkReleased: 'dismantled:' + o.id,
      };
  }
  o.data.foodId = null;
  o.data.food = null;
  if (op === 'dismantle')
    c.world.objects = c.world.objects.filter(
      (x) => x.id !== o.id && x.data.smallSupport !== o.id,
    );
  c.emit(
    op === 'unload' ? 'small-drying-unloaded' : 'small-drying-dismantled',
    'Actual retained material transferred once; no reset of age, moisture, wear or nutrients.',
    { support: o.id, items: released.map((s) => s.id), energy: 0.5 },
    o.id,
  );
  return { complete: true, writes: [o.id, ...released.map((s) => s.id)] };
}
export const SMALL_DRYING_PACKAGE: V7Package = {
  id: SMALL_DRYING,
  version: 1,
  scope: 'collective-ex12',
  description:
    'Small ground-supported sample drying with actual ballast, paid work and weather exchange.',
  dependencies: ['root-air-drying@1'],
  reuse: {
    experiment: 'ex12 root-air-drying and root-preparation-surface',
    source:
      'collective-root-food.ts; collective-root-physics.ts; collective-work.ts; collective-root-surface.ts',
    description:
      'Reuses existing nutrition, weather, fractional escrow and single-sheet representation. The small support is a separately requested interface, not a new discovery of those laws or an inherited recipe.',
  },
  abilities: [
    {
      id: SMALL_DRYING,
      name: 'Small ground-supported root drying',
      function:
        'Assess, build and use a real ground-supported bark sheet with half-unit stone ballast for one 0.1-root drying trial.',
      equivalence: 'roots:ground-supported:small-weather-drying:1',
      parameters: {
        ...v7ObjectSchema({
          operation: {
            type: 'string',
            enum: [
              'assess',
              'build',
              'load',
              'inspect',
              'unload',
              'dismantle',
              'cancel',
              'continue',
            ],
          },
          site: v7ObjectSchema({
            x: { type: 'number' },
            y: { type: 'number' },
          }),
          stoneIds: { type: 'array', items: { type: 'string' } },
          barkId: { type: 'string' },
          sampleId: { type: 'string' },
          assessmentId: { type: 'string' },
          supportId: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['operation'],
      },
      prerequisites: ['root-air-drying'],
      learning: 2,
      costs:
        'Assess: site{x,y},stoneIds,barkId,sampleId; one active round and 0.2 energy. Build from your retained assessmentId: reserve the whole actual sheet plus 0.5 stone from named stacks, two active rounds at 0.5 energy. Load supportId/sampleId: exactly 0.1 root, 0.2 proportional work and energy if raw; prior crushing reduces remaining work, with 0.1 transfer effort for fully crushed food. Continue/cancel name processId. Inspect costs one round/0.2 energy; unload or empty dismantle costs one round/0.5 energy.',
      effects:
        'Require an intact connected >=0.2 x0.2 m sheet, actual hard stone >=3, clear reachable firm ground and a safe unspoiled sample. Food area0.16 x0.16 m, exterior ballast margins0.02 m, maximum layer0.003 m. Existing geometry retained; absent geometry uses uncertain square-sheet model density500/thickness0.003. Absent food volume uses uncertain actual mass/density1000. Fragmented or combined separate sheets never become connected. Own body also blocks the site. Completed support has real solid ballast and a non-solid food surface. Passive evaporation is half the existing root rate, at most0.00025 mass/sample/round; wet ground, displaced ballast or collision pauses evaporation, while ageing and rain continue. Existing decay0.35 while actually dry, otherwise1.25; no nutrition/safety bonus. Shared use requires own mastery and actual empty support; living depositor retains food. Unloaded food follows existing loose-food exposure and carrying cost. Interrupted work retains costs; cancellation/death releases surviving partial material on the ground once with source-owner provenance. Empty dismantle/rebuild is paid maintenance, with no automatic wear reset or repair.',
      handler: 'collective.small-drying',
      revision: SMALL_DRYING + '@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact process/support IDs, actual reserved materials, completed/remaining work and paid energy; repeat is complete operations. Only explicit inspection of a personally performed trial can confirm new measured water loss.',
      },
      dependencies: {
        abilities: ['root-air-drying'],
        resources: ['root', 'stone', 'bark'],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.small-drying': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['small-root-drying'],
  events: [
    'small-drying-assessed',
    'small-drying-built',
    'small-drying-loaded',
    'small-drying-progress',
    'small-drying-stopped',
    'small-drying-unloaded',
    'small-drying-dismantled',
    'information-confirmed',
    'process-inspected',
    'process-progress',
    'food-rewetted',
  ],
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Canonical understanding source unavailable.');
    const t = { event: 'information-confirmed', interface: SMALL_DRYING };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
  beforeAction(w, a, action) {
    if (action.interface !== SMALL_DRYING)
      for (const j of collectiveJobs(w, SMALL_DRYING).filter(
        (j) => j.owner === a.id && j.status === 'active',
      ))
        j.status = 'paused';
  },
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, SMALL_DRYING).filter((j) =>
      ['active', 'paused'].includes(j.status),
    )) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (
        a &&
        (!w.objects.some((o) => o.id === j.target) ||
          j.escrow.some(
            (id) =>
              !w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
          ))
      )
        smallStop(
          w,
          a,
          j,
          'Support or perishable input lost; actual surviving material released once.',
        );
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, SMALL_DRYING).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      smallStop(
        w,
        a,
        j,
        'Performer died; actual partial work released at site once. Completed supports retain passive physics.',
      );
  },
};
