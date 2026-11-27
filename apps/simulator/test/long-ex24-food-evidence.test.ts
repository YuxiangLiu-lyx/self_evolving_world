import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'assess-food-evidence';
const STATE = `long:${id}`;
const EXAMINE = 'examine-material';
const ROOT = 'commons-root-0-0';
const BERRIES = 'commons-berry-1-0';
const OTHER_ROOTS = 'commons-root-0-1';
const TRAITS = `${ROOT}:unit-1:traits`;
const OBSERVED = `${ROOT}:observed-state`;
const LOAD = 'root:load response:load-band-1';
const RECORD = `${ROOT}:unit-1:food-evidence`;
const SCOPED =
  'no validated non-ingestive method established among supplied accessible evidence; toxicity, edibility and preparation requirements remain unknown';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition|history/i;
/** Package ids the brief reserves for earlier work. */
const TAKEN = [
  'cultivate-plants',
  'branch-screen',
  'hand-weave-fiber-mat',
  'hand-break-food',
  'hand-twist-fiber-cord',
  'hand-tie-cord-knot',
  'hand-join-fiber-cords',
  'hand-bind-crossing',
  'hand-twist-sectioned-cord',
  'hand-lash-crossing',
  'hand-frap-crossing',
  'hand-twist-long-sectioned-cord',
  'plant-cultivation',
  'hearth-food-preparation',
  'mechanical-food-handling',
  'plant-establishment-trial',
  'unheated-food-preparation',
  'thermal-food-preparation',
  'food-air-exposure-trial',
  'thin-slice-food-drying-trial',
  'cutting-edge-assessment',
  'shell-compression-opening',
  'lever-mass-comparator',
  'apply-marking-material',
  'open-and-separate-sample',
  'air-dry-food-trial',
  'small-combustion-source',
  'beam-mass-comparator',
  'compare-material-samples',
  'targeted-food-constituent-test',
  'prepare-shelled-food',
  'draw-from-observation',
  'sleep-in-place',
  'rooted-plant-watering',
  'crack-and-separate-casing',
  'shape-and-use-wooden-digging-tool',
  'propagate-from-seed',
  'prepare-ventilated-food-storage',
  'construct-weather-shelter',
  EXAMINE,
  'length-reference',
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 122 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before-5.json, taken before this change). */
const EXISTING_DIGEST =
  '97adb70b94adee2ab841de13ea9e3595804d382850a4355652597acc993e7f32';
/** sha256 of JSON.stringify of each package whose code this one reuses, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'targeted-food-constituent-test@1':
    '4e5e92968fb63048ff3d3a173b648bba40b19ed511ca37d0ea52b1a787f4668b',
  'construct-weather-shelter@1':
    '74ca19cc7fd391e6f36532bc4a57f2a171ee6c5872be2ec220bca1e34ec14712',
  'examine-material@1':
    '102231e4e844a9b08851daf8a00c21459442f572c98c3f915ee279fe62afbbdb',
  'length-reference@1':
    'e0f1e70d3f125c5b7f75eba7da6684084c427dcb0a2a44f638f9d2e425f3aaae',
};
/** Lin's stand between the meadow roots commons-root-0-0 and the berry bush commons-berry-1-0. */
const STAND = { x: 17.21, y: 16.85 };
/** Within reach of the second meadow-root source commons-root-0-1. */
const ROOTS_STAND = { x: 19.0, y: 14.6 };
/** Kai stands within hearing and sight of Lin; the other four wait clear of both. */
const PARK: Record<string, { x: number; y: number }> = {
  kai: { x: 16.3, y: 16.4 },
  moss: { x: 17, y: 9 },
  sol: { x: 17.6, y: 9 },
  wren: { x: 18.2, y: 9 },
  ivo: { x: 18.8, y: 9 },
};
/** A world time after dusk: light is 0 from time 36 to 79 of the day in this seed. */
const NIGHT = 40;
const DAY = 20;
/** Hidden or latent values an assessment must never carry. */
const HIDDEN_KEYS = [
  'toxicity',
  'nutrition',
  'mass',
  'unitMass',
  'unitWater',
  'unitSolids',
  'waterShare',
  'flexibility',
  'hardness',
  'decay',
  'contaminated',
  'contamination',
];

