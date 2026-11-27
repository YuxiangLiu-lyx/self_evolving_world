import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  shelterMeasure,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Event,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { packagesBefore } from './support/goal-pair-package-snapshot.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'length-reference';
const STATE = `long:${id}`;
const EXAMINE = 'examine-material';
const SCOPED =
  'no qualifying standard established among these examined candidates';
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
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 121 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before-4.json, taken before this change). */
const EXISTING_DIGEST =
  'c6be7337d44aa9c6025bf5351f6792dda2e5f648e0b4e0dd427f40e44e0e8089';
/** sha256 of JSON.stringify of each package whose code this one reuses, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'cutting-edge-assessment@1':
    '3ca9a1f0d691fad71d4f6aaae3877ae70473a3af96f6785ed52433727ba01a49',
  'construct-weather-shelter@1':
    '74ca19cc7fd391e6f36532bc4a57f2a171ee6c5872be2ec220bca1e34ec14712',
  'examine-material@1':
    '102231e4e844a9b08851daf8a00c21459442f572c98c3f915ee279fe62afbbdb',
};
/** Kai's stand beside the fallen branches of canopy-41. */
const STAND = { x: 11.4, y: 18.55 };
/** Where the other five wait, clear of Kai. */
const PARK: Record<string, { x: number; y: number }> = {
  lin: { x: 17, y: 9 },
  moss: { x: 17.6, y: 9 },
  sol: { x: 18.2, y: 9 },
  wren: { x: 18.8, y: 9 },
  ivo: { x: 19.4, y: 9 },
};
/** A world time after dusk: light is 0 from time 36 to 79 of the day in this seed. */
const NIGHT = 40;
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;

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
const actor = (w: V7World, name = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const last = (w: V7World, type: string) => {
  const e = w.events.filter((e) => e.type === type).at(-1);
  if (!e) throw new Error(`Missing ${type}.`);
  return e;
};
const data = (w: V7World, type: string) =>
  last(w, type).data as Record<string, unknown>;
const viewOf = (w: V7World, type: string) =>
  data(w, type).view as Record<string, unknown>;
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const examine = (extra: Record<string, unknown>): V7Action => ({
  interface: EXAMINE,
  args: { mode: 'measure', ...extra },
});
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
const at = (w: V7World, p: { x: number; y: number }, who = 'kai') => {
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
  for (const a of w.actors) a.position = { ...(PARK[a.id] ?? a.position) };
  return fed(w);
}
const learn = (w: V7World, ability = id) => {
  let s = step(w, {
    kai: { interface: 'learn', args: { ability } },
  }).world;
  s = step(s).world;
  expect(actor(s).mastered).toContain(ability);
  return fed(s);
};
const mine = (w: V7World) =>
  (actor(w).extensionState[STATE] ?? null) as {
    records: Record<string, unknown>[];
    job: Record<string, unknown> | null;
  } | null;
const stack = (w: V7World, sid: string) => {
  const s = w.stacks.find((x) => x.id === sid);
  if (!s) throw new Error(`Missing ${sid}.`);
  return s;
};
/** Energy the action used beyond the same round spent waiting; every stack except `writes` and
 * every object are as after waiting, so nothing is consumed, reserved or moved. */
function cost(
  w: V7World,
  action: V7Action,
  writes: string[] = [],
  who = 'kai',
) {
  const r = step(w, { [who]: action }),
    idle = step(w).world,
    others = (x: V7World) => x.stacks.filter((s) => !writes.includes(s.id));
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  expect(v7Signature(others(r.world))).toBe(v7Signature(others(idle)));
  expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
  expect(r.world.stacks.filter((s) => s.reservedFor)).toEqual(
    idle.stacks.filter((s) => s.reservedFor),
  );
  const energy =
    Math.round(
      (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
        1e8,
    ) / 1e8;
  return { world: fed(r.world), reason: r.outcomes[who]?.reason ?? '', energy };
}
/** The action fails and changes no vitals, stacks, objects, records or knowledge. */
function unchanged(w: V7World, action: V7Action, who = 'kai') {
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
      (e) =>
        e.type.startsWith('length-reference-') ||
        e.type.startsWith('material-examination-'),
    ),
  ).toEqual([]);
  return result.outcomes[who]?.reason ?? '';
}
/** A supplied piece of the person's own, for fixtures the run itself cannot produce quickly. */
function piece(w: V7World, sid: string, extra: Partial<V7Stack> = {}) {
  const s: V7Stack = {
    id: sid,
    resource: 'branch',
    quantity: 1,
    quantityTenths: 10,
    position: { ...actor(w).position },
    owner: 'kai',
    origin: 'canopy-41',
    ...extra,
  };
  w.stacks.push(s);
  return s;
}
/** A supplied item carrying a declared, verified calibration record (examine-material@1's
 * format). No mechanism installed in ex24 writes one, so transfer and verification are shown on
 * fixtures; `revision` names the (hypothetical) mechanism that calibrated it. */
