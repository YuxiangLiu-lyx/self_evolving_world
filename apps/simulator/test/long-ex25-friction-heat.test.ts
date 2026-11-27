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
  V7Data,
  V7Event,
  V7Object,
  V7Package,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'friction-heating-trial';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const RECORDS = `${id}:records`;
const STATE = `${id}:state:`;
const KIND = 'friction-ember';
const PREFIX = 'friction-heat-';
const SOURCE = 'canopy-69';
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list itself. */
const EXTRA_EXCLUDED =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition|history/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 132 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex25/hashes-before-3.json, taken before this change). */
const EXISTING_DIGEST =
  'afdb3181ebf5c9738670622d906718f0df4bfd70e2b0b97b774934427adfb2cf';
/** The same digest of ex21's small-combustion-source@1 and ex18's thermal-food-preparation@1,
 * whose modules this package reuses. */
const REUSED = {
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'thermal-food-preparation@1':
    'b587d44ead4b6016c824811e45dbdebd8ca27a2d31aade9278fa1c4b39fb5103',
};
/** Wren stands beside the fallen branches of canopy-69 on firm forest floor; the base is braced
 * at the first clear direction, south-west of her. Sol is moved far away. */
const BESIDE = { x: 13.75, y: 17 };
const SITE = { x: 13.38230447, y: 17.36769553 };
const FAR = { x: 17.5, y: 3.5 };
/** A rainy hour of this seed (rain about 0.7). */
const RAINY_TIME = 150;

type Scenario = 'long-culture-v2' | 'long-culture-v2-incentives';
type Data = Record<string, unknown>;
type Work = {
  id: string;
  status: string;
  stage: string;
  display: string;
  pieces: { role: string; named: string; item: string }[];
  bout: { number: number; requested: number; done: number };
  paidEnergy: number;
  paidRounds: number;
  rubRounds: number;
  thermal: {
    air: number;
    spot: number;
    rubbing: number;
    base: number;
    pool: number;
    dust: number;
    depth: number;
    peak: number;
  };
  ledger: Record<
    | 'input'
    | 'work'
    | 'stored'
    | 'convection'
    | 'radiation'
    | 'zoneLoss'
    | 'evaporation'
    | 'emberHeat'
    | 'wornRubbing'
    | 'wornBase'
    | 'dustRubbing'
    | 'dustBase'
    | 'wornWater'
    | 'drawn'
    | 'vapour'
    | 'emberDust',
    number
  >;
  results: { emberTemperature: number }[];
  ember: string | null;
  residue: { dust: number; water: number } | null;
  reason: string | null;
};
type Ember = {
  mass: number;
  initialMass: number;
  ash: number;
  exhaust: number;
  temperature: number;
  air: number;
  glowing: boolean;
  status: string;
  reason: string | null;
  released: number;
  convection: number;
  radiation: number;
  ground: number;
  drawn: number;
  stored: number;
  lastReleased: number;
  outAt: number | null;
};

const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const heating = (): V7Package => {
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
const actor = (w: V7World, who = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const ok = (r: ReturnType<typeof step>, who = 'wren') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const failed = (r: ReturnType<typeof step>, pattern: RegExp, who = 'wren') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  return r.world;
};
/** A refusal by the operation itself, before any cost. */
const refused = (r: ReturnType<typeof step>, pattern: RegExp, who = 'wren') => {
  failed(r, pattern, who);
  expect(r.outcomes[who]?.reason).toMatch(/Nothing was spent\.$/);
  return r.world;
};
const op = (args: V7Data): V7Action => ({ interface: id, args });
const trial = (item: string, effortRounds = 6, other = item) =>
  op({ mode: 'trial', targetIds: [item, other], effortRounds });
const energy = (w: V7World, who = 'wren') => actor(w, who).vitals.energy;
const ours = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === `${PREFIX}${type}`);
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const last = (w: V7World) =>
  (actor(w).extensionState[RECORDS] as Data[] | undefined)?.at(-1);
const work = (w: V7World, workId: unknown): Work => {
  const j = w.state[`${STATE}${String(workId)}`];
  if (!j) throw new Error('Missing work.');
  return j as unknown as Work;
};
const embers = (w: V7World): V7Object[] =>
  w.objects.filter((o) => o.kind === KIND);
const emberOf = (o: V7Object | undefined): Ember => {
  if (!o) throw new Error('Missing ember.');
  return o.data.ember as unknown as Ember;
};
const unit = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((x) => x.id === item);
  if (!s) throw new Error(`Missing ${item}.`);
  return s;
};
const installed = (scenario: Scenario = 'long-culture-v2') => {
  const g = initialLongWorld('long-ex25', scenario);
  const w = v7Clone(v7Install(g, continuousRegistry(g), REVISION));
  actor(w).position = { ...BESIDE };
  actor(w, 'sol').position = { ...FAR };
  return w;
};
/** Test fixture: an air-dried composition of the same solids at the given water share. No ex25
 * rule produces one; the operation reads it like any represented composition. */
