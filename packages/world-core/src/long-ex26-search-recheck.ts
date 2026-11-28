import type {
  V7Ability,
  V7Action,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
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
} from './continuous-geometry.js';
import { v7NavigateStep } from './continuous-kernel.js';
import { v7Observe } from './continuous-observation.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_BASE } from './forest-foundation.js';
import { ForestRouteFailure } from './forest-routing.js';
import { OPEN_FOUNDATION } from './open-foundation.js';
import {
  type SearchKnown,
  type SearchLimits,
  type SearchRun,
  SEARCH_GATHER,
  SEARCH_MAX,
  SEARCH_NAVIGATE,
  SEARCH_PROBE,
  searchBinding,
  searchFits,
  searchNote,
  searchNothing,
  searchNum,
  searchPlace,
  searchShown,
  searchSources,
  searchStep,
  searchUnsafe,
  searchUsed,
} from './long-ex26-bounded-search.js';

/** ex26: bounded-resource-search@1 with two optional modes and stricter optional stops. Without
 * them it takes the same decisions as @1, through @1's own candidate, pricing, exploration
 * and safety code: one dependency step per round through that dependency's own handler (the
 * kernel navigate step v7NavigateStep, probe's observe mode open.probe or forest.gather), so no
 * round moves anyone more than speed x dt = 0.8. recheck adds sources last seen without ripe
 * stock, in view now or in the person's own memory, as candidates after those with stock: a
 * remembered place is only a navigate destination, stock is learned only by probe within reach,
 * and each source is inspected at most once per run. emergency drops only the satiety <= 8
 * stop. Avoided areas and directions leave out candidates and ground there, and no step enters
 * them. Nothing is created, eaten, refunded or rewarded; @1 itself stays byte-identical. */

const ID = 'bounded-resource-search-recheck';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (active or paused) search; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The latest closed search; not active work. */
const LAST = `${ID}:last`;
/** The registered energy of eat (forest.eat: "Consumed food and 1 energy"). */
const EAT_ENERGY = 1;
const MODES = ['start', 'resume', 'cancel'];
const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
/** At most this many avoided areas. */
const AREAS = 4;
const PREFIX = 'search-recheck';
const EVENTS = {
  started: `${PREFIX}-started`,
  moved: `${PREFIX}-moved`,
  inspected: `${PREFIX}-inspected`,
  empty: `${PREFIX}-empty`,
  collected: `${PREFIX}-collected`,
  blocked: `${PREFIX}-blocked`,
  paused: `${PREFIX}-paused`,
  resumed: `${PREFIX}-resumed`,
  cancelled: `${PREFIX}-cancelled`,
  completed: `${PREFIX}-completed`,
  stopped: `${PREFIX}-stopped`,
  ended: `${PREFIX}-ended`,
} as const;

type Point = { x: number; y: number };
type Direction = (typeof DIRECTIONS)[number];
type Area = { x: number; y: number; radius: number };
/** One probe observation of this run: subject, tick, ripe stock seen and probe's own event. */
type Inspection = {
  source: string;
  tick: number;
  stock: number;
  event: string;
};
type Options = {
  recheck: boolean;
  emergency: boolean;
  minHealth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  avoidAreas: Area[];
  avoidDirections: Direction[];
};
type Run = SearchRun &
  Options & {
    /** Every probe observation of this run, in order. */
    inspections: Inspection[];
    /** Sources that a probe of this run found without ripe stock. */
    empty: string[];
  };
type Status = 'completed' | 'stopped' | 'cancelled' | 'ended';
type Say = (
  type: string,
  description: string,
  data: V7Data,
  target?: string | null,
) => void;
/** What a step event shows about its source: seen now, remembered (past, not live) or probed. */
type View = {
  source?: string | null;
  evidence?: string | null;
  seenAt?: number | null;
  pastStock?: number | null;
  available?: number | null;
  transferred?: number;
  outcome?: string | null;
  underlying?: string | null;
  stop?: string | null;
};

const shown = searchShown;
const nothing = searchNothing;
const used = searchUsed;
const byGap = (m: SearchKnown, n: SearchKnown) =>
  m.gap - n.gap ||
  (m.object.id < n.object.id ? -1 : m.object.id > n.object.id ? 1 : 0);
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

