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
  SEARCH_GATHER,
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
  searchUsed,
} from './long-ex26-bounded-search.js';
import {
  type RecheckDirection,
  type RecheckOptions,
  type RecheckRun,
  type RecheckView,
  RECHECK_ABILITY,
  RECHECK_AREAS,
  RECHECK_DIRECTIONS,
  RECHECK_EAT_ENERGY,
  RECHECK_MODES,
  recheckAvoided,
  recheckByGap,
  recheckRisks,
  recheckZoned,
  recheckZones,
} from './long-ex26-search-recheck.js';

/** ex26: bounded-resource-search-recheck@1 with one added mode, lowHealth. Without it the search
 * takes the same decisions as recheck@1 through recheck@1's and @1's own candidate, pricing,
 * exploration, avoidance and safety code. lowHealth replaces only the health <= 60 line with a
 * health <= minHealth stop (default 20, 20 to 100) and drops the satiety <= 8 line; damage of the
 * last round that was starvation alone is left to that health line, while any other injury in the
 * last round, body temperature 10 or more from 22, the supplied temperature bounds, every
 * limit and the reserve still stop it, and a food search needs the person's own eating record of
 * that food as edible and nontoxic. Every round is one dependency step through that dependency's
 * own handler (the kernel navigate step v7NavigateStep, probe's observe mode open.probe or
 * forest.gather), so no round moves anyone more than speed x dt = 0.8. Nothing is created, eaten,
 * healed, refunded or rewarded; recheck@1 and @1 themselves stay byte-identical. */

const ID = 'bounded-resource-search-low-health';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (active or paused) search; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The latest closed search; not active work. */
const LAST = `${ID}:last`;
/** The low-health threshold: its default (also the least allowed value) and its greatest. */
const LOW = { health: 20, most: 100 };
/** The person's health just before this round's physiology, kept only while their satiety is 0
 * or less (the only case in which physiology applies starvation damage). */
const BODY = `${ID}:body`;
/** The description physiology gives its injured event when starvation damage is part of it
 * (forest-environment.ts: "Physiological damage: starvation" or "thermal exposure"). */
const STARVATION = 'Physiological damage: starvation.';
/** Outside low-health mode minHealth keeps the range of recheck@1. */
const RECHECK_MIN_HEALTH = 60;
const PREFIX = 'search-low-health';
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
type Options = RecheckOptions & {
  /** The low-health mode: health <= minHealth stops it instead of health <= 60. */
  lowHealth: boolean;
};
type Run = RecheckRun & { lowHealth: boolean };
type Status = 'completed' | 'stopped' | 'cancelled' | 'ended';
type Say = (
  type: string,
  description: string,
  data: V7Data,
  target?: string | null,
) => void;

const shown = searchShown;
const nothing = searchNothing;
const used = searchUsed;
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

