import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  EXPRESSION_LIMITS,
  openConditions,
  v7Clone,
  v7Distance,
  v7Observe,
  v7Record,
  v7Step,
  v7String,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { continuousRequest } from '../src/continuous-provider.js';
import { newContinuousExecution } from '../src/continuous-run.js';
import { longOrdinaryInput, longWorldInput } from '../src/long-context.js';
import {
  CULTURE_EXCLUDED_WORDS,
  CULTURE_TENDENCIES,
  CULTURE_V2_OPTIONS,
} from '../src/long-culture.js';
import {
  initialLongWorld,
  LONG_CULTURE_V2_VILLAGES_OBJECTIVE,
  LONG_SCENARIOS,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';
import {
  LONG_CULTURE_VILLAGES,
  MIDDLE_FOOD,
  VILLAGE_FOOD,
  VILLAGES,
  villagesMirror,
} from '../src/long-villages.js';

const SCOPE = 'long-ex99';
const v2 = initialLongWorld(SCOPE, 'long-culture-v2');
const villages = initialLongWorld(SCOPE, 'long-culture-v2-villages');
const policy = (world: V7World) => {
  const p = world.config.longDevelopment;
  if (!p) throw new Error('Missing long policy');
  return p;
};
const [west, east] = VILLAGES.groups.map((ids) =>
  villages.actors.filter((a) => ids.includes(a.id)),
) as [V7World['actors'], V7World['actors']];
const groupOf = (id: string) =>
  VILLAGES.groups.findIndex((ids) => ids.includes(id));

it('freezes the villages tag as the culture v2 genesis with its own window and budgets', () => {
  const p = policy(villages);
  const base = policy(v2);
  expect(p).toMatchObject({
    scenario: 'culture-v2-villages',
    tokens: 3_000_000,
    checkpoints: [100, 200],
    firstWindow: 100,
    culture: { ...CULTURE_V2_OPTIONS, incentives: false, goal: 'open' },
  });
  expect(villages.config.budgets).toEqual({
    ...v2.config.budgets,
    development: 16,
  });
  // The per-round computation budget is three times v2's for the map's three times the area.
  expect(villages.config.computation).toEqual({
    ...v2.config.computation,
    workPerRound: 3 * v2.config.computation.workPerRound,
  });
  expect(longScenario(p)).toBe('long-culture-v2-villages');
  expect(longObjective(p)).toBe(LONG_CULTURE_V2_VILLAGES_OBJECTIVE);
  expect(
    newContinuousExecution('fixture', 'isolated-fixture', villages)
      .windowTarget,
  ).toBe(LONG_CULTURE_VILLAGES.firstWindow);
  // Every other policy, experience, computation and rule field is culture v2.
  const strip = (w: V7World) => {
    const c = v7Clone(w);
    const q = policy(c);
    delete q.scenario;
    delete q.firstWindow;
    q.tokens = 0;
    q.checkpoints = [];
    c.config.budgets.development = 0;
    c.config.width = 0;
    c.config.computation.workPerRound = 0;
    if (c.config.development) c.config.development.hazards = [];
    return c.config;
  };
  expect(strip(villages)).toEqual(strip(v2));
  expect(villages.config.experience).toEqual(v2.config.experience);
  for (const field of [
    'abilities',
    'resources',
    'satisfaction',
    'revisions',
    'eventTypes',
    'state',
  ] as const)
    expect(villages[field]).toEqual(v2[field]);
  // The people keep their culture v2 identities, tendencies, knowledge and mastery.
  expect(villages.actors.map((a) => a.id)).toEqual(v2.actors.map((a) => a.id));
  villages.actors.forEach((a, i) => {
    const b = v2.actors[i];
    expect(a.extensionState).toEqual(b?.extensionState);
    expect(a.memory.discoveries).toEqual(b?.memory.discoveries);
    expect(a.mastered).toEqual(b?.mastered);
    expect(a.vitals).toEqual(b?.vitals);
    expect(a.extensionState['long:tendencies']).toEqual(CULTURE_TENDENCIES[i]);
  });
  expect(policy(v2).firstWindow).toBeUndefined();
  expect(base.checkpoints).toEqual([80, 150, 250]);
});

// Digests of every other tag's genesis at 0190cb5, before the villages existed.
const GENESIS_AT_0190CB5: Record<string, string> = {
  long: '4d7823247f624345192b10248c7c1106b56a22cd1920cf32b3b2ffacf671772d',
  'long-fixes':
    '9574ae2a9a826e7a604d5e8a53aa77e94d16728cb1ee5c6c3c3b31cf57c8a029',
  'long-culture':
    '94cb73351ee09629a7f8f666e75157cb7b03eb00a350e80e40d69537d5a5b2dd',
  'long-culture-incentives':
    '90ce6752cba7d6f134f7c8fc0e6729e97446fb6b13a32ad654995ad720cdec08',
  'long-culture-v2':
    '8eb3b2e717dd440f8846c9d2aee04f7a41ffa0289910d75a5c36a4295f37c517',
  'long-culture-v2-incentives':
    'be7f8458e22876ed578d94ade6f14ada6ace6c0cdb96ca568c518dc357dff7a6',
  'long-culture-v3':
    '35642c140b1a061d835b9358c9cb0da47778fe1c450ef6a8dc9c385b376274bf',
  'long-culture-v3-incentives':
    '3d5d4b7fce8a9ac9ca30ae44cb10f42db15746ef11a3a352daa748194a340ba1',
};
it('leaves every other genesis byte-identical, including the archived ex13-ex18 worlds', () => {
  const sha = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const scenario of LONG_SCENARIOS.filter(
    (s) => s !== 'long-culture-v2-villages',
  ))
    expect(sha(initialLongWorld(SCOPE, scenario))).toBe(
      GENESIS_AT_0190CB5[scenario],
    );
  for (const n of [13, 14, 15, 16, 17, 18]) {
    const archived = readFileSync(
      `experiment/ex${String(n)}/initial.json`,
      'utf8',
    );
    const world = JSON.parse(archived) as V7World;
    expect(
      JSON.stringify(
        initialLongWorld(`long-ex${String(n)}`, longScenario(policy(world))),
      ),
    ).toBe(JSON.stringify(world));
  }
});