const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
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
  return { ...result, world: v7Clone(result.world) };
}
const actor = (w: V7World, name = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const last = (w: V7World, type: string) => {
  const e = w.events.filter((e) => e.type === type).at(-1);
  if (!e) throw new Error(`Missing ${type}.`);
  return e;
};
const data = (w: V7World, type = 'food-evidence-assessed') =>
  last(w, type).data as Record<string, unknown>;
const viewOf = (w: V7World) => data(w).view as Record<string, unknown>;
const act = (extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: {
    mode: 'assess',
    target: ROOT,
    specimen: 1,
    evidenceRefs: [],
    ...extra,
  },
});
const run = (extra: Record<string, unknown> = {}) =>
  act({ mode: 'execute-validated-method', ...extra });
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
const at = (w: V7World, p: { x: number; y: number }, who = 'lin') => {
  const copy = v7Clone(w);
  actor(copy, who).position = { ...p };
  return fed(copy);
};
const timed = (w: V7World, time: number) => {
  const copy = v7Clone(w);
  copy.time = time;
  return copy;
};
function genesis() {
  return initialLongWorld('long-ex24', 'long-culture-v2', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  const w = v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
  for (const a of w.actors)
    a.position = { ...(a.id === 'lin' ? STAND : (PARK[a.id] ?? a.position)) };
  return fed(w);
}
const learn = (w: V7World, ability = id) => {
  let s = step(w, {
    lin: { interface: 'learn', args: { ability } },
  }).world;
  s = step(s).world;
  expect(actor(s).mastered).toContain(ability);
  return fed(s);
};
const ok = (r: ReturnType<typeof step>, who = 'lin') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return fed(r.world);
};
const mine = (w: V7World) =>
  (actor(w).extensionState[STATE] ?? null) as {
    assessments: Record<string, unknown>[];
  } | null;
/** Energy the action used beyond the same round spent waiting; every stack and object is as
 * after waiting, so nothing is consumed, reserved or moved. */
function cost(w: V7World, action: V7Action, who = 'lin') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
  expect(r.world.stacks.filter((s) => s.reservedFor)).toEqual(
    idle.stacks.filter((s) => s.reservedFor),
  );
  const energy =
    Math.round(
      (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
        1e8,
    ) / 1e8;
  return { world: fed(r.world), idle, energy };
}
/** The action fails and changes no vitals, stacks, objects, records or knowledge. */
function unchanged(w: V7World, action: V7Action, who = 'lin') {
  const result = step(w, { [who]: action }),
    idle = step(w).world,
    own = (x: V7World) => ({
      log: actor(x, who).extensionState[STATE] ?? null,
      knowledge: actor(x, who).memory.knowledge ?? {},
    });
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(own(result.world))).toBe(v7Signature(own(idle)));
  expect(
    result.world.events.filter(
      (e) => e.type.startsWith('food-evidence-') || e.type === 'trial-result',
    ),
  ).toEqual([]);
  return result.outcomes[who]?.reason ?? '';
}
const visibleText = (log: V7Event[]) =>
  JSON.stringify(log.map((e) => [e.type, e.description, e.data]));
function keys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keys(x, out);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keys(x, out);
    }
  return out;
}
/** Events of this round's actions by Lin (environmental notices excluded). */
const linTypes = (w: V7World) =>
  w.events
    .filter((e) => e.actor === 'lin' && e.interface === id)
    .map((e) => e.type);

interface Fixture {
  /** Dark, Lin beside the meadow roots with the run's kinds of records. */
  ready: V7World;
  /** The heard message id of Kai's claim about the roots. */
  heard: string;
  /** Lin's own berry and root items. */
  berry: string;
  root: string;
}
/** Lin has studied the operation and examine-material@1 (installed after it, as in the run). In
 * daylight she gathers and eats a berry (an eating record) and gathers a root from a second
 * source and press-tests it (a verified material record). After dusk Kai names the meadow roots
 * and tells Lin they are edible, while Lin observes their visible state and inspects unit 1 in
 * place, as she did in the run. */
let cache: Fixture | null = null;
function fixture(): Fixture {
  if (!cache) {
    let w = learn(installed());
    w = fed(v7Clone(v7Install(w, continuousRegistry(w), `${EXAMINE}@1`)));
    w = learn(w, EXAMINE);
    w = ok(
      step(w, {
        lin: { interface: 'gather', args: { target: BERRIES, quantity: 2 } },
      }),
    );
    w = ok(
      step(w, {
        lin: {
          interface: 'eat',
          args: { target: 'resource:berry', quantity: 1 },
        },
      }),
    );
    w = ok(
      step(at(w, ROOTS_STAND), {
        lin: {
          interface: 'gather',
          args: { target: OTHER_ROOTS, quantity: 1 },
        },
      }),
    );
    const root = w.stacks.find(
      (s) => s.owner === 'lin' && s.resource === 'root',
    );
    if (!root) throw new Error('Missing root.');
    w = ok(
      step(w, {
        lin: {
          interface: 'probe',
          args: { target: root.id, mode: 'press', intensity: 0.5 },
        },
      }),
    );
    expect(actor(w).memory.knowledge?.[LOAD]?.verified).toBe(true);
    w = timed(at(w, STAND), NIGHT);
    w = ok(
      step(w, {
        kai: {
          interface: 'name',
          args: { subject: ROOT, text: 'Sweet roots' },
        },
        lin: {
          interface: 'probe',
          args: { target: ROOT, mode: 'observe', intensity: 0 },
        },
      }),
    );
    w = ok(
      step(w, {
        kai: {
          interface: 'tell',
          args: { text: 'Lin, these meadow roots are fine to eat raw.' },
        },
        lin: {
          interface: EXAMINE,
          args: { mode: 'inspect', target: ROOT, specimen: 1 },
        },
      }),
    );
    const heard = (
      actor(w).extensionState['expression:heard'] as Record<string, unknown>[]
    ).at(-1);
    const berry = w.stacks.find(
      (s) => s.owner === 'lin' && s.resource === 'berry',
    );
    if (!heard || typeof heard.source !== 'string' || !berry)
      throw new Error('Missing fixture records.');
    expect(actor(w).memory.discoveries?.berry).toBeDefined();
    expect(actor(w).memory.knowledge?.[TRAITS]).toBeDefined();
    expect(actor(w).memory.knowledge?.[OBSERVED]).toBeDefined();
    cache = { ready: w, heard: heard.source, berry: berry.id, root: root.id };
  }
  return { ...cache, ready: v7Clone(cache.ready) };
}

