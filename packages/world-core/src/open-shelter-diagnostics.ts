import { poleShapes } from './open-material-geometry.js';
import type { V7ActionContext, V7Data, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import { v7Reach } from './continuous-geometry.js';
import { ForestReferenceError } from './forest-references.js';
import { refugeMaterial, refugeTestKey } from './open-shelter-material.js';
import { openRemember } from './open-foundation.js';
export const REFUGE_DIAGNOSTIC_VERSION = 'shelter-reference-diagnostics@1';
export function refugeDiagnosticInspect(c: V7ActionContext) {
  const id = v7String(c.action.args.target, 'resolved identity'),
    supplied = c.operation?.request?.args.target ?? id,
    s = c.world.stacks.find((s) => s.id === id && s.owner === c.actor.id),
    o = c.world.objects.find(
      (o) =>
        o.id === id && o.kind === 'open-refuge' && v7Reach(c.actor, o.spatial),
    ),
    operationId = `shelter-inspection:${c.actor.id}:${String(c.world.tick)}`;
  const diagnostic: V7Data = {
    contract: REFUGE_DIAGNOSTIC_VERSION,
    operationId,
    suppliedReference: supplied,
    resolvedId: id,
    reasonCode: 'resolved',
    requiredCondition:
      'Actual owned material or reachable structure; paid inspection does not establish load capacity.',
    observedObstruction: null,
    paidEnergy: 0,
    remainingWork: 1,
  };
  const fail = (code: string, obstruction: string): never => {
    throw new ForestReferenceError(code, [id], obstruction, {
      ...diagnostic,
      reasonCode: code,
      observedObstruction: obstruction,
    });
  };
  if (
    !s &&
    c.world.stacks.some((item) => item.id === id && item.owner === null)
  )
    fail(
      'wrong-ownership',
      'The resolved visible item is on the ground, not owned by the inspecting actor.',
    );
  if (!s && !o)
    fail(
      'inaccessible-identity',
      'No owned material or reachable shelter within actual interaction distance.',
    );
  if (s && !['branch', 'reed', 'vine'].includes(s.resource))
    fail(
      'unsuitable-material',
      'This material is outside the installed structural measurement model; no implied strength or geometry.',
    );
  if (s && s.quantity < 0.1)
    fail(
      'insufficient-quantity',
      'No substantial remaining material to inspect.',
    );
  if (c.actor.vitals.energy < 0.2)
    fail(
      'insufficient-energy',
      'Paid physical inspection requires 0.2 available energy.',
    );
  let observed: V7Data = {};
  let known = false;
  if (s) {
    const law = c.world.state[`woven:law:${s.resource}:${s.origin}`];
    known =
      (!!law && typeof law === 'object' && !Array.isArray(law)) ||
      poleShapes(c.world, s).length > 0;
    if (known) {
      const m = refugeMaterial(c.world, s);
      observed = {
        source: s.origin,
        item: s.id,
        quantity: s.quantity,
        mass: Number(m.unitMass) * s.quantity,
        length: m.length ?? null,
        diameter: Number(m.diameter) * Math.sqrt(Math.min(1, s.quantity)),
        condition: {
          intact: m.intact ?? false,
          wetness: m.wetness ?? null,
          alterations: s.processing ?? null,
        },
        lawVersion: m.version ?? null,
        loadCapacity: null,
        uncertainty:
          'Source-model geometry is observable; joint/roof suitability still requires actual paid source tests and load proof.',
      };
    } else {
      diagnostic.reasonCode = 'geometry-unavailable';
      diagnostic.observedObstruction =
        'No represented physical dimensions exist for this source batch.';
      observed = {
        source: s.origin,
        item: s.id,
        quantity: s.quantity,
        mass:
          (s.physical?.unitMass ??
            c.world.resources.find((r) => r.id === s.resource)?.mass ??
            0) * s.quantity,
        length: null,
        diameter: null,
        loadCapacity: null,
        condition: { alterations: s.processing ?? null },
        uncertainty:
          'Physical dimensions are unknown; item ownership and presence are resolved independently.',
      };
    }
    if (poleShapes(c.world, s).length) {
      observed.length = null;
      observed.diameter = null;
      observed.lawVersion = 'material-geometry@1';
      observed.uncertainty =
        'Represented tapered shape is visible; paid metrology is still required for dimensional intervals and configuration-specific testing.';
    }
  } else if (o) {
    known = true;
    observed = {
      structure: o.id,
      geometry: o.spatial as unknown as V7Data,
      condition: o.data.condition ?? null,
      coverage: o.data.coverage ?? null,
      loadMargin: o.data.loadMargin ?? null,
      proven: o.data.proven ?? false,
      uncertainty:
        'Current measured structure state; no new proof or repair is performed.',
    };
  }
  v7Spend(c.actor, 0.2);
  diagnostic.paidEnergy = 0.2;
  diagnostic.remainingWork = 0;
  c.actor.extensionState['refuge:inspection-last'] = {
    ...diagnostic,
    observed,
    tick: c.world.tick,
    status: 'completed',
  };
  c.emit(
    'shelter-reference-diagnostic',
    `${id}: identity resolved; ${known ? 'represented geometry observed' : 'physical geometry unavailable'}; suitability remains separate; paid 0.2 energy.`,
    diagnostic,
    id,
  );
  c.emit(
    'shelter-inspected',
    `${id}: completed paid inspection; ${s && poleShapes(c.world, s).length ? 'represented shape observed; dimensional measurement remains separate' : known ? 'measured existing geometry and condition' : 'dimensions remain unknown'}; no structural suitability granted.`,
    { ...diagnostic, observed },
    id,
  );
  if (known && s && !poleShapes(c.world, s).length) {
    const alreadyObserved =
      !!c.world.state[refugeTestKey(c.actor.id, s)] ||
      !!c.actor.memory.knowledge?.[
        `woven:${s.resource}:${s.origin}:supported`
      ] ||
      !!c.actor.memory.knowledge?.[`woven:${s.resource}:${s.origin}:failed`];
    const geometryKey = `refuge:geometry:${s.resource}:${String(Number(observed.lawVersion))}:${String(Number(observed.length))}:${(Number(observed.diameter) / Math.sqrt(Math.min(1, s.quantity))).toPrecision(4)}`;
    openRemember(
      {
        ...c,
        emit: (type, description, data = {}, target = null) => {
          if (alreadyObserved && type === 'information-confirmed') return;
          c.emit(
            type,
            description,
            {
              ...data,
              ...(alreadyObserved
                ? { newInformation: false, known: true }
                : {}),
              practiceEligible: false,
            },
            target,
          );
        },
      },
      {
        key: geometryKey,
        subject: s.origin,
        property: 'represented structural geometry',
        value: observed,
        method: 'paid canonical material inspection',
        condition:
          'Geometry observation only; load capacity remains unresolved.',
        verified: true,
      },
    );
  }
  return { complete: true, remaining: 0, writes: [] };
}
export const OPEN_SHELTER_DIAGNOSTICS: V7Package = {
  id: 'shelter-reference-diagnostics',
  version: 1,
  scope: 'open-ex10',
  dependencies: ['resting-shelter@1'],
  description:
    'Versioned compatibility/diagnostic repair of existing inspection; no physical invention or mastery reset.',
  reuse: {
    experiment: 'ex10 development 7',
    source: 'packages/world-core/src/open-shelter-tests.ts',
    description:
      'Repairs canonical-reference compatibility and inspection diagnostics. Existing physical shelter and costs are reused, not independently reinvented.',
  },
  abilities: [
    {
      id: 'shelter-reference-contract',
      name: 'Shelter reference diagnostics',
      function:
        'Read the corrected identity and diagnostic contract used by existing shelter inspection.',
      equivalence: 'open:shelter-inspection-diagnostic-contract:1',
      parameters: v7ObjectSchema({}),
      prerequisites: [],
      learning: 1,
      costs:
        'One personal learning round for this added diagnostic contract; existing shelter mastery remains valid immediately. Reading the contract takes one action, no materials or physical certification.',
      effects:
        'Bare persistent IDs and one item: prefix name the same owned specimen. Diagnostics separate lookup, ownership, quantity, eligibility and unknown geometry. Project capacity never gates inspection; no implicit archiving or wellbeing reward.',
      handler: 'open.refuge-diagnostic-contract',
      revision: REFUGE_DIAGNOSTIC_VERSION,
      authored: false,
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'One completed contract read; not a physical inspection.',
      },
    },
  ],
  handlers: {
    'open.refuge-diagnostic-contract': (c) => {
      c.emit(
        'shelter-reference-diagnostic',
        'The corrected contract accepts exact persistent IDs or one typed identity prefix; existing personal shelter mastery needs no retraining.',
        {
          contract: REFUGE_DIAGNOSTIC_VERSION,
          reasonCode: 'contract-read',
          paidEnergy: 0,
        },
      );
      return { complete: true, writes: [] };
    },
  },
  resources: [],
  satisfaction: [],
  processes: {},
  visualComponents: ['rock'],
  events: ['shelter-reference-diagnostic'],
  migrate(w) {
    w.state.refugeDiagnostics = 1;
    const a = w.abilities.find((a) => a.id === 'resting-shelter');
    if (!a) throw new Error('Missing existing shelter interface.');
    a.costs = a.costs.replace(
      'Exact persistent IDs only.',
      'Exact persistent IDs or one item:/object: identity prefix; resource aliases remain invalid.',
    );
    return w;
  },
};
