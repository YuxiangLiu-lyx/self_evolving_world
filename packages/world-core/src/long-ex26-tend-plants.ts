import type {
  V7Ability,
  V7Action,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Resource,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  v7Clone,
  v7Json,
  v7RoundNumber,
  v7Validate,
} from './continuous-data.js';
import { v7Reach } from './continuous-geometry.js';
import { forestClimate, forestEvent, forestGrowth } from './forest-climate.js';
import { longPressure } from './long-pressure.js';
import { OPEN_FOUNDATION } from './open-foundation.js';
import { openConditions } from './open-physical.js';

/** ex26: tending an established rooted food plant within reach. inspect is probe's own
 * observation (open.probe of foundation-open@1) plus the plant's growth contract read from the
 * existing evaluator (forestGrowth with the inputs openPlants gives it). prepare and maintain
 * apply hand loosening only where modeled crust or compaction limits a plant and clearing only
 * where modeled competition does. The world's model has neither: the soil (openConditions)
 * holds ground type, moisture, drought and waterlogging only, and growth (openPlants) has no
 * term for other plants, whose 0.6 m clearance governs only where new seedlings may be placed.
 * So prepare and maintain report that no corrective work is indicated, charge nothing and
 * change nothing; no crust, compaction or competition state is invented. Growth runs only
 * through openPlants, harvest only through gather; nobody is moved and nothing is revealed
 * beyond the plant in reach. */

const ID = 'tend-rooted-plants';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The person's patch records. Nothing is ever left pending, so this is not active work. */
const PATCHES = `${ID}:patches`;
const PROBE = { ability: 'probe', handler: 'open.probe', energy: 0.2 };
const MODES = ['inspect', 'prepare', 'maintain', 'cancel'];
/** At most this many patch records per person; a new one drops the oldest. */
const RECORDS = 8;
/** A patch is the one square unit centred on its plant. */
const PATCH_SIZE = 1;
/** Resources of growing objects that are not rooted plants: river fish and fungi. */
const NOT_ROOTED = ['fish', 'mushroom', 'red-fungus'];
/** forestClimate: light = daylight x (0.65 + max(-0.35, 11 sin(2 pi phase) / 30)) with
 * daylight at most 1, so it never exceeds 0.65 + 11 / 30. */
const LIGHT_CEILING = 0.65 + 11 / 30;
/** What actual corrective work would cost (specification). Never charged in this world. */
const WORK = {
  prepare: { rounds: 3, energy: 2 },
  maintain: { rounds: 1, energy: 1 },
};
const NO_WORK =
  'this soil has ground type, moisture, drought and waterlogging but no surface crust or compaction to loosen, and other plants do not compete with this one for growth, so there is nothing to clear';
const EVENTS = {
  inspected: `${ID}-inspected`,
  assessed: `${ID}-assessed`,
  cancelled: `${ID}-cancelled`,
  ended: `${ID}-ended`,
} as const;

/** One probe observation of the plant: what probe itself recorded. */
type Look = {
  tick: number;
  stock: number;
  growth: number;
  stage: string | null;
  moisture: number;
  evidence: string;
};
/** A persistent patch record. Treatment, work, inputs and soil change stay empty because no
 * corrective work is indicated in this world. */
type Patch = {
  patch: string;
  plant: string;
  resource: string;
  x: number;
  y: number;
  size: number;
  status: 'open' | 'closed';
  openedAt: number;
  updatedAt: number;
  baseline: Look | null;
  latest: Look | null;
  inspections: number;
  assessments: number;
  treatment: string | null;
  workDone: number;
  workRequired: number;
  inputs: string[];
  change: string | null;
  lastAssessment: { tick: number; mode: string; indicated: boolean } | null;
  lastMaintenance: number | null;
  closedAt: number | null;
  cause: string | null;
};

const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const resourceName = (o: V7Object) =>
  typeof o.data.resource === 'string' ? o.data.resource : '';
