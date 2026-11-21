import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Step,
  v7Cursor,
  v7FinishTasks,
  v7TaskAction,
  forestResolveReference,
  forestResolveAction,
  forestMeal,
  forestRestFactor,
  forestExperienceAfterRound,
  v7Wellbeing,
  v7Install,
  v7Registry,
  V7_PACKAGES,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7World,
  V7Plan,
  V7Package,
} from '@self-evolving-world/world-core';
import { initialForestExperienceWorld } from '../src/forest-experience-scenario.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';
import { newContinuousExecution } from '../src/continuous-run.js';
const wait: V7Action = { interface: 'wait', args: {} };
const registry = continuousRegistry();
function fixture() {
  const w = v7Clone(initialForestExperienceWorld());
  w.objects = [];
  w.processes = [];
  w.terrain = w.terrain.map((row) => '.'.repeat(row.length));
  w.actors.forEach((a, i) => {
    a.position = { x: 10 + i * 2, y: 10 };
    a.memory.objects = [];
    a.memory.stacks = [];
    a.vitals.satiety = 50;
  });
  w.stacks = [
    {
      id: 'sample',
      resource: 'tuber',
      quantity: 2,
      owner: 'lin',
      position: { x: 10, y: 10 },
      origin: 'isolated-source',
      decay: 0,
    },
  ];
  return w;
}
function actor(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  return a;
}
function step(w: V7World, action: V7Action, cursors = {}) {
  return v7Step(w, { lin: action, moss: wait, sol: wait }, registry, cursors);
}
function plan(action: V7Action, repeat = 1): V7Plan {
  return {
    intention: 'Isolated execution regression',
    steps: [{ action, repeat, until: null, guard: null }],
    repeat: 1,
    until: null,
    interrupts: [],
    notes: [],
    preferences: [],
  };
}

