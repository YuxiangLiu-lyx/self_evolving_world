import { expect, it } from 'vitest';
import {
  EXPRESSION_INTERFACES,
  EXPRESSION_REVISION,
  continuousRegistry,
  expressionPersonal,
  expressionSaveMemory,
  v7AssertWorld,
  v7Clone,
  v7Distance,
  v7Obstacles,
  v7ParsePlan,
  v7SegmentClear,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Plan,
  V7World,
} from '@self-evolving-world/world-core';
import {
  longOrdinaryInput,
  longRetrieve,
  longWorldInput,
} from '../src/long-context.js';
import {
  CULTURE_CENTER,
  CULTURE_EXCLUDED_WORDS,
  CULTURE_OPTIONS,
  CULTURE_SLACK,
  CULTURE_TENDENCIES,
  LONG_CULTURE,
} from '../src/long-culture.js';
import {
  longRequest,
  PLAN_HORIZON_GUIDANCE,
  VOICE_ORDINARY,
  VOICE_REPLACEMENTS,
} from '../src/long-request.js';
import {
  initialLongWorld,
  LONG_CULTURE_INCENTIVES_OBJECTIVE,
  LONG_CULTURE_OBJECTIVE,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';
import {
  continueContinuousExecution,
  newContinuousExecution,
} from '../src/continuous-run.js';
import type { V7Execution, V7Sink } from '../src/continuous-run.js';
import { longTokenCeiling } from '../src/long-tokens.js';
import { openPreflight } from '../../../scripts/open-preflight.js';

const BANNED = CULTURE_EXCLUDED_WORDS;
const policy = (world: V7World) => {
  const p = world.config.longDevelopment;
  if (!p) throw new Error('Missing long policy');
  return p;
};
const WAIT: V7Action = { interface: 'wait', args: {} };
function step(world: V7World, actions: Record<string, V7Action>) {
  const result = v7Step(
    world,
    Object.fromEntries(world.actors.map((a) => [a.id, actions[a.id] ?? WAIT])),
    continuousRegistry(world),
  );
  if (result.paused) throw new Error(result.paused);
  return result;
}
const plan = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    intention: 'Fixture only',
    steps: [{ action: WAIT, repeat: 1, until: null, guard: null }],
    repeat: 1,
    until: null,
    interrupts: [],
    notes: [],
    preferences: [],
    ...extra,
  });

it('freezes both culture scenarios on the ex13 rules and seed with their own budget mechanics', () => {
  for (const [scenario, objective, incentives] of [
    ['long-culture', LONG_CULTURE_OBJECTIVE, false],
    ['long-culture-incentives', LONG_CULTURE_INCENTIVES_OBJECTIVE, true],
  ] as const) {
    const world = initialLongWorld('long-ex15', scenario);
    const p = policy(world);
    expect(p).toMatchObject({
      scenario: incentives ? 'culture-incentives' : 'culture',
      exactRecordWidth: 4000,
      guidance: ['plan-horizon', 'general-capabilities'],
      tokens: incentives ? 4_000_000 : 10_000_000,
      tokenCeilings: [{ through: 80, tokens: 3_200_000 }],
      checkpoints: incentives ? [80, 120] : [80, 150, 250],
      culture: { ...CULTURE_OPTIONS, incentives },
    });
    expect(world.config.seed).toBe(20261123);
    expect(world.config.budgets).toEqual({
      ordinary: 1800,
      world: 300,
      development: incentives ? 16 : 40,
    });
    expect(p.transportRecovery).toBe('uncounted');
    expect(world.config.experience?.targetRounds).toBe(incentives ? 120 : 80);
    expect(world.actors).toHaveLength(6);
    expect(longScenario(p)).toBe(scenario);
    expect(longObjective(p)).toBe(objective);
    expect(world.revisions).toContain(EXPRESSION_REVISION);
    expect(
      newContinuousExecution('fixture', 'isolated-fixture', world).windowTarget,
    ).toBe(incentives ? 120 : 80);
    // The two variants differ only in the incentive switch, its rules and the frozen limits.
    const other = initialLongWorld(
      'long-ex15',
      incentives ? 'long-culture' : 'long-culture-incentives',
    );
    const strip = (w: V7World) => {
      const c = v7Clone(w);
      const q = policy(c);
      delete q.scenario;
      if (q.culture) q.culture.incentives = false;
      q.tokens = 0;
      q.checkpoints = [];
      c.config.budgets.development = 0;
      if (c.config.experience) c.config.experience.targetRounds = 0;
      c.satisfaction = c.satisfaction.filter((r) => !r.derived);
      c.eventTypes = (c.eventTypes ?? []).filter(
        (e) => !['acknowledged', 'reciprocated', 'work-noticed'].includes(e),
      );
      return c;
    };
    expect(strip(world)).toEqual(strip(other));
  }
});

