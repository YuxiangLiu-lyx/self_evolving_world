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
  V7Object,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'sol-surface-residue-transfer',
  sourceId = 'surface-34-sol-201',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: wait, moss: wait, sol: a }, continuousRegistry(w));
const start: V7Action = {
  interface: id,
  args: {
    mode: 'start',
    sourceId: 'object: ' + sourceId,
    destinationX: 13.35,
    destinationY: 25,
  },
};
const job = (w: V7World) => {
  const e = w.actors.find((a) => a.id === 'sol')?.extensionState;
  return (e?.['long:work:residue'] ?? e?.['long:last-residue']) as V7Data;
};
function action(mode: string, w: V7World): V7Action {
  const processId = job(w).id;
  if (typeof processId !== 'string') throw new Error('Missing process');
  return { interface: id, args: { mode, processId } };
}
function fixture(study = true) {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/prepared-placement-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const saved = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/sol-residue-fixture.json',
      'utf8',
    ),
  ) as { object: V7Object };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), id + '@1'),
  );
  w.objects = w.objects.map((o) => (o.id === sourceId ? saved.object : o));
  const a = w.actors.find((a) => a.id === 'sol');
  if (!a) throw new Error('Missing actor');
  a.position = { x: 13, y: 24.5 };
  if (study) {
    const r = step(w, { interface: 'learn', args: { ability: id } });
    expect(r.outcomes.sol?.success).toBe(true);
    w = v7Clone(r.world);
  }
  return w;
}
const mass = (w: V7World) =>
  Number(w.objects.find((o) => o.id === sourceId)?.data.residueMass) +
  w.objects
    .filter((o) => o.revision === id + '@1')
    .reduce((n, o) => n + Number(o.data.mass), 0);
it('reuses the same physical function through a separately learned binding without widening the original actor or experiment scope', () => {
  expect(step(fixture(false), start).outcomes.sol?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('other-run')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
  let w = fixture();
  w = v7Clone(
    step(w, {
      interface: 'learn',
      args: { ability: 'bounded-surface-residue-transfer' },
    }).world,
  );
  const old = step(w, {
    ...start,
    interface: 'bounded-surface-residue-transfer',
  });
  expect(old.outcomes.sol?.success).toBe(false);
  const original = v7Clone(
    w.objects.find((o) => o.id === 'surface-21-lin-113'),
  );
  let r = step(w, start);
  expect(r.outcomes.sol?.success, r.outcomes.sol?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(job(w)).toMatchObject({
    paidEnergy: 0.5,
    movedUnits: 0,
    remainingWork: 2,
  });
  expect(
    step(w, { interface: id, args: { mode: 'resume' } }).outcomes.sol?.success,
  ).toBe(false);
  r = step(w, action('resume', w));
  expect(r.outcomes.sol?.success, r.outcomes.sol?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(mass(w)).toBeCloseTo(0.04);
  w = v7Clone(step(w, { interface: 'rest', args: {} }).world);
  w = v7Clone(
    step(JSON.parse(JSON.stringify(w)) as V7World, action('resume', w)).world,
  );
  expect(job(w)).toMatchObject({
    paidEnergy: 2.5,
    movedUnits: 4,
    status: 'completed',
  });
  expect(mass(w)).toBeCloseTo(0.04);
  expect(w.objects.find((o) => o.id === 'surface-21-lin-113')).toEqual(
    original,
  );
  expect(step(w, action('cancel', w)).outcomes.sol?.success).toBe(false);
  const retry = step(w, start);
  expect(mass(retry.world)).toBeCloseTo(0.04);
  expect(retry.world.events.some((e) => e.type === 'residue-displaced')).toBe(
    false,
  );
});
it('keeps partial transfers on cancellation and death, requires exact identity, and refuses invented receivers', () => {
  for (const death of [false, true]) {
    let w = fixture();
    expect(
      step(w, {
        ...start,
        args: { ...start.args, sourceId: 'surface-21-lin-113' },
      }).outcomes.sol?.success,
    ).toBe(false);
    expect(
      step(w, { ...start, args: { ...start.args, destinationX: 30 } }).outcomes
        .sol?.success,
    ).toBe(false);
    w = v7Clone(step(w, start).world);
    w = v7Clone(step(w, action('resume', w)).world);
    expect(job(w)).toMatchObject({ movedUnits: 2, paidEnergy: 1.5 });
    if (death) {
      const a = w.actors.find((a) => a.id === 'sol');
      if (!a) throw new Error('Missing actor');
      a.vitals.health = 0.1;
      a.vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    } else w = v7Clone(step(w, action('cancel', w)).world);
    expect(mass(w)).toBeCloseTo(0.04);
    expect(w.objects.find((o) => o.id === sourceId)?.data.residueMass).toBe(
      0.02,
    );
    expect(w.objects.find((o) => o.revision === id + '@1')?.data.mass).toBe(
      0.02,
    );
    expect(
      w.objects.find((o) => o.revision === id + '@1')?.spatial.reserved,
    ).toBe(false);
    expect(step(w, action('cancel', w)).outcomes.sol?.success).toBe(false);
  }
});
