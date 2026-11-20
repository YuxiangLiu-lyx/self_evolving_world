import { describe, expect, it } from 'vitest';
import { v7Clone, V7_GOAL } from '@self-evolving-world/world-core';
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
import {
  ORDINARY_CONTINUOUS_PROMPT,
  continuousPlanSchema,
} from '../src/continuous-provider.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';

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
describe('persistent continuous controller', () => {
  it('journals each attempt before inference and runs long tasks without per-round calls', async () => {
    const db = storage(),
      initial = newContinuousExecution('fixture', 'isolated-fixture');
    initial.windowTarget = 20;
    const provider: V7Provider = () => {
      expect(db.read()?.pendingCall).not.toBeNull();
      expect(db.read()?.attempts.at(-1)?.status).toBe('started');
      return Promise.resolve({
        text: JSON.stringify(plan(30)),
        responseId: 'fixture',
        usage: { inputTokens: 10, outputTokens: 20 },
        http: { status: 200, requestId: null, contentType: 'application/json' },
        evidence: 'isolated fixture',
      });
    };
    const result = await continueContinuousExecution(
      initial,
      provider,
      db.sink,
    );
    expect(result.phase).toBe('window-complete');
    expect(result.world.tick).toBe(20);
    expect(result.attempts).toHaveLength(3);
    expect(db.rounds).toHaveLength(20);
    const continued = v7Clone(result);
    continued.phase = 'running';
    continued.windowTarget = 25;
    const next = await continueContinuousExecution(
      continued,
      provider,
      db.sink,
    );
    expect(next.world.tick).toBe(25);
    expect(next.attempts).toHaveLength(3);
  });
  it('counts failed attempts and pauses everyone at the shared limit before further metabolism', async () => {
    const db = storage(),
      initial = newContinuousExecution('fixture', 'isolated-fixture');
    initial.world = v7Clone(initial.world);
    initial.world.config.budgets.ordinary = 2;
    let calls = 0;
    const provider: V7Provider = () => {
      calls++;
      throw new Error('Fixture transport failure.');
    };
    const result = await continueContinuousExecution(
      initial,
      provider,
      db.sink,
    );
    expect(calls).toBe(2);
    expect(result.attempts.every((a) => a.status === 'failed')).toBe(true);
    expect(result.phase).toBe('paused');
    expect(result.world.tick).toBe(0);
    expect(
      result.world.actors.every(
        (a) => a.vitals.health === 100 && a.vitals.satiety === 80,
      ),
    ).toBe(true);
  });
  it('resumes a durable accepted response without invoking it again and refuses an uncertain call', async () => {
    const db = storage(),
      initial = newContinuousExecution('fixture', 'isolated-fixture');
    initial.windowTarget = 1;
    const input = ordinaryContinuousInput(initial.world, 'lin', undefined, 400);
    const attempt = {
      id: 'ordinary-1',
      role: 'ordinary' as const,
      actor: 'lin',
      tick: 0,
      reason: 'Initial fixture',
      status: 'started' as const,
      startedAt: '2026-01-01T00:00:00Z',
      elapsedMs: null,
      usage: null,
      error: null,
    };
    initial.attempts.push(attempt);
    initial.pendingCall = { id: attempt.id, input };
    let count = 0;
    const provider: V7Provider = () => {
      count++;
      return Promise.resolve({
        text: JSON.stringify(plan(2)),
        responseId: 'fixture',
        usage: null,
        http: { status: 200, requestId: null, contentType: null },
        evidence: '',
      });
    };
    const blocked = await continueContinuousExecution(
      initial,
      provider,
      db.sink,
    );
    expect(blocked.phase).toBe('paused');
    expect(count).toBe(0);
    db.calls.set(attempt.id, {
      attempt: { ...attempt, status: 'accepted', elapsedMs: 1 },
      input,
      response: {
        text: JSON.stringify(plan(2)),
        responseId: 'saved-fixture',
        usage: null,
        http: { status: 200, requestId: null, contentType: null },
        evidence: '',
      },
      failureEvidence: '',
    });
    const recovered = await continueContinuousExecution(
      initial,
      provider,
      db.sink,
    );
    expect(recovered.world.tick).toBe(1);
    expect(count).toBe(2);
    expect(recovered.attempts).toHaveLength(3);
  });
  it('exposes the exact current interface schema without visual code or directed development goals', () => {
    const initial = newContinuousExecution('fixture', 'isolated-fixture'),
      input = ordinaryContinuousInput(initial.world, 'lin', undefined, 400);
    expect(input.goal).toBe(V7_GOAL);
    expect(ORDINARY_CONTINUOUS_PROMPT).not.toMatch(
      /stabilize supply|reduce repetitive|build a|fishing|hobbies|offspring/,
    );
    expect(JSON.stringify(input)).not.toContain('visualComponents');
    expect(JSON.stringify(input)).not.toContain('component');
    expect(
      JSON.stringify(continuousPlanSchema(input.catalogue.interfaces)),
    ).toContain('navigate');
    expect(input.previousTask).toBeNull();
  });
});

