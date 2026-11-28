import type {
  V7Ability,
  V7Action,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Observation,
  V7Package,
  V7Point,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  V7ComputePause,
  v7Clone,
  v7Json,
  v7RoundNumber,
  v7Validate,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7Reach,
  v7SegmentClear,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { v7NavigateStep } from './continuous-kernel.js';
import { v7Observe } from './continuous-observation.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_BASE } from './forest-foundation.js';
import { ForestRouteFailure } from './forest-routing.js';
import { OPEN_FOUNDATION } from './open-foundation.js';

/** ex26: a bounded search for one known resource around an origin, collecting up to a cap. It is
 * a multi-round work record that takes exactly one dependency step per round through that
 * dependency's own code: the kernel navigate step (v7NavigateStep, the kernel.navigate of
 * foundation-forest@1), probe's observation mode (open.probe of foundation-open@1) or gather
 * (forest.gather of foundation-forest@1). A person moves only through that navigate step, so
 * no round moves anyone more than speed x dt = 0.8. Candidates come only from what the person
 * perceives now (v7Observe, vision 5) or remembers, and exploration uses observed terrain only.
 * Nothing is created, eaten, refunded or rewarded. */

const ID = 'bounded-resource-search';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (active or paused) search; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The latest closed search; not active work. */
const LAST = `${ID}:last`;
const NAVIGATE = { ability: 'navigate', handler: 'kernel.navigate' };
const PROBE = { ability: 'probe', handler: 'open.probe', energy: 0.2 };
const GATHER = { ability: 'gather', handler: 'forest.gather', energy: 2 };
const MAX = { radius: 8, path: 16, time: 40, energy: 40, quantity: 20 };
/** Continuing is unsafe at the kernel's own urgent-risk lines (v7FinishTasks): health 60,
 * satiety 8 and a body temperature 10 from 22, or an injury in the last round. */
const SAFE = { health: 60, satiety: 8, temperature: 10 };
const MODES = ['start', 'resume', 'cancel'];
const EVENTS = {
  started: `${ID}-started`,
  moved: `${ID}-moved`,
  inspected: `${ID}-inspected`,
  collected: `${ID}-collected`,
  blocked: `${ID}-blocked`,
  paused: `${ID}-paused`,
  resumed: `${ID}-resumed`,
  cancelled: `${ID}-cancelled`,
  completed: `${ID}-completed`,
  stopped: `${ID}-stopped`,
  ended: `${ID}-ended`,
} as const;

type Point = { x: number; y: number };
type Limits = {
  path: number;
  time: number;
  energy: number;
  reserve: number;
  quantity: number;
};
/** The latest fact per source: seen in ordinary perception or measured by probe. */
type Fact = {
  source: string;
  stock: number;
  growth: number | null;
  tick: number;
  method: string;
  x: number;
  y: number;
};
type Mark = { target: string; tick: number; reason: string };
type Spot = { x: number; y: number; tick: number };
type Transfer = {
  tick: number;
  source: string;
  quantity: number;
  item: string;
};
type Run = {
  id: string;
  actor: string;
  resource: string;
  origin: Point;
  radius: number;
  limits: Limits;
  status: string;
  phase: string;
  /** A source id, `place:x,y` while exploring, or null. */
  target: string | null;
  goal: Point | null;
  /** The source inspected with probe on the current visit. */
  checked: string | null;
  startedAt: number;
  lastStep: number;
  distance: number;
  energy: number;
  collected: number;
  moves: number;
  probes: number;
  gathers: number;
  transfers: Transfer[];
  facts: Fact[];
  blocked: Mark[];
  visited: Spot[];
  path: Spot[];
  reason: string | null;
};
type Status = 'completed' | 'stopped' | 'cancelled' | 'ended';
type Say = (
  type: string,
  description: string,
  data: V7Data,
  target?: string | null,
) => void;
interface Known {
  object: V7Object;
  stock: number;
  /** Straight-line distance still to cover before the source is within reach. */
  gap: number;
}

const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
const used = (w: V7World, run: Run) => w.tick - run.startedAt + 1;
const step = (w: V7World) => w.config.speed * w.config.dt;
function openRun(a: V7Actor): Run | null {
  const raw = a.extensionState[OPEN];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (v7Clone(raw) as unknown as Run)
    : null;
}
function save(a: V7Actor, run: Run): void {
  a.extensionState[OPEN] = v7Json(run);
}
const sayIn =
  (c: V7ActionContext): Say =>
  (type, description, data, target = null) => {
    c.emit(type, description, data, target);
  };
const sayAt =
  (w: V7World, a: V7Actor): Say =>
  (type, description, data, target = null) => {
    forestEvent(w, type, description, a.position, a.id, data, target);
  };

/** View metadata from committed state only: progress, location, source and stop reason. */
function data(
  w: V7World,
  a: V7Actor,
  run: Run,
  phase: string,
  extra: {
    source?: string | null;
    available?: number | null;
    transferred?: number;
    stop?: string | null;
  } = {},
): V7Data {
  return {
    operation: ID,
    run: run.id,
    phase,
    status: run.status,
    stop: extra.stop ?? null,
    view: {
      component: null,
      badge: null,
      actor: a.id,
      tick: w.tick,
      x: a.position.x,
      y: a.position.y,
      source: extra.source ?? null,
      resource: run.resource,
      available: extra.available ?? null,
      transferred: extra.transferred ?? 0,
      collected: run.collected,
      distance: run.distance,
      energy: run.energy,
      time: used(w, run),
      limits: run.limits,
    },
  };
}
const tally = (w: V7World, run: Run) =>
  `path ${shown(run.distance)} of ${shown(run.limits.path)}, energy ${shown(run.energy)} of ${shown(run.limits.energy)}, round ${String(used(w, run))} of ${String(run.limits.time)}`;

function close(
  say: Say,
  w: V7World,
  a: V7Actor,
  run: Run,
  status: Status,
  reason: string,
  detail: string,
  writes: string[] = [],
): V7HandlerResult {
  run.status = status;
  run.phase = status;
  run.reason = reason;
  delete a.extensionState['bounded-resource-search:work:open'];
  a.extensionState[LAST] = v7Json({ ...run, endedAt: w.tick, detail });
  const got = `${String(run.collected)} of ${String(run.limits.quantity)} ${run.resource} collected`;
  const text =
    status === 'completed'
      ? reason === 'quantity-cap'
        ? `Search complete: ${got}.`
        : `Search complete without reaching the quantity: ${detail} ${got}.`
      : status === 'stopped'
        ? `Search stopped (${reason}): ${detail} ${got}; spent time and energy stay spent.`
        : status === 'cancelled'
          ? `Search cancelled: ${got}; spent time and energy are not refunded.`
          : `Search ended by death: ${got}; carried items follow the ordinary death rules.`;
  say(EVENTS[status], text, {
    ...data(w, a, run, status, { stop: reason }),
    summary: {
      transfers: run.transfers,
      facts: run.facts,
      blocked: run.blocked,
      visited: run.visited,
      moves: run.moves,
      probes: run.probes,
      gathers: run.gathers,
      detail,
    },
  });
  return { complete: true, remaining: 0, writes };
}
function stop(
  c: V7ActionContext,
  run: Run,
  reason: string,
  detail: string,
): V7HandlerResult {
  return close(sayIn(c), c.world, c.actor, run, 'stopped', reason, detail);
}
/** The end of a step round: completion at the quantity, the time limit, or continuation. */
function after(
  c: V7ActionContext,
  run: Run,
  writes: string[] = [],
): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.collected >= run.limits.quantity)
    return close(
      sayIn(c),
      w,
      a,
      run,
      'completed',
      'quantity-cap',
      'The quantity is collected.',
      writes,
    );
  if (used(w, run) >= run.limits.time)
    return close(
      sayIn(c),
      w,
      a,
      run,
      'stopped',
      'time-limit',
      `All ${String(run.limits.time)} rounds are used.`,
      writes,
    );
  save(a, run);
  return { complete: false, remaining: null, writes };
}

