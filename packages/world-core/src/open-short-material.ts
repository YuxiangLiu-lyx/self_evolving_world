import { openConditions } from './open-physical.js';
import type {
  V7ActionContext,
  V7World,
  V7Actor,
  V7Stack,
  V7Data,
  V7Object,
} from './continuous-types.js';
import { v7Record, v7String, v7Number } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { poleShape, poleMeasurement } from './open-material-geometry.js';
import type { ShortDimensions } from './open-short-geometry.js';
import { shortShape, shortPlacement } from './open-short-geometry.js';
export interface ShortInput {
  s: V7Stack;
  quantity: number;
  role: string;
}
export function shortInputs(c: V7ActionContext): ShortInput[] {
  if (!Array.isArray(c.action.args.components))
    throw new Error('Explicit component allocations are required.');
  const rows = c.action.args.components.map((raw) => {
    const r = v7Record(raw),
      supplied = v7String(r.item, 'component identity'),
      id = supplied.startsWith('item:') ? supplied.slice(5) : supplied;
    if (!c.world.stacks.some((s) => s.id === id && s.owner === c.actor.id))
      throw new Error(
        'Use an exact owned component identity or one item: prefix.',
      );
    forestResolveReference(c.world, c.actor, supplied, 'owned');
    const s = c.world.stacks.find((s) => s.id === id),
      n = v7Number(r.quantityTenths, 'integer quantity tenths', 1),
      role = v7String(r.role, 'component role');
    if (!s || !Number.isSafeInteger(n) || s.quantity < n / 10 || s.reservedFor)
      throw new Error('Exact unreserved component quantity is unavailable.');
    if (!['pole', 'binding', 'cover', 'load'].includes(role))
      throw new Error('Unknown structural role.');
    if (
      role === 'pole' &&
      (n !== 10 ||
        !poleShape(c.world, s) ||
        !poleMeasurement(c.world, c.actor.id, s))
    )
      throw new Error(
        'Each pole must be one intact whole specimen with personal dimensional evidence.',
      );
    if (
      ['binding', 'cover'].includes(role) &&
      (s.resource !== 'dry-grass' ||
        s.processing?.shortCoupon ||
        s.processing?.shortSalvage)
    )
      throw new Error(
        'Unaltered actual grass stock is required for these hand-worked components.',
      );
    return { s, quantity: n / 10, role };
  });
  if (new Set(rows.map((r) => r.s.id)).size !== rows.length)
    throw new Error('Duplicate component identity.');
  return rows;
}
export const shortEvidenceKey = (actor: string, mode: string, origin: string) =>
  `short:evidence:${actor}:${mode}:${origin}`;
