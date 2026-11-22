import { describe, expect, it } from 'vitest';
import {
  collectiveGroups,
  collectiveShared,
  collectiveSettle,
  collectiveExperienceScale,
  collectiveAfterRound,
  continuousRegistry,
  v7Clone,
  v7Step as kernelStep,
  v7Install,
  v7Registry,
  v7Cursor,
  v7Signature,
  v7Json,
  v7Distance,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Package,
  V7Plan,
} from '@self-evolving-world/world-core';
import {
  initialCollectiveWorld,
  COLLECTIVE_BASELINE,
} from '../src/collective-scenario.js';
import { collectiveInput } from '../src/collective-input.js';
import { worldContinuousInput } from '../src/continuous-input.js';
import {
  collectiveDecisions,
  collectiveTokenBudget,
  collectivePhaseUsed,
  collectiveLimit,
  collectiveAttention,
} from '../src/collective-controller.js';
import {
  newContinuousExecution,
  continueContinuousExecution,
  extendContinuousWindow,
} from '../src/continuous-run.js';
import type {
  V7CallRecord,
  V7Execution,
  V7RoundRecord,
  V7Sink,
} from '../src/continuous-run.js';
import {
  continuousRequest,
  V7TransportError,
} from '../src/continuous-provider.js';
import type { V7Provider } from '../src/continuous-provider.js';
import {
  reconstructContinuousSegment,
  continuousHash,
} from '../../../scripts/continuous-store.js';

const v7Step: typeof kernelStep = (world, actions, ...rest) =>
  kernelStep(
    world,
    {
      ...Object.fromEntries(
        world.actors
          .filter((a) => a.vitals.health > 0)
          .map((a) => [a.id, { interface: 'wait', args: {} }]),
      ),
      ...actions,
    },
    ...rest,
  );
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error('Missing fixture value.');
  return value;
}
const genesis = (arm: 'A' | 'B' = 'B') =>
  initialCollectiveWorld(`collective-test-${arm}`, arm);
