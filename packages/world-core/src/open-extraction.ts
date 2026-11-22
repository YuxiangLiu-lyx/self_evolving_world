import type { V7ActionContext, V7Package, V7Data } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import { waterItem } from './open-water-state.js';
import { preservationTrayArea } from './open-preservation-physics.js';
import { assayNearby } from './open-assay-equipment.js';
import {
  extractionKey,
  extractionWork,
  extractionId,
  extractionEquipment,
  EXTRACTION_LIMIT,
} from './open-extraction-state.js';
import {
  extractionPrepare,
  extractionAdvance,
  extractionReading,
} from './open-extraction-work.js';
import {
  extractionProcess,
  extractionStop,
} from './open-extraction-process.js';
function execute(c: V7ActionContext) {
  const mode = c.action.args.mode;
  if (mode === 'prepare') return extractionPrepare(c);
  const arrays = c.action.args.apparatus;
  if (!Array.isArray(arrays))
    throw new Error('Apparatus must be an explicit array.');
  if (mode === 'inspect') {
    if (
      c.action.args.project !== '' ||
      c.action.args.quantityTenths !== 0 ||
      c.action.args.waterMl !== 0
    )
      throw new Error(
        'Inspect uses actual subjects only; unused project/quantities must be empty/zero.',
      );
    const rows: V7Data[] = [];
    for (const key of ['sample', 'reference', 'water']) {
      const ref = c.action.args[key];
      if (ref === '') continue;
      const s = waterItem(c.world, c.actor, v7String(ref, 'actual subject'));
      rows.push({
        id: s.id,
        resource: s.resource,
        quantity: s.quantity,
        cupCapacityMl: s.waterCup ? 100 : null,
        waterMl: s.waterCup?.waterMl ?? null,
        modeledComposition: !!s.physical,
        limitation: EXTRACTION_LIMIT,
      });
    }
    for (const raw of arrays) {
      const id = extractionId(c, raw),
        o = c.world.objects.find((o) => o.id === id);
      if (o) {
        assayNearby(c, id, o.kind);
        rows.push({
          id,
          kind: o.kind,
          halfTrayCapacity:
            o.kind === 'drying-tray'
              ? preservationTrayArea(c.world, o) * 0.1
              : null,
          resolution: o.data.resolution ?? null,
        });
      } else {
        const s = waterItem(c.world, c.actor, id);
        rows.push({
          id: s.id,
          resource: s.resource,
          capacityMl: s.waterCup ? 100 : null,
        });
      }
    }
    if (!rows.length)
      throw new Error(
        'Inspect requires a personally accessible actual subject.',
      );
    if (c.actor.vitals.energy < 0.2)
      return { complete: false, remaining: 1, writes: [] };
    v7Spend(c.actor, 0.2);
    c.emit(
      'extraction-inspected',
      'Inspected actual roles/capacities; model assumptions are not measured chemistry.',
      {
        subjects: rows,
        roles: [
          'calibrated balance',
          'original comparison weight',
          'tray with two disjoint half-area regions',
          'sample cup',
          'reference cup',
        ],
        model:
          'Root/tuber absent composition: 0.75 water; 0.20 dry matter extractable, half remaining per wet round.',
        limitation: EXTRACTION_LIMIT,
      },
    );
    return { complete: true, writes: [] };
  }
  if (
    c.action.args.sample !== '' ||
    c.action.args.reference !== '' ||
    c.action.args.water !== '' ||
    arrays.length ||
    c.action.args.quantityTenths !== 0 ||
    c.action.args.waterMl !== 0
  )
    throw new Error(
      'Read/resume/cancel/remove name only the existing personal project; all other fields are empty/zero.',
    );
  const j = extractionWork(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'project'),
  );
  if (mode === 'resume') return extractionAdvance(c, j);
  if (mode === 'cancel' || mode === 'remove') {
    if (mode === 'remove')
      extractionEquipment(
        c,
        [j.balance, j.weight, j.tray, ...j.arms.map((a) => a.cup)],
        extractionKey(j.owner, j.id),
      );
    extractionStop(
      c.world,
      j,
      'Controller ended; surviving altered material released once at its actual location, without work refunds.',
    );
    return {
      complete: true,
      writes: [j.tray, ...j.arms.flatMap((a) => [a.cup, a.tissue, a.liquid])],
    };
  }
  if (j.stage !== 8 || j.status !== 'passive')
    throw new Error(
      'Read requires this completed preparation and surviving passive trial.',
    );
  extractionEquipment(
    c,
    [j.balance, j.weight, j.tray, ...j.arms.map((a) => a.cup)],
    extractionKey(j.owner, j.id),
  );
  if (c.actor.vitals.energy < 1.2)
    return { complete: false, remaining: 1, writes: [] };
  const measurements = j.arms.map((a) => {
    const s = c.world.stacks.find((s) => s.id === a.liquid);
    if (!s) throw new Error('Actual residue is unavailable.');
    return extractionReading(c, j, s);
  });
  v7Spend(c.actor, 1.2);
  j.paid += 1.2;
  const previous = j.readings.at(-1),
    old = previous?.measurements as V7Data[] | undefined;
  const stable =
    !!old &&
    c.world.tick - Number(previous?.tick) >= 2 &&
    measurements.every((m, i) => {
      const p = old[i];
      return (
        p &&
        Number(m.lower) <= Number(p.upper) &&
        Number(p.lower) <= Number(m.upper)
      );
    });
  const result: V7Data = {
    tick: c.world.tick,
    measurements,
    stable,
    baseline: j.arms.map((a) => a.baseline),
    limits: [...new Set(j.invalid)],
    quantitativeExtractability: null,
    nutrition: null,
    hazards: null,
    interpretation:
      'Finite-resolution residue mass is observed. Existing porous cups have unmeasured transfer losses and unresolved contamination; no quantitative extractability or safety conclusion is supported.',
    limitation: EXTRACTION_LIMIT,
  };
  j.readings.push(result);
  c.emit(
    'extraction-reading',
    'Paid two actual weighings and retained interval results, unresolved controls and losses.',
    {
      operationId: extractionKey(j.owner, j.id),
      ...result,
      paidEnergy: j.paid,
      remainingWork: 0,
    },
    j.tray,
  );
  if (stable) {
    j.status = 'completed';
    c.emit(
      'extraction-completed',
      'Trial terminated with an evidence-limited result; no information reward or food certificate.',
      {
        operationId: extractionKey(j.owner, j.id),
        ...result,
        qualified: false,
        paidEnergy: j.paid,
      },
      j.tray,
    );
  }
  return { complete: true, writes: [j.balance] };
}
export const OPEN_EXTRACTION: V7Package = {
  id: 'noningestive-extractability',
  version: 1,
  scope: 'open-ex10',
  description:
    'Conserved controlled aqueous extraction with real porous vessels and explicit measurement limits.',
  dependencies: [
    'food-assay@1',
    'measured-food-preservation@1',
    'river-contact-water@1',
  ],
  reuse: {
    experiment: 'ex10 developments 2, 13 and 16',
    source: 'packages/world-core/src/open-assay-reading.ts',
    description:
      'Composes this run calibrated weighing, finite retained cup water, leakage and shared weather drying. No historical food skill, equipment, reference or mastery is inherited.',
  },
  abilities: [
    {
      id: 'noningestive-extractability',
      name: 'Controlled non-ingestive aqueous extraction',
      function:
        'Compare actual root/tuber extraction against an independently handled known-food reference; unresolved chemistry remains unknown.',
      equivalence: 'open:controlled-aqueous-extraction:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: ['inspect', 'prepare', 'read', 'resume', 'cancel', 'remove'],
        },
        project: { type: 'string' },
        sample: { type: 'string' },
        reference: { type: 'string' },
        water: { type: 'string' },
        apparatus: { type: 'array', items: { type: 'string' } },
        quantityTenths: { type: 'integer', minimum: 0 },
        waterMl: { type: 'integer', minimum: 0 },
      }),
      prerequisites: [
        'food-assay',
        'measured-food-preservation',
        'access-water',
      ],
      dependencies: {
        abilities: ['food-assay', 'measured-food-preservation', 'access-water'],
        resources: ['root', 'tuber', 'unfired-water-cup'],
        knowledge: [],
      },
      learning: 4,
      authored: false,
      handler: 'open.extraction-action',
      revision: 'noningestive-extractability@1',
      references: {
        sample: 'optional-exact-visible',
        reference: 'optional-exact-visible',
        water: 'optional-exact-visible',
      },
      practiceEvidence: 'extraction-completed',
      costs:
        'Exact IDs or one item:/object: prefix. Inspect actual subjects, empty project/zero amounts: 0.2 energy. Prepare new project, distinct owned sample/reference, personally known reference food, water=filled cup, apparatus=[balance,original weight,tray,cup1,cup2]. Positive food tenths and water ml PER ARM; water >= twice dry mass, each cup <=100 ml, each half-tray <=0.2 mass/area. Four handling stages per arm at 0.5 energy (8 paid stages total); contact >=2 elapsed rounds. Read costs 1.2 (0.2 plus two 0.5 weighings). Read/resume/cancel/remove: project only, others empty/zero.',
      effects:
        'Absent root/tuber composition initializes to 0.75 water; 0.20 dry matter extractable, half remainder per wet round. Declared assumptions, not measurements. Preserve actual lineage, age, nutrients/toxins and all separated/liquid/leaked solids. Existing porous cups leak/erode; unmeasured loss and contamination prevent quantitative conclusions. Two stable paid residue readings terminate an inconclusive trial. No safety, nutrient identity, detoxification, automatic edible product, mastery or completion reward.',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Pause preserves paid stages. Resume only remaining work; insufficient access/energy charges nothing. Installed leakage/drying/age continue. Cancel/death releases surviving altered material once; repetition needs new allocation.',
      },
    },
  ],
  handlers: { 'open.extraction-action': execute },
  processes: { 'open.extraction': extractionProcess },
  resources: [
    {
      id: 'extraction-material',
      name: 'Unresolved analytical material',
      mass: 0,
      nutrition: 0,
      toxicity: 0,
      color: '#b9a57a',
    },
  ],
  satisfaction: [],
  visualComponents: ['rock'],
  events: [
    'extraction-inspected',
    'extraction-progress',
    'extraction-reading',
    'extraction-completed',
    'extraction-invalidated',
    'extraction-stopped',
  ],
  beforeAction(w, a, action, continuing) {
    const id = a.extensionState['extraction:active'];
    if (typeof id !== 'string') return;
    if (
      action.interface !== 'noningestive-extractability' ||
      (!continuing && action.args.mode !== 'resume')
    ) {
      const j = extractionWork(w, a, id);
      if (j.stage < 8) j.status = 'paused';
      delete a.extensionState['extraction:active'];
    }
  },
  onDeath(w, a) {
    for (const p of w.processes.filter(
      (p) => p.handler === 'open.extraction' && p.owner === a.id,
    )) {
      const j = w.state[p.id] as unknown as ReturnType<typeof extractionWork>;
      extractionStop(
        w,
        j,
        'Owner died; surviving mixtures released, with no duplicated original food or refund.',
      );
    }
  },
  migrate(w) {
    w.state.extractionPhysics = 1;
    return w;
  },
};
