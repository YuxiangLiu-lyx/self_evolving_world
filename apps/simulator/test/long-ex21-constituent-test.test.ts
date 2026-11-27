import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7Registry,
  v7ShapeDistance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Json,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const ID = 'targeted-food-constituent-test';
const KIT = 'beam-mass-comparator';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Real ex21 sources: the hazelnut and stone sources near the start, and a fallen-branch canopy. */
const NUTS = 'start-1-nuts';
const ROCK = 'start-1-stone';
const TREE = 'canopy-69';
/** Moss's start on firm meadow ground, where the comparison test also assembles its comparator. */
const STAND = { x: 15.1, y: 16.91 };
/** Names that earlier handoffs and the ex10 assay packages already use. */
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
  'food-assay',
  'noningestive-extractability',
];
/** The specification's bill for total aflatoxins, with each status in this world. */
const AFLATOXIN_BILL = {
  sample: 'present',
  methodReference: 'missing',
  recipe: 'unestablished',
  sampleSize: 'unestablished',
  absoluteBalance: 'missing',
  preparationEquipment: 'unestablished',
  extractionLiquid: 'missing',
  volumetricEquipment: 'missing',
  assayKit: 'missing',
  controls: 'missing',
  reader: 'missing',
  wasteHandling: 'unestablished',
  limits: 'unestablished',
};
const MISSING = Object.entries(AFLATOXIN_BILL)
  .filter(([, s]) => s === 'missing')
  .map(([k]) => k);
const UNESTABLISHED = Object.entries(AFLATOXIN_BILL)
  .filter(([, s]) => s === 'unestablished')
  .map(([k]) => k);
/** Hidden or latent values an assessment must never carry. */
const HIDDEN_KEYS = [
  'toxicity',
  'nutrition',
  'mass',
  'unitMass',
  'unitWater',
  'unitSolids',
  'decay',
  'contaminated',
  'contamination',
  'physical',
  'quantity',
];

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
const events = (w: V7World, type: string, who = 'lin') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const last = (w: V7World, type: string, who = 'lin') => {
  const e = events(w, type, who).at(-1);
  if (!e) throw new Error(`Missing ${type} event.`);
  return e;
};
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
type Args = Record<string, V7Json | undefined>;
/** An action of this operation; arguments given as undefined are left out. */
function mode(m: string, extra: Args = {}): V7Action {
  const args: Record<string, V7Json> = { mode: m };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) args[k] = v;
  return { interface: ID, args };
}
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who: string) {
  for (let k = 0; k < 16; k++) {
    const p = {
      x: x + d * Math.cos((k * Math.PI) / 8),
      y: y + d * Math.sin((k * Math.PI) / 8),
    };
    if (
      w.objects.every(
        (o) => !o.spatial.solid || v7ShapeDistance(p, o.spatial) > 0.25,
      ) &&
      w.actors.every((a) => a.id === who || v7Distance(a.position, p) > 0.5)
    )
      return p;
  }
  throw new Error('No free fixture position.');
}
function gather(w: V7World, source: string, who = 'lin') {
  const o = w.objects.find((x) => x.id === source);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w, who).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, who);
  const g = step(w, {
    [who]: { interface: 'gather', args: { target: source, quantity: 1 } },
  });
  expect(g.outcomes[who]?.success).toBe(true);
  const item = g.world.events.find(
    (e) => e.type === 'gathered' && e.actor === who,
  )?.data.item;
  if (typeof item !== 'string') throw new Error('Missing gathered item.');
  return { w: fed(g.world), item };
}
function study(w: V7World, ability: string, who = 'lin', rounds = 5) {
  let next = step(fed(w), {
    [who]: { interface: 'learn', args: { ability } },
  }).world;
  for (let i = 1; i < rounds; i++) next = step(fed(next)).world;
  expect(actor(next, who).mastered).toContain(ability);
  return fed(next);
}
function genesis() {
  return initialLongWorld('long-ex21', 'long-culture-v2-oldgoal', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return fed(v7Clone(v7Install(g, continuousRegistry(g), `${ID}@1`)));
}
/** The action fails and changes no vitals, stacks, objects, state or records compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'lin') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  const a = actor(result.world, who),
    b = actor(idle, who);
  expect(a.vitals).toEqual(b.vitals);
  expect(a.memory.knowledge ?? {}).toEqual(b.memory.knowledge ?? {});
  expect(a.extensionState[`long:${ID}`]).toEqual(
    b.extensionState[`long:${ID}`],
  );
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(result.world.state)).toBe(v7Signature(idle.state));
  expect(
    result.world.events.filter((e) => e.type.startsWith('constituent-test-')),
  ).toEqual(idle.events.filter((e) => e.type.startsWith('constituent-test-')));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'lin') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  const energy =
    Math.round(
      (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
        1e6,
    ) / 1e6;
  return { world: r.world, idle, energy };
}
/** Every object key in a JSON value, at any depth. */
function keys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keys(x, out);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keys(x, out);
    }
  return out;
}