it('recovers the long-fixes genesis when the culture fields are reverted, except for the documented people and food', () => {
  const culture = initialLongWorld('long-ex15', 'long-culture');
  const fixes = initialLongWorld('long-ex15', 'long-fixes');
  const reverted = v7Clone(culture);
  const p = policy(reverted),
    f = policy(fixes);
  delete p.culture;
  delete p.tokenCeilings;
  delete p.transportRecovery;
  p.scenario = 'fixes';
  p.tokens = f.tokens;
  p.checkpoints = [...f.checkpoints];
  p.pressureStart = f.pressureStart;
  p.difficultyStart = f.difficultyStart;
  p.growthFloor = f.growthFloor;
  reverted.config.budgets.development = fixes.config.budgets.development;
  reverted.config.budgets.world = fixes.config.budgets.world;
  if (!reverted.config.experience || !reverted.config.development)
    throw new Error('Missing policy');
  reverted.config.experience.targetRounds =
    fixes.config.experience?.targetRounds ?? 0;
  reverted.config.development.baseline =
    reverted.config.development.baseline.filter(
      (id) => !EXPRESSION_INTERFACES.includes(id),
    );
  expect(reverted.state.foodWater).toBe(1);
  delete reverted.state.foodWater;
  expect(reverted.config).toEqual(fixes.config);
  // Same rules, terrain, resources and authored world; only the symbolic package,
  // the renewable commons food and the people differ.
  expect(reverted.terrain).toEqual(fixes.terrain);
  expect(reverted.resources).toEqual(fixes.resources);
  expect(reverted.processes).toEqual(fixes.processes);
  expect(reverted.stacks).toEqual(fixes.stacks);
  expect(reverted.state).toEqual(fixes.state);
  expect(reverted.satisfaction).toEqual(fixes.satisfaction);
  expect(
    reverted.abilities.filter((a) => a.revision !== EXPRESSION_REVISION),
  ).toEqual(fixes.abilities);
  expect(reverted.revisions.filter((r) => r !== EXPRESSION_REVISION)).toEqual(
    fixes.revisions,
  );
  expect(reverted.objects.filter((o) => !o.id.startsWith('commons-'))).toEqual(
    fixes.objects,
  );
  expect(
    reverted.objects.filter((o) => o.id.startsWith('commons-')),
  ).toHaveLength(24);
  // The ex13 people keep their identities, bodies, vitals and experience.
  for (const actor of fixes.actors) {
    const same = reverted.actors.find((a) => a.id === actor.id);
    if (!same) throw new Error('Missing ex13 actor');
    expect({
      ...same,
      position: null,
      life: null,
      memory: null,
      mastered: null,
      extensionState: null,
    }).toEqual({
      ...actor,
      position: null,
      life: null,
      memory: null,
      mastered: null,
      extensionState: null,
    });
  }
});

it('keeps every word ordinary agents can see free of the excluded vocabulary, at round 0 and after symbolic actions', () => {
  // The scanner itself finds the word where the World Agent policy keeps it.
  expect(
    longRequest(
      'fixture',
      longWorldInput(initialLongWorld('long-ex15', 'long-culture'), {}),
    ).instructions,
  ).toMatch(BANNED);
  for (const scenario of ['long-culture', 'long-culture-incentives'] as const) {
    let world = initialLongWorld('long-ex15', scenario);
    const visible = (w: V7World) => {
      for (const actor of w.actors) {
        const input = longOrdinaryInput(w, actor.id);
        const request = longRequest('fixture', input);
        expect(request.instructions).not.toMatch(BANNED);
        expect(JSON.stringify(request)).not.toMatch(BANNED);
        const retrieved = longRetrieve(w, actor.id, 'ordinary', [
          {
            section: 'abilities',
            search: '',
            ids: w.abilities.map((a) => a.id).slice(0, 4),
            offset: 0,
            part: 0,
          },
          { section: 'state', search: '', ids: [], offset: 0, part: 0 },
          { section: 'memory', search: '', ids: [], offset: 0, part: 0 },
          {
            section: 'observed',
            search: '',
            ids: w.objects.map((o) => o.id),
            offset: 0,
            part: 0,
          },
        ]);
        expect(JSON.stringify(retrieved)).not.toMatch(BANNED);
      }
      // Every authored interface, event name and satisfaction name is queryable or shown.
      expect(JSON.stringify(w.abilities)).not.toMatch(BANNED);
      expect(JSON.stringify(w.eventTypes)).not.toMatch(BANNED);
      expect(
        JSON.stringify(w.satisfaction.map((r) => [r.id, r.name])),
      ).not.toMatch(BANNED);
    };
    visible(world);
    const rounds: Record<string, V7Action>[] = [
      {
        lin: {
          interface: 'tell',
          args: { text: 'Moss, the berries near here are ripe.' },
        },
        moss: {
          interface: 'name',
          args: { subject: '', text: 'Meeting stones' },
        },
        sol: {
          interface: 'mark',
          args: { subject: '', text: 'Sol rested here' },
        },
        kai: {
          interface: 'invite',
          args: { x: 14, y: 15, round: 4, text: 'Come and talk' },
        },
        ivo: {
          interface: 'message',
          args: {
            recipient: 'lin',
            text: 'Hello',
            urgency: 'ordinary',
            subject: 'greeting',
          },
        },
      },
      {
        moss: { interface: 'tell', args: { text: 'Lin, thank you.' } },
        lin: {
          interface: 'message',
          args: {
            recipient: 'ivo',
            text: 'Hello back',
            urgency: 'ordinary',
            subject: 'greeting',
          },
        },
      },
      {},
      {},
    ];
    for (const actions of rounds) {
      world = step(world, actions).world;
      visible(world);
    }
    expect(world.events.some((e) => e.type === 'attendance')).toBe(true);
  }
});