function unsafe(w: V7World, a: V7Actor): string[] {
  const out: string[] = [];
  const v = a.vitals;
  if (v.health <= SAFE.health)
    out.push(`health ${shown(v.health)} is at or below ${String(SAFE.health)}`);
  if (v.satiety <= SAFE.satiety)
    out.push(
      `satiety ${shown(v.satiety)} is at or below ${String(SAFE.satiety)}`,
    );
  if (Math.abs(v.temperature - 22) >= SAFE.temperature)
    out.push(`body temperature ${shown(v.temperature)} is 10 or more from 22`);
  if (
    (a.memory.important ?? []).some(
      (e) => e.type === 'injured' && e.tick >= w.tick - 1,
    )
  )
    out.push('you were injured in the last round');
  return out;
}
/** Straight-line distance still to cover before a source is within its interaction reach. */
function gap(a: V7Actor, s: V7Spatial): number {
  if (v7Reach(a, s)) return 0;
  const reach = a.radius + s.interaction;
  const nearest = s.entrances.length
    ? Math.min(
        ...s.entrances.map((p) =>
          v7Distance(a.position, {
            x: s.x + p.x * Math.cos(s.angle) - p.y * Math.sin(s.angle),
            y: s.y + p.x * Math.sin(s.angle) + p.y * Math.cos(s.angle),
          }),
        ),
      )
    : v7ShapeDistance(a.position, s);
  return Math.max(0, nearest - reach);
}
/** Sources of the resource inside the area that the person sees now or remembers out of view.
 * A remembered source that should be in view but is not is not identifiable now. Sources made
 * by another person and sources without a usable route in this search are left out. */
