import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import {
  barkFixture,
  barkStep,
  barkAction,
  barkFrames,
} from './fixtures/open-bark.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
};
const mass = (w: V7World) =>
  w.stacks
    .filter((s) => ['branch', 'bark', 'bark-fragments'].includes(s.resource))
    .reduce(
      (n, s) =>
        n +
        s.quantity *
          (s.physical?.unitMass ??
            w.resources.find((r) => r.id === s.resource)?.mass ??
            0),
      0,
    ) +
  w.objects.reduce(
    (n, o) =>
      n +
      Number(o.data.stock ?? 0) *
        Number((o.data.materialLayer as V7Data | undefined)?.unitMass ?? 0),
    0,
  );
it('does not manufacture a positive bark layer from generic branch names or reward unresolved composition', () => {
  const w = barkFixture(),
    before = w.stacks.map((s) => [s.resource, s.quantity]);
  const inspected = barkStep(w).world;
  expect(
    inspected.events.find((e) => e.type === 'bark-inspected')?.data.status,
  ).toBe('unresolved');
  expect(inspected.events.some((e) => e.type === 'information-confirmed')).toBe(
    false,
  );
  expect(
    inspected.events.some((e) =>
      ['satisfaction', 'practice-confirmed'].includes(e.type),
    ),
  ).toBe(false);
  expect(inspected.stacks.map((s) => [s.resource, s.quantity])).toEqual(before);
  expect(barkStep(inspected, barkAction('strip')).outcomes.lin?.success).toBe(
    false,
  );
});
it('conserves real layer mass through partial work, serialization, completion and later source gathering', () => {
  const frames = barkFrames(),
    first = frames[1],
    partial = frames[2],
    completed = frames[3];
  if (!first || !partial || !completed) throw new Error('Missing frames');
  expect(mass(first)).toBeCloseTo(2.2);
  expect(mass(partial)).toBeCloseTo(2.2);
  expect(mass(completed)).toBeCloseTo(2.2);
  expect(
    partial.stacks.find((s) => s.resource === 'bark-fragments')?.quantity,
  ).toBe(0.2);
  const restored = barkStep(
    JSON.parse(JSON.stringify(partial)) as V7World,
    barkAction('strip'),
  );
  expect(restored.outcomes.lin?.complete).toBe(true);
  expect(
    restored.world.stacks.find((s) => s.resource === 'bark')?.quantity,
  ).toBe(0.4);
  const gathered = barkStep(completed, {
    interface: 'gather',
    args: { target: 'layer-source', quantity: 1 },
  });
  expect(gathered.outcomes.lin?.success).toBe(true);
  expect(mass(gathered.world)).toBeCloseTo(2.2);
  expect(
    gathered.world.stacks.find((s) => s.resource === 'branch')?.materialLayer,
  ).toMatchObject({ unitLayerMass: 0.06, unitMass: 1.04 });
});
it('locks extraction against gathering and releases partial fragments once on cancellation without restoring the removed layer', () => {
  let w = barkFixture(true);
  w = v7Clone(barkStep(w).world);
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  const moss = w.actors.find((a) => a.id === 'moss');
  if (!moss) throw new Error('Missing observer');
  moss.position = { x: 9.1, y: 8 };
  const blocked = v7Step(
    w,
    {
      lin: { interface: 'wait', args: {} },
      moss: {
        interface: 'gather',
        args: { target: 'layer-source', quantity: 1 },
      },
      sol: { interface: 'wait', args: {} },
    },
    continuousRegistry(w),
  );
  expect(blocked.outcomes.moss?.success).toBe(false);
  w = v7Clone(blocked.world);
  expect(
    w.stacks.find((s) => s.resource === 'bark-fragments')?.reservedFor,
  ).toBeUndefined();
  expect(mass(w)).toBeCloseTo(2.2);
  expect(w.events.filter((e) => e.type === 'bark-strip-stopped')).toHaveLength(
    1,
  );
  w = v7Clone(barkStep(w, { interface: 'wait', args: {} }).world);
  expect(w.events.some((e) => e.type === 'bark-strip-stopped')).toBe(false);
});
it('pauses on actual tool loss without charges and cleans up when a reserved substrate disappears', () => {
  let w = barkFixture(true);
  w = v7Clone(barkStep(w).world);
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  const tool = w.stacks.find((s) => s.id === 'stone-tool');
  if (tool) tool.owner = 'moss';
  const paid = actor(w).vitals.energy;
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  expect(actor(w).vitals.energy).toBe(paid);
  w.objects = [];
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  expect(actor(w).extensionState['open:bark-work']).toBeUndefined();
  expect(
    w.stacks.find((s) => s.resource === 'bark-fragments')?.reservedFor,
  ).toBeUndefined();
  expect(w.processes).toHaveLength(0);
  expect(w.events.some((e) => e.type === 'bark-strip-stopped')).toBe(true);
});

it('does not repeatedly reward the same verified layer and drops removed fragments once on actual death', () => {
  let w = barkFixture(true);
  w = v7Clone(barkStep(w).world);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(true);
  w = v7Clone(barkStep(w).world);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  const missingTool = w.stacks.find((s) => s.id === 'stone-tool');
  if (missingTool) missingTool.owner = 'moss';
  actor(w).vitals.health = 0.01;
  actor(w).vitals.satiety = 0;
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  expect(actor(w).life?.deaths).toBe(1);
  expect(w.events.filter((e) => e.type === 'bark-strip-stopped')).toHaveLength(
    1,
  );
  expect(
    w.stacks
      .filter((s) => s.resource === 'bark' || s.resource === 'bark-fragments')
      .every((s) => s.owner === null && !s.reservedFor),
  ).toBe(true);
  expect(mass(w)).toBeCloseTo(2.2);
});