it('builds two mirrored ex13 neighborhoods joined by a meadow that continues the ex13 terrain', () => {
  const { copy, width } = VILLAGES;
  expect([villages.config.width, villages.config.height]).toEqual([144, 36]);
  villages.terrain.forEach((row, y) => {
    const ex13 = v2.terrain[y] ?? '';
    expect(row).toHaveLength(width);
    expect(row.slice(0, copy)).toBe(ex13);
    expect(Array.from(row).reverse().join('')).toBe(row);
    // East of x = 31 the ex13 rule gives one column profile: rocky, grass, forest.
    expect(row.slice(copy, width - copy)).toBe(
      (ex13[copy - 1] ?? '').repeat(width - 2 * copy),
    );
  });
  // Every v2 object other than the clearing commons is the west copy, mirrored to the east.
  const v2Objects = v2.objects.filter((o) => !o.id.startsWith('commons-'));
  const westObjects = villages.objects.slice(0, v2Objects.length);
  const eastObjects = villages.objects.slice(
    v2Objects.length,
    2 * v2Objects.length,
  );
  const food = (o: V7World['objects'][number]) =>
    (v2.resources.find((r) => r.id === o.data.resource)?.nutrition ?? 0) > 0;
  westObjects.forEach((o, i) => {
    const old = v2Objects[i],
      mirror = eastObjects[i];
    if (!old || !mirror) throw new Error('Missing copy.');
    const { data, visual, ...rest } = o;
    const { data: oldData, visual: oldVisual, ...oldRest } = old;
    expect(rest).toEqual(oldRest);
    expect({ ...visual, state: null }).toEqual({ ...oldVisual, state: null });
    if (food(old)) {
      // Harvested ex13 food plants regrow ten times slower.
      expect(data).toEqual({
        ...oldData,
        stock: 0,
        interval: Number(old.data.interval) * VILLAGE_FOOD.plantSlowdown,
      });
      expect(visual.state).toBe(
        Number(old.data.interval) ? 'growing' : 'exhausted',
      );
    } else {
      expect(data).toEqual(oldData);
      expect(visual.state).toBe(oldVisual.state);
    }
    expect(mirror.spatial).toEqual({
      ...o.spatial,
      x: villagesMirror(o.spatial).x,
    });
    expect(mirror.kind).toBe(o.kind);
    expect(mirror.name).toBe(o.name);
    const ground = (p: { x: number; y: number }) =>
      villages.terrain[Math.floor(p.y)]?.[Math.floor(p.x)];
    if (o.spatial.x % 1) expect(ground(mirror.spatial)).toBe(ground(o.spatial));
    if (o.kind === 'animal')
      expect(mirror.data).toEqual({
        ...o.data,
        homeX: villagesMirror({ x: Number(o.data.homeX), y: 0 }).x,
        group: `${v7String(o.data.species, 'species')}-2`,
      });
    else expect(mirror.data).toEqual(o.data);
  });
  expect(villages.config.development?.hazards).toEqual([
    ...(v2.config.development?.hazards ?? []),
    ...(v2.config.development?.hazards ?? []).map((h) => ({
      ...h,
      id: h.id
        .replace('west-drought', 'east-drought')
        .replace(
          /waterlogging-(\d)/,
          (_, n: string) => `waterlogging-${String(Number(n) + 2)}`,
        ),
      x: width - h.x,
    })),
  ]);
});