function sources(w: V7World, a: V7Actor, run: Run, view: V7Observation) {
  const current = new Set(view.objects.map((o) => o.id));
  const out: Known[] = [];
  const consider = (o: V7Object) => {
    const stock = o.data.stock;
    if (
      o.data.resource !== run.resource ||
      typeof stock !== 'number' ||
      v7Distance(run.origin, o.spatial) > run.radius + 1e-9 ||
      (o.createdBy !== null && o.createdBy !== a.id) ||
      run.blocked.some((b) => b.target === o.id)
    )
      return;
    out.push({
      object: o,
      stock: Math.floor(stock + 1e-9),
      gap: gap(a, o.spatial),
    });
  };
  for (const o of view.objects) consider(o);
  for (const m of a.memory.objects)
    if (
      !current.has(m.object.id) &&
      v7ShapeDistance(a.position, m.object.spatial) > w.config.vision
    )
      consider(m.object);
  return out;
}
/** Keeps the latest fact per source and method (seen, probe, gather); an unchanged fact is
 * not repeated. */
function note(run: Run, fact: Fact): void {
  const same = (f: Fact) =>
    f.source === fact.source && f.method === fact.method;
  if (run.facts.find(same)?.stock === fact.stock) return;
  run.facts = [...run.facts.filter((f) => !same(f)), fact];
}
/** The first limit that a source cannot fit, from lower bounds of reaching, inspecting and
 * harvesting one unit: the straight-line gap, 0.8 per round and 2 energy per distance (the
 * travel factor and the carried-mass factor are at least 1); null when it may fit. */
function binding(w: V7World, a: V7Actor, run: Run, k: Known): string | null {
  const inspected = run.checked === k.object.id;
  const rounds = Math.ceil(k.gap / step(w) - 1e-9) + (inspected ? 0 : 1) + 1;
  const energy = 2 * k.gap + (inspected ? 0 : PROBE.energy) + GATHER.energy;
  if (run.distance + k.gap > run.limits.path + 1e-9) return 'path-limit';
  if (run.energy + energy > run.limits.energy + 1e-9) return 'energy-budget';
  if (a.vitals.energy - energy < run.limits.reserve - 1e-9)
    return 'energy-reserve';
  if (used(w, run) - 1 + rounds > run.limits.time) return 'time-limit';
  return null;
}
const fits = (w: V7World, a: V7Actor, run: Run, k: Known) =>
  binding(w, a, run, k) === null;
/** An observed dry cell inside the area, clear of known obstacles, from which unseen cells of
 * the area lie within vision; the most unseen cells first, then the nearest. Unseen ground is
 * never a destination. */
function place(w: V7World, a: V7Actor, run: Run): Point | null {
  const { origin: o, radius: r } = run;
  const cells = new Set(a.memory.cells);
  const area: Point[] = [];
  for (
    let y = Math.max(0, Math.floor(o.y - r));
    y <= Math.min(w.config.height - 1, Math.floor(o.y + r));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(o.x - r));
      x <= Math.min(w.config.width - 1, Math.floor(o.x + r));
      x++
    )
      if (v7Distance(o, { x: x + 0.5, y: y + 0.5 }) <= r)
        area.push({ x: x + 0.5, y: y + 0.5 });
  const key = (p: Point) =>
    `${String(Math.floor(p.x))},${String(Math.floor(p.y))}`;
  const unseen = area.filter((p) => !cells.has(key(p)));
  if (!unseen.length) return null;
  const left = run.limits.time - used(w, run) + 1;
  // Known water, remembered objects and people in view, as navigate itself plans around them.
  const known = v7Obstacles(w, a);
  const options = area
    .filter(
      (p) =>
        cells.has(key(p)) &&
        w.terrain[Math.floor(p.y)]?.[Math.floor(p.x)] !== '~' &&
        v7Inside(w, p, a.radius) &&
        v7SegmentClear(p, p, a.radius, known) &&
        !run.visited.some((v) => v7Distance(v, p) < 1) &&
        !run.blocked.some((b) => b.target === `place:${key(p)}`),
    )
    .map((p) => ({
      p,
      d: v7Distance(a.position, p),
      score: unseen.filter((u) => v7Distance(u, p) <= w.config.vision).length,
    }))
    .filter(
      ({ d, score }) =>
        score > 0 &&
        d >= 0.03 &&
        run.distance + d <= run.limits.path + 1e-9 &&
        run.energy + 2 * d <= run.limits.energy + 1e-9 &&
        a.vitals.energy - 2 * d >= run.limits.reserve - 1e-9 &&
        Math.ceil(d / step(w) - 1e-9) <= left,
    )
    .sort(
      (m, n) =>
        n.score - m.score || m.d - n.d || m.p.y - n.p.y || m.p.x - n.p.x,
    );
  return options[0]?.p ?? null;
}

