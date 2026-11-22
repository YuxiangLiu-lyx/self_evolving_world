import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import {
  preservationExchange,
  preservationPhysics,
} from './open-preservation-physics.js';
import {
  preservationPrepare,
  preservationAdvance,
  preservationWork,
  preservationStop,
  preservationAccessible,
} from './open-preservation-work.js';
import {
  preservationInspect,
  preservationRead,
} from './open-preservation-reading.js';
function execute(c: V7ActionContext) {
  const mode = c.action.args.mode;
  if (mode === 'inspect') return preservationInspect(c);
  if (mode === 'prepare') return preservationPrepare(c);
  if (mode === 'read') return preservationRead(c);
  if (
    c.action.args.target !== '' ||
    c.action.args.apparatus !== '' ||
    c.action.args.quantityTenths !== 0
  )
    throw new Error(
      'Resume/cancel/remove use only the exact personal project; other arguments are empty or zero.',
    );
  const j = preservationWork(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'project'),
  );
  if (mode === 'resume') return preservationAdvance(c, j);
  if (mode === 'remove') preservationAccessible(c, j.tray);
  preservationStop(
    c.world,
    j,
    mode === 'remove'
      ? 'Removed surviving actual food; its composition, age and damage persist.'
      : 'Explicit cancellation; surviving food remains at its actual tray location.',
    mode === 'remove',
  );
  return { complete: true, writes: [j.sample, j.tray] };
}
export const OPEN_PRESERVATION: V7Package = {
  id: 'measured-food-preservation',
  version: 1,
  scope: 'open-ex10',
  description:
    'Paid thin-layer food preparation, actual ambient moisture exchange and conditional storage evidence.',
  dependencies: ['foundation-open@1', 'food-assay@1'],
  reuse: {
    experiment: 'ex10 developments 1-2 and 7',
    source: 'packages/world-core/src/open-assay-drying.ts',
    description:
      'Reuses this run’s actual tray, calibrated comparison arithmetic, source-bound food units and existing roof-ray geometry. The moisture/deterioration law is a new reviewed model, not inherited preservation, historical independent invention, or safety certification.',
  },
  abilities: [
    {
      id: 'measured-food-preservation',
      name: 'Measured open-tray food preservation',
      function:
        'Prepare an actual food batch for passive weather-dependent drying and inspect or measure its subsequent deterioration, with real limits and surviving material.',
      equivalence: 'open:measured-ambient-food-preservation:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: ['inspect', 'prepare', 'read', 'resume', 'cancel', 'remove'],
        },
        project: { type: 'string' },
        target: { type: 'string' },
        apparatus: { type: 'string' },
        quantityTenths: { type: 'integer', minimum: 0 },
      }),
      prerequisites: ['food-assay'],
      dependencies: { abilities: ['food-assay'], resources: [], knowledge: [] },
      learning: 3,
      authored: false,
      handler: 'open.preservation-action',
      revision: 'measured-food-preservation@1',
      references: {
        target: 'optional-exact-visible',
        apparatus: 'optional-exact-visible',
      },
      practiceEvidence: 'preservation-completed',
      costs:
        'Use exact bare identities or one item:/object: prefix; no resource aliases. inspect: target owned unreserved food and/or apparatus actual tray, project empty and quantityTenths 0; one round/0.2 energy. prepare: new own project, target owned food, apparatus reachable intact tray, positive integer quantityTenths; two paid rounds/0.5 each, actual capacity 0.2 mass per geometric area. Unsupported composition and overcapacity reject before charging. read: project, zero quantity; empty target/apparatus gives condition-only reading for 0.2. For calibrated read, target explicitly names an owned original comparison weight and apparatus its reachable calibrated balance; 0.2 inspection plus existing 0.5 weighing cost in one round. resume/cancel/remove: project only; other fields empty/zero. remove requires local tray access. Resume pays only unfinished stages.',
      effects:
        'Owner-retained food is location-bound escrow, not carried weight. Actual nutrient/toxin units persist while water changes mass. Previously unrepresented berry/root fractions 0.85/0.75 and atmospheric RH baseline 0.65 are declared model assumptions, not measured knowledge. Air humidity responds to existing rain/wind separately from soil. Actual tray geometry/occupancy, opening damage 1.1, finite drying speed, rain, roof coverage and ongoing decay determine benefit or spoilage. No sterile container or free food. Condition-only readings separate model estimates from measured evidence. Two paid calibrated readings must establish mass loss beyond uncertainty plus lower actual elapsed deterioration for a preservation conclusion; no guarantee of future weather or safety. Passive activity and preparation grant no reward; informative paid readings may use the existing shared understanding source. Removal/cancellation/death retain surviving composition and age without refund.',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Preparation has two paid stages bound to exact escrow and project. Movement or changed action pauses attended preparation without a second allocation. Explicit resume pays only remaining stages. Installed passive drying continues unattended. Cancel/death ends the owned controller and releases surviving food at its actual location once. Public implementation does not grant personal study.',
      },
    },
  ],
  handlers: { 'open.preservation-action': execute },
  processes: {
    'open.preservation': (w, p) => {
      const owner = w.actors.find((a) => a.id === p.owner);
      if (!owner) throw new Error('Missing retained process owner.');
      const j = preservationWork(w, owner, v7String(p.data.project, 'project')),
        s = w.stacks.find((s) => s.id === j.sample),
        tray = w.objects.find((o) => o.id === j.tray);
      if (!s || !tray || Number(tray.data.service) <= 0) {
        preservationStop(
          w,
          j,
          'Actual food or maintained apparatus is unavailable; no replacement supplied.',
        );
        return;
      }
      if (s.reservedFor !== p.id || preservationPhysics(s)?.tray !== j.tray)
        throw new Error('Food process escrow and physical occupancy disagree.');
      preservationExchange(w, s);
      p.next = w.tick + 1;
    },
  },
  resources: [],
  satisfaction: [],
  visualComponents: ['plant', 'rock'],
  events: [
    'preservation-inspected',
    'preservation-progress',
    'preservation-reading',
    'preservation-completed',
    'preservation-stopped',
  ],
  beforeAction(w, a, action, continuing) {
    const id = a.extensionState['preservation:active'];
    if (typeof id !== 'string') return;
    const j = preservationWork(w, a, id);
    if (
      !continuing ||
      action.interface !== 'measured-food-preservation' ||
      a.position.x !== j.x ||
      a.position.y !== j.y
    ) {
      j.status = 'paused';
      delete a.extensionState['preservation:active'];
    }
  },
  onDeath(w, a) {
    for (const p of [...w.processes])
      if (p.handler === 'open.preservation' && p.owner === a.id)
        preservationStop(
          w,
          preservationWork(w, a, v7String(p.data.project, 'project')),
          'Owner died; surviving physical food released at its actual tray location once.',
        );
  },
  migrate(w) {
    w.state.foodPreservation = 1;
    // Use the shared generic quantity contract; no historical food-assessment skill is installed.
    for (const a of w.abilities.filter((a) =>
      ['eat', 'pickup', 'drop', 'give'].includes(a.id),
    )) {
      if (a.parameters.properties)
        a.parameters.properties.quantity = { type: 'number', minimum: 0.1 };
      a.effects +=
        ' After measured-food-preservation installation, exact tenths can be consumed or transferred with unchanged per-unit effects; reserved tray food must first be removed.';
    }
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance) throw new Error('Missing shared understanding.');
    const trigger = {
      event: 'information-confirmed',
      interface: 'measured-food-preservation',
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), trigger];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
