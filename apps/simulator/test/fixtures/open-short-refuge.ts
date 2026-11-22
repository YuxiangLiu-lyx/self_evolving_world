import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { metrologyFixture } from './open-metrology.js';
export const shortAction = (
  mode: string,
  project = 'short-test',
  components: V7Data[] = [],
  target = '',
  dimensions = false,
): V7Action => ({
  interface: 'short-material-refuge',
  args: {
    mode,
    project,
    target,
    components,
    x: 8,
    y: 8.6,
    angle: 0,
    width: dimensions ? 0.6 : 0,
    length: dimensions ? 0.6 : 0,
    height: dimensions ? 0.6 : 0,
  },
});
export function shortStep(w: V7World, action: V7Action) {
  return v7Step(w, { moss: action }, continuousRegistry(w));
}
export function shortAdvance(w: V7World, action: V7Action) {
  const r = shortStep(w, action);
  if (!r.outcomes.moss?.success) throw new Error(r.outcomes.moss?.reason);
  return v7Clone(r.world);
}
/** Isolated already-measured straight dry specimens and abundant grass, never formal inventory or actor context. */
export function shortFixture() {
  let w = metrologyFixture();
  w.objects = [];
  w.stacks = [];
  w.tick = 90;
  w.time = 90;
  const a = w.actors[0];
  if (!a) throw new Error('Missing isolated actor.');
  a.position = { x: 8, y: 8 };
  a.vitals.energy = 40;
  for (let i = 0; i < 5; i++) {
    const id = `short-pole-${String(i)}`,
      unit = `fixture-source:${String(i)}`,
      diameter = Math.sqrt((4 * 1.1) / (Math.PI * 600));
    w.state[`geometry:unit:${unit}`] = {
      unit,
      source: 'fixture-source',
      slot: i,
      seed: 0,
      version: 1,
      length: 1,
      diameter,
      taper: 1,
      curvature: 0,
      defects: 0,
      density: 600,
      modulus: 4e9,
      strength: 45e6,
      unitMass: 1.1,
      water: 0,
      solid: 1.1,
      provenance:
        'Explicit isolated straight dry specimen, not a formal source.',
    };
    w.state[`geometry:allocation:${id}`] = { quantity: 1, units: [unit] };
    w.state[`metrology:measured:moss:${unit}`] = {
      usableLengthLower: 0.95,
      usableLengthUpper: 1.05,
      fixture: true,
    };
    w.stacks.push({
      id,
      resource: 'branch',
      owner: 'moss',
      origin: 'fixture-source',
      quantity: 1,
      quantityTenths: 10,
      position: { ...a.position },
      physical: { unitMass: 1.1, unitWater: 0, unitSolids: 1.1 },
    });
  }
  for (const [id, resource, quantity, mass] of [
    ['short-grass', 'dry-grass', 400, 0.1],
    ['short-weight', 'berry', 5, 0.2],
  ] as const)
    w.stacks.push({
      id,
      resource,
      owner: 'moss',
      origin: id,
      quantity,
      quantityTenths: quantity * 10,
      position: { ...a.position },
      physical: { unitMass: mass, unitWater: 0, unitSolids: mass },
    });
  w = v7Clone(v7Install(w, continuousRegistry(w), 'short-material-refuge@1'));
  for (let i = 0; i < 4; i++)
    w = shortAdvance(w, {
      interface: 'learn',
      args: { ability: 'short-material-refuge' },
    });
  return w;
}
export const shortTrialInputs = (role = 'binding'): V7Data[] => [
  { item: 'short-pole-0', quantityTenths: 10, role: 'pole' },
  { item: 'short-grass', quantityTenths: 10, role },
  { item: 'short-weight', quantityTenths: 1, role: 'load' },
];
export function shortTested() {
  let w = shortFixture();
  for (const role of ['binding', 'cover']) {
    // Actual previous trial fixtures were released on the ground; pick up the surviving pole and load for a subsequent paid trial.
    const pole = w.stacks.find(
      (s) =>
        s.resource === 'branch' &&
        s.processing?.shortRole === 'pole' &&
        s.owner === null,
    );
    const rows = shortTrialInputs(role);
    if (pole) {
      w = shortAdvance(w, {
        interface: 'pickup',
        args: { target: pole.id, quantity: 1 },
      });
      const owned = w.stacks.find(
        (s) =>
          s.resource === 'branch' &&
          s.processing?.shortRole === 'pole' &&
          s.owner === 'moss',
      );
      if (!owned) throw new Error('Missing actual picked-up pole.');
      rows[0] = { item: owned.id, quantityTenths: 10, role: 'pole' };
    }
    for (let i = 0; i < 2; i++)
      w = shortAdvance(
        w,
        shortAction(
          role === 'binding' ? 'test-joint' : 'test-cover',
          `trial-${role}`,
          rows,
        ),
      );
  }
  // Pick up the same test fixture pole for construction; no new pole is supplied.
  const pole = w.stacks.find(
    (s) => s.resource === 'branch' && s.owner === null,
  );
  if (!pole) throw new Error('Missing released pole.');
  w = shortAdvance(w, {
    interface: 'pickup',
    args: { target: pole.id, quantity: 1 },
  });
  return w;
}
export function shortAllocation(w: V7World): V7Data[] {
  return [
    ...w.stacks
      .filter((s) => s.owner === 'moss' && s.resource === 'branch')
      .map((s) => ({ item: s.id, quantityTenths: 10, role: 'pole' })),
    { item: 'short-grass', quantityTenths: 2500, role: 'binding' },
    { item: 'short-cover-stock', quantityTenths: 50, role: 'cover' },
  ];
}
export function shortPrepared() {
  let w = shortTested();
  // Separate an actual cover allocation using ordinary drop/pickup, retaining its origin and finite debit.
  w = shortAdvance(w, {
    interface: 'drop',
    args: { target: 'short-grass', quantity: 5 },
  });
  const ground = w.stacks.find(
    (s) =>
      s.resource === 'dry-grass' &&
      s.owner === null &&
      !s.processing?.shortCoupon,
  );
  if (!ground) throw new Error('Missing dropped cover.');
  w = shortAdvance(w, {
    interface: 'pickup',
    args: { target: ground.id, quantity: 5 },
  });
  const cover = w.stacks.find(
    (s) =>
      s.resource === 'dry-grass' &&
      s.owner === 'moss' &&
      s.id !== 'short-grass',
  );
  if (!cover) throw new Error('Missing cover.');
  const rows = shortAllocation(w).map((r) =>
    r.role === 'cover' ? { ...r, item: cover.id } : r,
  );
  return { world: w, rows };
}
export function shortFrames() {
  const f = shortPrepared();
  let w = f.world;
  const frames = [v7Clone(w)];
  w = shortAdvance(w, shortAction('assess', 'design', f.rows, '', true));
  frames.push(v7Clone(w));
  for (let i = 0; i < 4; i++) {
    w = shortAdvance(w, shortAction('assemble', 'frame', f.rows, '', true));
    if (i === 1 || i === 3) frames.push(v7Clone(w));
  }
  const o = w.objects.find((o) => o.kind === 'short-refuge');
  if (!o) throw new Error('No actual canopy.');
  for (let i = 0; i < 2; i++)
    w = shortAdvance(
      w,
      shortAction(
        'proof-test',
        'proof',
        [{ item: 'short-weight', quantityTenths: 1, role: 'load' }],
        o.id,
      ),
    );
  frames.push(v7Clone(w));
  return frames;
}