it('hands an initially absent executable capability back through the counted development barrier and separates implementation from shared mastery and use', async () => {
  const { V7_BASE, v7Registry, v7Remember } =
    await import('@self-evolving-world/world-core');
  const { continuousFixture, tensionPackage } =
    await import('../../../packages/world-core/test/fixtures/continuous-extension.js');
  const { resolveContinuousDevelopment } =
    await import('../src/continuous-run.js');
  const db = storage(),
    world = continuousFixture();
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
  const registry = v7Registry([V7_BASE, tensionPackage]);
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

it('retains failed world attempts and accepts an explicitly recorded conversation review without another inference or a fabricated capability', async () => {
  const { parseContinuousReviews, resolveContinuousDevelopment } =
    await import('../src/continuous-run.js');
  const db = storage(),
    initial = newContinuousExecution('fixture', 'isolated-fixture');
  initial.windowTarget = 1;
  const provider: V7Provider = (role, input) => {
    if (role === 'world')
      return Promise.reject(new Error('Isolated review transport failure.'));
    const request = {
      interface: 'request',
      args: {
        name: 'Fixture request',
        function: 'An unspecified fixture effect.',
        conditions: 'Unknown.',
        inputs: 'Unknown.',
        costs: 'Unknown.',
        effects: 'Requires actual review.',
      },
    };
    return Promise.resolve({
      text: JSON.stringify(
        'identity' in input && input.identity.id === 'lin'
          ? {
              ...plan(1),
              steps: [{ action: request, repeat: 1, until: null, guard: null }],
            }
          : plan(10),
      ),
      responseId: 'fixture',
      usage: null,
      http: { status: 200, requestId: null, contentType: null },
      evidence: 'Isolated fixture only.',
    });
  };
  const pending = await continueContinuousExecution(initial, provider, db.sink);
  expect(pending.phase).toBe('development');
  expect(pending.attempts.filter((a) => a.role === 'world')).toHaveLength(2);
  expect(pending.developments).toHaveLength(1);
  expect(pending.world.tick).toBe(0);
  const reviewed = v7Clone(pending),
    barrier = present(reviewed.barrier);
  barrier.reviews = parseContinuousReviews(
    JSON.stringify({
      reviews: [
        {
          actor: 'lin',
          decision: 'reject',
          ability: null,
          learning: 0,
          reason:
            'No executable function or prerequisites were supplied in this isolated fixture.',
          specification: '',
        },
      ],
    }),
    barrier,
    reviewed.world,
  );
  const resolved = resolveContinuousDevelopment(
    reviewed,
    [],
    {},
    'Explicit isolated conversation review; no world capability was invented.',
  );
  const final = await continueContinuousExecution(resolved, provider, db.sink);
  expect(final.world.tick).toBe(1);
  expect(final.world.abilities).toEqual(initial.world.abilities);
  expect(final.attempts).toHaveLength(5);
  expect(final.developments[0]?.internalModelCalls).toBeNull();
  expect(final.world.events.some((e) => e.type === 'review-rejected')).toBe(
    true,
  );
});
