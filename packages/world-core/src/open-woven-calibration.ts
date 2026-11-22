import type { V7ActionContext, V7Data, V7Object } from './continuous-types.js';
import { v7Spend } from './continuous-base.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { openRemember } from './open-foundation.js';
import { wovenActive, wovenResume, wovenRelease } from './open-woven-work.js';
export function wovenTare(o: V7Object): number {
  const g = o.data.geometry as V7Data;
  return (
    Number(g.leftPanMass ?? 0) * Number(g.leftArm) -
    Number(g.rightPanMass ?? 0) * Number(g.rightArm)
  );
}
export function wovenCalibrate(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  if (!a.mastered.includes('food-assay'))
    throw new Error('Personal food-assay mastery is required for calibration.');
  const j = wovenActive(w, a) ?? wovenResume(c);
  if (j.mode !== 'assemble' || j.stage < 14)
    throw new Error(
      'The same assembled apparatus and comparison pieces must actually exist.',
    );
  const balance = w.objects.find((o) => o.id === j.balance),
    mesh = w.objects.find((o) => o.id === j.mesh);
  if (
    !balance ||
    !mesh ||
    [balance, mesh].some(
      (o) =>
        Number(o.data.service) <= 0 ||
        v7ShapeDistance(a.position, o.spatial) > 0.65,
    )
  )
    throw new Error(
      'Both maintained apparatuses must be within actual hand reach.',
    );
  const weights = j.weights.map((id) =>
    w.stacks.find((s) => s.id === id && s.owner === a.id && !s.reservedFor),
  );
  if (weights.length !== 5 || weights.some((s) => !s))
    return { complete: false, remaining: 17 - j.stage, writes: [] };
  if (a.vitals.energy < 0.5)
    return { complete: false, remaining: 17 - j.stage, writes: [] };
  const g = balance.data.geometry as V7Data,
    left = Number(g.leftArm),
    right = Number(g.rightArm);
  const first = weights[0],
    second = weights[1];
  if (!first || !second) throw new Error('Missing retained comparison pieces.');
  const m1 = foodUnitMass(w, first) * first.quantity,
    m2 = foodUnitMass(w, second) * second.quantity;
  const reference = m1 * left,
    tare = wovenTare(balance),
    friction = Number(balance.data.friction ?? 0.01),
    drift = Number(balance.data.creep ?? 0);
  if (!(reference > 0))
    throw new Error('No actual positive comparison moment.');
  const relative =
    (j.stage === 14
      ? tare
      : j.stage === 15
        ? m2 * left - m1 * right + tare
        : m1 * left - m2 * right + tare) / reference;
  const uncertainty = Math.abs(relative) + friction + drift;
  v7Spend(a, 0.5);
  j.paid += 0.5;
  const row = {
    tick: w.tick,
    stage: j.stage + 1,
    relativeImbalance: relative,
    friction,
    creep: drift,
    uncertainty,
    weights: j.weights,
    paidEnergy: 0.5,
    passed: uncertainty <= 0.05,
  };
  j.measurements.push(row);
  if (uncertainty > 0.05) {
    balance.data.calibrated = false;
    c.emit(
      'apparatus-load-failed',
      'Paid calibration found actual mechanical uncertainty above the useful resolution; no measurement approval.',
      { project: j.id, ...row },
      balance.id,
    );
    const key = `woven:calibration:${balance.id}:failed`;
    if (!a.memory.knowledge?.[key]?.verified)
      openRemember(c, {
        key,
        subject: balance.id,
        property: 'calibration limit',
        value: row,
        method: 'paid actual comparison',
        condition: 'uncalibrated',
        verified: true,
      });
    return { complete: false, remaining: 17 - j.stage, writes: [balance.id] };
  }
  const history = (balance.data.calibrationHistory ?? []) as V7Data[];
  history.push(row);
  balance.data.calibrationHistory = history;
  j.stage++;
  balance.data.progress = j.stage;
  balance.data.paidEnergy = j.paid;
  const complete = j.stage === 17;
  if (complete) {
    balance.data.calibrated = true;
    balance.data.resolution = 0.05;
    balance.data.calibrationTare = tare;
    balance.data.calibrationCreep = drift;
    balance.name = 'Calibrated woven comparison balance';
    balance.visual.label = balance.name;
    balance.visual.state = 'ready';
    mesh.visual.state = 'ready';
    const key = `woven:calibration:${balance.id}:supported`;
    if (!a.memory.knowledge?.[key]?.verified)
      openRemember(c, {
        key,
        subject: balance.id,
        property: 'working comparison range',
        value: {
          history,
          resolution: 0.05,
          safeWorkingLoad: balance.data.safeWorkingLoad ?? 0,
        },
        method: 'paid zero, exchange and repeated retained-load comparison',
        condition: 'current actual geometry and tare',
        verified: true,
      });
    wovenRelease(w, a, j);
  }
  c.emit(
    complete ? 'woven-support-completed' : 'woven-support-progress',
    complete
      ? 'Paid fabrication and calibration completed; real samples still require retention and measurement.'
      : 'Actual calibration work advanced.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 17 - j.stage,
      paidEnergy: j.paid,
      reading: row,
    },
    balance.id,
  );
  return { complete, remaining: 17 - j.stage, writes: [balance.id] };
}
