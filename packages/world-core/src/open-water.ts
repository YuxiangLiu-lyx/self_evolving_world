import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { waterExecute } from './open-water-execution.js';
import { waterActive, waterStop } from './open-water-work.js';
import { cupAdvance, cupImpacts } from './open-water-cup.js';
export const OPEN_WATER: V7Package = {
  id: 'river-contact-water',
  version: 1,
  scope: 'open-ex10',
  dependencies: ['foundation-open@1', 'assay-woven-supports@1'],
  description:
    'Finite observed river compartments, locally paid contact and fragile real unfired vessels.',
  reuse: {
    experiment: 'ex10 developments 4 and 15',
    source: 'packages/world-core/src/open-woven-tests.ts',
    description:
      'Reuses current-run actual dry/wet specimen laws, shared reference resolver, precise quantity and physical-mass accounting, operation continuity and pure process scheduling; no historical water skill or supplied container.',
  },
  abilities: [
    {
      id: 'access-water',
      name: 'Inspect and retain finite contact water',
      function:
        'Inspect actual bank access, form a fragile cup, withdraw finite water or wet a local retained comparison specimen.',
      equivalence: 'open:finite-bank-contact-water:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: [
            'inspect',
            'form-cup',
            'fill',
            'wet',
            'inspect-cup',
            'resume',
            'cancel',
          ],
        },
        target: { type: 'string' },
        container: { type: 'string' },
        project: { type: 'string' },
        quantityMl: { type: 'integer', minimum: 0 },
        x: { type: 'number' },
        y: { type: 'number' },
      }),
      prerequisites: [],
      dependencies: { abilities: [], resources: ['clay'], knowledge: [] },
      learning: 2,
      costs:
        'Exact IDs or one item:/object: prefix, never resource aliases. Inspect uses target river:x:y or x/y of a visible cell, empty container, zero quantity; costs 0.2 energy. Remain on supported bank, clear interaction segment <=0.65. Form-cup: owned wet-clay target, empty container, named project, clear reachable x/y, quantity zero; at least 0.5 kg real clay, three stages/0.5 energy each, exact surplus retained. Fill: inspected river target, actual cup container, positive whole ml within capacity; 0.3 energy. Wet: exact local unfinished personal vine specimen target, explicit inspected river or cup container, quantity zero; 10 ml per 0.1 material unit rounded upward, 0.3 energy, prior assay-woven-supports mastery and retained hard tool required. Inspect-cup uses empty target and cup container, 0.2 energy. Service/resume/cancel coordinates and unused quantities/references are zero/empty. Resume/cancel name own forming project. Completed repeats allocate and pay a new operation.',
      effects:
        'Only real observed river cells have a finite 10-litre/area-unit surface compartment, a declared 1 cm model layer; no replenishment, potability or remote completion. Source inspection yields uncertainty. The 0.1-litre open unfired cup has radius 0.03, height 0.07; actual contents affect load, one ml and 0.1 g wall clay leak per wet round into located deposits. Below 0.45 kg wall, or actual holder mechanical impact, it collapses into conserved wet fragments and spills water. Failed navigation alone is not impact. Paid local wet contact stores its actual dry baseline; the existing comparison must resume its remaining paid work while moisture still distinguishes conditions. No automatic pass/mastery/cup reward. Cancellation, incompatible action and death release unfinished real clay once; completed vessels persist and can be transferred whole.',
      handler: 'open.access-water',
      revision: 'river-contact-water@1',
      authored: false,
      references: {
        target: 'optional-exact-surface',
        container: 'optional-exact-surface',
      },
      practiceEvidence: 'water-cup-completed',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Three paid forming stages with exact escrow; unavailable energy/access pauses without charge, explicit resume retains paid stages. Cancellation is terminal.',
      },
    },
  ],
  resources: [
    {
      id: 'unfired-water-cup',
      name: 'Unfired clay cup',
      mass: 0.5,
      nutrition: 0,
      toxicity: 0,
      color: '#a97c61',
    },
    {
      id: 'wet-clay-fragments',
      name: 'Retained wet clay fragments',
      mass: 0.5,
      nutrition: 0,
      toxicity: 0,
      color: '#967358',
    },
  ],
  satisfaction: [],
  visualComponents: ['rock'],
  handlers: { 'open.access-water': waterExecute },
  processes: { 'open.water-cups': cupAdvance },
  afterEnvironment: cupImpacts,
  events: [
    'water-access-inspected',
    'water-cup-progress',
    'water-cup-completed',
    'water-withdrawn',
    'material-contact-wetted',
    'water-spilled',
    'water-cup-failed',
    'water-operation-stopped',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    if (
      waterActive(w, a) &&
      (action.interface !== 'access-water' ||
        (!continuing &&
          !['resume', 'cancel'].includes(
            typeof action.args.mode === 'string' ? action.args.mode : '',
          )))
    )
      waterStop(w, a, 'Incompatible action cancelled attended forming.');
  },
  onDeath(w, a) {
    waterStop(w, a, 'Performer died.');
  },
  migrate(w) {
    w.state.riverWater = 1;
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing shared understanding source.');
    const t = { event: 'information-confirmed', interface: 'access-water' };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
};