// Narrow transactional fixtures retain three real identities; population/fairness tests use all eighteen.
function focusedWorld(arm: 'A' | 'B' = 'B') {
  const w = v7Clone(genesis(arm));
  w.actors = w.actors.filter((a) =>
    ['ash-1', 'ash-2', 'birch-1'].includes(a.id),
  );
  w.state['collective:groups'] = v7Json(
    collectiveGroups(w)
      .map((g) => ({
        ...g,
        members: g.members.filter((id) => w.actors.some((a) => a.id === id)),
      }))
      .filter((g) => g.members.length),
  );
  w.objects = w.objects.filter((o) =>
    w.actors.some((a) => v7Distance(a.position, o.spatial) < 10),
  );
  return w;
}
const waitPlan = (rounds = 30): V7Plan => ({
  intention: 'Retain this fixture intention.',
  steps: [
    {
      action: { interface: 'wait', args: {} },
      repeat: rounds,
      until: null,
      guard: null,
    },
  ],
  repeat: 1,
  until: null,
  interrupts: [],
  notes: [],
  preferences: [],
  projects: [],
});
const wirePlan = (plan: V7Plan) => ({
  ...plan,
  steps: plan.steps.map((s) => ({
    ...s,
    action: {
      interface: s.action.interface,
      args_json: JSON.stringify(s.action.args),
    },
  })),
});
const council = (
  mode: 'read' | 'report' | 'respond',
  text = 'Actual observation report.',
): V7Action => ({
  interface: 'council',
  args: { mode, text, proposal: '', response: 'accept' },
});
function storage() {
  let saved: V7Execution | undefined;
  const calls = new Map<string, V7CallRecord>(),
    rounds: V7RoundRecord[] = [];
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
    checkpoint: () => Promise.resolve(),
  };
  return { sink, calls, rounds, read: () => saved };
}
const provider: V7Provider = (_role, input) => {
  if (!('collective' in input)) throw new Error('Unexpected fixture review.');
  return Promise.resolve({
    text: JSON.stringify({
      assignments: input.collective.eligible.map((member) => ({
        member,
        intent: {
          goal: 'Retain the fixture intention.',
          reason: 'Test personal persistence.',
          progress: 'No accomplishment claimed.',
          next: 'Continue the selected fixture task.',
          pause: 'An actual failure or emergency.',
        },
        plan: wirePlan(waitPlan()),
      })),
    }),
    responseId: 'isolated-fixture',
    usage: { inputTokens: 20, outputTokens: 30 },
    http: { status: 200, requestId: null, contentType: 'application/json' },
    evidence: 'No real model invocation; isolated fixture.',
  });
};
describe('collective life information and physical boundaries', () => {
  it('creates equal physical A/B baselines and eighteen independent members with no inherited skills', () => {
    const a = genesis('A'),
      b = genesis('B');
    expect(a.actors).toHaveLength(18);
    expect(collectiveGroups(b)).toHaveLength(3);
    expect(a.objects).toEqual(b.objects);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.actors.map((x) => [x.position, x.vitals])).toEqual(
      b.actors.map((x) => [x.position, x.vitals]),
    );
    expect(b.abilities.map((x) => x.id).sort()).toEqual(
      [...COLLECTIVE_BASELINE].sort(),
    );
    expect(b.actors.every((x) => x.mastered.length === 16 && !x.learning)).toBe(
      true,
    );
    expect(
      new Set(b.actors.map((x) => x.collective?.tendencies.curiosity)).size,
    ).toBeGreaterThan(3);
    expect(
      collectiveExperienceScale(required(b.actors[0]), 'information-confirmed'),
    ).not.toBe(
      collectiveExperienceScale(required(b.actors[1]), 'information-confirmed'),
    );
  });
  it('constructs private and public contexts without reading another member private facts', () => {
    const w = v7Clone(genesis()),
      input = collectiveInput(w, 'ash', ['ash-1'], {}, 'individual', 120),
      publicInput = collectiveInput(w, 'ash', [], {}, 'coordination', 120);
    required(w.actors[1]).memory.notes = ['PRIVATE SENTINEL'];
    required(w.actors[1]).memory.knowledge = {
      private: {
        key: 'private',
        subject: 'secret',
        property: 'private fact',
        value: 'PRIVATE SENTINEL',
        method: 'fixture',
        condition: 'private',
        evidence: 'fixture',
        tick: 0,
        verified: true,
      },
    };
    required(w.actors[1]).vitals.satiety = 1;
    expect(collectiveInput(w, 'ash', ['ash-1'], {}, 'individual', 120)).toEqual(
      input,
    );
    expect(collectiveInput(w, 'ash', [], {}, 'coordination', 120)).toEqual(
      publicInput,
    );
    expect(
      JSON.stringify(
        collectiveInput(w, 'ash', ['ash-1'], {}, 'shared-control', 120),
      ),
    ).toContain('PRIVATE SENTINEL');
  });
  it('keeps unseen current-world skills and large private histories out of another member packet', () => {
    const w = v7Clone(genesis());
    const original = collectiveInput(
      w,
      'ash',
      ['ash-1'],
      {},
      'individual',
      120,
    );
    const template = required(w.abilities[0]);
    for (let i = 0; i < 1000; i++) {
      w.abilities.push({
        ...template,
        id: `unseen-${String(i)}`,
        function: 'UNSEEN PRIVATE CAPABILITY',
        authored: false,
      });
      w.eventTypes?.push(`unseen-event-${String(i)}`);
      required(w.actors[1]).memory.notes.push(
        'UNSEEN PRIVATE HISTORY'.repeat(100),
      );
    }
    expect(collectiveInput(w, 'ash', ['ash-1'], {}, 'individual', 120)).toEqual(
      original,
    );
    expect(JSON.stringify(original).length).toBeLessThan(
      required(w.config.collective).contextCharacters,
    );
  });
  it('requires a real report, local read and personal response without changing plans or granting mastery', () => {
    let w = v7Clone(focusedWorld());
    required(w.actors[0]).position = { x: 9, y: 10 };
    required(w.actors[1]).position = { x: 10, y: 10 };
    required(w.actors[0]).memory.knowledge = {
      observation: {
        key: 'observation',
        subject: 'actual sample',
        property: 'strength',
        value: 0.5,
        method: 'fixture trial',
        condition: 'load',
        evidence: 'fixture-evidence',
        tick: 0,
        verified: true,
      },
    };
    expect(collectiveShared(w, 'ash').reports).toHaveLength(0);
    w = v7Clone(
      v7Step(w, { 'ash-1': council('report') }, continuousRegistry(w)).world,
    );
    expect(collectiveShared(w, 'ash').reports).toHaveLength(1);
    expect(required(w.actors[1]).memory.knowledge?.observation).toBeUndefined();
    w = v7Clone(
      collectiveSettle(w, [
        {
          group: 'ash',
          tick: 0,
          summary: 'A voluntary proposal.',
          proposals: [
            {
              id: 'proposal',
              member: 'ash-2',
              goal: 'Discuss the finding.',
              reason: 'A reported uncertainty.',
              next: 'Choose whether to participate.',
              pause: 'Personal needs take priority.',
            },
          ],
        },
      ]),
    );
    w = v7Clone(
      v7Step(w, { 'ash-2': council('read') }, continuousRegistry(w)).world,
    );
    expect(required(w.actors[1]).memory.knowledge?.observation?.verified).toBe(
      false,
    );
    expect(
      JSON.stringify(
        collectiveInput(w, 'ash', ['ash-2'], {}, 'individual', 120),
      ),
    ).toContain('Choose whether to participate.');
    const response = council(
      'respond',
      'I decline while maintaining my own intention.',
    );
    response.args.proposal = 'proposal';
    response.args.response = 'decline';
    const prior = required(w.actors[1]).mastered;
    w = v7Clone(v7Step(w, { 'ash-2': response }, continuousRegistry(w)).world);
    expect(
      required(w.actors[1]).collective?.commitments.proposal?.response,
    ).toBe('decline');
    expect(required(w.actors[1]).mastered).toEqual(prior);
    required(w.actors[1]).position = { x: 40, y: 10 };
    expect(
      v7Step(w, { 'ash-2': council('read') }, continuousRegistry(w)).outcomes[
        'ash-2'
      ]?.success,
    ).toBe(false);
  });
  it('isolates generated skills across arms, requires actual knowledge before study and restores the original scope', () => {
    const a = focusedWorld('A'),
      b = focusedWorld('B');
    const fixture: V7Package = {
      id: 'fixture-collective',
      version: 1,
      scope: required(a.config.development).scope,
      dependencies: ['foundation-collective@1'],
      description: 'Isolated skill fixture, never in formal contexts.',
      resources: [],
      satisfaction: [],
      processes: {},
      visualComponents: [],
      abilities: [
        {
          id: 'fixture-action',
          name: 'Fixture action',
          function: 'Exercise scope and personal study.',
          equivalence: 'fixture:only',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          prerequisites: [],
          learning: 2,
          costs: 'Two study rounds.',
          effects: 'Fixture event only.',
          handler: 'fixture.action',
          revision: 'fixture-collective@1',
          authored: false,
          references: {},
          execution: {
            duration: 1,
            interruption: 'cancel',
            progress: 'One fixture execution.',
          },
        },
      ],
      handlers: { 'fixture.action': () => ({ complete: true, writes: [] }) },
    };
    const registry = v7Registry([...continuousRegistry(a).packages, fixture]);
    let installed = v7Clone(v7Install(a, registry, 'fixture-collective@1'));
    expect(() => v7Install(b, registry, 'fixture-collective@1')).toThrow(
      /scope/,
    );
    expect(
      JSON.stringify(
        collectiveInput(b, 'ash', ['ash-1'], {}, 'individual', 120),
      ),
    ).not.toContain('fixture-action');
    expect(
      v7Step(
        installed,
        {
          'ash-2': { interface: 'learn', args: { ability: 'fixture-action' } },
        },
        registry,
      ).outcomes['ash-2']?.success,
    ).toBe(false);
    required(installed.actors[0]).position = { x: 9, y: 10 };
    installed = v7Clone(
      v7Step(
        installed,
        {
          'ash-1': {
            interface: 'consult',
            args: { kind: 'ability', subject: 'fixture-action' },
          },
        },
        registry,
      ).world,
    );
    installed = v7Clone(
      v7Step(
        installed,
        {
          'ash-1': { interface: 'learn', args: { ability: 'fixture-action' } },
        },
        registry,
      ).world,
    );
    expect(required(installed.actors[0]).mastered).not.toContain(
      'fixture-action',
    );
    const restored = v7Clone(installed);
    const result = v7Step(restored, {}, registry);
    expect(required(result.world.actors[0]).mastered).toContain(
      'fixture-action',
    );
    expect(required(result.world.actors[1]).mastered).not.toContain(
      'fixture-action',
    );
    expect(
      v7Step(
        result.world,
        { 'ash-1': { interface: 'fixture-action', args: {} } },
        registry,
      ).outcomes['ash-1']?.success,
    ).toBe(true);
    let teaching = v7Step(
      result.world,
      {
        'ash-1': {
          interface: 'teach',
          args: {
            mode: 'offer',
            participant: 'ash-2',
            ability: 'fixture-action',
          },
        },
      },
      registry,
    );
    expect(teaching.outcomes['ash-1']?.success).toBe(true);
    expect(
      required(teaching.world.actors[1]).collective?.knownAbilities,
    ).not.toContain('fixture-action');
    teaching = v7Step(
      teaching.world,
      {
        'ash-2': {
          interface: 'teach',
          args: {
            mode: 'accept',
            participant: 'ash-1',
            ability: 'fixture-action',
          },
        },
      },
      registry,
    );
    expect(teaching.outcomes['ash-2']?.success).toBe(true);
    expect(
      required(teaching.world.actors[1]).collective?.knownAbilities,
    ).toContain('fixture-action');
    expect(required(teaching.world.actors[1]).mastered).not.toContain(
      'fixture-action',
    );
    teaching = v7Step(
      teaching.world,
      { 'ash-2': { interface: 'learn', args: { ability: 'fixture-action' } } },
      registry,
    );
    expect(required(teaching.world.actors[1]).learning?.remaining).toBe(1);
    teaching = v7Step(v7Clone(teaching.world), {}, registry);
    expect(required(teaching.world.actors[1]).mastered).toContain(
      'fixture-action',
    );
  });
  it('does not double-charge contested resources and carries real outgoing messages without cancelling a plan', () => {
    const w = v7Clone(focusedWorld());
    required(w.actors[0]).position = { x: 9, y: 10 };
    required(w.actors[1]).position = { x: 10, y: 10 };
    const source = required(
      w.objects.find((x) => x.id === 'collective-ash-1-root'),
    );
    source.spatial.x = 9.5;
    source.spatial.y = 10.8;
    source.data.stock = 1;
    const action = {
      interface: 'gather',
      args: { target: source.id, quantity: 1 },
    };
    for (const id of ['ash-1', 'ash-2']) {
      const alone = v7Step(w, { [id]: action }, continuousRegistry(w));
      expect(alone.outcomes[id]?.success, alone.outcomes[id]?.reason).toBe(
        true,
      );
    }
    const result = v7Step(
      w,
      { 'ash-1': action, 'ash-2': action },
      continuousRegistry(w),
    );
    expect(result.outcomes['ash-1']?.success).toBe(false);
    expect(result.outcomes['ash-2']?.success).toBe(false);
    expect(result.outcomes['ash-1']?.reason).toContain('Simultaneous resource');
    expect(result.outcomes['ash-2']?.reason).toContain('Simultaneous resource');
    expect(
      result.world.stacks.filter((x) => x.resource === 'root'),
    ).toHaveLength(0);
    expect(
      Number(result.world.objects.find((x) => x.id === source.id)?.data.stock),
    ).toBe(1);
    const message = v7Step(
      w,
      {
        'ash-1': {
          interface: 'message',
          args: {
            recipient: 'ash-2',
            text: 'A real local message.',
            urgency: 'ordinary',
            subject: 'local finding',
          },
        },
      },
      continuousRegistry(w),
    );
    expect(
      required(message.world.actors[1]).collective?.received.at(-1)?.text,
    ).toBe('A real local message.');
    expect(required(message.world.actors[2]).collective?.received).toHaveLength(
      0,
    );
    const plan = waitPlan();
    const send: V7Action = {
      interface: 'message',
      args: {
        recipient: 'ash-2',
        text: 'The sender continues.',
        urgency: 'ordinary',
        subject: 'normal information',
      },
    };
    plan.steps.unshift({ action: send, repeat: 1, until: null, guard: null });
    const cursors = { 'ash-1': v7Cursor(plan, w.tick) };
    const sent = v7Step(w, { 'ash-1': send }, continuousRegistry(w), cursors);
    v7FinishTasks(w, sent, cursors);
    expect(cursors['ash-1'].reason).toBeNull();
    expect(cursors['ash-1'].step).toBe(1);
  });
});
describe('collective attention, budgets and replay', () => {
  it('deduplicates simultaneous review observations while retaining every applicant request and current function', () => {
    const w = genesis('A');
    const requests = Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        {
          interface: 'request',
          args: {
            function: `An unimplemented need of ${a.id}.`,
            conditions: 'Unknown method and costs.',
            effects: 'A measurable improvement.',
          },
        },
      ]),
    );
    const input = worldContinuousInput(w, requests);
    expect(input.applicants).toHaveLength(18);
    expect(input.applicants.map((a) => a.request)).toEqual(
      Object.values(requests).map((a) => a.args),
    );
    expect(JSON.stringify(input).length).toBeLessThan(
      required(w.config.collective).contextCharacters,
    );
    expect(new Set(input.sharedObservedObjects?.map((o) => o.id)).size).toBe(
      input.sharedObservedObjects?.length,
    );
    expect(JSON.stringify(input.catalogue)).toContain('council');
  });
  it('grounds risk and trust changes in injury and independently checked received evidence', () => {
    const before = focusedWorld(),
      after = v7Clone(before);
    const actor = required(after.actors[0]),
      old = required(before.actors[0]);
    old.memory.knowledge = {
      claim: {
        key: 'claim',
        subject: 'berry',
        property: 'nutrition',
        value: 4,
        method: 'received',
        condition: 'raw',
        evidence: 'actual report',
        tick: 0,
        verified: false,
        receivedFrom: 'ash-2',
      },
    };
    actor.memory.knowledge = v7Clone(old.memory.knowledge);
    required(actor.memory.knowledge.claim).verified = true;
    actor.vitals.health -= 5;
    after.tick = 1;
    after.events = [
      {
        id: 'verified-fixture',
        tick: 1,
        type: 'information-confirmed',
        interface: 'probe',
        actor: actor.id,
        target: null,
        position: actor.position,
        success: true,
        description: 'Isolated confirmed evidence.',
        data: { key: 'claim', qualified: true },
      },
    ];
    collectiveAfterRound(before, after);
    expect(required(actor.collective).tendencies.risk).toBeCloseTo(
      required(old.collective).tendencies.risk - 0.005,
    );
    expect(required(actor.collective).trust['ash-2']).toBe(0.05);
    const again = v7Clone(after);
    collectiveAfterRound(after, again);
    expect(required(required(again.actors[0]).collective).trust['ash-2']).toBe(
      0.05,
    );
  });
  it('serves waiting public reports without starving overdue or endangered members', () => {
    const w = v7Step(
      focusedWorld(),
      { 'ash-1': council('report') },
      continuousRegistry(focusedWorld()),
    ).world;
    const state = newContinuousExecution('fixture', 'isolated-fixture', w);
    state.world = v7Clone(w);
    state.world.tick = 10;
    expect(
      collectiveDecisions(state).find((d) => d.input.collective.group === 'ash')
        ?.input.collective.mode,
    ).toBe('coordination');
    const attention = collectiveAttention(state);
    attention.needsSince['ash-1'] = 3;
    expect(
      collectiveDecisions(state).find((d) => d.input.collective.group === 'ash')
        ?.input.collective.eligible,
    ).toEqual(['ash-1']);
    attention.needsSince['ash-1'] = 10;
    required(state.world.actors[1]).vitals.satiety = 1;
    expect(
      collectiveDecisions(state).find((d) => d.input.collective.group === 'ash')
        ?.input.collective.eligible,
    ).toEqual(['ash-2']);
    required(state.world.actors[1]).vitals.satiety = 80;
    attention.lastPublicAttempt.ash = 9;
    expect(
      collectiveDecisions(state).find((d) => d.input.collective.group === 'ash')
        ?.input.collective.mode,
    ).toBe('individual');
    expect(attention.lastCoordination.ash).toBeUndefined();
  });
  it('uses one slot per group, fairly serves all eighteen members and reconstructs preserved intentions', async () => {
    const initial = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      genesis(),
    );
    initial.windowTarget = 8;
    const db = storage(),
      result = await continueContinuousExecution(initial, provider, db.sink);
    expect(result.reason).toContain('Observation window');
    expect(result.attempts).toHaveLength(18);
    expect(
      result.world.actors.every(
        (a) =>
          a.collective?.intent?.goal === 'Retain the fixture intention.' &&
          a.collective.intent.pause === 'An actual failure or emergency.',
      ),
    ).toBe(true);
    expect(result.attention?.maximumWait).toBeLessThanOrEqual(5);
    expect(
      result.world.actors.every(
        (a) => a.memory.intention === 'Retain this fixture intention.',
      ),
    ).toBe(true);
    const frames = reconstructContinuousSegment({
      version: 7,
      start: 0,
      initial: initial.world,
      initialCursors: {},
      rounds: db.rounds.map((r) => ({
        ...r,
        before: continuousHash(r.before),
        after: continuousHash(r.after),
      })),
    });
    expect(v7Signature(frames.at(-1))).toBe(v7Signature(result.world));
    const next = v7Clone(result);
    next.phase = 'running';
    next.windowTarget = 10;
    const second = await continueContinuousExecution(next, provider, db.sink);
    expect(second.attempts).toHaveLength(18);
    expect(second.world.tick).toBe(10);
  }, 30000);
  it('recovers an accepted durable call without spending a second slot in the same group and round', async () => {
    const initial = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      focusedWorld(),
    );
    initial.windowTarget = 2;
    const db = storage();
    let interrupted = false;
    const broken: V7Sink = {
      ...db.sink,
      call: async (record) => {
        await db.sink.call(record);
        if (!interrupted) {
          interrupted = true;
          throw new Error(
            'Isolated process interruption after the immutable call journal.',
          );
        }
      },
    };
    await expect(
      continueContinuousExecution(initial, provider, broken),
    ).rejects.toThrow(/process interruption/);
    const pending = required(db.read());
    expect(pending.pendingCall).not.toBeNull();
    expect(pending.attention?.lastSlot.ash).toBe(0);
    pending.phase = 'running';
    pending.reason = null;
    const recovered = await continueContinuousExecution(
      pending,
      provider,
      db.sink,
    );
    expect(recovered.phase).toBe('window-complete');
    expect(
      recovered.attempts.filter(
        (a) => a.actor.startsWith('ash') && a.tick === 0,
      ),
    ).toHaveLength(1);
    expect(recovered.attempts.filter((a) => a.actor === 'ash-1')).toHaveLength(
      1,
    );
    expect(recovered.attempts).toHaveLength(3);
  });
  it('pauses all members before advancing an exhausted call or token boundary and reserves unknown failed usage', async () => {
    const initial = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      genesis(),
    );
    initial.windowTarget = 10;
    initial.world = v7Clone(initial.world);
    required(initial.world.config.collective).shortBudgets.ordinary = 1;
    const db = storage();
    const result = await continueContinuousExecution(
      initial,
      () => {
        throw new V7TransportError(
          'Fixture failure',
          'No external call occurred.',
        );
      },
      db.sink,
    );
    expect(result.world.tick).toBe(0);
    expect(result.phase).toBe('paused');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.usage).toBeNull();
    expect(collectiveTokenBudget(result)?.used).toBeGreaterThan(0);
    const token = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      genesis(),
    );
    token.world = v7Clone(token.world);
    required(token.world.config.collective).tokens.short = 1;
    const stopped = await continueContinuousExecution(
      token,
      provider,
      storage().sink,
    );
    expect(stopped.attempts).toHaveLength(0);
    expect(stopped.world.tick).toBe(0);
    expect(stopped.reason).toContain('token budget');
  });
  it('does not transfer unused short allocation or private data into the public context', () => {
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      genesis(),
    );
    state.world = v7Clone(state.world);
    state.world.tick = 200;
    state.windowTarget = 200;
    state.phase = 'window-complete';
    const extended = extendContinuousWindow(state, 1600);
    expect(collectiveLimit(extended, 'ordinary')).toBe(410);
    expect(collectivePhaseUsed(extended, 'ordinary')).toBe(0);
    const context = collectiveInput(
        state.world,
        'ash',
        [],
        {},
        'coordination',
        410,
      ),
      request = continuousRequest('gpt-6.1-sol', 'ordinary', context);
    expect(request.max_output_tokens).toBe(8192);
    expect(request.store).toBe(false);
    expect('previous_response_id' in request).toBe(false);
    expect(JSON.stringify(context)).not.toContain('vitals');
    expect(collectiveDecisions(state)).toHaveLength(3);
    state.cursors['ash-1'] = v7Cursor(waitPlan(), 200);
    expect(
      collectiveDecisions(state).find((x) => x.input.collective.group === 'ash')
        ?.input.collective.eligible,
    ).not.toContain('ash-1');
  });
  it('continues the actual budget-paused B checkpoint with separately reserved long counters', async () => {
    const initial = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      focusedWorld(),
    );
    initial.world = v7Clone(initial.world);
    initial.windowTarget = 200;
    required(initial.world.config.collective).shortBudgets.ordinary = 1;
    const db = storage();
    const paused = await continueContinuousExecution(
      initial,
      provider,
      db.sink,
    );
    expect(paused.phase).toBe('paused');
    expect(paused.world.tick).toBe(0);
    expect(paused.attempts).toHaveLength(1);
    const extended = extendContinuousWindow(paused, 1600);
    expect(extended.collectiveContinuation).toEqual({
      round: 0,
      attempts: 1,
      developments: 0,
    });
    expect(extended.world).toEqual(paused.world);
    expect(extended.cursors).toEqual(paused.cursors);
    expect(extended.attention).toEqual(paused.attention);
    expect(collectivePhaseUsed(extended, 'ordinary')).toBe(0);
    expect(collectiveTokenBudget(extended)?.used).toBe(0);
    expect(collectiveLimit(extended, 'ordinary')).toBe(529);
    expect(extended.attempts).toEqual(paused.attempts);
    const technical = v7Clone(paused);
    technical.reason = 'A technical failure.';
    expect(() => extendContinuousWindow(technical, 1600)).toThrow();
  });
});