export function shortGrass(w: V7World, s: V7Stack) {
  const mass = foodUnitMass(w, s),
    water = s.physical?.unitWater ?? mass * 0.2;
  return {
    mass: mass * s.quantity,
    dry: (s.physical?.unitSolids ?? mass - water) * s.quantity,
    wet: Math.min(1, water / Math.max(1e-9, mass)),
    integrity: Number(s.processing?.shortIntegrity ?? 1),
  };
}
export function shortDesign(c: V7ActionContext, rows: ShortInput[]) {
  const d = {
      width: v7Number(c.action.args.width, 'width', 0),
      length: v7Number(c.action.args.length, 'length', 0),
      height: v7Number(c.action.args.height, 'height', 0),
      ridgeLength:
        rows
          .filter((r) => r.role === 'pole')
          .map((r) => poleShape(c.world, r.s)?.length ?? 0)[0] ?? 0,
      poleRadii: rows
        .filter((r) => r.role === 'pole')
        .slice(1)
        .map((r) => (poleShape(c.world, r.s)?.diameter ?? 0.05) / 2),
      poleLengths: rows
        .filter((r) => r.role === 'pole')
        .slice(1)
        .map((r) => poleShape(c.world, r.s)?.length ?? 0),
    },
    x = v7Number(c.action.args.x, 'x'),
    y = v7Number(c.action.args.y, 'y'),
    angle = v7Number(c.action.args.angle, 'angle'),
    shape = shortShape(x, y, angle, d);
  shortPlacement(c.world, c.actor, shape, d);
  const reasons: string[] = [],
    poles = rows.filter((r) => r.role === 'pole'),
    bindings = rows.filter((r) => r.role === 'binding'),
    covers = rows.filter((r) => r.role === 'cover'),
    leg = Math.hypot(d.height, d.width / 2) + 0.05,
    area = 2 * d.length * Math.hypot(d.height, d.width / 2);
  if (poles.length !== 5 || rows.some((r) => r.role === 'load'))
    reasons.push(
      'Exactly five individually measured poles are required; first is ridge, remaining four are legs. No proof load belongs in construction.',
    );
  poles.forEach((r, i) => {
    if (
      Number(
        poleMeasurement(c.world, c.actor.id, r.s)?.usableLengthLower ?? 0,
      ) < (i === 0 ? d.length : leg)
    )
      reasons.push(
        `Measured pole ${r.s.id} is shorter than its solved endpoint plus joint allowance.`,
      );
  });
  const mass = (rs: ShortInput[]) =>
      rs.reduce((n, r) => n + foodUnitMass(c.world, r.s) * r.quantity, 0),
    bindingMass = mass(bindings),
    coverMass = mass(covers);
  if (bindingMass < 0.12 - 1e-8)
    reasons.push('Six joints require at least 0.02 actual binding mass each.');
  if (coverMass < 0.5 * area)
    reasons.push(
      'Actual cover allocation is below 0.5 mass per geometric area.',
    );
  for (const r of [...bindings, ...covers]) {
    const e = c.world.state[
      shortEvidenceKey(c.actor.id, r.role, r.s.origin)
    ] as V7Data | undefined;
    if (e?.passed !== true)
      reasons.push(
        `No personally observed successful ${r.role} coupon from ${r.s.origin}; a name is not certification.`,
      );
  }
  if (!bindings.length || !covers.length)
    reasons.push('Both binding and cover stock are required.');
  return {
    dimensions: d,
    shape,
    reasons,
    feasible: !reasons.length,
    legLength: leg,
    roofArea: area,
    bindingMass,
    coverMass,
    ground:
      'Flat authored terrain cells; no unrepresented slope is inferred; wet soil reduces friction.',
  };
}
export function shortParts(o: V7Object): V7Stack[] {
  return (o.data.components ?? []) as unknown as V7Stack[];
}
/** Conservative tapered-beam, buckling, six-joint slip and spread limits. No measured certificate is inferred. */
export function shortLoads(w: V7World, o: V7Object, load = 0) {
  const d = o.data as V7Data & ShortDimensions,
    parts = shortParts(o),
    poles = parts.filter((s) => s.processing?.shortRole === 'pole'),
    bindings = parts.filter((s) => s.processing?.shortRole === 'binding'),
    covers = parts.filter((s) => s.processing?.shortRole === 'cover'),
    mass = parts.reduce((n, s) => n + foodUnitMass(w, s) * s.quantity, 0),
    coverMass = covers.reduce((n, s) => n + foodUnitMass(w, s) * s.quantity, 0),
    wet = Number(o.data.wetness ?? 0),
    integrity = Number(o.data.integrity ?? 1),
    wind = Number(o.data.wind ?? 0),
    area = Number(o.data.roofArea ?? 0),
    weight = (mass + load) * 9.81 + wind * 15 * area;
  const bindingDry = bindings.reduce((n, s) => n + shortGrass(w, s).dry, 0),
    breaking = ((50 * bindingDry) / 6) * (1 - 0.5 * wet) * integrity,
    jointForce =
      ((weight / 4) * Math.hypot(d.height, d.width / 2)) /
      Math.max(0.01, d.height),
    slipping = jointForce > breaking / 2;
  let stressRatio = Infinity,
    bucklingRatio = Infinity,
    sag = Infinity;
  const shapes = poles.map(
    (s) => s.processing?.shortShape as V7Data | undefined,
  );
  if (shapes.length === 5 && shapes.every(Boolean)) {
    stressRatio = 0;
    bucklingRatio = 0;
    sag = 0;
    shapes.forEach((p, i) => {
      if (!p) return;
      const diameter = Number(p.diameter) * Number(p.taper),
        inertia = (Math.PI * diameter ** 4) / 64,
        modulus = Number(p.modulus) * (1 - Number(p.defects)) * (1 - 0.5 * wet),
        strength =
          Number(p.strength) * (1 - Number(p.defects)) * (1 - 0.6 * wet),
        span = i === 0 ? d.length : Math.hypot(d.width / 2, d.height),
        force = i === 0 ? weight / 2 : jointForce,
        moment = (force * span) / 4;
      stressRatio = Math.max(
        stressRatio,
        (moment * diameter) / (2 * inertia * Math.max(1, strength)),
      );
      bucklingRatio = Math.max(
        bucklingRatio,
        force /
          ((Math.PI ** 2 * modulus * inertia) / Math.max(0.001, span ** 2)),
      );
      sag = Math.max(sag, (force * span ** 3) / (48 * modulus * inertia));
    });
  }
  const ground = openConditions(w, o.spatial),
    friction =
      0.6 * (1 - 0.7 * Math.max(wet, Math.min(1, ground.moisture / 2))),
    spread = ((weight / 4) * (d.width / 2)) / Math.max(0.01, d.height),
    resistance = (weight / 4) * friction + breaking / 2,
    sound =
      o.data.frameDamaged !== true &&
      !slipping &&
      stressRatio <= 0.5 &&
      bucklingRatio <= 0.5 &&
      sag <= d.length / 40 &&
      spread <= resistance &&
      integrity > 0.2;
  return {
    mass,
    coverMass,
    load,
    weight,
    jointForce,
    breakingForce: breaking,
    slipping,
    stressRatio,
    bucklingRatio,
    sag,
    spread,
    friction,
    groundMoisture: ground.moisture,
    spreadResistance: resistance,
    sound,
    wetness: wet,
    integrity,
    uncertainty: 0.2,
    model:
      'Conservative minimum-section tapered pole law; flat represented ground; six equal bindings, no invented anchors.',
  };
}
export function shortStructure(w: V7World, a: V7Actor, id: string): V7Object {
  const supplied = id.startsWith('object:') ? id.slice(7) : id,
    o = w.objects.find((o) => o.id === supplied && o.kind === 'short-refuge');
  if (!o) throw new Error('Exact short-refuge identity required.');
  forestResolveReference(w, a, id, 'object');
  return o;
}