describe('assess food evidence without eating in ex24', () => {
  it('is scoped to ex24, registered last, learned in two rounds at 0.2 energy, within the size limit, and leaves every existing package byte-identical', () => {
    const other = initialLongWorld('long-ex23', 'long-culture-v2-oldgoal');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), `${id}@1`)).toThrow(
      /not approved/,
    );
    const g = genesis();
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    // The fifth ex24 package; later ex24 packages follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex24')[4]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 5),
    ).toEqual([
      'prepare-ventilated-food-storage',
      'construct-weather-shelter',
      EXAMINE,
      'length-reference',
      id,
    ]);
    expect(pkg).toMatchObject({
      scope: 'long-ex24',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: ['food-evidence-assessed'],
    });
    expect(pkg.afterEnvironment).toBeUndefined();
    expect(pkg.onDeath).toBeUndefined();
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 2,
      learningEnergy: 0.2,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'food-evidence-assessed',
      references: { target: 'optional-exact-visible' },
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['assess', 'execute-validated-method'],
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'target',
      'specimen',
      'evidenceRefs',
      'methodRef',
      'equipmentRefs',
      'quantity',
    ]);
    expect(ability.parameters.required).toEqual([
      'mode',
      'target',
      'specimen',
      'evidenceRefs',
    ]);
    // New package, ability, equivalence, handler and event names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^food-evidence-/);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, the reused ones included, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    expect(existing).toHaveLength(122);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; two study rounds at 0.2 energy each master it.
    const fresh = installed();
    expect(unchanged(fresh, act())).toMatch(/master/i);
    const first = cost(fresh, { interface: 'learn', args: { ability: id } });
    expect(first.energy).toBe(0.2);
    expect(actor(first.world).learning).toMatchObject({
      ability: id,
      remaining: 1,
    });
    let now = step(fresh, {
      lin: { interface: 'learn', args: { ability: id } },
    }).world;
    let idle = step(fresh).world;
    now = step(now).world;
    idle = step(idle).world;
    expect(actor(now).mastered).toContain(id);
    expect(actor(now).learning).toBeNull();
    expect(
      Math.round((actor(idle).vitals.energy - actor(now).vitals.energy) * 1e8) /
        1e8,
    ).toBe(0.4);
    // Study grants no record, finding or practice milestone.
    expect(actor(now).memory.knowledge ?? {}).toEqual(
      actor(idle).memory.knowledge ?? {},
    );
    expect(actor(now).extensionState[STATE]).toBeUndefined();
    expect(now.events.map((e) => e.type)).not.toContain('practice-confirmed');
  });

  it('assesses unit 1 of the meadow roots in the dark for one round and 0.2 energy: a personal record and an event, nothing consumed, moved or reserved, no reward, read back with consult', () => {
    const { ready } = fixture();
    const r = cost(ready, act({ evidenceRefs: [TRAITS, OBSERVED, 'berry'] }));
    expect(r.energy).toBe(0.2);
    const s = r.world,
      round = ready.tick + 1;
    expect(s.objects.find((o) => o.id === ROOT)?.data.stock).toBe(20);
    expect(linTypes(s)).toEqual(['trial-result', 'food-evidence-assessed']);
    const d = data(s);
    const knowledge = actor(ready).memory.knowledge ?? {};
    expect(d).toMatchObject({
      target: ROOT,
      specimen: 1,
      setting: 'in place in its source',
      round,
      status: 'inconclusive',
      conclusion: SCOPED,
      candidateProtocol: null,
      equipment: [],
      requestedQuantity: null,
      newFinding: true,
      consumed: 0,
      reserved: false,
      moved: false,
      energy: 0.2,
      record: last(s, 'trial-result').id,
      conditions: { light: 0, dark: true },
      checks: {
        specimen: 'accessible within reach',
        evidenceComplete: true,
        applicable: [TRAITS, OBSERVED],
        stale: [],
        validatedMethod: false,
        light: 'dark',
      },
    });
    // Each cited record with its version: round, evidence event and content digest.
    expect(d.evidence).toEqual([
      {
        id: TRAITS,
        kind: 'personal record',
        round: knowledge[TRAITS]?.tick,
        event: knowledge[TRAITS]?.evidence,
        digest: expect.stringMatching(/^[0-9a-f]{8}$/) as unknown,
        category: 'direct observation',
        current: 'current',
      },
      {
        id: OBSERVED,
        kind: 'personal record',
        round: knowledge[OBSERVED]?.tick,
        event: knowledge[OBSERVED]?.evidence,
        digest: expect.stringMatching(/^[0-9a-f]{8}$/) as unknown,
        category: 'direct observation',
        current: 'current',
      },
      {
        id: 'berry',
        kind: 'eating record',
        round: actor(ready).memory.discoveries?.berry?.observedAt,
        event: null,
        digest: expect.stringMatching(/^[0-9a-f]{8}$/) as unknown,
        category: 'inapplicable',
        current: null,
      },
    ]);
    expect(d.inapplicable).toEqual([
      { ref: 'berry', why: 'concerns berry only, not root' },
    ]);
    // The three questions are reported separately, each unknown and unsupported.
    expect(
      (d.findings as Record<string, unknown>[]).map((f) => [
        f.question,
        f.status,
        f.supported,
        f.claim,
        f.method,
        f.detectionLimit,
        f.uncertainty,
      ]),
    ).toEqual(
      ['toxicity', 'edibility', 'preparation'].map((q) => [
        q,
        'unknown',
        false,
        null,
        null,
        null,
        null,
      ]),
    );
    expect(d.limitations).toEqual(
      expect.arrayContaining([
        SCOPED,
        'absence of a result is not a negative result; a negative result for one hazard never establishes general edibility',
        'this does not show that no such method can exist',
      ]),
    );
    expect(last(s, 'food-evidence-assessed').description).toMatch(
      /Missing: identificationReference, validatedProtocol, light, absoluteBalance\. Nothing was handled, tasted, consumed, moved or reserved\.$/,
    );
    // Reusable drawing metadata: inconclusive, no badge, assay, tools, reagents or new sight.
    expect(viewOf(s)).toMatchObject({
      operation: id,
      mode: 'assess',
      actor: 'lin',
      target: ROOT,
      specimen: 1,
      status: 'inconclusive',
      progress: 1,
      evidenceRefs: [TRAITS, OBSERVED, 'berry'],
      methodRef: null,
      conditions: { light: 0, dark: true },
      result: 'unknown',
      limitations: ['dark', 'missing-method'],
      priorObservations: [TRAITS, OBSERVED],
      newlySeen: [],
      badge: null,
      assay: null,
      tools: [],
      reagents: [],
      samples: [],
      evidence: last(s, 'trial-result').id,
      label: 'inconclusive: toxicity, edibility and preparation unknown',
    });
    // A personal, unverified record of the same assessment, and the log entry.
    const rec = actor(s).memory.knowledge?.[RECORD];
    expect(rec).toMatchObject({
      subject: 'root',
      verified: false,
      property: 'non-ingestive food evidence assessment of one unit',
      evidence: last(s, 'trial-result').id,
      tick: round,
    });
    expect(rec?.value).toMatchObject({
      target: ROOT,
      specimen: 1,
      conclusion: SCOPED,
      status: 'inconclusive',
      findings: [
        { question: 'toxicity', status: 'unknown' },
        { question: 'edibility', status: 'unknown' },
        { question: 'preparation', status: 'unknown' },
      ],
      directObservations: [TRAITS, OBSERVED],
      validatedFindings: [],
      inapplicable: ['berry'],
      methodRef: null,
    });
    expect(mine(s)?.assessments).toHaveLength(1);
    expect(mine(s)?.assessments[0]).toMatchObject({
      id: `${id}-${String(round)}-lin`,
      target: ROOT,
      specimen: 1,
      status: 'inconclusive',
      rounds: 1,
      energy: 0.2,
      record: last(s, 'trial-result').id,
    });
    // No reward: no confirmed information, practice or qualified event, no mental change.
    expect(
      s.events.filter(
        (e) =>
          ['information-confirmed', 'practice-confirmed'].includes(e.type) ||
          e.data.qualified === true,
      ),
    ).toEqual([]);
    expect(actor(s).wellbeing.mental).toBe(actor(r.idle).wellbeing.mental);
    expect(actor(s).wellbeing.sources).toEqual(actor(r.idle).wellbeing.sources);
    expect(actor(s).experience?.mental).toEqual(
      actor(r.idle).experience?.mental,
    );
    // Agent-visible text avoids the excluded words.
    const text = visibleText(s.events.filter((e) => e.actor === 'lin'));
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    // consult reads the record at its own 1-round, 0.2-energy contract.
    const read = cost(s, {
      interface: 'consult',
      args: { kind: 'knowledge', subject: RECORD },
    });
    expect(read.energy).toBe(0.2);
    expect(data(read.world, 'record-consulted')).toMatchObject({
      kind: 'knowledge',
      subject: RECORD,
      record: { key: RECORD, value: { conclusion: SCOPED } },
    });
    // The same unchanged inputs give the same finding again: paid, but not new.
    const again = cost(
      read.world,
      act({ evidenceRefs: [TRAITS, OBSERVED, 'berry'] }),
    );
    expect(again.energy).toBe(0.2);
    expect(data(again.world).newFinding).toBe(false);
    expect(mine(again.world)?.assessments).toHaveLength(2);
    // With no evidence at all it is still a valid paid assessment yielding a limitation report.
    const none = cost(ready, act());
    expect(none.energy).toBe(0.2);
    expect(data(none.world)).toMatchObject({
      status: 'inconclusive',
      conclusion: SCOPED,
      evidence: [],
      directObservations: [],
    });
    expect(data(none.world).unknowns).toContain(
      'current traits of unit 1: no current record cited; examine-material inspect is a separate action',
    );
  });

  it('keeps direct observations, validated findings, unverified claims and unknowns separate, reports toxicity, edibility and preparation independently, and drops stale or unrelated records', () => {
    const { ready, heard, root } = fixture();
    const knowledge = actor(ready).memory.knowledge ?? {};
    const r = cost(
      ready,
      act({ evidenceRefs: [TRAITS, LOAD, heard, 'berry'] }),
    );
    const d = data(r.world);
    expect(d.directObservations).toEqual([
      {
        ref: TRAITS,
        kind: 'personal record',
        round: knowledge[TRAITS]?.tick,
        current: 'current',
        observed: [
          'material: Meadow roots',
          'form: food item',
          'wholeness: whole unit',
          'setting: in place in its source',
        ],
        scope:
          'qualitative traits of one handled unit (nondestructive handling and looking within reach): appearance and handling, not food safety',
      },
    ]);
    expect(d.validatedFindings).toEqual([
      {
        ref: LOAD,
        round: knowledge[LOAD]?.tick,
        scope:
          'load response by physical press trial consuming 0.1 material (load-band-1); it tests no food hazard or preparation claim',
        addresses: [],
      },
    ]);
    const claims = d.unverifiedClaims as Record<string, unknown>[];
    expect(claims[0]).toEqual({
      ref: ROOT,
      claim: 'the shown name "Meadow roots"',
      why: 'a label, not an identification or a food finding',
    });
    const sign = ready.objects.find(
      (o) => o.kind === 'name' && o.data.subject === ROOT,
    );
    expect(claims[1]).toEqual({
      ref: sign?.id,
      claim: `a name sign about ${ROOT}`,
      why: 'a sign is not evidence of identity, toxicity, edibility or preparation',
    });
    expect(claims[2]).toMatchObject({
      ref: heard,
      claim: `heard message ${heard}`,
    });
    expect(claims[2]?.why).toMatch(
      /^heard from kai in round \d+: hearsay, not tested; it cannot establish identity, toxicity, edibility or preparation$/,
    );
    expect(claims).toHaveLength(3);
    expect(d.inapplicable).toEqual([
      { ref: 'berry', why: 'concerns berry only, not root' },
    ]);
    expect(d.unknowns).toEqual([
      'identity of this specimen: no applicable validated identification reference; too dark for any new visual identification, which must wait for light',
      'toxicity: unknown; it needs a validated non-ingestive assay or identification reference applicable to this specimen, naming the tested hazard, its detection limit and uncertainty',
      'edibility: unknown; it needs validated findings covering every relevant hazard, and an applicable identification reference; a negative result for one hazard is not enough',
      'preparation: unknown; it needs an applicable validated preparation reference; no recipe or detoxification efficacy is guessed',
      'color, surface, damage, worked, wear of unit 1: not seen when recorded',
      `whether other units of ${ROOT} match unit 1`,
    ]);
    // Each question names what would be needed to support it; none is supported.
    const findings = d.findings as Record<string, unknown>[];
    expect(new Set(findings.map((f) => f.requires)).size).toBe(3);
    for (const f of findings)
      expect(f).toMatchObject({
        status: 'unknown',
        supported: false,
        scope: `unit 1 of ${ROOT}`,
        basis:
          'no validated non-ingestive method among the supplied accessible evidence',
      });
    // The unmet requirements, with ex21's bill states.
    expect(
      (d.requirements as Record<string, unknown>[]).map((x) => [
        x.key,
        x.status,
      ]),
    ).toEqual([
      ['specimen', 'present'],
      ['identificationReference', 'missing'],
      ['validatedProtocol', 'missing'],
      ['equipment', 'unestablished'],
      ['controls', 'unestablished'],
      ['materials', 'unestablished'],
      ['safeConditions', 'unestablished'],
      ['light', 'missing'],
      ['absoluteBalance', 'missing'],
    ]);
    expect(d.missing).toEqual([
      'identificationReference',
      'validatedProtocol',
      'light',
      'absoluteBalance',
    ]);
    // Another person gathers one unit from the source: Lin's observations of it go stale.
    const g = step(at(ready, { x: 17.9, y: 16.6 }, 'moss'), {
      moss: { interface: 'gather', args: { target: ROOT, quantity: 1 } },
    });
    expect(g.outcomes.moss?.success, g.outcomes.moss?.reason).toBe(true);
    const later = cost(fed(g.world), act({ evidenceRefs: [TRAITS, OBSERVED] }));
    const e = data(later.world);
    expect(e.directObservations).toEqual([]);
    expect(e.inapplicable).toEqual([
      {
        ref: TRAITS,
        why: `stale: ${ROOT} changed after round ${String(knowledge[TRAITS]?.tick)}; examine it again with examine-material`,
      },
      {
        ref: OBSERVED,
        why: `stale: ${ROOT} changed after round ${String(knowledge[OBSERVED]?.tick)}; examine it again with examine-material`,
      },
    ]);
    expect(e.checks).toMatchObject({
      applicable: [],
      stale: [TRAITS, OBSERVED],
    });
    expect(e.unknowns).toContain(
      'current traits of unit 1: no current record cited; examine-material inspect is a separate action',
    );
    // A record of the source does not apply to Lin's carried root from another source.
    const item = cost(
      ready,
      act({ target: root, evidenceRefs: [TRAITS, LOAD] }),
    );
    expect(data(item.world)).toMatchObject({
      target: root,
      setting: 'carried',
      inapplicable: [
        {
          ref: TRAITS,
          why: `not a record of ${root}; other sources and units need not match`,
        },
      ],
      validatedFindings: [{ ref: LOAD, addresses: [] }],
      status: 'inconclusive',
    });
    expect(
      (data(item.world).unverifiedClaims as Record<string, unknown>[])[0],
    ).toMatchObject({ ref: root, claim: 'the shown name "Meadow roots"' });
  });

  it('makes no new visual identification in darkness, and in light still identifies nothing without a validated reference', () => {
    const { ready } = fixture();
    const night = cost(ready, act({ evidenceRefs: [TRAITS] }));
    const day = cost(timed(ready, DAY), act({ evidenceRefs: [TRAITS] }));
    const n = data(night.world),
      d = data(day.world);
    expect(n.conditions).toMatchObject({ dark: true });
    expect(d.conditions).toMatchObject({ dark: false });
    expect((n.unknowns as string[])[0]).toBe(
      'identity of this specimen: no applicable validated identification reference; too dark for any new visual identification, which must wait for light',
    );
    expect((d.unknowns as string[])[0]).toBe(
      'identity of this specimen: no applicable validated identification reference; appearance alone identifies nothing',
    );
    expect(viewOf(night.world).limitations).toEqual(['dark', 'missing-method']);
    expect(viewOf(day.world).limitations).toEqual(['missing-method']);
    expect(n.limitations).toContain(
      'dark: no new visual identification; earlier observations are cited as recorded, not seen again',
    );
    expect(d.limitations).not.toContain(
      'dark: no new visual identification; earlier observations are cited as recorded, not seen again',
    );
    // The earlier observation is cited as recorded, never as newly seen, in both lights.
    expect(n.directObservations).toEqual(d.directObservations);
    expect(viewOf(night.world).newlySeen).toEqual([]);
    expect(viewOf(day.world).newlySeen).toEqual([]);
    expect(n.unknowns).toContain(
      'color, surface, damage, worked, wear of unit 1: not seen when recorded',
    );
    expect(d.unknowns).toContain(
      'color, surface, damage, worked, wear of unit 1: not seen when recorded',
    );
    const light = (x: Record<string, unknown>) =>
      (x.requirements as Record<string, unknown>[]).find(
        (r) => r.key === 'light',
      );
    expect(light(n)).toMatchObject({
      status: 'missing',
      basis: 'it is dark here now',
    });
    expect(light(d)).toMatchObject({
      status: 'present',
      basis: 'lit here now',
    });
    // Light changes nothing about the conclusion.
    for (const x of [n, d]) {
      expect(x.status).toBe('inconclusive');
      expect(x.conclusion).toBe(SCOPED);
      expect(
        (x.findings as Record<string, unknown>[]).every(
          (f) => f.status === 'unknown' && f.supported === false,
        ),
      ).toBe(true);
    }
    expect(d.missing).toEqual([
      'identificationReference',
      'validatedProtocol',
      'absoluteBalance',
    ]);
  });

  it('reads and discloses no hidden food value', () => {
    const { ready, heard } = fixture();
    const alter = (w: V7World) => {
      const x = v7Clone(w);
      for (const r of x.resources.filter((r) =>
        ['root', 'berry'].includes(r.id),
      )) {
        r.toxicity = 37;
        r.nutrition = 3;
      }
      return x;
    };
    const refs = { evidenceRefs: [TRAITS, OBSERVED, heard, 'berry'] };
    const a = cost(ready, act(refs)).world;
    const b = cost(alter(ready), act(refs)).world;
    const strip = (w: V7World) => ({
      description: last(w, 'food-evidence-assessed').description,
      data: data(w),
      record: last(w, 'trial-result').data,
      knowledge: actor(w).memory.knowledge?.[RECORD],
    });
    // The output does not depend on the latent food values at all.
    expect(strip(b)).toEqual(strip(a));
    const found = keys(strip(a));
    for (const k of HIDDEN_KEYS) expect(found.has(k)).toBe(false);
    // The eating record's values are never copied, only its id and round.
    const json = JSON.stringify(strip(a));
    expect(json).not.toMatch(/"(nutrition|toxicity|observedAt)":/);
    // The heard claim's words are not repeated either.
    expect(json).not.toMatch(/fine to eat raw/);
  });

  it('refuses malformed or inaccessible input at no cost', () => {
    const { ready, berry } = fixture();
    const kaiItem = {
      id: 'item-kai-berry',
      resource: 'berry',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(ready, 'kai').position },
      owner: 'kai',
      origin: BERRIES,
    };
    const w = v7Clone(ready);
    w.stacks.push(kaiItem);
    expect(unchanged(w, act({ target: 'nowhere' }))).toMatch(/Reference/);
    expect(unchanged(w, act({ target: OTHER_ROOTS }))).toMatch(
      /beyond reach; move next to it first\. Nothing was spent\./,
    );
    expect(unchanged(w, act({ specimen: 21 }))).toMatch(
      /shows 20 unit\(s\); specimen is at most 20/,
    );
    expect(unchanged(w, act({ specimen: 0 }))).toMatch(/specimen/);
    expect(
      unchanged(w, {
        interface: id,
        args: { mode: 'assess', target: ROOT, specimen: 1 },
      }),
    ).toMatch(/evidenceRefs is required/);
    expect(unchanged(w, act({ mode: 'taste' }))).toMatch(/declared choices/);
    expect(
      unchanged(
        w,
        act({ evidenceRefs: [TRAITS, OBSERVED, 'berry', LOAD, 'b-5'] }),
      ),
    ).toMatch(/evidenceRefs accepts at most 4 complete record ids\./);
    expect(unchanged(w, act({ evidenceRefs: ['no-such-record'] }))).toMatch(
      /evidenceRefs: no-such-record is not one of your complete records/,
    );
    // A paged fragment of a record is not a complete record.
    const paged = v7Clone(w);
    const k = actor(paged).memory.knowledge;
    if (!k) throw new Error('Missing knowledge.');
    k['root:fragment'] = {
      key: 'root:fragment',
      subject: 'root',
      property: 'qualitative traits of one handled unit',
      value: { encoding: 'paged-json', part: 0, parts: 4, fragment: '{"key"' },
      method: 'paged retrieval',
      condition: 'part 0 of 4',
      verified: false,
      tick: 1,
      evidence: 'event-1-fragment',
    };
    expect(unchanged(paged, act({ evidenceRefs: ['root:fragment'] }))).toMatch(
      /root:fragment is not a complete dated record/,
    );
    expect(unchanged(w, act({ methodRef: 'iodine starch test' }))).toMatch(
      /methodRef iodine starch test is not an installed capability or one of your records/,
    );
    expect(unchanged(w, act({ methodRef: 'x'.repeat(161) }))).toMatch(
      /methodRef is longer than 160 characters/,
    );
    expect(unchanged(w, act({ equipmentRefs: ['mortar'] }))).toMatch(
      /equipmentRefs: mortar is not your item, a loose item or an object within reach/,
    );
    expect(unchanged(w, act({ equipmentRefs: ['item-kai-berry'] }))).toMatch(
      /equipmentRefs: item-kai-berry is not yours or within reach/,
    );
    expect(unchanged(w, act({ equipmentRefs: berry }))).toMatch(
      /equipmentRefs must be a declared array/,
    );
    for (const quantity of [0, 1.5])
      expect(unchanged(w, act({ quantity }))).toMatch(
        /quantity is a sample size above 0 and at most the one specimen unit/,
      );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.1;
    expect(unchanged(tired, act())).toMatch(/An assessment needs 0.2 energy/);
  });

  it('refuses execute-validated-method before any cost and names the missing validated protocol', () => {
    const { ready, berry } = fixture();
    const missing =
      /Missing validated protocol: no implemented, validated non-ingestive food-evidence protocol exists in this world\. One must declare its tested hazard or preparation claim, prerequisites, costs, detection limits, controls, hazards and disposal before it can run; none of the \d+ other installed capabilities is one \(examine-material: records qualitative traits and calibrated dimensions, not food hazards; probe: .*; consult: reads records and tests nothing; eat: ingestion, which is excluded\); this does not show that no such method can exist\./;
    let reason = unchanged(ready, run({ evidenceRefs: [TRAITS, OBSERVED] }));
    expect(reason).toMatch(
      /^Cannot execute a validated method on unit 1 of commons-root-0-0: no protocol named in methodRef\. /,
    );
    expect(reason).toMatch(missing);
    expect(reason).toMatch(
      /Unmet: identificationReference, validatedProtocol, light, absoluteBalance; unestablished: equipment, controls, materials, safeConditions\. No sample, reagent or equipment was committed and no progress was made; assess remains available\. Nothing was spent\.$/,
    );
    for (const [method, why] of [
      [
        EXAMINE,
        'examine-material is not a validated non-ingestive food-evidence protocol: records qualitative traits and calibrated dimensions, not food hazards',
      ],
      [
        'probe',
        'probe is not a validated non-ingestive food-evidence protocol: observe records visible state',
      ],
      [
        'eat',
        'eat is not a validated non-ingestive food-evidence protocol: ingestion, which is excluded',
      ],
      [
        id,
        `${id} is this assessment, which applies evidence and is not a test method`,
      ],
      [TRAITS, `${TRAITS} is a record, not a method`],
    ] as const) {
      reason = unchanged(
        ready,
        run({
          methodRef: method,
          evidenceRefs: [TRAITS],
          equipmentRefs: [berry],
          quantity: 0.5,
        }),
      );
      expect(reason).toContain(why);
      expect(reason).toMatch(missing);
    }
    // Inputs go through the same pipeline: a malformed one is named instead, still at no cost.
    expect(unchanged(ready, run({ evidenceRefs: ['nope'] }))).toMatch(
      /evidenceRefs: nope is not one of your complete records/,
    );
    expect(
      unchanged(ready, run({ target: OTHER_ROOTS, methodRef: EXAMINE })),
    ).toMatch(/beyond reach/);
    // In daylight the run is refused the same way.
    expect(unchanged(timed(ready, DAY), run({ methodRef: EXAMINE }))).toMatch(
      missing,
    );
  });

  it('reports a supplied candidate method and equipment without accepting either, and takes nothing', () => {
    const { ready, berry } = fixture();
    const before = ready.stacks.find((s) => s.id === berry);
    const r = cost(
      ready,
      act({
        evidenceRefs: [TRAITS],
        methodRef: EXAMINE,
        equipmentRefs: [berry, ROOT, BERRIES],
        quantity: 0.5,
      }),
    );
    expect(r.energy).toBe(0.2);
    const d = data(r.world);
    expect(d.candidateProtocol).toEqual({
      id: EXAMINE,
      is: 'installed capability examine-material@1',
      validated: false,
      why: 'not a validated non-ingestive food-evidence protocol: records qualitative traits and calibrated dimensions, not food hazards',
    });
    expect(d.equipment).toEqual([
      {
        id: berry,
        is: 'Red berries item (yours)',
        why: 'an ordinary item, not a validated reagent, control, instrument or container',
      },
      {
        id: ROOT,
        is: 'the specimen itself',
        why: 'the specimen cannot be its own equipment, reagent or control',
      },
      {
        id: BERRIES,
        is: ready.objects.find((o) => o.id === BERRIES)?.name,
        why: 'not an analytical instrument or material',
      },
    ]);
    expect(d.requestedQuantity).toBe(0.5);
    const rows = d.requirements as Record<string, unknown>[];
    expect(rows.find((x) => x.key === 'validatedProtocol')?.basis).toBe(
      'none is installed in this world; examine-material is not a validated non-ingestive food-evidence protocol: records qualitative traits and calibrated dimensions, not food hazards',
    );
    expect(rows.find((x) => x.key === 'equipment')?.basis).toBe(
      'set only by a validated method record, and none exists here; no supplied id meets it',
    );
    expect(viewOf(r.world)).toMatchObject({
      methodRef: EXAMINE,
      tools: [],
      reagents: [],
      samples: [],
    });
    // The berry item is as after waiting (only its ordinary aging), and the source unchanged.
    const after = r.world.stacks.find((s) => s.id === berry);
    expect(after).toEqual(r.idle.stacks.find((s) => s.id === berry));
    expect(after?.quantity).toBe(before?.quantity);
    expect(after?.owner).toBe('lin');
    expect(r.world.objects.find((o) => o.id === ROOT)?.data.stock).toBe(20);
    expect(mine(r.world)?.assessments[0]).toMatchObject({
      methodRef: EXAMINE,
    });
    // Ingestion named as the method is reported as excluded, not run.
    const eat = cost(ready, act({ methodRef: 'eat' }));
    expect(data(eat.world).candidateProtocol).toMatchObject({
      id: 'eat',
      validated: false,
      why: 'not a validated non-ingestive food-evidence protocol: ingestion, which is excluded',
    });
    // Nothing was eaten: every stack is as after waiting (cost) and no eating record is added.
    expect(actor(eat.world).memory.discoveries).toEqual(
      actor(ready).memory.discoveries,
    );
  });
});
