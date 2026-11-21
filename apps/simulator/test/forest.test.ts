import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7Plan } from '@self-evolving-world/world-core';
import {
  newContinuousExecution,
  continueContinuousExecution,
} from '../src/continuous-run.js';
import type {
  V7Sink,
  V7Execution,
  V7CallRecord,
  V7RoundRecord,
} from '../src/continuous-run.js';
import type { V7Provider } from '../src/continuous-provider.js';
import { forestFixture } from '../../../packages/world-core/test/fixtures/forest-extension.js';
const plan = (repeat: number): V7Plan => ({
  intention: '',
  steps: [
    {
      action: { interface: 'wait', args: {} },
      repeat,
      until: null,
      guard: null,
    },
  ],
  repeat: 1,
  until: null,
  interrupts: [],
  notes: [],
  preferences: [],
});
function storage() {
  let saved: V7Execution | null = null;
  const calls = new Map<string, V7CallRecord>(),
    rounds: V7RoundRecord[] = [],
    checkpoints: number[] = [];
  const sink: V7Sink = {
    save: (s) => {
      saved = v7Clone(s);
      return Promise.resolve();
    },
    call: (r) => {
      calls.set(r.attempt.id, v7Clone(r));
      return Promise.resolve();
    },
    findCall: (id) => Promise.resolve(calls.get(id) ?? null),
    round: (r) => {
      rounds.push(v7Clone(r));
      return Promise.resolve();
    },
    checkpoint: (s) => {
      checkpoints.push(s.world.tick);
      return Promise.resolve();
    },
  };
  return { sink, calls, rounds, checkpoints, read: () => saved };
}
it('isolated forest request, review, development, study, execution, experience and other-actor reuse preserve one barrier', async () => {
  const { FOREST_BASE, v7Registry, v7Remember } =
    await import('@self-evolving-world/world-core');
  const { tensionPackage: legacyPackage } =
    await import('../../../packages/world-core/test/fixtures/continuous-extension.js');
  const { resolveContinuousDevelopment } =
    await import('../src/continuous-run.js');
  const db = storage(),
    world = forestFixture();
  const tensionPackage = {
    ...legacyPackage,
    dependencies: ['foundation-forest@1'],
    events: ['built', 'resonated'],
  };
  present(world.actors[1]).position = { x: 2.8, y: 2.1 };
  world.stacks.push({
    id: 'fixture-paid-material',
    resource: 'branch',
    quantity: 2,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'isolated fixture input, never discovery',
  });
  v7Remember(world);
  const initial = newContinuousExecution(
    'isolated-fixture',
    'isolated-fixture',
    world,
  );
  initial.windowTarget = 8;
  const resultText = (text: unknown) => ({
    text: JSON.stringify(text),
    responseId: 'fixture',
    usage: null,
    http: { status: 200, requestId: null, contentType: null },
    evidence: 'Explicitly simulated fixture, no model call.',
  });
  let aDecisions = 0,
    bDecisions = 0;
  const provider: V7Provider = (role, input) => {
    if (role === 'world')
      return Promise.resolve(
        resultText({
          reviews: [
            {
              actor: 'a',
              decision: 'develop',
              ability: null,
              reason:
                'Fixture functional gap requires executable implementation.',
              specification:
                'Paid tension, shared entrance, relaxation state and event-grounded enjoyment.',
              learning: 2,
              experienceReview:
                'Actual touch events provide bounded personal sensory satisfaction; learning and construction alone provide none.',
              visualReview:
                'The paid shared surface has visible geometry and a real reachable interaction entrance.',
            },
          ],
        }),
      );
    if (!('identity' in input))
      throw new Error('Expected ordinary fixture input.');
    if (input.identity.id === 'a') {
      aDecisions++;
      if (aDecisions === 1)
        return Promise.resolve(
          resultText({
            ...plan(1),
            steps: [
              {
                action: {
                  interface: 'request',
                  args: {
                    name: 'Fixture tension',
                    function: 'Create an executable tension surface.',
                    conditions: 'Two carried branches.',
                    inputs: 'Two branches.',
                    costs: 'Three energy.',
                    effects:
                      'Shared persistent tension and paid actual resonance.',
                  },
                },
                repeat: 1,
                until: null,
                guard: null,
              },
            ],
          }),
        );
      if (aDecisions === 2)
        return Promise.resolve(
          resultText({
            ...plan(1),
            steps: [
              {
                action: { interface: 'fixture-build', args: {} },
                repeat: 1,
                until: null,
                guard: null,
              },
            ],
          }),
        );
    } else {
      bDecisions++;
      if (bDecisions === 1) return Promise.resolve(resultText(plan(3)));
      if (bDecisions === 2)
        return Promise.resolve(
          resultText({
            ...plan(1),
            steps: [
              {
                action: {
                  interface: 'learn',
                  args: { ability: 'fixture-touch' },
                },
                repeat: 1,
                until: null,
                guard: null,
              },
            ],
          }),
        );
      if (bDecisions === 3) {
        const object = input.observation.objects.find(
          (o) => o.kind === 'tension-surface',
        );
        if (!object)
          throw new Error('Fixture missing real constructed object.');
        return Promise.resolve(
          resultText({
            ...plan(1),
            steps: [
              {
                action: {
                  interface: 'fixture-touch',
                  args: { target: object.id },
                },
                repeat: 1,
                until: null,
                guard: null,
              },
            ],
          }),
        );
      }
    }
    return Promise.resolve(resultText(plan(20)));
  };
  const pending = await continueContinuousExecution(initial, provider, db.sink);
  expect(pending.phase).toBe('development');
  expect(pending.world.tick).toBe(0);
  expect(pending.developments).toHaveLength(1);
  expect(pending.world.objects).toHaveLength(0);
  const registry = v7Registry([FOREST_BASE, tensionPackage]);
  const implemented = resolveContinuousDevelopment(
    pending,
    ['fixture-tension@1'],
    { a: 'fixture-build' },
    'Isolated implementation review, paid surface and validated shared use.',
    registry,
  );
  expect(present(implemented.world.actors[0]).mastered).not.toContain(
    'fixture-build',
  );
  expect(implemented.world.objects).toHaveLength(0);
  const completed = await continueContinuousExecution(
    implemented,
    provider,
    db.sink,
    registry,
  );
  expect(completed.phase).toBe('window-complete');
  expect(
    db.rounds.flatMap((r) => r.events).filter((e) => e.type === 'failed'),
  ).toEqual([]);
  expect(completed.world.objects[0]?.data.uses).toBe(1);
  expect(present(completed.world.actors[1]).wellbeing.mental).toBe(12);
  expect(present(completed.world.actors[0]).wellbeing.mental).toBe(0);
  expect(completed.world.stacks).toHaveLength(0);
  expect(completed.developments[0]?.status).toBe('accepted');
  expect(
    db.rounds.flatMap((r) => r.events).filter((e) => e.type === 'mastered'),
  ).toHaveLength(2);
});

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required fixture value is missing.');
  return value;
}
