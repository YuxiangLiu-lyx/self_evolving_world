import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Observe,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'apply-marking-material';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Sol's actual ex20 berry source and Sol's position at the round-8 request. */
const SOURCE = 'forest-berry-1';
const STAND = { x: 13.60929723, y: 16.57717592 };
/** A forest-floor point 0.31 from Sol: outside Sol's body, within hand reach. */
const SPOT = { x: 13.3, y: 16.58 };
/** A small branching pattern around SPOT: a stem and two arms from one junction, 0.298 long. */
const BRANCH = [
  {
    points: [
      { x: 0, y: 0.1 },
      { x: 0, y: 0 },
    ],
    material: 0.2,
  },
  {
    points: [
      { x: 0, y: 0 },
      { x: -0.07, y: -0.07 },
    ],
    material: 0.2,
  },
  {
    points: [
      { x: 0, y: 0 },
      { x: 0.07, y: -0.07 },
    ],
    material: 0.2,
  },
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
const actor = (w: V7World, name = 'sol'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
type Mark = {
  kind: string;
  points: { x: number; y: number }[];
  debit: number;
  deposit: number;
  residue: number;
  waste: number;
  liquid: number;
  color: string;
  contrast: number;
  coverage: number;
  visible: boolean;
};
type Marking = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  source: string;
  floor: number;
  budget: number;
  escrow: string[];
  paidEnergy: number;
  surface: Record<string, unknown>;
  test: Record<string, unknown>;
  plan: unknown[];
  marks: Mark[];
  totals: Record<string, number>;
  deposit: string | null;
  pattern: Record<string, unknown> | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Marking);
const work = (w: V7World): Marking => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing marking work.');
  return j;
};
const marks = (w: V7World) =>
  w.objects.filter((o) => o.kind === 'applied-mark');