function dry(w: V7World, item: string, share: number) {
  const s = unit(w, item);
  const solids = 1.1 * (1 - 0.5);
  s.physical = {
    unitMass: solids / (1 - share),
    unitWater: (solids * share) / (1 - share),
    unitSolids: solids,
  };
}
/** Wren studies in rounds 1-4 and gathers two real branch units from canopy-69 in round 5. */
function prepared(scenario: Scenario = 'long-culture-v2', share?: number) {
  let w = ok(step(installed(scenario), { wren: LEARN }));
  for (let i = 0; i < 3; i++) w = step(w).world;
  expect(actor(w).mastered).toContain(id);
  w = ok(
    step(w, {
      wren: { interface: 'gather', args: { target: SOURCE, quantity: 2 } },
    }),
  );
  const item = w.stacks.find(
    (s) => s.owner === 'wren' && s.resource === 'branch',
  );
  if (!item) throw new Error('Missing gathered branches.');
  if (share !== undefined) dry(w, item.id, share);
  return { world: w, item: item.id };
}
/** Rounds of trial until the bout ends or an ember forms; the world of each round. */
function rubbed(w0: V7World, action: V7Action, rounds: number) {
  const worlds: V7World[] = [];
  let w = w0;
  for (let i = 0; i < rounds; i++) {
    w = ok(step(w, { wren: action }));
    worlds.push(w);
    if (embers(w).length || !open(w) || open(w)?.status === 'paused') break;
  }
  return worlds;
}
/** Dry pieces rubbed until the ember forms (the round 9 world) and that work. */
function lit(scenario: Scenario = 'long-culture-v2') {
  const { world, item } = prepared(scenario, 0.05);
  const worlds = rubbed(world, trial(item), 8);
  const w = worlds.at(-1);
  if (!w || !embers(w).length) throw new Error('No ember formed.');
  return { world: w, item, worlds, before: world };
}

