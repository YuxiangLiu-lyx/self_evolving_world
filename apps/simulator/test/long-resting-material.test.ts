import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'arrange-resting-material';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action, actor = 'sol') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [actor]: action },
    continuousRegistry(w),
  );
const sol = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'sol');
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const moss = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'moss')
    .reduce((n, s) => n + s.quantity, 0);
function setup() {
  const genesis = initialLongWorld('long-ex14', 'long-fixes');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  const source = w.objects.find((o) => o.id === 'forest-moss-2');
  if (!source) throw new Error('Missing moss source.');
  sol(w).position = { x: source.spatial.x + 0.6, y: source.spatial.y };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'forest-moss-2', quantity: 1 },
    }).world,
  );
  const stack = w.stacks.find(
    (s) => s.owner === 'sol' && s.resource === 'moss',
  );
  if (!stack) throw new Error('Missing gathered moss.');
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  for (let i = 0; i < 4 && !sol(w).mastered.includes(id); i++)
    w = v7Clone(step(w, wait).world);
  expect(sol(w).mastered).toContain(id);
  const site = { x: sol(w).position.x + 0.5, y: sol(w).position.y };
  return { w, stack: stack.id, site };
}
function arranged() {
  const f = setup();
  let w = v7Clone(
    step(f.w, {
      interface: id,
      args: {
        mode: 'arrange',
        inputStackId: f.stack,
        quantity: 0.5,
        ...f.site,
      },
    }).world,
  );
  w = v7Clone(step(w, { interface: id, args: { mode: 'resume' } }).world);
  const patch = w.objects.find((o) => o.kind === 'resting-material-patch');
  if (!patch) throw new Error('Missing patch.');
  return { ...f, w, patch: patch.id };
}

describe('resting material arrangement in ex14', () => {
  it('arranges owned moss in two paid rounds, conserves it and rejects other materials', () => {
    const f = setup();
    const before = moss(f.w);
    const { w, patch } = arranged();
    const o = w.objects.find((x) => x.id === patch);
    expect(o?.data.stage).toBe('arranged');
    expect(o?.data.remainingQuantity).toBeCloseTo(0.5, 6);
    expect(moss(w)).toBeCloseTo(before, 6);
    expect(
      step(f.w, {
        interface: id,
        args: { mode: 'arrange', inputStackId: 'none', ...f.site },
      }).outcomes.sol?.success,
    ).toBe(false);
  });

  it('runs one ordinary rest on the patch with no facility bonus', () => {
    const { w, patch, site } = arranged();
    const onPatch = v7Clone(w);
    sol(onPatch).position = { ...site };
    const tried = step(onPatch, {
      interface: id,
      args: { mode: 'trial-rest', target: patch },
    });
    const rested = step(onPatch, { interface: 'rest', args: {} });
    expect(tried.outcomes.sol?.success).toBe(true);
    expect(sol(tried.world).vitals.energy).toBeCloseTo(
      sol(rested.world).vitals.energy,
      9,
    );
    const tests = tried.world.objects.find((o) => o.id === patch)?.data.tests;
    expect(Array.isArray(tests) && tests.length).toBe(1);
  });

  it('inspects as an unverified record and lets only the arranger remove the patch in place', () => {
    const { w, patch } = arranged();
    const seen = step(w, {
      interface: id,
      args: { mode: 'inspect', target: patch },
    });
    expect(seen.outcomes.sol?.success).toBe(true);
    expect(
      sol(seen.world).memory.knowledge?.[`${patch}:visible-state`]?.verified,
    ).toBe(false);
    const other = v7Clone(w);
    const lin = other.actors.find((a) => a.id === 'lin');
    if (!lin) throw new Error('Missing lin.');
    lin.position = { x: sol(other).position.x, y: sol(other).position.y + 0.6 };
    expect(
      step(
        other,
        { interface: id, args: { mode: 'remove', target: patch } },
        'lin',
      ).outcomes.lin?.success,
    ).toBe(false);
    const removed = step(w, {
      interface: id,
      args: { mode: 'remove', target: patch },
    });
    expect(removed.outcomes.sol?.success).toBe(true);
    expect(removed.world.objects.some((o) => o.id === patch)).toBe(false);
    expect(removed.world.stacks.some((s) => s.reservedFor === patch)).toBe(
      false,
    );
    expect(moss(removed.world)).toBeCloseTo(moss(w), 6);
  });
});