type Fixture = {
  w: V7World;
  nut: string;
  stone: string;
  mossNut: string;
};
let base: Fixture | null = null;
/** Lin studies the operation, gathers one hazelnut and one stone and observes both with probe;
 * Moss gathers a hazelnut of its own. Lin stands near the nut source. */
function setup(): Fixture {
  if (!base) {
    const w = study(installed(), ID);
    const nut = gather(w, NUTS);
    const stone = gather(nut.w, ROCK);
    const moss = gather(stone.w, NUTS, 'moss');
    let now = moss.w;
    for (const target of [nut.item, stone.item]) {
      const r = step(now, {
        lin: {
          interface: 'probe',
          args: { target, mode: 'observe', intensity: 0 },
        },
      });
      expect(r.outcomes.lin?.success).toBe(true);
      now = fed(r.world);
    }
    base = { w: now, nut: nut.item, stone: stone.item, mossNut: moss.item };
  }
  return { ...base, w: v7Clone(base.w) };
}
const aflatoxins = (f: Fixture, extra: Args = {}) =>
  mode('assess', {
    targetItemId: f.nut,
    constituent: 'total aflatoxins',
    ...extra,
  });
type Requirement = { key: string; need: string; status: string; basis: string };
type Supplied = {
  id: string;
  role: string;
  is: string;
  meets: boolean;
  why: string;
};