function blocked(
  c: V7ActionContext,
  run: Run,
  target: string,
  error: unknown,
): V7HandlerResult {
  const reason =
    error instanceof ForestRouteFailure
      ? `${error.evidence.status}: ${error.evidence.reasonCode}`
      : error instanceof Error
        ? error.message
        : 'navigation failed';
  run.blocked = [...run.blocked, { target, tick: c.world.tick, reason }];
  run.target = null;
  run.goal = null;
  run.checked = null;
  run.phase = 'blocked';
  c.emit(
    EVENTS.blocked,
    `No step toward ${target} could be taken (${reason}); it is left out of this search. ${tally(c.world, run)}.`,
    data(c.world, c.actor, run, 'blocked', { source: target }),
    target.startsWith('place:') ? null : target,
  );
  return after(c, run);
}
/** One navigate step through the kernel's own handler. Its exact distance and energy are first
 * computed on a copy of the person (nothing of it is kept); a step that does not fit every
 * budget and the reserve is not taken. */
function travel(
  c: V7ActionContext,
  run: Run,
  action: V7Action,
  phase: string,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const contract = w.abilities.find((x) => x.id === NAVIGATE.ability);
  if (contract?.handler !== NAVIGATE.handler)
    throw nothing('The ordinary navigate interface is unavailable.');
  v7Validate(contract.parameters, action.args);
  const target = run.target ?? '';
  const ghost = v7Clone(a);
  let complete: boolean;
  try {
    complete = v7NavigateStep(
      w,
      ghost,
      action,
      null,
      c.work,
      () => undefined,
    ).complete;
  } catch (error) {
    if (error instanceof V7ComputePause) throw error;
    return blocked(c, run, target, error);
  }
  const distance = v7Distance(a.position, ghost.position),
    energy = a.vitals.energy - ghost.vitals.energy;
  if (run.distance + distance > run.limits.path + 1e-9)
    return stop(
      c,
      run,
      'path-limit',
      `The next step of ${shown(distance)} would pass the path limit (${tally(w, run)}).`,
    );
  if (run.energy + energy > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `The next step costs ${shown(energy)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (ghost.vitals.energy < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `The next step would leave ${shown(ghost.vitals.energy)} energy, below the reserve of ${shown(run.limits.reserve)}.`,
    );
  const from = { ...a.position },
    before = a.vitals.energy;
  const result = v7NavigateStep(w, a, action, null, c.work, c.emit);
  const moved = v7Distance(from, a.position);
  if (
    a.position.x !== ghost.position.x ||
    a.position.y !== ghost.position.y ||
    a.vitals.energy !== ghost.vitals.energy ||
    result.complete !== complete
  )
    throw new Error('The navigate step differed from its priced copy.');
  // The kernel step moves at most speed x dt / travel factor; never more than navigate.
  if (moved > step(w) + 1e-6)
    throw new Error('A search step would move faster than navigate.');
  run.distance = v7RoundNumber(run.distance + moved);
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.moves += 1;
  run.phase = phase;
  run.path = [...run.path, { x: a.position.x, y: a.position.y, tick: w.tick }];
  const toPlace = target.startsWith('place:');
  if (result.complete && toPlace && run.goal) {
    run.visited = [...run.visited, { ...run.goal, tick: w.tick }];
    run.goal = null;
    run.target = null;
  }
  c.emit(
    EVENTS.moved,
    `Search step ${String(run.moves + run.probes + run.gathers)}: walked ${shown(moved)} through navigate toward ${toPlace ? `unseen ground near ${target.slice(6)}` : target}${result.complete ? ', now within reach' : ''} (${tally(w, run)}).`,
    data(w, a, run, phase, { source: toPlace ? null : target }),
    toPlace ? null : target,
  );
  return after(c, run, result.writes);
}
/** One observation through probe's own handler (observe mode only, never a material trial). */
function inspect(
  c: V7ActionContext,
  run: Run,
  source: V7Object,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.energy + PROBE.energy > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `An inspection costs ${String(PROBE.energy)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (a.vitals.energy - PROBE.energy < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `An inspection would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
    );
  const contract = w.abilities.find((x) => x.id === PROBE.ability);
  const probe = OPEN_FOUNDATION.handlers[PROBE.handler];
  if (contract?.handler !== PROBE.handler || !probe)
    throw nothing('The ordinary probe interface is unavailable.');
  const action: V7Action = {
    interface: PROBE.ability,
    args: { target: source.id, mode: 'observe', intensity: 0 },
  };
  v7Validate(contract.parameters, action.args);
  const before = a.vitals.energy;
  const result = probe({ ...c, action });
  const measured = a.memory.knowledge?.[`${source.id}:observed-state`];
  const value: V7Data =
    measured?.tick === w.tick &&
    measured.value &&
    typeof measured.value === 'object' &&
    !Array.isArray(measured.value)
      ? measured.value
      : {};
  const stock = typeof value.stock === 'number' ? value.stock : 0;
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.probes += 1;
  run.checked = source.id;
  run.phase = 'inspect';
  run.visited = [
    ...run.visited,
    { x: a.position.x, y: a.position.y, tick: w.tick },
  ];
  note(run, {
    source: source.id,
    stock,
    growth: typeof value.growth === 'number' ? value.growth : null,
    tick: w.tick,
    method: 'probe',
    x: source.spatial.x,
    y: source.spatial.y,
  });
  c.emit(
    EVENTS.inspected,
    `Inspected ${source.id} with probe: ${shown(stock)} ripe ${run.resource} in stock${stock >= 1 ? '' : ', nothing to collect'} (${tally(w, run)}).`,
    data(w, a, run, 'inspect', { source: source.id, available: stock }),
    source.id,
  );
  return after(c, run, result.writes);
}
/** One gather through its own handler: min(stock, quantity left, units the energy allows). */
function harvest(
  c: V7ActionContext,
  run: Run,
  source: V7Object,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const stock = Math.floor(num(source.data.stock) + 1e-9);
  const byBudget = Math.floor(
    (run.limits.energy - run.energy) / GATHER.energy + 1e-9,
  );
  const byReserve = Math.floor(
    (a.vitals.energy - run.limits.reserve) / GATHER.energy + 1e-9,
  );
  const n = Math.min(
    stock,
    run.limits.quantity - run.collected,
    byBudget,
    byReserve,
  );
  if (n < 1)
    return byBudget < 1
      ? stop(
          c,
          run,
          'energy-budget',
          `One unit costs ${String(GATHER.energy)} energy, more than the budget left (${tally(w, run)}).`,
        )
      : stop(
          c,
          run,
          'energy-reserve',
          `One unit would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
        );
  const contract = w.abilities.find((x) => x.id === GATHER.ability);
  const gather = FOREST_BASE.handlers[GATHER.handler];
  if (contract?.handler !== GATHER.handler || !gather)
    throw nothing('The ordinary gather interface is unavailable.');
  if (source.createdBy !== null && source.createdBy !== a.id)
    throw nothing(`${source.id} was made by another person.`);
  const action: V7Action = {
    interface: GATHER.ability,
    args: { target: source.id, quantity: n },
  };
  v7Validate(contract.parameters, action.args);
  const before = a.vitals.energy;
  // gather revalidates the real stock and reach at transfer time and moves exactly n units.
  const result = gather({ ...c, action });
  const event = w.events.findLast(
    (e) => e.type === 'gathered' && e.actor === a.id && e.target === source.id,
  );
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.collected += n;
  run.gathers += 1;
  run.phase = 'harvest';
  run.transfers = [
    ...run.transfers,
    {
      tick: w.tick,
      source: source.id,
      quantity: n,
      item: typeof event?.data.item === 'string' ? event.data.item : '',
    },
  ];
  // The stock left there, as gather itself reports it.
  const remaining = event?.data.remaining;
  const left = typeof remaining === 'number' ? remaining : 0;
  note(run, {
    source: source.id,
    stock: left,
    growth: null,
    tick: w.tick,
    method: 'gather',
    x: source.spatial.x,
    y: source.spatial.y,
  });
  if (left < 1) {
    run.target = null;
    run.checked = null;
  }
  c.emit(
    EVENTS.collected,
    `Collected ${String(n)} ${run.resource} from ${source.id} with gather; ${shown(left)} left there (${String(run.collected)} of ${String(run.limits.quantity)}; ${tally(w, run)}).`,
    data(w, a, run, 'harvest', {
      source: source.id,
      available: left,
      transferred: n,
    }),
    source.id,
  );
  return after(c, run, result.writes);
}

/** One round of an active search: checks, then exactly one navigate, probe or gather step. */
function advance(c: V7ActionContext, run: Run): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.lastStep === w.tick)
    throw new Error('This round already took a search step.');
  run.lastStep = w.tick;
  run.status = 'active';
  run.reason = null;
  const risks = unsafe(w, a);
  if (risks.length) return stop(c, run, 'unsafe', `${risks.join('; ')}.`);
  if (used(w, run) > run.limits.time)
    return stop(
      c,
      run,
      'time-limit',
      `All ${String(run.limits.time)} rounds are used.`,
    );
  const view = v7Observe(w, a.id);
  const known = sources(w, a, run, view);
  for (const k of known)
    if (view.objects.some((o) => o.id === k.object.id))
      note(run, {
        source: k.object.id,
        stock: k.stock,
        growth: null,
        tick: w.tick,
        method: 'seen',
        x: k.object.spatial.x,
        y: k.object.spatial.y,
      });
  const viable = known.filter((k) => k.stock >= 1);
  const source =
    viable.find((k) => k.object.id === run.target && fits(w, a, run, k)) ??
    viable
      .filter((k) => fits(w, a, run, k))
      .sort(
        (m, n) =>
          m.gap - n.gap ||
          (m.object.id < n.object.id ? -1 : m.object.id > n.object.id ? 1 : 0),
      )[0];
  if (source) {
    const id = source.object.id;
    if (run.target !== id) {
      run.target = id;
      run.goal = null;
      run.checked = null;
    }
    const seen = view.objects.find((o) => o.id === id);
    if (seen && v7Reach(a, seen.spatial))
      return run.checked === id ? harvest(c, run, seen) : inspect(c, run, seen);
    return travel(
      c,
      run,
      {
        interface: NAVIGATE.ability,
        args: {
          target: id,
          x: source.object.spatial.x,
          y: source.object.spatial.y,
        },
      },
      'travel',
    );
  }
  // Known sources with stock that no step can reach, inspect and harvest within the limits left:
  // stop instead of walking on.
  const nearest = [...viable].sort((m, n) => m.gap - n.gap)[0];
  if (nearest)
    return stop(
      c,
      run,
      binding(w, a, run, nearest) ?? 'energy-budget',
      `${String(viable.length)} source(s) with stock remain in the area, but none can be reached, inspected and harvested within the limits left (${tally(w, run)}).`,
    );
  // No known source with stock: look at unseen parts of the area from observed ground.
  const unseen = (p: Point) => {
    const cells = new Set(a.memory.cells);
    for (
      let y = Math.floor(p.y - w.config.vision);
      y <= p.y + w.config.vision;
      y++
    )
      for (
        let x = Math.floor(p.x - w.config.vision);
        x <= p.x + w.config.vision;
        x++
      )
        if (
          v7Distance({ x: x + 0.5, y: y + 0.5 }, p) <= w.config.vision &&
          v7Distance({ x: x + 0.5, y: y + 0.5 }, run.origin) <= run.radius &&
          x >= 0 &&
          y >= 0 &&
          x < w.config.width &&
          y < w.config.height &&
          !cells.has(`${String(x)},${String(y)}`)
        )
          return true;
    return false;
  };
  const goal =
    run.goal &&
    unseen(run.goal) &&
    v7SegmentClear(run.goal, run.goal, a.radius, v7Obstacles(w, a))
      ? run.goal
      : place(w, a, run);
  if (goal) {
    run.goal = goal;
    run.target = `place:${String(Math.floor(goal.x))},${String(Math.floor(goal.y))}`;
    run.checked = null;
    return travel(
      c,
      run,
      {
        interface: NAVIGATE.ability,
        args: { target: '', x: goal.x, y: goal.y },
      },
      'explore',
    );
  }
  run.target = null;
  run.goal = null;
  return close(
    sayIn(c),
    w,
    a,
    run,
    'completed',
    'search-exhausted',
    'No permitted reachable source with ripe stock and no unseen observed ground remain in the area.',
  );
}

