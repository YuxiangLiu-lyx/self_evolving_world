import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  expressionSign,
  openConditions,
  v7AssertWorld,
  v7Clone,
  v7Distance,
  v7Install,
  v7Step,
  V7_PACKAGES,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Configuration,
  V7World,
} from '@self-evolving-world/world-core';
import {
  importLongWorld,
  IMPORT_EXCLUDED_WORDS,
  LONG_IMPORT,
  longImportConfig,
  longWorldDiff,
  parseLongNewcomers,
  TEMPERAMENT_KEYS,
} from '../src/long-import.js';
import type { LongImport } from '../src/long-import.js';
import { CULTURE_CENTER } from '../src/long-culture.js';
import { longOrdinaryInput } from '../src/long-context.js';
import {
  initialLongWorld,
  LONG_IMPORT_OBJECTIVE,
  LONG_SCENARIOS,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';
import {
  continueContinuousExecution,
  newContinuousExecution,
} from '../src/continuous-run.js';
import { readLongImportSource } from '../../../scripts/long-import.js';
import type { LongImportProof } from '../../../scripts/long-import.js';
import {
  buildContinuousReplay,
  continuousAtomic,
  continuousHash,
  continuousRead,
  continuousSink,
  readContinuousExecution,
  reconstructContinuousSegment,
} from '../../../scripts/continuous-store.js';
import type { V7ReplaySegment } from '../../../scripts/continuous-store.js';

// Exact replay of ex18's 120 rounds runs slower on CI than locally.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const root = process.cwd(),
  SOURCE = resolve(root, 'experiment', 'ex18');
/** The newcomers file passed to `new long-culture-v2 --import ex18 --newcomers`. */
const NEWCOMERS = continuousRead<unknown>(
  resolve(root, 'apps/simulator/test/fixtures/import-newcomers.json'),
);
/** ex18's world at round 120 (`execution.json` `world`), hashed with `continuousHash`. */
const EX18_ROUND_120 =
  'd21459c66264e4645651e4f6f0287070e18c125261eb522dcf77bdada6f42e2d';
const WAIT: V7Action = { interface: 'wait', args: {} };

function fileHashes(directory: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (path: string, prefix: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory())
        visit(join(path, entry.name), `${prefix}${entry.name}/`);
      else
        result[`${prefix}${entry.name}`] = createHash('sha256')
          .update(readFileSync(join(path, entry.name)))
          .digest('hex');
    }
  };
  visit(directory, '');
  return result;
}
const actor = (world: V7World, id: string) => {
  const found = world.actors.find((a) => a.id === id);
  if (!found) throw new Error(`Missing ${id}.`);
  return found;
};
const step = (world: V7World, actions: Record<string, V7Action>) =>
  v7Step(
    world,
    Object.fromEntries(world.actors.map((a) => [a.id, actions[a.id] ?? WAIT])),
    continuousRegistry(world),
  );

let before: Record<string, string>,
  source: V7World,
  proof: LongImportProof,
  imported: LongImport;
beforeAll(() => {
  before = fileHashes(SOURCE);
  ({ world: source, proof } = readLongImportSource(root, 'ex18'));
  imported = importLongWorld(source, {
    experiment: 'ex18',
    scope: 'long-ex99',
    newcomers: parseLongNewcomers(NEWCOMERS, source),
  });
});

