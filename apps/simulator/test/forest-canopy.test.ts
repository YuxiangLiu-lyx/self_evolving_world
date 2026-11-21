import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Step,
  v7Cursor,
  v7TaskAction,
  canopyCover,
  forestClimate,
  v7Obstacles,
  v7SegmentClear,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  canopyFixture,
  canopyStudy,
  canopyAction,
  canopyFrames,
} from './fixtures/canopy.js';
import {
  fireRegistry,
  fireOperation,
  fireWait,
} from './fixtures/local-fire.js';
const required = <T>(v: T | undefined | null): T => {
  if (v == null) throw new Error('Missing isolated value');
  return v;
};
const advance = (w: V7World) =>
  v7Clone(
    v7Step(w, { lin: fireWait, moss: fireWait, sol: fireWait }, fireRegistry)
      .world,
  );
const mass = (w: V7World) =>
  w.stacks.reduce(
    (n, s) =>
      n +
      s.quantity * Number(w.resources.find((r) => r.id === s.resource)?.mass),
    0,
  ) +
  w.objects
    .filter((o) => o.kind === 'rain-canopy')
    .reduce((n, o) => n + Number(o.data.mass), 0);
it('requires personal study and exact conserved materials; six paid rounds create one open roof and four real posts without construction reward', () => {
  let w = canopyFixture();
  expect(fireOperation(w, canopyAction).outcomes[0]?.success).toBe(false);
  w = canopyStudy(w);
  const before = mass(w),
    energy = required(w.actors[0]).vitals.energy;
  const r = fireOperation(w, canopyAction);
  expect(r.frames).toHaveLength(6);
  expect(r.outcomes.every((o) => o?.success)).toBe(true);
  expect(mass(r.world)).toBeCloseTo(before);
  expect(energy - required(r.world.actors[0]).vitals.energy).toBeCloseTo(9);
  expect(r.world.objects.filter((o) => o.kind === 'rain-canopy')).toHaveLength(
    1,
  );
  expect(r.world.objects.filter((o) => o.kind === 'canopy-post')).toHaveLength(
    4,
  );
  expect(r.world.events.some((e) => e.type === 'satisfaction')).toBe(false);
  const roof = required(r.world.objects.find((o) => o.kind === 'rain-canopy'));
  expect(roof.spatial.enclosure).toBeUndefined();
  expect(roof.spatial.solid).toBe(false);
  expect(forestClimate(r.world, roof.spatial).indoor).toBe(false);
  expect(
    v7SegmentClear(
      { x: 10, y: 10 },
      { x: 10, y: 8.5 },
      0.24,
      v7Obstacles(r.world),
    ),
  ).toBe(true);
  expect(
    v7SegmentClear(
      { x: 9, y: 10 },
      { x: 9, y: 8.5 },
      0.24,
      v7Obstacles(r.world),
    ),
  ).toBe(false);
});
it('rejects ambiguous references, non-tenth amounts, insufficient stock and invalid geometry without escrow or gifts', () => {
  const w = canopyStudy(canopyFixture());
  required(w.stacks.find((s) => s.resource === 'bark')).quantity = 5;
  expect(fireOperation(w, canopyAction).outcomes[0]?.success).toBe(false);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  const full = canopyStudy(canopyFixture());
  const bad = v7Clone(canopyAction);
  bad.args.materials = [
    { target: 'fixture-branch', quantity: 4.01 },
    { target: 'fixture-bark', quantity: 6 },
    { target: 'fixture-vine', quantity: 2 },
  ];
  expect(fireOperation(full, bad).outcomes[0]?.success).toBe(false);
  const duplicate = v7Clone(
    required(full.stacks.find((s) => s.resource === 'bark')),
  );
  duplicate.id = 'another-bark';
  full.stacks.push(duplicate);
  const ambiguous = v7Clone(canopyAction);
  ambiguous.args.materials = [
    { target: 'fixture-branch', quantity: 4 },
    { target: 'resource:bark', quantity: 6 },
    { target: 'fixture-vine', quantity: 2 },
  ];
  expect(fireOperation(full, ambiguous).outcomes[0]?.reason).toContain(
    'ambiguous',
  );
  const overlap = v7Clone(canopyAction);
  overlap.args.x = 14;
  overlap.args.y = 10;
  expect(fireOperation(full, overlap).outcomes[0]?.success).toBe(false);
});
it('serialized fresh plans continue escrow; incompatible work and death release once with no roof or effort refund', () => {
  let w = canopyStudy(canopyFixture());
  const first = fireOperation(w, canopyAction, 'lin', 2);
  w = JSON.parse(JSON.stringify(first.world)) as V7World;
  const c = v7Cursor(
    {
      intention: 'Isolated continuation',
      steps: [{ action: canopyAction, repeat: 1, until: null, guard: null }],
      repeat: 1,
      until: null,
      interrupts: [],
      notes: [],
      preferences: [],
    },
    w.tick,
  );
  expect(v7TaskAction(w, 'lin', c)).not.toBeNull();
  expect(c.operation?.elapsed).toBe(2);
  const r = v7Step(
    w,
    { lin: canopyAction, moss: fireWait, sol: fireWait },
    fireRegistry,
    { lin: c },
  );
  expect(r.outcomes.lin?.success).toBe(true);
  expect(r.outcomes.lin?.complete).toBe(false);
  const released = advance(r.world);
  expect(released.objects.some((o) => o.kind.startsWith('rain-canopy'))).toBe(
    false,
  );
  expect(released.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    released.events.filter((e) => e.type === 'rain-canopy-work-cancelled'),
  ).toHaveLength(1);
  expect(
    advance(released).events.some(
      (e) => e.type === 'rain-canopy-work-cancelled',
    ),
  ).toBe(false);
  w = v7Clone(first.world);
  required(w.actors[0]).vitals.health = 0.01;
  required(w.actors[0]).vitals.satiety = 0;
  w = advance(w);
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(w.objects.some((o) => o.kind === 'rain-canopy')).toBe(false);
  expect(
    w.stacks
      .filter((s) => s.id.startsWith('canopy-material'))
      .every((s) => s.owner === null && !s.reservedFor),
  ).toBe(true);
});
it('covered actual mantle drying improves only its existing cooling effect; another actor and ground item can use the same paid roof', () => {
  const frames = canopyFrames();
  let w = frames.covered;
  const roof = required(w.objects.find((o) => o.kind === 'rain-canopy'));
  // Reset only this isolated measurement window to the fixed wet period, not formal policy.
  w.tick = 515;
  w.time = 515;
  roof.data.lastTick = 514;
  roof.data.condition = 120;
  const lin = required(w.actors[0]),
    moss = required(w.actors[1]);
  moss.position = { x: 10.5, y: 8.5 };
  moss.vitals.temperature = 10;
  moss.vitals.satiety = 80;
  const mantle = required(w.stacks.find((s) => s.mantle));
  mantle.owner = moss.id;
  required(mantle.mantle).moisture = 1;
  required(mantle.mantle).lastTick = 514;
  delete mantle.canopyDrying;
  lin.position = { x: 10, y: 10 };
  expect(moss.mastered).not.toContain('rain-canopy-work');
  const before = forestClimate(w, moss.position).temperature;
  w = advance(w);
  const worn = required(w.stacks.find((s) => s.id === mantle.id));
  expect(worn.mantle?.moisture).toBe(0.98);
  const e = required(
    w.events.find(
      (e) => e.type === 'rain-canopy-exposure-measured' && e.actor === 'moss',
    ),
  );
  expect(Number(e.data.avoidedCooling)).toBeGreaterThan(0);
  expect(e.data.before).toBe(1);
  expect(e.data.after).toBe(0.98);
  expect(forestClimate({ ...w, time: 515 }, moss.position).temperature).toBe(
    before,
  );
  required(worn.mantle).equipped = false;
  worn.owner = null;
  worn.position = { x: 10, y: 8.5 };
  w = advance(w);
  expect(w.stacks.find((s) => s.id === mantle.id)?.mantle?.moisture).toBe(0.96);
  expect(w.events.some((e) => e.type === 'rain-canopy-comfort-qualified')).toBe(
    false,
  );
});
it('requires whole-body coverage, preserves expired mass/posts, and keeps shared relief capped and single-settled', () => {
  let w = canopyFrames().covered;
  const roof = required(w.objects.find((o) => o.kind === 'rain-canopy'));
  expect(canopyCover(w, { x: 10.8, y: 8.5 }, 0.24)).toBeUndefined();
  expect(canopyCover(w, { x: 10.7, y: 8.5 }, 0.24)?.id).toBe(roof.id);
  const total = mass(w);
  roof.data.condition = 0.001;
  w.tick = 515;
  w.time = 515;
  roof.data.lastTick = 514;
  w = advance(w);
  expect(w.events.some((e) => e.type === 'rain-canopy-cover-expired')).toBe(
    true,
  );
  expect(w.objects.filter((o) => o.kind === 'canopy-post')).toHaveLength(4);
  expect(mass(w)).toBeCloseTo(total);
  expect(canopyCover(w, { x: 10, y: 8.5 }, 0.24)).toBeUndefined();
});
it('settles genuine maintained relief once per actor and refuses learning or fabricated coverage rewards', () => {
  let w = canopyFrames().covered;
  const roof = required(w.objects.find((o) => o.kind === 'rain-canopy'));
  const a = required(w.actors[0]),
    mantle = required(w.stacks.find((s) => s.mantle));
  w.tick = 515;
  w.time = 515;
  roof.data.lastTick = 514;
  roof.data.condition = 120;
  required(mantle.mantle).moisture = 1;
  required(mantle.mantle).lastTick = 514;
  delete mantle.canopyDrying;
  delete a.extensionState['canopy:comfort'];
  a.vitals.temperature = 10;
  a.vitals.satiety = 80;
  for (let i = 0; i < 3; i++) w = advance(w);
  expect(
    w.events.filter((e) => e.type === 'rain-canopy-comfort-qualified'),
  ).toHaveLength(1);
  expect(
    w.events.filter(
      (e) =>
        e.type === 'satisfaction-maintained' && e.target === 'thermal-refuge',
    ),
  ).toHaveLength(1);
  expect(
    required(w.actors[0]).wellbeing.sources.find(
      (s) => s.source === 'thermal-refuge',
    )?.value,
  ).toBeLessThanOrEqual(1);
  const source = required(
    required(w.actors[0]).wellbeing.sources.find(
      (s) => s.source === 'thermal-refuge',
    ),
  );
  const sustained = source.sustained ?? 0;
  required(w.actors[0]).vitals.satiety = 10;
  w = advance(w);
  expect(w.events.some((e) => e.type === 'rain-canopy-comfort-qualified')).toBe(
    false,
  );
  expect(
    required(w.actors[0]).wellbeing.sources.find(
      (s) => s.source === 'thermal-refuge',
    )?.sustained,
  ).toBeCloseTo(Math.max(0, sustained - 0.003));
});
it('binds mixed typed material aliases only in reference fields and rejects footprint water, bodies and overlapping roofs', () => {
  const w = canopyStudy(canopyFixture()),
    partial = fireOperation(w, canopyAction, 'lin', 1).world;
  const mixed = v7Clone(canopyAction);
  mixed.args.materials = [
    { target: 'fixture-branch', quantity: 4 },
    { target: 'item:fixture-bark', quantity: 6 },
    { target: 'fixture-vine', quantity: 2 },
  ];
  const good = v7Step(
    partial,
    { lin: mixed, moss: fireWait, sol: fireWait },
    fireRegistry,
  );
  expect(good.outcomes.lin?.success).toBe(true);
  const bad = v7Clone(canopyAction);
  bad.args.mode = 'item:build';
  expect(
    v7Step(partial, { lin: bad, moss: fireWait, sol: fireWait }, fireRegistry)
      .outcomes.lin?.success,
  ).toBe(false);
  const flooded = v7Clone(w);
  const row = required(flooded.terrain[8]);
  flooded.terrain[8] = row.slice(0, 10) + '~' + row.slice(11);
  expect(fireOperation(flooded, canopyAction).outcomes[0]?.success).toBe(false);
  const body = v7Clone(w);
  required(body.actors[1]).position = { x: 10, y: 8.5 };
  expect(fireOperation(body, canopyAction).outcomes[0]?.success).toBe(false);
  const done = fireOperation(w, canopyAction).world;
  expect(fireOperation(done, canopyAction).outcomes[0]?.success).toBe(false);
});