function tool(w: V7World, itemId: string, record: V7Data): V7Stack {
  return piece(w, itemId, {
    resource: 'birch',
    origin: 'calibration-fixture',
    processing: {
      measurementCalibration: {
        verified: true,
        standard: 'a certified reference bar',
        method: 'compared with the standard at ten points',
        evidence: 'event-calibration-fixture',
        calibratedAt: 0,
        revision: 'graduated-length-scale@1',
        condition: 1,
        ...record,
      },
    },
  });
}
const SCALE: V7Data = {
  form: 'graduated-scale',
  quantity: 'length',
  unit: 'm',
  resolution: 0.001,
  uncertainty: 0.0005,
  range: 1,
};
const calibrationOf = (w: V7World, sid: string) =>
  stack(w, sid).processing?.measurementCalibration as
    Record<string, unknown> | undefined;
const visibleText = (log: V7Event[]) =>
  JSON.stringify(log.map((e) => [e.type, e.description, e.data]));
/** Events of this round's action by Kai (environmental notices such as animal alerts excluded). */
const kaiTypes = (w: V7World) =>
  w.events
    .filter((e) => e.actor === 'kai' && e.interface === id)
    .map((e) => e.type);

/** Kai has studied the operation and examine-material@1, and carries one branch unit gathered
 * from canopy-41. examine-material@1 is installed after this package, as in the run. */
let cache: { ready: V7World; branch: string } | null = null;
function fixture() {
  if (!cache) {
    let w = learn(at(installed(), STAND));
    w = fed(v7Clone(v7Install(w, continuousRegistry(w), `${EXAMINE}@1`)));
    w = learn(w, EXAMINE);
    const r = step(at(w, STAND), {
      kai: { interface: 'gather', args: { target: 'canopy-41', quantity: 1 } },
    });
    expect(r.outcomes.kai?.success, r.outcomes.kai?.reason).toBe(true);
    const ready = at(r.world, STAND);
    const branch = ready.stacks.find(
      (s) => s.owner === 'kai' && s.resource === 'branch',
    );
    if (!branch) throw new Error('Missing branch.');
    cache = { ready, branch: branch.id };
  }
  return { ready: v7Clone(cache.ready), branch: cache.branch };
}
/** The fixture with a calibrated 1 m scale in Kai's hands. */
function scaled() {
  const { ready, branch } = fixture();
  tool(ready, 'item-scale', SCALE);
  return { ready, branch };
}