describe('importing ex18 at round 120 with two newcomers', () => {
  it('proves the source world equals its exact replay and recorded hashes', () => {
    const execution = continuousRead<{ world: V7World }>(
      resolve(SOURCE, 'execution.json'),
    );
    expect(continuousHash(execution.world)).toBe(EX18_ROUND_120);
    expect(proof).toMatchObject({
      experiment: 'ex18',
      round: 120,
      scope: 'long-ex18',
      worldHash: EX18_ROUND_120,
      replayHash: EX18_ROUND_120,
      recordedHash: EX18_ROUND_120,
      checkpointHash: EX18_ROUND_120,
      replay: { observed: 120, target: 120, phase: 'window-complete' },
      sourceRevision: { id: 4, tick: 73 },
    });
    // Independent check: rebuild the round-120 world from the replay index here.
    const index = continuousRead<{
      segments: { path: string; sha256: string }[];
    }>(resolve(SOURCE, 'replay.json'));
    let last: V7World | undefined;
    for (const part of index.segments) {
      const text = readFileSync(resolve(SOURCE, part.path));
      expect(createHash('sha256').update(text).digest('hex')).toBe(part.sha256);
      last = reconstructContinuousSegment(
        JSON.parse(text.toString('utf8')) as V7ReplaySegment,
      ).at(-1);
    }
    expect(continuousHash(last)).toBe(EX18_ROUND_120);
    expect(source.tick).toBe(120);
  });

  it('changes only the listed configuration paths and appends the newcomers', () => {
    const world = imported.world;
    expect(imported.changes.map((c) => c.path)).toEqual([
      'config.budgets.development',
      'config.development.inherited',
      'config.development.scope',
      'config.experience.targetRounds',
      'config.longDevelopment.checkpoints',
      'config.longDevelopment.culture.incentives',
      'config.longDevelopment.scenario',
      'config.longDevelopment.tokens',
      'actors.6',
      'actors.7',
    ]);
    expect(
      imported.changes
        .filter((c) => c.path.startsWith('config.'))
        .map((c) => [c.path, c.from, c.to]),
    ).toEqual([
      ['config.budgets.development', 16, 12],
      ['config.development.inherited', undefined, ['long-ex18']],
      ['config.development.scope', 'long-ex18', 'long-ex99'],
      ['config.experience.targetRounds', 120, 220],
      ['config.longDevelopment.checkpoints', [80, 120], [80, 150, 250]],
      ['config.longDevelopment.culture.incentives', true, false],
      [
        'config.longDevelopment.scenario',
        'culture-v2-incentives',
        'culture-v2-import',
      ],
      ['config.longDevelopment.tokens', 4_000_000, 2_500_000],
    ]);
    // The structural diff of the two worlds is exactly the change list.
    expect(longWorldDiff(source, world).map((d) => d.path)).toEqual(
      imported.changes.map((c) => c.path).sort(),
    );
    // Byte identity: every other top-level field and every resident serializes unchanged.
    for (const key of Object.keys(source) as (keyof V7World)[])
      if (key !== 'config' && key !== 'actors')
        expect(JSON.stringify(world[key])).toBe(JSON.stringify(source[key]));
    expect(Object.keys(world)).toEqual(Object.keys(source));
    for (const [i, resident] of source.actors.entries())
      expect(JSON.stringify(world.actors[i])).toBe(JSON.stringify(resident));
    expect(world.actors.map((a) => a.id)).toEqual([
      'lin',
      'moss',
      'sol',
      'kai',
      'wren',
      'ivo',
      'tova',
      'bram',
    ]);
    // Reverting the listed configuration changes restores the source bytes.
    const config = v7Clone(world.config) as unknown as Record<string, unknown>;
    for (const change of imported.changes.filter((c) =>
      c.path.startsWith('config.'),
    )) {
      const keys = change.path.split('.').slice(1),
        last = keys.pop() ?? '';
      let node = config;
      for (const key of keys) node = node[key] as Record<string, unknown>;
      expect(node[last]).toEqual(change.to);
      if ('from' in change) node[last] = change.from;
      else Reflect.deleteProperty(node, last);
    }
    expect(JSON.stringify(config)).toBe(JSON.stringify(source.config));
    // The configuration equals the code-derived import configuration.
    expect(world.config).toEqual(
      longImportConfig('long-ex99', {
        experiment: 'ex18',
        scope: 'long-ex18',
        round: 120,
      }),
    );
    const policy = world.config.longDevelopment;
    if (!policy) throw new Error('Missing policy.');
    expect(policy.culture).toEqual({
      ...initialLongWorld('long-ex99', 'long-culture-v2').config.longDevelopment
        ?.culture,
    });
    expect(policy.culture?.incentives).toBe(false);
    expect(policy.culture?.goal).toBe('open');
    expect(longScenario(policy)).toBe('long-culture-v2');
    expect(longObjective(policy)).toBe(LONG_IMPORT_OBJECTIVE);
    expect(world.config.budgets).toEqual({
      ordinary: 1800,
      world: 300,
      development: LONG_IMPORT.developments,
    });
    expect(policy.tokens).toBe(LONG_IMPORT.tokens);
  });

  it('refuses a source configuration that differs from culture v2 outside the listed changes', () => {
    const altered = v7Clone(source);
    altered.config.vision = 6;
    expect(() =>
      importLongWorld(altered, {
        experiment: 'ex18',
        scope: 'long-ex99',
        newcomers: parseLongNewcomers(NEWCOMERS, source),
      }),
    ).toThrow(/vision, outside the listed import changes/);
    expect(() =>
      importLongWorld(source, {
        experiment: 'ex18',
        scope: 'long-ex18',
        newcomers: [],
      }),
    ).toThrow(/own development scope/);
    expect(() =>
      parseLongNewcomers(
        { newcomers: [{ id: 'kai', name: 'Kai', leaning: 'calm' }] },
        source,
      ),
    ).toThrow(/already taken/);
    expect(() =>
      parseLongNewcomers(
        { newcomers: [{ id: 'tova', name: 'Tova', leaning: 'tradition' }] },
        source,
      ),
    ).toThrow(/excluded vocabulary/);
  });

  it('starts a fresh execution with no attempts or plans and a window to round 220', () => {
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      imported.world,
    );
    expect(state.world.tick).toBe(120);
    expect(state.windowTarget).toBe(220);
    expect(state.attempts).toEqual([]);
    expect(state.developments).toEqual([]);
    expect(state.cursors).toEqual({});
    expect(state.longRetrieval).toBeUndefined();
    expect(state.barrier).toBeNull();
    // The residents keep their memories in the world.
    for (const resident of source.actors)
      expect(actor(state.world, resident.id).memory).toEqual(resident.memory);
  });

  it('keeps the inherited incentive state inert, apart from one decaying residue', () => {
    const tell: V7Action = {
      interface: 'tell',
      args: { text: 'Moss, how are you today?' },
    };
    const run = (start: V7World) => {
      let world = start;
      const types: string[] = [];
      const answered: Record<number, number | undefined> = {};
      for (let i = 0; i < 12; i++) {
        const result = step(world, i === 0 ? { kai: tell } : {});
        if (result.paused) throw new Error(result.paused);
        world = result.world;
        types.push(...world.events.map((e) => e.type));
        answered[world.tick] = actor(world, 'kai').wellbeing.sources.find(
          (s) => s.source === 'answered',
        )?.value;
      }
      return { world, types, answered };
    };
    const bookkeeping = (world: V7World) =>
      Object.entries(world.state).filter(([k]) => k.startsWith('expression:'));
    const derived = ['acknowledged', 'reciprocated', 'work-noticed'];
    // With incentives on, the same words would be answered by derived evidence.
    const on = run(source);
    expect(on.types).toEqual(
      expect.arrayContaining(['heard', ...derived.slice(0, 2)]),
    );
    // With incentives off nothing is derived and the bookkeeping never changes.
    const off = run(imported.world);
    expect(off.types).toContain('heard');
    for (const type of derived) expect(off.types).not.toContain(type);
    expect(bookkeeping(off.world)).toEqual(bookkeeping(imported.world));
    // The rules stay registered but cannot fire; Kai's last award fades by round 132.
    expect(
      imported.world.satisfaction.filter((r) => r.derived).map((r) => r.id),
    ).toEqual(['answered', 'two-way', 'work-noticed']);
    expect(off.answered[126]).toBe(0.5);
    expect(off.answered[127]).toBeLessThan(0.01);
    expect(off.answered[132]).toBe(0);
  });
});