const safe = (world: V7World, o: V7World['objects'][number]) => {
  const r = world.resources.find((x) => x.id === o.data.resource);
  return r && r.nutrition > 0 && r.toxicity === 0 ? r.nutrition : 0;
};
const zone = (x: number) =>
  x < VILLAGES.copy ? 0 : x > VILLAGES.width - VILLAGES.copy ? 1 : 2;

it('gives each village 264 nutrition of known food and the meadow centre 10,560 renewable', () => {
  const totals = [0, 0, 0];
  for (const o of villages.objects) {
    const z = zone(o.spatial.x);
    totals[z] =
      (totals[z] ?? 0) + safe(villages, o) * Number(o.data.stock ?? 0);
  }
  expect(totals).toEqual([264, 264, 10560]);
  // Three people drain 3 x 0.9 satiety per round, so 264 nutrition lasts about 98 rounds.
  expect(villages.config.hunger).toBe(0.9);
  expect(264 / (3 * villages.config.hunger)).toBeCloseTo(97.8, 1);
  for (const group of [west, east]) {
    const centre =
      group === west ? VILLAGES.center : villagesMirror(VILLAGES.center);
    const larder = villages.objects.filter(
      (o) =>
        o.id.startsWith('commons-') &&
        zone(o.spatial.x) === (group === west ? 0 : 1),
    );
    expect(larder.map((o) => o.data.resource).sort()).toEqual([
      'berry',
      'berry',
      'berry',
      'root',
      'root',
      'root',
    ]);
    for (const o of larder) {
      expect(v7Distance(o.spatial, centre)).toBeLessThan(4);
      expect(o.data).toMatchObject({
        stock: 4,
        capacity: 4,
        interval: o.data.resource === 'berry' ? 20 : 32,
      });
    }
  }
  const middle = villages.objects.filter((o) => o.id.startsWith('wild-'));
  expect(middle).toHaveLength(48);
  for (const o of middle) {
    expect(v7Distance(o.spatial, MIDDLE_FOOD.center)).toBeLessThan(12);
    const twin = middle.find(
      (x) =>
        x.spatial.y === o.spatial.y &&
        x.spatial.x === villagesMirror(o.spatial).x,
    );
    expect(twin?.data.resource).toBe(o.data.resource);
    expect(o.data).toMatchObject({
      stock: 20,
      capacity: 20,
      interval: o.data.resource === 'berry' ? 5 : 8,
    });
  }
  // Nobody knows the middle area at genesis.
  for (const a of villages.actors)
    expect(a.memory.objects.some((m) => m.object.id.startsWith('wild-'))).toBe(
      false,
    );
});

/** Paths at which two JSON values differ; arrays and objects are compared element-wise. */
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b) &&
    !Array.isArray(a)
  ) {
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) =>
      differences(x[k], y[k], path ? `${path}.${k}` : k),
    );
  }
  return [path];
}
function strings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      strings(v, out);
    }
  return out;
}
/** Words that no new agent-visible text may contain, nor any mention of the other group. */
const FORBIDDEN =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** Parts of the ordinary and World Agent inputs that show the world itself. */
const ORDINARY_WORLD = [
  'packet.state.position',
  'packet.state.life',
  'packet.environment',
  'packet.observation',
  'packet.memory.remembered',
  'packet.rules.bounds',
];
const WORLD_AGENT_WORLD = [
  'packet.applicants',
  'packet.rules.bounds',
  'packet.rules.fresh.hazards',
];
const worldDerived = (path: string, parts: string[]) =>
  parts.some((p) => path === p || path.startsWith(`${p}.`));

