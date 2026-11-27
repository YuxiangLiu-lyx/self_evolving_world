import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  expressionFoundation,
  v7Clone,
  v7Distance,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Package,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { CULTURE_V2_OPTIONS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'vocal-music';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const VOICE = `${id}:voice`;
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list itself. */
const EXTRA_EXCLUDED = /history|spiritual/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 130 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex25/hashes-before.json, taken before this change). */
const EXISTING_DIGEST =
  'c200ff56649e61861d1e13315c9ea2f9ecd522a4ac0a2a1dac8594bdd6ce2332';
/** sha256 of JSON.stringify of the expression foundation whose tell delivery is reused, for
 * this scope with incentives off and on, taken before this change. */
const EXPRESSION = {
  off: '2e5e096ccaceb501e321e287b79941f5055ee82d1b4883ca9ba26967a7450f5a',
  on: 'e2423f0e605551529d89eb6b9f09185517a7c922690dff726a2a756f58362416',
};
/** Lin stands 4.9 units from Kai, inside tell's hearing radius; Moss 5.1, outside it. */
const NEAR = { x: 16.7, y: 15 };
const FAR = { x: 11.8, y: 9.9 };

type Scenario = 'long-culture-v2' | 'long-culture-v2-incentives';
type Data = Record<string, unknown>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const music = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
function step(w: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [a.id, actions[a.id] ?? WAIT]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { outcomes: result.outcomes, world: v7Clone(result.world) };
}
/** Steps with everyone waiting until the next step executes round `round`. */
function at(w: V7World, round: number) {
  let world = w;
  while (world.tick < round - 1) world = step(world).world;
  return world;
}
const actor = (w: V7World, who = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const installed = (scenario: Scenario = 'long-culture-v2') => {
  const g = initialLongWorld('long-ex25', scenario);
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Kai studies in rounds 1 and 2 and masters the operation. */
function studied(scenario: Scenario = 'long-culture-v2', world?: V7World) {
  const first = step(world ?? installed(scenario), { kai: LEARN });
  expect(first.outcomes.kai?.success, first.outcomes.kai?.reason).toBe(true);
  const w = step(first.world).world;
  expect(actor(w).mastered).toContain(id);
  return w;
}
function spread(w: V7World) {
  actor(w, 'lin').position = { ...NEAR };
  actor(w, 'moss').position = { ...FAR };
  return w;
}
const hum = (args: Data = {}): V7Action => ({
  interface: id,
  args: { mode: 'hum', ...args },
});
const sing = (args: Data = {}): V7Action => ({
  interface: id,
  args: { mode: 'sing', ...args },
});
const control = (mode: 'resume' | 'cancel'): V7Action => ({
  interface: id,
  args: { mode },
});
const PHRASE = [
  { pitch: 0, beats: 2 },
  { pitch: 2, beats: 1 },
  { pitch: 4, beats: 1 },
  { pitch: 2, beats: 1 },
  { pitch: 0, beats: 3 },
];
const ok = (r: ReturnType<typeof step>, who = 'kai') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const refused = (r: ReturnType<typeof step>, pattern: RegExp, who = 'kai') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  return r.world;
};
const ofKai = (w: V7World, type: string) =>
  w.events.filter((e) => e.actor === 'kai' && e.type === type);
const heardFromKai = (w: V7World) =>
  w.events.filter((e) => e.type === 'heard' && e.data.from === 'kai');
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const voice = (w: V7World) => actor(w).extensionState[VOICE] as Data;
const packet = (w: V7World, who: string) =>
  longOrdinaryInput(w, who).packet as {
    memory: { heard: Data[] };
    execution: { activeState: Data };
  };
/** The documented improvisation, restated: FNV-1a of "id:round" seeds xorshift32 (13, 17, 5);
 * draws give the length (4 + draw % 3), then per note an inner step from [-2, -1, 1, 2] kept
 * within -3..3 and, except for the last note (2 beats), 1 + draw % 2 beats. */
function documented(who: string, round: number) {
  let h = 2166136261;
  for (const ch of `${who}:${String(round)}`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let s = h === 0 ? 1 : h;
  const draw = (n: number) => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s % n;
  };
  const length = 4 + draw(3);
  const notes: { pitch: number; beats: number }[] = [];
  let pitch = 0;
  for (let i = 0; i < length; i++) {
    const last = i === length - 1;
    if (i > 0 && !last)
      pitch = Math.min(3, Math.max(-3, pitch + ([-2, -1, 1, 2][draw(4)] ?? 0)));
    else pitch = 0;
    notes.push({ pitch, beats: last ? 2 : 1 + draw(2) });
  }
  return notes;
}

describe('quiet vocal music in ex25', () => {
  it('is registered first for long-ex25 only, learned in two rounds at 0.2 energy, within the size limit, with new names, no excluded word, and every earlier package byte-identical', () => {
    const pkg = music();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The first ex25 package; later ex25 packages follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex25')[0]).toBe(pkg);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex25',
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        'vocal-music-started',
        'vocal-music-segment',
        'vocal-music-study-segment',
        'vocal-music-paused',
        'vocal-music-resumed',
        'vocal-music-cancelled',
        'vocal-music-completed',
        'vocal-music-ended',
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 2,
      learningEnergy: 0.2,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: [],
      references: {},
      practiceEvidence: 'vocal-music-completed',
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'rounds',
      'phrase',
      'improvise',
      'text',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'hum',
      'sing',
      'resume',
      'cancel',
    ]);
    expect(ability.parameters.properties?.rounds).toMatchObject({
      minimum: 1,
      maximum: 3,
    });
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^vocal-/);
    }
    const g = installed();
    for (const a of [...g.abilities].filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      description: pkg.description,
      reuse: pkg.reuse,
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this one, by id@version, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(130);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // The reused expression foundation is unchanged as data in both incentive settings.
    for (const [key, incentives] of [
      ['off', false],
      ['on', true],
    ] as const)
      expect(
        sha(
          expressionFoundation(
            'long-ex25',
            { ...CULTURE_V2_OPTIONS, incentives },
            5,
          ),
        ),
      ).toBe(EXPRESSION[key]);
    // Only the current scope can install it, and only where heard delivery exists.
    const other = initialLongWorld('long-ex24', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const plain = initialLongWorld('long-ex25', 'long');
    expect(() => v7Install(plain, continuousRegistry(plain), REVISION)).toThrow(
      /needs the expression foundation/,
    );
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex25', 'long-culture-v2');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(g.processes).toEqual(before.processes);
    expect(g.config.vision).toBe(5);
  });

  it('is learned only through two paid study rounds, each humming a practice phrase that people within 5 units hear, and silent study rounds in distress', () => {
    const base = spread(installed());
    refused(step(base, { kai: hum({ improvise: true }) }), /not mastered/);
    const first = step(base, { kai: LEARN }),
      idle = step(base).world;
    const w1 = ok(first);
    expect(actor(idle).vitals.energy - actor(w1).vitals.energy).toBeCloseTo(
      0.2,
      9,
    );
    expect(actor(w1).learning).toMatchObject({ ability: id, remaining: 1 });
    const practice = ofKai(w1, 'vocal-music-study-segment');
    expect(practice).toHaveLength(1);
    expect(practice[0]).toMatchObject({
      interface: null,
      position: actor(w1).position,
      data: {
        mode: 'hum',
        practice: true,
        phrase: documented('kai', 1),
        words: '',
        segment: 1,
        view: { glyph: 'hum-wave', status: 'study', voiced: true },
      },
    });
    expect(heardFromKai(w1).map((e) => e.actor)).toContain('lin');
    expect(heardFromKai(w1).map((e) => e.actor)).not.toContain('moss');
    // The second study round runs whatever is submitted, and masters the operation.
    const w2 = step(w1, { kai: WAIT }).world,
      idle2 = step(idle).world;
    expect(actor(w2).mastered).toContain(id);
    expect(actor(w2).learning).toBeNull();
    expect(actor(idle2).vitals.energy - actor(w2).vitals.energy).toBeCloseTo(
      0.4,
      9,
    );
    expect(ofKai(w2, 'vocal-music-study-segment')[0]?.data).toMatchObject({
      segment: 2,
      phrase: documented('kai', 2),
    });
    expect(voice(w2)).toMatchObject({
      studyRounds: [1, 2],
      studyQuiet: [],
      voiced: [
        { tick: 1, kind: 'study', bout: null },
        { tick: 2, kind: 'study', bout: null },
      ],
    });
    // Study is the kernel's own; in distress it still progresses, but the voice stays silent.
    const starving = v7Clone(base);
    actor(starving).vitals.satiety = 0;
    const quiet = ok(step(starving, { kai: LEARN }));
    expect(actor(quiet).learning).toMatchObject({ ability: id });
    expect(ofKai(quiet, 'vocal-music-study-segment')).toEqual([]);
    expect(heardFromKai(quiet)).toEqual([]);
    expect(voice(quiet)).toMatchObject({
      studyRounds: [],
      studyQuiet: [1],
      voiced: [],
    });
  });

  it('costs 0.5 energy per voiced round and nothing else; refusals, pauses and cancel cost nothing; no material, object, process or tell', () => {
    const ready = at(studied(), 14);
    const voiced = step(ready, {
        kai: sing({ rounds: 2, phrase: PHRASE, text: 'Soft rain on leaves' }),
      }),
      idle = step(ready);
    const w = ok(voiced);
    expect(
      actor(idle.world).vitals.energy - actor(w).vitals.energy,
    ).toBeCloseTo(0.5, 9);
    for (const key of ['health', 'satiety', 'temperature'] as const)
      expect(actor(w).vitals[key]).toBe(actor(idle.world).vitals[key]);
    for (const key of ['stacks', 'objects', 'processes'] as const)
      expect(v7Signature(w[key])).toBe(v7Signature(idle.world[key]));
    expect(w.events.filter((e) => e.type === 'told')).toEqual([]);
    expect(ofKai(w, 'vocal-music-segment')[0]?.data).toMatchObject({
      energy: 0.5,
      segment: 1,
      requested: 2,
      intensity: 'quiet',
      hearing: 5,
    });
    expect(open(w)).toMatchObject({
      status: 'active',
      voiced: 1,
      requested: 2,
      energy: 0.5,
    });
    // Cancel costs nothing beyond the voiced segment, and ends the bout at once.
    const cancelled = ok(step(w, { kai: control('cancel') })),
      waited = step(w).world;
    expect(actor(cancelled).vitals.energy).toBe(actor(waited).vitals.energy);
    expect(actor(cancelled).vitals.energy).toBe(actor(w).vitals.energy);
    expect(open(cancelled)).toBeUndefined();
    expect(voice(cancelled).last).toMatchObject({
      status: 'cancelled',
      voicedSegments: 1,
      requested: 2,
      energyUsed: 0.5,
    });
    expect(ofKai(cancelled, 'vocal-music-cancelled')).toHaveLength(1);
    expect(heardFromKai(cancelled)).toEqual([]);
    // A refused start changes nothing.
    for (const [action, pattern] of [
      [hum({ improvise: true, text: 'Words' }), /Humming has no words/],
      [hum({ phrase: PHRASE, improvise: true }), /either a phrase or/],
      [hum({ phrase: [{ pitch: 0, beats: 1 }] }), /phrase of 2-8 notes/],
      [hum(), /phrase of 2-8 notes/],
      [sing({ improvise: true, text: 'x'.repeat(241) }), /limited to 240/],
      [
        hum({
          phrase: [
            { pitch: 5, beats: 1 },
            { pitch: 0, beats: 1 },
          ],
        }),
        /pitch/,
      ],
      [hum({ rounds: 4, improvise: true }), /rounds|at most 3/],
      [control('resume'), /no open bout to resume/],
      [control('cancel'), /no open bout to cancel/],
    ] as const) {
      const r = step(ready, { kai: action });
      refused(r, pattern);
      expect(actor(r.world).vitals.energy).toBe(
        actor(idle.world).vitals.energy,
      );
      expect(actor(r.world).extensionState[VOICE]).toEqual(
        actor(idle.world).extensionState[VOICE],
      );
      expect(heardFromKai(r.world)).toEqual([]);
    }
  });

  it('delivers each hummed and sung segment to every living person within 5 units, not beyond, as hummed or sung sound in their ordinary heard list', () => {
    let w = at(studied('long-culture-v2', spread(installed())), 3);
    const hummed = step(w, { kai: hum({ phrase: PHRASE }) });
    w = ok(hummed);
    const segment = ofKai(w, 'vocal-music-segment')[0];
    if (!segment) throw new Error('Missing segment.');
    const kai = actor(w).position;
    const listeners = heardFromKai(w).map((e) => e.actor);
    for (const a of w.actors.filter((a) => a.id !== 'kai'))
      expect(listeners.includes(a.id)).toBe(v7Distance(a.position, kai) <= 5);
    expect(v7Distance(actor(w, 'lin').position, kai)).toBeCloseTo(4.9, 9);
    expect(v7Distance(actor(w, 'moss').position, kai)).toBeCloseTo(5.1, 9);
    expect(listeners).toContain('lin');
    expect(listeners).not.toContain('moss');
    expect(listeners).not.toContain('kai');
    const lin = heardFromKai(w).find((e) => e.actor === 'lin');
    expect(lin).toMatchObject({
      interface: null,
      position: null,
      target: null,
      description: 'Kai hummed a quiet 5-note phrase nearby, no words.',
      data: {
        from: 'kai',
        kind: 'hum',
        sound: 'hummed, no words',
        phrase: PHRASE,
        words: '',
        source: segment.id,
        segment: 1,
      },
    });
    expect(segment.data.view).toMatchObject({
      glyph: 'hum-wave',
      actor: 'kai',
      status: 'voicing',
      voiced: true,
      radius: 5,
      badge: null,
    });
    // The heard entry reaches Lin's ordinary input as hummed sound, not as speech.
    const heardList = packet(w, 'lin').memory.heard;
    expect(heardList.at(-1)).toEqual({ tick: 3, ...lin?.data });
    expect(heardList.at(-1)).not.toHaveProperty('text');
    expect(
      packet(w, 'moss').memory.heard.filter((h) => h.from === 'kai'),
    ).toEqual(
      // Moss is beyond 5 units for this segment and heard only nothing from Kai.
      [],
    );
    // A sung segment with words, later and by the same delivery.
    w = at(w, 11);
    const sung = ok(
      step(w, {
        kai: sing({ rounds: 2, phrase: PHRASE, text: 'Soft rain on leaves' }),
      }),
    );
    const linSung = heardFromKai(sung).find((e) => e.actor === 'lin');
    expect(linSung).toMatchObject({
      description:
        'Kai sang a quiet 5-note phrase nearby: "Soft rain on leaves".',
      data: {
        kind: 'sing',
        sound: 'sung with words',
        words: 'Soft rain on leaves',
        segment: 1,
      },
    });
    expect(heardFromKai(sung).map((e) => e.actor)).not.toContain('moss');
    expect(packet(sung, 'lin').memory.heard.at(-1)).toMatchObject({
      tick: 11,
      kind: 'sing',
      words: 'Soft rain on leaves',
    });
    // The open bout is shown with Kai's active work while it lasts.
    expect(packet(sung, 'kai').execution.activeState[OPEN]).toMatchObject({
      status: 'active',
      voiced: 1,
      requested: 2,
    });
    // Moss walks within range: the next segment reaches Moss at Moss's actual position.
    actor(sung, 'moss').position = { x: 11.8, y: 12 };
    const second = ok(
      step(sung, {
        kai: sing({ rounds: 2, phrase: PHRASE, text: 'Soft rain on leaves' }),
      }),
    );
    expect(heardFromKai(second).map((e) => e.actor)).toContain('moss');
    expect(
      heardFromKai(second).find((e) => e.actor === 'moss')?.data,
    ).toMatchObject({ segment: 2, kind: 'sing' });
    expect(packet(second, 'kai').execution.activeState[OPEN]).toBeUndefined();
    // Spoken words from tell keep their own kind and text in the same list.
    const told = ok(
      step(second, {
        lin: { interface: 'tell', args: { text: 'Kai, that was quiet.' } },
      }),
      'lin',
    );
    expect(packet(told, 'kai').memory.heard.at(-1)).toMatchObject({
      from: 'lin',
      kind: 'tell',
      text: 'Kai, that was quiet.',
    });
  });

  it('keeps at most 3 voiced rounds in any 10 rounds, study included, rests 2 rounds after 3, and shares both limits between study, hum and sing', () => {
    let w = studied();
    // Study voiced rounds 1 and 2: only one more round fits now.
    w = refused(
      step(w, { kai: sing({ rounds: 2, improvise: true }) }),
      /at most 3 voiced rounds \(study included\) fit in any 10 rounds; voiced at 1 \(study\), 2 \(study\); 2 voiced round\(s\) fit from round 10/,
    );
    expect(w.tick).toBe(3);
    w = v7Clone(studied());
    w = ok(step(w, { kai: hum({ improvise: true }) }));
    // Rounds 1-3 were voiced in a row: rounds 4 and 5 rest, and the window holds until 11.
    expect(voice(w)).toMatchObject({ restUntil: 5 });
    for (const action of [hum({ improvise: true }), sing({ improvise: true })])
      refused(
        step(w, { kai: action }),
        /vocal rest: .*rounds through 5 stay unvoiced; 1 voiced round\(s\) fit from round 11/,
      );
    w = at(w, 10);
    refused(step(w, { kai: sing({ improvise: true }) }), /fit from round 11/);
    w = ok(step(step(w).world, { kai: sing({ improvise: true }) }));
    expect(w.tick).toBe(11);
    // A start must fit every requested round: three fit only once round 11 leaves the window.
    w = at(w, 14);
    refused(
      step(w, { kai: hum({ rounds: 3, improvise: true }) }),
      /voiced at 11 \(sing\); 3 voiced round\(s\) fit from round 19/,
    );
    // A bout of 3 voiced rounds spread over more than 10 rounds still rests 2 rounds after it.
    w = at(w, 19);
    w = ok(step(w, { kai: hum({ rounds: 3, improvise: true }) }));
    w = step(w).world;
    expect(open(w)).toMatchObject({ status: 'paused', voiced: 1 });
    w = at(w, 29);
    w = ok(step(w, { kai: control('resume') }));
    w = ok(step(w, { kai: control('resume') }));
    expect(w.tick).toBe(30);
    expect(open(w)).toBeUndefined();
    expect(voice(w).last).toMatchObject({
      status: 'completed',
      voicedSegments: 3,
    });
    expect(voice(w)).toMatchObject({ restUntil: 32 });
    // The window alone would allow round 31 (voiced 29 and 30 only); the rest does not.
    const blocked = refused(
      step(w, { kai: sing({ improvise: true }) }),
      /vocal rest: .*rounds through 32 stay unvoiced; 1 voiced round\(s\) fit from round 33/,
    );
    refused(step(blocked, { kai: hum({ improvise: true }) }), /vocal rest/);
    w = at(w, 33);
    ok(step(w, { kai: hum({ improvise: true }) }));
  });

  it('derives an improvised phrase only from the person and the start round, as documented, and keeps it for the whole bout', () => {
    const ready = at(studied(), 14);
    const runs = [0, 1].map(() =>
      ok(step(v7Clone(ready), { kai: hum({ rounds: 2, improvise: true }) })),
    );
    const segments = runs.map((w) => ofKai(w, 'vocal-music-segment'));
    expect(v7Signature(segments[0])).toBe(v7Signature(segments[1]));
    expect(segments[0]?.[0]?.data).toMatchObject({
      improvised: true,
      phrase: documented('kai', 14),
    });
    // The phrase belongs to the bout's start round, not the round of each segment.
    const next = ok(
      step(runs[0] ?? ready, { kai: hum({ rounds: 2, improvise: true }) }),
    );
    expect(ofKai(next, 'vocal-music-segment')[0]?.data).toMatchObject({
      segment: 2,
      phrase: documented('kai', 14),
    });
    // Another round gives the phrase of that round.
    const later = ok(
      step(step(ready).world, { kai: hum({ improvise: true, phrase: [] }) }),
    );
    expect(ofKai(later, 'vocal-music-segment')[0]?.data.phrase).toEqual(
      documented('kai', 15),
    );
    // Bounds of the documented rule, and variety across people and rounds.
    const phrases = new Set<string>();
    for (const who of ['kai', 'lin', 'moss', 'tova'])
      for (let round = 0; round < 60; round++) {
        const notes = documented(who, round);
        phrases.add(JSON.stringify(notes));
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(6);
        expect(notes[0]?.pitch).toBe(0);
        expect(notes.at(-1)).toEqual({ pitch: 0, beats: 2 });
        for (const n of notes) {
          expect(Math.abs(n.pitch)).toBeLessThanOrEqual(3);
          expect([1, 2]).toContain(n.beats);
        }
      }
    expect(phrases.size).toBeGreaterThan(100);
  });

  it('pauses without charge when a round is not voiced, energy runs short, or pain or distress appear; resumes after fresh checks; cancels at once', () => {
    let w = at(spread(studied()), 14);
    const bout = hum({ rounds: 3, phrase: PHRASE });
    w = ok(step(w, { kai: bout }));
    const after1 = actor(w).vitals.energy;
    // Another action takes the next round: the bout pauses at no charge and nothing is heard.
    w = step(w).world;
    expect(actor(w).vitals.energy).toBe(after1);
    expect(heardFromKai(w)).toEqual([]);
    expect(ofKai(w, 'vocal-music-paused')[0]).toMatchObject({
      interface: null,
      description: expect.stringMatching(
        /^Stopped voicing after 1 of 3 segment\(s\): this round was not voiced/,
      ) as unknown,
      data: { status: 'paused', view: { status: 'paused', glyph: null } },
    });
    expect(open(w)).toMatchObject({ status: 'paused', voiced: 1 });
    // The same start does not resume it silently.
    w = refused(step(w, { kai: bout }), /is paused after 1 of 3.*give resume/);
    // resume rechecks and voices segment 2 in the same round; it uses only mode, so the
    // bout keeps its rounds, phrase and words.
    w = ok(
      step(w, {
        kai: {
          interface: id,
          args: { mode: 'resume', rounds: 1, improvise: false, text: '' },
        },
      }),
    );
    expect(ofKai(w, 'vocal-music-resumed')).toHaveLength(1);
    expect(ofKai(w, 'vocal-music-segment')[0]?.data).toMatchObject({
      segment: 2,
      phrase: PHRASE,
    });
    expect(actor(w).vitals.energy).toBeCloseTo(after1 - 0.5, 9);
    // Too little energy for the next round: paused, not charged, not heard.
    actor(w).vitals.energy = 0.4;
    w = ok(step(w, { kai: control('resume') }));
    expect(actor(w).vitals.energy).toBe(0.4);
    expect(heardFromKai(w)).toEqual([]);
    expect(ofKai(w, 'vocal-music-paused')[0]?.description).toMatch(
      /not enough energy: 0\.4 of the 0\.5/,
    );
    w = refused(step(w, { kai: control('resume') }), /not enough energy/);
    // Starving is distress, and the starvation damage it causes is pain in the next round.
    actor(w).vitals.energy = 30;
    actor(w).vitals.satiety = 0;
    w = refused(
      step(w, { kai: control('resume') }),
      /cannot resume voicing now: distress: starving/,
    );
    expect(ofKai(w, 'injured')).toHaveLength(1);
    actor(w).vitals.satiety = 70;
    w = refused(
      step(w, { kai: control('resume') }),
      /pain: you were injured in the last round/,
    );
    expect(actor(w).vitals.energy).toBe(30);
    // Body temperature with thermal damage is distress.
    const cold = v7Clone(w);
    actor(cold).vitals.temperature = 6;
    refused(
      step(cold, { kai: control('resume') }),
      /body temperature 6 is outside 7-34/,
    );
    // Fresh checks pass: the last segment completes the bout, and completion is shown only now.
    w = ok(step(w, { kai: control('resume') }));
    expect(open(w)).toBeUndefined();
    const done = ofKai(w, 'vocal-music-completed')[0];
    expect(done?.data).toMatchObject({
      status: 'completed',
      voicedSegments: 3,
      energyUsed: 1.5,
      view: { status: 'completed', glyph: null, badge: null },
    });
    expect(voice(w).last).toMatchObject({ status: 'completed' });
    // Cancel ends an unfinished bout at once.
    let c = at(spread(studied()), 14);
    c = ok(step(c, { kai: hum({ rounds: 3, improvise: true }) }));
    c = ok(step(c, { kai: control('cancel') }));
    expect(open(c)).toBeUndefined();
    expect(ofKai(c, 'vocal-music-cancelled')[0]?.data).toMatchObject({
      status: 'cancelled',
      voicedSegments: 1,
      view: { status: 'cancelled', glyph: null },
    });
    c = refused(step(c, { kai: control('resume') }), /no open bout/);
    expect(heardFromKai(c)).toEqual([]);
  });

  it('ends an open bout and any study at death, with no voicing or study after respawn', () => {
    let w = at(studied(), 14);
    const bout = hum({ rounds: 2, improvise: true });
    w = ok(step(w, { kai: bout }));
    actor(w).vitals.health = 0.01;
    actor(w).vitals.satiety = 0;
    w = step(w, { kai: bout }).world;
    expect(actor(w).life?.deaths).toBe(1);
    expect(
      w.events
        .filter((e) => e.actor === 'kai')
        .map((e) => e.type)
        .filter((t) => /^vocal-|^died$|^respawned$/.test(t)),
    ).toEqual(['vocal-music-paused', 'vocal-music-ended', 'died', 'respawned']);
    expect(ofKai(w, 'vocal-music-ended')[0]?.data).toMatchObject({
      status: 'ended',
      voicedSegments: 1,
    });
    expect(heardFromKai(w)).toEqual([]);
    expect(open(w)).toBeUndefined();
    expect(voice(w).last).toMatchObject({ status: 'ended', voicedSegments: 1 });
    refused(step(w, { kai: control('resume') }), /no open bout/);
    // Death during study ends it; study does not continue after respawn.
    let s = installed();
    actor(s).vitals.health = 0.01;
    actor(s).vitals.satiety = 0;
    s = ok(step(s, { kai: LEARN }));
    expect(actor(s).life?.deaths).toBe(1);
    expect(actor(s).learning).toBeNull();
    expect(actor(s).mastered).not.toContain(id);
    expect(ofKai(s, 'vocal-music-ended')[0]?.data).toMatchObject({
      status: 'study-ended',
      studyRounds: [],
    });
    expect(voice(s)).toMatchObject({
      studyEndedAt: 1,
      studyQuiet: [1],
      studyRemaining: null,
    });
    s = step(s).world;
    expect(actor(s).mastered).not.toContain(id);
    expect(ofKai(s, 'mastered')).toEqual([]);
    refused(step(s, { kai: hum({ improvise: true }) }), /not mastered/);
  });

  it('never rewards voicing or hearing: no satisfaction, mood, practice milestone, progress credit or expression incentive, with incentives off or on', () => {
    const script = (round: number): Record<string, V7Action> =>
      round === 1
        ? { kai: LEARN }
        : round === 3
          ? { kai: hum({ improvise: true }) }
          : round === 11 || round === 12
            ? {
                kai: sing({
                  rounds: 2,
                  phrase: PHRASE,
                  text: 'Lin, here it is',
                }),
              }
            : {};
    let w = spread(installed()),
      idle = spread(installed());
    const seen: V7Event[] = [];
    for (let round = 1; round <= 16; round++) {
      w = ok(step(w, script(round)));
      idle = step(idle).world;
      seen.push(...w.events);
    }
    // Five segments (two study, one hummed, two sung), each heard by the four people within 5.
    expect(
      seen.filter((e) => e.type === 'heard' && e.data.from === 'kai'),
    ).toHaveLength(20);
    expect(
      seen.filter((e) =>
        [
          'satisfaction',
          'satisfaction-maintained',
          'practice-confirmed',
          'acknowledged',
          'reciprocated',
          'work-noticed',
          'told',
        ].includes(e.type),
      ),
    ).toEqual([]);
    for (const a of w.actors) {
      const b = actor(idle, a.id);
      expect(a.wellbeing.sources).toEqual(b.wellbeing.sources);
      expect(a.experience?.mental).toBe(b.experience?.mental);
      expect(a.experience?.pleasure).toBe(b.experience?.pleasure);
      expect(a.extensionState['long:lastProgress']).toBe(
        b.extensionState['long:lastProgress'],
      );
      expect(
        Object.keys(a.extensionState).filter((k) =>
          k.startsWith('open:practice:'),
        ),
      ).toEqual([]);
    }
    // The install's practice rule exists but nothing can trigger it.
    expect(w.satisfaction.find((r) => r.id === `practice:${id}`)).toMatchObject(
      {
        event: 'practice-confirmed',
        interface: id,
      },
    );
    // Incentives on: sung words naming a listener are not an answer, but told words are.
    let on = studied('long-culture-v2-incentives');
    on = ok(
      step(on, {
        lin: { interface: 'tell', args: { text: 'Kai, would you hum?' } },
      }),
      'lin',
    );
    const sung = ok(
      step(on, {
        kai: sing({ improvise: true, text: 'Lin, here it is' }),
      }),
    );
    expect(heardFromKai(sung).map((e) => e.actor)).toContain('lin');
    expect(sung.events.filter((e) => e.type === 'acknowledged')).toEqual([]);
    expect(sung.state['expression:contacts']).toEqual(
      on.state['expression:contacts'],
    );
    const told = ok(
      step(on, {
        kai: { interface: 'tell', args: { text: 'Lin, here it is' } },
      }),
    );
    expect(
      told.events.filter((e) => e.type === 'acknowledged').map((e) => e.actor),
    ).toEqual(['lin']);
    // Voicing next to something Lin made is not noticing it; waiting there is.
    const alone = v7Clone(studied('long-culture-v2-incentives'));
    actor(alone).position = { x: 23, y: 10 };
    alone.objects.push({
      id: 'fixture-mat',
      kind: 'woven-mat',
      name: 'Woven mat',
      spatial: {
        x: 23.6,
        y: 10.6,
        angle: 0,
        shape: { kind: 'circle', radius: 0.2 },
        solid: false,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'loose-material',
        color: '#a08060',
        accent: '#d0b080',
        label: 'Mat',
        state: 'ready',
      },
      data: {},
      createdBy: 'lin',
      createdAt: 0,
      revision: 'fixture@1',
    });
    const voicedThere = ok(step(alone, { kai: hum({ improvise: true }) }));
    expect(voicedThere.events.filter((e) => e.type === 'work-noticed')).toEqual(
      [],
    );
    const waitedThere = step(alone).world;
    expect(
      waitedThere.events
        .filter((e) => e.type === 'work-noticed')
        .map((e) => [e.actor, e.data.by]),
    ).toEqual([['lin', 'kai']]);
  });

  it('keeps every agent-visible text it adds clear of the excluded vocabulary', () => {
    let w = spread(installed());
    const seen: V7Event[] = [];
    const script: Record<number, V7Action> = {
      1: LEARN,
      3: hum({ improvise: true }),
      14: hum({ rounds: 3, phrase: PHRASE }),
      16: control('resume'),
      17: control('cancel'),
      26: sing({ improvise: true }),
    };
    for (let round = 1; round <= 26; round++) {
      const action = script[round];
      w = step(w, action ? { kai: action } : {}).world;
      seen.push(
        ...w.events.filter(
          (e) =>
            e.type.startsWith('vocal-music') ||
            (e.type === 'heard' && e.data.from === 'kai'),
        ),
      );
      if (round === 15) {
        const text = JSON.stringify(longOrdinaryInput(w, 'kai'));
        expect(text).toContain(OPEN);
        expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
      }
    }
    expect(new Set(seen.map((e) => e.type))).toEqual(
      new Set([
        'vocal-music-study-segment',
        'vocal-music-started',
        'vocal-music-segment',
        'vocal-music-completed',
        'vocal-music-paused',
        'vocal-music-resumed',
        'vocal-music-cancelled',
        'heard',
      ]),
    );
    const text = JSON.stringify(seen);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    for (const who of ['kai', 'lin', 'sol']) {
      const input = JSON.stringify(longOrdinaryInput(w, who));
      expect(input).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(input).not.toMatch(EXTRA_EXCLUDED);
    }
    expect(JSON.stringify(actor(w).extensionState[VOICE])).not.toMatch(
      IMPORT_EXCLUDED_WORDS,
    );
  });
});
