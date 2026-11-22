import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import {
  metrologyInspect,
  metrologyExecute,
} from './open-metrology-execution.js';
import {
  metrologyActive,
  metrologyRecord,
  metrologyStop,
} from './open-metrology-work.js';
export const OPEN_METROLOGY: V7Package = {
  id: 'shelter-material-metrology',
  version: 1,
  scope: 'open-ex10',
  dependencies: ['material-geometry@1', 'shelter-reference-diagnostics@1'],
  description:
    'Paid specimen geometry and actual load response with conserved finite source allocation and configuration-specific evidence.',
  reuse: {
    experiment: 'ex10 developments 7-8',
    source: 'packages/world-core/src/open-shelter-material.ts',
    description:
      'Reuses shared reference resolution, material mass, geometry/collision, escrow and shelter tests. The added physical-shape model and paid metrology are current-run extensions, not recovered historical facts.',
  },
  abilities: [
    {
      id: 'shelter-material-metrology',
      name: 'Specimen dimensions and load response',
      function:
        'Measure an actual whole specimen and test a supported span with real allocated weights; preserve finite evidence and damage.',
      equivalence: 'open:specimen-dimensional-metrology-and-load-response:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: ['inspect', 'measure', 'load-test', 'resume', 'cancel'],
        },
        target: { type: 'string' },
        project: { type: 'string' },
        loads: {
          type: 'array',
          items: v7ObjectSchema({
            item: { type: 'string' },
            quantity: { type: 'number', minimum: 0.1 },
          }),
        },
        span: { type: 'number', minimum: 0 },
        x: { type: 'number' },
        y: { type: 'number' },
        angle: { type: 'number' },
      }),
      prerequisites: [],
      learning: 2,
      authored: false,
      handler: 'open.metrology',
      revision: 'shelter-material-metrology@1',
      references: { target: 'optional-exact-visible' },
      practiceEvidence: 'information-confirmed',
      costs:
        'Exact owned item identity, optionally one item: prefix. Inspect: one round/0.2 energy. Measure: one intact whole branch, reachable clear ground at x/y/angle, two rounds/0.3 each. Load-test: own prior measurement, positive span within measured lower length, explicit distinct owned loads in tenths, two rounds/0.5 each. No stock is provided. Empty target/loads and zero span/coordinates when unused; project names own durable work. Resume reclaims identical surviving escrow and only unpaid stages. Cancel, incompatible action, movement or death releases survivors once; effort and damage remain.',
      effects:
        'Finite source-slot shape is a versioned physical-model addition, not actor evidence or suitable dimensions. Measurement uses world-coordinate units, length uncertainty >=0.05 and diameter >=10%; no SI certification. Actual self-weight, allocated midpoint weight, taper, moisture and defects determine deformation/fracture. A pass proves only the same unit and span, under no wetter conditions; no batch or longer-span certificate. Existing shelter proof, roofing and lash requirements remain. Unknown and altered remnants remain unresolved. Previously known repeated observations do not renew curiosity. No roof, shade, supplies or mastery arises from inspection.',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Two paid stages per measure/test; explicit operation identity, exact inputs, paid energy and remaining stages. Missing energy pauses free; completed work cannot restart or refund.',
      },
    },
  ],
  handlers: {
    'open.metrology': (c) => {
      const mode = c.action.args.mode;
      if (mode === 'inspect') return metrologyInspect(c);
      if (mode === 'cancel' || mode === 'resume') {
        if (
          c.action.args.target !== '' ||
          !Array.isArray(c.action.args.loads) ||
          c.action.args.loads.length ||
          ['span', 'x', 'y', 'angle'].some((k) => c.action.args[k] !== 0)
        )
          throw new Error(
            'Resume/cancel use only the exact project; unused arguments must be empty or zero.',
          );
      }
      if (mode === 'cancel') {
        const j = metrologyRecord(
          c.world,
          c.actor,
          v7String(c.action.args.project, 'project'),
        );
        if (j.status === 'completed')
          throw new Error('Completed work cannot be cancelled into new work.');
        metrologyStop(
          c.world,
          c.actor,
          j,
          'Explicit cancellation; effort and material history retained.',
        );
        return { complete: true, remaining: 0, writes: [] };
      }
      return metrologyExecute(c);
    },
  },
  resources: [],
  satisfaction: [],
  processes: {},
  visualComponents: ['rock'],
  events: [
    'metrology-measured',
    'metrology-load-tested',
    'metrology-progress',
    'metrology-stopped',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    const completed = a.extensionState['metrology:completed-layout'];
    if (typeof completed === 'string') {
      w.objects = w.objects.filter((o) => o.id !== completed);
      delete a.extensionState['metrology:completed-layout'];
    }
    const j = metrologyActive(w, a);
    if (
      j &&
      (action.interface !== 'shelter-material-metrology' ||
        !continuing ||
        a.position.x !== j.actorX ||
        a.position.y !== j.actorY)
    )
      metrologyStop(w, a, j, 'Action or actual work position changed.');
  },
  onDeath(w, a) {
    const j = metrologyActive(w, a);
    if (j)
      metrologyStop(
        w,
        a,
        j,
        'Performer died; surviving material remains at the layout.',
        true,
      );
  },
  migrate(w) {
    const source = w.satisfaction.find(
      (r) => r.id === 'grounded-understanding',
    );
    if (!source?.maintenance)
      throw new Error('Missing actual shared understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: 'shelter-material-metrology',
    };
    source.alternativeTriggers = [
      ...(source.alternativeTriggers ?? []),
      trigger,
    ];
    source.maintenance.alternativeTriggers = [
      ...(source.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
