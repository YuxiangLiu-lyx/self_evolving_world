import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { shortExecute } from './open-short-execution.js';
import { shortWeather, shortStockWeather } from './open-short-weather.js';
import { shortActive, shortPause, shortRelease } from './open-short-work.js';
import type { ShortWork } from './open-short-work.js';
export const OPEN_SHORT_REFUGE: V7Package = {
  id: 'short-material-refuge',
  version: 1,
  scope: 'open-ex10',
  dependencies: [
    'foundation-open@1',
    'shelter-material-metrology@1',
    'resting-shelter@1',
  ],
  description:
    'Individually measured short-pole geometry, paid grass coupons, assembly and actual proof envelopes.',
  reuse: {
    experiment: 'ex10 developments 7 and 11',
    source: 'packages/world-core/src/open-metrology-execution.ts',
    description:
      'Reuses this run’s specimen measurements and conservative tapered beam laws, actual shared collision and shelter exposure/rest event producers. New grass and short-frame laws are model additions, not historical skill inheritance or prior certification.',
  },
  abilities: [
    {
      id: 'short-material-refuge',
      name: 'Test and assemble a small material-bound canopy',
      function:
        'Assess and construct a finite five-pole shade canopy from measured short materials, with actual grass trials, proof loads, exposure readings and maintenance.',
      equivalence: 'open:short-material-tested-canopy:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: [
            'inspect',
            'test-cover',
            'test-joint',
            'assess',
            'assemble',
            'proof-test',
            'measure-exposure',
            'repair',
            'dismantle',
            'resume',
            'cancel',
          ],
        },
        project: { type: 'string' },
        target: { type: 'string' },
        components: {
          type: 'array',
          items: v7ObjectSchema({
            item: { type: 'string' },
            quantityTenths: { type: 'integer', minimum: 1 },
            role: {
              type: 'string',
              enum: ['pole', 'cover', 'binding', 'load'],
            },
          }),
        },
        x: { type: 'number' },
        y: { type: 'number' },
        angle: { type: 'number' },
        width: { type: 'number' },
        length: { type: 'number' },
        height: { type: 'number' },
      }),
      prerequisites: ['shelter-material-metrology'],
      dependencies: {
        abilities: ['shelter-material-metrology'],
        resources: ['branch', 'dry-grass'],
        knowledge: [],
      },
      learning: 4,
      costs:
        'Exact IDs or one item:/object: prefix. Inspect/assess/exposure: one round/0.2 energy. Trial: one measured whole pole, one unaltered grass allocation >=0.1 unit, separate real weights; two stages/0.5 each. Assembly: first pole is ridge, next four legs, individually measured; positive explicit dimensions, 0.05 leg joint allowance, actual grass cover mass >=0.5 per roof area and six bindings >=0.02 mass each with personally passed source coupons; four stages/0.75 each. No splicing. Proof requires real load allocations; order names ridge midpoint, first end apex, second end apex, with conservative reaction envelope. Proof/dismantle: two stages/0.5 each. Repair replaces whole equal-quantity grass components in two stages/0.5 each, followed by two actual proof-load stages/0.5 each. Resume/cancel use only own project with empty target/components; unused dimensions zero. Trials use actual x/y layout and zero dimensions. Structure service uses target and zero dimensions. No energy/access means no progress or charge.',
      effects:
        'Paid real geometry and conserved location-bound components; no supplied stock or automatic certification. Five poles form two triangular ends and a ridge; measured lengths bound all dimensions. Grass binding law 50 force per dry mass, wet factor 1–0.5, slip above half breaking force; actual apertures, wear 0.001 dry to 0.004 saturated per round. Explicit proof checks self/wet/wind/load weight, joints, bending, buckling, spread and sag. Conditional finite rays and actual body coverage reuse existing bounded thermal/rest effects and personal-refuge events. No assembly/mastery reward; informative paid trials/exposure use shared deduplicated understanding. Cancel/death releases only surviving unincorporated escrow once; installed parts and passive weathering persist.',
      handler: 'open.short-refuge',
      revision: 'short-material-refuge@1',
      authored: false,
      practiceEvidence: 'short-refuge-completed',
      references: { target: 'optional-exact-visible' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact location-bound stages and paid effort; paused work resumes only remaining stages, completion cannot restart.',
      },
    },
  ],
  resources: [],
  satisfaction: [],
  visualComponents: ['rock'],
  handlers: { 'open.short-refuge': shortExecute },
  processes: {
    'open.short-weather': shortWeather,
    'open.short-stock': shortStockWeather,
  },
  events: [
    'short-refuge-inspected',
    'short-refuge-trial',
    'short-refuge-assessed',
    'short-refuge-progress',
    'short-refuge-completed',
    'short-refuge-exposure',
    'short-refuge-stopped',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    if (
      shortActive(w, a) &&
      (action.interface !== 'short-material-refuge' || !continuing)
    )
      shortPause(w, a);
  },
  onDeath(w, a) {
    for (const [key, r] of Object.entries(w.state))
      if (
        key.startsWith(`short:work:${a.id}:`) &&
        r &&
        typeof r === 'object' &&
        !Array.isArray(r) &&
        ['active', 'paused'].includes(
          typeof r.status === 'string' ? r.status : '',
        )
      )
        shortRelease(
          w,
          r as ShortWork,
          'stopped',
          'Performer died; release only actual surviving escrow at its work location.',
        );
  },
  migrate(w) {
    w.state.shortRefuge = 1;
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing shared understanding source.');
    const t = {
      event: 'information-confirmed',
      interface: 'short-material-refuge',
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
};