const resourceOf = (w: V7World, o: V7Object): V7Resource | undefined =>
  w.resources.find((r) => r.id === o.data.resource);

function patches(a: V7Actor): Patch[] {
  const raw = a.extensionState[PATCHES];
  return Array.isArray(raw) ? (v7Clone(raw) as unknown as Patch[]) : [];
}
function store(a: V7Actor, list: Patch[]): void {
  a.extensionState[PATCHES] = v7Json(list);
}

/** An established rooted food plant that the existing plant rule (openPlants) grows: a plant
 * of a food resource with growth properties, not a fungus or fish, not a seedling, with a
 * growth interval. Every refusal uses the same words, so it reveals only ineligibility. */
function eligible(w: V7World, o: V7Object): boolean {
  const r = resourceOf(w, o);
  return (
    o.kind === 'plant' &&
    !!r?.properties &&
    r.nutrition > 0 &&
    !NOT_ROOTED.includes(r.id) &&
    o.data.stage !== 'seedling' &&
    o.data.stage !== 'dead' &&
    Number(o.data.interval) > 0
  );
}
function plantOf(c: V7ActionContext): V7Object {
  const { world: w, actor: a, action } = c;
  const target =
    typeof action.args.target === 'string' ? action.args.target : '';
  if (!target)
    throw nothing('Give target: a rooted food plant within your reach.');
  // The kernel resolved target to one object the person sees now (references: object).
  const o = w.objects.find((x) => x.id === target);
  // Reach comes first, so nothing about a plant is assessed from a distance.
  if (!o || !v7Reach(a, o.spatial))
    throw nothing(
      `${target} is not within your reach; approach it first with navigate.`,
    );
  if (!eligible(w, o))
    throw nothing(
      `${o.id} is not an established rooted food plant that regrows, so it cannot be tended; fungi, fish, seedlings, plants that are not food and plants that do not regrow are excluded.`,
    );
  return o;
}

/** The plant's growth contract, read from the values the existing evaluator reads: forestGrowth
 * (temperature, light, moisture, harvest pressure, growth scale, period pressure), the interval
 * and stock of openPlants, and the soil of openConditions. Nothing here changes growth. */
function contract(w: V7World, o: V7Object) {
  const p = resourceOf(w, o)?.properties;
  if (!p) throw new Error('A tended plant needs growth properties.');
  const soil = openConditions(w, o.spatial),
    climate = forestClimate(w, o.spatial);
  const temperature = v7RoundNumber(
    climate.temperature + Number(o.data.warming ?? 0),
  );
  const light = v7RoundNumber(
    Math.max(climate.light, Number(o.data.light ?? 0)),
  );
  const moisture = v7RoundNumber(Number(o.data.moisture ?? climate.moisture));
  const depletion = v7RoundNumber(Number(o.data.depletion ?? 0));
  const harvest = w.config.experience ? 1 / (1 + depletion / 20) : 1;
  const pressure = longPressure(w)?.growth ?? 1;
  const scale = w.config.experience?.growthScale ?? 1;
  const interval = Number(o.data.interval),
    growth = Number(o.data.growth ?? 0),
    stock = Number(o.data.stock ?? 0),
    capacity = Number(o.data.capacity ?? 0);
  // Every other factor of forestGrowth and openPlants is at most 1.
  const ceiling = scale * Math.max(LIGHT_CEILING, Number(o.data.light ?? 0));
  const minRounds = Math.ceil(Math.max(0, interval - growth) / ceiling - 1e-9);
  const limits: string[] = [];
  if (temperature <= p.minGrowth)
    limits.push(
      `temperature ${shown(temperature)} is at or below ${shown(p.minGrowth)}, so it does not grow`,
    );
  else if (temperature < p.optimalGrowth)
    limits.push(
      `temperature ${shown(temperature)} is below ${shown(p.optimalGrowth)}, where growth is full`,
    );
  if (light <= 0) limits.push('there is no daylight now');
  if (moisture < p.moisture)
    limits.push(
      `soil moisture ${shown(moisture)} is below the ${shown(p.moisture)} it needs`,
    );
  if (soil.waterlogging > 0)
    limits.push(`the soil is waterlogged (${shown(soil.waterlogging)})`);
  if (harvest < 1)
    limits.push(
      `recent harvesting slows it to ${shown(harvest)} of its rate (depletion ${shown(depletion)}, falling 0.005 per round)`,
    );
  if (pressure < 1)
    limits.push(`the difficult period slows growth to ${shown(pressure)}`);
  if (stock >= capacity)
    limits.push(
      `its stock is at capacity ${shown(capacity)}, so no unit ripens until one is taken`,
    );
  return {
    resource: resourceName(o),
    interval,
    growth: v7RoundNumber(growth),
    stock,
    capacity,
    minRounds,
    ceiling: v7RoundNumber(ceiling),
    rate: v7RoundNumber(forestGrowth(w, o)),
    needs: {
      temperature: [p.minGrowth, p.optimalGrowth],
      moisture: p.moisture,
    },
    now: {
      temperature,
      light,
      moisture,
      waterlogging: soil.waterlogging,
      depletion,
      harvestFactor: v7RoundNumber(harvest),
      pressure: v7RoundNumber(pressure),
      season: climate.season,
      ground: soil.ground,
      regime: soil.regime,
    },
    limits,
    water:
      moisture >= p.moisture
        ? `water is not needed: soil moisture ${shown(moisture)} reaches the ${shown(p.moisture)} it needs`
        : `water would help, but this operation carries none`,
  };
}

