import type { V7ActionContext, V7Data } from './continuous-types.js';
import { v7Spend } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { forestClimate } from './forest-climate.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { assayNearby } from './open-assay-equipment.js';
import { assayRelativeReading } from './open-assay-reading.js';
import { wovenDrift } from './open-woven-contract.js';
import { openRemember } from './open-foundation.js';
import {
  preservationRate,
  preservationPhysics,
  preservationTrayArea,
} from './open-preservation-physics.js';
import {
  preservationWork,
  preservationKey,
  preservationAccessible,
} from './open-preservation-work.js';
const optionalIdentity = (value: unknown) =>
  value === '' ? '' : v7String(value, 'optional exact identity');
export function preservationInspect(c: V7ActionContext) {
  const target = optionalIdentity(c.action.args.target),
    apparatus = optionalIdentity(c.action.args.apparatus);
  if (c.action.args.quantityTenths !== 0 || c.action.args.project !== '')
    throw new Error(
      'Inspect uses only exact target and/or apparatus identities.',
    );
  const s = target
    ? c.world.stacks.find(
        (s) => s.id === target && s.owner === c.actor.id && !s.reservedFor,
      )
    : undefined;
  if (target && !s)
    throw new Error(
      'Inspect requires the actual owned unreserved food identity.',
    );
  if (!target && !apparatus)
    throw new Error('Inspect needs an actual subject.');
  const tray = apparatus ? preservationAccessible(c, apparatus) : undefined;
  v7Spend(c.actor, 0.2);
  c.emit(
    'preservation-inspected',
    'Actual material and tray accessibility inspected; composition assumptions and unresolved safety are not measurements.',
    {
      operationId: `preservation-inspect:${c.actor.id}:${String(c.world.tick)}`,
      owner: c.actor.id,
      inputs: s ? [s.id] : [],
      paidEnergy: 0.2,
      remainingWork: 0,
      food: s
        ? {
            id: s.id,
            origin: s.origin,
            quantity: s.quantity,
            decay: s.decay ?? 0,
            compositionRepresented: !!s.physical,
            modelInitialization: preservationPhysics(s)?.initialization ?? null,
          }
        : null,
      tray: tray
        ? {
            id: tray.id,
            area: preservationTrayArea(c.world, tray),
            thinLayerCapacity: 0.2 * preservationTrayArea(c.world, tray),
            service: Number(tray.data.service),
            occupied: c.world.stacks.some(
              (s) => preservationPhysics(s)?.tray === tray.id,
            ),
          }
        : null,
    },
    tray?.id ?? s?.id ?? null,
  );
  return { complete: true, writes: [] };
}
export function preservationRead(c: V7ActionContext) {
  if (c.action.args.quantityTenths !== 0)
    throw new Error(
      'Read does not allocate new food; quantityTenths must be zero.',
    );
  const j = preservationWork(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'project'),
  );
  const s = c.world.stacks.find((s) => s.id === j.sample);
  const terminal = ['stopped', 'removed'].includes(j.status);
  if (
    s &&
    v7ShapeDistance(c.actor.position, {
      ...s.position,
      angle: 0,
      solid: false,
      interaction: 0,
      entrances: [],
      shape: { kind: 'circle', radius: 0 },
    }) > 0.65 &&
    s.owner !== c.actor.id
  )
    throw new Error('The actual sample is not locally observable.');
  if (!terminal) preservationAccessible(c, j.tray);
  const d = s ? preservationPhysics(s) : null;
  const apparatus = optionalIdentity(c.action.args.apparatus),
    target = optionalIdentity(c.action.args.target);
  if (!!apparatus !== !!target)
    throw new Error(
      'A calibrated read explicitly allocates both balance and retained comparison weight; leave both empty for condition-only reading.',
    );
  let mass: V7Data | null = null;
  if (apparatus) {
    if (!s || !d) throw new Error('No surviving sample remains to weigh.');
    const balance = assayNearby(c, apparatus, 'comparison-balance'),
      weight = c.world.stacks.find(
        (x) => x.id === target && x.owner === c.actor.id && !x.reservedFor,
      );
    if (
      !weight ||
      balance.data.calibrated !== true ||
      !Array.isArray(balance.data.calibrationHistory) ||
      balance.data.calibrationHistory.length !== 3 ||
      !Array.isArray(balance.data.weights) ||
      !balance.data.weights.includes(weight.id) ||
      wovenDrift(balance)
    )
      throw new Error(
        'A maintained calibrated balance and its actual retained weight are required.',
      );
    const { resolution, reading } = assayRelativeReading(
        c.world,
        balance,
        s,
        weight,
      ),
      referenceMass = foodUnitMass(c.world, weight) * weight.quantity;
    if (!(resolution > 0) || !Number.isFinite(resolution))
      throw new Error('Unresolved balance resolution.');
    mass = {
      relative: reading,
      resolution,
      reference: weight.id,
      lower: Math.max(0, reading - resolution / 2) * referenceMass,
      upper: (reading + resolution / 2) * referenceMass,
      units:
        'Model mass units via actual retained reference; not independently certified SI mass.',
    };
    v7Spend(c.actor, 0.7);
    j.paid += 0.7;
    balance.data.service = Number(balance.data.service) - 0.1;
  } else {
    v7Spend(c.actor, 0.2);
    j.paid += 0.2;
  }
  const point = s?.position ?? { x: j.x, y: j.y },
    climate = forestClimate(c.world, point);
  const lifetime = s
    ? (c.world.resources.find((r) => r.id === s.resource)?.properties?.decay ??
      0)
    : 0;
  const ambient = Math.max(0.15, (climate.temperature + 4) / 24),
    remaining = s ? Math.max(0, lifetime - (s.decay ?? 0)) : 0;
  const factor = s ? preservationRate(s) : null;
  const fraction = s?.physical
    ? s.physical.unitWater / s.physical.unitMass
    : null;
  const bounds =
    fraction === null
      ? null
      : [Math.max(0, fraction - 0.08), Math.min(1, fraction + 0.08)];
  const rateBounds =
    bounds && d
      ? bounds.map(
          (w) =>
            d.opening *
            (d.prepared
              ? Math.max(
                  0.15,
                  Math.min(
                    1.5,
                    0.15 +
                      (0.85 * w) / Math.max(0.000001, d.initialWaterFraction),
                  ),
                )
              : 1),
        )
      : null;
  const row: V7Data = {
    tick: c.world.tick,
    mass,
    decay: s?.decay ?? null,
    ambientAccumulated: d?.baselineDeterioration ?? null,
    actualAccumulated: d?.actualDeterioration ?? null,
    remainingDeterioration: remaining,
    modelMoistureFractionBounds: bounds,
    modelRateFactorBounds: rateBounds,
    conditionalRoundsBounds: rateBounds
      ? [...rateBounds].reverse().map((f) => remaining / (ambient * f))
      : null,
    uncertainty:
      'Moisture and remaining-life calculation use declared composition/model assumptions; finite-resolution mass is separate. Future weather, contamination and safety remain uncertain.',
    status: j.status,
    survives: !!s,
    paidEnergy: apparatus ? 0.7 : 0.2,
    remainingWork: Math.max(0, 2 - j.stage),
  };
  const previous = j.readings.filter((r) => r.mass !== null).at(-1),
    oldMass = previous?.mass as V7Data | null | undefined;
  const demonstrated =
    !!s &&
    !!mass &&
    !!oldMass &&
    c.world.tick - Number(previous?.tick) >= 2 &&
    Number(mass.upper) < Number(oldMass.lower) &&
    Number(d?.actualDeterioration) - Number(previous?.actualAccumulated) <
      Number(d?.baselineDeterioration) -
        Number(previous?.ambientAccumulated) -
        1e-6 &&
    Number(factor) < 1;
  j.readings.push(row);
  c.emit(
    'preservation-reading',
    'Paid actual reading separates finite-resolution mass from conditional model-based storage estimates.',
    {
      operationId: preservationKey(j.owner, j.id),
      owner: j.owner,
      inputs: [j.source],
      sample: j.sample,
      ...row,
    },
    j.tray,
  );
  const failed = !s && j.status === 'stopped';
  if ((demonstrated && !j.demonstrated) || (failed && !j.reportedFailure)) {
    if (demonstrated) j.demonstrated = true;
    if (failed) j.reportedFailure = true;
    openRemember(c, {
      key: `preservation:${s?.resource ?? 'food'}:${demonstrated ? 'lower-deterioration' : 'lost-sample'}`,
      subject: s?.resource ?? 'food',
      property: demonstrated
        ? 'measured mass loss and lower observed deterioration'
        : 'real allocated sample was lost',
      value: {
        observationTicks: [previous?.tick ?? null, c.world.tick],
        massBounds: mass ? [mass.lower ?? null, mass.upper ?? null] : null,
        previousMassBounds: oldMass
          ? [oldMass.lower ?? null, oldMass.upper ?? null]
          : null,
        modelRateFactorBounds: rateBounds,
        survived: !!s,
        demonstrated,
        limitation:
          'One actual batch and elapsed exposure; model assumptions and finite resolution remain, with no safety or future-weather guarantee.',
      },
      method: 'paid dated trial reading',
      condition:
        'this batch and actual elapsed exposure; no safety certificate',
      verified: true,
    });
    c.emit(
      'preservation-completed',
      demonstrated
        ? 'A surviving batch demonstrated reduced deterioration under observed conditions.'
        : 'The retained trial failed; no preserved food or positive benefit is claimed.',
      {
        operationId: preservationKey(j.owner, j.id),
        owner: j.owner,
        inputs: [j.source],
        sample: j.sample,
        demonstrated,
        failed,
        paidEnergy: j.paid,
        remainingWork: 0,
      },
      j.tray,
    );
  }
  return {
    complete: true,
    writes: [...(s ? [s.id] : []), ...(apparatus ? [apparatus] : [])],
  };
}