it('replaces only the suppressing phrases in the culture prompt and leaves the legacy prompt untouched', () => {
  const culture = initialLongWorld('long-ex15', 'long-culture');
  const fixes = initialLongWorld('long-ex15', 'long-fixes');
  const input = longOrdinaryInput(culture, 'lin');
  expect(input.longContext.voice).toBe(true);
  const text = longRequest('fixture', input).instructions;
  expect(text.startsWith(VOICE_ORDINARY)).toBe(true);
  expect(text.endsWith(PLAN_HORIZON_GUIDANCE)).toBe(true);
  expect(text).toContain(
    'never invent resources, completed progress or physical effects',
  );
  expect(text).toContain('form, share, revise or drop them freely');
  expect(text).not.toContain('label or mastery');
  const legacy = longRequest(
    'fixture',
    longOrdinaryInput(fixes, 'lin'),
  ).instructions;
  expect('voice' in longOrdinaryInput(fixes, 'lin').longContext).toBe(false);
  expect(legacy).toContain(
    'Never invent resources, completed progress or benefits.',
  );
  expect(legacy).toContain('label or mastery');
  for (const [from, to] of VOICE_REPLACEMENTS) {
    expect(legacy).toContain(from);
    expect(text).toContain(to);
  }
});

it('bounds and privately stores what a person cares about and how they see others', () => {
  const ok = expressionPersonal({
    cares: 'x'.repeat(300),
    views: Object.fromEntries(
      ['moss', 'sol', 'kai', 'wren', 'ivo'].map((p) => [p, 'y'.repeat(200)]),
    ),
  });
  expect(ok.cares).toHaveLength(300);
  expect(() => expressionPersonal({ cares: 'x'.repeat(301) })).toThrow('300');
  expect(() =>
    expressionPersonal({ views: { moss: 'y'.repeat(201) } }),
  ).toThrow('200');
  expect(() =>
    expressionPersonal({
      views: Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`p${String(i)}`, 'v']),
      ),
    }),
  ).toThrow('8 people');
  // Legacy plans reject the fields; the culture voice accepts them.
  const raw = JSON.parse(
    plan({ cares: 'Quiet mornings', views: { moss: 'Kind' } }),
  ) as unknown;
  expect(() => v7ParsePlan(raw, undefined, true)).toThrow(
    'registered task plan shape',
  );
  const parsed: V7Plan = v7ParsePlan(raw, undefined, true, true);
  expect(parsed).toMatchObject({
    cares: 'Quiet mornings',
    views: { moss: 'Kind' },
  });
  // At most eight people are kept, most recently updated last; an empty view forgets.
  const world = v7Clone(initialLongWorld('long-ex15', 'long-culture'));
  const lin = world.actors[0];
  if (!lin) throw new Error('Missing actor');
  for (let i = 0; i < 10; i++)
    expressionSaveMemory(
      lin,
      { views: { [`p${String(i)}`]: `view ${String(i)}` } },
      i,
    );
  expect(lin.memory.views?.map((v) => v.person)).toEqual([
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p7',
    'p8',
    'p9',
  ]);
  expressionSaveMemory(lin, { views: { p9: '' }, cares: 'Shared meals' }, 11);
  expect(lin.memory.views).toHaveLength(7);
  const own = longOrdinaryInput(world, 'lin').packet.memory as Record<
    string,
    unknown
  >;
  expect(own.cares).toBe('Shared meals');
  expect(JSON.stringify(own.views)).toContain('view 8');
  for (const other of world.actors.filter((a) => a.id !== 'lin'))
    expect(JSON.stringify(longOrdinaryInput(world, other.id))).not.toContain(
      'Shared meals',
    );
});