describe('ex21 targeted food-constituent test', () => {
  it('declares one scoped ability with study 5 at 0.5 energy, new names, bounded text and no reward', () => {
    const pkg = V7_PACKAGES.find((p) => p.id === ID);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    expect(V7_PACKAGES.at(-1)).toBe(pkg);
    expect(pkg.scope).toBe('long-ex21');
    expect(pkg.version).toBe(1);
    expect(pkg.dependencies).toEqual(['foundation-open@1']);
    expect(pkg.abilities).toHaveLength(1);
    expect(pkg.visualComponents).toEqual([]);
    expect(pkg.satisfaction).toEqual([]);
    expect(pkg.resources).toEqual([]);
    expect(pkg.processes).toEqual({});
    expect(pkg.events).toEqual([
      'constituent-test-assessed',
      'constituent-test-inspected',
    ]);
    expect(ability).toMatchObject({
      id: ID,
      handler: `long.${ID}`,
      revision: `${ID}@1`,
      learning: 5,
      learningEnergy: 0.5,
      authored: false,
      practiceEvidence: 'constituent-test-assessed',
      references: { targetItemId: 'optional-exact-visible' },
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['assess', 'run', 'inspect', 'resume', 'cancel'],
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'targetItemId',
      'constituent',
      'methodRef',
      'sampleMass',
      'equipmentIds',
      'reagentIds',
      'referenceIds',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(3500);
    // New package, ability, handler, equivalence and event names.
    expect(TAKEN).not.toContain(pkg.id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(pkg.id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^constituent-test-/);
    }
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events ?? [],
      description: pkg.description,
      reuse: pkg.reuse ?? null,
    });
    expect(CULTURE_EXCLUDED_WORDS.test(visible)).toBe(false);
    expect(EXTRA_EXCLUDED.test(visible)).toBe(false);
    // Registry check: no other ex21 interface measures a dietary constituent, and the ex10 assay
    // packages are not installable in this scope.
    const g = genesis();
    const scoped = continuousRegistry(g).packages.flatMap((p) => p.abilities);
    expect(
      scoped
        .filter((a) =>
          /assay|constituent|toxin|reagent|solvent/i.test(
            `${a.name} ${a.function}`,
          ),
        )
        .map((a) => a.id),
    ).toEqual([ID]);
    for (const other of ['food-assay@1', 'noningestive-extractability@1']) {
      expect(() => v7Install(g, continuousRegistry(g), other)).toThrow(
        /dependency-incomplete/,
      );
      expect(() => v7Install(g, v7Registry(V7_PACKAGES), other)).toThrow(
        /not approved for the current experiment scope|dependency-incomplete/,
      );
    }
    const w = installed();
    expect(w.revisions.at(-1)).toBe(`${ID}@1`);
    // No resource of this world is a reagent, solvent, kit, standard, container or reader.
    expect(
      w.resources.filter((r) =>
        /reagent|solvent|kit|standard|container|reader|assay|cup/i.test(
          `${r.id} ${r.name}`,
        ),
      ),
    ).toEqual([]);
  });

  it('is learned through the world study mechanism: five rounds at 0.5 energy, then usable', () => {
    const w = installed();
    // Unstudied use is refused without any cost.
    expect(unchanged(w, mode('inspect'))).toMatch(/not mastered/);
    let now = step(w, {
      lin: { interface: 'learn', args: { ability: ID } },
    }).world;
    let idle = step(w).world;
    for (let i = 1; i < 5; i++) {
      expect(actor(now).mastered).not.toContain(ID);
      expect(actor(now).learning?.remaining).toBe(5 - i);
      now = step(now).world;
      idle = step(idle).world;
    }
    expect(actor(now).mastered).toContain(ID);
    expect(actor(now).learning).toBeNull();
    expect(
      Math.round((actor(idle).vitals.energy - actor(now).vitals.energy) * 1e6) /
        1e6,
    ).toBe(2.5);
    // Study grants no sample, record, reward or practice milestone.
    expect(v7Signature(now.stacks)).toBe(v7Signature(idle.stacks));
    expect(actor(now).memory.knowledge ?? {}).toEqual(
      actor(idle).memory.knowledge ?? {},
    );
    expect(events(now, 'practice-confirmed')).toHaveLength(0);
  });

  it('assesses total aflatoxins for one round and 0.2 energy, with the specification bill and no measurement', () => {
    const f = setup();
    const before = stack(f.w, f.nut);
    const { world: w, idle, energy } = cost(f.w, aflatoxins(f));
    expect(energy).toBe(0.2);
    // Nothing is handled, consumed, moved or reserved.
    expect(stack(w, f.nut)).toEqual(stack(idle, f.nut));
    expect(stack(w, f.nut).quantity).toBe(before.quantity);
    expect(stack(w, f.nut).reservedFor).toBeUndefined();
    expect(v7Signature(w.stacks)).toBe(v7Signature(idle.stacks));
    expect(v7Signature(w.objects)).toBe(v7Signature(idle.objects));
    expect(w.processes).toEqual(idle.processes);
    const e = last(w, 'constituent-test-assessed');
    expect(e.tick).toBe(f.w.tick + 1);
    expect(e.target).toBe(f.nut);
    const d = e.data as unknown as {
      result: string;
      measured: boolean;
      runAvailable: boolean;
      analyte: string;
      requirements: Requirement[];
      missing: string[];
      unestablished: string[];
      present: string[];
      notMeasured: string;
      origin: string;
      record: string;
      energy: number;
      view: Record<string, unknown>;
    };
    expect(d.result).toBe('no measurement available');
    expect(d.measured).toBe(false);
    expect(d.runAvailable).toBe(false);
    expect(d.analyte).toMatch(/B1, B2, G1 and G2/);
    expect(d.origin).toBe(NUTS);
    expect(d.energy).toBe(0.2);
    expect(
      Object.fromEntries(d.requirements.map((r) => [r.key, r.status])),
    ).toEqual(AFLATOXIN_BILL);
    expect(d.present).toEqual(['sample']);
    expect(d.missing).toEqual(MISSING);
    expect(d.unestablished).toEqual(UNESTABLISHED);
    expect(
      d.requirements.find((r) => r.key === 'absoluteBalance')?.basis,
    ).toMatch(/fractions of its reference piece/);
    expect(d.notMeasured).toMatch(/measured nothing/);
    expect(d.notMeasured).toMatch(/not dietary evidence/);
    expect(d.view).toMatchObject({
      capability: ID,
      mode: 'assess',
      actor: 'lin',
      target: f.nut,
      status: 'requirements-missing',
      measured: false,
      badge: null,
      progress: null,
    });
    // The unverified personal record, evidenced by its own trial-result event.
    const record =
      actor(w).memory.knowledge?.[
        `${f.nut}:constituent-assessment:total-aflatoxins`
      ];
    expect(record).toMatchObject({
      subject: 'hazelnut',
      verified: false,
      tick: f.w.tick + 1,
      value: {
        result: 'no measurement available',
        measured: false,
        missing: MISSING,
        unestablished: UNESTABLISHED,
      },
    });
    expect(record?.evidence).toBe(d.record);
    expect(last(w, 'trial-result').id).toBe(d.record);
    expect(last(w, 'trial-result').data.verified).toBe(false);
    // No reward, confirmation or practice milestone follows a checklist.
    for (const t of ['information-confirmed', 'practice-confirmed'])
      expect(events(w, t)).toHaveLength(events(idle, t).length);
    expect(actor(w).wellbeing.sources).toEqual(actor(idle).wellbeing.sources);
    expect(actor(w).extensionState[`long:${ID}`]).toMatchObject({
      assessments: [
        {
          round: f.w.tick + 1,
          target: f.nut,
          constituent: 'total aflatoxins',
          family: 'total-aflatoxins',
          result: 'no measurement available',
          evidence: d.record,
        },
      ],
    });
    // Agent-visible text of the event and record avoids the excluded words.
    const shown = JSON.stringify([
      e,
      last(w, 'trial-result'),
      record,
      actor(w).extensionState[`long:${ID}`],
    ]);
    expect(CULTURE_EXCLUDED_WORDS.test(shown)).toBe(false);
    expect(EXTRA_EXCLUDED.test(shown)).toBe(false);
  });

  it('reports methodRef and sampleMass against the bill, and a different constituent with no method family', () => {
    const f = setup();
    const r = cost(
      f.w,
      aflatoxins(f, { methodRef: 'Kit X rev 2 lot 7', sampleMass: 20 }),
    );
    const rows = last(r.world, 'constituent-test-assessed').data
      .requirements as unknown as Requirement[];
    expect(rows.find((x) => x.key === 'methodReference')).toMatchObject({
      status: 'missing',
      basis: expect.stringMatching(/'Kit X rev 2 lot 7' is not one/) as unknown,
    });
    expect(rows.find((x) => x.key === 'sampleSize')).toMatchObject({
      status: 'unestablished',
      basis: expect.stringMatching(/20 g was requested/) as unknown,
    });
    const g = cost(
      fed(r.world),
      mode('assess', { targetItemId: f.nut, constituent: 'Solanine' }),
    );
    expect(g.energy).toBe(0.2);
    const d = last(g.world, 'constituent-test-assessed').data as unknown as {
      requirements: Requirement[];
      result: string;
    };
    expect(d.result).toBe('no measurement available');
    expect(
      Object.fromEntries(d.requirements.map((x) => [x.key, x.status])),
    ).toEqual({
      sample: 'present',
      methodReference: 'missing',
      analyticalFamily: 'unestablished',
      absoluteBalance: 'missing',
      materials: 'unestablished',
    });
    expect(
      actor(g.world).memory.knowledge?.[
        `${f.nut}:constituent-assessment:solanine`
      ]?.verified,
    ).toBe(false);
  });

  it('discloses no hidden constituent, mass, contamination, nutrition or toxicity value', () => {
    const f = setup();
    const alter = (w: V7World) => {
      const x = v7Clone(w);
      const r = x.resources.find((r) => r.id === 'hazelnut');
      if (!r) throw new Error('Missing hazelnut resource.');
      r.toxicity = 37;
      r.nutrition = 3;
      r.mass = 0.9;
      return x;
    };
    const a = cost(f.w, aflatoxins(f)).world;
    const b = cost(alter(f.w), aflatoxins(f)).world;
    const strip = (w: V7World) => {
      const e = last(w, 'constituent-test-assessed');
      return {
        description: e.description,
        data: e.data,
        record: last(w, 'trial-result').data,
      };
    };
    // The output does not depend on the latent food values at all.
    expect(strip(b)).toEqual(strip(a));
    const found = keys(strip(a));
    for (const k of HIDDEN_KEYS) expect(found.has(k)).toBe(false);
    // Apart from the statement of what was not established, nothing speaks of these properties.
    const { notMeasured, ...rest } = strip(a).data;
    expect(notMeasured).toMatch(/Not established: .*nutrition/);
    expect(JSON.stringify({ ...strip(a), data: rest })).not.toMatch(
      /toxic|nutrition|edibl|safe/i,
    );
  });

  it('refuses run and resume before any cost with the exact missing list, and cancel at no cost', () => {
    const f = setup();
    const run = unchanged(
      f.w,
      mode('run', {
        targetItemId: f.nut,
        constituent: 'total aflatoxins',
        methodRef: 'Kit X rev 2 lot 7',
        sampleMass: 20,
        equipmentIds: [f.stone],
      }),
    );
    expect(run).toMatch(/^A run cannot start: /);
    expect(run).toContain(`missing: ${MISSING.join(', ')}`);
    expect(run).toContain(`unestablished: ${UNESTABLISHED.join(', ')}`);
    expect(run).toMatch(/no measurement is available\. Nothing was spent\.$/);
    expect(run).not.toMatch(/sample:/);
    // An incomplete run request lists its own gaps as well.
    const bare = unchanged(f.w, mode('run'));
    expect(bare).toMatch(/constituent: not named/);
    expect(bare).toMatch(/sample: Name your own food item in targetItemId;/);
    expect(bare).toMatch(/missing: sample, methodReference, absoluteBalance/);
    const lost = unchanged(
      f.w,
      mode('run', {
        targetItemId: f.nut,
        constituent: 'total aflatoxins',
        reagentIds: ['no-such-thing'],
      }),
    );
    expect(lost).toMatch(/unknown ids: no-such-thing/);
    const resume = unchanged(
      f.w,
      mode('resume', { targetItemId: f.nut, constituent: 'aflatoxins' }),
    );
    expect(resume).toMatch(
      /^No logged run exists to resume, and a run cannot start: /,
    );
    expect(resume).toContain(`missing: ${MISSING.join(', ')}`);
    expect(unchanged(f.w, mode('cancel'))).toBe(
      'No run of this operation exists, so nothing is reserved or released. Nothing was spent.',
    );
  });

  it('refuses unsuitable requests without spending anything', () => {
    const f = setup();
    expect(unchanged(f.w, mode('assess', { targetItemId: f.nut }))).toMatch(
      /Name the constituent/,
    );
    expect(
      unchanged(f.w, mode('assess', { constituent: 'aflatoxins' })),
    ).toMatch(/Name your own food item/);
    expect(unchanged(f.w, aflatoxins({ ...f, nut: f.stone }))).toMatch(
      /is not food/,
    );
    expect(
      unchanged(f.w, aflatoxins({ ...f, nut: 'item-0-nobody-0' })),
    ).toMatch(/absent-or-inaccessible-identity/);
    const spoiled = v7Clone(f.w);
    stack(spoiled, f.nut).decay = 800;
    expect(unchanged(spoiled, aflatoxins(f))).toMatch(/is spoiled/);
    const reserved = v7Clone(f.w);
    stack(reserved, f.nut).reservedFor = 'other-work';
    // The shared reference resolver refuses reserved material before the handler runs.
    expect(unchanged(reserved, aflatoxins(f))).toMatch(/reserved-material/);
    expect(
      unchanged(f.w, aflatoxins(f, { reagentIds: ['no-such-thing'] })),
    ).toMatch(
      /Not your item, an object within reach or your record: no-such-thing/,
    );
    // A real object out of reach is not accepted as equipment.
    expect(unchanged(f.w, aflatoxins(f, { equipmentIds: [TREE] }))).toMatch(
      new RegExp(`record: ${TREE}`),
    );
    expect(
      unchanged(f.w, aflatoxins(f, { equipmentIds: 'not-a-list' })),
    ).toMatch(/equipmentIds must be a declared array/);
    expect(unchanged(f.w, aflatoxins(f, { sampleMass: -1 }))).toMatch(
      /Invalid finite arguments\.sampleMass/,
    );
    // Over-long text is refused at no cost instead of pausing the round.
    expect(
      unchanged(f.w, aflatoxins(f, { constituent: 'x'.repeat(81) })),
    ).toMatch(/constituent is longer than 80 characters/);
    expect(
      unchanged(f.w, aflatoxins(f, { methodRef: 'm'.repeat(161) })),
    ).toMatch(/methodRef is longer than 160 characters/);
    expect(
      unchanged(f.w, aflatoxins(f, { referenceIds: ['r'.repeat(121)] })),
    ).toMatch(/referenceIds ids are at most 120 characters/);
    expect(unchanged(f.w, mode('measure'))).toMatch(
      /mode is outside the declared choices/,
    );
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.1;
    expect(unchanged(tired, aflatoxins(f))).toMatch(/needs 0.2 energy/);
    // Nothing has been assessed yet, so there is nothing to inspect.
    expect(unchanged(f.w, mode('inspect'))).toMatch(
      /no assessment of this operation to inspect, and no run exists/,
    );
  });

  it('reports each supplied id and shows that none meets a requirement', () => {
    const f = setup();
    const knowledge = actor(f.w).memory.knowledge ?? {};
    const nutRecord = Object.values(knowledge).find(
      (k) => k.subject === 'hazelnut',
    );
    const stoneRecord = Object.values(knowledge).find(
      (k) => k.subject === 'stone',
    );
    if (!nutRecord || !stoneRecord) throw new Error('Missing probe records.');
    const r = cost(
      f.w,
      aflatoxins(f, {
        equipmentIds: [`item:${f.stone}`, f.stone],
        reagentIds: [f.nut],
        referenceIds: [nutRecord.key, nutRecord.evidence, stoneRecord.key],
      }),
    );
    expect(r.energy).toBe(0.2);
    const d = last(r.world, 'constituent-test-assessed').data as unknown as {
      supplied: Supplied[];
      requirements: Requirement[];
      view: { equipmentIds: string[]; materialIds: string[] };
    };
    expect(d.supplied.map((s) => [s.id, s.role])).toEqual([
      [f.stone, 'equipment'],
      [f.nut, 'reagent'],
      [nutRecord.key, 'reference'],
      [nutRecord.evidence, 'reference'],
      [stoneRecord.key, 'reference'],
    ]);
    expect(d.supplied.every((s) => !s.meets)).toBe(true);
    expect(d.supplied[0]?.why).toMatch(/plain material, not a reagent/);
    expect(d.supplied[1]?.why).toMatch(/cannot be its own/);
    expect(d.supplied[2]?.why).toMatch(
      /an observation, not a dietary measurement/,
    );
    expect(d.supplied[3]?.is).toBe(d.supplied[2]?.is);
    expect(d.supplied[4]?.why).toMatch(/about stone, not hazelnut/);
    // Supplied ids never change the bill.
    expect(
      Object.fromEntries(d.requirements.map((x) => [x.key, x.status])),
    ).toEqual(AFLATOXIN_BILL);
    expect(d.view.equipmentIds).toEqual([f.stone]);
    expect(d.view.materialIds).toEqual([
      f.nut,
      nutRecord.key,
      nutRecord.evidence,
      stoneRecord.key,
    ]);
  });

  it('reports a real beam comparator as relative, not as the absolute balance', () => {
    // Moss learns and assembles a beam comparator as compare-material-samples does.
    let w = installed();
    w = fed(v7Clone(v7Install(w, continuousRegistry(w), `${KIT}@1`)));
    w = study(w, KIT, 'moss', 4);
    const beam = gather(w, TREE, 'moss');
    const reference = gather(beam.w, TREE, 'moss');
    const fulcrum = gather(reference.w, 'start-2-stone', 'moss');
    w = fulcrum.w;
    actor(w, 'moss').position = { ...STAND };
    const assemble = (args: V7Data) => {
      const r = step(w, { moss: { interface: KIT, args } });
      expect(r.outcomes.moss?.success).toBe(true);
      w = fed(r.world);
    };
    assemble({
      mode: 'assemble',
      materialIds: [beam.item, fulcrum.item],
      referenceId: reference.item,
    });
    assemble({ mode: 'assemble' });
    assemble({ mode: 'assemble' });
    const device = w.objects.find((o) => o.kind === 'lever-comparator');
    if (!device) throw new Error('Missing comparator.');
    // Lin studies the test, gathers a hazelnut and stands within reach of the comparator.
    w = study(w, ID);
    const nut = gather(w, NUTS);
    w = nut.w;
    actor(w).position = free(
      w,
      device.spatial.x,
      device.spatial.y,
      0.55,
      'lin',
    );
    const r = cost(
      w,
      mode('assess', {
        targetItemId: nut.item,
        constituent: 'total aflatoxins',
        equipmentIds: [device.id],
      }),
    );
    const d = last(r.world, 'constituent-test-assessed').data as unknown as {
      supplied: Supplied[];
      requirements: Requirement[];
    };
    expect(d.supplied).toEqual([
      {
        id: device.id,
        role: 'equipment',
        is: 'beam mass comparator',
        meets: false,
        why: 'it reads mass only as a fraction of its reference piece, not grams, so it cannot be the absolute balance',
      },
    ]);
    expect(
      d.requirements.find((x) => x.key === 'absoluteBalance')?.status,
    ).toBe('missing');
    // The comparator is only looked at: it keeps its state and parts.
    expect(r.world.objects.find((o) => o.id === device.id)).toEqual(
      r.idle.objects.find((o) => o.id === device.id),
    );
  });

  it('keeps assessments personal: owner rules for the sample and for inspection', () => {
    const f = setup();
    // Lin cannot assess Moss's hazelnut, even with Moss beside her: another person's carried
    // item is not accessible to the shared reference resolver.
    actor(f.w, 'moss').position = free(
      f.w,
      actor(f.w).position.x,
      actor(f.w).position.y,
      0.6,
      'moss',
    );
    expect(unchanged(f.w, aflatoxins({ ...f, nut: f.mossNut }))).toMatch(
      /absent-or-inaccessible-identity/,
    );
    // A visible hazelnut lying unowned on the ground is not Lin's own sample either.
    const dropped = step(f.w, {
      lin: { interface: 'drop', args: { target: f.nut, quantity: 1 } },
    });
    expect(dropped.outcomes.lin?.success).toBe(true);
    const ground = last(dropped.world, 'dropped').data.item;
    if (typeof ground !== 'string') throw new Error('Missing dropped item.');
    expect(stack(dropped.world, ground).owner).toBeNull();
    expect(
      unchanged(fed(dropped.world), aflatoxins({ ...f, nut: ground })),
    ).toMatch(
      /is not one of your own items; only your own sample can be assessed/,
    );
    // Moss has not studied the operation.
    expect(
      unchanged(
        f.w,
        mode('assess', { targetItemId: f.mossNut, constituent: 'aflatoxins' }),
        'moss',
      ),
    ).toMatch(/not mastered/);
    // Lin assesses twice; inspection costs one round and 0.2 and lists only Lin's own records.
    let w = cost(f.w, aflatoxins(f)).world;
    w = cost(
      fed(w),
      mode('assess', { targetItemId: f.nut, constituent: 'solanine' }),
    ).world;
    const i = cost(fed(w), mode('inspect'));
    expect(i.energy).toBe(0.2);
    const d = last(i.world, 'constituent-test-inspected').data as unknown as {
      assessments: { target: string; family: string; result: string }[];
      total: number;
      run: null;
      measured: boolean;
    };
    expect(d.total).toBe(2);
    expect(d.assessments.map((x) => x.family)).toEqual([
      'total-aflatoxins',
      'solanine',
    ]);
    expect(
      d.assessments.every((x) => x.result === 'no measurement available'),
    ).toBe(true);
    expect(d.run).toBeNull();
    expect(d.measured).toBe(false);
    expect(v7Signature(i.world.stacks)).toBe(v7Signature(i.idle.stacks));
    const filtered = cost(
      fed(i.world),
      mode('inspect', { targetItemId: f.nut }),
    );
    expect(last(filtered.world, 'constituent-test-inspected').data.total).toBe(
      2,
    );
    // Moss, once studied, assesses its own nut and sees only its own records.
    let m = study(fed(i.world), ID, 'moss');
    actor(m, 'moss').position = free(
      m,
      actor(m).position.x,
      actor(m).position.y,
      0.6,
      'moss',
    );
    expect(unchanged(m, mode('inspect'), 'moss')).toMatch(
      /no assessment of this operation to inspect/,
    );
    m = cost(
      m,
      mode('assess', { targetItemId: f.mossNut, constituent: 'aflatoxins' }),
      'moss',
    ).world;
    const mi = cost(fed(m), mode('inspect'), 'moss');
    const md = last(mi.world, 'constituent-test-inspected', 'moss')
      .data as unknown as {
      assessments: { target: string }[];
      total: number;
    };
    expect(md.total).toBe(1);
    expect(md.assessments.map((x) => x.target)).toEqual([f.mossNut]);
    expect(
      (
        actor(mi.world).extensionState[`long:${ID}`] as {
          assessments: unknown[];
        }
      ).assessments,
    ).toHaveLength(2);
  });
});