it('sends the culture v2 instructions and every non-world input field unchanged at round 0', () => {
  const ordinaryDiffs = new Set<string>();
  const v2Strings = new Set<string>(),
    newStrings = new Set<string>();
  for (const actor of v2.actors) {
    const before = longOrdinaryInput(v2, actor.id),
      after = longOrdinaryInput(villages, actor.id);
    const a = continuousRequest('model', 'ordinary', before),
      b = continuousRequest('model', 'ordinary', after);
    expect(b.instructions).toBe(a.instructions);
    expect(b.instructions).toContain(
      'Names, stories, views, values, explanations and impressions of other people are your own',
    );
    expect({ ...b, input: null }).toEqual({ ...a, input: null });
    const diffs = differences(before, after);
    for (const d of diffs) {
      expect(worldDerived(d, ORDINARY_WORLD), d).toBe(true);
      ordinaryDiffs.add(d.replace(/\.\d+(?=\.|$)/g, '.n'));
    }
    strings(before, v2Strings);
    strings(after, newStrings);
  }
  // The world-derived parts that actually differ at round 0 (docs/CULTURE_SCENARIO.md).
  expect([...ordinaryDiffs].sort()).toEqual([
    'packet.environment.local.ground',
    'packet.environment.temperature',
    'packet.observation.actors',
    'packet.observation.objects.records',
    'packet.observation.objects.total',
    'packet.observation.terrain',
    'packet.rules.bounds',
    'packet.state.life.spawn.x',
    'packet.state.life.spawn.y',
    'packet.state.position.x',
    'packet.state.position.y',
  ]);
  // World Agent: one request from each person, then all six together.
  const request: V7Action = {
    interface: 'request',
    args: {
      function: 'Carry several gathered items at once.',
      effect: 'Fewer trips between food and shelter.',
      conditions: 'Owned plant fibre.',
    },
  };
  const batches = [...v2.actors.map((a) => [a.id]), v2.actors.map((a) => a.id)];
  const worldDiffs = new Set<string>();
  for (const ids of batches) {
    const requests = Object.fromEntries(ids.map((id) => [id, request]));
    const before = longWorldInput(v2, requests),
      after = longWorldInput(villages, requests);
    const a = continuousRequest('model', 'world', before),
      b = continuousRequest('model', 'world', after);
    expect({ ...b, input: null }).toEqual({ ...a, input: null });
    for (const d of differences(before, after)) {
      expect(worldDerived(d, WORLD_AGENT_WORLD), d).toBe(true);
      worldDiffs.add(d);
    }
    // Applicants differ only in what they observe.
    const applicants = (input: typeof before) =>
      (input.packet.applicants as Record<string, unknown>[]).map((x) => ({
        ...x,
        observed: null,
      }));
    expect(applicants(after)).toEqual(applicants(before));
    strings(before, v2Strings);
    strings(after, newStrings);
  }
  expect([...worldDiffs].sort()).toEqual([
    'packet.applicants',
    'packet.rules.bounds',
    'packet.rules.fresh.hazards',
  ]);
  // New agent-visible text names no excluded word and nothing about other people far away.
  const added = [...newStrings].filter((s) => !v2Strings.has(s));
  expect(added.length).toBeGreaterThan(0);
  for (const text of added) {
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(MENTION);
  }
  // So does everything the wider world can later show: ids, names, labels and data.
  const v2Ids = new Set(v2.objects.map((o) => o.id));
  for (const o of villages.objects.filter((x) => !v2Ids.has(x.id)))
    for (const text of strings({
      id: o.id,
      name: o.name,
      kind: o.kind,
      visual: o.visual,
      data: o.data,
    })) {
      expect(text).not.toMatch(FORBIDDEN);
      expect(text).not.toMatch(MENTION);
    }
  for (const h of villages.config.development?.hazards ?? [])
    expect(h.id).not.toMatch(FORBIDDEN);
});