/** The person's open record for the plant, or a new one; the oldest record goes past the limit. */
function recordFor(w: V7World, a: V7Actor, o: V7Object) {
  const list = patches(a);
  let patch = list.find((p) => p.plant === o.id && p.status === 'open');
  let dropped: string | null = null;
  if (!patch) {
    patch = {
      patch: `patch-${a.id}-${o.id}-${String(w.tick)}`,
      plant: o.id,
      resource: resourceName(o),
      x: o.spatial.x,
      y: o.spatial.y,
      size: PATCH_SIZE,
      status: 'open',
      openedAt: w.tick,
      updatedAt: w.tick,
      baseline: null,
      latest: null,
      inspections: 0,
      assessments: 0,
      treatment: null,
      workDone: 0,
      workRequired: 0,
      inputs: [],
      change: null,
      lastAssessment: null,
      lastMaintenance: null,
      closedAt: null,
      cause: null,
    };
    if (list.length >= RECORDS) {
      const oldest = [...list].sort(
        (m, n) =>
          (m.status === 'closed' ? 0 : 1) - (n.status === 'closed' ? 0 : 1) ||
          m.updatedAt - n.updatedAt,
      )[0];
      if (oldest) {
        dropped = oldest.patch;
        list.splice(list.indexOf(oldest), 1);
      }
    }
    list.push(patch);
  }
  patch.updatedAt = w.tick;
  return { list, patch, dropped };
}

/** View metadata from committed state: the plant in reach only, never a remote fact. No overlay
 * exists, because no soil was disturbed and no vegetation was removed. */
function view(
  w: V7World,
  a: V7Actor,
  mode: string,
  patch: Patch | null,
  o: V7Object | null,
): V7Data {
  return {
    component: null,
    badge: null,
    overlay: null,
    actor: a.id,
    mode,
    patch: patch?.patch ?? null,
    target: o?.id ?? null,
    x: o?.spatial.x ?? a.position.x,
    y: o?.spatial.y ?? a.position.y,
    stage: typeof o?.data.stage === 'string' ? o.data.stage : null,
    work: { done: 0, required: 0 },
    tick: w.tick,
  };
}

