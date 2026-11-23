import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Object,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'bounded-surface-residue-transfer',
  sourceId = 'surface-21-lin-113',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const start: V7Action = {
  interface: id,
  args: { mode: 'start', sourceId, destinationX: 9.6, destinationY: 12.9 },
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'experiment/ex13/technical-pauses/round-23/execution.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), id + '@1'),
  );
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  a.position = { x: 9.25, y: 12.4 };
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  return w;
}
const source = (w: V7World) => w.objects.find((o) => o.id === sourceId);
const deposits = (w: V7World) =>
  w.objects.filter((o) => o.kind === 'surface-residue-deposit');
const mass = (w: V7World) =>
  Number(source(w)?.data.residueMass) +
  deposits(w).reduce((n, o) => n + Number(o.data.mass), 0);
it('moves only actual residue along checked short routes, conserves it across resume and closes the allowance without certifying soil', () => {
  let w = fixture();
  const before = v7Clone(w);
  let r = step(w, start);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(deposits(w)).toHaveLength(1);
  expect(deposits(w)[0]?.data.mass).toBe(0);
  expect(mass(w)).toBeCloseTo(0.04);
  r = step(w, start);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(source(w)?.data.residueMass).toBe(0.02);
  w = v7Clone(step(w, wait).world);
  r = step(JSON.parse(JSON.stringify(w)) as V7World, {
    interface: id,
    args: { mode: 'resume' },
  });
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(source(w)?.data.residueMass).toBe(0);
  expect(deposits(w)[0]?.data.mass).toBe(0.04);
  expect(mass(w)).toBeCloseTo(0.04);
  expect(w.stacks.map((s) => ({ ...s, decay: 0 }))).toEqual(
    before.stacks.map((s) => ({ ...s, decay: 0 })),
  );
  expect(w.stacks[0]?.decay).toBeGreaterThan(before.stacks[0]?.decay ?? 0);
  expect(
    w.events.find((e) => e.type === 'residue-transfer-completed')?.data,
  ).toMatchObject({ paidEnergy: 2.5, rootCompatible: null });
  w = v7Clone(step(w, start).world);
  expect(mass(w)).toBeCloseTo(0.04);
  expect(deposits(w)).toHaveLength(1);
  expect(w.events.some((e) => e.type === 'residue-displaced')).toBe(false);
});
it('rejects invalid range before charge, records a paid blocked examination, and rechecks actual obstacles before later movement', () => {
  let w = fixture();
  const e = w.actors[0]?.vitals.energy;
  const invalid = step(w, {
    interface: id,
    args: { ...start.args, destinationX: 10 },
  });
  expect(invalid.outcomes.lin?.success).toBe(false);
  expect(invalid.world.actors[0]?.vitals.energy).toBe(e);
  const obstacle: V7Object = {
    id: 'fixture-obstacle',
    kind: 'rock',
    name: 'Fixture stone',
    spatial: {
      x: 9.45,
      y: 12.9,
      angle: 0,
      shape: { kind: 'circle', radius: 0.03 },
      solid: true,
      interaction: 0,
      entrances: [],
    },
    visual: {
      component: 'rock',
      color: '#888888',
      accent: '#aaaaaa',
      label: 'Fixture',
      state: 'present',
    },
    data: {},
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  };
  w.objects.push(obstacle);
  const blocked = step(w, start);
  expect(blocked.outcomes.lin?.success).toBe(true);
  expect(blocked.world.actors[0]?.vitals.energy).toBeCloseTo((e ?? 0) - 0.5);
  expect(deposits(blocked.world)).toHaveLength(0);
  expect(mass(blocked.world)).toBeCloseTo(0.04);
  w = fixture();
  w = v7Clone(step(w, start).world);
  w.objects.push(obstacle);
  const prior = w.actors[0]?.vitals.energy;
  const resumed = step(w, { interface: id, args: { mode: 'resume' } });
  expect(resumed.world.actors[0]?.vitals.energy).toBe(prior);
  expect(mass(resumed.world)).toBeCloseTo(0.04);
  expect(
    resumed.world.events.some((e) => e.type === 'residue-transfer-blocked'),
  ).toBe(true);
});
it('keeps committed deposits on cancel/death, rejects competing source locks and excludes fresh scopes', () => {
  for (const death of [false, true]) {
    let w = fixture();
    w = v7Clone(step(w, start).world);
    w = v7Clone(step(w, { interface: id, args: { mode: 'resume' } }).world);
    if (death) {
      const a = w.actors[0];
      if (!a) throw new Error('Missing actor');
      a.vitals.health = 0.1;
      a.vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    } else
      w = v7Clone(step(w, { interface: id, args: { mode: 'cancel' } }).world);
    expect(mass(w)).toBeCloseTo(0.04);
    expect(source(w)?.data.residueMass).toBe(0.02);
    expect(source(w)?.data.activeWork).toBeNull();
    expect(deposits(w)[0]?.spatial.reserved).toBe(false);
  }
  const w = fixture(),
    o = source(w);
  if (!o) throw new Error('Missing source');
  o.data.activeWork = 'other-actual-work';
  expect(step(w, start).outcomes.lin?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('fresh-independent')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
});