it('writes private memory through the plan output, rejects views of unknown people and applies it once', async () => {
  const world = initialLongWorld('long-ex15', 'long-culture');
  const state = newContinuousExecution('fixture', 'isolated-fixture', world);
  state.windowTarget = 1;
  const sink: V7Sink = {
    save: () => Promise.resolve(),
    call: () => Promise.resolve(),
    findCall: () => Promise.resolve(null),
    round: () => Promise.resolve(),
    checkpoint: () => Promise.resolve(),
  };
  let calls = 0;
  const done = await continueContinuousExecution(
    state,
    (_role, input) => {
      calls += 1;
      const actor = 'longContext' in input ? input.longContext.actor : '';
      const text =
        actor === 'lin' && calls === 1
          ? plan({ views: { nobody: 'Unknown' } })
          : plan(
              actor === 'lin'
                ? { cares: 'The clearing', views: { moss: 'Patient' } }
                : {},
            );
      return Promise.resolve({
        text: JSON.stringify({ queries: [], result_json: text }),
        responseId: 'fixture',
        usage: { inputTokens: 100, outputTokens: 10 },
        http: { status: 200, requestId: null, contentType: 'application/json' },
        evidence: 'isolated fixture',
      });
    },
    sink,
  );
  expect(done.world.tick).toBe(1);
  expect(done.attempts[0]?.status).toBe('rejected');
  expect(done.attempts[0]?.error).toContain('other people');
  const lin = done.world.actors.find((a) => a.id === 'lin');
  expect(lin?.memory.cares).toBe('The clearing');
  expect(lin?.memory.views).toEqual([
    { person: 'moss', view: 'Patient', updatedAt: 0 },
  ]);
});

it('spreads tendencies and leanings, renames the closeness key and differentiates knowledge and mastery', () => {
  const world = initialLongWorld('long-ex15', 'long-culture');
  const tendencies = world.actors.map(
    (a) =>
      a.extensionState['long:tendencies'] as Record<string, number | string>,
  );
  for (const key of [
    'curiosity',
    'riskTolerance',
    'closeness',
    'comfortPreference',
  ]) {
    const values = tendencies.map((t) => Number(t[key]));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(
      0.45,
    );
  }
  expect(tendencies.every((t) => !('socialNeed' in t))).toBe(true);
  const leanings = tendencies.map((t) => t.leaning);
  expect(new Set(leanings).size).toBe(6);
  expect(
    leanings.every((l) => typeof l === 'string' && /^[a-z]+$/.test(l)),
  ).toBe(true);
  expect(tendencies).toEqual(CULTURE_TENDENCIES);
  const known = world.actors.map((a) =>
    Object.keys(a.memory.discoveries ?? {})
      .sort()
      .join(),
  );
  expect(new Set(known).size).toBeGreaterThan(1);
  expect(known.every((k) => k.length > 0)).toBe(true);
  const mastery = world.actors.map((a) => [...a.mastered].sort().join());
  expect(new Set(mastery).size).toBeGreaterThan(1);
  // Everyone keeps the survival and expression baseline; a missing interface is shown as unmastered.
  for (const actor of world.actors) {
    for (const id of [
      'navigate',
      'gather',
      'eat',
      'rest',
      'learn',
      ...EXPRESSION_INTERFACES,
    ])
      expect(actor.mastered).toContain(id);
  }
  const moss = longOrdinaryInput(world, 'moss').packet.abilities as {
    baseline: { id: string; mastered?: boolean }[];
  };
  expect(moss.baseline.find((b) => b.id === 'probe')?.mastered).toBe(false);
  expect(moss.baseline.find((b) => b.id === 'gather')).not.toHaveProperty(
    'mastered',
  );
});