/** Within 45 degrees of a compass direction from the origin (north is -y); never the origin. */
function toward(d: Direction, o: Point, p: Point): boolean {
  const dx = p.x - o.x,
    dy = p.y - o.y;
  return d === 'north'
    ? -dy > Math.abs(dx)
    : d === 'south'
      ? dy > Math.abs(dx)
      : d === 'east'
        ? dx > Math.abs(dy)
        : -dx > Math.abs(dy);
}
/** The avoided areas and directions that contain a point, by name. */
function zones(run: Options & { origin: Point }, p: Point): string[] {
  return [
    ...run.avoidAreas.flatMap((z, i) =>
      v7Distance(z, p) <= z.radius + 1e-9 ? [`area ${String(i + 1)}`] : [],
    ),
    ...run.avoidDirections.filter((d) => toward(d, run.origin, p)),
  ];
}
const avoided = (run: Run, p: Point) => zones(run, p).length > 0;
/** @1's exploration choice with avoided ground left out: cells there count as left out. */
function zoned(w: V7World, run: Run): Run {
  if (!run.avoidAreas.length && !run.avoidDirections.length) return run;
  const out: SearchRun['blocked'] = [];
  const { origin: o, radius: r } = run;
  for (let y = Math.floor(o.y - r); y <= o.y + r; y++)
    for (let x = Math.floor(o.x - r); x <= o.x + r; x++)
      if (
        x >= 0 &&
        y >= 0 &&
        x < w.config.width &&
        y < w.config.height &&
        avoided(run, { x: x + 0.5, y: y + 0.5 })
      )
        out.push({
          target: `place:${String(x)},${String(y)}`,
          tick: w.tick,
          reason: 'avoided',
        });
  return { ...run, blocked: [...run.blocked, ...out] };
}