describe('versioned execution and experience, isolated from formal decisions', () => {
  it('completes individual study with a real task cursor instead of applying the waiting interface duration to the last study round', () => {
    let w = fixture();
    const cursors = {
      lin: v7Cursor(
        plan({ interface: 'learn', args: { ability: 'assess-food' } }),
        0,
      ),
    };
    for (let i = 0; i < 3; i++) {
      const action = v7TaskAction(w, 'lin', cursors.lin) ?? wait;
      const result = step(w, action, cursors);
      expect(result.outcomes.lin?.success).toBe(true);
      v7FinishTasks(w, result, cursors);
      w = v7Clone(result.world);
    }
    expect(actor(w).mastered).toContain('assess-food');
    expect(cursors.lin.reason).toContain('Important observed change');
  });
  it('dispatches a new learned handler through shared resolution and preserves first-round charging across a serialized continuation', () => {
    let w = fixture();
    const pkg: V7Package = {
      id: 'isolated-paid-work',
      version: 1,
      description: 'Isolated generated-contract regression',
      dependencies: [],
      abilities: [
        {
          id: 'isolated-work',
          name: 'Isolated work',
          function: 'Exercise the new execution contract',
          equivalence: 'isolated-work',
          parameters: {
            type: 'object',
            properties: { target: { type: 'string' } },
            required: ['target'],
            additionalProperties: false,
          },
          prerequisites: [],
          learning: 1,
          costs: 'One real item once and two work rounds.',
          effects: 'Records actual work only.',
          handler: 'isolated.work',
          revision: 'isolated-paid-work@1',
          authored: false,
          references: { target: 'owned' },
          execution: {
            duration: 2,
            interruption: 'cancel',
            progress: 'Two paid work rounds.',
          },
        },
      ],
      satisfaction: [],
      resources: [],
      events: ['isolated-worked'],
      processes: {},
      visualComponents: [],
      handlers: {
        'isolated.work': ({ world, actor, action, operation, emit }) => {
          if (operation?.first) {
            const s = world.stacks.find((s) => s.id === action.args.target);
            if (!s) throw new Error('Missing resolved material');
            s.quantity -= 1;
            actor.extensionState.isolatedCharges =
              Number(actor.extensionState.isolatedCharges ?? 0) + 1;
          }
          const elapsed = (operation?.elapsed ?? 0) + 1;
          emit('isolated-worked', 'Actual isolated work.', { elapsed });
          return {
            complete: elapsed === 2,
            remaining: 2 - elapsed,
            writes: [],
          };
        },
      },
    };
    const reg = v7Registry([...V7_PACKAGES, pkg]);
    w = v7Clone(v7Install(w, reg, 'isolated-paid-work@1'));
    expect(actor(w).mastered).not.toContain('isolated-work');
    expect(w.stacks[0]?.quantity).toBe(2);
    w = v7Clone(
      v7Step(
        w,
        {
          lin: { interface: 'learn', args: { ability: 'isolated-work' } },
          moss: wait,
          sol: wait,
        },
        reg,
      ).world,
    );
    let cursors = {
      lin: v7Cursor(
        plan({
          interface: 'isolated-work',
          args: { target: 'resource:tuber' },
        }),
        w.tick,
      ),
    };
    for (let i = 0; i < 2; i++) {
      const action = v7TaskAction(w, 'lin', cursors.lin) ?? wait;
      const result = v7Step(
        w,
        { lin: action, moss: wait, sol: wait },
        reg,
        cursors,
      );
      expect(result.outcomes.lin?.success).toBe(true);
      v7FinishTasks(w, result, cursors);
      const saved = JSON.parse(
        JSON.stringify({ w: result.world, cursors }),
      ) as { w: V7World; cursors: typeof cursors };
      w = saved.w;
      cursors = saved.cursors;
    }
    expect(actor(w).extensionState.isolatedCharges).toBe(1);
    expect(w.stacks[0]?.quantity).toBe(1);
    expect(cursors.lin.cycle).toBe(1);
  });
  it('releases interrupted sample escrow once and preserves exactly the surviving material across death and respawn', () => {
    for (const fatal of [false, true]) {
      let w = fixture();
      actor(w).mastered.push('assess-food'); // Isolated cleanup fixture; learning is exercised separately.
      const sample: V7Action = {
        interface: 'assess-food',
        args: { target: 'sample', mode: 'sample', fraction: 1 },
      };
      w = v7Clone(step(w, sample).world);
      expect(w.stacks.some((s) => s.reservedFor)).toBe(true);
      if (fatal) {
        actor(w).vitals.health = 1;
        actor(w).vitals.satiety = 0;
      }
      w = v7Clone(step(w, wait).world);
      expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
      expect(w.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(2);
      expect(actor(w).life?.deaths).toBe(fatal ? 1 : 0);
      if (fatal) expect(w.stacks.every((s) => s.owner === null)).toBe(true);
      w = v7Clone(step(w, wait).world);
      expect(w.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(2);
    }
  });
  it('uses the same resource alias and explicit instance for base and learned interfaces; rejects ambiguity and stale ownership without hidden candidates', () => {
    const w = fixture(),
      a = actor(w);
    for (const target of ['tuber', 'resource:tuber', 'sample', 'item:sample']) {
      expect(
        forestResolveAction(w, a, {
          interface: 'eat',
          args: { target, quantity: 1 },
        }).args.target,
      ).toBe('sample');
      expect(
        forestResolveAction(w, a, {
          interface: 'assess-food',
          args: { target, mode: 'sample', fraction: 0.2 },
        }).args.target,
      ).toBe('sample');
    }
    expect(() =>
      forestResolveReference(w, a, 'item:sample', 'owned', 3),
    ).toThrow('insufficient-quantity');
    const firstStack = w.stacks[0];
    if (!firstStack) throw new Error('Missing fixture stack');
    w.stacks.push({ ...firstStack, id: 'second' });
    expect(() =>
      forestResolveReference(w, a, 'resource:tuber', 'owned'),
    ).toThrow('ambiguous');
    w.stacks = w.stacks.map((s) => ({ ...s, owner: 'moss' }));
    expect(() => forestResolveReference(w, a, 'sample', 'owned')).toThrow(
      'candidates: none',
    );
    w.stacks = [];
    expect(() => forestResolveReference(w, a, 'sample', 'owned')).toThrow(
      'unavailable',
    );
  });

  it('reproduces ex8 ordinary-404 alias failure and executes one five-round sample without charging or restarting each round', () => {
    const archived = JSON.parse(
      readFileSync('experiment/ex8/calls/ordinary-404.json', 'utf8'),
    ) as { response: { text: string } };
    const original = JSON.parse(archived.response.text) as V7Plan;
    const action = original.steps.find(
      (s) => s.action.interface === 'assess-food',
    )?.action;
    expect(action?.args.target).toBe('resource:tuber');
    if (!action) throw new Error('Missing real failure case.');
    let w = fixture();
    w = v7Clone(
      step(w, { interface: 'learn', args: { ability: 'assess-food' } }).world,
    );
    w = v7Clone(step(step(w, wait).world, wait).world);
    let cursors = { lin: v7Cursor(plan(action), w.tick) };
    const energy = actor(w).vitals.energy;
    for (let i = 1; i <= 5; i++) {
      const selected = v7TaskAction(w, 'lin', cursors.lin);
      expect(selected).not.toBeNull();
      const result = step(w, selected ?? wait, cursors);
      expect(result.outcomes.lin?.success).toBe(true);
      v7FinishTasks(w, result, cursors);
      w = v7Clone(result.world);
      expect(cursors.lin.cycle).toBe(i === 5 ? 1 : 0);
      if (i < 5) expect(cursors.lin.operation?.remaining).toBe(5 - i);
      if (i === 2) {
        const saved = JSON.stringify({ w, cursors });
        const restored = JSON.parse(saved) as {
          w: V7World;
          cursors: typeof cursors;
        };
        w = restored.w;
        cursors = restored.cursors;
        expect(cursors.lin.operation?.elapsed).toBe(2);
      }
    }
    expect(w.stacks.reduce((n, s) => n + s.quantity, 0)).toBeCloseTo(1.9);
    expect(energy - actor(w).vitals.energy).toBeCloseTo(3.5, 2);
    expect(v7TaskAction(w, 'lin', cursors.lin)).toBeNull();
  });

  it('retains ex8 ordinary-406 repeat intent as completed executions rather than silently interpreting it as rounds', () => {
    const archived = JSON.parse(
      readFileSync('experiment/ex8/calls/ordinary-406.json', 'utf8'),
    ) as { response: { text: string } };
    const original = JSON.parse(archived.response.text) as V7Plan;
    expect(original.steps[0]?.repeat).toBe(5);
    const w = fixture(),
      cursor = v7Cursor(original, 0);
    const input = ordinaryContinuousInput(w, 'lin', cursor, 650);
    expect(
      input.catalogue.interfaces.find((a) => a.id === 'assess-food')?.execution
        ?.progress,
    ).toContain('repeat counts complete operations');
    expect(
      newContinuousExecution('gpt-6.1-sol', 'chatgpt-plan', w).windowTarget,
    ).toBe(1200);
  });

  it('continues outgoing and ordinary incoming message plans, but aggregates an urgent relevant incoming message into one replan', () => {
    const archived = JSON.parse(
      readFileSync('experiment/ex8/calls/ordinary-121.json', 'utf8'),
    ) as { response: { text: string } };
    expect(
      (JSON.parse(archived.response.text) as V7Plan).steps[0]?.action.interface,
    ).toBe('message');
    const w = fixture(),
      message: V7Action = {
        interface: 'message',
        args: {
          recipient: 'moss',
          text: 'Observed local fact.',
          urgency: 'ordinary',
          subject: 'moss',
        },
      };
    const p = plan(message);
    p.steps.push({ action: wait, repeat: 3, guard: null, until: null });
    p.interrupts = ['message'];
    const cursors = { lin: v7Cursor(p, 0), moss: v7Cursor(plan(wait, 10), 0) };
    let result = step(w, message, cursors);
    v7FinishTasks(w, result, cursors);
    expect(cursors.lin.reason).toBeNull();
    expect(cursors.lin.step).toBe(1);
    expect(cursors.moss.reason).toBeNull();
    result = step(
      w,
      { ...message, args: { ...message.args, urgency: 'urgent' } },
      cursors,
    );
    v7FinishTasks(w, result, cursors);
    expect(cursors.lin.reason).toBeNull();
    expect(cursors.moss.reason).toContain('Important observed change');
  });

  it('starts neutral and does not turn expired pleasure or low total happiness into depressed mood; recovery remains bounded', () => {
    let w = fixture();
    const a = actor(w);
    a.vitals.energy = 0;
    a.vitals.satiety = 1;
    expect(a.experience?.mental).toBe(0);
    for (let i = 0; i < 20; i++) {
      const before = v7Clone(w);
      w.tick++;
      forestExperienceAfterRound(before, w);
    }
    expect(actor(w).experience?.mental).toBe(0);
    for (const mood of [-1, 0, 1]) {
      w = fixture();
      const current = actor(w);
      if (!current.experience) throw new Error('Missing experience');
      current.experience.mental = mood;
      current.vitals.energy = 0;
      const result = step(w, { interface: 'rest', args: {} });
      expect(actor(result.world).vitals.energy).toBeCloseTo(
        4 * forestRestFactor(w, current),
      );
      expect(actor(result.world).vitals.energy).toBeGreaterThanOrEqual(3.4);
      expect(actor(result.world).vitals.energy).toBeLessThanOrEqual(4.4);
      const eaten = step(w, {
        interface: 'eat',
        args: { target: 'sample', quantity: 1 },
      });
      expect(eaten.outcomes.lin?.success).toBe(true);
      expect(actor(eaten.world).vitals.satiety).toBeCloseTo(69.1);
    }
  });

  it('requires substantial real intake, merges tiny portions and computes monotony from physical composition rather than names', () => {
    const w = fixture(),
      a = actor(w),
      tuber = w.resources.find((r) => r.id === 'tuber');
    if (!tuber) throw new Error('Missing food');
    for (let i = 0; i < 7; i++) forestMeal(w, a, tuber, 0.1, 1);
    expect(a.experience?.meals).toHaveLength(0);
    forestMeal(w, a, tuber, 0.1, 1);
    expect(a.experience?.meals).toHaveLength(1);
    for (let i = 0; i < 8; i++) {
      w.tick += 20;
      forestMeal(w, a, { ...tuber, name: `Renamed ${String(i)}` }, 1, 20);
    }
    expect(a.experience?.monotony).toBeGreaterThan(0.9);
    const monotone = a.experience?.pleasure ?? 0;
    for (const id of [
      'walnut',
      'apple',
      'root',
      'hazelnut',
      'plum',
      'mushroom',
    ]) {
      const r = w.resources.find((r) => r.id === id);
      if (!r) throw new Error('Missing food');
      w.tick += 20;
      forestMeal(w, a, r, 2, 16);
    }
    expect(a.experience?.monotony).toBeLessThan(0.5);
    expect(a.experience?.pleasure).toBeGreaterThan(monotone);
    const count = a.experience?.meals.length;
    forestMeal(w, a, tuber, 1, 0);
    expect(a.experience?.meals.length).toBe(count);
  });

  it('requires generated abilities to declare shared reference and execution contracts; no install grants materials or mastery', () => {
    const w = fixture();
    const originalAbility = w.abilities[0];
    if (!originalAbility) throw new Error('Missing fixture ability');
    const p: V7Package = {
      id: 'isolated-contract',
      version: 1,
      description: 'Isolated contract fixture',
      dependencies: [],
      abilities: [
        {
          ...originalAbility,
          id: 'isolated',
          equivalence: 'isolated',
          authored: false,
          learning: 2,
        },
      ],
      satisfaction: [],
      resources: [],
      handlers: {},
      processes: {},
      visualComponents: [],
    };
    const modified = p.abilities[0];
    if (!modified) throw new Error('Missing modified ability');
    delete modified.references;
    delete modified.execution;
    const reg = v7Registry([...V7_PACKAGES, p]);
    expect(() => v7Install(w, reg, 'isolated-contract@1')).toThrow(
      'execution and reference contracts',
    );
  });

  it('slowly accumulates maintained satisfaction from real executed events and decays without an expiration cliff', () => {
    const w = fixture(),
      a = actor(w),
      rule = w.satisfaction[0];
    if (!rule) throw new Error('Missing fixture source');
    rule.mode = 'maintained';
    delete rule.repeatWindow;
    rule.repetition = 'refresh';
    rule.cooldown = 1;
    rule.duration = 20;
    rule.conditions = [];
    const reward = () => {
      w.events = [
        {
          id: `e-${String(w.tick)}`,
          tick: w.tick,
          actor: a.id,
          type: rule.event,
          interface: rule.interface,
          success: true,
          description: 'Isolated actual execution event',
          position: a.position,
          target: null,
          data: {},
        },
      ];
      v7Wellbeing(w);
    };
    reward();
    const first = a.wellbeing.sources[0]?.value ?? 0;
    expect(first).toBeCloseTo(rule.amount / 6);
    w.tick++;
    reward();
    expect(a.wellbeing.sources[0]?.value).toBeGreaterThan(first);
    const prior = a.wellbeing.sources[0]?.value ?? 0;
    for (let i = 0; i < 21; i++) {
      w.tick++;
      w.events = [];
      v7Wellbeing(w);
    }
    expect(a.wellbeing.sources[0]?.value).toBeGreaterThan(0);
    expect(a.wellbeing.sources[0]?.value).toBeLessThan(prior);
  });
});
