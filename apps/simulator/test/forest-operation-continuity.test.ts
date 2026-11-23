import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  v7Clone,
  v7Install,
  v7Step,
  v7Cursor,
  v7TaskAction,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Cursor,
  V7World,
} from '@self-evolving-world/world-core';
import { fireRegistry, fireWait } from './fixtures/local-fire.js';
import {
  willowFixture,
  willowStudy,
  willowOperation,
} from './fixtures/willow.js';
import { resolveContinuousDevelopment } from '../src/continuous-run.js';
import type { V7Execution } from '../src/continuous-run.js';
import { initialLongWorld } from '../src/long-scenario.js';
const pkg = 'willow-operation-continuity@1';
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('./fixtures/ex9-willow-continuation.json', import.meta.url),
      'utf8',
    ),
  ) as {
    world: V7World;
    action: V7Action;
    cursor: V7Cursor;
  };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: action, moss: fireWait, sol: fireWait }, fireRegistry);
it('normalizes whitespace aliases before matching already paid work without restarting or duplicating escrow', () => {
  const f = fixture();
  let w = v7Clone(v7Install(f.world, fireRegistry, pkg));
  w.config.longDevelopment = required(
    initialLongWorld().config.longDevelopment,
  );
  const energy = required(w.actors[0]).vitals.energy;
  const alias = v7Clone(f.action);
  if (typeof alias.args.target !== 'string')
    throw new Error('Missing fixture target.');
  alias.args.target = 'item: ' + alias.args.target.replace(/^item:/, '');
  for (let n = 0; n < 2; n++) {
    const r = step(w, alias);
    expect(r.outcomes.lin?.success).toBe(true);
    expect(r.world.events.some((e) => e.type === 'willow-work-cancelled')).toBe(
      false,
    );
    w = v7Clone(r.world);
  }
  expect(energy - required(w.actors[0]).vitals.energy).toBeCloseTo(2);
  expect(w.stacks.filter((s) => s.resource === 'bast-cord')).toHaveLength(1);
  expect(
    required(w.actors[0]).extensionState['execution:operation'],
  ).toBeUndefined();
});
it('reproduces actual ex9 round495 failure and continues migrated paid escrow across fresh plans without charging or consuming twice', () => {
  const f = fixture();
  expect(step(f.world, f.action).outcomes.lin?.success).toBe(false);
  let w = v7Clone(v7Install(f.world, fireRegistry, pkg));
  const before = required(w.actors[0]).vitals.energy;
  const stock = required(w.objects.find((o) => o.id === 'forest-willow-0')).data
    .stock;
  for (let n = 0; n < 2; n++) {
    const cursor = v7Cursor(f.cursor.plan, w.tick),
      cursors = { lin: cursor };
    const action = required(v7TaskAction(w, 'lin', cursor));
    expect(cursor.operation?.elapsed).toBe(n + 1);
    const r = v7Step(
      w,
      { lin: action, moss: fireWait, sol: fireWait },
      fireRegistry,
      cursors,
    );
    expect(r.outcomes.lin?.success).toBe(true);
    v7FinishTasks(w, r, cursors);
    w = v7Clone(r.world);
    expect(w.events.some((e) => e.type === 'willow-work-cancelled')).toBe(
      false,
    );
    expect(
      w.events
        .filter((e) => e.type === 'willow-work-progress')
        .map((e) => e.data.remainingRounds),
    ).toEqual([1 - n]);
  }
  expect(before - required(w.actors[0]).vitals.energy).toBeCloseTo(2);
  expect(
    required(w.objects.find((o) => o.id === 'forest-willow-0')).data.stock,
  ).toBe(stock);
  expect(w.stacks.filter((s) => s.resource === 'bast-cord')).toHaveLength(1);
  expect(
    required(w.actors[0]).extensionState['willow:pending'],
  ).toBeUndefined();
  expect(
    required(w.actors[0]).extensionState['execution:operation'],
  ).toBeUndefined();
  expect(
    w.events.find((e) => e.type === 'willow-work-completed')?.data
      .chargedEffort,
  ).toBe(3);
  const again = step(w, f.action);
  expect(again.outcomes.lin?.success).toBe(false);
  expect(
    again.world.stacks.filter((s) => s.resource === 'bast-cord'),
  ).toHaveLength(1);
});
it('retains original typed identity through serialized pauses and cancels once on an actual action change', () => {
  let w = v7Clone(willowStudy(willowFixture()));
  const action: V7Action = {
    interface: 'process-willow',
    args: { mode: 'strip', target: 'object:isolated-willow' },
  };
  w = v7Clone(step(w, action).world);
  const paused = JSON.stringify(w);
  w = JSON.parse(paused) as V7World;
  expect(JSON.stringify(w)).toBe(paused);
  w = v7Clone(step(w, action).world);
  const cancelled = step(w, fireWait);
  expect(
    cancelled.world.events.filter((e) => e.type === 'willow-work-cancelled'),
  ).toHaveLength(1);
  expect(
    cancelled.world.events.find((e) => e.type === 'willow-work-cancelled')?.data
      .remainingRounds,
  ).toBe(2);
  expect(
    cancelled.world.events.some((e) => e.description.includes('NaN')),
  ).toBe(false);
  expect(
    cancelled.world.stacks.filter(
      (s) => s.resource === 'willow-shoot-bundle' && !s.reservedFor,
    ),
  ).toHaveLength(1);
  expect(
    step(cancelled.world, fireWait).world.events.some(
      (e) => e.type === 'willow-work-cancelled',
    ),
  ).toBe(false);
});
it('starts fresh released material at zero work and rejects malformed counters or changed target without terminal resurrection', () => {
  const f = fixture(),
    failed = step(f.world, f.action).world;
  let w = v7Clone(v7Install(failed, fireRegistry, pkg));
  expect(
    required(w.actors[0]).extensionState['execution:operation'],
  ).toBeUndefined();
  const s = required(
    w.stacks.find(
      (s) => s.resource === 'willow-bast' && s.quantity === 1 && !s.reservedFor,
    ),
  );
  const fresh = willowOperation(w, 'twist', 'item:' + s.id);
  expect(fresh.frames).toHaveLength(3);
  expect(fresh.outcomes.every((o) => o?.success)).toBe(true);
  w = v7Clone(f.world);
  const j = required(w.actors[0]).extensionState['willow:pending'] as Record<
    string,
    number | string
  >;
  j.elapsed = Number.NaN;
  expect(() => v7Install(w, fireRegistry, pkg)).toThrow(
    'Invalid willow operation counters',
  );
  w = v7Clone(v7Install(f.world, fireRegistry, pkg));
  const change = step(w, {
    interface: 'process-willow',
    args: { mode: 'strip', target: 'object:forest-willow-0' },
  });
  expect(change.outcomes.lin?.success).toBe(true);
  expect(
    change.world.events.filter((e) => e.type === 'willow-work-cancelled'),
  ).toHaveLength(1);
  expect(
    change.world.stacks.some(
      (s) => s.resource === 'willow-bast' && !s.reservedFor && s.quantity === 1,
    ),
  ).toBe(true);
});
it('does not change mastery or reward when a technical patch targets an already mastered interface; new learning remains exact', () => {
  const f = fixture();
  const saved = {
    world: f.world,
    phase: 'development',
    barrier: {
      reviews: [
        {
          actor: 'lin',
          decision: 'develop',
          ability: null,
          learning: 1,
          reason: 'Technical continuation repair',
        },
      ],
      developmentAttempt: 'test',
    },
    developments: [{ id: 'test', status: 'started' }],
    registrations: [],
  } as unknown as V7Execution;
  const resolved = resolveContinuousDevelopment(
    saved,
    [pkg],
    { lin: 'process-willow' },
    'Isolated technical repair',
  );
  expect(required(resolved.world.actors[0]).mastered).toEqual(
    required(saved.world.actors[0]).mastered,
  );
  expect(required(resolved.world.actors[0]).wellbeing).toEqual(
    required(saved.world.actors[0]).wellbeing,
  );
  saved.world = v7Clone(saved.world);
  required(saved.world.actors[0]).mastered = required(
    saved.world.actors[0],
  ).mastered.filter((a) => a !== 'process-willow');
  expect(() =>
    resolveContinuousDevelopment(
      saved,
      [pkg],
      { lin: 'process-willow' },
      'No learning bypass',
    ),
  ).toThrow('learning duration');
});

function required<T>(v: T | undefined | null): T {
  if (v == null) throw new Error('Missing isolated value');
  return v;
}
