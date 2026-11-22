import type { V7Package, V7ActionContext } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import {
  assayEquipment,
  assayWork,
  assayReleaseWork,
} from './open-assay-equipment.js';
import {
  assayMeasure,
  assayDrying,
  assayDetach,
  assayStopDrying,
  dryingData,
} from './open-assay-drying.js';
function assay(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'assay mode');
  if (mode === 'protein-precipitation')
    throw new Error(
      'Unavailable chemical protocol: real clean vessels, measured solvent, verified soluble-protein reagent, characterized tannin reference, blank/negative controls and calibrated optical/volume equipment do not have validated production and detection-limit records in this world. A separately reviewed minimal implementation is required before chemical measurements; no sample or work was charged.',
    );
  if (mode === 'dry-mass') return assayMeasure(c);
  return assayEquipment(c);
}
export const OPEN_FOOD_ASSAY: V7Package = {
  id: 'food-assay',
  version: 1,
  scope: 'open-ex10',
  description:
    'Real precursor equipment and relative gravimetric analysis; chemical screening remains an unimplemented dependency contract.',
  dependencies: ['foundation-open@1', 'food-examination@1'],
  reuse: {
    experiment: 'ex10 current baseline and development 1',
    source: 'packages/world-core/src/open-foundation.ts',
    description:
      'Reuses the current-run knowledge recorder, reference resolver, fixed-point units, operation continuity and deterministic scheduling. No historical generated chemistry, food-safety conclusion, apparatus or personal mastery is inherited.',
  },
  abilities: [
    {
      id: 'food-assay',
      name: 'Relative food mass assay',
      function:
        'Prepare real comparison equipment, calibrate with retained stone pieces, and measure relative mass loss during real passive drying. Chemical screening is unavailable pending independently verified dependencies and implementation.',
      equivalence: 'open:calibrated-relative-food-gravimetry:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'prepare-balance',
              'prepare-dryer',
              'dry-mass',
              'protein-precipitation',
            ],
          },
          target: { type: 'string' },
          apparatus: { type: 'string' },
          controls: { type: 'array', items: { type: 'string' } },
          quantity: { type: 'number', minimum: 0.1 },
        }),
        required: ['mode', 'target', 'apparatus', 'controls'],
      },
      prerequisites: [],
      dependencies: {
        abilities: [],
        resources: ['branch', 'vine', 'bark', 'stone'],
        knowledge: [],
      },
      learning: 5,
      costs:
        'prepare-balance: target owned branch; controls explicitly allocate one vine stack, one bark stack, and two separate hard-stone items (first retained hammer, second 1-unit subdivision source); consumes 1 branch, 1 vine, 0.4 bark into balance, conserves 1 stone as five retained comparison pieces. Four assembly + two subdivision + three calibration rounds, 7.5 energy. prepare-dryer: target bark, controls [], apparatus empty; consumes 0.4 bark, two rounds and 1 energy. Empty apparatus for construction. Placement requires clear supported ground 0.65 east of performer. dry-mass: owned target, explicit balance apparatus, controls one retained calibrated weight, optional exact-tenths sample quantity (default 0.1); exactly one reachable tray. Preparation and each weighing cost 0.5 energy and one round; passive drying is free, conditions-dependent, at most 120 rounds. Balance service 200, wear 0.1 per reading; tray wear 0.01 per actual drying round. Missing energy/tool pauses without charges.',
      effects:
        'Two persistent apparatuses with geometry, inputs, comparison pieces and measured calibration history. Actual sample water changes physical carrying mass; original nutrition/toxin totals remain in food units. Three stable paid readings separated by three actual drying advances produce a relative residue estimate with uncertainty. Visible appearance, residue and negative results never establish safety. Action change cancels active handling and releases the altered ground sample; passive physical drying can continue while it remains on its tray, but supplies no automatic result or reward. Death stops this actor’s remaining assay process once. Partial constructed balance is retained uncalibrated; completing an interrupted assembly after its cancellation requires a new reviewed handling method, never free completion.',
      handler: 'open.food-assay',
      revision: 'food-assay@1',
      authored: false,
      references: { target: 'owned', apparatus: 'known' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Assembly has exact paid stages; drying completion is unknown until real stable measurements. Global checkpoints retain everything. Active handling cannot continue from a different action or position; spent work and water loss are never refunded. Controls use the shared owned-item resolver; exact resolved identities persist for ongoing work.',
      },
    },
  ],
  handlers: { 'open.food-assay': assay },
  processes: { 'open.assay-drying': assayDrying },
  resources: [],
  satisfaction: [],
  visualComponents: ['rock', 'plant'],
  events: [
    'food-assay-started',
    'assay-reading',
    'food-assay-completed',
    'assay-invalidated',
  ],
  beforeAction(w, a, action, continuing) {
    const j = assayWork(a);
    if (
      j &&
      (action.interface !== 'food-assay' ||
        !continuing ||
        a.position.x !== j.x ||
        a.position.y !== j.y)
    ) {
      assayDetach(w, a.id);
      assayReleaseWork(w, a, 'Active handling changed or performer moved.');
    }
  },
  onDeath(w, a) {
    for (const p of [...w.processes])
      if (
        p.handler === 'open.assay-drying' &&
        dryingData(p).originalActor === a.id
      )
        assayStopDrying(
          w,
          p,
          'Performer died; no automatic analytical continuation.',
        );
    assayReleaseWork(w, a, 'Performer died.');
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance) throw new Error('Missing shared understanding rule.');
    r.alternativeTriggers = [
      ...(r.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'food-assay' },
    ];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'food-assay' },
    ];
    return w;
  },
};