/** The change since the baseline, as probe observed it. */
function since(base: Look | null, now: Look): string {
  if (!base || base.tick === now.tick) return 'Baseline recorded.';
  const rounds = now.tick - base.tick;
  const change = `Since the baseline at round ${String(base.tick)} (${String(rounds)} rounds): stock ${shown(base.stock)} to ${shown(now.stock)}, growth ${shown(base.growth)} to ${shown(now.growth)}`;
  const outcome =
    now.stock > base.stock
      ? 'regrowth observed: ripe units were added'
      : now.stock < base.stock
        ? 'units were taken'
        : now.growth > base.growth + 1e-9
          ? 'regrowing, no new ripe unit yet'
          : now.growth < base.growth - 1e-9
            ? 'the growth counter restarted, as it does at each ripening and at capacity'
            : 'no regrowth observed';
  return `${change}; ${outcome}.`;
}

function inspect(c: V7ActionContext, o: V7Object): V7HandlerResult {
  const { world: w, actor: a } = c;
  const ability = w.abilities.find((x) => x.id === PROBE.ability);
  const probe = OPEN_FOUNDATION.handlers[PROBE.handler];
  if (ability?.handler !== PROBE.handler || !probe)
    throw nothing('The ordinary probe interface is unavailable.');
  if (a.vitals.energy + 1e-8 < PROBE.energy)
    throw nothing(
      `Inspection is probe's observation for ${String(PROBE.energy)} energy; you have ${shown(a.vitals.energy)}.`,
    );
  const action: V7Action = {
    interface: PROBE.ability,
    args: { target: o.id, mode: 'observe', intensity: 0 },
  };
  v7Validate(ability.parameters, action.args);
  const result = probe({ ...c, action });
  const known = a.memory.knowledge?.[`${o.id}:observed-state`];
  const value: V7Data =
    known?.tick === w.tick &&
    known.value &&
    typeof known.value === 'object' &&
    !Array.isArray(known.value)
      ? known.value
      : {};
  const soil: V7Data =
    value.soil && typeof value.soil === 'object' && !Array.isArray(value.soil)
      ? value.soil
      : {};
  const look: Look = {
    tick: w.tick,
    stock: typeof value.stock === 'number' ? value.stock : 0,
    growth: typeof value.growth === 'number' ? v7RoundNumber(value.growth) : 0,
    stage: typeof value.stage === 'string' ? value.stage : null,
    moisture: typeof soil.moisture === 'number' ? soil.moisture : 0,
    evidence: known?.evidence ?? '',
  };
  const g = contract(w, o);
  const { list, patch, dropped } = recordFor(w, a, o);
  const base = patch.baseline;
  patch.baseline ??= look;
  patch.latest = look;
  patch.inspections += 1;
  store(a, list);
  const limits = g.limits.length
    ? g.limits.join('; ')
    : 'nothing beyond daylight and season';
  c.emit(
    EVENTS.inspected,
    `Inspected ${o.id} (${g.resource}) with probe for ${String(PROBE.energy)} energy: stock ${shown(g.stock)} of ${shown(g.capacity)}, growth ${shown(g.growth)} of the ${shown(g.interval)} needed per ripe unit, so at least ${String(g.minRounds)} more rounds even at the best possible rate ${shown(g.ceiling)}. It needs a temperature above ${shown(g.needs.temperature[0] ?? 0)} (full growth from ${shown(g.needs.temperature[1] ?? 0)}) and soil moisture ${shown(g.needs.moisture)}; now temperature ${shown(g.now.temperature)}, light ${shown(g.now.light)}, soil moisture ${shown(g.now.moisture)}, waterlogging ${shown(g.now.waterlogging)}, ${g.now.season}; the evaluator rate is ${shown(g.rate)} per round before the seasonal factor. Limiting now: ${limits}. No corrective work indicated: ${NO_WORK}; ${g.water}. ${since(base, look)} Patch ${patch.patch}${dropped ? `; the oldest record ${dropped} was dropped` : ''}.`,
    {
      operation: ID,
      mode: 'inspect',
      patch: patch.patch,
      plant: o.id,
      contract: g,
      observed: look,
      baseline: patch.baseline,
      treatment: { indicated: false, reason: NO_WORK },
      dropped,
      view: view(w, a, 'inspect', patch, o),
    },
    o.id,
  );
  return { complete: true, remaining: 0, writes: result.writes };
}