function begin(c: V7ActionContext): Run {
  const { world: w, actor: a, action } = c;
  const g = action.args;
  const missing = [
    'resource',
    'radius',
    'path',
    'time',
    'energy',
    'reserve',
    'quantity',
  ].filter((k) => g[k] === undefined);
  if (missing.length) throw nothing(`start needs ${missing.join(', ')}.`);
  if ((g.x === undefined) !== (g.y === undefined))
    throw nothing(
      'Give both x and y for the origin, or neither for your position.',
    );
  const resource = typeof g.resource === 'string' ? g.resource : '';
  if (
    !w.resources.some((r) => r.id === resource) ||
    !(
      a.memory.discoveries?.[resource] ||
      a.memory.objects.some((m) => m.object.data.resource === resource)
    )
  )
    throw nothing(
      `${resource} is not a resource you have seen in a source or know.`,
    );
  const origin: V7Point =
    g.x === undefined
      ? { x: a.position.x, y: a.position.y }
      : { x: num(g.x), y: num(g.y) };
  if (!v7Inside(w, origin, 0))
    throw nothing('The origin is outside the world.');
  const risks = unsafe(w, a);
  if (risks.length)
    throw nothing(`You cannot start a search now: ${risks.join('; ')}.`);
  const limits: Limits = {
    path: num(g.path),
    time: num(g.time),
    energy: num(g.energy),
    reserve: num(g.reserve),
    quantity: num(g.quantity),
  };
  if (a.vitals.energy <= limits.reserve + 1e-9)
    throw nothing(
      `Your energy ${shown(a.vitals.energy)} is not above the reserve of ${shown(limits.reserve)}.`,
    );
  return {
    id: `search-${a.id}-${String(w.tick)}`,
    actor: a.id,
    resource,
    origin,
    radius: num(g.radius),
    limits,
    status: 'active',
    phase: 'started',
    target: null,
    goal: null,
    checked: null,
    startedAt: w.tick,
    lastStep: -1,
    distance: 0,
    energy: 0,
    collected: 0,
    moves: 0,
    probes: 0,
    gathers: 0,
    transfers: [],
    facts: [],
    blocked: [],
    visited: [],
    path: [],
    reason: null,
  };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const mode = typeof action.args.mode === 'string' ? action.args.mode : '';
  const run = openRun(a);
  const continuing =
    !!run &&
    run.status === 'active' &&
    run.lastStep === w.tick - 1 &&
    c.operation?.first === false;
  if (mode === 'cancel') {
    if (!run) throw nothing('There is no open search to cancel.');
    return close(
      sayIn(c),
      w,
      a,
      run,
      'cancelled',
      'cancel',
      'Cancelled on request.',
    );
  }
  if (mode === 'resume') {
    if (!run) throw nothing('There is no open search to resume; give start.');
    if (!continuing) {
      // A deliberate resume inspects again before any harvest; elapsed rounds still count.
      run.checked = null;
      run.status = 'active';
      c.emit(
        EVENTS.resumed,
        `Resumed search ${run.id} after fresh checks (${tally(w, run)}).`,
        data(w, a, run, 'resumed'),
      );
    }
    return advance(c, run);
  }
  if (mode !== 'start') throw nothing(`Give mode ${MODES.join(', ')}.`);
  if (run) {
    if (continuing) return advance(c, run);
    throw nothing(
      `Your search ${run.id} is ${run.status}; give resume to continue it or cancel to end it.`,
    );
  }
  const fresh = begin(c);
  c.emit(
    EVENTS.started,
    `Began a bounded search for ${fresh.resource} within ${shown(fresh.radius)} of (${shown(fresh.origin.x)}, ${shown(fresh.origin.y)}): at most ${shown(fresh.limits.path)} distance, ${String(fresh.limits.time)} rounds and ${shown(fresh.limits.energy)} energy, keeping ${shown(fresh.limits.reserve)}, for up to ${String(fresh.limits.quantity)} unit(s).`,
    data(w, a, fresh, 'started'),
  );
  return advance(c, fresh);
}