describe('the registry of an imported world', () => {
  it('keeps the inherited packages working for the people who mastered them', () => {
    const world = imported.world,
      registry = continuousRegistry(world);
    expect(
      registry.packages.map(
        (p) => `${p.id}@${String(p.version)}:${p.scope ?? ''}`,
      ),
    ).toEqual([
      'foundation-forest@1:',
      'foundation-open@1:',
      'foundation-expression@1:long-ex99',
      'plant-establishment-trial@1:long-ex18',
      'unheated-food-preparation@1:long-ex18',
      'thermal-food-preparation@1:long-ex18',
    ]);
    v7AssertWorld(world, registry);
    const prepare: V7Action = {
      interface: 'unheated-food-preparation',
      args: { mode: 'prepare', inputStackId: 'item-3-moss-30', quantity: 4 },
    };
    const result = step(world, {
      moss: prepare,
      tova: prepare,
      kai: {
        interface: 'thermal-food-preparation',
        args: { mode: 'assess', inputStackId: 'item-60-kai-699' },
      },
    });
    expect(result.paused).toBeNull();
    expect(result.outcomes.moss?.success).toBe(true);
    expect(result.outcomes.kai?.success).toBe(true);
    expect(result.outcomes.tova?.reason).toMatch(/not mastered/);
    expect(result.world.events.map((e) => e.type)).toContain(
      'unheated-preparation-started',
    );
    // Without the inherited scope the same mastered ability has no implementation.
    const bare = v7Clone(world);
    delete bare.config.development?.inherited;
    expect(step(bare, { moss: prepare }).outcomes.moss?.reason).toBe(
      'Missing versioned implementation.',
    );
  });

  it('still rejects foreign scopes, including the inherited one, for new installs', () => {
    const world = imported.world;
    for (const key of [
      'unheated-food-preparation@1',
      'plant-establishment-trial@1',
    ])
      expect(() => v7Install(world, continuousRegistry(world), key)).toThrow(
        /not approved/,
      );
    expect(() =>
      v7Install(world, continuousRegistry(), 'hearth-food-preparation@1'),
    ).toThrow(/not approved/);
  });

  it('leaves the registry of every existing world unchanged', () => {
    const key = (p: { id: string; version: number; scope?: string }) =>
      `${p.id}@${String(p.version)}:${p.scope ?? ''}`;
    // The registry formula before inherited scopes existed.
    const legacy = (config: V7Configuration) => {
      const development = config.development,
        culture = config.longDevelopment?.culture;
      if (!development) return V7_PACKAGES.map(key);
      return [
        'foundation-forest@1:',
        'foundation-open@1:',
        ...(config.collective
          ? [`foundation-collective@1:${development.scope}`]
          : []),
        ...(culture && (culture.symbols || culture.incentives)
          ? [`foundation-expression@1:${development.scope}`]
          : []),
        ...V7_PACKAGES.filter((p) => p.scope === development.scope).map(key),
      ];
    };
    const configs: V7Configuration[] = [];
    for (let n = 7; n <= 18; n++)
      configs.push(
        continuousRead<V7Configuration>(
          resolve(root, 'experiment', `ex${String(n)}`, 'configuration.json'),
        ),
      );
    for (const scenario of LONG_SCENARIOS)
      configs.push(initialLongWorld(`long-${scenario}`, scenario).config);
    for (const config of configs) {
      expect(config.development?.inherited).toBeUndefined();
      expect(
        continuousRegistry({ config } as V7World).packages.map(key),
      ).toEqual(legacy(config));
    }
    expect(continuousRegistry().packages).toHaveLength(V7_PACKAGES.length);
  });
});