/** prepare and maintain: no modeled condition calls for work, so the answer costs nothing. */
function assess(
  c: V7ActionContext,
  o: V7Object,
  mode: 'prepare' | 'maintain',
): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const { list, patch, dropped } = recordFor(w, a, o);
  patch.assessments += 1;
  patch.lastAssessment = { tick: w.tick, mode, indicated: false };
  store(a, list);
  const quantity =
    typeof action.args.quantity === 'number' ? action.args.quantity : null;
  const soil = openConditions(w, o.spatial);
  c.emit(
    EVENTS.assessed,
    `No corrective work indicated for ${o.id}: ${NO_WORK}. ${mode === 'prepare' ? 'Nothing was loosened or cleared' : 'No maintenance was needed'}, no energy was spent and nothing changed; it keeps regrowing under the existing plant rule${quantity === null ? '' : `, and quantity ${String(quantity)} was not used`}. Patch ${patch.patch}${dropped ? `; the oldest record ${dropped} was dropped` : ''}.`,
    {
      operation: ID,
      mode,
      patch: patch.patch,
      plant: o.id,
      indicated: false,
      reason: NO_WORK,
      energy: 0,
      soil: { ground: soil.ground, regime: soil.regime },
      dropped,
      view: view(w, a, mode, patch, o),
    },
    o.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const target =
    typeof action.args.target === 'string' ? action.args.target : '';
  const list = patches(a);
  const open = list.filter(
    (p) => p.status === 'open' && (!target || p.plant === target),
  );
  if (!open.length)
    throw nothing(
      target
        ? `You keep no open patch record for ${target}.`
        : 'You keep no open patch record.',
    );
  for (const p of open) {
    p.status = 'closed';
    p.closedAt = w.tick;
    p.cause = 'cancelled';
    p.updatedAt = w.tick;
  }
  store(a, list);
  c.emit(
    EVENTS.cancelled,
    `Closed patch record${open.length > 1 ? 's' : ''} ${open.map((p) => `${p.patch} (${p.plant})`).join(', ')}: nothing is undone or refunded, and the plants keep regrowing under the existing plant rule.`,
    {
      operation: ID,
      mode: 'cancel',
      closed: open.map((p) => p.patch),
      view: view(
        w,
        a,
        'cancel',
        open.length === 1 ? (open[0] ?? null) : null,
        null,
      ),
    },
    target || null,
  );
  return { complete: true, remaining: 0, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = typeof c.action.args.mode === 'string' ? c.action.args.mode : '';
  if (mode === 'cancel') return cancel(c);
  if (mode !== 'inspect' && mode !== 'prepare' && mode !== 'maintain')
    throw nothing(`Give mode: ${MODES.join(', ')}.`);
  const o = plantOf(c);
  return mode === 'inspect' ? inspect(c, o) : assess(c, o, mode);
}

/** Death closes the person's open records; plants and soil stay as they are. */
function onDeath(w: V7World, a: V7Actor): void {
  const list = patches(a);
  const open = list.filter((p) => p.status === 'open');
  if (!open.length) return;
  for (const p of open) {
    p.status = 'closed';
    p.closedAt = w.tick;
    p.cause = 'death';
    p.updatedAt = w.tick;
  }
  store(a, list);
  forestEvent(
    w,
    EVENTS.ended,
    `Patch record${open.length > 1 ? 's' : ''} ${open.map((p) => p.patch).join(', ')} closed by death; the plants and soil stay as they are.`,
    a.position,
    a.id,
    {
      operation: ID,
      mode: 'death',
      closed: open.map((p) => p.patch),
      view: view(w, a, 'death', null, null),
    },
  );
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Tend rooted plants',
  function:
    'Inspect an established rooted food plant in reach and its growth needs, and loosen soil or clear competing plants by hand only where the growth model has crust, compaction or competition that limits it.',
  equivalence: 'plant:established-rooted-plant-tending:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      target: { type: 'string', maxLength: 80 },
      quantity: { type: 'integer', minimum: 1, maximum: 3 },
    }),
    required: ['mode'],
  },
  references: { target: 'object' },
  prerequisites: [PROBE.ability],
  dependencies: { abilities: [PROBE.ability], resources: [], knowledge: [] },
  learning: 3,
  costs: `Study: 3 rounds, no energy; needs probe. inspect: probe's observation of the plant, 1 round, ${String(PROBE.energy)} energy. prepare (hand loosening where modeled crust or compaction limits the plant, clearing where modeled competition does) would take ${String(WORK.prepare.rounds)} rounds at ${String(WORK.prepare.energy)} energy each and maintain ${String(WORK.maintain.rounds)} round at ${String(WORK.maintain.energy)} energy; this world's soil and plant model has neither condition, so both take 1 round, 0 energy, and change nothing. cancel: 1 round, 0 energy. Refusals cost nothing: target not in view or reach, or not an established rooted food plant that regrows (fungi, fish, seedlings, non-food and non-regrowing plants).`,
  effects:
    "target: a plant you see. inspect: probe's record (stock, growth, stage, soil) and the plant's growth contract from the existing rule: growth per ripe unit, growth so far, the least rounds to the next unit at the best rate (growth scale x full daylight), the temperature range (none at minGrowth, full at optimalGrowth), moisture need, waterlogging, harvest pressure 1/(1+depletion/20) and what limits it now. The first inspection records a baseline in your patch record (one square unit around the plant, at most 8 records); later ones report the change. prepare/maintain: 'no corrective work indicated', with the reason; quantity (rounds of work) stays unused. cancel: close the record for target, or all without one. Growth runs only through the existing rule, tended or not; harvest only with gather. No water is carried. Nothing is moved, created, refunded or rewarded.",
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The inspected event never carries a qualified flag: tending earns no practice milestone.
  practiceEvidence: EVENTS.inspected,
  execution: {
    duration: 1,
    interruption: 'cancel',
    progress:
      'Every mode completes in its round; no labor is left pending, because no corrective work is indicated in this world.',
  },
};