/** After the round: an active search whose round was not a search step pauses. */
function environment(w: V7World): void {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    const run = openRun(a);
    if (run?.status !== 'active' || run.lastStep === w.tick) continue;
    run.status = 'paused';
    run.phase = 'paused';
    run.reason =
      'this round was not a search step: another action, a refused action or no action took it';
    save(a, run);
    sayAt(w, a)(
      EVENTS.paused,
      `Search ${run.id} paused: ${run.reason}. Its steps and costs stay; resume continues after fresh checks; cancel ends it (${tally(w, run)}).`,
      data(w, a, run, 'paused'),
    );
  }
}
function onDeath(w: V7World, a: V7Actor): void {
  const run = openRun(a);
  if (run)
    close(sayAt(w, a), w, a, run, 'ended', 'death', 'Died during the search.');
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Bounded resource search',
  function:
    'Search an area around an origin for sources of one known resource and collect up to a quantity, one navigate, probe or gather step per round, within path, time and energy limits.',
  equivalence: 'forage:bounded-search-and-collection:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      resource: { type: 'string', maxLength: 40 },
      x: { type: 'number' },
      y: { type: 'number' },
      radius: { type: 'number', minimum: 0.5, maximum: MAX.radius },
      path: { type: 'number', minimum: 0, maximum: MAX.path },
      time: { type: 'integer', minimum: 1, maximum: MAX.time },
      energy: { type: 'number', minimum: 0, maximum: MAX.energy },
      reserve: { type: 'number', minimum: 0, maximum: MAX.energy },
      quantity: { type: 'integer', minimum: 1, maximum: MAX.quantity },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [NAVIGATE.ability, PROBE.ability, GATHER.ability],
  dependencies: {
    abilities: [NAVIGATE.ability, PROBE.ability, GATHER.ability],
    resources: [],
    knowledge: [],
  },
  learning: 1,
  costs:
    'No cost of its own: each round runs one ordinary step at its own cost. navigate: actual distance x 2 energy, raised by ground and carried mass, at most 0.8 distance per round; probe observe: 1 round, 0.2 energy; gather: 1 round, 2 energy per unit. Each step is priced first against the path, time and energy left and the energy reserve; a step that does not fit is not taken and the search stops. time counts every round since start, paused ones too. Study: 1 round; needs navigate, probe and gather.',
  effects:
    'start: resource, radius around x, y (default your position), path, time, energy, reserve, quantity. Candidates: sources of that resource you see now, or remember out of view, inside the radius, with ripe stock; nearest reach first; sources made by another person are left alone. It walks to one with navigate, inspects it with probe, then gathers min(stock, quantity left, units the energy allows). Sources seen empty are noted, not visited. If none is known it may walk to observed dry ground inside the radius to see its unseen parts; one known but beyond the limits stops it. It completes at the quantity or when nothing is left (perhaps with 0), and stops at a limit, health <= 60, satiety <= 8, body temperature 10 from 22 or an injury in the last round. Another action pauses it; resume rechecks all; cancel or death ends it. Nothing is refunded, created or eaten; no reward.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: searching earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'start or resume continues with the same action, one step per round, until it completes or stops; a round taken by another action pauses it. Steps and costs stay.',
  },
};

