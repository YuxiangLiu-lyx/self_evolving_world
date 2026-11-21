import { initialForestExperienceWorld } from '../src/forest-experience-scenario.js';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Cursor,
  v7TaskAction,
  v7Step,
  v7FinishTasks,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import {
  recuperationFixture,
  recuperationStudy,
  recuperationAction,
  recuperationFrames,
} from './fixtures/recuperation.js';
import { fireOperation, fireWait } from './fixtures/local-fire.js';
const registry = continuousRegistry();
const required = <T>(v: T | null | undefined): T => {
  if (v == null) throw new Error('Missing isolated value.');
  return v;
};
const actor = (w: V7World) => required(w.actors[0]);
const step = (w: V7World, action: V7Action) =>
  v7Clone(
    v7Step(w, { lin: action, moss: fireWait, sol: fireWait }, registry).world,
  );

it('requires three actual learning rounds, preserves migration state and charges each eligible round exactly once', () => {
  const initial = recuperationFixture();
  expect(actor(initial).mastered).not.toContain('recuperate');
  expect(
    fireOperation(initial, recuperationAction()).outcomes[0]?.success,
  ).toBe(false);
  const w = recuperationStudy(initial),
    before = v7Clone(actor(w).vitals);
  expect(actor(w).mastered).toContain('recuperate');
  expect(w.tick - initial.tick).toBe(3);
  const r = fireOperation(w, recuperationAction());
  expect(r.frames).toHaveLength(4);
  expect(r.outcomes.every((o) => o?.success)).toBe(true);
  expect(actor(r.world).vitals.health - before.health).toBeCloseTo(1);
  expect(actor(r.world).vitals.energy - before.energy).toBeCloseTo(6);
  expect(before.satiety - actor(r.world).vitals.satiety).toBeCloseTo(4.4);
  expect(actor(r.world).experience?.recent.at(-1)?.effort).toBeCloseTo(0.5);
  expect(actor(r.world).experience?.recent.at(-1)?.recovery).toBe(2);
  expect(r.world.stacks).toHaveLength(0);
  expect(
    r.frames
      .flatMap((f) => f.events)
      .filter((e) => e.type === 'recuperation-relief-qualified'),
  ).toHaveLength(1);
  expect(r.cursors.lin?.operation).toBeNull();
  expect(
    r.world.events.find((e) => e.type === 'satisfaction')?.data.value,
  ).toBe(0.5);
  const old = recuperationFixture();
  // Installation itself is already verified above; reinstallation is rejected, never a heal or mastery grant.
  expect(() => v7Install(old, registry, 'recuperate@1')).toThrow();
});
it('preserves operation identity through serialization and fresh plans; repeat starts whole operations and applies cooldown', () => {
  let w = recuperationStudy(recuperationFixture());
  w = fireOperation(w, recuperationAction(), 'lin', 2).world;
  const j = actor(w).extensionState['recuperation:pending'];
  const resumed = fireOperation(
    JSON.parse(JSON.stringify(w)) as V7World,
    recuperationAction(),
  );
  expect(resumed.frames).toHaveLength(2);
  expect(
    actor(resumed.world).extensionState['recuperation:lastStatus'],
  ).toMatchObject({ id: (j as { id: string }).id, paidRounds: 4, healed: 1 });
  w = recuperationStudy(recuperationFixture());
  const c = {
    lin: v7Cursor(
      {
        intention: 'Isolated repeated complete operations',
        steps: [
          { action: recuperationAction(), repeat: 2, until: null, guard: null },
        ],
        repeat: 1,
        until: null,
        interrupts: [],
        notes: [],
        preferences: [],
      },
      w.tick,
    ),
  };
  const events = [];
  for (let i = 0; i < 8; i++) {
    const a = v7TaskAction(w, 'lin', c.lin);
    expect(a).not.toBeNull();
    const r = v7Step(
      w,
      { lin: required(a), moss: fireWait, sol: fireWait },
      registry,
      c,
    );
    v7FinishTasks(w, r, c);
    w = v7Clone(r.world);
    events.push(...w.events);
  }
  expect(events.filter((e) => e.type === 'recuperation-started')).toHaveLength(
    2,
  );
  expect(
    events.filter((e) => e.type === 'recuperation-completed'),
  ).toHaveLength(2);
  expect(
    events.filter(
      (e) =>
        e.type === 'satisfaction' && e.data.source === 'injury-recovery-relief',
    ),
  ).toHaveLength(1);
  expect(actor(w).vitals.health).toBeCloseTo(82);
});
it('cancels changed actions without refunds, deferred health or touching unrelated escrow; new work starts anew', () => {
  let w = recuperationStudy(recuperationFixture());
  w.stacks.push({
    id: 'unrelated',
    resource: 'branch',
    quantity: 1,
    owner: 'lin',
    position: { ...actor(w).position },
    origin: 'isolated-unrelated-escrow',
    reservedFor: 'another-job',
  });
  w = fireOperation(w, recuperationAction(6), 'lin', 2).world;
  const h = actor(w).vitals.health,
    escrow = v7Clone(w.stacks);
  w = step(w, fireWait);
  expect(actor(w).vitals.health).toBe(h);
  expect(actor(w).extensionState['recuperation:pending']).toBeUndefined();
  expect(w.stacks).toEqual(escrow);
  expect(
    w.events.filter((e) => e.type === 'recuperation-cancelled'),
  ).toHaveLength(1);
  w = step(w, fireWait);
  expect(w.events.some((e) => e.type === 'recuperation-cancelled')).toBe(false);
  const fresh = fireOperation(w, recuperationAction());
  expect(fresh.frames).toHaveLength(4);
  expect(actor(fresh.world).vitals.health - h).toBeCloseTo(1);
});
it('rejects invalid schemas and unsuitable starting states; post-metabolism eligibility failure retains paid costs but cannot heal', () => {
  const w = recuperationStudy(recuperationFixture());
  for (const args of [
    { rounds: 0 },
    { rounds: 13 },
    { rounds: 1.1 },
    { rounds: 4, target: 'lin' },
  ])
    expect(
      fireOperation(w, { interface: 'recuperate', args }).outcomes[0]?.success,
    ).toBe(false);
  for (const vitals of [
    { satiety: 39 },
    { energy: 3 },
    { temperature: 15 },
    { temperature: 23 },
    { health: 100 },
  ]) {
    const b = v7Clone(w);
    Object.assign(actor(b).vitals, vitals);
    const r = fireOperation(b, recuperationAction());
    expect(r.outcomes[0]?.success).toBe(false);
    expect(r.world.events.some((e) => e.type === 'recuperation-progress')).toBe(
      false,
    );
  }
  const b = v7Clone(w);
  actor(b).vitals.satiety = 40.5;
  const r = fireOperation(b, recuperationAction());
  expect(r.outcomes[0]?.success).toBe(false);
  expect(actor(r.world).vitals.health).toBe(80);
  expect(actor(r.world).vitals.satiety).toBeCloseTo(39.4);
  expect(actor(r.world).extensionState['recuperation:pending']).toBeUndefined();
  expect(
    r.world.events.some((e) => e.type === 'recuperation-relief-qualified'),
  ).toBe(false);
});
it('ends immediately at actual full health, never awards sub-threshold healing and allows another personally trained user', () => {
  let w = recuperationStudy(recuperationFixture());
  actor(w).vitals.health = 99.9;
  const r = fireOperation(w, recuperationAction(12));
  expect(r.frames).toHaveLength(1);
  expect(actor(r.world).vitals.health).toBe(100);
  expect(r.world.events.some((e) => e.type === 'satisfaction')).toBe(false);
  w = recuperationFixture();
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      v7Step(
        w,
        {
          lin: fireWait,
          moss:
            i === 0
              ? { interface: 'learn', args: { ability: 'recuperate' } }
              : fireWait,
          sol: fireWait,
        },
        registry,
      ).world,
    );
  expect(required(w.actors[1]).mastered).toContain('recuperate');
  const other = fireOperation(w, recuperationAction(), 'moss');
  expect(required(other.world.actors[1]).vitals.health).toBeCloseTo(81);
  expect(actor(other.world).vitals.health).toBe(80);
});
it('has finite observable progress and transient relief only after genuine consecutive recovery', () => {
  const r = recuperationFrames();
  expect(r.frames).toHaveLength(6);
  expect(
    r.frames
      .flatMap((w) => w.events)
      .filter((e) => e.type === 'recuperation-relief-qualified'),
  ).toHaveLength(1);
  expect(
    r.frames
      .flatMap((w) => w.events)
      .filter((e) => e.type === 'recuperation-progress')
      .map((e) => e.data.remaining),
  ).toEqual([5, 4, 3, 2, 1, 0]);
  expect(
    actor(r.world).wellbeing.sources.find(
      (s) => s.source === 'injury-recovery-relief',
    )?.sustained,
  ).toBeUndefined();
});