describe('the newcomers', () => {
  it('start like a new culture person, without memory, at the residents’ median temperament', () => {
    expect(parseLongNewcomers(NEWCOMERS, source)).toEqual([
      { id: 'tova', name: 'Tova', leaning: 'curiosity' },
      { id: 'bram', name: 'Bram', leaning: 'calm' },
    ]);
    const world = imported.world,
      genesis = continuousRead<V7World>(resolve(SOURCE, 'initial.json')),
      baseline = world.config.development?.baseline ?? [];
    const median = (values: number[]) => {
      const s = [...values].sort((a, b) => a - b);
      return Math.round(((s[2] ?? 0) + (s[3] ?? 0)) * 500) / 1000;
    };
    const temperament = Object.fromEntries(
      TEMPERAMENT_KEYS.map((k) => [
        k,
        median(
          source.actors.map((a) =>
            Number(
              (a.extensionState['long:tendencies'] as Record<string, unknown>)[
                k
              ],
            ),
          ),
        ),
      ]),
    );
    expect(temperament).toEqual({
      curiosity: 0.525,
      riskTolerance: 0.5,
      closeness: 0.475,
      comfortPreference: 0.5,
    });
    expect(imported.temperament).toEqual(temperament);
    for (const [id, name, leaning] of [
      ['tova', 'Tova', 'curiosity'],
      ['bram', 'Bram', 'calm'],
    ] as const) {
      const person = actor(world, id);
      expect(person.name).toBe(name);
      expect(person.extensionState).toEqual({
        'long:tendencies': { ...temperament, leaning },
      });
      // Start values of a new culture person at round 0.
      expect(person.vitals).toEqual(genesis.actors[0]?.vitals);
      expect(person.vitals).toMatchObject({
        health: 100,
        satiety: 80,
        energy: 40,
      });
      expect(person.wellbeing).toEqual(genesis.actors[0]?.wellbeing);
      expect(person.experience).toEqual(genesis.actors[0]?.experience);
      // The residents started with empty inventories, and so do the newcomers.
      expect(genesis.stacks.filter((s) => s.owner !== null)).toEqual([]);
      expect(world.stacks.filter((s) => s.owner === id)).toEqual([]);
      // No prior memory, knowledge, relationships or developed abilities.
      expect(person.memory).toEqual({
        cells: [],
        objects: [],
        stacks: [],
        experiences: [],
        important: [],
        discoveries: {},
        notes: [],
        preferences: [],
        projects: {},
        knowledge: {},
        abilityDetails: [],
      });
      expect(person.relationships).toEqual({});
      expect(person.mastered).toEqual(baseline);
      expect(person.learning).toBeNull();
      expect(person.bornAt).toBe(120);
      expect(person.life).toEqual({
        total: 3,
        deaths: 0,
        spawn: person.position,
        lastDeath: null,
      });
      expect(
        Object.keys(world.state).filter((k) => k.includes(`:${id}`)),
      ).toEqual([]);
      // Dry, walkable, unoccupied ordinary ground 6-7 units from the clearing's centre.
      const distance = v7Distance(person.position, CULTURE_CENTER);
      expect(distance).toBeGreaterThanOrEqual(5.99);
      expect(distance).toBeLessThanOrEqual(7.01);
      const ground =
        world.terrain[Math.floor(person.position.y)]?.[
          Math.floor(person.position.x)
        ];
      expect(['.', 'f']).toContain(ground);
      expect(openConditions(world, person.position).regime).toBe(
        'ordinary soil',
      );
      for (const other of world.actors.filter((a) => a.id !== id))
        expect(v7Distance(other.position, person.position)).toBeGreaterThan(
          other.radius + person.radius,
        );
    }
    // Opposite sides of the clearing.
    const [tova, bram] = ['tova', 'bram'].map(
      (id) => actor(world, id).position,
    );
    if (!tova || !bram) throw new Error('Missing newcomers.');
    const angle = (p: { x: number; y: number }) =>
      Math.atan2(p.y - CULTURE_CENTER.y, p.x - CULTURE_CENTER.x);
    expect(
      Math.abs(Math.abs(angle(tova) - angle(bram)) - Math.PI),
    ).toBeLessThan(0.01);
    // The recorded placement report and what each newcomer sees at round 120.
    expect(imported.newcomers).toEqual([
      {
        id: 'tova',
        position: { x: 9.23, y: 19.77 },
        distanceFromCenter: 6.75,
        residentsInSight: [],
        signsInSight: [],
        residentsWithinVision: [],
        signsWithinVision: [],
      },
      {
        id: 'bram',
        position: { x: 18.6, y: 10.4 },
        distanceFromCenter: 6.51,
        residentsInSight: [
          { id: 'wren', distance: 3.76 },
          { id: 'ivo', distance: 4.17 },
        ],
        signsInSight: [],
        residentsWithinVision: ['wren', 'ivo'],
        signsWithinVision: [],
      },
    ]);
  });

  it('see no excluded word, place name, tale or resident history in their first ordinary input', () => {
    const world = imported.world;
    // Everything the residents remember or wrote, which must not reach a newcomer.
    const history = source.actors.flatMap((a) => [
      ...a.memory.notes,
      ...a.memory.preferences,
      ...(a.memory.cares ? [a.memory.cares] : []),
      ...(a.memory.views ?? []).map((v) => v.view),
      ...(a.memory.intention ? [a.memory.intention] : []),
      ...Object.values(a.memory.projects ?? {}).map((p) => p.goal),
      ...(
        (a.extensionState['expression:heard'] as
          { text?: string }[] | undefined) ?? []
      ).map((h) => h.text ?? ''),
    ]);
    expect(history.length).toBeGreaterThan(20);
    const signs = world.objects.filter(expressionSign);
    expect(signs.map((s) => s.data.text)).toEqual(['The Berry Lantern']);
    for (const id of ['tova', 'bram']) {
      const input = longOrdinaryInput(world, id),
        text = JSON.stringify(input);
      expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
      // No sign is in sight at round 120, so neither word may appear at all.
      expect(
        (input.packet.observation as { signs: { total: number } }).signs.total,
      ).toBe(0);
      expect(text).not.toMatch(/Berry|Lantern/);
      expect(text).not.toMatch(/lantern/i);
      for (const entry of history.filter((h) => h.trim().length > 12))
        expect(text).not.toContain(entry);
      expect(input.longContext).toMatchObject({
        scope: 'long-ex99',
        actor: id,
        goal: 'open',
        leaning: id === 'tova' ? 'curiosity' : 'calm',
      });
      // Only the observed residents appear, by id and name, through observation.
      const seen = (
        input.packet.observation as { actors: { id: string }[] }
      ).actors.map((a) => a.id);
      for (const resident of source.actors.filter((a) => !seen.includes(a.id)))
        expect(text).not.toMatch(new RegExp(`\\b${resident.name}\\b`));
    }
  });
});

