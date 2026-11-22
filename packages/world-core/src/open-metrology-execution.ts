import type { V7ActionContext, V7Data, V7Stack } from './continuous-types.js';
import {
  v7Number,
  v7String,
  v7Record,
  v7Clone,
  v7Id,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { forestResolveReference } from './forest-references.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { poleShape, poleMeasurement } from './open-material-geometry.js';
import {
  metrologyActive,
  metrologyStart,
  metrologyResume,
  metrologyKey,
  metrologyPlacement,
} from './open-metrology-work.js';
import { openRemember } from './open-foundation.js';
function exact(c: V7ActionContext, supplied: string): V7Stack {
  const raw = supplied.startsWith('item:') ? supplied.slice(5) : supplied;
  if (!c.world.stacks.some((s) => s.id === raw && s.owner === c.actor.id))
    throw new Error(
      'Use an exact owned persistent item identity, optionally with one item: prefix.',
    );
  const id = forestResolveReference(c.world, c.actor, supplied, 'owned');
  const s = c.world.stacks.find((s) => s.id === id);
  if (!s) throw new Error('Actual item unavailable.');
  return s;
}
export function metrologyInspect(c: V7ActionContext) {
  const s = exact(c, v7String(c.action.args.target, 'specimen')),
    p = poleShape(c.world, s);
  v7Spend(c.actor, 0.2);
  c.emit(
    'metrology-progress',
    p
      ? 'Represented tapered specimen observed; dimensional measurement and load evidence remain separate.'
      : 'Identity resolved but whole-unit source lineage or intact geometry is unavailable; altered and ambiguous remnants cannot be expanded into a pole.',
    {
      operationId: `metrology-inspect:${c.actor.id}:${String(c.world.tick)}`,
      specimen: s.id,
      represented: !!p,
      geometryLaw: p?.provenance ?? null,
      remainingWork: 0,
      paidEnergy: 0.2,
      visibleShape: p
        ? { taper: p.taper, curvature: p.curvature, intact: true }
        : null,
      measured: poleMeasurement(c.world, c.actor.id, s),
      loadCapacity: null,
    },
    s.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}
function allocations(c: V7ActionContext) {
  if (!Array.isArray(c.action.args.loads))
    throw new Error('Explicit load allocations are required.');
  const rows = c.action.args.loads.map((raw) => {
    const r = v7Record(raw),
      s = exact(c, v7String(r.item, 'load ID')),
      quantity = v7Number(r.quantity, 'load quantity', 0.1);
    foodTenths(quantity);
    if (s.reservedFor || s.quantity < quantity)
      throw new Error('Actual load stock is reserved or insufficient.');
    return { s, quantity };
  });
  if (new Set(rows.map((r) => r.s.id)).size !== rows.length)
    throw new Error('Duplicate load allocation.');
  return rows;
}
export function metrologyExecute(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = metrologyActive(w, a);
  if (!j && c.action.args.mode === 'resume') j = metrologyResume(c);
  if (!j) {
    const s = exact(c, v7String(c.action.args.target, 'specimen')),
      p = poleShape(w, s);
    if (!p)
      throw new Error(
        'A conserved intact whole branch with represented source-slot geometry is required.',
      );
    const rows = allocations(c),
      span = v7Number(c.action.args.span, 'span', 0);
    if (c.action.args.mode === 'measure' && (rows.length || span !== 0))
      throw new Error('Measurement uses empty loads and zero span.');
    if (c.action.args.mode === 'load-test') {
      const m = poleMeasurement(w, a.id, s);
      if (
        !m ||
        span <= 0 ||
        span > Number(m.usableLengthLower) ||
        !rows.length ||
        rows.some((r) => r.s.id === s.id)
      )
        throw new Error(
          'Load test requires personal completed measurement, positive span within its lower length bound, and distinct actual loads.',
        );
    }
    j = metrologyStart(c, s, rows);
  }
  const specimen = w.stacks.find((s) => s.id === j.target),
    p = specimen && poleShape(w, specimen),
    o = w.objects.find((o) => o.id === j.object),
    cost = j.mode === 'measure' ? 0.3 : 0.5;
  if (
    !specimen ||
    !p ||
    !o ||
    j.escrow.some(
      (id) =>
        !w.stacks.some(
          (s) =>
            s.id === id &&
            s.owner === a.id &&
            s.reservedFor === metrologyKey(j.owner, j.id),
        ),
    )
  )
    throw new Error(
      'The exact live specimen, layout or escrow is unavailable.',
    );
  try {
    metrologyPlacement(w, a, o.spatial, o.id);
  } catch (error) {
    c.emit(
      'metrology-progress',
      error instanceof Error ? error.message : 'Actual access unavailable.',
      {
        operationId: metrologyKey(j.owner, j.id),
        paidEnergy: j.paid,
        remainingWork: 2 - j.stage,
      },
      specimen.id,
    );
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  }
  if (a.vitals.energy < cost) {
    c.emit(
      'metrology-progress',
      'Work paused for actual energy; no stage or effort added.',
      {
        operationId: metrologyKey(j.owner, j.id),
        paidEnergy: j.paid,
        remainingWork: 2 - j.stage,
      },
      specimen.id,
    );
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  }
  v7Spend(a, cost);
  j.stage++;
  j.paid += cost;
  Object.assign(o.data, { stage: j.stage, paidEnergy: j.paid });
  c.emit(
    'metrology-progress',
    'Performed one remaining paid physical stage on the same specimen.',
    {
      operationId: metrologyKey(j.owner, j.id),
      stage: j.stage,
      remainingWork: 2 - j.stage,
      paidEnergy: j.paid,
    },
    specimen.id,
  );
  if (j.stage < 2)
    return { complete: false, remaining: 2 - j.stage, writes: [specimen.id] };
  let result: V7Data;
  if (j.mode === 'measure') {
    const straight = Math.max(0, p.length - 2 * p.curvature),
      uncertainty = Math.max(0.05, straight * 0.025),
      measuredLength = Math.round(straight / 0.05) * 0.05;
    const diameters = [0, 0.5, 1].map((t) => {
      const d = p.diameter * (1 - (1 - p.taper) * t),
        center = Math.round(d * 1000) / 1000;
      return {
        section: t,
        estimate: center,
        lower: Math.max(0, center - Math.max(0.001, d * 0.1)),
        upper: center + Math.max(0.001, d * 0.1),
      };
    });
    result = {
      specimen: specimen.id,
      unit: p.unit,
      lawVersion: p.version,
      usableLengthLower: Math.max(0, measuredLength - uncertainty),
      usableLengthUpper: measuredLength + uncertainty,
      diameters,
      curvature: p.curvature,
      uncertainty,
      units:
        'Shared world-coordinate length convention; not independently calibrated SI',
      endpoints: [
        {
          x: j.x - (Math.cos(j.angle) * p.length) / 2,
          y: j.y - (Math.sin(j.angle) * p.length) / 2,
        },
        {
          x: j.x + (Math.cos(j.angle) * p.length) / 2,
          y: j.y + (Math.sin(j.angle) * p.length) / 2,
        },
      ],
      operationId: metrologyKey(j.owner, j.id),
      paidEnergy: j.paid,
      remainingWork: 0,
      measuredAt: w.tick,
    };
    w.state[`metrology:measured:${a.id}:${p.unit}`] = result;
    o.data.measured = true;
    o.data.measurement = result;
    c.emit(
      'metrology-measured',
      'Completed endpoint and three-section measurement with explicit uncertainty; no load suitability certificate.',
      result,
      specimen.id,
    );
  } else {
    const mass = j.loads.reduce((n, id) => {
        const s = w.stacks.find((s) => s.id === id);
        return n + (s ? foodUnitMass(w, s) * s.quantity : 0);
      }, 0),
      force = mass * 9.81,
      self = foodUnitMass(w, specimen) * 9.81,
      minDiameter = p.diameter * p.taper,
      inertia = (Math.PI * minDiameter ** 4) / 64,
      wet =
        (specimen.physical?.unitWater ?? p.water) / foodUnitMass(w, specimen),
      stiffness = p.modulus * (1 - p.defects) * (1 - 0.5 * wet),
      stressLimit = p.strength * (1 - p.defects) * (1 - 0.6 * wet),
      moment = (force * j.span) / 4 + (self * j.span) / 8,
      stress = (moment * minDiameter) / (2 * inertia),
      deflection =
        (force * j.span ** 3) / (48 * stiffness * inertia) +
        (5 * self * j.span ** 3) / (384 * stiffness * inertia),
      passed = stress <= stressLimit && deflection <= j.span / 40,
      broken = stress > stressLimit;
    result = {
      specimen: specimen.id,
      unit: p.unit,
      lawVersion: p.version,
      span: j.span,
      force,
      selfWeight: self,
      loads: j.loads,
      midpoint: { x: j.x, y: j.y },
      deflection,
      passed,
      broken,
      wetness: wet,
      uncertainty: 0.2,
      safeCapacity: passed ? force * 0.5 : 0,
      applicability:
        'This exact unit, span and no wetter condition only; conservative minimum-section tapered-beam model with actual self-weight. No batch certificate.',
      operationId: metrologyKey(j.owner, j.id),
      paidEnergy: j.paid,
      remainingWork: 0,
      testedAt: w.tick,
    };
    w.state[`metrology:tested:${a.id}:${p.unit}`] = result;
    Object.assign(o.data, { loadForce: force, deflection, broken, passed });
    if (!passed) {
      specimen.processing = {
        ...(specimen.processing ?? {}),
        metrologyDamage: { permanent: true, broken, deflection, unit: p.unit },
      };
      if (broken) {
        const fragments = [0, 1].map(() => ({
          ...v7Clone(specimen),
          id: v7Id(w, 'item'),
          quantity: 0.5,
          quantityTenths: 5,
        }));
        w.stacks = w.stacks.filter((s) => s.id !== specimen.id);
        w.stacks.push(...fragments);
        j.escrow = j.escrow
          .filter((id) => id !== specimen.id)
          .concat(fragments.map((s) => s.id));
        result.fragments = fragments.map((s) => s.id);
      }
    }
    c.emit(
      'metrology-load-tested',
      'Completed actual dead-weight test; result applies only to this measured configuration. Damage and surviving weights remain physical.',
      result,
      specimen.id,
    );
  }
  openRemember(c, {
    key: `metrology:${j.mode}:${j.mode === 'measure' ? 'dimensions' : result.passed ? 'supported' : 'failure-limit'}`,
    subject: specimen.id,
    property:
      j.mode === 'measure'
        ? 'bounded visible dimensions'
        : 'tested structural response',
    value: result,
    method: 'two actually paid physical stages',
    condition:
      'Specimen-specific observation; repeat or renamed specimens do not renew information rewards.',
    verified: true,
  });
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor === metrologyKey(j.owner, j.id)) delete s.reservedFor;
  }
  // The layout is a view of the same carried specimen, not a second material object. It is removed on the next action.
  o.spatial.solid = false;
  o.spatial.reserved = false;
  o.visual.state = 'completed';
  j.status = 'completed';
  delete a.extensionState['metrology:active'];
  a.extensionState['metrology:completed-layout'] = o.id;
  return { complete: true, remaining: 0, writes: j.escrow };
}