it('same-round animal injury and death cannot be offset by recuperation, and interruption never restarts after respawn', () => {
  for (const health of [80, 5]) {
    let w = recuperationStudy(recuperationFixture());
    w = fireOperation(w, recuperationAction(6), 'lin', 1).world;
    actor(w).vitals.health = health;
    const boar = v7Clone(
      required(
        initialForestExperienceWorld().objects.find(
          (o) => o.data.species === 'boar',
        ),
      ),
    );
    boar.spatial.x = actor(w).position.x + 0.5;
    boar.spatial.y = actor(w).position.y;
    boar.data.homeX = boar.spatial.x;
    boar.data.homeY = boar.spatial.y;
    boar.data.nextAttack = 0;
    w.objects.push(boar);
    const r = fireOperation(w, recuperationAction(6), 'lin', 1);
    expect(
      r.world.events.some((e) => e.actor === 'lin' && e.type === 'injured'),
    ).toBe(true);
    expect(actor(r.world).vitals.health).toBe(health > 10 ? health - 10 : 100);
    expect(
      actor(r.world).extensionState['recuperation:pending'],
    ).toBeUndefined();
    expect(
      r.world.events.some((e) => e.type === 'recuperation-relief-qualified'),
    ).toBe(false);
    if (health > 10) {
      expect(r.outcomes[0]?.success).toBe(false);
      expect(
        r.world.events.find((e) => e.type === 'recuperation-progress')?.data
          .healing,
      ).toBe(0);
    } else {
      expect(
        r.world.events.some((e) => e.actor === 'lin' && e.type === 'died'),
      ).toBe(true);
      expect(
        r.world.events.some((e) => e.actor === 'lin' && e.type === 'respawned'),
      ).toBe(true);
      expect(actor(r.world).life?.deaths).toBe(1);
      expect(
        r.world.events.some(
          (e) =>
            e.type === 'recuperation-progress' && Number(e.data.healing) > 0,
        ),
      ).toBe(false);
      expect(
        actor(r.world).extensionState['execution:operation'],
      ).toBeUndefined();
      expect(
        actor(step(r.world, fireWait)).extensionState['recuperation:pending'],
      ).toBeUndefined();
    }
  }
});
