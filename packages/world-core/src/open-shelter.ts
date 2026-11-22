import type { V7Package, V7ActionContext, V7Data } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7String, v7Clone } from './continuous-data.js';
import { refugeInspect, refugeTest } from './open-shelter-tests.js';
import { refugeBuild } from './open-shelter-build.js';
import { refugeService, refugeWeather } from './open-shelter-service.js';
import {
  refugeActive,
  refugeRecord,
  refugeResume,
  refugeStop,
} from './open-shelter-work.js';
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'mode');
  if (
    !['inspect', 'repair', 'dismantle'].includes(mode) &&
    c.action.args.target !== ''
  )
    throw new Error(
      'Unused target must be empty; work retains exact identities.',
    );
  if (
    !['test', 'build', 'repair'].includes(mode) &&
    Array.isArray(c.action.args.materials) &&
    c.action.args.materials.length
  )
    throw new Error('Unused material allocations must be empty.');
  if (mode === 'inspect') return refugeInspect(c);
  if (mode === 'cancel') {
    const j = refugeRecord(
      c.world,
      c.actor,
      v7String(c.action.args.project, 'project'),
    );
    if (j.status === 'completed')
      throw new Error('Completed work cannot be cancelled.');
    refugeStop(c.world, c.actor, j, 'Explicit cancellation.');
    return { complete: true, writes: [] };
  }
  let j = refugeActive(c.world, c.actor);
  if (mode === 'resume' && !j) j = refugeResume(c);
  switch (j?.mode ?? mode) {
    case 'test':
      return refugeTest(c);
    case 'build':
      return refugeBuild(c);
    case 'repair':
    case 'dismantle':
      return refugeService(c);
    default:
      throw new Error('Unknown shelter operation.');
  }
}
export const OPEN_SHELTER: V7Package = {
  id: 'resting-shelter',
  version: 1,
  scope: 'open-ex10',
  description:
    'Paid tested open-ended shade construction with finite components and conditional actual refuge benefits.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment: 'ex10 developments 4 and shared engine',
    source: 'packages/world-core/src/open-woven-physics.ts',
    description:
      'Reuses source-bound constitutive laws and hydration, exact references and shared collision/thermal primitives. Historical generated forest-shelter is not inherited. New previously unrepresented branch geometry is versioned; previously measured short batches remain short.',
  },
  abilities: [
    {
      id: 'resting-shelter',
      name: 'Test and assemble a shade refuge',
      function:
        'Measure, test and construct an open-ended lashed frame from actual materials; repair or dismantle it and obtain conditional relief through real sheltered rest.',
      equivalence: 'open:tested-lashed-shade:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: [
            'inspect',
            'test',
            'build',
            'resume',
            'repair',
            'dismantle',
            'cancel',
          ],
        },
        project: { type: 'string' },
        target: { type: 'string' },
        materials: {
          type: 'array',
          items: v7ObjectSchema({
            item: { type: 'string' },
            quantity: { type: 'number', minimum: 0.1 },
          }),
        },
        x: { type: 'number' },
        y: { type: 'number' },
        angle: { type: 'number' },
      }),
      prerequisites: [],
      dependencies: { abilities: [], resources: [], knowledge: [] },
      learning: 4,
      costs:
        'Exact persistent IDs only. Inspect owned material/reachable structure: one round/0.2 energy. Test: allocate one 0.1–1-unit intact specimen, two rounds/0.5 each. Build: minimum 6 branch, 6 reed, 2 vine, personally tested source batches with sufficient real pole lengths (ridge 1.8, four rafters 1.2), area and lash length; ten rounds/0.8 each and final factor-two load proof. All materials explicit. Repair one existing complete vine/reed component with equal tested quantity: two rounds/0.8. Dismantle: four rounds/0.5. Resume/cancel exact own project, empty unused target/materials. Missing energy or access pauses free; explicit cancellation releases only uninstalled survivors once, installed components persist.',
      effects:
        'Open ends and real pole collisions; actual directional roof rays reduce solar heat 0.65*coverage, rain wetting 0.4*coverage and projected wind at most 0.2. Passive wetting, creep/wear and overload can invalidate coverage. Actual exposure reduction permits at most +0.4 nominal rest recovery, bounded by removed exposure penalty; no comfortable-state bonus or direct healing/nutrition. Roof is not person-bearing. Construction/learning earns nothing. Qualified repeated occupied rest can maintain one personal refuge source. Separate archive-project capability preserves actor-selected old records without changing context limits.',
      handler: 'open.refuge',
      revision: 'resting-shelter@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: { target: 'optional-exact-visible' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact paid stages and surviving escrow; completion count does not restart active operations.',
      },
    },
    {
      id: 'archive-project',
      name: 'Archive personal project records',
      function:
        'Explicitly archive, inspect or restore a personally selected retained project without deleting its history.',
      equivalence: 'open:personal-project-archive:1',
      parameters: v7ObjectSchema({
        mode: { type: 'string', enum: ['archive', 'inspect', 'restore'] },
        project: { type: 'string' },
      }),
      prerequisites: [],
      learning: 1,
      costs:
        'One separate action; no physical materials. Only exact own project ID. Learning is individual.',
      effects:
        'Preserves complete old project and archive history; moves it out of active context slots only by explicit request. Does not change knowledge/project limits or world facts. No reward.',
      handler: 'open.project-archive',
      revision: 'resting-shelter@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'One explicit archive action.',
      },
    },
  ],
  handlers: {
    'open.refuge': execute,
    'open.project-archive': (c) => {
      const id = v7String(c.action.args.project, 'own project ID'),
        mode = v7String(c.action.args.mode, 'archive mode'),
        key = `open:archive:${id}`,
        old = c.actor.memory.projects?.[id],
        archived = c.actor.extensionState[key];
      if (mode === 'archive') {
        if (!old) throw new Error('No active project with this exact ID.');
        const history = Array.isArray(archived) ? archived : [];
        history.push(v7Clone(old) as unknown as V7Data);
        c.actor.extensionState[key] = history;
        delete c.actor.memory.projects?.[id];
      } else if (mode === 'restore') {
        if (old || !Array.isArray(archived) || !archived.length)
          throw new Error(
            'Restore requires an archived record and no active identity conflict.',
          );
        const latest = archived.at(-1);
        if (!latest || typeof latest !== 'object' || Array.isArray(latest))
          throw new Error('Invalid archived project.');
        c.actor.memory.projects ??= {};
        c.actor.memory.projects[id] = v7Clone(latest) as unknown as NonNullable<
          typeof c.actor.memory.projects
        >[string];
      } else if (mode !== 'inspect') throw new Error('Unknown archive action.');
      c.emit(
        'project-archive-accessed',
        'Actor-selected project archive retained full records; no progress or rewards inferred.',
        { project: id, mode, history: c.actor.extensionState[key] ?? null },
      );
      return { complete: true, writes: [] };
    },
  },
  processes: { 'open.refuge-weather': refugeWeather },
  resources: [],
  visualComponents: ['rock'],
  satisfaction: [
    {
      id: 'personal-refuge',
      name: 'Experienced refuge relief',
      equivalence: 'open:beneficial-occupied-refuge',
      event: 'shelter-rest-experience',
      interface: 'rest',
      conditions: [],
      amount: 0.3,
      cap: 0.6,
      duration: 6,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 12,
      maintenance: {
        event: 'shelter-refuge-maintained',
        interface: 'rest',
        gain: 0.015,
        decay: 0.002,
        cap: 0.4,
        decayOnGain: true,
      },
      rationale:
        'Only actual beneficial occupied rest; maintained gain follows two earlier qualifying rounds within 20, once per 12 rounds. One functional source independent of structure name or ownership.',
      revision: 'resting-shelter@1',
    },
  ],
  events: [
    'shelter-inspected',
    'shelter-material-tested',
    'shelter-progress',
    'shelter-completed',
    'shelter-stopped',
    'shelter-damaged',
    'shelter-repaired',
    'shelter-dismantled',
    'shelter-rest-experience',
    'shelter-exposure-measured',
    'shelter-refuge-maintained',
    'project-archive-accessed',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    const j = refugeActive(w, a);
    if (j && (action.interface !== 'resting-shelter' || !continuing))
      refugeStop(w, a, j, 'Action changed; only uninstalled escrow released.');
  },
  onDeath(w, a) {
    const j = refugeActive(w, a);
    if (j) refugeStop(w, a, j, 'Performer died.', true);
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance) throw new Error('Missing shared understanding.');
    const t = { event: 'information-confirmed', interface: 'resting-shelter' };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
};
