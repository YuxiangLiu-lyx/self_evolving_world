import type { V7Package, V7ActionContext } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { wovenTest } from './open-woven-tests.js';
import { wovenBuild } from './open-woven-build.js';
import { wovenCalibrate } from './open-woven-calibration.js';
import {
  wovenActive,
  wovenPause,
  wovenResume,
  wovenRecord,
} from './open-woven-work.js';
import { wovenProcess } from './open-woven-process.js';
import { v7String } from './continuous-data.js';
function act(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'resume') {
    const j = wovenActive(c.world, c.actor) ?? wovenResume(c);
    return j.mode === 'assemble'
      ? j.stage >= 14
        ? wovenCalibrate(c)
        : wovenBuild(c)
      : wovenTest(c);
  }
  if (mode === 'calibrate') {
    if (!wovenActive(c.world, c.actor)) {
      const j = wovenRecord(
        c.world,
        c.actor,
        v7String(c.action.args.project, 'project'),
      );
      if (j.status === 'completed') {
        if (!c.actor.mastered.includes('food-assay'))
          throw new Error('Personal food-assay mastery is required.');
        const b = c.world.objects.find((o) => o.id === j.balance);
        if (!b) throw new Error('Missing actual apparatus.');
        j.previousCalibration = b.data.calibrationHistory ?? [];
        b.data.calibrationHistory = [];
        b.data.calibrated = false;
        j.stage = 14;
        j.status = 'awaiting-calibration';
      }
    }
    return wovenCalibrate(c);
  }
  if (mode === 'assemble') return wovenBuild(c);
  return wovenTest(c);
}
export const OPEN_WOVEN: V7Package = {
  id: 'assay-woven-supports',
  version: 1,
  scope: 'open-ex10',
  description:
    'Personally tested real branch and vine components, persistent resumable woven apparatus, measured calibration and conditional food-assay interoperability.',
  dependencies: ['foundation-open@1', 'food-assay@1'],
  reuse: {
    experiment: 'ex10 development 2',
    source: 'packages/world-core/src/open-assay-drying.ts',
    description:
      'Reuses current-run paid gravimetric readings and passive physical drying through a conditional apparatus contract. Distinct construction function; no historical generated implementation, product or mastery inherited.',
  },
  abilities: [
    {
      id: 'assay-woven-supports',
      name: 'Tested woven assay supports',
      function:
        'Test real branch and vine batches, fabricate a bark-free comparison balance and mesh from paid components, resume partial work, and calibrate for existing relative food-mass measurements.',
      equivalence: 'open:tested-woven-assay-apparatus:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: ['test-beam', 'test-vine', 'assemble', 'calibrate', 'resume'],
        },
        target: { type: 'string' },
        controls: { type: 'array', items: { type: 'string' } },
        project: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      }),
      prerequisites: [],
      dependencies: {
        abilities: ['food-assay'],
        resources: ['branch', 'vine', 'stone'],
        knowledge: [],
      },
      learning: 5,
      costs:
        'Tests: target owned branch/vine, controls one hardness>=8 stone, project a new personal ID. Two performed rounds, 0.5 energy each, 0.1 material retained as tested specimen; vine dries passively then needs reachable finite water for real wet comparison. Assembly: personally tested source batches, target 1 branch, controls 3 vine and two distinct hard stones (retained tool first, subdivision second); 12 assembly + 2 subdivision rounds at 0.5 energy. Explicit clear x/y places 0.8 by 0.4 balance, 0.4 by 0.4 mesh at y+0.65, both within 0.65 hand reach. Five real comparison pieces conserve the second stone. Calibration requires personal food-assay mastery, the same project and all original weights, three performed rounds at 0.5 energy. Unused target empty, controls empty. Resume names same own project; controls optionally explicit retained replacement hard tools. No duplicate input or silent substitution.',
      effects:
        'Versioned material laws and paid dry/wet tests record force, geometry, failure and uncertainty. Unknown/failed or insufficient working loads cannot authorize fabrication. Persist component lineage, paid stages and remaining work. Real aperture, sample retention, contact water, tare drift, wear and capacity constrain subsequent food-assay. No composition or safety certification. Action change/death releases only unconsumed surviving escrow once; consumed parts remain in partial apparatus. Resume executes remaining work; destruction yields conserved damaged salvage. Passive drying/creep/wear continue without owner. New grounded information uses existing shared understanding; construction/mastery has no completion reward.',
      handler: 'open.woven',
      revision: 'assay-woven-supports@1',
      authored: false,
      references: { target: 'optional-owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact performed stages retained in own project. Passive exposure duration unknown. Missing effort/tool/water pauses without charges; explicit resume locks the same surviving allocations and partial apparatus.',
      },
    },
  ],
  handlers: { 'open.woven': act },
  processes: { 'open.woven-process': wovenProcess },
  resources: [],
  satisfaction: [],
  visualComponents: ['rock', 'plant'],
  events: [
    'woven-support-test',
    'woven-support-progress',
    'woven-support-completed',
    'woven-support-stopped',
    'apparatus-load-failed',
    'assay-reading',
    'assay-invalidated',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    const j = wovenActive(w, a);
    if (
      j &&
      (action.interface !== 'assay-woven-supports' ||
        !continuing ||
        (j.balance &&
          w.objects.some(
            (o) =>
              (o.id === j.balance || o.id === j.mesh) &&
              v7ShapeDistance(a.position, o.spatial) > 0.65,
          )))
    )
      wovenPause(w, a, 'Active action or actual hand reach changed.');
  },
  onDeath(w, a) {
    wovenPause(
      w,
      a,
      'Performer died; consumed parts remain and surviving escrow drops once.',
      true,
    );
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing current-run grounded understanding rule.');
    const trigger = {
      event: 'information-confirmed',
      interface: 'assay-woven-supports',
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), trigger];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