/** View metadata from committed state only: progress, location, source, evidence and outcome. */
function data(
  w: V7World,
  a: V7Actor,
  run: Run,
  phase: string,
  extra: RecheckView = {},
): V7Data {
  return {
    operation: ID,
    run: run.id,
    phase,
    status: run.status,
    stop: extra.stop ?? null,
    modes: {
      recheck: run.recheck,
      emergency: run.emergency,
      lowHealth: run.lowHealth,
    },
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
      // Only the requested quantity collected is a complete search; anything else is shown
      // incomplete.
      complete: run.collected >= run.limits.quantity,
      minHealth: run.lowHealth ? run.minHealth : null,
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
  delete a.extensionState['bounded-resource-search-low-health:work:open'];
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

/** True when the person's own records show that the only damage of the last round was
 * starvation: exactly one injured record that round, the physiology damage described as
 * starvation, and exactly the world's starvation damage lost since the health kept just before
 * that physiology, so no thermal or other damage was part of it. Anything else is an injury. */
function starvedOnly(w: V7World, a: V7Actor): boolean {
  const recent = (a.memory.important ?? []).filter(
    (e) => e.type === 'injured' && e.tick >= w.tick - 1,
  );
  const raw = a.extensionState[BODY];
  const body: V7Data =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return (
    recent.length === 1 &&
    recent[0]?.summary === STARVATION &&
    body.tick === w.tick - 1 &&
    typeof body.health === 'number' &&
    Math.abs(body.health - a.vitals.health - w.config.starvation) <= 1e-6
  );
}
/** recheck@1's stop lines outside low-health mode. In low-health mode its health 60 and satiety 8
 * lines are lifted and health at or below minHealth stops it instead; recheck@1's own code keeps
 * the injury, body temperature and supplied temperature lines, except that damage of the last
 * round that was starvation alone is left to the health line. Death is health 0, at or below
 * every threshold; starvation takes 8 a round and the threshold is at least 20, so no run steps
 * into a starvation death. */
function risks(w: V7World, a: V7Actor, run: Options): string[] {
  if (!run.lowHealth) return recheckRisks(w, a, run);
  const spared = starvedOnly(w, a)
    ? {
        ...a,
        memory: {
          ...a.memory,
          important: (a.memory.important ?? []).filter(
            (e) => !(e.type === 'injured' && e.tick >= w.tick - 1),
          ),
        },
      }
    : a;
  const out = recheckRisks(
    w,
    { ...spared, vitals: { ...a.vitals, health: Infinity } },
    { ...run, emergency: true, minHealth: null },
  );
  const floor = run.minHealth ?? LOW.health;
  if (a.vitals.health <= floor)
    out.unshift(
      `health ${shown(a.vitals.health)} is at or below your minimum of ${shown(floor)}`,
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
  shownAs: RecheckView,
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
  const into = recheckZones(run, ghost.position).filter(
    (z) => !recheckZones(run, a.position).includes(z),
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
 * candidates, order, pricing, exploration and avoidance are recheck@1's. */
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
    (k) => !recheckAvoided(run, k.object.spatial),
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
    list.filter((k) => searchFits(w, a, run, k)).sort(recheckByGap)[0];
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
    !recheckAvoided(run, run.goal)
      ? run.goal
      : searchPlace(w, a, recheckZoned(w, run));
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

/** Validates a start at no cost and builds the run. Without lowHealth these are recheck@1's
 * checks in recheck@1's order, with minHealth kept to its range of 60 to 100. */
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
  const lowHealth = g.lowHealth === true;
  const areas = Array.isArray(g.avoidAreas) ? g.avoidAreas : [];
  const directions = (
    Array.isArray(g.avoidDirections) ? g.avoidDirections : []
  ).filter((d): d is RecheckDirection =>
    RECHECK_DIRECTIONS.some((x) => x === d),
  );
  const options: Options = {
    recheck: g.recheck === true,
    // Low-health mode includes the emergency mode: low satiety alone does not stop it.
    emergency: g.emergency === true || lowHealth,
    lowHealth,
    minHealth: lowHealth
      ? (number(g.minHealth) ?? LOW.health)
      : number(g.minHealth),
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
  if (areas.length > RECHECK_AREAS)
    throw nothing(`Give at most ${String(RECHECK_AREAS)} avoidAreas.`);
  if (new Set(directions).size !== directions.length)
    throw nothing('Name each avoided direction once.');
  if (
    options.minTemp !== null &&
    options.maxTemp !== null &&
    options.minTemp >= options.maxTemp
  )
    throw nothing('minTemp must be below maxTemp.');
  if (
    !lowHealth &&
    options.minHealth !== null &&
    options.minHealth < RECHECK_MIN_HEALTH
  )
    throw nothing(
      `minHealth below ${String(RECHECK_MIN_HEALTH)} needs lowHealth: true.`,
    );
  const limits: SearchLimits = {
    path: searchNum(g.path),
    time: searchNum(g.time),
    energy: searchNum(g.energy),
    reserve: searchNum(g.reserve),
    quantity: searchNum(g.quantity),
  };
  if (lowHealth) {
    const floor = options.minHealth ?? LOW.health;
    if (!Number.isFinite(floor) || floor < LOW.health || floor > LOW.most)
      throw nothing(
        `minHealth must be ${String(LOW.health)} to ${String(LOW.most)}.`,
      );
    const bounds: [string, number][] = [
      ['radius', searchNum(g.radius)],
      ['path', limits.path],
      ['time', limits.time],
      ['energy', limits.energy],
      ['quantity', limits.quantity],
    ];
    const bad = bounds.filter(([, v]) => !Number.isFinite(v) || v <= 0);
    if (bad.length)
      throw nothing(
        `In low-health mode give finite ${bad.map(([k]) => k).join(', ')} above 0.`,
      );
    if (!Number.isFinite(limits.reserve) || limits.reserve < 0)
      throw nothing('In low-health mode give a finite reserve of 0 or more.');
  }
  const hazards = risks(w, a, options);
  if (hazards.length)
    throw nothing(`You cannot start a search now: ${hazards.join('; ')}.`);
  const food = (w.resources.find((r) => r.id === resource)?.nutrition ?? 0) > 0;
  if (
    (options.recheck || options.emergency) &&
    food &&
    limits.reserve < RECHECK_EAT_ENERGY - 1e-9
  )
    throw nothing(
      lowHealth
        ? `In low-health mode a search for food keeps a reserve of at least ${String(RECHECK_EAT_ENERGY)} energy, what eat costs.`
        : `With recheck or emergency, a search for food keeps a reserve of at least ${String(RECHECK_EAT_ENERGY)} energy, what eat costs.`,
    );
  if (lowHealth && food) {
    // The person's own eating record (written by eat), never the world's food table.
    const own = a.memory.discoveries?.[resource];
    if (!own || own.toxicity !== 0 || Number(own.nutrition ?? 0) <= 0)
      throw nothing(
        `In low-health mode a food search needs your own eating record of ${resource} as edible and nontoxic.`,
      );
  }
  if (a.vitals.energy <= limits.reserve + 1e-9)
    throw nothing(
      `Your energy ${shown(a.vitals.energy)} is not above the reserve of ${shown(limits.reserve)}.`,
    );
  return {
    id: `search-low-health-${a.id}-${String(w.tick)}`,
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
  if (mode !== 'start') throw nothing(`Give mode ${RECHECK_MODES.join(', ')}.`);
  if (run) {
    if (continuing) return advance(c, run);
    throw nothing(
      `Your search ${run.id} is ${run.status}; give resume to continue it or cancel to end it.`,
    );
  }
  const fresh = begin(c);
  const extra = [
    fresh.recheck ? 'rechecking sources last seen empty' : '',
    fresh.lowHealth
      ? `in low-health mode (health ${shown(fresh.minHealth ?? LOW.health)} or below stops it; low satiety or starvation damage alone does not)`
      : fresh.emergency
        ? 'in emergency mode (low satiety alone does not stop it)'
        : '',
    !fresh.lowHealth && fresh.minHealth !== null
      ? `health at least ${shown(fresh.minHealth)}`
      : '',
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

/** After the round's environment and before its physiology: an active search whose round was
 * not a search step pauses, and a person who has mastered this search keeps their health while
 * their satiety is 0 or less, the evidence that the next round reads for starvation alone. */
function environment(w: V7World): void {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    if (a.mastered.includes(ID) && a.vitals.satiety <= 0)
      a.extensionState[BODY] = { tick: w.tick, health: a.vitals.health };
    else if (a.extensionState[BODY] !== undefined)
      delete a.extensionState['bounded-resource-search-low-health:body'];
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
  name: 'Bounded resource search with a low-health mode',
  function:
    'bounded-resource-search-recheck plus lowHealth: a bounded search while health is low that stops at a health threshold you set (20 or more) instead of 60.',
  equivalence: 'forage:bounded-search-and-collection:low-health:1',
  parameters: {
    ...RECHECK_ABILITY.parameters,
    properties: {
      ...RECHECK_ABILITY.parameters.properties,
      minHealth: { type: 'number', minimum: LOW.health, maximum: LOW.most },
      lowHealth: { type: 'boolean' },
    },
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
  // The same steps at the same costs as recheck@1.
  costs: RECHECK_ABILITY.costs,
  effects:
    'Without lowHealth: exactly bounded-resource-search-recheck (minHealth 60 to 100). lowHealth: true: health at or below minHealth (default 20, 20 to 100) stops it instead of health 60, and satiety <= 8 or starvation damage alone does not; any other injury in the last round, body temperature 12 or below or 32 or above, minTemp, maxTemp, the reserve and every limit still do. radius, path, time, energy and quantity must be above 0. A food search needs reserve >= 1 and your own eating record of that food as edible and nontoxic. Ripe sources seen now or remembered in the radius first, nearest first; with recheck, then sources last seen empty, each probed at most once per run; a remembered place is only a navigate destination. Another action pauses it; resume rechecks; cancel or death ends it. Nothing is refunded, created, eaten or healed; no reward; food is not assured.',
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

/** ex26: Kai's bounded search with a low-health mode, extending
 * bounded-resource-search-recheck@1 through its own code. */
export const LONG_EX26_SEARCH_LOW_HEALTH: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: [
    'foundation-forest@1',
    'foundation-open@1',
    'bounded-resource-search@1',
    'bounded-resource-search-recheck@1',
  ],
  description:
    "bounded-resource-search-recheck@1 with one added mode, lowHealth: health at or below a supplied threshold (default 20, 20 to 100) stops it instead of health 60 and low satiety or starvation damage alone does not, while any other injury in the last round, body temperature, the supplied temperature bounds, the reserve and every limit still do; every limit must be above 0, and a food search needs reserve >= 1 and the person's own eating record of that food as edible and nontoxic. Without lowHealth it takes the same steps as recheck@1. No new movement, observation, harvest, food, healing or reward.",
  reuse: {
    experiment:
      'bounded-resource-search-recheck@1 (recheck candidates and their once-per-run record, emergency, stricter stops, avoided areas and directions, the eat-cost reserve), bounded-resource-search@1 (candidates, pricing, exploration, safety lines and the search record), foundation-forest@1 navigate (kernel.navigate: speed 0.8 x dt / travel factor, distance x 2 x carried-mass effort), foundation-open@1 probe observe mode (open.probe: reach, 0.2 energy, observed-state record) and foundation-forest@1 gather (forest.gather: reach, real stock, 2 energy per unit)',
    source:
      'long-ex26-search-recheck.ts (recheckRisks, recheckZones, recheckAvoided, recheckZoned, recheckByGap, its constants and ability, exported unchanged); long-ex26-bounded-search.ts (searchSources, searchBinding, searchFits, searchPlace, searchNote and its constants); continuous-kernel.ts (v7NavigateStep); open-foundation.ts (OPEN_FOUNDATION.handlers open.probe); forest-foundation.ts (FOREST_BASE.handlers forest.gather); continuous-observation.ts (v7Observe); continuous-geometry.ts; forest-routing.ts (ForestRouteFailure); forest-climate.ts (forestEvent); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies: the stop lines, avoidance and candidate order are recheck@1 functions, candidate selection, pricing and exploration are @1 functions, and every movement, observation and transfer is the dependency handler itself, called once per round. New: the lowHealth option, its validated threshold, the positive-limit and eating-record checks and the view fields.',
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

// Shared unchanged with bounded-food-foraging@1 (long-ex26-food-foraging.ts).
export type { Options as LowHealthOptions };
export { BODY as LOW_HEALTH_BODY, LOW as LOW_HEALTH, risks as lowHealthRisks };
