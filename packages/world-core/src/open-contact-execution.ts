import type {
  V7ActionContext,
  V7Stack,
  V7Data,
  V7World,
} from './continuous-types.js';
import { v7String, v7Signature, v7Json } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { scratchVisible, scratchStroke } from './open-hardness-physics.js';
import { scratchReserve, type ScratchWork } from './open-hardness-work.js';
import { openRemember } from './open-foundation.js';
import {
  contactProject,
  contactActive,
  contactKey,
  contactProcess,
  contactResume,
  CONTACT_MODEL,
} from './open-contact-work.js';
function owned(c: V7ActionContext, id: string) {
  const s = c.world.stacks.find(
    (s) => s.id === id && s.owner === c.actor.id && !s.reservedFor,
  );
  if (!s)
    throw new Error(
      'The exact owned unreserved contact specimen is unavailable.',
    );
  return s;
}
export function contactSurfaces(w: V7World, j: ScratchWork): string {
  return v7Signature(
    j.specimens.map((id) => {
      const s = w.stacks.find((s) => s.id === id);
      return s
        ? {
            ...scratchVisible(w, s),
            owner: s.owner,
            physical: s.physical ?? null,
            alteration: s.processing?.scratchAlteration ?? null,
            contamination: s.processing?.contamination ?? null,
          }
        : null;
    }),
  );
}
export function contactInspect(c: V7ActionContext) {
  const target = owned(c, v7String(c.action.args.target, 'specimen')),
    other =
      typeof c.action.args.counterface === 'string' && c.action.args.counterface
        ? owned(c, c.action.args.counterface)
        : null;
  if (other?.id === target.id)
    throw new Error('Distinct physical surfaces must be named.');
  if (c.actor.vitals.energy < 0.2)
    return { complete: false, remaining: 1, writes: [] };
  const j = contactProject(c, true);
  v7Spend(c.actor, 0.2);
  j.paid += 0.2;
  const observations = [target, ...(other ? [other] : [])].map((s) =>
    scratchVisible(c.world, s),
  );
  const old = (j.inspections ?? []) as V7Data[];
  j.inspections = [
    ...old.filter((r) => !observations.some((o) => o.specimen === r.specimen)),
    ...observations,
  ];
  if (j.status === 'new') j.status = 'inspected';
  c.emit(
    'contact-calibration-progress',
    'Inspected actual contact surfaces; model-derived geometry is not an independent absolute hardness anchor.',
    {
      project: j.id,
      mode: 'inspect',
      paidEnergy: 0.2,
      totalPaid: j.paid,
      observations,
      model: CONTACT_MODEL,
      absoluteBounds: null,
      remainingWork: 0,
    },
    target.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}
function held(c: V7ActionContext, j: ScratchWork): V7Stack[] {
  const specimens = j.specimens.map((id) =>
    c.world.stacks.find((s) => s.id === id && s.owner === c.actor.id),
  );
  if (specimens.length !== 2 || !specimens[0] || !specimens[1])
    throw new Error(
      'The same two held portions are required; remote or missing surfaces cannot be contacted.',
    );
  return [specimens[0], specimens[1]];
}
export function contactSweep(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = contactActive(w, a);
  if (!j) {
    j = contactProject(c);
    if (!['new', 'inspected'].includes(j.status))
      throw new Error(
        'Use explicit resume for the same unfinished project, or a new project for a new paid sweep.',
      );
    const first = owned(c, v7String(c.action.args.target, 'specimen')),
      second = owned(c, v7String(c.action.args.counterface, 'counterface'));
    if (first.id === second.id || first.quantity < 0.1 || second.quantity < 0.1)
      throw new Error(
        'Two distinct actual 0.1-unit portions are required before costs.',
      );
    const surfaces = [first, second].map((s) => scratchVisible(w, s)),
      inspections = (j.inspections ?? []) as V7Data[];
    if (
      surfaces.some(
        (s) =>
          !s.controlledContact ||
          !inspections.some(
            (r) =>
              r.specimen === s.specimen &&
              r.edgeRadius === s.edgeRadius &&
              r.wear === s.wear,
          ),
      )
    )
      throw new Error(
        'Both actual usable surfaces require current personal inspection; geometry is never prepared for free.',
      );
    if (
      Math.abs(
        (surfaces[0]?.edgeRadius ?? 0) - (surfaces[1]?.edgeRadius ?? 0),
      ) < 0.00001
    ) {
      j.geometryLimit =
        'The supplied surfaces do not supply two sufficiently distinct contact radii.';
      c.emit(
        'contact-calibration-invalidated',
        'Insufficient actual geometry; no second edge, contact or absolute bound was produced.',
        {
          project: j.id,
          surfaces,
          paidEnergy: 0,
          remainingWork: 6,
          absoluteBounds: null,
        },
        first.id,
      );
      return { complete: true, remaining: 0, writes: [] };
    }
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: 5, writes: [] };
    j.sources = [first.id, second.id];
    j.specimens = [];
    j.stage = 0;
    j.observations = [];
    j.x = a.position.x;
    j.y = a.position.y;
    j.status = 'active';
    j.tests = 1;
    j.evidenceRoots = [first, second].map((s) => `${s.origin}:${s.resource}`);
    scratchReserve(c, j, first, contactKey(a.id, j.id));
    scratchReserve(c, j, second, contactKey(a.id, j.id));
    a.extensionState['open:contact-work'] = j.id;
    contactProcess(w, j);
  }
  if (j.stage >= 5)
    throw new Error(
      'All sweep stages are complete; explicit paid assessment remains.',
    );
  const specimens = held(c, j),
    cost = j.stage < 4 ? 0.5 : 0.2;
  if (a.vitals.energy < cost)
    return { complete: false, remaining: 5 - j.stage, writes: [] };
  if (specimens.some((s) => !scratchVisible(w, s).controlledContact))
    return { complete: false, remaining: 5 - j.stage, writes: [] };
  v7Spend(a, cost);
  j.paid += cost;
  let row: V7Data;
  if (j.stage < 4) {
    const first = specimens[j.stage % 2],
      second = specimens[(j.stage + 1) % 2];
    if (!first || !second)
      throw new Error('Missing actual directional surfaces');
    row = {
      ...scratchStroke(w, first, second, j.id, j.stage < 2 ? 0.5 : 1),
      stage: j.stage + 1,
      dwell: 1,
      forceLevel: j.stage < 2 ? 'lower actuator level' : 'upper actuator level',
      measurementStatus:
        'achieved model quantities, independently uncalibrated',
      modelVersion: 1,
      anchors: null,
      paidEnergy: cost,
    };
  } else
    row = {
      stage: 5,
      inspection: specimens.map((s) => scratchVisible(w, s)),
      paidEnergy: cost,
      absoluteBounds: null,
    };
  j.observations.push(row);
  j.stage++;
  if (j.stage === 5) {
    j.surfaceSignature = contactSurfaces(w, j);
    j.status = 'awaiting-assessment';
    delete a.extensionState['open:contact-work'];
    for (const s of specimens) delete s.reservedFor;
  }
  c.emit(
    'contact-calibration-progress',
    j.stage === 5
      ? 'Four actual contacts and final surface inspection are retained; paid assessment remains and no certificate exists.'
      : 'Executed one bounded contact using an existing physical tip; no calibrated standard was supplied.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 6 - j.stage,
      paidEnergy: j.paid,
      specimens: j.specimens,
      observation: row,
      modelVersion: 1,
      absoluteBounds: null,
    },
    specimens[0]?.id,
  );
  return {
    complete: j.stage === 5,
    remaining: 5 - j.stage,
    writes: j.specimens,
  };
}
export function contactAssess(c: V7ActionContext) {
  const j = contactActive(c.world, c.actor) ?? contactProject(c);
  if (j.stage < 5)
    throw new Error(
      'All four real contacts and final inspection are required before assessment.',
    );
  const specimens = held(c, j);
  if (c.actor.vitals.energy < 0.2)
    return { complete: false, remaining: 1, writes: [] };
  const current = contactSurfaces(c.world, j);
  if (j.surfaceSignature && j.surfaceSignature !== current) {
    j.applicable = false;
    j.status = 'invalidated';
    delete c.actor.extensionState['open:contact-work'];
    for (const specimen of specimens)
      if (specimen.reservedFor === contactKey(j.owner, j.id))
        delete specimen.reservedFor;
    c.emit(
      'contact-calibration-invalidated',
      'Subsequent surface damage, contamination or unsupported transfer invalidated applicability.',
      { project: j.id, absoluteBounds: null, paidEnergy: 0 },
      specimens[0]?.id,
    );
    return { complete: true, remaining: 0, writes: [] };
  }
  v7Spend(c.actor, 0.2);
  j.paid += 0.2;
  const result = {
    specimens: j.specimens,
    model: CONTACT_MODEL,
    observations: j.observations,
    absoluteBounds: null,
    conclusion: 'unresolved',
    threshold: 8,
    absoluteCertificateValid: false,
    reason:
      'No independent force/length calibration or absolute standard anchors the model; inversion of index-dependent initial radius would be circular.',
    paidEnergy: j.paid,
    surfaceSignature: current,
    scope: 'only actual tested portions; no parent-stack certification',
  };
  j.result = result;
  j.surfaceSignature = current;
  j.applicable = true;
  j.status = 'completed';
  j.stage = 6;
  delete c.actor.extensionState['open:contact-work'];
  for (const s of specimens) delete s.reservedFor;
  const roots = j.evidenceRoots as string[],
    key = `contact-sweep:${roots.join('|')}:unanchored-response`;
  if (
    j.observations.slice(0, 4).every((r) => r.interpretable === true) &&
    !c.actor.memory.knowledge?.[key]?.verified
  )
    openRemember(c, {
      key,
      subject: j.specimens.join(' versus '),
      property:
        'observed force and geometry response with unresolved absolute scale',
      value: v7Json({
        project: j.id,
        specimens: j.specimens,
        modelVersion: 1,
        anchors: null,
        absoluteBounds: null,
        conclusion: 'unresolved',
        reason: result.reason,
        retainedObservationCount: j.observations.length,
        responsePattern: j.observations.slice(0, 4).map((r) => ({
          forceLevel: r.forceLevel,
          groove: r.persistentGroove,
          powder: r.transferredPowder,
          interpretable: r.interpretable,
        })),
        evidenceLocation:
          'Full achieved forces, surfaces, wear and lineage remain in this own project and replay events.',
      }),
      method:
        'four paid bounded contacts, actual surface inspection and identifiability assessment',
      condition:
        'model-achieved quantities; no independent dimensional anchors',
      verified: true,
    });
  c.emit(
    'contact-calibration-completed',
    'Completed paid response observations and assessment. Absolute bounds remain unresolved; no tool certification or physical standard was created.',
    { project: j.id, stage: 6, remainingWork: 0, ...result },
    specimens[0]?.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}
export function contactContinue(c: V7ActionContext) {
  const j = contactActive(c.world, c.actor) ?? contactResume(c);
  return j.stage < 5 ? contactSweep(c) : contactAssess(c);
}