/** Every unit from Sol's berry source still held as a stack anywhere. */
const berries = (w: V7World) =>
  w.stacks
    .filter((s) => s.origin === SOURCE)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const act = (m: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
const test = (unit: string, extra: Record<string, unknown> = {}) =>
  act('test', { sourceId: unit, ...SPOT, budget: 1, floor: 3, ...extra });
const draw = (strokes: unknown = BRANCH) => act('draw', { strokes });
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex20', 'long-culture-v2', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Sol gathers four real berries from the observed bush, as in ex20, and studies one round. */
function setup(study = true) {
  let w = installed();
  actor(w).position = { ...STAND };
  w = step(w, {
    sol: { interface: 'gather', args: { target: SOURCE, quantity: 4 } },
  }).world;
  const unit = w.stacks.find((s) => s.owner === 'sol' && s.origin === SOURCE);
  if (!unit) throw new Error('Missing actually gathered fixture berries.');
  expect(unit.quantity).toBe(4);
  if (study) {
    expect(actor(w).mastered).not.toContain(id);
    w = step(w, { sol: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).mastered).toContain(id);
  }
  return { w: fed(w), unit: unit.id };
}
/** A visible test at SPOT with the requested floor of three and a one-unit budget. */
function tested() {
  const f = setup();
  const r = step(f.w, { sol: test(f.unit) });
  expect(r.outcomes.sol?.success).toBe(true);
  return { ...f, w: fed(r.world) };
}
/** The action fails and changes no vitals, stacks, works or marks compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'sol') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  expect(v7Signature(marks(result.world))).toBe(v7Signature(marks(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action) {
  const r = step(w, { sol: action }),
    idle = step(w).world;
  expect(r.outcomes.sol?.success).toBe(true);
  return {
    world: r.world,
    outcome: r.outcomes.sol,
    energy: actor(idle).vitals.energy - actor(r.world).vitals.energy,
  };
}
const hex = (v: string) =>
  [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
function conserved(m: Pick<Mark, 'debit' | 'deposit' | 'residue' | 'waste'>) {
  expect(m.deposit + m.residue + m.waste).toBeCloseTo(m.debit, 8);
}

describe('apply marking material in ex20', () => {
  it('is scoped to ex20, fits the text limit, adds no reward source and needs one round of study', () => {
    for (const [scope, scenario] of [
      ['long-ex19', 'long-culture-v2-oldgoal'],
      ['long-ex18', 'long-culture-v2-incentives'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers['long.apply-marking-material']).toBeDefined();
    expect(all.handlers['long.food-air-exposure-trial']).toBeDefined();
    const f = setup(false);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex20');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.abilities).toHaveLength(1);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(1);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['test', 'draw', 'cancel'],
    });
    expect(ability?.references).toEqual({
      sourceId: 'optional-exact-visible',
      applicatorId: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      satisfaction: pkg?.satisfaction.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Its one drawing is the ground mark; no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual(['applied-mark']);
    expect(pkg?.satisfaction).toEqual([]);
    expect(f.w.config.longDevelopment?.culture?.incentives).toBe(false);
    // Unstudied use is refused without any cost.
    expect(unchanged(f.w, test(f.unit))).toMatch(/master|learn|stud/i);
    // One round of study, then the interface is usable.
    let w = step(f.w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).toContain(id);
    w = fed(w);
    expect(step(w, { sol: test(f.unit) }).outcomes.sol?.success).toBe(true);
  });

  it('tests with the reused probe press at its real cost and leaves a conserved mark whose colour is derived', () => {
    const f = setup();
    const before = actor(f.w).wellbeing;
    const sources = f.w.satisfaction.length;
    const r = cost(f.w, test(f.unit));
    // The probe press: one round, 0.5 energy and 0.1 of the source.
    expect(r.energy).toBeCloseTo(0.5, 8);
    const w = r.world;
    const j = work(w);
    expect(j).toMatchObject({
      owner: 'sol',
      status: 'paused',
      stage: 'tested',
      source: f.unit,
      floor: 3,
      budget: 1,
      paidEnergy: 0.5,
      surface: { ref: 'ground:13:16', ground: 'f', name: 'forest floor' },
    });
    // The reused probe recorded its load response and consumed the sample.
    expect(data(w, 'trial-material-consumed')).toMatchObject({
      resource: 'berry',
      quantity: 0.1,
      mode: 'press',
    });
    expect(events(w, 'trial-material-consumed').at(-1)?.target).toBe(f.unit);
    expect(
      actor(w).memory.knowledge?.['berry:load response:load-band-1'],
    ).toMatchObject({ value: { load: 0.5, held: false }, verified: true });
    // Reserve floor: the source keeps exactly its floor; the rest of the budget is reserved.
    expect(stack(w, f.unit)).toMatchObject({ owner: 'sol', quantity: 3 });
    const reserve = stack(w, j.escrow[0] ?? '');
    expect(reserve).toMatchObject({
      owner: 'sol',
      quantity: 0.9,
      reservedFor: j.id,
      origin: SOURCE,
    });
    expect(berries(w)).toBeCloseTo(4 - 0.1, 8);
    // Conservation of the debited sample: liquid share 0.85, a quarter on the hand, solids waste.
    expect(j.test).toMatchObject({
      debit: 0.1,
      pulped: true,
      held: false,
      liquidShare: 0.85,
      liquid: 0.085,
      deposit: 0.06375,
      residue: 0.02125,
      waste: 0.015,
      coverage: 1,
      visible: true,
      materialColor: '#b34f66',
    });
    conserved(j.test as unknown as Mark);
    expect(j.totals).toEqual({
      debited: 0.1,
      liquid: 0.085,
      deposit: 0.06375,
      residue: 0.02125,
      waste: 0.015,
    });
    // The colour is the berry colour at 0.6 opacity over the forest-floor tone, not the berry colour.
    const color = String(j.test.color);
    expect(color).not.toBe('#b34f66');
    const ground = hex('#52644a'),
      berry = hex('#b34f66'),
      seen = hex(color);
    seen.forEach((v, i) => {
      expect(v).toBe(
        Math.round(
          (ground[i] ?? 0) + ((berry[i] ?? 0) - (ground[i] ?? 0)) * 0.6,
        ),
      );
    });
    expect(j.test.contrast).toBeCloseTo(0.14, 2);
    // A real, non-solid mark object on the ground, seen by nearby people.
    const [o] = marks(w);
    expect(marks(w)).toHaveLength(1);
    expect(o).toMatchObject({
      id: j.deposit,
      createdBy: 'sol',
      revision: `${id}@1`,
      spatial: { x: SPOT.x, y: SPOT.y, solid: false },
      visual: { component: 'applied-mark', color },
      data: { durability: 'untested', material: 'berry', transferred: 0.06375 },
    });
    expect(o?.spatial.reserved).toBeUndefined();
    expect(
      v7Observe(w, 'moss').objects.find((x) => x.id === j.deposit)?.data.marks,
    ).toHaveLength(1);
    // The observable event carries the measured outcome and rendering metadata.
    expect(data(w, 'marking-tested')).toMatchObject({
      mode: 'test',
      debit: { item: f.unit, quantity: 0.1 },
      view: {
        component: 'applied-mark',
        deposit: j.deposit,
        surface: 'ground:13:16',
        transferred: 0.06375,
        durability: 'untested',
        marks: [{ kind: 'dab', visible: true, color }],
      },
    });
    expect(
      actor(w).memory.knowledge?.['berry:hand-press-mark:f:ordinary soil'],
    ).toMatchObject({ value: { visible: true }, verified: true });
    // No practice milestone, satisfaction source or wellbeing award is attached.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(w.satisfaction).toHaveLength(sources);
    expect(actor(w).wellbeing.sources).toEqual(before.sources);
  });

  it('draws a bounded branching pattern one paid stroke per round and returns the unused reserve', () => {
    const t = tested();
    const reserve = work(t.w).escrow[0] ?? '';
    let w = t.w;
    const paid: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = cost(fed(w), draw());
      paid.push(r.energy);
      w = r.world;
      expect(r.outcome?.complete).toBe(i === 2);
      expect(events(w, 'marking-stroke')).toHaveLength(1);
      expect(events(w, 'process-progress')).toHaveLength(1);
    }
    // At most 0.2 energy and one round per stroke.
    for (const e of paid) expect(e).toBeCloseTo(0.2, 8);
    const j = work(w);
    expect(j).toMatchObject({
      status: 'completed',
      stage: 'completed',
      pattern: { visibleStrokes: 3, junctions: 1, branching: true },
    });
    expect(j.marks.map((m) => m.kind)).toEqual([
      'dab',
      'stroke',
      'stroke',
      'stroke',
    ]);
    for (const m of j.marks) conserved(m);
    // Debited: 0.1 test + 3 x 0.2 strokes; deposit, residue and waste partition it.
    expect(j.totals.debited).toBeCloseTo(0.7, 8);
    expect(
      (j.totals.deposit ?? 0) + (j.totals.residue ?? 0) + (j.totals.waste ?? 0),
    ).toBeCloseTo(0.7, 8);
    // No duplicated edible quantity: 4 berries = source + returned reserve + debited.
    expect(stack(w, t.unit)).toMatchObject({ quantity: 3 });
    expect(stack(w, reserve)).toMatchObject({ owner: 'sol', quantity: 0.3 });
    expect(stack(w, reserve).reservedFor).toBeUndefined();
    expect(berries(w) + (j.totals.debited ?? 0)).toBeCloseTo(4, 8);
    const [o] = marks(w);
    expect(o?.data.marks).toHaveLength(4);
    expect(o?.visual.state).toBe('completed');
    expect(o?.data.transferred).toBeCloseTo(j.totals.deposit ?? 0, 8);
    expect(data(w, 'marking-completed')).toMatchObject({
      released: [reserve],
      pattern: { branching: true },
    });
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
  });

  it('quotes the selected strokes and upper-bound costs before the first stroke', () => {
    const t = tested();
    const r = step(t.w, { sol: draw() });
    const quote = events(r.world, 'marking-draw-quoted');
    expect(quote).toHaveLength(1);
    expect(quote[0]?.data.quote).toEqual({
      strokes: 3,
      length: 0.298,
      energy: 0.6,
      material: 0.6,
      rounds: 3,
    });
    expect(
      r.world.events.findIndex((e) => e.type === 'marking-draw-quoted'),
    ).toBeLessThan(
      r.world.events.findIndex((e) => e.type === 'marking-stroke'),
    );
  });

  it('keeps the reserve floor and spends nothing on refused requests', () => {
    const f = setup();
    const w = f.w;
    // The floor: 4 units cannot give a budget of 0.6 above a floor of 3.5.
    expect(unchanged(w, test(f.unit, { floor: 3.5, budget: 0.6 }))).toMatch(
      /less than the floor/,
    );
    expect(unchanged(w, test(f.unit, { budget: 0.15 }))).toMatch(/tenths/);
    expect(unchanged(w, test(f.unit, { x: 13.0, y: 16.58 }))).toMatch(
      /beyond hand reach/,
    );
    expect(unchanged(w, test(f.unit, { x: STAND.x, y: STAND.y }))).toMatch(
      /under a body/,
    );
    expect(
      unchanged(w, act('test', { sourceId: f.unit, budget: 1, floor: 3 })),
    ).toMatch(/Give x and y/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.4;
    expect(unchanged(tired, test(f.unit))).toMatch(/needs 0.5 energy/);
    const spoiled = v7Clone(w);
    stack(spoiled, f.unit).decay = 100;
    expect(unchanged(spoiled, test(f.unit))).toMatch(/Spoiled/);
    const tool = v7Clone(w);
    tool.stacks.push({
      id: 'held-branch',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...STAND },
      owner: 'sol',
      origin: 'fixture',
      harvestedAt: 0,
      decay: 0,
    });
    expect(
      unchanged(tool, test(f.unit, { applicatorId: 'held-branch' })),
    ).toMatch(/No applicator transfer is represented/);
    // A water cell is not ground.
    const river = v7Clone(w);
    actor(river).position = { x: 24.7, y: 18.5 };
    expect(unchanged(river, test(f.unit, { x: 25.15, y: 18.5 }))).toMatch(
      /water, not ground/,
    );
    // A solid object over the point.
    const covered = v7Clone(w);
    const tree = covered.objects.find((o) => o.spatial.solid);
    if (!tree) throw new Error('Missing solid fixture object.');
    covered.objects.push({
      ...v7Clone(tree),
      id: 'fixture-stone',
      spatial: {
        ...v7Clone(tree.spatial),
        x: SPOT.x,
        y: SPOT.y,
        shape: { kind: 'circle', radius: 0.05 },
        entrances: [],
      },
    });
    expect(unchanged(covered, test(f.unit))).toMatch(/solid or reserved/);
    // Drawing needs a visible test of one's own.
    expect(unchanged(w, draw())).toMatch(/test first/);
    expect(unchanged(w, act('cancel'))).toMatch(/no open marking work/);
    // Draw bounds after a visible test: count, length, material, reach and the tested surface.
    const t = tested();
    expect(unchanged(t.w, draw([...BRANCH, BRANCH[0]]))).toMatch(/1 to 3/);
    expect(
      unchanged(
        t.w,
        draw([
          {
            points: [
              { x: 0, y: 0.16 },
              { x: 0, y: 0 },
              { x: 0.15, y: 0 },
            ],
            material: 0.1,
          },
        ]),
      ),
    ).toMatch(/at most 0.3/);
    expect(
      unchanged(
        t.w,
        draw([
          {
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 0.1 },
            ],
            material: 0.4,
          },
        ]),
      ),
    ).toMatch(/material/);
    expect(
      unchanged(
        t.w,
        draw([
          {
            points: [
              { x: -0.1, y: 0 },
              { x: -0.25, y: 0 },
            ],
            material: 0.1,
          },
        ]),
      ),
    ).toMatch(/beyond hand reach/);
    const heavy = BRANCH.map((s) => ({ ...s, material: 0.3 }));
    const thin = v7Clone(t.w);
    const reserve = stack(thin, work(thin).escrow[0] ?? '');
    reserve.quantity = 0.5;
    reserve.quantityTenths = 5;
    expect(unchanged(thin, draw(heavy))).toMatch(/reserve holds 0.5/);
    expect(unchanged(t.w, test(t.unit))).toMatch(/still open/);
    // Eating the source below the floor stops the first stroke before any charge.
    const hungry = step(t.w, {
      sol: { interface: 'eat', args: { target: t.unit, quantity: 1 } },
    }).world;
    expect(stack(hungry, t.unit).quantity).toBe(2);
    expect(unchanged(fed(hungry), draw())).toMatch(/floor of 3/);
  });

  it('reports an honest failed transfer that spends the sample and makes no mark', () => {
    const f = setup();
    // Wet bank: the juice is released but disperses into the saturated ground.
    const bank = v7Clone(f.w);
    actor(bank).position = { x: 17.85, y: 18.5 };
    const r = cost(bank, test(f.unit, { x: 18.3, y: 18.5 }));
    expect(r.energy).toBeCloseTo(0.5, 8);
    let j = work(r.world);
    expect(j).toMatchObject({
      status: 'completed',
      stage: 'no-visible-transfer',
      escrow: [],
      deposit: null,
      surface: { ground: ',', name: 'wet bank', holdsLiquid: false },
      test: { pulped: true, deposit: 0, visible: false, contrast: 0 },
    });
    conserved(j.test as unknown as Mark);
    expect(j.test.residue).toBeCloseTo(0.02125, 8);
    expect(marks(r.world)).toHaveLength(0);
    expect(stack(r.world, f.unit).quantity).toBe(3.9);
    expect(r.world.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(data(r.world, 'marking-tested')).toMatchObject({
      view: { marks: [], deposit: null },
    });
    expect(unchanged(fed(r.world), draw())).toMatch(/test first/);
    // A flexible branch does not pulp: no liquid and no mark; the sample is spent.
    const wood = v7Clone(f.w);
    wood.stacks.push({
      id: 'held-branch',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...STAND },
      owner: 'sol',
      origin: 'fixture',
      harvestedAt: 0,
      decay: 0,
    });
    const b = cost(wood, test('held-branch', { floor: 0 }));
    expect(b.energy).toBeCloseTo(0.5, 8);
    j = work(b.world);
    expect(j).toMatchObject({
      stage: 'no-visible-transfer',
      test: { pulped: false, liquid: 0, deposit: 0, residue: 0, waste: 0.1 },
    });
    expect(stack(b.world, 'held-branch').quantity).toBe(0.9);
    expect(marks(b.world)).toHaveLength(0);
    expect(b.outcome?.reason).toMatch(/did not pulp/);
  });

  it('pauses at interruption or a failed recheck without charge, resumes, and cancels without refunds', () => {
    const t = tested();
    let w = step(t.w, { sol: draw() }).world;
    expect(work(w).marks).toHaveLength(2);
    // An unworked round stops contact: no charge, the drawn stroke stays.
    w = step(fed(w)).world;
    expect(events(w, 'marking-interrupted')).toHaveLength(1);
    expect(work(w)).toMatchObject({ status: 'paused', stage: 'drawing' });
    expect(work(w).paidEnergy).toBeCloseTo(0.7, 8);
    expect(marks(w)[0]?.data.marks).toHaveLength(2);
    // Resuming rechecks and pays only the next stroke.
    const again = cost(fed(w), act('draw'));
    expect(again.energy).toBeCloseTo(0.2, 8);
    w = again.world;
    expect(events(w, 'marking-resumed')).toHaveLength(1);
    expect(work(w).marks).toHaveLength(3);
    // A changed plan is a new attempt.
    expect(unchanged(fed(step(w).world), draw(BRANCH.slice(0, 2)))).toMatch(
      /different stroke plan/,
    );
    // Walking out of reach mid-drawing pauses before any charge.
    const away = fed(step(w).world);
    actor(away).position = { x: STAND.x + 0.4, y: STAND.y };
    const paused = cost(away, act('draw'));
    expect(paused.energy).toBeCloseTo(0, 8);
    expect(events(paused.world, 'marking-paused')).toHaveLength(1);
    expect(work(paused.world).marks).toHaveLength(3);
    // Cancel returns the unused reserve once; spent material and energy are not refunded.
    const reserve = work(w).escrow[0] ?? '';
    const c = cost(fed(paused.world), act('cancel'));
    expect(c.energy).toBeCloseTo(0, 8);
    const j = work(c.world);
    expect(j).toMatchObject({ status: 'stopped', stage: 'cancelled' });
    expect(stack(c.world, reserve)).toMatchObject({
      owner: 'sol',
      quantity: 0.5,
    });
    expect(stack(c.world, reserve).reservedFor).toBeUndefined();
    expect(berries(c.world) + (j.totals.debited ?? 0)).toBeCloseTo(4, 8);
    expect(marks(c.world)[0]?.data.marks).toHaveLength(3);
    expect(events(c.world, 'marking-cancelled')).toHaveLength(1);
  });

  it('ends at death, dropping the unused reserve once and keeping the applied mark', () => {
    const t = tested();
    const dying = v7Clone(t.w);
    const j = work(dying);
    const reserve = j.escrow[0] ?? '';
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'ended' });
    expect(events(died, 'marking-ended')).toHaveLength(1);
    expect(stack(died, reserve)).toMatchObject({
      owner: null,
      position: where,
    });
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(marks(died)).toHaveLength(1);
    expect(berries(died) + (work(died).totals.debited ?? 0)).toBeCloseTo(4, 8);
  });

  it('is owner-only: no one else can draw, cancel or use the reserved material', () => {
    const t = tested();
    let w = v7Clone(t.w);
    actor(w, 'lin').position = { x: SPOT.x, y: SPOT.y + 0.4 };
    w = step(w, { lin: { interface: 'learn', args: { ability: id } } }).world;
    w = fed(w);
    expect(actor(w, 'lin').mastered).toContain(id);
    expect(unchanged(w, draw(), 'lin')).toMatch(/test first/);
    expect(unchanged(w, act('cancel'), 'lin')).toMatch(/no open marking work/);
    // Sol's carried and reserved stacks are not Lin's to name, eat or test with.
    const reserve = work(w).escrow[0] ?? '';
    expect(
      unchanged(
        w,
        { interface: 'eat', args: { target: reserve, quantity: 0.1 } },
        'lin',
      ),
    ).not.toBe('');
    expect(unchanged(w, test(t.unit), 'lin')).toMatch(/absent-or-inaccessible/);
    // Sol cannot eat the reserved part either until it is released.
    expect(
      unchanged(w, {
        interface: 'eat',
        args: { target: reserve, quantity: 0.1 },
      }),
    ).toMatch(/reserved/);
    expect(work(w)).toMatchObject({ owner: 'sol', stage: 'tested' });
  });
});
