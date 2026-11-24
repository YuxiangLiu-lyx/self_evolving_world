import { describe, expect, it } from 'vitest';
import {
  EXPRESSION_LIMITS,
  continuousRegistry,
  expressionArgumentIssue,
  expressionSign,
  v7Clone,
  v7Distance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { longOrdinaryInput, longRetrieve } from '../src/long-context.js';
import { initialLongWorld } from '../src/long-scenario.js';
import {
  continueContinuousExecution,
  newContinuousExecution,
} from '../src/continuous-run.js';
import type { V7RoundRecord, V7Sink } from '../src/continuous-run.js';
import {
  continuousHash,
  reconstructContinuousSegment,
} from '../../../scripts/continuous-store.js';
import type { V7StoredRound } from '../../../scripts/continuous-store.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';
import { utterances } from '../../../scripts/culture-metrics.js';

const WAIT: V7Action = { interface: 'wait', args: {} };
const genesis = () => initialLongWorld('long-ex15', 'long-culture');
function step(world: V7World, actions: Record<string, V7Action>) {
  const result = v7Step(
    world,
    Object.fromEntries(world.actors.map((a) => [a.id, actions[a.id] ?? WAIT])),
    continuousRegistry(world),
  );
  if (result.paused) throw new Error(result.paused);
  return result;
}
const signs = (w: V7World) => w.objects.filter(expressionSign);
const actor = (w: V7World, id: string) => {
  const a = w.actors.find((x) => x.id === id);
  if (!a) throw new Error(`Missing ${id}`);
  return a;
};
/** Move one person far away, to a clear ex13 start, as a fixture. */
const far = (w: V7World, id: string, spot = { x: 14.5, y: 22.5 }) => {
  const next = v7Clone(w);
  actor(next, id).position = { ...spot };
  return next;
};
const physical = (w: V7World) =>
  v7Signature({
    actors: w.actors.map((a) => ({
      id: a.id,
      vitals: a.vitals,
      position: a.position,
    })),
    stacks: w.stacks,
    objects: w.objects.filter((o) => !expressionSign(o)),
  });

describe('culture symbolic interfaces', () => {
  it('names a place or visible object with a persistent, replaceable, bounded sign and no physical effect', () => {
    const world = genesis();
    const named = step(world, {
      moss: {
        interface: 'name',
        args: { subject: '', text: 'Meeting stones' },
      },
    });
    const waited = step(world, {});
    expect(named.outcomes.moss?.success).toBe(true);
    expect(physical(named.world)).toBe(physical(waited.world));
    const event = named.world.events.find((e) => e.type === 'named');
    const [sign] = signs(named.world);
    expect(event).toMatchObject({
      actor: 'moss',
      interface: 'name',
      target: sign?.id,
    });
    expect(sign).toMatchObject({
      kind: 'name',
      createdBy: 'moss',
      visual: { component: 'sign', label: 'Meeting stones', state: 'name' },
      data: { text: 'Meeting stones', by: 'moss', subjectKind: 'place' },
      spatial: { solid: false },
    });
    expect(typeof CONTINUOUS_VISUALS.sign).toBe('function');
    // Naming the same subject again replaces the person's own name for it.
    const renamed = step(named.world, {
      moss: {
        interface: 'name',
        args: { subject: '', text: 'Talking stones' },
      },
    }).world;
    expect(signs(renamed)).toHaveLength(1);
    expect(signs(renamed)[0]).toMatchObject({
      id: sign?.id,
      data: { text: 'Talking stones' },
    });
    expect(renamed.events.find((e) => e.type === 'named')?.data.previous).toBe(
      'Meeting stones',
    );
    // A visible object can be named from a distance; an unseen one cannot.
    const tree = world.objects.find(
      (o) =>
        o.kind === 'tree' &&
        longOrdinaryInput(world, 'lin').packet.observation &&
        v7Distance(actor(world, 'lin').position, o.spatial) < 4,
    );
    if (!tree) throw new Error('Missing visible tree');
    const visible = step(world, {
      lin: {
        interface: 'name',
        args: { subject: tree.id, text: 'Old branch tree' },
      },
    });
    expect(visible.outcomes.lin?.success).toBe(true);
    expect(signs(visible.world)[0]?.data).toMatchObject({
      subject: tree.id,
      subjectKind: 'object',
    });
    const hidden = step(world, {
      lin: { interface: 'name', args: { subject: 'cave-1', text: 'Far cave' } },
    });
    expect(hidden.outcomes.lin?.reason).toContain('visible object');
    const long = step(world, {
      lin: {
        interface: 'name',
        args: { subject: '', text: 'x'.repeat(EXPRESSION_LIMITS.name + 1) },
      },
    });
    expect(long.outcomes.lin?.success).toBe(false);
    expect(signs(long.world)).toHaveLength(0);
    expect(
      expressionArgumentIssue({
        interface: 'name',
        args: { text: 'x'.repeat(61) },
      }),
    ).toContain('60');
  });

  it('has no physical effect beyond action time for any symbolic interface', () => {
    const world = genesis();
    const waited = physical(step(world, {}).world);
    for (const action of [
      { interface: 'name', args: { subject: '', text: 'Here' } },
      { interface: 'mark', args: { subject: '', text: 'Here' } },
      { interface: 'tell', args: { text: 'Hello' } },
      { interface: 'invite', args: { x: 14, y: 15, round: 5, text: '' } },
    ]) {
      const result = step(world, { lin: action });
      expect(result.outcomes.lin?.success).toBe(true);
      expect(physical(result.world)).toBe(waited);
    }
  });

  it('shows nearby signs to other people, keeps them retrievable by exact id and hides them from people far away', () => {
    const world = far(genesis(), 'kai');
    const after = step(world, {
      sol: {
        interface: 'mark',
        args: { subject: '', text: 'Sol rested here' },
      },
    }).world;
    const [sign] = signs(after);
    if (!sign) throw new Error('Missing sign');
    const observation = longOrdinaryInput(after, 'lin').packet.observation as {
      objects: { records: { id: string }[] };
      signs: {
        total: number;
        records: { id: string; value: Record<string, unknown> }[];
      };
    };
    expect(observation.signs.total).toBe(1);
    expect(observation.signs.records[0]).toMatchObject({
      id: sign.id,
      value: { kind: 'mark', text: 'Sol rested here', by: 'sol' },
    });
    expect(observation.objects.records.some((r) => r.id === sign.id)).toBe(
      false,
    );
    const [read] = longRetrieve(after, 'lin', 'ordinary', [
      { section: 'observed', search: '', ids: [sign.id], offset: 0, part: 0 },
    ]);
    expect(JSON.stringify(read)).toContain('Sol rested here');
    const distant = longOrdinaryInput(after, 'kai').packet.observation as {
      signs: { total: number };
    };
    expect(distant.signs.total).toBe(0);
    // The sign persists, and a person who saw it remembers it after walking away.
    const later = step(far(after, 'lin', { x: 18.5, y: 12.5 }), {}).world;
    expect(signs(later)).toHaveLength(1);
    const [remembered] = longRetrieve(later, 'lin', 'ordinary', [
      { section: 'observed', search: '', ids: [sign.id], offset: 0, part: 0 },
    ]);
    expect(JSON.stringify(remembered)).toContain('Sol rested here');
  });

  it('marks only within reach and keeps each person’s most recent names and marks', () => {
    let world = genesis();
    const lin = actor(world, 'lin');
    const distantTree = world.objects
      .filter((o) => o.kind === 'tree')
      .sort(
        (a, b) =>
          v7Distance(lin.position, a.spatial) -
          v7Distance(lin.position, b.spatial),
      )
      .find((o) => v7Distance(lin.position, o.spatial) > 2);
    if (!distantTree) throw new Error('Missing tree');
    expect(
      step(world, {
        lin: {
          interface: 'mark',
          args: { subject: distantTree.id, text: 'Here' },
        },
      }).outcomes.lin?.reason,
    ).toContain('Approach');
    let first = '';
    for (let i = 0; i <= EXPRESSION_LIMITS.signsPerPerson; i++) {
      world = step(world, {
        lin: {
          interface: 'mark',
          args: { subject: '', text: `Mark ${String(i)}` },
        },
      }).world;
      if (i === 0) first = signs(world)[0]?.id ?? '';
    }
    const own = signs(world).filter((s) => s.createdBy === 'lin');
    expect(own).toHaveLength(EXPRESSION_LIMITS.signsPerPerson);
    expect(own.some((s) => s.id === first)).toBe(false);
    expect(world.events.find((e) => e.type === 'marked')?.data.faded).toEqual([
      first,
    ]);
  });

  it('delivers spoken words privately to everyone within hearing range and leaves nothing at the place', () => {
    let world = far(genesis(), 'kai');
    const said = step(world, {
      lin: {
        interface: 'tell',
        args: { text: 'The berries by the stones are ripe.' },
      },
    });
    world = said.world;
    const told = world.events.find((e) => e.type === 'told');
    expect(told).toMatchObject({ actor: 'lin', interface: 'tell' });
    expect(JSON.stringify(told?.data)).not.toContain('moss');
    const heard = world.events.filter((e) => e.type === 'heard');
    expect(heard.map((e) => e.actor).sort()).toEqual([
      'ivo',
      'moss',
      'sol',
      'wren',
    ]);
    expect(
      heard.every((e) => e.position === null && e.data.from === 'lin'),
    ).toBe(true);
    expect(signs(world)).toHaveLength(0);
    const moss = longOrdinaryInput(world, 'moss').packet.memory as {
      heard: unknown[];
    };
    expect(JSON.stringify(moss.heard)).toContain(
      'The berries by the stones are ripe.',
    );
    const kai = longOrdinaryInput(world, 'kai').packet.memory as {
      heard: unknown[];
    };
    expect(kai.heard).toEqual([]);
    for (let i = 0; i < 8; i++)
      world = step(world, {
        lin: { interface: 'tell', args: { text: `Word ${String(i)}` } },
      }).world;
    const list = actor(world, 'moss').extensionState[
      'expression:heard'
    ] as unknown[];
    expect(list).toHaveLength(EXPRESSION_LIMITS.heard);
    expect(
      step(world, {
        lin: { interface: 'tell', args: { text: 'x'.repeat(241) } },
      }).outcomes.lin?.success,
    ).toBe(false);
  });

  it('records invitations, actual attendance at the invited round and expiry', () => {
    let world = genesis();
    const place = { x: 18.5, y: 12.5 };
    const invited = step(world, {
      kai: {
        interface: 'invite',
        args: { ...place, round: 4, text: 'Bring news' },
      },
    });
    world = invited.world;
    const [sign] = signs(world);
    expect(sign).toMatchObject({
      kind: 'invitation',
      data: { meeting: { ...place, round: 4 }, until: 14, text: 'Bring news' },
    });
    expect(world.events.filter((e) => e.type === 'heard')).toHaveLength(5);
    // Lin walks over (fixture placement); the others stay where they were.
    world = v7Clone(world);
    actor(world, 'lin').position = { ...place };
    while (world.tick < 4) world = step(world, {}).world;
    const attendance = world.events.find((e) => e.type === 'attendance');
    expect(attendance?.data).toMatchObject({
      host: 'kai',
      present: ['lin'],
      came: ['lin'],
    });
    while (world.tick <= 14) world = step(world, {}).world;
    expect(signs(world)).toHaveLength(0);
    // Invalid rounds or places fail without leaving anything.
    const base = genesis();
    for (const args of [
      { ...place, round: 1, text: '' },
      { ...place, round: 250, text: '' },
      { x: 25, y: 5, round: 5, text: '' },
      { ...place, round: 5, text: 'x'.repeat(121) },
    ]) {
      const result = step(base, { kai: { interface: 'invite', args } });
      expect(result.outcomes.kai?.success).toBe(false);
      expect(signs(result.world)).toHaveLength(0);
    }
  });

  it('follows the culture metrics conventions for symbolic text and failures', () => {
    const world = genesis();
    const actions: Record<string, V7Action> = {
      lin: { interface: 'tell', args: { text: 'The stones are warm.' } },
      moss: { interface: 'name', args: { subject: '', text: 'Warm stones' } },
      sol: { interface: 'mark', args: { subject: '', text: 'Sol' } },
      kai: {
        interface: 'invite',
        args: { x: 14, y: 15, round: 3, text: 'Meet here' },
      },
      wren: { interface: 'name', args: { subject: 'nowhere', text: 'Lost' } },
    };
    const result = step(world, actions);
    expect(result.world.events.find((e) => e.type === 'failed')?.actor).toBe(
      'wren',
    );
    expect(result.world.events.some((e) => e.type === 'message')).toBe(false);
    const said = utterances({
      archive: 'fixture',
      actors: world.actors.map((a) => ({ id: a.id, name: a.name })),
      vision: world.config.vision,
      start: Object.fromEntries(world.actors.map((a) => [a.id, a.position])),
      abilities: [],
      resources: [],
      environment: [],
      harness: [],
      rounds: [
        {
          tick: 1,
          actions: Object.fromEntries(
            world.actors.map((a) => [a.id, actions[a.id] ?? WAIT]),
          ),
          events: result.world.events,
          memory: {},
          intentions: {},
        },
      ],
    });
    expect(said.map((u) => [u.actor, u.kind, u.text])).toEqual([
      ['lin', 'public', 'The stones are warm.'],
      ['moss', 'name', 'Warm stones'],
      ['sol', 'name', 'Sol'],
      ['kai', 'public', 'Meet here'],
    ]);
  });

  it('reconstructs every sign, heard list and private memory from the recorded actions', async () => {
    const world = genesis();
    const state = newContinuousExecution('fixture', 'isolated-fixture', world);
    state.windowTarget = 6;
    const rounds: V7StoredRound[] = [];
    const sink: V7Sink = {
      save: () => Promise.resolve(),
      call: () => Promise.resolve(),
      findCall: () => Promise.resolve(null),
      round: (record: V7RoundRecord) => {
        rounds.push({
          ...record,
          before: continuousHash(record.before),
          after: continuousHash(record.after),
        });
        return Promise.resolve();
      },
      checkpoint: () => Promise.resolve(),
    };
    const actions: Record<string, V7Action> = {
      lin: { interface: 'tell', args: { text: 'Moss, come see.' } },
      moss: {
        interface: 'name',
        args: { subject: '', text: 'Meeting stones' },
      },
      sol: { interface: 'mark', args: { subject: '', text: 'Sol' } },
      kai: { interface: 'invite', args: { x: 14, y: 15, round: 5, text: '' } },
    };
    const done = await continueContinuousExecution(
      state,
      (_role, input) => {
        const id = 'longContext' in input ? input.longContext.actor : '';
        return Promise.resolve({
          text: JSON.stringify({
            queries: [],
            result_json: JSON.stringify({
              intention: 'Fixture only',
              steps: [
                {
                  action: actions[id] ?? WAIT,
                  repeat: 1,
                  until: null,
                  guard: null,
                },
              ],
              repeat: 1,
              until: null,
              interrupts: [],
              notes: [],
              preferences: [],
              ...(id === 'wren'
                ? { cares: 'Quiet', views: { lin: 'Talkative' } }
                : {}),
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
        });
      },
      sink,
    );
    expect(done.world.tick).toBe(6);
    expect(signs(done.world).length).toBeGreaterThanOrEqual(3);
    expect(actor(done.world, 'wren').memory.cares).toBe('Quiet');
    const frames = reconstructContinuousSegment({
      version: 7,
      start: 0,
      initial: world,
      rounds,
      initialCursors: {},
    });
    expect(continuousHash(frames.at(-1))).toBe(continuousHash(done.world));
  });
});