// ---- Separation during the first 60 rounds -------------------------------------------------

const ROUNDS = 60;
/** Respawn searches rings up to 3 units around the person's own start (forest-lives.ts). */
const RESPAWN_RING = 3;
/** Navigation moves at most speed x dt / travelFactor per round; travelFactor is
 * 1 + 0.6 x waterlogging with waterlogging >= 0 (open-physical.ts), so at most 0.8. */
const maxStep = villages.config.speed * villages.config.dt;
const signRadius = 0.06;

it('keeps the groups farther apart than any movement in 60 rounds plus the vision and hearing radius', () => {
  expect(maxStep).toBe(0.8);
  // Navigation is the only interface that moves a person; respawn is the only other move.
  const movers = villages.abilities.filter(
    (a) => a.handler === 'kernel.navigate',
  );
  expect(movers.map((a) => a.id)).toEqual(['navigate']);
  // Travel never speeds up: the factor is at least 1 everywhere, at every hazard's peak.
  for (const tick of [0, 300, 560, 1100, 1360])
    for (let y = 0.5; y < 36; y += 1)
      for (let x = 0.5; x < 144; x += 1)
        expect(
          openConditions({ ...villages, tick }, { x, y }).travelFactor,
        ).toBeGreaterThanOrEqual(1);
  const vision = villages.config.vision;
  expect(vision).toBe(5);
  expect(EXPRESSION_LIMITS.meetingRadius).toBeLessThan(vision);
  let minimum = Infinity;
  for (const a of west)
    for (const b of east)
      minimum = Math.min(minimum, v7Distance(a.position, b.position));
  const bound = 2 * ROUNDS * maxStep + vision;
  const strict = 2 * (ROUNDS * maxStep + RESPAWN_RING) + vision + signRadius;
  expect(bound).toBe(101);
  expect(strict).toBeCloseTo(107.06, 6);
  expect(minimum).toBeCloseTo(111.6, 6);
  expect(minimum - bound).toBeCloseTo(10.6, 6);
  expect(minimum).toBeGreaterThan(strict);
  // Within a group everyone sees the other two at round 0.
  for (const a of villages.actors)
    expect(
      v7Observe(villages, a.id)
        .actors.map((x) => x.id)
        .sort(),
    ).toEqual(
      (VILLAGES.groups[groupOf(a.id)] ?? []).filter((id) => id !== a.id).sort(),
    );
});

const move = (x: number, y: number): V7Action => ({
  interface: 'navigate',
  args: { target: '', x, y },
});
const wait: V7Action = { interface: 'wait', args: {} };

it('lets nobody see, hear or reach the other group while both rush towards each other for 60 rounds', () => {
  let world = v7Clone(villages);
  // Six simultaneous far searches that exhaust their bound (450,000 each) exceed the
  // 2,000,000 per-round budget and would pause the world; this check is about movement.
  world.config.computation.workPerRound = 20_000_000;
  const registry = continuousRegistry(world);
  const start = new Map(world.actors.map((a) => [a.id, { ...a.position }]));
  for (let tick = 0; tick < ROUNDS; tick++) {
    const actions: Record<string, V7Action> = {};
    for (const a of world.actors) {
      const target = groupOf(a.id) === 0 ? 140 : 4;
      actions[a.id] =
        a.vitals.energy >= 2
          ? move(target, a.position.y)
          : { interface: 'rest', args: {} };
    }
    // The front people also speak, mark the ground and invite listeners to their place.
    if (tick % 10 === 9) {
      actions.lin = { interface: 'tell', args: { text: 'Here.' } };
      actions.ivo = { interface: 'mark', args: { subject: '', text: 'Here.' } };
      actions.kai = {
        interface: 'invite',
        args: { x: 120, y: 15, round: tick + 20, text: 'Come.' },
      };
    }
    const result = v7Step(world, actions, registry);
    if (result.paused) throw new Error(result.paused);
    world = result.world;
    for (const a of world.actors) {
      const moved = v7Distance(a.position, start.get(a.id) ?? a.position);
      expect(moved).toBeLessThanOrEqual(world.tick * maxStep + 1e-6);
      const o = v7Observe(world, a.id);
      const mine = groupOf(a.id);
      expect(o.actors.every((x) => groupOf(x.id) === mine)).toBe(true);
      expect(
        o.objects
          .filter((x) => x.createdBy)
          .every((x) => groupOf(x.createdBy ?? '') === mine),
      ).toBe(true);
      expect(o.events.every((e) => !e.actor || groupOf(e.actor) === mine)).toBe(
        true,
      );
      expect(
        o.events.every(
          (e) =>
            typeof e.data.host !== 'string' || groupOf(e.data.host) === mine,
        ),
      ).toBe(true);
      const heard = a.extensionState['expression:heard'];
      expect(
        (Array.isArray(heard) ? heard : []).every(
          (h) => groupOf(String(v7Record(h).from)) === mine,
        ),
      ).toBe(true);
    }
  }
  // Someone was heard, so speech worked, but only within each group.
  expect(world.events.some((e) => e.type === 'heard')).toBe(true);
}, 120_000);

