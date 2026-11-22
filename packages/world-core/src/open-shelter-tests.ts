import { refugeDiagnosticInspect } from './open-shelter-diagnostics.js';
import type { V7ActionContext } from './continuous-types.js';
import { v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7Reach } from './continuous-geometry.js';
import {
  refugeInputs,
  refugeMaterial,
  refugeTestKey,
} from './open-shelter-material.js';
import {
  refugeActive,
  refugeCreate,
  refugeReserve,
  refugeStop,
} from './open-shelter-work.js';
import { openRemember } from './open-foundation.js';
export function refugeInspect(c: V7ActionContext) {
  if (c.world.state.refugeDiagnostics === 1) return refugeDiagnosticInspect(c);
  const id = v7String(c.action.args.target, 'exact target ID'),
    s = c.world.stacks.find((s) => s.id === id && s.owner === c.actor.id),
    o = c.world.objects.find(
      (o) =>
        o.id === id && o.kind === 'open-refuge' && v7Reach(c.actor, o.spatial),
    );
  if (!s && !o)
    throw new Error('Inspect an exact owned material or reachable shelter ID.');
  const material = s ? refugeMaterial(c.world, s) : null;
  const data = material
    ? {
        length: material.length ?? null,
        diameter: material.diameter ?? null,
        mass: material.unitMass ?? null,
        wetness: material.wetness ?? null,
        intact: material.intact ?? null,
        lawVersion: material.version ?? null,
      }
    : o?.data;
  v7Spend(c.actor, 0.2);
  c.emit(
    'shelter-inspected',
    'Measured actual geometry and condition; inspection alone does not establish load capacity.',
    { measurement: data ?? null },
    id,
  );
  return { complete: true, writes: [] };
}
export function refugeTest(c: V7ActionContext) {
  let j = refugeActive(c.world, c.actor);
  if (!j) {
    const inputs = refugeInputs(c);
    if (inputs.length !== 1 || !inputs[0])
      throw new Error('Allocate one explicit test specimen.');
    const { s, q, material } = inputs[0];
    if (
      c.world.revisions.includes('material-geometry@1') &&
      s.resource === 'branch'
    )
      throw new Error(
        'Represented poles require personal metrology measurement and actual allocated-load testing; a generic source-batch trial cannot certify them.',
      );
    if (q < 0.1 || q > 1 || material.intact !== true)
      throw new Error(
        'Use 0.1 to 1 unit of actual intact material for a new test.',
      );
    if (c.actor.vitals.energy < 0.5)
      return { complete: false, remaining: 2, writes: [] };
    j = refugeCreate(c, 'test', 2);
    const sample = refugeReserve(c, j, s, q);
    sample.processing = {
      ...(sample.processing ?? {}),
      refugeTest: { source: s.id, stage: 0 },
    };
  }
  const s = c.world.stacks.find(
    (s) => s.id === j.escrow[0] && s.owner === c.actor.id,
  );
  if (!s || c.actor.vitals.energy < 0.5)
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  v7Spend(c.actor, 0.5);
  j.paid += 0.5;
  j.stage++;
  const m = refugeMaterial(c.world, s),
    capacity =
      Number(m.capacity) * s.quantity ** (s.resource === 'branch' ? 1.5 : 1),
    force = Math.min(30, capacity * 0.4),
    wet = Number(m.wetness),
    slip = (Number(m.creep) * (1 + wet) * force) / Math.max(1, capacity),
    passed = force >= 1 && slip < 0.02;
  s.processing = {
    ...(s.processing ?? {}),
    refugeTest: {
      stage: j.stage,
      appliedForce: force,
      deformation:
        force / Math.max(1, Number(m.modulus) * Number(m.area) * s.quantity),
      slip,
      broken: !passed,
      altered: true,
    },
  };
  c.emit(
    'shelter-material-tested',
    'Paid bounded bending or knot-slip trial changed this retained specimen.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 2 - j.stage,
      paidEnergy: j.paid,
      material: {
        ...m,
        actualQuantity: s.quantity,
        actualVolume: Number(m.volume) * s.quantity,
        actualDiameter: Number(m.diameter) * Math.sqrt(s.quantity),
      },
      appliedForce: force,
      slip,
      passed,
    },
    s.id,
  );
  if (j.stage === 2) {
    const measurement = {
      passed,
      safeCapacity: passed
        ? Math.min(
            Number(m.capacity) * 0.5,
            (force * 2) / s.quantity ** (s.resource === 'branch' ? 1.5 : 1),
          )
        : 0,
      source: s.origin,
      specimen: s.id,
      measuredAt: c.world.tick,
      uncertainty: 0.5,
    };
    c.world.state[refugeTestKey(c.actor.id, s)] = measurement;
    openRemember(c, {
      key: refugeTestKey(c.actor.id, s),
      subject: s.origin,
      property: 'bounded structural response',
      value: measurement,
      method: 'two paid bend/tension contacts',
      condition:
        'Source-batch estimate, not roof certification; tested fragment is not intact stock.',
      verified: true,
    });
    refugeStop(
      c.world,
      c.actor,
      j,
      'Material trial complete; altered specimen retained.',
    );
    j.status = 'completed';
  }
  return { complete: j.stage === 2, remaining: 2 - j.stage, writes: [s.id] };
}
