import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7Observe,
  v7ShapeDistance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'hearth-food-preparation';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Open meadow with no object within reach of the bed; Wren stands 0.95 m from its centre. */
const SITE = { x: 19.5, y: 5 };
const STAND = { x: SITE.x + 0.95, y: SITE.y };
/** A dry, calm spell of the frozen weather cycle (no rain, wind below 0.65 for 50 rounds). */
const CALM = 240;
/** Declared bed heat capacity (J/K). */
const BED_CAPACITY = 4000;

interface Node {
  water: number;
  solids: number;
  char: number;
  t: number;
}
interface Food {
  stack: string;
  cook: string;
  onBed: boolean;
  down: number;
  nodes: Node[];
  initialWater: number;
  initialSolids: number;
  exposure: number;
  evaporated: number;
  gases: number;
  state: string;
}
interface Hearth {
  prepared: boolean;
  lit: boolean;
  embers: number;
  burnFraction: number;
  lots: { resource: string; quantity: number; mass: number }[];
  burned: number;
  ash: number;
  released: number;
  residue: number;
  bed: number;
  heat: Record<string, number>;
  food: Food[];
}

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
const actor = (w: V7World, name = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const act = (mode: string, extra: V7Action['args'] = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const label = (value: unknown) => (typeof value === 'string' ? value : '');
const hearth = (w: V7World): V7Object => {
  const o = w.objects.find((o) => o.kind === 'open-hearth');
  if (!o) throw new Error('Missing hearth.');
  return o;
};
const state = (w: V7World) => hearth(w).data.hearth as unknown as Hearth;
const own = (w: V7World, resource: string, who = 'wren'): V7Stack => {
  const s = w.stacks.find(
    (s) => s.owner === who && s.resource === resource && !s.reservedFor,
  );
  if (!s) throw new Error(`Missing owned ${resource}.`);
  return s;
};
const total = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + s.quantity, 0);
const job = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(
      ([, v]) =>
        v as { id: string; mode: string; status: string; escrow: string[] },
    )
    .at(-1);
/** Keep everyone fed and rested so long runs isolate the hearth from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** The action fails and changes no vitals or stacks compared with the same round spent waiting. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  return result.outcomes[who]?.reason ?? '';
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who = 'wren') {
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
function gather(w: V7World, source: string, quantity: number) {
  const o = w.objects.find((x) => x.id === source);
  if (!o) throw new Error('Missing fixture source.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w).position = free(w, o.spatial.x, o.spatial.y, r + 0.5);
  const result = step(w, {
    wren: { interface: 'gather', args: { target: source, quantity } },
  });
  expect(result.outcomes.wren?.success).toBe(true);
  return fed(result.world);
}

let cache: V7World | null = null;
/** Wren and Lin study; Wren gathers real branches, dry grass, oak wood and roots in a calm spell. */
function gathered(): V7World {
  if (!cache) {
    const genesis = initialLongWorld('long-ex17', 'long-culture-v3');
    let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
    w.time = CALM;
    const learn: V7Action = { interface: 'learn', args: { ability: id } };
    w = step(w, { wren: learn, lin: learn }).world;
    w = step(w).world;
    w = step(w).world;
    w = gather(fed(w), 'start-1-branches', 3);
    w = gather(w, 'forest-dry-grass-0', 2);
    w = gather(w, 'forest-oak-0', 1);
    w = gather(w, 'commons-root-5-1', 2);
    actor(w).position = { ...STAND };
    cache = fed(w);
  }
  return v7Clone(cache);
}
const prepare = act('prepare-hearth', SITE);
function prepared() {
  let w = gathered();
  for (let i = 0; i < 2; i++) w = fed(step(w, { wren: prepare }).world);
  return w;
}
const feed = (w: V7World, grass = 1, branch = 1) =>
  act('tend', {
    target: hearth(w).id,
    inputs: [
      { itemId: own(w, 'dry-grass').id, quantity: grass },
      { itemId: own(w, 'branch').id, quantity: branch },
    ],
  });
function loaded() {
  const w = prepared();
  return fed(step(w, { wren: feed(w) }).world);
}
const drill = (w: V7World) =>
  act('ignite', {
    target: hearth(w).id,
    board: own(w, 'branch').id,
    spindle: own(w, 'oak').id,
  });
function lit() {
  let w = loaded();
  const ignite = drill(w);
  for (let i = 0; i < 4 && !state(w).lit; i++)
    w = fed(step(w, { wren: ignite }).world);
  expect(state(w).lit).toBe(true);
  return w;
}
const cook = (w: V7World, quantity = 1) =>
  act('cook', {
    target: hearth(w).id,
    inputs: [{ itemId: own(w, 'root').id, quantity }],
  });
const mass = (f: Food) =>
  f.nodes.reduce((n, x) => n + x.water + x.solids + x.char, 0) +
  f.evaporated +
  f.gases;
const enthalpy = (f: Food) =>
  f.nodes.reduce(
    (n, x) => n + (4180 * x.water + 1500 * (x.solids + x.char)) * x.t,
    0,
  );

describe('hearth food preparation in ex17', () => {
  it('is scoped to ex17, fits the frozen text limit, avoids the excluded vocabulary and needs three rounds of study', () => {
    const ex16 = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(continuousRegistry(ex16).packages.some((p) => p.id === id)).toBe(
      false,
    );
    const all = continuousRegistry();
    expect(all.handlers['long.hearth-food-preparation']).toBeDefined();
    expect(all.handlers['fire.work@1']).toBeDefined();
    const genesis = initialLongWorld('long-ex17', 'long-culture-v3');
    const w = v7Clone(
      v7Install(genesis, continuousRegistry(genesis), `${id}@1`),
    );
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: [
        'prepare-hearth',
        'ignite',
        'tend',
        'cook',
        'inspect',
        'retrieve',
        'extinguish',
        'cancel',
      ],
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(pkg?.abilities).toHaveLength(1);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    // Installation grants no fire, tool, material or mastery.
    expect(w.objects.some((o) => o.kind === 'open-hearth')).toBe(false);
    expect(v7Signature(w.stacks)).toBe(v7Signature(genesis.stacks));
    expect(w.actors.some((a) => a.mastered.includes(id))).toBe(false);
    // An untrained person is refused; study takes three rounds.
    actor(w).position = { ...STAND };
    expect(step(w, { wren: prepare }).outcomes.wren?.success).toBe(false);
    let s = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    s = step(s).world;
    expect(actor(s).mastered).not.toContain(id);
    s = step(s).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('clears a hearth in two paid rounds of 1 energy, makes no stock and hides its physical record', () => {
    let w = gathered();
    const stacks = v7Signature(w.stacks.map((s) => [s.id, s.quantity]));
    const energy = actor(w).vitals.energy;
    w = step(w, { wren: prepare }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(events(w, 'hearth-work-progress')).toHaveLength(1);
    expect(hearth(w).visual.state).toBe('unprepared');
    expect(state(w).prepared).toBe(false);
    w = step(w, { wren: prepare }).world;
    expect(actor(w).vitals.energy).toBe(energy - 2);
    expect(events(w, 'hearth-prepared')).toHaveLength(1);
    const o = hearth(w);
    expect(o).toMatchObject({
      kind: 'open-hearth',
      createdBy: null,
      revision: `${id}@1`,
      spatial: { x: SITE.x, y: SITE.y, solid: true },
      visual: { component: 'open-hearth', state: 'prepared' },
    });
    expect(state(w)).toMatchObject({ prepared: true, lit: false, lots: [] });
    // Clearing rearranges loose matter only: no stack appears or changes.
    expect(v7Signature(w.stacks.map((s) => [s.id, s.quantity]))).toBe(stacks);
    // Others see only the public mode and progress, never the physical record.
    const seen = v7Observe(w, 'wren').objects.find((x) => x.id === o.id);
    expect(seen?.data.mode).toBe('prepared');
    expect(seen?.data.hearth).toBeUndefined();
    expect(seen?.data.view).toBeUndefined();
    // The drawing metadata shows an unlit cleared bed.
    expect(o.data.view).toMatchObject({
      component: 'open-hearth',
      state: 'prepared',
      flame: false,
      smoke: false,
      ember: false,
      fuelMass: 0,
    });
  });

  it('rejects unsafe or unreachable hearth sites without spending anything', () => {
    const w = gathered();
    // Next to the commons root plants.
    const crowded = v7Clone(w);
    actor(crowded).position = { x: 16.9, y: 10 };
    expect(
      unchanged(crowded, act('prepare-hearth', { x: 16, y: 10.9 })),
    ).toMatch(/within 0.7 m/);
    // On the river.
    const river = v7Clone(w);
    const wet = 10;
    const x = river.terrain[wet]?.indexOf('~') ?? 0;
    expect(x).toBeGreaterThan(0);
    actor(river).position = { x: x - 0.5, y: wet + 0.5 };
    expect(
      unchanged(river, act('prepare-hearth', { x: x + 0.5, y: wet + 0.5 })),
    ).toMatch(/dry open ground|reach/);
    // Too close to the person, and out of reach.
    const close = v7Clone(w);
    actor(close).position = { x: SITE.x + 0.6, y: SITE.y };
    expect(unchanged(close, prepare)).toMatch(/0.7 m from the bed centre/);
    const far = v7Clone(w);
    actor(far).position = { x: SITE.x + 2, y: SITE.y };
    expect(unchanged(far, prepare)).toMatch(/reach/);
    // Loose material lying near the bed.
    const litter = v7Clone(w);
    litter.stacks.push({
      ...own(litter, 'branch'),
      id: 'item-litter',
      owner: null,
      quantity: 1,
      quantityTenths: 10,
      position: { x: SITE.x - 0.6, y: SITE.y },
    });
    expect(unchanged(litter, prepare)).toMatch(/Loose material/);
  });

  it('feeds real fuel and lights it only by hand-drill friction, then burns it under the local-fire rule', () => {
    let w = prepared();
    const grass = own(w, 'dry-grass').quantity,
      branches = total(w, 'branch');
    let energy = actor(w).vitals.energy;
    w = step(w, { wren: feed(w) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'hearth-fed')).toHaveLength(1);
    expect(own(w, 'dry-grass').quantity).toBe(grass - 1);
    expect(total(w, 'branch')).toBe(branches - 1);
    expect(state(w).lots.map((l) => [l.resource, l.quantity, l.mass])).toEqual([
      ['dry-grass', 1, 0.1],
      ['branch', 1, 1.1],
    ]);
    // Loaded fuel does not burn without a fire.
    w = fed(step(w).world);
    expect(state(w).lots.reduce((n, l) => n + l.quantity, 0)).toBe(2);
    expect(events(w, 'hearth-fuel-burned')).toHaveLength(0);
    const ignite = drill(w);
    const board = own(w, 'branch'),
      spindle = own(w, 'oak');
    energy = actor(w).vitals.energy;
    w = step(w, { wren: ignite }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1.5);
    expect(events(w, 'friction-progress')).toHaveLength(1);
    expect(hearth(w).visual.state).toBe('friction-in-progress');
    const work = job(w);
    expect(work?.mode).toBe('ignite');
    // The pieces are reserved and carried, not consumed.
    const pieces = w.stacks.filter((s) => s.reservedFor === work?.id);
    expect(pieces.map((s) => [s.resource, s.quantity, s.owner])).toEqual([
      ['branch', 1, 'wren'],
      ['oak', 1, 'wren'],
    ]);
    expect(state(w).lit).toBe(false);
    energy = actor(w).vitals.energy;
    w = step(w, { wren: ignite }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1.5);
    expect(events(w, 'friction-ember-formed')).toHaveLength(1);
    expect(hearth(w).visual.state).toBe('ember');
    energy = actor(w).vitals.energy;
    w = step(w, { wren: ignite }).world;
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'hearth-ember-transferred')[0]?.data).toMatchObject({
      tinderBurned: 0.01,
    });
    expect(state(w).lit).toBe(false);
    energy = actor(w).vitals.energy;
    w = step(w, { wren: ignite }).world;
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'hearth-ignited')).toHaveLength(1);
    expect(job(w)?.status).toBe('completed');
    // Burning starts in the same round on the loaded fuel only.
    const burned = events(w, 'hearth-fuel-burned');
    expect(burned).toHaveLength(1);
    expect(burned[0]?.data.burnFraction).toBe(1);
    const h = state(w);
    expect(h).toMatchObject({ lit: true, embers: 3, burnFraction: 1 });
    expect(hearth(w).visual.state).toBe('burning');
    expect(hearth(w).data.view).toMatchObject({ flame: true, smoke: true });
    // Fuel mass is conserved: loaded = remaining + burned, burned = ash + gases.
    const remaining = h.lots.reduce((n, l) => n + l.quantity * l.mass, 0);
    // Loaded 1 dry grass (0.1) and 1 branch (1.1); the 4 g drill-dust ember burned too.
    expect(remaining + h.burned).toBeCloseTo(1.2 + 0.004, 6);
    expect(h.ash + h.released).toBeCloseTo(h.burned, 8);
    expect(h.ash).toBeCloseTo(0.1 * h.burned, 8);
    // The pieces return worn: a socket in the board and wood lost from both.
    const board2 = w.stacks.find((s) => s.id === pieces[0]?.id);
    const spindle2 = w.stacks.find((s) => s.id === pieces[1]?.id);
    expect(board2).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(board2?.reservedFor).toBeUndefined();
    expect(board2?.processing?.frictionWear).toMatchObject({
      role: 'board',
      socket: 3,
      worn: 0.003,
      attempts: 1,
    });
    expect(spindle2?.processing?.frictionWear).toMatchObject({
      role: 'spindle',
      worn: 0.001,
    });
    expect(board.id).not.toBe(board2?.id);
    expect(spindle.resource).toBe('oak');
    // The fire keeps burning its finite fuel and dies three rounds after it runs out.
    for (let i = 0; i < 16 && state(w).lit; i++) w = fed(step(w).world);
    expect(state(w).lit).toBe(false);
    expect(state(w).lots).toEqual([]);
    expect(events(w, 'hearth-extinguished')[0]?.data.reason).toBe(
      'fuel exhausted',
    );
    expect(hearth(w).visual.state).toBe('extinguished');
    expect(state(w).burned).toBeCloseTo(1.2 + 0.004, 6);
  });

  it('lights with exactly the declared minimum bundle of 0.5 dry grass and 0.5 branch', () => {
    let w = prepared();
    w = fed(step(w, { wren: feed(w, 0.5, 0.5) }).world);
    const ignite = drill(w);
    for (let i = 0; i < 4; i++) {
      const r = step(w, { wren: ignite });
      expect(r.outcomes.wren?.success).toBe(true);
      w = fed(r.world);
    }
    expect(events(w, 'hearth-ignited')).toHaveLength(1);
    expect(state(w).lit).toBe(true);
    // Transfer and first tending burned 0.2 of the 0.5 tinder; the rest burns as fuel.
    const h = state(w);
    expect(h.burned).toBeGreaterThan(0.02);
    expect(
      h.lots.reduce((n, l) => n + l.quantity * l.mass, 0) + h.burned,
    ).toBeCloseTo(0.05 + 0.55 + 0.004, 6);
  });

  it('refuses unsuitable pieces, missing tinder, wet material and bad weather before any cost', () => {
    const w = loaded();
    const o = hearth(w);
    const ignite = (board: string, spindle: string) =>
      act('ignite', { target: o.id, board, spindle });
    const branch = own(w, 'branch').id,
      oak = own(w, 'oak').id;
    // A spindle no harder than the board, and an oak board, cannot serve.
    expect(unchanged(w, ignite(branch, branch))).toMatch(/Duplicate|harder/);
    const twoBranches = v7Clone(w);
    twoBranches.stacks.push({
      ...own(twoBranches, 'branch'),
      id: 'item-second-branch',
      quantity: 1,
      quantityTenths: 10,
    });
    expect(
      unchanged(twoBranches, ignite(branch, 'item-second-branch')),
    ).toMatch(/harder than the board/);
    expect(unchanged(w, ignite(oak, branch))).toMatch(/soft deadwood/);
    // Wet pieces.
    const wet = v7Clone(w);
    const piece = wet.stacks.find((s) => s.id === branch);
    if (piece) piece.fuelMoisture = 0.5;
    expect(unchanged(wet, ignite(branch, oak))).toMatch(/wet/);
    // No tinder on an empty bed.
    expect(unchanged(prepared(), drill(prepared()))).toMatch(/tinder/);
    // Windy and rainy spells of the same weather cycle.
    const windy = v7Clone(w);
    windy.time = 0;
    expect(unchanged(windy, ignite(branch, oak))).toMatch(/Wind/);
    const rainy = v7Clone(w);
    rainy.time = 180;
    expect(unchanged(rainy, ignite(branch, oak))).toMatch(/Rain/);
    // Unprepared, burning or absent hearths.
    expect(unchanged(w, act('extinguish', { target: o.id }))).toMatch(
      /not burning/,
    );
    expect(unchanged(w, act('tend', { target: o.id }))).toMatch(/feeds fuel/);
    expect(
      unchanged(
        w,
        act('tend', {
          target: o.id,
          inputs: [{ itemId: own(w, 'oak').id, quantity: 1 }],
        }),
      ),
    ).toMatch(/Only branch, bark or dry grass/);
    expect(unchanged(w, act('cancel'))).toMatch(/No unfinished/);
  });

  it('fails a damp trial after twelve paid rounds, leaving worn pieces, dust residue and no fire', () => {
    let w = loaded();
    const ignite = drill(w);
    const energy = actor(w).vitals.energy;
    const damp = (x: V7World) => {
      for (const s of x.stacks.filter(
        (s) => s.owner === 'wren' && ['branch', 'oak'].includes(s.resource),
      ))
        s.fuelMoisture = 0.34;
      return x;
    };
    w = damp(w);
    let spent = 0;
    for (let i = 0; i < 12; i++) {
      const before = actor(w).vitals.energy;
      const r = step(w, { wren: ignite });
      expect(r.outcomes.wren?.success).toBe(true);
      spent += before - actor(r.world).vitals.energy;
      w = damp(r.world);
    }
    expect(spent).toBeCloseTo(18, 6);
    expect(actor(w).vitals.energy).toBeCloseTo(energy - 18, 6);
    expect(events(w, 'friction-ember-formed')).toHaveLength(0);
    const failed = events(w, 'friction-ignition-failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.description).toMatch(/moisture 0.34/);
    expect(job(w)?.status).toBe('stopped');
    expect(state(w)).toMatchObject({ lit: false });
    expect(state(w).residue).toBeCloseTo(0.024, 8);
    expect(hearth(w).visual.state).toBe('failed-cooled');
    const board = w.stacks.find(
      (s) => s.owner === 'wren' && s.processing?.frictionWear,
    );
    expect(board?.reservedFor).toBeUndefined();
    expect(board?.processing?.frictionWear).toMatchObject({
      role: 'board',
      socket: 18,
      worn: 0.018,
    });
    // No unperformed round is charged afterwards.
    const after = actor(w).vitals.energy;
    w = step(w).world;
    expect(actor(w).vitals.energy).toBe(after);
  });

  it('pauses unworked friction, lets an untransferred ember die, and cancel returns the pieces once', () => {
    let w = loaded();
    const ignite = drill(w);
    w = fed(step(w, { wren: ignite }).world);
    w = fed(step(w).world);
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'hearth-work-paused')).toHaveLength(1);
    // Lin studied but cannot continue or cancel Wren's work.
    actor(w, 'lin').position = free(w, SITE.x, SITE.y, 1.2, 'lin');
    expect(step(w, { lin: act('cancel') }).outcomes.lin?.success).toBe(false);
    // Leaving reach pauses without spending.
    const away = v7Clone(w);
    actor(away).position = { x: SITE.x + 3, y: SITE.y };
    const blocked = step(away, {
      wren: act('ignite', { target: hearth(w).id }),
    });
    expect(actor(blocked.world).vitals.energy).toBe(actor(away).vitals.energy);
    expect(events(blocked.world, 'hearth-work-paused')).toHaveLength(1);
    // Resuming needs no pieces named; the socket kept its wear, so an ember forms.
    const resume = act('ignite', { target: hearth(w).id });
    w = step(w, { wren: resume }).world;
    expect(events(w, 'hearth-work-resumed')).toHaveLength(1);
    expect(events(w, 'friction-ember-formed')).toHaveLength(1);
    w = fed(step(w).world);
    expect(events(w, 'friction-ember-died')).toHaveLength(1);
    expect(state(w).lit).toBe(false);
    const energy = actor(w).vitals.energy;
    const branches = total(w, 'branch');
    const cancelled = step(w, { wren: act('cancel') });
    expect(cancelled.outcomes.wren?.success).toBe(true);
    w = cancelled.world;
    expect(actor(w).vitals.energy).toBe(energy);
    expect(events(w, 'hearth-work-cancelled')).toHaveLength(1);
    expect(job(w)?.status).toBe('stopped');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(total(w, 'branch')).toBe(branches);
    expect(own(w, 'oak').processing?.frictionWear).toMatchObject({
      role: 'spindle',
    });
    expect(step(w, { wren: act('cancel') }).outcomes.wren?.success).toBe(false);
  });

  it('roasts one whole root by real bed heat, conserving mass and energy, and it eats through eat at no more than its original nutrition', () => {
    let w = lit();
    const o = hearth(w);
    const roots = total(w, 'root');
    // One whole unit per trial, of a food with a represented water composition.
    expect(unchanged(w, cook(w, 0.5))).toMatch(/exactly one whole unit/);
    const apple = v7Clone(w);
    apple.stacks.push({
      ...own(apple, 'root'),
      id: 'item-apple',
      resource: 'apple',
      quantity: 1,
      quantityTenths: 10,
    });
    expect(
      unchanged(
        apple,
        act('cook', {
          target: o.id,
          inputs: [{ itemId: 'item-apple', quantity: 1 }],
        }),
      ),
    ).toMatch(/only for berries and roots/);
    // The bed is hot: placing food needs a stick (Wren keeps one owned branch).
    const bare = v7Clone(w);
    bare.stacks = bare.stacks.filter(
      (s) => !(s.owner === 'wren' && s.resource === 'branch'),
    );
    expect(unchanged(bare, cook(bare))).toMatch(/stick/);
    let energy = actor(w).vitals.energy;
    w = step(w, { wren: cook(w) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    const placed = events(w, 'hearth-food-placed')[0];
    expect(placed?.data).toMatchObject({
      quantity: 1,
      water: 0.3,
      solids: 0.1,
    });
    const food = w.stacks.find((s) => s.reservedFor === o.id);
    expect(food).toMatchObject({ resource: 'root', quantity: 1, owner: null });
    expect(total(w, 'root')).toBe(roots);
    const decay = Number(food?.decay);
    // It cannot be eaten, planted or cooked elsewhere while it lies on the bed.
    expect(
      step(w, { wren: { interface: 'eat', args: { target: food?.id ?? '' } } })
        .outcomes.wren?.success,
    ).toBe(false);
    expect(unchanged(w, cook(w))).toMatch(/already holds a food portion/);
    const bed0 = state(w).bed,
      heat0 = { ...state(w).heat },
      h0 = enthalpy(state(w).food[0] as Food);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const r = step(w, { wren: act('tend', { target: o.id, turn: true }) });
      expect(r.outcomes.wren?.success).toBe(true);
      for (const e of events(r.world, 'hearth-food-changed'))
        seen.add(label(e.data.state));
      w = fed(r.world);
    }
    expect(events(w, 'hearth-food-turned').at(-1)?.data.turned).toBe(3);
    const h = state(w),
      f = h.food[0] as Food;
    expect(f.state).toBe('cooked');
    expect(seen.has('cooked')).toBe(true);
    // Mass: water and solids at placement = remaining + vapour + pyrolysis gases.
    expect(mass(f)).toBeCloseTo(0.4, 8);
    expect(f.evaporated).toBeGreaterThan(0.05);
    // Energy: fire heat = bed storage + loss to surroundings + heat delivered to the food.
    const d = (k: string) => Number(h.heat[k]) - Number(heat0[k]);
    expect(d('released') - d('surroundings') - d('food')).toBeCloseTo(
      BED_CAPACITY * (h.bed - bed0),
      0,
    );
    expect(
      d('food') - d('foodLoss') - d('evaporation') - d('vented'),
    ).toBeCloseTo(enthalpy(f) - h0, 0);
    // Inspection reports perceivable state and a model estimate, never the core temperature.
    energy = actor(w).vitals.energy;
    const look = step(w, { wren: act('inspect', { target: o.id }) });
    expect(energy - actor(look.world).vitals.energy).toBeCloseTo(0.2, 6);
    const seenFood = events(look.world, 'hearth-inspected')[0]?.data
      .observation as Record<string, Record<string, unknown>>;
    expect(seenFood.food).toMatchObject({
      state: 'cooked',
      core: 'not measured',
      estimate: { roundsToCookedCriterion: 0 },
    });
    expect(JSON.stringify(seenFood)).not.toMatch(/"t":|peakCore/);
    expect(
      actor(look.world).memory.knowledge?.[`${o.id}:hearth-inspection`],
    ).toMatchObject({ verified: false });
    expect(events(look.world, 'information-confirmed')).toHaveLength(0);
    // Retrieval: blocked by hand while the bed burns, raked aside with a stick, then cooled.
    const hand = v7Clone(w);
    hand.stacks = hand.stacks.filter(
      (s) => !(s.owner === 'wren' && s.resource === 'branch'),
    );
    expect(unchanged(hand, act('retrieve', { target: o.id }))).toMatch(/stick/);
    // Lin studied too but cannot take Wren's food.
    const other = v7Clone(w);
    actor(other, 'lin').position = free(other, SITE.x, SITE.y, 1.2, 'lin');
    expect(unchanged(other, act('retrieve', { target: o.id }), 'lin')).toMatch(
      /no food on this hearth/,
    );
    w = fed(step(w, { wren: act('retrieve', { target: o.id }) }).world);
    expect(events(w, 'hearth-food-raked')).toHaveLength(1);
    expect(state(w).food[0]?.onBed).toBe(false);
    let tries = 0;
    for (; tries < 10; tries++) {
      const r = step(w, { wren: act('retrieve', { target: o.id }) });
      if (r.outcomes.wren?.success) {
        w = r.world;
        break;
      }
      expect(r.outcomes.wren?.reason).toMatch(/too hot to hold/);
      w = fed(step(w).world);
    }
    expect(tries).toBeGreaterThan(0);
    const got = events(w, 'hearth-food-retrieved')[0];
    const out = w.stacks.find((s) => s.id === food?.id);
    expect(out).toMatchObject({ owner: 'wren', quantity: 1, resource: 'root' });
    expect(out?.reservedFor).toBeUndefined();
    const record = out?.processing?.hearthPreparation as Record<
      string,
      number | string
    >;
    expect(record.state).toBe('cooked');
    const share = Number(out?.physical?.unitSolids) / 0.1;
    expect(record.nutritionPerUnit).toBeLessThanOrEqual(14);
    expect(Number(record.nutritionPerUnit)).toBeCloseTo(14 * share, 4);
    expect(got?.data.record).toMatchObject({ state: 'cooked' });
    // The char was scraped off onto the hearth; spoilage continued.
    expect(state(w).residue).toBeGreaterThan(0);
    expect(Number(out?.decay)).toBeGreaterThan(decay);
    expect(total(w, 'root')).toBe(roots);
    // Eating uses the existing eat path and the actual remaining nutrition.
    actor(w).vitals.satiety = 40;
    const ate = step(w, {
      wren: { interface: 'eat', args: { target: out?.id ?? '', quantity: 1 } },
    });
    expect(ate.outcomes.wren?.success).toBe(true);
    expect(events(ate.world, 'ate')[0]?.data.realized).toBeCloseTo(
      Number(record.nutritionPerUnit),
      6,
    );
    expect(Number(events(ate.world, 'ate')[0]?.data.realized)).toBeLessThan(14);
    // No milestone or practice reward for cooking or eating.
    expect(events(ate.world, 'practice-confirmed')).toHaveLength(0);
    expect(
      [w, ate.world].some((x) => events(x, 'practice-confirmed').length),
    ).toBe(false);
  });

  it('chars and destroys unattended food on a burning fire, catches loose fuel on its rim, and smothering stops combustion', () => {
    let w = lit();
    const o = hearth(w);
    const roots = total(w, 'root');
    w = fed(step(w, { wren: cook(w) }).world);
    // Add fuel so the fire keeps burning while nobody turns the food.
    w = fed(
      step(w, {
        wren: act('tend', {
          target: o.id,
          inputs: [{ itemId: own(w, 'branch').id, quantity: 1 }],
        }),
      }).world,
    );
    const states: string[] = [];
    for (let i = 0; i < 20 && state(w).food[0]?.state !== 'destroyed'; i++) {
      w = fed(step(w).world);
      for (const e of events(w, 'hearth-food-changed'))
        states.push(label(e.data.state));
    }
    expect(states).toEqual(['cooked', 'charred', 'destroyed']);
    expect(state(w).lit).toBe(true);
    const f = state(w).food[0] as Food;
    expect(mass(f)).toBeCloseTo(0.4, 8);
    expect(hearth(w).data.view).toMatchObject({
      food: [{ state: 'destroyed', onBed: true }],
    });
    // A loose branch lying on the rim of the burning bed catches fire.
    w.stacks.push({
      ...own(w, 'branch'),
      id: 'item-rim-branch',
      owner: null,
      quantity: 0.5,
      quantityTenths: 5,
      position: { x: SITE.x + 0.5, y: SITE.y },
    });
    w = fed(step(w).world);
    expect(events(w, 'hearth-material-caught')[0]?.data.items).toEqual([
      'item-rim-branch',
    ]);
    expect(w.stacks.some((s) => s.id === 'item-rim-branch')).toBe(false);
    expect(state(w).lots.some((l) => l.resource === 'branch')).toBe(true);
    // Smothering costs 0.5 energy and stops combustion; unburned fuel stays and the bed cools.
    const energy = actor(w).vitals.energy;
    w = step(w, { wren: act('extinguish', { target: o.id }) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'hearth-extinguished')[0]?.data.reason).toBe('smothered');
    expect(state(w).lit).toBe(false);
    const fuel = state(w).lots.reduce((n, l) => n + l.quantity, 0);
    expect(fuel).toBeGreaterThan(0);
    const bed = state(w).bed;
    w = fed(step(w).world);
    expect(events(w, 'hearth-fuel-burned')).toHaveLength(0);
    expect(state(w).lots.reduce((n, l) => n + l.quantity, 0)).toBeCloseTo(
      fuel,
      6,
    );
    expect(state(w).bed).toBeLessThan(bed);
    // The destroyed food is raked aside, cools, and yields nothing edible: it stays as residue.
    w = fed(step(w, { wren: act('retrieve', { target: o.id }) }).world);
    expect(events(w, 'hearth-food-raked')).toHaveLength(1);
    w = fed(step(w).world);
    const residue = state(w).residue;
    const last = state(w).food[0] as Food;
    const r = step(w, { wren: act('retrieve', { target: o.id }) });
    expect(r.outcomes.wren?.success).toBe(true);
    w = r.world;
    expect(events(w, 'hearth-food-retrieved')[0]?.data.output).toBeNull();
    expect(state(w).food).toEqual([]);
    // Raked-aside food exchanges only with air, so it neither loses nor gains matter while cooling.
    const left = last.nodes.reduce(
      (n, x) => n + x.water + x.solids + x.char,
      0,
    );
    expect(state(w).residue - residue).toBeCloseTo(left, 4);
    expect(total(w, 'root')).toBe(roots - 1);
  });

  it('inspects owned materials by touch at the observation cost without changing them', () => {
    const w = gathered();
    const items = ['branch', 'dry-grass', 'oak', 'root'].map(
      (r) => own(w, r).id,
    );
    const energy = actor(w).vitals.energy;
    const r = step(w, {
      wren: act('inspect', {
        inputs: items.map((itemId) => ({ itemId, quantity: 1 })),
      }),
    });
    const idle = step(w).world;
    expect(energy - actor(r.world).vitals.energy).toBeCloseTo(0.2, 6);
    expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
    const found = events(r.world, 'hearth-inspected')[0]?.data
      .findings as Record<string, unknown>[];
    expect(
      found.map((x) => [x.resource, x.wetness, x.wood, x.cookable]),
    ).toEqual([
      ['branch', 'dry', 'soft: can serve as a board', false],
      ['dry-grass', 'dry', null, false],
      ['oak', 'dry', 'hard: can serve as a spindle on a softer board', false],
      ['root', null, null, true],
    ]);
    expect(
      actor(r.world).memory.knowledge?.[`${items[0] ?? ''}:thermal-material`],
    ).toMatchObject({ verified: false });
  });

  it('at death stops personal work and leaves the pieces where the person died while the fire burns on', () => {
    let w = loaded();
    w = fed(step(w, { wren: drill(w) }).world);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    actor(dead).position = { x: SITE.x + 1, y: SITE.y + 1 };
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'hearth-work-cancelled')).toHaveLength(1);
    const dropped = dead.stacks.filter(
      (s) =>
        s.owner === null &&
        ['branch', 'oak'].includes(s.resource) &&
        s.position.x === SITE.x + 1 &&
        s.position.y === SITE.y + 1,
    );
    expect(dropped.map((s) => s.resource).sort()).toEqual(['branch', 'oak']);
    expect(dropped.every((s) => !s.reservedFor)).toBe(true);
    // The hearth and its loaded fuel stay in place.
    expect(state(dead).lots.length).toBe(2);
  });
});
