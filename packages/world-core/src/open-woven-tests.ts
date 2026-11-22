import type {
  V7ActionContext,
  V7Data,
  V7World,
  V7Stack,
} from './continuous-types.js';
import { v7String, v7Json } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { openRemember } from './open-foundation.js';
import { appliedWater } from './open-water-contact.js';
import {
  wovenLaw,
  wovenHydrate,
  wovenMeasurement,
  wovenWater,
  wovenWetSample,
} from './open-woven-physics.js';
import {
  wovenActive,
  wovenCreate,
  wovenInputs,
  wovenReserve,
  wovenRelease,
} from './open-woven-work.js';
export function wovenTool(
  w: V7World,
  id: string,
  owner: string,
): V7Stack | null {
  const s = w.stacks.find(
    (s) =>
      s.id === id && s.owner === owner && !s.reservedFor && s.quantity >= 1,
  );
  return s &&
    (w.resources.find((r) => r.id === s.resource)?.properties?.hardness ?? 0) >=
      8
    ? s
    : null;
}
export function wovenTest(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = wovenActive(w, a);
  if (!j) {
    const mode = v7String(c.action.args.mode, 'physical test'),
      resource = mode === 'test-beam' ? 'branch' : 'vine';
    const target = w.stacks.find(
      (s) =>
        s.id === c.action.args.target &&
        s.owner === a.id &&
        !s.reservedFor &&
        s.resource === resource,
    );
    if (!target || target.quantity < 0.1)
      throw new Error(
        'An actual owned 0.1-unit specimen of the declared material is required.',
      );
    const controls = wovenInputs(c);
    if (
      controls.length !== 1 ||
      !controls[0] ||
      !wovenTool(w, controls[0].id, a.id)
    )
      throw new Error('Explicitly allocate one real retained hard stone tool.');
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: 2, writes: [] };
    v7Spend(a, 0.5);
    j = wovenCreate(c, mode, 2);
    j.tools = [controls[0].id];
    j.stage = 1;
    j.paid = 0.5;
    const specimen = wovenReserve(c, j, target, 0.1);
    wovenLaw(w, specimen);
    wovenHydrate(w, specimen);
    j.specimen = specimen.id;
    specimen.processing = {
      ...(specimen.processing ?? {}),
      wovenSpecimen: {
        project: j.id,
        source: target.id,
        stage: 'prepared',
        dryReady: mode === 'test-beam',
        broken: false,
      },
    };
    c.emit(
      'woven-support-progress',
      'Prepared an actual test specimen; model parameters are not observations or suitability. A vine specimen must physically dry before controlled dry/wet comparison.',
      {
        project: j.id,
        specimen: specimen.id,
        paidEnergy: j.paid,
        stage: 1,
        remainingWork: 1,
      },
      specimen.id,
    );
    return { complete: false, remaining: 1, writes: [target.id, specimen.id] };
  }
  const specimen = w.stacks.find(
      (s) => s.id === j.specimen && s.owner === a.id,
    ),
    tool = wovenTool(w, j.tools[0] ?? '', a.id);
  if (!specimen)
    throw new Error(
      'The same actual specimen must be retained for this work record.',
    );
  if (!tool || a.vitals.energy < 0.5)
    return { complete: false, remaining: 1, writes: [] };
  wovenHydrate(w, specimen);
  const physical = specimen.physical;
  if (!physical) throw new Error('Missing physical specimen.');
  const wetness = physical.unitWater / Math.max(1e-9, physical.unitMass);
  const contact =
    j.mode === 'test-vine' ? appliedWater(w, a, specimen, tool) : null;
  if (j.mode === 'test-vine' && wetness > 0.2 && !contact) {
    c.emit(
      'woven-support-progress',
      'The real specimen is still too wet for a dry baseline; passive drying continues with actual exposure. No active effort was charged.',
      {
        project: j.id,
        specimen: specimen.id,
        wetness,
        paidEnergy: j.paid,
        remainingWork: 1,
      },
      specimen.id,
    );
    return { complete: false, remaining: 1, writes: [] };
  }
  const first = contact
      ? contact.first
      : wovenMeasurement(w, specimen, tool, wetness),
    readings: V7Data[] = [v7Json(first) as V7Data];
  let water: V7Data | null = null;
  if (j.mode === 'test-vine') {
    if (w.state.riverWater === 1) {
      if (!contact) {
        c.emit(
          'woven-support-progress',
          'Missing actual local paid contact water; access-water must wet this retained specimen before the remaining comparison. Prior waterless work is unchanged.',
          {
            project: j.id,
            specimen: specimen.id,
            paidEnergy: j.paid,
            remainingWork: 1,
          },
          specimen.id,
        );
        return { complete: false, remaining: 1, writes: [] };
      }
      water = contact.water as V7Data;
    } else {
      // Missing water throws before any paid second-stage mutation; the prior prepared specimen survives.
      let withdrawn;
      try {
        withdrawn = wovenWater(w, a, 0.1);
      } catch (error: unknown) {
        c.emit(
          'woven-support-progress',
          error instanceof Error
            ? error.message
            : 'Actual test water is unavailable.',
          {
            project: j.id,
            specimen: specimen.id,
            paidEnergy: j.paid,
            remainingWork: 1,
          },
          specimen.id,
        );
        return { complete: false, remaining: 1, writes: [] };
      }
      water = wovenWetSample(w, specimen, withdrawn);
    }
    readings.push(
      v7Json(
        wovenMeasurement(
          w,
          specimen,
          tool,
          physical.unitWater / physical.unitMass,
        ),
      ) as V7Data,
    );
  }
  v7Spend(a, 0.5);
  if (contact) contact.used = true;
  j.paid += 0.5;
  j.stage = 2;
  j.measurements = readings;
  const passed = readings.every((r) => r.passed === true),
    safeWorkingLoad = Math.min(
      ...readings.map((r) => Number(r.safeWorkingLoad)),
    );
  const result = {
    project: j.id,
    resource: specimen.resource,
    origin: specimen.origin,
    specimen: specimen.id,
    readings,
    water,
    passed,
    safeWorkingLoad,
    uncertainty: 0.5,
    paidEnergy: j.paid,
  };
  specimen.processing = {
    ...(specimen.processing ?? {}),
    wovenSpecimen: { project: j.id, stage: 'tested', broken: !passed, result },
  };
  const findingKey = `woven:${specimen.resource}:${specimen.origin}:${passed ? 'supported' : 'failed'}`;
  if (!a.memory.knowledge?.[findingKey]?.verified)
    openRemember(c, {
      key: findingKey,
      subject: specimen.resource,
      property: 'tested batch support',
      value: result,
      method:
        j.mode === 'test-vine'
          ? 'paid controlled dry/wet tension and slip comparison'
          : 'paid specimen bending with retained real load',
      condition: passed
        ? 'tested conservative working range'
        : 'measured mechanical failure; assembly not approved',
      verified: true,
    });
  c.emit(
    'woven-support-test',
    passed
      ? 'Actual paid material tests established a conservative working range; assembly still needs real components and calibration.'
      : 'Actual paid testing exceeded a physical limit; retained fragments do not approve assembly.',
    result,
    specimen.id,
  );
  wovenRelease(w, a, j);
  return { complete: true, remaining: 0, writes: [specimen.id] };
}
export function wovenTested(
  w: V7World,
  actor: string,
  s: V7Stack,
): V7Data | null {
  const a = w.actors.find((a) => a.id === actor),
    k = a?.memory.knowledge?.[`woven:${s.resource}:${s.origin}:supported`];
  if (s.processing?.wovenDamage) return null;
  if (
    !k?.verified ||
    !k.value ||
    typeof k.value !== 'object' ||
    Array.isArray(k.value) ||
    k.value.passed !== true
  )
    return null;
  const test = s.processing?.wovenSpecimen;
  if (
    test &&
    typeof test === 'object' &&
    !Array.isArray(test) &&
    test.broken === true
  )
    return null;
  return k.value;
}