describe('an imported archive', () => {
  let scratch = '';
  afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it('verifies its configuration and replays from its imported round', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'long-import-'));
    const id = 'ex99',
      directory = join(scratch, 'experiment', id),
      world = importLongWorld(source, {
        experiment: 'ex18',
        scope: `long-${id}`,
        newcomers: parseLongNewcomers(NEWCOMERS, source),
      }).world;
    const state = newContinuousExecution('fixture', 'isolated-fixture', world);
    state.windowTarget = 122;
    continuousAtomic(join(directory, 'manifest.json'), {
      importedFrom: proof,
    });
    continuousAtomic(join(directory, 'initial.json'), world);
    const done = await continueContinuousExecution(
      state,
      () =>
        Promise.resolve({
          text: JSON.stringify({
            queries: [],
            result_json: JSON.stringify({
              intention: 'Fixture only',
              steps: [{ action: WAIT, repeat: 1, until: null, guard: null }],
              repeat: 1,
              until: null,
              interrupts: [],
              notes: [],
              preferences: [],
            }),
          }),
          responseId: 'fixture',
          usage: { inputTokens: 100, outputTokens: 10 },
          http: {
            status: 200,
            requestId: null,
            contentType: 'application/json',
          },
          evidence: 'isolated fixture',
        }),
      continuousSink(scratch, id),
    );
    expect(done.phase).toBe('window-complete');
    expect(done.world.tick).toBe(122);
    expect(done.attempts.filter((a) => a.role === 'ordinary')).toHaveLength(16);
    continuousAtomic(join(directory, 'execution.json'), done);
    expect(continuousHash(readContinuousExecution(scratch, id))).toBe(
      continuousHash(done),
    );
    const index = buildContinuousReplay(scratch, id, world, done);
    expect(index.segments.map((s) => [s.path, s.start, s.end])).toEqual([
      ['replay/execution-000120-000122.json', 120, 122],
    ]);
    const frames = reconstructContinuousSegment(
      continuousRead<V7ReplaySegment>(
        join(directory, index.segments[0]?.path ?? ''),
      ),
    );
    expect(frames.map((f) => f.tick)).toEqual([120, 121, 122]);
    expect(continuousHash(frames.at(-1))).toBe(continuousHash(done.world));
    // A modified protected configuration is rejected.
    const altered = v7Clone(done);
    altered.world.config.budgets.development = 13;
    writeFileSync(join(directory, 'execution.json'), JSON.stringify(altered));
    expect(() => readContinuousExecution(scratch, id)).toThrow(
      /modified protected run configuration/,
    );
  });

  it('leaves every file of the source archive unchanged', () => {
    expect(fileHashes(SOURCE)).toEqual(before);
  });
});