/** ex26: Wren's tending of established rooted food plants, through probe and the plant rule. */
export const LONG_EX26_TEND_PLANTS: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: ['foundation-forest@1', 'foundation-open@1'],
  description:
    "Tend an established rooted food plant in reach: inspect it with probe's observation and read its growth contract from the existing plant rule, keep a patch record with a baseline and later changes, and apply hand loosening or clearing only where modeled crust, compaction or competition limits it. The soil and plant model has none of these, so prepare and maintain report that no corrective work is indicated and change nothing. No new growth, food, water, movement or reward.",
  reuse: {
    experiment:
      'foundation-open@1 probe observe mode (open.probe: reach, 0.2 energy, observed-state record) and the foundation-forest@1 plant rule (openPlants with forestGrowth: interval, capacity, temperature, light, moisture, waterlogging, depletion and growth scale; soil from openConditions); harvest stays with gather and travel with navigate',
    source:
      'open-foundation.ts (OPEN_FOUNDATION.handlers open.probe); forest-climate.ts (forestGrowth, forestClimate, forestEvent); open-physical.ts (openConditions); long-pressure.ts (longPressure); open-ecology.ts (openPlants, unchanged, the only growth); continuous-geometry.ts (v7Reach); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies: the inspection is probe itself and every growth value is read from the inputs of the existing rule, which alone grows plants. New: eligibility, the growth contract report, the treatment assessment and the patch records.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  onDeath,
  migrate(w) {
    const probe = w.abilities.find((a) => a.id === PROBE.ability);
    if (
      !w.config.forest ||
      !w.config.experience ||
      !w.config.development ||
      !w.revisions.includes('foundation-open@1') ||
      probe?.handler !== PROBE.handler
    )
      throw new Error(
        'Tending rooted plants needs the forest world with the ordinary probe interface.',
      );
    return w;
  },
};