it('starts six people on nearby collision-free spots that see each other', () => {
  const world = initialLongWorld('long-ex15', 'long-culture');
  v7AssertWorld(world, continuousRegistry(world));
  expect(world.actors.map((a) => a.id)).toEqual([
    'lin',
    'moss',
    'sol',
    'kai',
    'wren',
    'ivo',
  ]);
  for (const a of world.actors) {
    expect(v7Distance(a.position, CULTURE_CENTER)).toBeLessThan(3);
    expect(a.life?.spawn).toEqual(a.position);
    expect(
      v7SegmentClear(a.position, a.position, a.radius, v7Obstacles(world)),
    ).toBe(true);
    for (const b of world.actors.filter((b) => b.id !== a.id))
      expect(v7Distance(a.position, b.position)).toBeGreaterThan(
        a.radius + b.radius,
      );
    expect(
      (
        longOrdinaryInput(world, a.id).packet.observation as {
          actors: unknown[];
        }
      ).actors.length,
    ).toBeGreaterThanOrEqual(3);
  }
  // Everyone walking to the same clearing resolves collisions without breaking the world.
  let w = world;
  for (let i = 0; i < 3; i++)
    w = step(
      w,
      Object.fromEntries(
        w.actors.map((a) => [
          a.id,
          { interface: 'navigate', args: { target: '', ...CULTURE_CENTER } },
        ]),
      ),
    ).world;
  v7AssertWorld(w, continuousRegistry(w));
});

it('eases survival: later pressure, a higher growth floor and renewable food near every start', () => {
  const world = initialLongWorld('long-ex15', 'long-culture');
  const fixes = initialLongWorld('long-ex15', 'long-fixes');
  expect(policy(world)).toMatchObject({
    pressureStart: CULTURE_SLACK.pressureStart,
    difficultyStart: CULTURE_SLACK.difficultyStart,
    growthFloor: CULTURE_SLACK.growthFloor,
  });
  expect(policy(world).pressureStart).toBeGreaterThan(
    policy(fixes).pressureStart,
  );
  expect(policy(world).growthFloor).toBeGreaterThan(policy(fixes).growthFloor);
  for (const a of world.actors) {
    const near = world.objects.filter(
      (o) =>
        o.id.startsWith('commons-') && v7Distance(a.position, o.spatial) < 4,
    );
    expect(near.map((o) => o.data.resource)).toEqual(
      expect.arrayContaining(['berry', 'root']),
    );
  }
  // The full 1600-round preflight is recorded in the plan; the first window is checked here.
  const result = openPreflight(LONG_CULTURE.gate, world);
  expect(
    Object.values(result.final).every((f) => (f.lives?.deaths ?? 0) === 0),
  ).toBe(true);
  expect(result.optionalShare).toBeGreaterThan(0.5);
}, 120_000);

it('pauses before the round-80 token ceiling and continues under the full ledger afterwards', async () => {
  const world = initialLongWorld('long-ex15', 'long-culture');
  const sink: V7Sink = {
    save: () => Promise.resolve(),
    call: () => Promise.resolve(),
    findCall: () => Promise.resolve(null),
    round: () => Promise.resolve(),
    checkpoint: () => Promise.resolve(),
  };
  const used = (state: V7Execution, tokens: number) => {
    state.attempts.push({
      id: 'ordinary-1',
      role: 'ordinary',
      actor: 'lin',
      tick: 0,
      reason: 'fixture charge',
      status: 'accepted',
      startedAt: '2026-01-01T00:00:00.000Z',
      elapsedMs: 0,
      usage: { inputTokens: tokens, outputTokens: 0 },
      error: null,
    });
  };
  const provider = () =>
    Promise.resolve({
      text: JSON.stringify({ queries: [], result_json: plan() }),
      responseId: 'fixture',
      usage: { inputTokens: 100, outputTokens: 10 },
      http: { status: 200, requestId: null, contentType: 'application/json' },
      evidence: 'isolated fixture',
    });
  const early = newContinuousExecution('fixture', 'isolated-fixture', world);
  used(early, 3_195_000);
  expect(longTokenCeiling(early)).toEqual({ through: 80, tokens: 3_200_000 });
  const paused = await continueContinuousExecution(early, provider, sink);
  expect(paused.phase).toBe('paused');
  expect(paused.reason).toContain('token ceiling of 3200000 before round 80');
  expect(paused.attempts).toHaveLength(1);
  // From round 80 the same frozen configuration only has the 10M ledger.
  const later = newContinuousExecution('fixture', 'isolated-fixture', world);
  later.world = v7Clone(world);
  later.world.tick = 80;
  later.windowTarget = 81;
  used(later, 3_500_000);
  expect(longTokenCeiling(later)).toBeNull();
  const continued = await continueContinuousExecution(later, provider, sink);
  expect(continued.phase).toBe('window-complete');
  expect(continued.world.tick).toBe(81);
  expect(continued.attempts).toHaveLength(7);
  expect(continued.world.config).toEqual(world.config);
});