describe('investigate and transfer length references in ex24', () => {
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
    // The fourth ex24 package; later ex24 packages follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex24')[3]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 4),
    ).toEqual([
      'prepare-ventilated-food-storage',
      'construct-weather-shelter',
      EXAMINE,
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
    });
    expect(typeof pkg.afterEnvironment).toBe('function');
    expect(typeof pkg.onDeath).toBe('function');
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 2,
      learningEnergy: 0.2,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'length-reference-verified',
      references: { target: 'optional-exact-visible' },
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['investigate', 'transfer', 'verify', 'resume', 'cancel'],
    });
    expect(ability.parameters.required).toEqual(['mode']);
    // New package, ability, equivalence, handler and event names.
    expect(TAKEN).not.toContain(id);
    for (const e of pkg.events ?? []) expect(e).toMatch(/^length-reference-/);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^length-reference-/);
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
    const existing = packagesBefore(pkg);
    expect(existing).toHaveLength(121);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; two study rounds at 0.2 energy each master it.
    const fresh = at(installed(), STAND);
    expect(
      unchanged(fresh, act('investigate', { target: 'canopy-41' })),
    ).toMatch(/master/i);
    const first = cost(fresh, {
      interface: 'learn',
      args: { ability: id },
    });
    expect(first.energy).toBe(0.2);
    expect(actor(first.world).learning).toMatchObject({
      ability: id,
      remaining: 1,
    });
    let now = step(fresh, {
      kai: { interface: 'learn', args: { ability: id } },
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
    // Study grants no record, standard or practice milestone.
    expect(actor(now).memory.knowledge ?? {}).toEqual(
      actor(idle).memory.knowledge ?? {},
    );
    expect(actor(now).extensionState[STATE]).toBeUndefined();
    expect(now.events.map((e) => e.type)).not.toContain('practice-confirmed');
  });

  it('investigates one candidate per round for 0.2 energy: observed facts, unsupported claims, unknowns and the scoped conclusion, with nothing consumed, reserved or moved', () => {
    const w = learn(at(installed(), STAND));
    // A fallen-branch source in place.
    let r = cost(w, act('investigate', { target: 'canopy-41' }));
    expect(r.energy).toBe(0.2);
    let s = r.world;
    expect(s.objects.find((o) => o.id === 'canopy-41')?.data.stock).toBe(2);
    expect(kaiTypes(s)).toEqual([
      'trial-result',
      'length-reference-investigated',
    ]);
    let d = data(s, 'length-reference-investigated');
    expect(d).toMatchObject({
      candidate: 'canopy-41',
      setting: 'in place in its source',
      resource: 'branch',
      qualifies: false,
      comparisonSpan: {
        suitable: false,
        reasons: [
          'in place in its source: gather one unit to handle it as a separate piece',
        ],
        metric: false,
      },
      conclusion: `${SCOPED}: canopy-41`,
      examined: ['canopy-41'],
      newFinding: true,
      source: { stock: 2, soil: 'ordinary soil' },
      consumed: 0,
      reserved: false,
      moved: false,
      energy: 0.2,
    });
    expect(d.calibration).toBe(
      'canopy-41 carries no calibration record; an uncalibrated object is not a reference',
    );
    expect(d.observed).toEqual([
      'Fallen branches: elongated wood piece, long and slender; stiff: does not bend under hand pressure; whole unit; in place in its source; plain',
      'canopy-41 carries no calibration record; an uncalibrated object is not a reference',
      'not an uncalibrated comparison span: in place in its source: gather one unit to handle it as a separate piece',
    ]);
    expect(d.unsupported).toEqual([
      'any length of this candidate in metres or another unit',
      'the separated geometry of a unit still in its source',
    ]);
    expect(d.unknowns).toEqual([
      'its length in any unit: no calibrated reference was compared with it',
      'straightness and end squareness beyond hand-and-eye inspection',
      'whether a qualifying standard exists among candidates not examined',
    ]);
    expect(viewOf(s, 'length-reference-investigated')).toMatchObject({
      operation: id,
      mode: 'investigate',
      actor: 'kai',
      target: 'canopy-41',
      status: 'investigated',
      calibration: 'unknown',
      marks: [],
      span: null,
      units: null,
      overlay: 'handling within reach',
      label: 'no calibrated reference',
      evidence: last(s, 'trial-result').id,
    });
    expect(
      actor(s).memory.knowledge?.['canopy-41:length-reference'],
    ).toMatchObject({ verified: false, subject: 'branch' });
    expect(mine(s)?.records.at(-1)).toMatchObject({
      mode: 'investigate',
      candidate: 'canopy-41',
      qualifies: false,
      comparisonSpan: false,
      rounds: 1,
      energy: 0.2,
    });
    // No reward: no confirmed information, practice or qualified event, no mental change.
    expect(
      s.events.filter(
        (e) =>
          ['information-confirmed', 'practice-confirmed'].includes(e.type) ||
          e.data.qualified === true,
      ),
    ).toEqual([]);
    const idle = step(w).world;
    expect(actor(s).wellbeing.mental).toBe(actor(idle).wellbeing.mental);
    expect(actor(s).wellbeing.sources).toEqual(actor(idle).wellbeing.sources);
    expect(actor(s).experience?.mental).toEqual(actor(idle).experience?.mental);
    const events = [...s.events];
    // A gathered branch unit: a non-metric comparison span, recorded as such and nothing more.
    const g = step(at(s, STAND), {
      kai: { interface: 'gather', args: { target: 'canopy-41', quantity: 1 } },
    });
    expect(g.outcomes.kai?.success).toBe(true);
    const branch = g.world.stacks.find(
      (x) => x.owner === 'kai' && x.resource === 'branch',
    );
    if (!branch) throw new Error('Missing branch.');
    r = cost(fed(g.world), act('investigate', { target: branch.id }));
    expect(r.energy).toBe(0.2);
    s = r.world;
    expect(kaiTypes(s)).toEqual([
      'trial-result',
      'trial-result',
      'length-reference-investigated',
    ]);
    d = data(s, 'length-reference-investigated');
    expect(d).toMatchObject({
      candidate: branch.id,
      setting: 'carried',
      qualifies: false,
      comparisonSpan: { suitable: true, reasons: [], metric: false },
      carrier: { suitable: true, reasons: [] },
      conclusion: `${SCOPED}: canopy-41, ${branch.id}`,
      newFinding: true,
    });
    expect(d.observed).toContain(
      'usable as an uncalibrated comparison span (non-metric: the whole piece end to end, in no unit; it can show another piece as longer, shorter or about the same and is never a calibration)',
    );
    expect(viewOf(s, 'length-reference-investigated')).toMatchObject({
      calibration: 'comparison-only',
      label: 'comparison span only: no unit',
      span: null,
      units: null,
      marks: [],
    });
    expect(
      actor(s).memory.knowledge?.[`${branch.id}:comparison-span`],
    ).toMatchObject({
      verified: false,
      property: 'uncalibrated comparison span (non-metric)',
      value: { unit: null, metric: false, calibration: 'none' },
    });
    // The piece itself is untouched: no calibration, processing or reservation.
    expect(stack(s, branch.id)).toEqual(stack(g.world, branch.id));
    // Repeating an unchanged finding is paid again and marked as no new finding.
    r = cost(s, act('investigate', { target: branch.id }));
    expect(r.energy).toBe(0.2);
    expect(data(r.world, 'length-reference-investigated')).toMatchObject({
      newFinding: false,
      conclusion: `${SCOPED}: canopy-41, ${branch.id}`,
    });
    // At night the piece is still handled and paid; its straightness is not judged.
    r = cost(timed(s, NIGHT), act('investigate', { target: branch.id }));
    expect(r.energy).toBe(0.2);
    d = data(r.world, 'length-reference-investigated');
    expect(d.comparisonSpan).toEqual({
      suitable: false,
      reasons: ['straightness not judged: too dark to sight along it'],
      metric: false,
    });
    expect(d.unknowns).toContain('visual traits: too dark to see surfaces');
    // A name or mark claiming a length is reported as an unsupported claim only.
    const marked = step(s, {
      kai: {
        interface: 'mark',
        args: { subject: branch.id, text: 'one metre' },
      },
    });
    expect(marked.outcomes.kai?.success, marked.outcomes.kai?.reason).toBe(
      true,
    );
    r = cost(fed(marked.world), act('investigate', { target: branch.id }));
    d = data(r.world, 'length-reference-investigated');
    expect(
      (d.unsupported as string[]).some((x) =>
        /^the name or mark sign-.* \("one metre"\): a sign carries no length$/.test(
          x,
        ),
      ),
    ).toBe(true);
    expect(d.qualifies).toBe(false);
    // The sign itself is an object in place: no calibration and no separable piece.
    const sign = marked.world.objects.find(
      (o) => o.kind === 'mark' && o.data.subject === branch.id,
    );
    if (!sign) throw new Error('Missing sign.');
    r = cost(fed(marked.world), act('investigate', { target: sign.id }));
    expect(data(r.world, 'length-reference-investigated')).toMatchObject({
      candidate: sign.id,
      setting: 'object in place',
      qualifies: false,
      source: null,
      comparisonSpan: {
        suitable: false,
        reasons: ['an object in place, not a separable piece'],
      },
    });
    expect(data(r.world, 'length-reference-investigated').calibration).toBe(
      `${sign.id} carries no calibration record; an uncalibrated object is not a reference`,
    );
    // Other pieces: a pliable strand, a stack of two units and a worn piece.
    const more = fed(v7Clone(s));
    piece(more, 'item-vine', { resource: 'vine', origin: 'forest-vine-1' });
    piece(more, 'item-two', { quantity: 2, quantityTenths: 20 });
    piece(more, 'item-worn', {
      processing: { weatherShelterPart: { condition: 0.5 } },
    });
    r = cost(more, act('investigate', { target: 'item-vine' }));
    expect(
      data(r.world, 'length-reference-investigated').comparisonSpan,
    ).toEqual({
      suitable: false,
      reasons: ['a pliable strand, not a rigid piece'],
      metric: false,
    });
    r = cost(more, act('investigate', { target: 'item-two' }));
    expect(data(r.world, 'length-reference-investigated')).toMatchObject({
      comparisonSpan: { suitable: true },
      carrier: {
        suitable: false,
        reasons: ['holds 2 units; separate one to use it as a carrier'],
      },
    });
    r = cost(more, act('investigate', { target: 'item-worn' }));
    expect(
      (data(r.world, 'length-reference-investigated').comparisonSpan as V7Data)
        .reasons,
    ).toEqual(['visibly worn']);
    const text = visibleText([...events, ...s.events, ...r.world.events]);
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
  });

  it('refuses transfer, verify, resume and cancel before any cost when no qualifying standard exists, naming the missing standard', () => {
    const { ready, branch } = fixture();
    const missing =
      /Missing standard: a physically present, serviceable reference whose verified length calibration record states an independently justified length, unit, uncertainty, resolution, range, provenance and calibrating revision, named in source\. None is established here; body size, coordinates, stock counts, recipe dimensions, display scale, names and marks never qualify\. Zero fabrication progress; investigate remains available\. Nothing was spent\.$/;
    let reason = unchanged(ready, act('transfer', { carrier: branch }));
    expect(reason).toMatch(
      /^Cannot transfer: no source named\. Missing standard/,
    );
    expect(reason).toMatch(missing);
    reason = unchanged(
      ready,
      act('transfer', { source: 'canopy-41', carrier: branch }),
    );
    expect(reason).toMatch(
      /^Cannot transfer: canopy-41 carries no calibration record; an uncalibrated object is not a reference\. Missing standard/,
    );
    // A whole branch, even one recorded as a comparison span, is not a standard.
    const spanned = cost(ready, act('investigate', { target: branch })).world;
    piece(spanned, 'item-other');
    reason = unchanged(
      spanned,
      act('transfer', { source: branch, carrier: 'item-other' }),
    );
    expect(reason).toContain(
      `${branch} carries no calibration record; an uncalibrated object is not a reference`,
    );
    expect(reason).toMatch(missing);
    expect(
      unchanged(
        ready,
        act('transfer', { source: 'item-none', carrier: branch }),
      ),
    ).toMatch(
      /^Cannot transfer: source item-none is not resolved \(Reference absent-or-inaccessible-identity/,
    );
    reason = unchanged(ready, act('verify', { carrier: branch }));
    expect(reason).toMatch(
      /^Cannot verify: no completed transfer comparison to verify: transfer first; no source named\. Missing standard/,
    );
    expect(unchanged(ready, act('resume'))).toBe(
      'No pending transfer to resume. Nothing was spent.',
    );
    expect(unchanged(ready, act('cancel'))).toBe(
      'No pending transfer to cancel. Nothing was spent.',
    );
  });

  it('never accepts an uncalibrated comparison span as a calibration in examine-material or the shelter recipe checks', () => {
    const { ready, branch } = fixture();
    const before = shelterMeasure(ready, stack(ready, branch));
    const s = cost(ready, act('investigate', { target: branch })).world;
    expect(
      actor(s).memory.knowledge?.[`${branch}:comparison-span`],
    ).toBeTruthy();
    piece(s, 'item-specimen');
    // examine-material@1 still has no reference: the span is a personal record, not a tool.
    expect(
      unchanged(
        s,
        examine({
          target: 'item-specimen',
          properties: ['length'],
          tools: [branch],
        }),
      ),
    ).toContain(
      `${branch} carries no calibration record; an uncalibrated object is not a reference`,
    );
    expect(
      unchanged(
        s,
        examine({ target: 'item-specimen', properties: ['length'] }),
      ),
    ).toMatch(/^Metric dimensions unavailable: no calibrated reference/);
    // The shelter recipe checks read the same plain unit as before.
    expect(stack(s, branch).processing).toBeUndefined();
    expect(shelterMeasure(s, stack(s, branch))).toEqual(before);
    expect(before).toMatchObject({ treated: false, rod: { rigid: true } });
  });

  it('transfers and verifies a single end-to-end span from a calibrated fixture source; examine-material reads it as a coarse reference length without diameter support', () => {
    const { ready, branch } = scaled();
    // Transfer: one comparison round; the carrier is unchanged and nothing is consumed.
    let r = cost(
      ready,
      act('transfer', { source: 'item-scale', carrier: branch }),
    );
    expect(r.energy).toBe(0.2);
    const s = r.world;
    expect(kaiTypes(s)).toEqual(['length-reference-aligned']);
    expect(data(s, 'length-reference-aligned')).toMatchObject({
      status: 'compared',
      source: 'item-scale',
      carrier: branch,
      reading: 0.991,
      uncertainty: 0.0015,
      placements: 1,
      standard: 'a certified reference bar',
      sourceRevision: 'graduated-length-scale@1',
      sourceEvidence: 'event-calibration-fixture',
      expendables: 'none',
      consumed: 0,
      moved: false,
      redo: false,
    });
    expect(String(data(s, 'length-reference-aligned').marks)).toMatch(
      /^none made: no installed mechanism makes durable physical marks/,
    );
    expect(viewOf(s, 'length-reference-aligned')).toMatchObject({
      mode: 'transfer',
      calibration: 'pending',
      label: 'calibration pending: not verified',
      span: null,
      marks: [],
    });
    expect(calibrationOf(s, branch)).toBeUndefined();
    expect(mine(s)?.job).toMatchObject({
      carrier: branch,
      source: 'item-scale',
      value: 0.991,
      uncertainty: 0.0015,
      comparedAt: s.tick,
    });
    // A valid comparison is not paid for twice.
    expect(
      unchanged(s, act('transfer', { source: 'item-scale', carrier: branch })),
    ).toContain(
      `${branch} was already compared in round ${String(s.tick)}; verify next`,
    );
    // Waiting advances nothing.
    const waited = step(step(s).world).world;
    expect(mine(waited)?.job).toEqual(mine(s)?.job);
    expect(calibrationOf(waited, branch)).toBeUndefined();
    // Verify: a second comparison and the calibration record in examine-material's format.
    r = cost(s, act('verify', { source: 'item-scale', carrier: branch }), [
      branch,
    ]);
    expect(r.energy).toBe(0.2);
    const v = r.world;
    expect(kaiTypes(v)).toEqual(['trial-result', 'length-reference-verified']);
    const record = calibrationOf(v, branch);
    expect(record).toMatchObject({
      verified: true,
      form: 'reference-length',
      quantity: 'length',
      unit: 'm',
      resolution: 0.991,
      range: 0.991,
      uncertainty: 0.0015,
      span: 0.991,
      standard: 'a certified reference bar through item-scale',
      evidence: last(v, 'trial-result').id,
      calibratedAt: v.tick,
      revision: `${id}@1`,
      condition: 1,
      state: 'verified',
      source: 'item-scale',
      sourceRevision: 'graduated-length-scale@1',
      sourceUncertainty: 0.0005,
      comparison: last(s, 'length-reference-aligned').id,
      readings: [0.991, 0.991],
      placements: 1,
    });
    expect(data(v, 'length-reference-verified')).toMatchObject({
      status: 'verified',
      repetitions: 2,
      endpointResolution: 0.0005,
      consumed: 0,
    });
    expect(viewOf(v, 'length-reference-verified')).toMatchObject({
      calibration: 'verified',
      units: 'm',
      span: 0.991,
      resolution: 0.991,
      uncertainty: 0.0015,
      marks: [],
      label: 'single span 0.991 ± 0.0015 m',
    });
    expect(mine(v)?.job).toBeNull();
    // Only the record was added: the piece is otherwise unchanged and the source is untouched.
    const { processing, ...rest } = stack(v, branch);
    expect(Object.keys(processing ?? {})).toEqual(['measurementCalibration']);
    expect(rest).toEqual(
      Object.fromEntries(
        Object.entries(stack(s, branch)).filter(([k]) => k !== 'processing'),
      ),
    );
    expect(stack(v, 'item-scale')).toEqual(stack(s, 'item-scale'));
    // examine-material@1 reads it: one span resolves only whole spans, and no diameter.
    piece(v, 'item-specimen');
    r = cost(
      v,
      examine({
        target: 'item-specimen',
        properties: ['length'],
        tools: [branch],
      }),
    );
    expect(data(r.world, 'material-examination-measured')).toMatchObject({
      value: 0.991,
      uncertainty: r8(0.0015 + 0.991 / 2),
      placements: 1,
      tool: branch,
      calibration: {
        tool: branch,
        form: 'reference-length',
        revision: `${id}@1`,
        standard: 'a certified reference bar through item-scale',
      },
    });
    r = cost(
      v,
      examine({
        target: 'item-specimen',
        properties: ['diameter'],
        tools: [branch],
      }),
    );
    expect(data(r.world, 'material-examination-limited').limitation).toBe(
      `below the 0.991 m resolution of ${branch}; less than 0.4955 m`,
    );
    // Investigation now finds a qualifying standard among the examined candidates.
    r = cost(v, act('investigate', { target: branch }));
    expect(data(r.world, 'length-reference-investigated')).toMatchObject({
      qualifies: true,
      conclusion: `qualifying standard established among these examined candidates: ${branch} (each as found when examined)`,
    });
    expect(viewOf(r.world, 'length-reference-investigated').calibration).toBe(
      'verified',
    );
    expect(
      unchanged(v, act('transfer', { source: 'item-scale', carrier: branch })),
    ).toContain(`${branch} already carries a current verified span`);
    // A changed piece makes the calibration stale at once; examine-material then refuses it.
    const changed = v7Clone(v);
    stack(changed, branch).physical = {
      unitMass: 1,
      unitWater: 0.45,
      unitSolids: 0.55,
    };
    const stale = fed(step(changed).world);
    expect(calibrationOf(stale, branch)).toMatchObject({
      verified: false,
      state: 'stale',
      staleAt: stale.tick,
    });
    expect(viewOf(stale, 'length-reference-stale')).toMatchObject({
      carrier: branch,
      calibration: 'stale',
      label: 'calibration stale: not verified',
    });
    expect(
      unchanged(
        stale,
        examine({
          target: 'item-specimen',
          properties: ['length'],
          tools: [branch],
        }),
      ),
    ).toContain(
      `${branch}: its calibration record is not complete and verified (verified)`,
    );
    r = cost(stale, act('investigate', { target: branch }));
    expect(
      String(data(r.world, 'length-reference-investigated').calibration),
    ).toContain(`(stale since round ${String(stale.tick)})`);
    expect(viewOf(r.world, 'length-reference-investigated').calibration).toBe(
      'stale',
    );
    // Time alone never restores it; reverification is a new paid comparison and verification.
    const later = fed(step(step(stale).world).world);
    expect(calibrationOf(later, branch)).toMatchObject({ state: 'stale' });
    r = cost(later, act('transfer', { source: 'item-scale', carrier: branch }));
    expect(data(r.world, 'length-reference-aligned').reading).toBe(
      Math.round(25 * Math.cbrt((4 * (1 / 900)) / (Math.PI * 25)) * 1000) /
        1000,
    );
    r = cost(r.world, act('verify', {}), [branch]);
    expect(calibrationOf(r.world, branch)).toMatchObject({
      verified: true,
      state: 'verified',
    });
    // A single-span source coarser than twice the piece gives no reading: a paid limit, no job.
    const coarse = v7Clone(ready);
    tool(coarse, 'item-long-span', {
      form: 'reference-length',
      quantity: 'length',
      unit: 'm',
      resolution: 3,
      uncertainty: 0.01,
      range: 3,
    });
    r = cost(
      coarse,
      act('transfer', { source: 'item-long-span', carrier: branch }),
    );
    expect(r.energy).toBe(0.2);
    expect(data(r.world, 'length-reference-aligned')).toMatchObject({
      status: 'limited',
      limitation: 'below the 3 m resolution of item-long-span; less than 1.5 m',
    });
    expect(viewOf(r.world, 'length-reference-aligned')).toMatchObject({
      calibration: 'failed',
      label: 'comparison gave no reading',
    });
    expect(mine(r.world)?.job).toBeNull();
    expect(calibrationOf(r.world, branch)).toBeUndefined();
    const text = visibleText([...s.events, ...v.events, ...stale.events]);
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
  });

  it('resumes, cancels and stops a pending transfer without refunds, locks or background progress', () => {
    const { ready, branch } = scaled();
    const s = cost(
      ready,
      act('transfer', { source: 'item-scale', carrier: branch }),
    ).world;
    // Cancel is free, keeps the paid comparison spent and leaves the carrier unmarked.
    let r = cost(s, act('cancel'));
    expect(r.energy).toBe(0);
    expect(kaiTypes(r.world)).toEqual(['length-reference-cancelled']);
    expect(data(r.world, 'length-reference-cancelled')).toMatchObject({
      carrier: branch,
      refunded: 0,
      energy: 0,
    });
    expect(viewOf(r.world, 'length-reference-cancelled')).toMatchObject({
      calibration: 'unknown',
      label: 'transfer cancelled: not calibrated',
      rounds: 0,
    });
    expect(mine(r.world)?.job).toBeNull();
    expect(calibrationOf(r.world, branch)).toBeUndefined();
    expect(
      unchanged(
        r.world,
        act('verify', { source: 'item-scale', carrier: branch }),
      ),
    ).toContain('no completed transfer comparison to verify: transfer first');
    // Resume with a still-valid comparison is the paid verification.
    r = cost(s, act('resume'), [branch]);
    expect(r.energy).toBe(0.2);
    expect(viewOf(r.world, 'length-reference-verified').mode).toBe('resume');
    expect(calibrationOf(r.world, branch)).toMatchObject({ verified: true });
    // A changed carrier invalidates the comparison: verify is refused free, resume redoes it.
    const moved = v7Clone(s);
    stack(moved, branch).physical = {
      unitMass: 1,
      unitWater: 0.45,
      unitSolids: 0.55,
    };
    expect(
      unchanged(
        moved,
        act('verify', { source: 'item-scale', carrier: branch }),
      ),
    ).toContain(
      `the round ${String(s.tick)} comparison is invalidated: the record of ${branch} changed since; transfer again or resume`,
    );
    r = cost(moved, act('resume'));
    expect(r.energy).toBe(0.2);
    expect(data(r.world, 'length-reference-aligned')).toMatchObject({
      redo: true,
      status: 'compared',
    });
    r = cost(r.world, act('resume'), [branch]);
    expect(calibrationOf(r.world, branch)).toMatchObject({ verified: true });
    // A changed source record also invalidates the comparison.
    const recal = v7Clone(s);
    const rec = stack(recal, 'item-scale').processing
      ?.measurementCalibration as V7Data;
    rec.uncertainty = 0.0004;
    expect(
      unchanged(
        recal,
        act('verify', { source: 'item-scale', carrier: branch }),
      ),
    ).toContain(
      `the calibration record of item-scale changed since round ${String(s.tick)}; transfer again or resume`,
    );
    // Readings that disagree beyond the alignment window leave it unverified (a guard: an
    // unchanged piece reads the same in this representation, so the job is altered here).
    const off = v7Clone(s);
    const state = actor(off).extensionState[STATE] as V7Data;
    (state.job as V7Data).value = 0.9;
    r = cost(off, act('verify'));
    expect(r.energy).toBe(0.2);
    expect(kaiTypes(r.world)).toEqual(['length-reference-unverified']);
    expect(data(r.world, 'length-reference-unverified')).toMatchObject({
      status: 'failed',
      readings: [0.9, 0.991],
    });
    expect(viewOf(r.world, 'length-reference-unverified')).toMatchObject({
      calibration: 'failed',
      label: 'verification failed: not calibrated',
      span: null,
    });
    expect(calibrationOf(r.world, branch)).toBeUndefined();
    expect(mine(r.world)?.job).toBeNull();
    // Death stops the pending work; nothing was locked and nothing is calibrated.
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    const dead = v7Clone(s);
    dead.events = [];
    pkg?.onDeath?.(dead, actor(dead));
    expect(mine(dead)?.job).toBeNull();
    expect(mine(dead)?.records.at(-1)).toMatchObject({
      mode: 'stopped',
      status: 'stopped by death',
      carrier: branch,
    });
    expect(dead.events.map((e) => e.type)).toEqual([
      'length-reference-stopped',
    ]);
    expect(calibrationOf(dead, branch)).toBeUndefined();
    expect(dead.stacks.filter((x) => x.reservedFor)).toEqual([]);
  });

  it('refuses every invalid request before any cost', () => {
    const { ready, branch } = scaled();
    const transfer = (extra: Record<string, unknown>) =>
      act('transfer', { source: 'item-scale', carrier: branch, ...extra });
    // Investigation targets: missing, unknown, a resource name, out of reach; too little energy.
    expect(unchanged(ready, act('investigate'))).toContain(
      'Name the exact candidate id in target',
    );
    expect(
      unchanged(ready, act('investigate', { target: 'item-none' })),
    ).toMatch(/^Reference absent-or-inaccessible-identity/);
    expect(unchanged(ready, act('investigate', { target: 'branch' }))).toMatch(
      /^Reference absent-or-inaccessible-identity/,
    );
    expect(
      unchanged(
        at(ready, { x: 11.4, y: 15 }),
        act('investigate', { target: 'canopy-41' }),
      ),
    ).toContain('beyond reach');
    const tired = v7Clone(ready);
    actor(tired).vitals.energy = 0.1;
    expect(unchanged(tired, act('investigate', { target: branch }))).toContain(
      'An investigation needs 0.2 energy.',
    );
    expect(unchanged(tired, transfer({}))).toContain(
      'this step needs 0.2 energy',
    );
    // Carriers: none, a source in place, the source itself, unsuitable pieces.
    expect(unchanged(ready, transfer({ carrier: '' }))).toContain(
      'name the carrier: one separated whole rigid wood piece',
    );
    expect(unchanged(ready, transfer({ carrier: 'canopy-41' }))).toContain(
      'canopy-41 is an object or a source in place; the carrier must be a separated item',
    );
    expect(unchanged(ready, transfer({ carrier: 'item-scale' }))).toBe(
      'Cannot transfer: the carrier cannot be its own source. Nothing was spent.',
    );
    const w = v7Clone(ready);
    piece(w, 'item-vine', { resource: 'vine', origin: 'forest-vine-1' });
    piece(w, 'item-two', { quantity: 2, quantityTenths: 20 });
    piece(w, 'item-half', { quantity: 0.5, quantityTenths: 5 });
    piece(w, 'item-worked', { processing: { shapedEnd: { rounds: 2 } } });
    piece(w, 'item-oak', { resource: 'oak', origin: 'forest-oak-0' });
    expect(unchanged(w, transfer({ carrier: 'item-vine' }))).toContain(
      'a pliable strand, not a rigid piece',
    );
    expect(unchanged(w, transfer({ carrier: 'item-two' }))).toContain(
      'item-two holds 2 units; separate one (drop one unit) to use it alone',
    );
    expect(unchanged(w, transfer({ carrier: 'item-half' }))).toContain(
      'less than one whole unit',
    );
    expect(unchanged(w, transfer({ carrier: 'item-worked' }))).toContain(
      'worked or treated',
    );
    // A carrier longer than the source range would need intermediate marks.
    expect(unchanged(w, transfer({ carrier: 'item-oak' }))).toContain(
      'item-oak is longer than the 1 m range of item-scale; stepping the source along it needs intermediate marks',
    );
    // Sources: a balance, unverified, worn.
    tool(w, 'item-balance', {
      form: 'balance',
      quantity: 'mass',
      unit: 'kg',
      resolution: 0.01,
      uncertainty: 0.005,
      range: 5,
      tare: 0.2,
    });
    tool(w, 'item-unverified', { ...SCALE, verified: false });
    tool(w, 'item-worn-scale', { ...SCALE, condition: 0.5 });
    expect(unchanged(w, transfer({ source: 'item-balance' }))).toMatch(
      /^Cannot transfer: item-balance is a calibrated balance, not a length reference\. Missing standard/,
    );
    expect(unchanged(w, transfer({ source: 'item-unverified' }))).toMatch(
      /^Cannot transfer: item-unverified: its calibration record is not complete and verified \(verified\)\. Missing standard/,
    );
    expect(unchanged(w, transfer({ source: 'item-worn-scale' }))).toContain(
      'item-worn-scale is not serviceable (condition 0.5)',
    );
    // Light: aligning and reading need it.
    expect(unchanged(timed(w, NIGHT), transfer({}))).toContain(
      'aligning and reading need light',
    );
    // One pending transfer at a time; verification uses the same source and carrier.
    const pending = cost(w, transfer({})).world;
    piece(pending, 'item-other');
    expect(unchanged(pending, transfer({ carrier: 'item-other' }))).toContain(
      `a pending transfer onto ${branch} exists; verify, resume or cancel it first`,
    );
    tool(pending, 'item-scale-2', SCALE);
    expect(
      unchanged(pending, act('verify', { source: 'item-scale-2' })),
    ).toContain(
      'the pending comparison used item-scale; verify against the same source',
    );
    expect(
      unchanged(pending, act('verify', { carrier: 'item-other' })),
    ).toContain(`the pending comparison is of ${branch}, not item-other`);
    expect(unchanged(timed(pending, NIGHT), act('verify'))).toContain(
      'aligning and reading need light',
    );
  });
});