describe('the friction-heating trial in ex25', () => {
  it('is registered third for long-ex25 only, within the size limit, with new names, published parameters, no excluded word, and every earlier package byte-identical', () => {
    const pkg = heating();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The third ex25 package; later ex25 packages follow it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex25')
        .slice(0, 3)
        .map((p) => p.id),
    ).toEqual(['vocal-music', 'position-loose-material', id]);
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
        'friction-heat-inspected',
        'friction-heat-started',
        'friction-heat-rubbed',
        'friction-heat-paused',
        'friction-heat-bout-finished',
        'friction-heat-ended',
        'friction-heat-cancelled',
        'friction-heat-checked',
        'friction-heat-ember-formed',
        'friction-heat-ember-out',
        'friction-heat-ember-burn',
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 4,
      learningEnergy: 0.2,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: [],
      references: {},
      practiceEvidence: 'friction-heat-ember-formed',
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'targetIds',
      'quantity',
      'effortRounds',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'trial',
      'inspect-progress',
      'resume',
      'cancel',
    ]);
    expect(ability.parameters.properties?.effortRounds).toMatchObject({
      minimum: 1,
      maximum: 10,
    });
    // The force, friction, heat capacity, moisture, wear, cooling and ignition parameters are
    // published in the contract.
    for (const value of [
      '1 energy = 21.6 kJ',
      '50 N press',
      'friction 0.4',
      '20 W for up to 864 s',
      '6 J/K spot',
      '50 g zones',
      '0.012 W/K',
      'emissivity 0.9',
      '1.9e-5 kg/s x water share',
      '2 g per 21.6 kJ',
      '2 g+ at 350 C+',
      'rain 0.15',
      '18 MJ/kg',
      'below 300 C',
      '5 health per 2 MJ',
    ])
      expect(ability.effects).toContain(value);
    // New package, ability, equivalence, handler, event and object names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^friction-heat/);
      expect(p.visualComponents).not.toContain(KIND);
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
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
    // Every package registered before this one, by id@version, is byte-identical, including
    // ex21's small-combustion-source@1 whose physics module is reused.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(132);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, digest] of Object.entries(REUSED))
      expect(map[key]).toBe(digest);
    // Only the current scope can install it.
    const other = initialLongWorld('long-ex21', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex25', 'long-culture-v2');
    const after = v7Install(before, continuousRegistry(before), REVISION);
    expect(v7Signature(after.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(after.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(after.stacks)).toBe(v7Signature(before.stacks));
    expect(after.processes).toEqual(before.processes);
  });

  it('is learned in four study rounds at 0.2 energy each and cannot be used before', () => {
    const base = installed();
    failed(
      step(base, { wren: op({ mode: 'inspect', targetIds: ['x'] }) }),
      /not mastered/,
    );
    let w = ok(step(base, { wren: LEARN })),
      idle = step(base).world;
    for (let round = 2; round <= 4; round++) {
      expect(actor(w).mastered).not.toContain(id);
      w = step(w).world;
      idle = step(idle).world;
    }
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    expect(energy(idle) - energy(w)).toBeCloseTo(0.8, 9);
  });

  it('inspects for 0.2 energy, reporting pieces, contact, site and unknowns without disclosing moisture, and reserves nothing', () => {
    const { world, item } = prepared();
    const twin = step(world).world;
    const r = ok(
      step(world, { wren: op({ mode: 'inspect', targetIds: [item, item] }) }),
    );
    expect(energy(twin) - energy(r)).toBeCloseTo(0.2, 9);
    const report = ours(r, 'inspected')[0];
    expect(report).toMatchObject({
      actor: 'wren',
      interface: id,
      target: item,
      data: {
        targets: [item, item],
        findings: {
          contact: {
            force: 50,
            friction: 0.4,
            stroke: 0.25,
            speed: 1,
            power: 20,
            input: 17280,
            seconds: 864,
            trackDepth: 0,
            share: 0.5,
          },
          site: { x: SITE.x, y: SITE.y, ground: 'f' },
          weather: { rain: 0, roof: false },
          safety: [],
          unmet: [],
          feasible: true,
        },
        view: { display: 'inspection', glow: false, flame: false },
      },
    });
    const items = (report?.data.findings as Data).items as Data[];
    expect(items.map((x) => [x.role, x.usable])).toEqual([
      ['rubbing', true],
      ['base', true],
    ]);
    expect(items[0]?.moisture).toMatch(/^unknown/);
    expect(items[0]?.species).toMatch(/^unknown/);
    expect(items[0]?.shape).toMatchObject({ kind: 'straight rod' });
    // Hidden properties stay hidden: no water share, composition or hardness is reported.
    const text = JSON.stringify(
      r.events.filter((e) => e.type.startsWith(PREFIX) || e.interface === id),
    );
    expect(text).not.toMatch(/unitWater|physical|hardness|water share/);
    // Nothing reserved, moved or used; only a closed record and an unverified personal record.
    expect(open(r)).toBeUndefined();
    expect(v7Signature(r.stacks)).toBe(v7Signature(twin.stacks));
    expect(v7Signature(r.objects)).toBe(v7Signature(twin.objects));
    expect(
      actor(r).memory.knowledge?.[`${item}:friction-heating-inspection`],
    ).toMatchObject({ verified: false });
    // Ids that are not owned plain wood are reported, not used.
    const mixed = ok(
      step(world, {
        wren: op({ mode: 'inspect', targetIds: [SOURCE, 'nothing-here'] }),
      }),
    );
    const found = (ours(mixed, 'inspected')[0]?.data.findings as Data)
      .items as Data[];
    expect(found.map((x) => [x.usable, x.problem])).toEqual([
      [false, `${SOURCE} is an object in the world, not an item you hold`],
      [false, 'nothing-here is not an item you hold'],
    ]);
  });

  it('refuses unusable inputs, other quantities, low energy and unsafe effort before any cost', () => {
    const { world, item } = prepared();
    const w = v7Clone(world);
    for (const resource of ['stone', 'willow', 'berry'])
      w.stacks.push({
        id: `fixture-${resource}`,
        resource,
        quantity: 1,
        quantityTenths: 10,
        position: { ...BESIDE },
        owner: 'wren',
        origin: 'fixture',
        harvestedAt: 0,
      });
    const single = v7Clone(w);
    const lone = unit(single, item);
    lone.quantity = 1;
    lone.quantityTenths = 10;
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.9;
    const hurt = v7Clone(w);
    actor(hurt).vitals.health = 15;
    const cases: [V7World, V7Action, RegExp][] = [
      [w, trial(SOURCE), /object in the world, not an item you hold/],
      [w, trial('fixture-stone', 3, item), /no rod shape is represented/],
      [w, trial('fixture-willow', 3, item), /willow bends/],
      [w, trial(item, 3, 'fixture-berry'), /is food/],
      [w, op({ mode: 'trial', targetIds: [item] }), /only represented contact/],
      [
        w,
        op({ mode: 'trial', targetIds: [item, item, 'fixture-stone'] }),
        /only represented contact/,
      ],
      [
        w,
        op({ mode: 'trial', targetIds: [item, item], quantity: 2 }),
        /quantity is 1/,
      ],
      [single, trial(item), /fewer than two whole units/],
      [tired, trial(item), /Not enough energy/],
      [hurt, trial(item), /unsafe/],
      [w, op({ mode: 'resume' }), /no open friction trial/],
      [w, op({ mode: 'cancel' }), /no open friction trial/],
      [w, op({ mode: 'inspect-progress' }), /no friction trial/],
    ];
    for (const [world0, action, pattern] of cases) {
      const r = step(world0, { wren: action });
      refused(r, pattern);
      expect(energy(r.world)).toBe(energy(step(world0).world));
      expect(r.world.stacks.filter((s) => s.reservedFor)).toEqual([]);
      expect(open(r.world)).toBeUndefined();
      expect(r.world.events.filter((e) => e.type.startsWith(PREFIX))).toEqual(
        [],
      );
    }
  });

  it('charges a paid inspection round, then 0.8 energy per rubbing round as at most 17.28 kJ of friction work, and an attached inspection skips the paid round', () => {
    const { world, item } = prepared();
    const first = step(world, { wren: trial(item, 2) });
    expect(first.outcomes.wren).toMatchObject({
      success: true,
      complete: false,
    });
    const w1 = first.world,
      t1 = step(world).world;
    expect(energy(t1) - energy(w1)).toBeCloseTo(0.2, 9);
    expect(open(w1)).toMatchObject({
      status: 'active',
      stage: 'inspection',
      paidEnergy: 0.2,
      paidRounds: 1,
      bout: { number: 1, requested: 2, done: 0 },
      site: { x: SITE.x, y: SITE.y },
      inspection: { source: 'paid in the first round of this trial' },
    });
    const pieces = open(w1)?.pieces as { item: string; named: string }[];
    // One unit was split exactly from the gathered pair for the rubbing piece; the other is
    // the remaining unit itself. Both stay carried and reserved.
    expect(pieces.map((p) => p.named)).toEqual([item, item]);
    expect(pieces[1]?.item).toBe(item);
    expect(pieces[0]?.item).not.toBe(item);
    for (const p of pieces)
      expect(unit(w1, p.item)).toMatchObject({
        owner: 'wren',
        quantity: 1,
        origin: SOURCE,
        reservedFor: open(w1)?.id,
      });
    const input = longOrdinaryInput(w1, 'wren').packet as {
      execution: { activeState: Data; reserved: V7Stack[] };
    };
    expect(input.execution.activeState[OPEN]).toMatchObject({
      status: 'active',
    });
    expect(input.execution.reserved.map((s) => s.id).sort()).toEqual(
      pieces.map((p) => p.item).sort(),
    );
    // Nothing else may use a reserved piece meanwhile.
    failed(
      step(w1, {
        wren: { interface: 'drop', args: { target: item, quantity: 1 } },
      }),
      /reserved|ongoing work/,
    );
    const w2 = ok(step(w1, { wren: trial(item, 2) })),
      t2 = step(t1).world;
    expect(energy(step(w1).world) - energy(w2)).toBeCloseTo(0.8, 9);
    expect(energy(t2) - energy(w2)).toBeCloseTo(1, 9);
    const rubbedEvent = ours(w2, 'rubbed')[0];
    expect(rubbedEvent?.data.round).toMatchObject({
      energy: 0.8,
      input: 17280,
      frictionWork: 17280,
      force: 50,
      speed: 1,
      stroke: 0.25,
      rubbedSeconds: 864,
    });
    const j = work(w2, open(w2)?.id);
    expect(j.ledger.work).toBeLessThanOrEqual(j.ledger.input);
    expect(j.ledger.input).toBe(17280);

    // An unchanged inspection of the same pieces within 10 rounds is attached: the trial rubs
    // in its first round.
    const looked = ok(
      step(world, { wren: op({ mode: 'inspect', targetIds: [item, item] }) }),
    );
    const direct = ok(step(looked, { wren: trial(item, 2) }));
    expect(energy(step(looked).world) - energy(direct)).toBeCloseTo(0.8, 9);
    expect(open(direct)).toMatchObject({
      stage: 'rubbing',
      paidEnergy: 0.8,
      paidRounds: 1,
      bout: { done: 1 },
      inspection: { source: 'your unchanged inspection of these pieces' },
    });
  });

  it('fails honestly with the world’s wet wood: the contact stays near 100 C, vapour rises, wear and dust are real and no ember forms', () => {
    const { world, item } = prepared();
    const worlds = rubbed(world, trial(item, 4), 6);
    const w = worlds.at(-1);
    if (!w) throw new Error('No rounds.');
    expect(worlds).toHaveLength(5);
    expect(embers(w)).toEqual([]);
    expect(ours(w, 'bout-finished')).toHaveLength(1);
    const j = work(w, open(w)?.id);
    expect(j).toMatchObject({
      status: 'paused',
      stage: 'bout finished',
      display: 'no ember',
      rubRounds: 4,
      ember: null,
    });
    expect(j.thermal.peak).toBeLessThan(100.5);
    expect(j.thermal.peak).toBeGreaterThan(99);
    const rounds = worlds.flatMap((x) => ours(x, 'rubbed'));
    expect(rounds).toHaveLength(4);
    for (const e of rounds) {
      const observations = (e.data.round as Data).observations as string[];
      expect(observations).toContain('vapour rose from the contact');
      expect(observations).not.toContain('smoke rose from the dust');
      expect(observations).not.toContain('the dust began to glow');
      expect(e.data.view).toMatchObject({
        smoke: false,
        glow: false,
        flame: false,
      });
    }
    // Wear debited the pieces and collected as dust; water left as vapour; all mass is booked.
    const l = j.ledger;
    expect(l.dustRubbing + l.dustBase).toBeGreaterThan(0.002);
    expect(l.vapour).toBeGreaterThan(0.01);
    const lost = j.pieces.reduce((n, p) => {
      const s = unit(w, p.item);
      return n + 1.1 - (s.physical?.unitMass ?? 1.1);
    }, 0);
    expect(lost).toBeCloseTo(l.wornRubbing + l.wornBase + l.drawn, 6);
    expect(l.dustRubbing + l.dustBase).toBeCloseTo(j.thermal.dust, 6);
    expect(l.wornWater + l.drawn).toBeCloseTo(l.vapour + j.thermal.pool, 6);
    // Every joule of friction work is booked as stored heat or a loss.
    expect(l.work).toBeCloseTo(
      l.stored +
        l.convection +
        l.radiation +
        l.zoneLoss +
        l.evaporation +
        l.emberHeat,
      3,
    );
    expect(l.evaporation).toBeGreaterThan(l.work / 2);
    // The base shows its track and the piece record no water.
    expect(unit(w, item).processing?.frictionHeating).toMatchObject({
      role: 'base',
      depth: j.thermal.depth,
    });
    const visible = JSON.stringify([
      open(w),
      w.events.filter((e) => e.actor === 'wren'),
    ]);
    expect(visible).not.toMatch(
      /"vapour"|"pool"|unitWater|wornWater|"drawn"|water share/,
    );
  });

  it('forms exactly one ember from at least 2 g of collected dust at 350 C with a dry fixture, debits that dust, references the work, charges only the rubbing done and releases the pieces', () => {
    const { world, worlds, before } = lit();
    const ember = embers(world);
    expect(ember).toHaveLength(1);
    const o = ember[0];
    if (!o) throw new Error('Missing ember.');
    const formed = ours(world, 'ember-formed');
    expect(formed).toHaveLength(1);
    const workId = formed[0]?.data.work;
    const j = work(world, workId);
    expect(j).toMatchObject({
      status: 'completed',
      display: 'ember',
      ember: o.id,
      reason: 'An ember formed in the dust; rubbing stopped.',
    });
    expect(j.rubRounds).toBeLessThanOrEqual(6);
    expect(j.rubRounds).toBeGreaterThanOrEqual(2);
    const e = emberOf(o);
    expect(e.initialMass).toBeGreaterThanOrEqual(0.002);
    expect(e.initialMass).toBeCloseTo(j.ledger.emberDust, 7);
    expect(j.ledger.dustRubbing + j.ledger.dustBase).toBeCloseTo(
      j.ledger.emberDust,
      7,
    );
    expect(j.thermal.dust).toBe(0);
    const formation = j.results.at(-1);
    expect(formation?.emberTemperature).toBeGreaterThanOrEqual(350);
    expect(o).toMatchObject({
      kind: KIND,
      revision: REVISION,
      createdBy: null,
      spatial: { x: SITE.x, y: SITE.y, solid: false },
      data: {
        provenance: {
          operation: REVISION,
          work: workId,
          by: 'wren',
          pieces: j.pieces.map((p) => p.item),
        },
        view: { component: KIND, glow: true, flame: false },
      },
    });
    expect(formed[0]?.data.view).toMatchObject({ glow: true, flame: false });
    // The pieces were released, worn; the round that formed the ember is charged only for the
    // rubbing done in it.
    for (const p of j.pieces)
      expect(unit(world, p.item).reservedFor).toBeUndefined();
    expect(open(world)).toBeUndefined();
    expect(last(world)).toMatchObject({ status: 'completed', ember: o.id });
    const round = ours(world, 'rubbed')[0]?.data.round as Data;
    expect(Number(round.rubbedSeconds)).toBeLessThan(864);
    expect(Number(round.energy)).toBeCloseTo(
      (0.8 * Number(round.rubbedSeconds)) / 864,
      6,
    );
    expect(j.paidEnergy).toBeCloseTo(
      0.2 + 0.8 * (j.rubRounds - 1) + Number(round.energy),
      6,
    );
    expect(worlds.length).toBe(j.rubRounds + 1);
    // No flame, fire or other source: the ember is the only object of this operation.
    expect(world.objects.filter((x) => x.revision === REVISION)).toEqual([o]);
    expect(before.objects.filter((x) => x.revision === REVISION)).toEqual([]);
    expect(
      world.events.some((e) =>
        /flame rose|caught fire|is burning/.test(e.description),
      ),
    ).toBe(false);
  });

  it('keeps the ember as its own process: it glows on with nobody tending it, burns only its dust, goes out by itself, then only cools; rain also puts it out', () => {
    const { world } = lit();
    const id0 = embers(world)[0]?.id;
    const at = (w: V7World) => emberOf(w.objects.find((o) => o.id === id0));
    const e0 = at(world);
    expect(e0.glowing).toBe(true);
    expect(e0.temperature).toBeGreaterThanOrEqual(300);
    expect(e0.mass).toBeLessThan(e0.initialMass);
    expect(
      world.objects.find((o) => o.id === id0)?.data.availableHeat,
    ).toBeGreaterThan(0);
    // Wren walks away and then dies; the ember goes on regardless.
    let w = v7Clone(world);
    actor(w).vitals.health = 0.01;
    actor(w).vitals.satiety = 0;
    const seen: Ember[] = [];
    const outs: V7Event[] = [];
    let died = false;
    for (let round = 0; round < 4; round++) {
      w = step(w).world;
      seen.push(at(w));
      outs.push(...ours(w, 'ember-out'));
      died ||= w.events.some((e) => e.type === 'died' && e.actor === 'wren');
    }
    expect(died).toBe(true);
    const outAt = seen.findIndex((e) => !e.glowing);
    expect(outAt).toBeGreaterThanOrEqual(0);
    expect(outs).toHaveLength(1);
    expect(outs[0]).toMatchObject({ target: id0, actor: null });
    const final = seen.at(-1);
    if (!final) throw new Error('No rounds.');
    expect(final.status).toBe('out');
    expect(final.reason).toMatch(
      /cooled below a self-sustaining glow|burned out/,
    );
    // No heat without dust: after it is out nothing more is released or burned.
    const after = seen.slice(outAt + 1);
    for (const e of after) {
      expect(e.lastReleased).toBe(0);
      expect(e.mass).toBe(final.mass);
    }
    expect(final.mass + final.ash + final.exhaust).toBeCloseTo(
      final.initialMass,
      7,
    );
    // Heat: what it took from the contact plus what it released is stored or lost.
    const provenance = embers(world)[0]?.data.provenance as Data;
    const taken = work(world, provenance.work).ledger.emberHeat;
    expect(taken).toBeGreaterThan(0);
    expect(
      Math.abs(
        taken +
          final.released -
          (final.stored +
            final.convection +
            final.radiation +
            final.ground +
            final.drawn),
      ),
    ).toBeLessThan(5);
    expect(final.released).toBeLessThanOrEqual(
      final.initialMass * 18_000_000 + 1e-6,
    );
    expect(Math.abs(final.temperature - final.air)).toBeLessThan(1);
    const cold = w.objects.find((o) => o.id === id0);
    expect(cold?.visual.label).toBe('Cold ember residue');
    expect(cold?.data.availableHeat).toBe(0);

    // In a rainy round the glow is put out.
    const wet = v7Clone(world);
    wet.time = RAINY_TIME;
    const quenched = step(wet).world;
    const q = emberOf(quenched.objects.find((o) => o.id === id0));
    expect(q).toMatchObject({
      glowing: false,
      status: 'out',
      reason: 'rain reached it and put the glow out',
      lastReleased: 0,
    });
    // Rain on the contact keeps even dry, smoking dust from glowing.
    const { world: dryStart, item } = prepared('long-culture-v2', 0.05);
    const rainy = v7Clone(dryStart);
    rainy.time = RAINY_TIME;
    const soaked = rubbed(rainy, trial(item, 5), 7);
    const end = soaked.at(-1);
    if (!end) throw new Error('No rounds.');
    expect(embers(end)).toEqual([]);
    expect(open(end)).toMatchObject({ status: 'paused', display: 'no ember' });
    const observations = soaked.flatMap((x) =>
      ours(x, 'rubbed').flatMap(
        (e) => (e.data.round as Data).observations as string[],
      ),
    );
    expect(observations).toContain('rain fell on the contact');
    expect(observations).toContain('smoke rose from the dust');
    expect(observations).not.toContain('the dust began to glow');
  });

  it('burns only someone standing on the glowing ember, in proportion to the heat it released, and refuses or pauses unsafe effort and unsafe ground', () => {
    const { world } = lit();
    const o = embers(world)[0];
    if (!o) throw new Error('Missing ember.');
    const on = v7Clone(world);
    actor(on, 'lin').position = { x: o.spatial.x, y: o.spatial.y };
    const burned = step(on).world;
    const burn = ours(burned, 'ember-burn');
    expect(burn).toHaveLength(1);
    const released = emberOf(
      burned.objects.find((x) => x.id === o.id),
    ).lastReleased;
    const loss = Number(burn[0]?.data.loss);
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeCloseTo((5 * released) / 2_000_000, 7);
    expect(burn[0]).toMatchObject({ actor: 'lin', target: o.id });
    const nearby = step(world).world;
    expect(ours(nearby, 'ember-burn')).toEqual([]);
    expect(actor(nearby, 'lin').vitals.health).toBeGreaterThan(
      actor(burned, 'lin').vitals.health,
    );

    // Unsafe effort during a bout pauses it without charge; unsafe ground refuses a trial.
    const { world: start, item } = prepared();
    const w1 = ok(step(start, { wren: trial(item, 3) }));
    const hurt = v7Clone(w1);
    actor(hurt).vitals.health = 15;
    const paused = ok(step(hurt, { wren: trial(item, 3) }));
    expect(energy(step(hurt).world)).toBe(energy(paused));
    expect(open(paused)).toMatchObject({ status: 'paused', display: 'paused' });
    expect(String(open(paused)?.reason)).toMatch(/unsafe/);
    // The middle of the wet river bank: no firm ground within reach in any direction.
    const bank = v7Clone(start);
    actor(bank).position = { x: 21.5, y: 20.5 };
    refused(step(bank, { wren: trial(item, 3) }), /no clear firm ground/);
  });

  it('pauses free when interrupted, keeps cooling, resumes from the cooled state, starts new bouts, cancels once, ends on changed pieces and at death', () => {
    const { world, item } = prepared();
    let w = ok(step(world, { wren: trial(item, 3) }));
    w = ok(step(w, { wren: trial(item, 3) }));
    const hot = work(w, open(w)?.id).thermal;
    // Another action: the work pauses after the round with no charge and the contact cools.
    const interrupted = step(w).world;
    expect(energy(interrupted)).toBe(energy(step(w).world));
    expect(open(interrupted)).toMatchObject({
      status: 'paused',
      display: 'interrupted',
    });
    expect(ours(interrupted, 'paused')[0]?.description).toMatch(
      /another action/,
    );
    const cooled = work(interrupted, open(interrupted)?.id).thermal;
    expect(cooled.spot).toBeLessThan(hot.spot);
    expect(cooled.rubbing).toBeLessThan(hot.rubbing);
    const later = step(interrupted).world;
    const colder = work(later, open(later)?.id).thermal;
    expect(colder.rubbing).toBeLessThan(cooled.rubbing);
    // inspect-progress reports it for 0.2 energy with the live checks.
    const checked = ok(step(later, { wren: op({ mode: 'inspect-progress' }) }));
    expect(energy(step(later).world) - energy(checked)).toBeCloseTo(0.2, 9);
    expect(ours(checked, 'checked')[0]?.data).toMatchObject({
      status: 'paused',
      current: { materialChange: null, liveProblems: [], roundEnergy: 0.8 },
    });
    // Resume continues the same bout from the cooled state, not a saved hot one.
    const resumed = ok(step(checked, { wren: op({ mode: 'resume' }) }));
    const j = work(resumed, open(resumed)?.id);
    expect(j.bout).toMatchObject({ number: 1, done: 2, requested: 3 });
    expect(energy(step(checked).world) - energy(resumed)).toBeCloseTo(0.8, 9);
    // Control: had the pieces stayed as hot as before the pause, the same round would end
    // hotter, so the resumed round really started from the cooled state.
    const kept = v7Clone(checked);
    const keptWork = work(kept, open(kept)?.id);
    keptWork.thermal = { ...keptWork.thermal, ...hot };
    const warmer = ok(step(kept, { wren: op({ mode: 'resume' }) }));
    expect(work(warmer, open(warmer)?.id).thermal.rubbing).toBeGreaterThan(
      j.thermal.rubbing,
    );
    // Finish the bout; resume is then refused and trial starts bout 2 after fresh checks.
    const finished = ok(step(resumed, { wren: trial(item, 3) }));
    expect(open(finished)).toMatchObject({
      status: 'paused',
      stage: 'bout finished',
    });
    refused(step(finished, { wren: op({ mode: 'resume' }) }), /is finished/);
    const second = ok(step(finished, { wren: trial(item, 2) }));
    expect(open(second)).toMatchObject({
      status: 'active',
      bout: { number: 2, requested: 2, done: 1 },
    });
    // Another trial on different pieces is refused while this one is open.
    refused(step(second, { wren: trial('other', 2) }), /is open on/);
    // Cancel ends it once for no energy and leaves the dust where it fell.
    const cancelled = ok(step(second, { wren: op({ mode: 'cancel' }) }));
    expect(energy(cancelled)).toBe(energy(step(second).world));
    expect(open(cancelled)).toBeUndefined();
    expect(last(cancelled)).toMatchObject({ status: 'cancelled' });
    expect(Number((last(cancelled)?.residue as Data).dust)).toBeGreaterThan(0);
    const pieces = work(cancelled, last(cancelled)?.id).pieces;
    for (const p of pieces)
      expect(unit(cancelled, p.item)).toMatchObject({ owner: 'wren' });
    expect(cancelled.stacks.filter((s) => s.reservedFor)).toEqual([]);
    refused(step(cancelled, { wren: op({ mode: 'cancel' }) }), /no open/);

    // A reserved piece changed by something else ends the work and frees both pieces.
    const changed = v7Clone(w);
    const piece = (open(changed)?.pieces as { item: string }[])[0]?.item ?? '';
    unit(changed, piece).fuelMoisture = 0.4;
    const ended = step(changed).world;
    expect(open(ended)).toBeUndefined();
    expect(last(ended)).toMatchObject({ status: 'invalidated' });
    expect(ended.stacks.filter((s) => s.reservedFor)).toEqual([]);
    // Death ends it; the pieces are released once and dropped where Wren died.
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.01;
    actor(dying).vitals.satiety = 0;
    const died = step(dying).world;
    expect(
      died.events.some((e) => e.type === 'died' && e.actor === 'wren'),
    ).toBe(true);
    expect(last(died)).toMatchObject({ status: 'ended' });
    for (const p of work(died, last(died)?.id).pieces)
      expect(unit(died, p.item)).toMatchObject({ owner: null });
    expect(died.stacks.filter((s) => s.reservedFor)).toEqual([]);
  });

  it('never rewards a trial or an ember: no satisfaction, mood, practice milestone, progress credit or made-work notice, with incentives off or on', () => {
    for (const scenario of [
      'long-culture-v2',
      'long-culture-v2-incentives',
    ] as const) {
      const { world, item } = prepared(scenario, 0.05);
      let w = world,
        idle = world;
      const seen: V7Event[] = [];
      for (let round = 6; round <= 13; round++) {
        const action =
          round === 6
            ? op({ mode: 'inspect', targetIds: [item, item] })
            : round <= 11 && !embers(w).length
              ? trial(item, 5)
              : undefined;
        w = step(w, action ? { wren: action } : {}).world;
        idle = step(idle).world;
        seen.push(...w.events);
      }
      expect(embers(w)).toHaveLength(1);
      expect(
        seen.filter((e) =>
          [
            'satisfaction',
            'satisfaction-maintained',
            'practice-confirmed',
            'information-confirmed',
            'work-noticed',
            'acknowledged',
            'reciprocated',
          ].includes(e.type),
        ),
      ).toEqual([]);
      for (const e of seen.filter(
        (e) => e.type.startsWith(PREFIX) || e.interface === id,
      )) {
        expect(e.data.qualified).toBeUndefined();
        for (const key of ['remaining', 'progress', 'elapsed'])
          expect(typeof e.data[key]).not.toBe('number');
      }
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
      const noticed = (w.state['expression:noticed'] ?? {}) as Data;
      expect(Object.keys(noticed)).not.toContain(embers(w)[0]?.id);
    }
  });

  it('keeps every agent-visible text it adds clear of the excluded vocabulary', () => {
    const { world, item } = prepared('long-culture-v2', 0.05);
    let w = world;
    const seen: V7Event[] = [];
    const script: Record<number, V7Action> = {
      6: op({ mode: 'inspect', targetIds: [item, item, SOURCE] }),
      7: trial(item, 1),
      8: op({ mode: 'inspect-progress' }),
      9: WAIT,
      10: op({ mode: 'resume' }),
      11: trial(item, 5),
      12: trial(item, 5),
      13: trial(item, 5),
      14: trial(item, 5),
    };
    for (let round = 6; round <= 16; round++) {
      const action = script[round];
      w = step(w, action && !embers(w).length ? { wren: action } : {}).world;
      seen.push(
        ...w.events.filter(
          (e) => e.type.startsWith(PREFIX) || e.interface === id,
        ),
      );
      if (round === 8) {
        const text = JSON.stringify(longOrdinaryInput(w, 'wren'));
        expect(text).toContain(OPEN);
        expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
        expect(text).not.toMatch(EXTRA_EXCLUDED);
      }
    }
    expect(new Set(seen.map((e) => e.type))).toEqual(
      new Set([
        'friction-heat-inspected',
        'friction-heat-started',
        'friction-heat-rubbed',
        'friction-heat-bout-finished',
        'friction-heat-checked',
        'friction-heat-paused',
        'friction-heat-ember-formed',
        'friction-heat-ember-out',
        'trial-result',
      ]),
    );
    const text = JSON.stringify([seen, embers(w)]);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    for (const who of ['wren', 'lin']) {
      const input = JSON.stringify(longOrdinaryInput(w, who));
      expect(input).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(input).not.toMatch(EXTRA_EXCLUDED);
    }
  });
});