/** ex26: Kai's bounded search and collection, through navigate, probe and gather. */
export const LONG_EX26_BOUNDED_SEARCH: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: ['foundation-forest@1', 'foundation-open@1'],
  description:
    'Bounded search for one known resource around an origin with path, time, energy, reserve and quantity limits: perceived or remembered candidates inside the radius, nearest reach first; one navigate step, probe observation or gather per round through their own handlers, each priced first; local exploration over observed dry ground; pause, resume, cancel and death handling. No new movement, observation, harvest, food or reward.',
  reuse: {
    experiment:
      'foundation-forest@1 navigate (kernel.navigate: speed 0.8 x dt / travel factor along the observed route, actual-obstacle check, distance x 2 x carried-mass effort, the swept-body checks of v7Step), foundation-open@1 probe observe mode (open.probe: reach, 0.2 energy, observed-state record) and foundation-forest@1 gather (forest.gather: reach, real stock, 2 energy per unit, owned item)',
    source:
      'continuous-kernel.ts (v7NavigateStep, the kernel navigation exported unchanged); open-foundation.ts (OPEN_FOUNDATION.handlers open.probe); forest-foundation.ts (FOREST_BASE.handlers forest.gather); continuous-observation.ts (v7Observe); continuous-geometry.ts (v7Reach, v7ShapeDistance, v7Distance, v7Inside); forest-routing.ts (ForestRouteFailure); forest-climate.ts (forestEvent); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies: every movement, observation and transfer is the dependency handler itself, called once per round with its own checks and costs. New: candidate selection from perception and memory, the budget and reserve checks, exploration over observed terrain and the search record and its lifecycle.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
  migrate(w) {
    if (
      !w.config.forest ||
      !w.config.experience ||
      w.state.operationContinuity !== 1 ||
      !w.revisions.includes('foundation-open@1')
    )
      throw new Error(
        'Bounded resource search needs the forest world with operation continuity and the open probe.',
      );
    return w;
  },
};

// Shared unchanged with bounded-resource-search-recheck@1 (long-ex26-search-recheck.ts).
export type {
  Run as SearchRun,
  Fact as SearchFact,
  Known as SearchKnown,
  Limits as SearchLimits,
};
export {
  NAVIGATE as SEARCH_NAVIGATE,
  PROBE as SEARCH_PROBE,
  GATHER as SEARCH_GATHER,
  MAX as SEARCH_MAX,
  shown as searchShown,
  nothing as searchNothing,
  num as searchNum,
  used as searchUsed,
  step as searchStep,
  unsafe as searchUnsafe,
  sources as searchSources,
  note as searchNote,
  binding as searchBinding,
  fits as searchFits,
  place as searchPlace,
};