/** View metadata from committed state only: progress, location, source, evidence and outcome. */
function data(
  w: V7World,
  a: V7Actor,
  run: Run,
  phase: string,
  extra: View = {},
): V7Data {
  return {
    operation: ID,
    run: run.id,
    phase,
    status: run.status,
    stop: extra.stop ?? null,
    modes: { recheck: run.recheck, emergency: run.emergency },
    view: {
      component: null,
      badge: null,
      actor: a.id,
      tick: w.tick,
      x: a.position.x,
      y: a.position.y,
      source: extra.source ?? null,
      evidence: extra.evidence ?? null,
      seenAt: extra.seenAt ?? null,
      pastStock: extra.pastStock ?? null,
      outcome: extra.outcome ?? null,
      underlying: extra.underlying ?? null,
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
  delete a.extensionState['bounded-resource-search-recheck:work:open'];
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
    ...data(w, a, run, status, {
      stop: reason,
      outcome:
        status === 'completed'
          ? reason === 'quantity-cap'
            ? 'complete'
            : 'incomplete'
          : status,
    }),
    summary: {
      transfers: run.transfers,
      facts: run.facts,
      inspections: run.inspections,
      empty: run.empty,
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

/** @1's safety lines (health 60, satiety 8, body temperature 10 from 22, an injury in the last
 * round), without the satiety line in emergency mode, then the stricter supplied stops. */
function risks(w: V7World, a: V7Actor, run: Options): string[] {
  const out = searchUnsafe(
    w,
    run.emergency ? { ...a, vitals: { ...a.vitals, satiety: Infinity } } : a,
  );
  const v = a.vitals;
  if (run.minHealth !== null && v.health < run.minHealth)
    out.push(
      `health ${shown(v.health)} is below your minimum of ${shown(run.minHealth)}`,
    );
  if (run.minTemp !== null && v.temperature < run.minTemp)
    out.push(
      `body temperature ${shown(v.temperature)} is below your minimum of ${shown(run.minTemp)}`,
    );
  if (run.maxTemp !== null && v.temperature > run.maxTemp)
    out.push(
      `body temperature ${shown(v.temperature)} is above your maximum of ${shown(run.maxTemp)}`,
    );
  return out;
}

function blocked(
  c: V7ActionContext,
  run: Run,
  target: string,
  reason: string,
): V7HandlerResult {
  run.blocked = [...run.blocked, { target, tick: c.world.tick, reason }];
  run.target = null;
  run.goal = null;
  run.checked = null;
  run.phase = 'blocked';
  c.emit(
    EVENTS.blocked,
    `No step toward ${target} could be taken (${reason}); it is left out of this search. ${tally(c.world, run)}.`,
    data(c.world, c.actor, run, 'blocked', {
      source: target.startsWith('place:') ? null : target,
      outcome: 'left out',
    }),
    target.startsWith('place:') ? null : target,
  );
  return after(c, run);
}
/** One navigate step through the kernel's own handler. Its exact distance and energy are first
 * computed on a copy of the person (nothing of it is kept); a step that does not fit every
 * budget and the reserve, or that would enter avoided ground, is not taken. */
function travel(
  c: V7ActionContext,
  run: Run,
  action: V7Action,
  phase: string,
  shownAs: View,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const contract = w.abilities.find((x) => x.id === SEARCH_NAVIGATE.ability);
  if (contract?.handler !== SEARCH_NAVIGATE.handler)
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
    return blocked(
      c,
      run,
      target,
      error instanceof ForestRouteFailure
        ? `${error.evidence.status}: ${error.evidence.reasonCode}`
        : error instanceof Error
          ? error.message
          : 'navigation failed',
    );
  }
  const into = zones(run, ghost.position).filter(
    (z) => !zones(run, a.position).includes(z),
  );
  if (into.length)
    return blocked(
      c,
      run,
      target,
      `the next step would enter avoided ${into.join(', ')}`,
    );
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
    before = a.vitals.energy,
    first = w.events.length;
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
  if (moved > searchStep(w) + 1e-6)
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
  const step = w.events
    .slice(first)
    .find(
      (e) => e.actor === a.id && (e.type === 'arrived' || e.type === 'moved'),
    );
  c.emit(
    EVENTS.moved,
    `Search step ${String(run.moves + run.probes + run.gathers)}: walked ${shown(moved)} through navigate toward ${toPlace ? `unseen ground near ${target.slice(6)}` : shownAs.evidence === 'remembered' ? `${target}, a place you remember (seen at round ${String(shownAs.seenAt)}; its stock now is unknown)` : target}${result.complete ? ', now within reach' : ''} (${tally(w, run)}).`,
    data(w, a, run, phase, {
      ...(toPlace ? {} : shownAs),
      source: toPlace ? null : target,
      outcome: 'moved',
      underlying: step?.id ?? null,
    }),
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
  if (run.energy + SEARCH_PROBE.energy > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `An inspection costs ${String(SEARCH_PROBE.energy)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (a.vitals.energy - SEARCH_PROBE.energy < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `An inspection would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
    );
  const contract = w.abilities.find((x) => x.id === SEARCH_PROBE.ability);
  const probe = OPEN_FOUNDATION.handlers[SEARCH_PROBE.handler];
  if (contract?.handler !== SEARCH_PROBE.handler || !probe)
    throw nothing('The ordinary probe interface is unavailable.');
  const action: V7Action = {
    interface: SEARCH_PROBE.ability,
    args: { target: source.id, mode: 'observe', intensity: 0 },
  };
  v7Validate(contract.parameters, action.args);
  const before = a.vitals.energy;
  const result = probe({ ...c, action });
  const measured = a.memory.knowledge?.[`${source.id}:observed-state`];
  const fresh = measured?.tick === w.tick;
  const value: V7Data =
    fresh &&
    measured.value &&
    typeof measured.value === 'object' &&
    !Array.isArray(measured.value)
      ? measured.value
      : {};
  const stock = typeof value.stock === 'number' ? value.stock : 0;
  const event = fresh ? measured.evidence : '';
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.probes += 1;
  run.checked = source.id;
  run.phase = 'inspect';
  run.visited = [
    ...run.visited,
    { x: a.position.x, y: a.position.y, tick: w.tick },
  ];
  searchNote(run, {
    source: source.id,
    stock,
    growth: typeof value.growth === 'number' ? value.growth : null,
    tick: w.tick,
    method: 'probe',
    x: source.spatial.x,
    y: source.spatial.y,
  });
  run.inspections = [
    ...run.inspections,
    { source: source.id, tick: w.tick, stock, event },
  ];
  const empty = stock < 1;
  if (empty) {
    run.empty = [...run.empty, source.id];
    run.target = null;
    run.checked = null;
  }
  c.emit(
    empty ? EVENTS.empty : EVENTS.inspected,
    empty
      ? `Inspected ${source.id} with probe: no ripe ${run.resource} now (${shown(stock)}); it is not inspected again in this search (${tally(w, run)}).`
      : `Inspected ${source.id} with probe: ${shown(stock)} ripe ${run.resource} in stock (${tally(w, run)}).`,
    data(w, a, run, 'inspect', {
      source: source.id,
      evidence: 'probe',
      seenAt: w.tick,
      available: stock,
      outcome: empty ? 'observed-empty' : 'stock-observed',
      underlying: event || null,
    }),
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
  const stock = Math.floor(searchNum(source.data.stock) + 1e-9);
  const byBudget = Math.floor(
    (run.limits.energy - run.energy) / SEARCH_GATHER.energy + 1e-9,
  );
  const byReserve = Math.floor(
    (a.vitals.energy - run.limits.reserve) / SEARCH_GATHER.energy + 1e-9,
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
          `One unit costs ${String(SEARCH_GATHER.energy)} energy, more than the budget left (${tally(w, run)}).`,
        )
      : stop(
          c,
          run,
          'energy-reserve',
          `One unit would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
        );
  const contract = w.abilities.find((x) => x.id === SEARCH_GATHER.ability);
  const gather = FOREST_BASE.handlers[SEARCH_GATHER.handler];
  if (contract?.handler !== SEARCH_GATHER.handler || !gather)
    throw nothing('The ordinary gather interface is unavailable.');
  if (source.createdBy !== null && source.createdBy !== a.id)
    throw nothing(`${source.id} was made by another person.`);
  const action: V7Action = {
    interface: SEARCH_GATHER.ability,
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
  searchNote(run, {
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
      evidence: 'gather',
      seenAt: w.tick,
      available: left,
      transferred: n,
      outcome: 'collected',
      underlying: event?.id ?? null,
    }),
    source.id,
  );
  return after(c, run, result.writes);
}

/** One round of an active search: checks, then exactly one navigate, probe or gather step. The
 * ordinary path is @1's: the same candidates, order, pricing, stops and exploration. */
function advance(c: V7ActionContext, run: Run): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.lastStep === w.tick)
    throw new Error('This round already took a search step.');
  run.lastStep = w.tick;
  run.status = 'active';
  run.reason = null;
  const hazards = risks(w, a, run);
  if (hazards.length) return stop(c, run, 'unsafe', `${hazards.join('; ')}.`);
  if (used(w, run) > run.limits.time)
    return stop(
      c,
      run,
      'time-limit',
      `All ${String(run.limits.time)} rounds are used.`,
    );
  const view = v7Observe(w, a.id);
  const known = searchSources(w, a, run, view).filter(
    (k) => !avoided(run, k.object.spatial),
  );
  for (const k of known)
    if (view.objects.some((o) => o.id === k.object.id))
      searchNote(run, {
        source: k.object.id,
        stock: k.stock,
        growth: null,
        tick: w.tick,
        method: 'seen',
        x: k.object.spatial.x,
        y: k.object.spatial.y,
      });
  const viable = known.filter((k) => k.stock >= 1);
  // recheck: sources last seen without ripe stock, each inspected at most once in this run.
  const recheck = run.recheck
    ? known.filter(
        (k) =>
          k.stock < 1 && !run.inspections.some((i) => i.source === k.object.id),
      )
    : [];
  const pick = (list: SearchKnown[]) =>
    list.find((k) => k.object.id === run.target && searchFits(w, a, run, k)) ??
    list.filter((k) => searchFits(w, a, run, k)).sort(byGap)[0];
  const source = pick(viable) ?? pick(recheck);
  if (source) {
    const id = source.object.id;
    if (run.target !== id) {
      run.target = id;
      run.goal = null;
      run.checked = null;
    }
    const seen = view.objects.find((o) => o.id === id);
    if (seen && v7Reach(a, seen.spatial))
      return run.checked === id && source.stock >= 1
        ? harvest(c, run, seen)
        : inspect(c, run, seen);
    const memory = a.memory.objects.find((m) => m.object.id === id);
    return travel(
      c,
      run,
      {
        interface: SEARCH_NAVIGATE.ability,
        args: {
          target: id,
          x: source.object.spatial.x,
          y: source.object.spatial.y,
        },
      },
      'travel',
      seen
        ? { evidence: 'seen now', seenAt: w.tick, pastStock: null }
        : {
            evidence: 'remembered',
            seenAt: memory?.seenAt ?? null,
            pastStock: source.stock,
          },
    );
  }
  // Known sources with stock that no step can reach, inspect and harvest within the limits left:
  // stop instead of walking on (as @1). Unaffordable sources last seen empty are skipped.
  const nearest = [...viable].sort((m, n) => m.gap - n.gap)[0];
  if (nearest)
    return stop(
      c,
      run,
      searchBinding(w, a, run, nearest) ?? 'energy-budget',
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
    v7SegmentClear(run.goal, run.goal, a.radius, v7Obstacles(w, a)) &&
    !avoided(run, run.goal)
      ? run.goal
      : searchPlace(w, a, zoned(w, run));
  if (goal) {
    run.goal = goal;
    run.target = `place:${String(Math.floor(goal.x))},${String(Math.floor(goal.y))}`;
    run.checked = null;
    return travel(
      c,
      run,
      {
        interface: SEARCH_NAVIGATE.ability,
        args: { target: '', x: goal.x, y: goal.y },
      },
      'explore',
      {},
    );
  }
  run.target = null;
  run.goal = null;
  const skipped = recheck.length
    ? ` ${String(recheck.length)} source(s) last seen empty lie beyond the limits left.`
    : '';
  return close(
    sayIn(c),
    w,
    a,
    run,
    'completed',
    'search-exhausted',
    `No permitted reachable source with ripe stock and no unseen observed ground remain in the area.${skipped}`,
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
      : { x: searchNum(g.x), y: searchNum(g.y) };
  if (!v7Inside(w, origin, 0))
    throw nothing('The origin is outside the world.');
  const number = (v: unknown) => (typeof v === 'number' ? v : null);
  const areas = Array.isArray(g.avoidAreas) ? g.avoidAreas : [];
  const directions = (
    Array.isArray(g.avoidDirections) ? g.avoidDirections : []
  ).filter((d): d is Direction => DIRECTIONS.some((x) => x === d));
  const options: Options = {
    recheck: g.recheck === true,
    emergency: g.emergency === true,
    minHealth: number(g.minHealth),
    minTemp: number(g.minTemp),
    maxTemp: number(g.maxTemp),
    avoidAreas: areas.map((z) => {
      const o: V7Data =
        z && typeof z === 'object' && !Array.isArray(z) ? z : {};
      return {
        x: searchNum(o.x),
        y: searchNum(o.y),
        radius: searchNum(o.radius),
      };
    }),
    avoidDirections: directions,
  };
  if (areas.length > AREAS)
    throw nothing(`Give at most ${String(AREAS)} avoidAreas.`);
  if (new Set(directions).size !== directions.length)
    throw nothing('Name each avoided direction once.');
  if (
    options.minTemp !== null &&
    options.maxTemp !== null &&
    options.minTemp >= options.maxTemp
  )
    throw nothing('minTemp must be below maxTemp.');
  const hazards = risks(w, a, options);
  if (hazards.length)
    throw nothing(`You cannot start a search now: ${hazards.join('; ')}.`);
  const limits: SearchLimits = {
    path: searchNum(g.path),
    time: searchNum(g.time),
    energy: searchNum(g.energy),
    reserve: searchNum(g.reserve),
    quantity: searchNum(g.quantity),
  };
  const food = (w.resources.find((r) => r.id === resource)?.nutrition ?? 0) > 0;
  if (
    (options.recheck || options.emergency) &&
    food &&
    limits.reserve < EAT_ENERGY - 1e-9
  )
    throw nothing(
      `With recheck or emergency, a search for food keeps a reserve of at least ${String(EAT_ENERGY)} energy, what eat costs.`,
    );
  if (a.vitals.energy <= limits.reserve + 1e-9)
    throw nothing(
      `Your energy ${shown(a.vitals.energy)} is not above the reserve of ${shown(limits.reserve)}.`,
    );
  return {
    id: `search-recheck-${a.id}-${String(w.tick)}`,
    actor: a.id,
    resource,
    origin,
    radius: searchNum(g.radius),
    limits,
    ...options,
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
    inspections: [],
    empty: [],
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
        data(w, a, run, 'resumed', { outcome: 'resumed' }),
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
  const extra = [
    fresh.recheck ? 'rechecking sources last seen empty' : '',
    fresh.emergency
      ? 'in emergency mode (low satiety alone does not stop it)'
      : '',
    fresh.minHealth !== null ? `health at least ${shown(fresh.minHealth)}` : '',
    fresh.minTemp !== null || fresh.maxTemp !== null
      ? `body temperature within ${shown(fresh.minTemp ?? 12)} to ${shown(fresh.maxTemp ?? 32)}`
      : '',
    fresh.avoidAreas.length || fresh.avoidDirections.length
      ? `avoiding ${[...fresh.avoidAreas.map((z) => `within ${shown(z.radius)} of (${shown(z.x)}, ${shown(z.y)})`), ...fresh.avoidDirections.map((d) => `the ${d}`)].join(', ')}`
      : '',
  ].filter(Boolean);
  c.emit(
    EVENTS.started,
    `Began a bounded search for ${fresh.resource} within ${shown(fresh.radius)} of (${shown(fresh.origin.x)}, ${shown(fresh.origin.y)}): at most ${shown(fresh.limits.path)} distance, ${String(fresh.limits.time)} rounds and ${shown(fresh.limits.energy)} energy, keeping ${shown(fresh.limits.reserve)}, for up to ${String(fresh.limits.quantity)} unit(s)${extra.length ? `; ${extra.join('; ')}` : ''}.`,
    data(w, a, fresh, 'started', { outcome: 'started' }),
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
      data(w, a, run, 'paused', { outcome: 'paused' }),
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
  name: 'Bounded resource search with recheck and emergency modes',
  function:
    'bounded-resource-search plus options: recheck sources last seen empty, an emergency mode for low satiety, stricter health and temperature stops, avoided areas or directions.',
  equivalence: 'forage:bounded-search-and-collection:recheck-emergency:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      resource: { type: 'string', maxLength: 40 },
      x: { type: 'number' },
      y: { type: 'number' },
      radius: { type: 'number', minimum: 0.5, maximum: SEARCH_MAX.radius },
      path: { type: 'number', minimum: 0, maximum: SEARCH_MAX.path },
      time: { type: 'integer', minimum: 1, maximum: SEARCH_MAX.time },
      energy: { type: 'number', minimum: 0, maximum: SEARCH_MAX.energy },
      reserve: { type: 'number', minimum: 0, maximum: SEARCH_MAX.energy },
      quantity: { type: 'integer', minimum: 1, maximum: SEARCH_MAX.quantity },
      recheck: { type: 'boolean' },
      emergency: { type: 'boolean' },
      minHealth: { type: 'number', minimum: 60, maximum: 100 },
      minTemp: { type: 'number', minimum: 12, maximum: 32 },
      maxTemp: { type: 'number', minimum: 12, maximum: 32 },
      avoidAreas: {
        type: 'array',
        items: v7ObjectSchema({
          x: { type: 'number' },
          y: { type: 'number' },
          radius: { type: 'number', minimum: 0.5, maximum: 16 },
        }),
      },
      avoidDirections: {
        type: 'array',
        items: { type: 'string', enum: [...DIRECTIONS] },
      },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [
    SEARCH_NAVIGATE.ability,
    SEARCH_PROBE.ability,
    SEARCH_GATHER.ability,
  ],
  dependencies: {
    abilities: [
      SEARCH_NAVIGATE.ability,
      SEARCH_PROBE.ability,
      SEARCH_GATHER.ability,
    ],
    resources: [],
    knowledge: [],
  },
  learning: 1,
  costs:
    'None of its own: each round is one ordinary step at its own cost. navigate: distance x 2 energy, raised by ground and load, at most 0.8 per round; probe observe: 1 round, 0.2 energy; gather: 1 round, 2 energy per unit. Each step is priced first against the path, time and energy left and the reserve; one that does not fit is not taken. time counts every round since start, paused ones too. Study: 1 round; needs navigate, probe and gather.',
  effects:
    "start: the inputs of bounded-resource-search; without options it works exactly as that search (ripe sources seen now or remembered inside the radius, nearest reach first; walk, probe, gather; else walk to observed dry ground to see unseen parts). recheck: then sources last seen empty, seen now or in your own memory; a remembered one is only a navigate destination, its stock is learned by probe in reach; each is inspected at most once per run. emergency: satiety <= 8 alone does not stop it; health <= 60, an injury in the last round, body temperature 10 from 22 and every limit still do; minHealth, minTemp, maxTemp stop it sooner. avoidAreas (x, y, radius) and avoidDirections (from the origin): sources and ground there are left out and no step enters them. With recheck or emergency a food search needs reserve >= 1 (eat's energy). Another action pauses it; resume rechecks; cancel or death ends it. Nothing is refunded, created or eaten; no reward.",
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

/** ex26: Lin's bounded search with recheck and emergency modes, extending
 * bounded-resource-search@1 through its own code. */
export const LONG_EX26_SEARCH_RECHECK: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: [
    'foundation-forest@1',
    'foundation-open@1',
    'bounded-resource-search@1',
  ],
  description:
    'bounded-resource-search@1 with optional recheck of sources last seen empty (seen now or remembered by the person, each inspected at most once per run, stock learned only by probe in reach), an emergency mode without the satiety stop, stricter health and body temperature stops and avoided areas or directions. Without the options it takes the same steps as @1. No new movement, observation, harvest, food or reward.',
  reuse: {
    experiment:
      'bounded-resource-search@1 (candidates, pricing, exploration, safety lines and the search record), foundation-forest@1 navigate (kernel.navigate: speed 0.8 x dt / travel factor, distance x 2 x carried-mass effort), foundation-open@1 probe observe mode (open.probe: reach, 0.2 energy, observed-state record) and foundation-forest@1 gather (forest.gather: reach, real stock, 2 energy per unit)',
    source:
      'long-ex26-bounded-search.ts (searchSources, searchBinding, searchFits, searchPlace, searchNote, searchUnsafe and its constants, exported unchanged); continuous-kernel.ts (v7NavigateStep); open-foundation.ts (OPEN_FOUNDATION.handlers open.probe); forest-foundation.ts (FOREST_BASE.handlers forest.gather); continuous-observation.ts (v7Observe); continuous-geometry.ts; forest-routing.ts (ForestRouteFailure); forest-climate.ts (forestEvent); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies: candidate selection, pricing, exploration and the safety lines are @1 functions, and every movement, observation and transfer is the dependency handler itself, called once per round. New: the recheck candidates and their once-per-run record, the emergency option, the stricter stops, avoided areas and directions, the eat-cost reserve and the view fields.',
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

// Shared unchanged with bounded-resource-search-low-health@1 (long-ex26-search-low-health.ts).
export type {
  Options as RecheckOptions,
  Run as RecheckRun,
  View as RecheckView,
  Direction as RecheckDirection,
  Area as RecheckArea,
};
export {
  ABILITY as RECHECK_ABILITY,
  EAT_ENERGY as RECHECK_EAT_ENERGY,
  MODES as RECHECK_MODES,
  DIRECTIONS as RECHECK_DIRECTIONS,
  AREAS as RECHECK_AREAS,
  byGap as recheckByGap,
  zones as recheckZones,
  avoided as recheckAvoided,
  zoned as recheckZoned,
  risks as recheckRisks,
};
