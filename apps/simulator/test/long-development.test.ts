import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  v7Clone,
  v7Cursor,
  v7Step,
  continuousRegistry,
  forestResolveReference,
} from '@self-evolving-world/world-core';
import type { V7Plan, V7Ability } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import {
  longOrdinaryInput,
  longRetrieve,
  longWorldInput,
  LONG_CALL_PAUSE,
} from '../src/long-context.js';
import { longRequestMeasure, longTokenBudget } from '../src/long-tokens.js';
import { continuousRequest } from '../src/continuous-provider.js';
import {
  newContinuousExecution,
  continueContinuousExecution,
  resolveContinuousDevelopment,
  issueContinuousDevelopment,
} from '../src/continuous-run.js';
import type {
  V7Execution,
  V7Sink,
  V7CallRecord,
} from '../src/continuous-run.js';
import { openRoutine } from '@self-evolving-world/world-core';
const plan: V7Plan = {
  intention: 'Fixture only',
  steps: [
    {
      action: { interface: 'wait', args: {} },
      repeat: 8,
      until: null,
      guard: null,
    },
  ],
  repeat: 1,
  until: null,
  interrupts: [],
  notes: [],
  preferences: [],
};
const response = (
  text: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null = {
    inputTokens: 4000,
    outputTokens: 100,
  },
) => ({
  text,
  responseId: 'fixture',
  usage,
  http: { status: 200, requestId: null, contentType: 'application/json' },
  evidence: 'isolated fixture; not formal evidence',
});
function store() {
  let saved: V7Execution | null = null;
  const calls = new Map<string, V7CallRecord>();
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
    round: () => {
      return Promise.resolve();
    },
    checkpoint: () => {
      return Promise.resolve();
    },
  };
  return { sink, calls, saved: () => saved };
}
const query = {
  section: 'abilities' as const,
  search: '',
  ids: ['navigate'],
  offset: 0,
  part: 0,
};
describe('bounded long development control', () => {
  it('retains failed call charges and resumes only after an empty counted technical handoff without advancing time', async () => {
    const db = store();
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialLongWorld(),
    );
    state.windowTarget = 1;
    const paused = await continueContinuousExecution(
      state,
      () => Promise.reject(new Error('Isolated transport failure')),
      db.sink,
    );
    expect(paused.reason).toBe(LONG_CALL_PAUSE);
    expect(paused.world.tick).toBe(0);
    expect(paused.pendingCall).toBeNull();
    expect(paused.attempts[0]?.status).toBe('failed');
    const charged = longTokenBudget(paused)?.used;
    paused.barrier = {
      id: 'fixture-recovery',
      tick: 0,
      actions: {},
      requests: {},
      reviews: [],
      worldAttempts: 0,
      errors: [],
      input: longWorldInput(paused.world, {}),
      developmentAttempt: null,
      technicalReason: LONG_CALL_PAUSE,
    };
    await issueContinuousDevelopment(paused, db.sink);
    const repaired = resolveContinuousDevelopment(
      paused,
      [],
      {},
      'Inspected retained failed invocation; no policy or world changes.',
    );
    expect(repaired.world).toEqual(state.world);
    expect(repaired.attempts).toEqual(paused.attempts);
    expect(repaired.longRetrieval).toEqual(paused.longRetrieval);
    expect(repaired.barrier).toBeNull();
    expect(longTokenBudget(repaired)?.used).toBe(charged);
    const done = await continueContinuousExecution(
      repaired,
      () =>
        Promise.resolve(
          response(
            JSON.stringify({ queries: [], result_json: JSON.stringify(plan) }),
          ),
        ),
      db.sink,
    );
    expect(done.world.tick).toBe(1);
    expect(done.developments).toHaveLength(1);
    expect(done.attempts).toHaveLength(4);
    expect(longTokenBudget(done)?.used).toBe((charged ?? 0) + 12300);
  });
  it('bounds a 5000-skill/record catalogue and retrieves exact current-scope details without granting mastery', () => {
    const world = v7Clone(initialLongWorld()),
      a = required(world.actors[0]);
    const base = required(world.abilities[0]);
    for (let i = 0; i < 5000; i++) {
      world.abilities.push({
        ...v7Clone(base),
        authored: false,
        id: `fixture-${String(i)}`,
        function: `Distinct fixture ${String(i)}`,
        equivalence: `fixture:${String(i)}`,
      } satisfies V7Ability);
      a.memory.knowledge ??= {};
      a.memory.knowledge[`fact-${String(i)}`] = {
        key: `fact-${String(i)}`,
        subject: `fixture-${String(i)}`,
        property: 'fixture property',
        value: i,
        method: 'isolated fixture',
        condition: 'test',
        verified: true,
        tick: i,
        evidence: `event-${String(i)}`,
      };
    }
    const input = longOrdinaryInput(world, a.id),
      request = continuousRequest('fixture', 'ordinary', input),
      measure = longRequestMeasure(request, 3500);
    expect(measure.inputEstimate).toBeLessThan(8000);
    expect(JSON.stringify(input)).not.toContain('fixture-4999');
    const found = longRetrieve(world, a.id, 'ordinary', [
      { ...query, ids: ['fixture-4999'] },
    ]);
    expect(JSON.stringify(found)).toContain('fixture-4999');
    expect(a.mastered).not.toContain('fixture-4999');
    const fresh = initialLongWorld('separate');
    expect(
      JSON.stringify(
        longRetrieve(fresh, a.id, 'ordinary', [
          { ...query, ids: ['fixture-4999'] },
        ]),
      ),
    ).not.toContain('Distinct fixture');
    expect(
      longRequestMeasure(
        continuousRequest(
          'fixture',
          'world',
          longWorldInput(world, {
            lin: { interface: 'request', args: { effect: 'fixture' } },
          }),
        ),
        3500,
      ).inputEstimate,
    ).toBeLessThan(8000);
  });
  it('preserves exact paid operation, escrow and cancel contract while hiding nested physical properties and other private knowledge', () => {
    const w = v7Clone(initialLongWorld()),
      a = required(w.actors[0]),
      b = required(w.actors[1]);
    b.memory.notes = ['PRIVATE OTHER RECORD'];
    w.stacks.push({
      id: 'owned-control',
      resource: 'clay',
      quantity: 0.4,
      owner: a.id,
      position: a.position,
      origin: 'fixture',
      reservedFor: 'operation-exact',
      physical: { unitMass: 9876, unitWater: 0, unitSolids: 9876 },
      componentLots: [
        {
          id: 'lot',
          resource: 'clay',
          quantity: 0.4,
          owner: a.id,
          position: a.position,
          origin: 'fixture',
          physical: { unitMass: 9876, unitWater: 0, unitSolids: 9876 },
        },
      ],
    });
    const c = v7Cursor(plan, 0);
    c.operation = {
      action: { interface: 'wait', args: {} },
      elapsed: 7,
      remaining: 3,
      startedAt: 0,
    };
    a.extensionState['execution:operation'] = {
      operation: { id: 'operation-exact', elapsed: 7, remaining: 3 },
      cancel: 'retain actual unconsumed escrow once',
    };
    const input = longOrdinaryInput(w, a.id, c),
      serialized = JSON.stringify(input);
    expect(serialized).toContain('operation-exact');
    expect(serialized).toContain('"remaining":3');
    expect(serialized).not.toContain('9876');
    expect(serialized).not.toContain('PRIVATE OTHER RECORD');
    const result = longRetrieve(w, a.id, 'ordinary', [
      { ...query, section: 'inventory', ids: ['owned-control'] },
    ]);
    expect(JSON.stringify(result)).not.toContain('9876');
    expect(
      JSON.stringify(
        longRetrieve(w, 'world', 'world', [{ ...query, section: 'memory' }]),
      ),
    ).toContain('Only this experiment');
    expect(w.stacks[0]?.physical?.unitMass).toBe(9876);
  });
  it('counts same-round retrieval and reuses durable results after interruption without advancing metabolism', async () => {
    const db = store(),
      state = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialLongWorld(),
      );
    state.windowTarget = 2;
    let crash = true;
    const sink = {
      ...db.sink,
      save: async (s: V7Execution) => {
        await db.sink.save(s);
        if (crash && s.longRetrieval?.lin) {
          crash = false;
          throw new Error('Fixture interruption after durable retrieval');
        }
      },
    };
    await expect(
      continueContinuousExecution(
        state,
        () =>
          Promise.resolve(
            response(JSON.stringify({ queries: [query], result_json: null })),
          ),
        sink,
      ),
    ).rejects.toThrow('Fixture interruption');
    const retained = required(db.saved());
    expect(retained.world.tick).toBe(0);
    expect(retained.attempts).toHaveLength(1);
    retained.phase = 'running';
    retained.reason = null;
    const done = await continueContinuousExecution(
      retained,
      (_role, input) => {
        if ('longContext' in input && input.longContext.actor === 'lin')
          expect(input.retrieval).toHaveLength(1);
        return Promise.resolve(
          response(
            JSON.stringify({ queries: [], result_json: JSON.stringify(plan) }),
          ),
        );
      },
      db.sink,
    );
    expect(done.world.tick).toBe(2);
    expect(done.attempts).toHaveLength(4);
    expect(done.attempts.every((a) => !!a.requestMeasure)).toBe(true);
    expect(done.phase).toBe('window-complete');
  });
  it('preserves unknown failed usage as a reservation and globally pauses before another call can exceed the ceiling', async () => {
    const db = store(),
      w = v7Clone(initialLongWorld());
    const state = newContinuousExecution('fixture', 'isolated-fixture', w);
    const first = longRequestMeasure(
      continuousRequest(state.model, 'ordinary', longOrdinaryInput(w, 'lin')),
      required(w.config.longDevelopment).outputTokens,
    );
    // Permit one unknown-use call, but not a second conservative reservation.
    required(state.world.config.longDevelopment).tokens =
      first.reservation + 1000;
    state.windowTarget = 2;
    const done = await continueContinuousExecution(
      state,
      () =>
        Promise.resolve(
          response(
            JSON.stringify({ queries: [], result_json: JSON.stringify(plan) }),
            null,
          ),
        ),
      db.sink,
    );
    expect(done.world.tick).toBe(0);
    expect(done.phase).toBe('paused');
    expect(done.attempts).toHaveLength(1);
    expect(longTokenBudget(done)?.used).toBe(done.attempts[0]?.reservedTokens);
  });
  it('accepts a consistent whitespace alias for the real ex12 malformed reference only under the new opt-in policy', () => {
    const old = JSON.parse(
      readFileSync(
        'experiment/ex12/technical-pauses/round-56/execution.json',
        'utf8',
      ),
    ) as V7Execution;
    const w = v7Clone(old.world);
    w.config.longDevelopment = required(
      initialLongWorld().config.longDevelopment,
    );
    const a = required(w.actors.find((a) => a.id === 'cedar-4'));
    expect(
      forestResolveReference(w, a, 'item: item-48-cedar-4-1203', 'owned'),
    ).toBe('item-48-cedar-4-1203');
    expect(() =>
      forestResolveReference(
        old.world,
        a,
        'item: item-48-cedar-4-1203',
        'owned',
      ),
    ).toThrow('unavailable');
    expect(() =>
      forestResolveReference(w, a, 'item:item-48-cedar-4-1203', 'owned', 2),
    ).toThrow('insufficient');
    expect(() =>
      forestResolveReference(
        w,
        required(w.actors[0]),
        'item:item-48-cedar-4-1203',
        'owned',
      ),
    ).toThrow();
  });
  it('does not penalize paid project work, new terrain followed by rest, or reward invented progress', () => {
    const w = v7Clone(initialLongWorld()),
      a = required(w.actors[0]);
    a.extensionState['open:routine'] = Array.from({ length: 160 }, () => true);
    w.tick = 200;
    w.events = [
      {
        id: 'fixture',
        tick: 200,
        actor: a.id,
        type: 'moved',
        interface: 'navigate',
        success: true,
        description: 'actual move',
        position: a.position,
        target: null,
        data: {},
      },
    ];
    expect(openRoutine(w, a)).toBeLessThan(0.025);
    w.tick = 201;
    required(w.events[0]).interface = 'rest';
    expect(openRoutine(w, a)).toBeLessThan(0.025);
    w.tick = 400;
    a.memory.intention = 'Claimed spectacular project';
    a.extensionState['open:routine'] = Array.from({ length: 160 }, () => true);
    expect(openRoutine(w, a)).toBeCloseTo(0.025);
  });
  it('keeps fresh registries isolated after old generated installation and rejects absent skills without material changes', () => {
    const old = JSON.parse(
      readFileSync('experiment/ex10/execution.json', 'utf8'),
    ) as V7Execution;
    const restored = v7Clone(old.world);
    expect(restored.abilities.length).toBeGreaterThan(14);
    const fresh = initialLongWorld('separate-B'),
      before = JSON.stringify(fresh.stacks),
      id = required(restored.abilities.find((a) => !a.authored)).id;
    const result = v7Step(
      fresh,
      {
        lin: { interface: id, args: {} },
        moss: { interface: 'wait', args: {} },
        sol: { interface: 'wait', args: {} },
      },
      continuousRegistry(fresh),
    );
    expect(result.outcomes.lin?.success).toBe(false);
    expect(JSON.stringify(fresh.stacks)).toBe(before);
    expect(
      longRetrieve(fresh, 'lin', 'ordinary', [{ ...query, ids: [id] }])[0],
    ).toMatchObject({ total: 0 });
  });
});

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error('Required fixture or audit value is absent.');
  return value;
}