it('rejects messages, gifts and finding exchanges across the gap', () => {
  const world = v7Clone(villages);
  const registry = continuousRegistry(world);
  const result = v7Step(
    world,
    {
      lin: {
        interface: 'message',
        args: {
          recipient: 'ivo',
          text: 'Hello.',
          urgency: 'urgent',
          subject: 'hello',
        },
      },
      moss: {
        interface: 'exchange',
        args: { recipient: 'kai', finding: 'none', mode: 'offer' },
      },
      sol: wait,
      kai: wait,
      wren: wait,
      ivo: wait,
    },
    registry,
  );
  expect(result.outcomes.lin?.success).toBe(false);
  expect(result.outcomes.lin?.reason).toContain(
    'not a visible living other actor',
  );
  expect(result.outcomes.moss?.success).toBe(false);
  // No councils, incentives or shared bookkeeping exist in this scope.
  expect(world.config.collective).toBeUndefined();
  expect(policy(world).culture?.incentives).toBe(false);
});

it('notes the one remote channel: the attendance record of an invitation to a far place', () => {
  // `invite` accepts any dry meeting point in the world (culture v2 rules, unchanged). At the
  // meeting round an attendance event appears at that point and names the host, so a person
  // standing there sees it. The distance bound does not cover this channel.
  let world = v7Clone(villages);
  const registry = continuousRegistry(world);
  const ivo = world.actors.find((a) => a.id === 'ivo');
  if (!ivo) throw new Error('Missing person.');
  const actions = (lin: V7Action) =>
    Object.fromEntries(
      world.actors.map((a) => [a.id, a.id === 'lin' ? lin : wait]),
    );
  world = v7Step(
    world,
    actions({
      interface: 'invite',
      args: { x: ivo.position.x, y: ivo.position.y, round: 2, text: '' },
    }),
    registry,
  ).world;
  world = v7Step(world, actions(wait), registry).world;
  const seen = v7Observe(world, 'ivo').events.find(
    (e) => e.type === 'attendance',
  );
  expect(seen?.data.host).toBe('lin');
  expect(
    v7Distance(ivo.position, world.actors[0]?.position ?? ivo.position),
  ).toBeGreaterThan(100);
});

it('keeps each neighborhood’s animals in their own herd', () => {
  let world = v7Clone(villages);
  const registry = continuousRegistry(world);
  for (let tick = 0; tick < 100; tick++)
    world = v7Step(
      world,
      Object.fromEntries(world.actors.map((a) => [a.id, wait])),
      registry,
    ).world;
  const animals = world.objects.filter((o) => o.kind === 'animal');
  expect(animals).toHaveLength(10);
  for (const animal of animals) {
    const westHerd = animal.data.group === animal.data.species;
    expect(animal.spatial.x < VILLAGES.width / 2).toBe(westHerd);
    // The east herd moves as the exact mirror image of the west herd.
    const home = villagesMirror({
      x: Number(animal.data.homeX),
      y: Number(animal.data.homeY),
    });
    const twin = animals.find(
      (o) =>
        o.data.species === animal.data.species &&
        Number(o.data.homeX) === home.x &&
        Number(o.data.homeY) === home.y,
    );
    expect(twin?.spatial.x).toBeCloseTo(VILLAGES.width - animal.spatial.x, 6);
    expect(twin?.spatial.y).toBeCloseTo(animal.spatial.y, 6);
  }
}, 120_000);
