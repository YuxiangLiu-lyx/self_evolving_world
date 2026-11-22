import type {
  V7Package,
  V7ActionContext,
  V7Stack,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7String, v7Id } from './continuous-data.js';
import { openRemember } from './open-foundation.js';
import {
  HARDNESS_SCALE,
  scratchPhysical,
  scratchVisible,
  scratchStroke,
} from './open-hardness-physics.js';
import {
  scratchActive,
  scratchProject,
  scratchRecord,
  scratchReserve,
  scratchRelease,
  scratchArchive,
  type ScratchWork,
} from './open-hardness-work.js';
function owned(c: V7ActionContext, id: string): V7Stack {
  const s = c.world.stacks.find(
    (s) => s.id === id && s.owner === c.actor.id && !s.reservedFor,
  );
  if (!s)
    throw new Error('The exact owned unreserved specimen is unavailable.');
  return s;
}
function inspect(c: V7ActionContext) {
  const s = owned(c, v7String(c.action.args.target, 'specimen'));
  if (c.actor.vitals.energy < 0.2)
    return { complete: false, remaining: 1, writes: [] };
  const j = scratchProject(c),
    visible = scratchVisible(c.world, s);
  v7Spend(c.actor, 0.2);
  j.inspection = { tick: c.world.tick, ...visible, paidEnergy: 0.2 };
  c.emit(
    'hardness-inspected',
    'Inspected real contact geometry and surface condition; this is not a relative or absolute hardness result.',
    {
      project: j.id,
      ...visible,
      paidEnergy: 0.2,
      remainingWork: 0,
      scale: HARDNESS_SCALE,
      absolute: 'hardness >=8 unresolved',
    },
    s.id,
  );
  return { complete: true, remaining: 0, writes: [s.id] };
}
function finish(c: V7ActionContext, j: ScratchWork) {
  const first = j.observations[0],
    second = j.observations[1];
  const interpretable =
    first?.interpretable === true && second?.interpretable === true;
  const relative =
    interpretable &&
    first.persistentGroove === true &&
    second.persistentGroove !== true
      ? 'first specimen more scratch-resistant'
      : interpretable &&
          second.persistentGroove === true &&
          first.persistentGroove !== true
        ? 'second specimen more scratch-resistant'
        : 'inconclusive';
  const result = {
    specimens: j.specimens,
    sources: j.sources,
    observations: j.observations,
    relative,
    uncertainty: relative === 'inconclusive' ? 1 : 0.5,
    absolute: 'hardness >=8 unresolved',
    absoluteBounds: null,
    referenceLineage: null,
    scale: HARDNESS_SCALE,
  };
  j.result = result;
  for (const id of j.specimens) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (s)
      s.processing = {
        ...(s.processing ?? {}),
        hardnessComparison: { project: j.id, test: j.tests, result },
      };
  }
  if (relative !== 'inconclusive') {
    const roots = j.evidenceRoots as string[],
      key = `scratch:${roots.join('|')}:${relative}`;
    if (!c.actor.memory.knowledge?.[key]?.verified)
      openRemember(c, {
        key,
        subject: j.specimens.join(' versus '),
        property: 'relative scratch resistance of tested surfaces',
        value: result,
        method: 'two paid directional contacts and inspection of both surfaces',
        condition: 'specimen-specific; absolute scale uncalibrated',
        verified: true,
      });
  }
  c.emit(
    'hardness-comparison-completed',
    'Executed two real scratch contacts. Relative observations remain separate from the unresolved absolute tool threshold.',
    {
      project: j.id,
      stage: 2,
      remainingWork: 0,
      paidEnergy: j.paid,
      ...result,
    },
    j.specimens[0],
  );
  scratchRelease(
    c.world,
    c.actor,
    j,
    'Completed actual comparison.',
    false,
    true,
  );
}
function compare(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = scratchActive(w, a);
  if (!j) {
    const target = owned(c, v7String(c.action.args.target, 'specimen')),
      reference = owned(c, v7String(c.action.args.reference, 'reference'));
    if (
      target.id === reference.id ||
      target.quantity < 0.1 ||
      reference.quantity < 0.1
    )
      throw new Error(
        'Two distinct actual 0.1-unit portions are required before allocation.',
      );
    if (
      !scratchVisible(w, target).controlledContact ||
      !scratchVisible(w, reference).controlledContact
    )
      throw new Error(
        'Actual solid contact geometry is unavailable; failed geometry does not imply softness.',
      );
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: 2, writes: [] };
    j = scratchProject(c);
    scratchArchive(j);
    j.tests++;
    j.status = 'active';
    j.stage = 0;
    j.paid = 0;
    j.sources = [target.id, reference.id];
    j.specimens = [];
    j.observations = [];
    j.x = a.position.x;
    j.y = a.position.y;
    j.evidenceRoots = [target, reference].map(
      (s) => `${s.origin}:${s.resource}`,
    );
    scratchReserve(c, j, target);
    scratchReserve(c, j, reference);
    a.extensionState['open:hardness-work'] = j.id;
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.hardness-cleanup',
      owner: a.id,
      object: null,
      next: w.tick + 1,
      revision: 'hardness-assessment@1',
      data: { project: j.id },
    });
  }
  const specimens = j.specimens.map((id) =>
    w.stacks.find((s) => s.id === id && s.owner === a.id),
  );
  if (specimens.length !== 2 || !specimens[0] || !specimens[1])
    throw new Error('Actual reserved contact specimens are missing.');
  if (a.vitals.energy < 0.5)
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  if (specimens.some((s) => !s || scratchPhysical(w, s).usable !== true))
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  const first = specimens[j.stage === 0 ? 0 : 1],
    second = specimens[j.stage === 0 ? 1 : 0];
  if (!first || !second) throw new Error('Missing actual contact');
  v7Spend(a, 0.5);
  j.paid += 0.5;
  j.observations.push(scratchStroke(w, first, second, j.id));
  j.stage++;
  c.emit(
    'hardness-test-progress',
    'Performed one paid directional stroke and inspected both surfaces for persistent grooves versus transferred powder.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 2 - j.stage,
      paidEnergy: j.paid,
      observation: j.observations.at(-1) ?? null,
      specimens: j.specimens,
    },
    first.id,
  );
  if (j.stage === 2) finish(c, j);
  return {
    complete: j.stage === 2,
    remaining: 2 - j.stage,
    writes: j.specimens,
  };
}
function assess(c: V7ActionContext) {
  const s = owned(c, v7String(c.action.args.target, 'specimen')),
    j = scratchRecord(
      c.world,
      c.actor,
      v7String(c.action.args.project, 'project'),
    );
  if (!j || !j.specimens.includes(s.id))
    throw new Error(
      'Assessment requires an actual retained tested portion from that personal project; a parent batch or unrelated stone is not certified.',
    );
  if (c.actor.vitals.energy < 0.2)
    return { complete: false, remaining: 1, writes: [] };
  v7Spend(c.actor, 0.2);
  const result = {
    project: j.id,
    specimen: s.id,
    relative: j.status === 'completed' ? (j.result ?? null) : null,
    absolute: 'hardness >=8 unresolved',
    bounds: null,
    uncertainty: 1,
    referenceLineage: null,
    reason:
      'No independently traceable physical standard on the engine scale is implemented or established. Names, press findings and the tool predicate are not calibration evidence.',
    scale: HARDNESS_SCALE,
    paidEnergy: 0.2,
    remainingWork: 0,
  };
  j.assessment = result;
  c.emit(
    'hardness-assessment-completed',
    'Reviewed actual specimen evidence; absolute hardness remains unresolved without a physically calibrated reference.',
    result,
    s.id,
  );
  return { complete: true, remaining: 0, writes: [s.id] };
}
export const OPEN_HARDNESS: V7Package = {
  id: 'hardness-assessment',
  version: 1,
  scope: 'open-ex10',
  description:
    'Specimen-specific paid directional scratch comparison; no unmeasured absolute hardness certification.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment: 'ex10 authored infrastructure',
    source: 'packages/world-core/src/open-foundation.ts',
    description:
      'Reuses shared references, fixed-point sample units, paid operation continuity and current-run evidence storage; load trials are not equivalent and no historical generated assessment is inherited.',
  },
  abilities: [
    {
      id: 'hardness-assessment',
      name: 'Physical scratch comparison',
      function:
        'Inspect actual contact geometry, compare two owned specimens through paid directional scratch strokes, and assess supported relative evidence separately from unresolved absolute tool hardness.',
      equivalence: 'open:specimen-specific-scratch-comparison:1',
      parameters: v7ObjectSchema({
        mode: { type: 'string', enum: ['inspect', 'compare', 'assess'] },
        target: { type: 'string' },
        reference: { type: 'string' },
        project: { type: 'string' },
      }),
      prerequisites: [],
      dependencies: { abilities: [], resources: [], knowledge: [] },
      learning: 3,
      costs:
        'Inspect: one performed round and 0.2 energy. Compare: two distinct owned solid specimens with usable contact geometry; reserve 0.1 unit each; two performed directional strokes at 0.5 energy each, retain altered portions and actual dust. Exact personal project ID required. Assess: target an actual tested portion ID of that project, one round and 0.2 energy; reference empty for inspect/assess. No absolute physical standard is supplied. Repeated compare starts a new paid test.',
      effects: `${HARDNESS_SCALE} Contact force, edge radius, persistent grooves versus transferred powder, wear and conserved debris have real state. Results refer only to the tested portions. Absolute hardness >=8 remains unresolved without an independently calibrated physical reference; no current protocol establishes one. Repeated known evidence, ambiguous tests, inspection and assessment do not earn discovery feedback. Cancelled comparisons retain partial evidence and release surviving altered portions once; no energy refund.`,
      handler: 'open.hardness',
      revision: 'hardness-assessment@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: { target: 'owned', reference: 'optional-owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One inspect/assess or two performed compare stages. Global pauses retain exact state. Missing energy pauses free. Action change, position change, specimen loss or death cancels; repeating compare creates a new paid test, not duplicate output.',
      },
    },
  ],
  handlers: {
    'open.hardness': (c) => {
      if (c.action.args.mode !== 'compare' && c.action.args.reference !== '')
        throw new Error('Reference must be empty outside comparison.');
      return c.action.args.mode === 'inspect'
        ? inspect(c)
        : c.action.args.mode === 'assess'
          ? assess(c)
          : compare(c);
    },
  },
  processes: {
    'open.hardness-cleanup': (w, p) => {
      const a = w.actors.find((a) => a.id === p.owner),
        j = a ? scratchActive(w, a) : null;
      if (
        a &&
        j &&
        j.specimens.some(
          (id) => !w.stacks.some((s) => s.id === id && s.owner === a.id),
        )
      )
        scratchRelease(w, a, j, 'Loss of actual specimen possession.');
      if (!a || !scratchActive(w, a))
        w.processes = w.processes.filter((x) => x.id !== p.id);
      else p.next = w.tick + 1;
    },
  },
  resources: [
    {
      id: 'scratch-debris',
      name: 'Detached comparison dust',
      mass: 0.001,
      nutrition: 0,
      toxicity: 0,
      color: '#a2a09b',
    },
  ],
  satisfaction: [],
  visualComponents: ['rock'],
  events: [
    'hardness-inspected',
    'hardness-test-progress',
    'hardness-comparison-completed',
    'hardness-assessment-completed',
    'hardness-test-stopped',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    const j = scratchActive(w, a);
    if (
      j &&
      (action.interface !== 'hardness-assessment' ||
        !continuing ||
        a.position.x !== j.x ||
        a.position.y !== j.y)
    )
      scratchRelease(w, a, j, 'Action or held contact position changed.');
  },
  onDeath(w, a) {
    const j = scratchActive(w, a);
    if (j) scratchRelease(w, a, j, 'Performer died.', true);
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing grounded-understanding source.');
    const t = {
      event: 'information-confirmed',
      interface: 'hardness-assessment',
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
};
