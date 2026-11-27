import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Resource,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7ShapeDistance } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { FOREST_RESOURCES } from './forest-foundation.js';
import {
  foodSetQuantity,
  foodTenths,
  foodUnitMass,
} from './forest-food-accounting.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import { longPlantingSite } from './long-planting-site.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  CULTIVATION_LAW as LAW,
  CULTIVATION_TREATED as TREATED,
  cultivationInputs,
  cultivationLifetime,
  cultivationPlantOf,
  cultivationPosition,
} from './long-cultivation-trial.js';

/** ex23: a general propagation from seed. One whole owned fruit unit is crushed by hand and its
 * seeds rubbed free of the pulp (mass and food value partitioned, never copied); a planting site
 * can be inspected; the seeds are sown in two paid rounds (loosen a small patch, then place and
 * cover them), leaving the inventory for a site record. The patch is then a propagule of the
 * unchanged open ecology (open-ecology.ts): it roots only when the existing establishment rule
 * completes, with no fruit, and grows only under the existing growth rule. */

const ID = 'propagate-from-seed';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const STATE = `long:work:${ID}`;
/** Record on separated seed and pulp items. */
const KEY = 'seedPropagation';
/** Data key of a sowing patch's persistent record. */
const SITE = 'sowing';
/** Object kind of a sowing patch until a seedling roots in it; then it is a plant. */
const KIND = 'seed-sowing-patch';
/** The ex15-ex18 cultivation drawing (loosened soil, mound, sprout and fruit), reused. */
const VISUAL = 'cultivation-trial';
const MODES = [
  'extract',
  'inspect',
  'sow',
  'pause',
  'resume',
  'cancel',
] as const;

/** The represented seed anatomy of one whole fruit unit. */
export interface SeedComposition {
  /** The fruit resource and the plant species it propagates. */
  species: string;
  /** Seeds: a mass share of one whole unit, no food value, no ageing. */
  seeds: {
    resource: string;
    name: string;
    share: number;
    color: string;
    look: string;
  };
  /** The rest of the unit: pulp and skins with all of its food value and its ageing. */
  pulp: { resource: string; name: string };
  /** Water share of the fresh fruit (open-preservation-physics: berry 0.85). */
  water: number;
}

/** Red berries. The world has no seed row; the seed share is a declared assumption of the
 * order of small-seeded bramble and currant fruits (a few per cent of the fresh mass). */
export const BERRY_SEED_COMPOSITION: SeedComposition = {
  species: 'berry',
  seeds: {
    resource: 'berry-seed-lot',
    name: 'Separated red berry seeds',
    share: 0.05,
    color: '#c8a46a',
    look: 'small hard pale seeds with traces of pulp',
  },
  pulp: { resource: 'berry-pulp', name: 'Red berry pulp' },
  water: 0.85,
};
const COMPOSITIONS = [BERRY_SEED_COMPOSITION];

/** Declared version-1 values. Costs are the World Agent's; the rest are recorded assumptions. */
export const SEED_PROPAGATION = {
  studyEnergy: 0.2,
  extractEnergy: 0.5,
  inspectEnergy: 0.2,
  /** Each of the two sowing rounds: loosen the patch, then place and cover the seeds. */
  phaseEnergy: 1,
  phases: 2,
  /** The existing dispersal law turns one fruit unit into one propagule (seedUnits 1). */
  propagules: 1,
  /** A hand-loosened circle of soil and the cover over the seeds (m). The existing
   * establishment rule has no depth term, so depth changes neither rate nor outcome. */
  loosenRadius: 0.1,
  loosenDepth: 0.03,
  coverDepth: 0.005,
  /** open-ecology.ts: a non-woody propagule roots when its accumulated establishment reaches
   * 12 (woody: 60); the accumulation is the existing growth function of the plant's row. */
  establishment: 12,
  /** Hand reach beyond the body radius (the cultivation and root worksite rule). */
  reach: 0.65,
} as const;
const P = SEED_PROPAGATION;
const GROUND: Record<string, string> = {
  '.': 'open ordinary soil',
  f: 'forest floor',
  ':': 'rocky ground',
  ',': 'wet bank',
  '~': 'water',
  '=': 'shallow water',
};

type Lifecycle = 'preparing' | 'prepared' | 'sown' | 'emerged' | 'fruiting';
const LABELS: Record<Lifecycle, string> = {
  preparing: 'Sowing patch, unfinished',
  prepared: 'Loosened patch, not sown',
  sown: 'Sown patch, nothing emerged',
  emerged: 'Seedling, no fruit',
  fruiting: 'Young plant',
};
const STAGES: Record<Lifecycle, string> = {
  preparing: 'patch being prepared',
  prepared: 'prepared patch, no seed',
  sown: 'sown patch',
  emerged: 'emerged seedling',
  fruiting: 'established plant',
};
const MATERIAL: Record<Lifecycle, string> = {
  preparing: 'hand-loosened soil; the seeds are still carried',
  prepared: 'hand-loosened soil without seed',
  sown: 'covered soil over sown seeds; nothing shows above ground',
  emerged: 'a rooted seedling without fruit',
  fruiting: 'a rooted young plant with fruit',
};
/** The lifecycle names the cultivation drawing understands. */
const DRAWN: Record<Lifecycle, string> = {
  preparing: 'preparing',
  prepared: 'prepared',
  sown: 'planted',
  emerged: 'established',
  fruiting: 'established',
};

/** Record on a separated seed lot or pulp item: exact lineage of the crushed unit. */
interface LotRecord extends V7Data {
  version: number;
  revision: string;
  part: string;
  species: string;
  extraction: string;
  source: string;
  parent: string;
  parentCapacity: number;
  parentInterval: number;
  sourceHarvestedAt: number | null;
  sourceDecay: number;
  extractedAt: number;
  extractedBy: string;
  propagules: number;
  viability: string | null;
}
/** Conditions a sown patch actually met, round by round, until something emerged. */
interface Growth extends V7Data {
  rounds: number;
  eligibleRounds: number;
  stalledRounds: number;
  establishment: number;
  moistureRounds: number;
  moistureSum: number;
  minMoisture: number | null;
  maxMoisture: number | null;
  coldRounds: number;
  darkRounds: number;
  waterloggedRounds: number;
}
/** The persistent record of a sowing patch. Like every plant it carries createdBy null, so
 * observers see only public plant fields; the preparer and sower are kept here. */
interface PatchRecord extends V7Data {
  version: number;
  revision: string;
  lifecycle: Lifecycle;
  species: string;
  preparedBy: string;
  preparedAt: number;
  workId: string | null;
  loosened: { radius: number; depth: number; volume: number };
  cover: { depth: number; volume: number } | null;
  /** The sown seed lot, transferred out of the inventory into this record. */
  seed: V7Data | null;
  parent: string | null;
  parentCapacity: number;
  parentInterval: number;
  sownBy: string | null;
  sownAt: number | null;
  emergedAt: number | null;
  fruitedAt: number | null;
  growth: Growth;
  failures: V7Data[];
  evidence: string | null;
}
/** The persistent sowing work. */
interface Sowing extends CollectiveWork {
  stage: string;
  phase: string;
  lot: string;
  sourceLot: string;
  species: string;
  parent: string;
  quantity: number;
  patch: string | null;
  siteX: number;
  siteY: number;
  phases: string[];
  adopted: boolean;
  pausedAt: number | null;
  startedAt: number;
  endedAt: number | null;
  failures: V7Data[];
}

const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : null;
const compositionOf = (resource: string) =>
  COMPOSITIONS.find((d) => d.species === resource);
const disc = (radius: number, depth: number) =>
  round(Math.PI * radius * radius * depth);

/** The seed and pulp materials of one composition. One unit of either part is that part of one
 * whole fruit unit, so one crushed unit yields exactly one unit of each and mass and food value
 * partition exactly: seeds carry the seed share of the mass and no food; pulp the rest and all
 * of the unit's nutrition, toxicity and ageing (eaten like the fruit). */
export function seedPartResources(
  d: SeedComposition,
  unit: V7Resource,
): V7Resource[] {
  const p = unit.properties;
  return [
    {
      id: d.seeds.resource,
      name: d.seeds.name,
      mass: round(unit.mass * d.seeds.share),
      nutrition: 0,
      toxicity: 0,
      color: d.seeds.color,
      ...(p ? { properties: { ...p, decay: 0 } } : {}),
    },
    {
      id: d.pulp.resource,
      name: d.pulp.name,
      mass: round(unit.mass * (1 - d.seeds.share)),
      nutrition: unit.nutrition,
      toxicity: unit.toxicity,
      color: unit.color,
      food: {
        ingredients: [{ resource: unit.id, share: 1 }],
        method: 'unprocessed',
        quality: 0.8,
      },
      ...(p ? { properties: { ...p } } : {}),
    },
  ];
}
const RESOURCES = COMPOSITIONS.flatMap((d) => {
  const unit = FOREST_RESOURCES.find((r) => r.id === d.species);
  if (!unit) throw new Error(`No represented fruit ${d.species}.`);
  return seedPartResources(d, unit);
});

function lotOf(s: V7Stack): LotRecord | null {
  const r = record(s.processing?.[KEY]);
  return r && r.revision === REVISION ? (r as LotRecord) : null;
}
const isPatch = (o: V7Object) =>
  o.revision === REVISION && !!record(o.data[SITE]);
const patchOf = (o: V7Object) => o.data[SITE] as PatchRecord;
const labor = (t: PatchRecord) =>
  t.lifecycle === 'preparing' || t.lifecycle === 'prepared' ? 1 : 2;
const inReach = (a: V7Actor, s: V7Spatial) =>
  v7ShapeDistance(a.position, s) <= a.radius + P.reach;

/** Why the ground at a site cannot be worked by hand, before the shared site rule. */
function groundProblem(w: V7World, s: V7Spatial): string | null {
  const k = openConditions(w, s);
  if (['~', '='].includes(k.ground)) return 'This is open water, not ground.';
  if (k.ground === ',')
    return 'The wet bank is saturated: loosened soil flows back and seeds would lie in water.';
  if (k.ground === ':') return 'Rocky ground is too hard to loosen by hand.';
  if (k.waterlogging > 0.1)
    return 'The soil is waterlogged: loosened soil flows back and seeds would lie in water.';
  return null;
}

/** Hand-workable ground plus the site conditions under which the existing law starts a plant. */
function siteProblem(
  w: V7World,
  a: V7Actor,
  s: V7Spatial,
  species: string,
  self?: string,
): string | null {
  const ground = groundProblem(w, s);
  if (ground) return ground;
  const others = w.objects.filter((o) => o.id !== self);
  const site = longPlantingSite({ ...w, objects: others }, a, s);
  if (site.error) return site.error;
  const soil = openConditions(w, s);
  if (soil.moisture < LAW.soilMin || soil.moisture > LAW.soilMax)
    return `Soil moisture here is ${String(soil.moisture)}; the plant rules start a propagule only at ${String(LAW.soilMin)}-${String(LAW.soilMax)}.`;
  if (others.some((o) => v7Distance(o.spatial, s) < LAW.spacing))
    return `A new plant needs ${String(LAW.spacing)} m clear of any other object.`;
  const crowd = crowding(w, s, species, self);
  if (crowd >= LAW.crowdingLimit)
    return `${String(crowd)} ${species} plants or patches being sown stand within ${String(LAW.crowdingRadius)} m; the plant rules start no new plant there.`;
  return null;
}
function crowding(w: V7World, s: V7Spatial, species: string, self?: string) {
  return w.objects.filter(
    (o) =>
      o.id !== self &&
      v7Distance(o.spatial, s) < LAW.crowdingRadius &&
      (cultivationPlantOf(o, species) ||
        (isPatch(o) &&
          patchOf(o).species === species &&
          patchOf(o).workId !== null)),
  ).length;
}

export function seedPropagationPackage(scope: string): V7Package {
  const works = (w: V7World) => collectiveJobs(w, ID).map((j) => j as Sowing);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const sync = (a: V7Actor, j: Sowing) => {
    a.extensionState[STATE] = v7Json(j);
  };
  const reserved = (w: V7World, j: Sowing) =>
    w.stacks.find((s) => s.id === j.lot && s.reservedFor === j.id);
  const patchById = (w: V7World, id: string | null) =>
    id ? w.objects.find((o) => o.id === id && isPatch(o)) : undefined;

  /** Reusable drawing metadata: the cultivation drawing's fields plus work, lineage, site,
   * phase, labor, visible material, plant stage and evidence. Nothing shows as rooted before
   * the existing rule roots it, and unfinished work never shows completion. */
  function view(
    w: V7World,
    o: V7Object | undefined,
    j: Sowing | undefined,
    mode: string,
    phase: string,
    extra: V7Data = {},
  ): V7Data {
    const t = o ? patchOf(o) : null;
    const seed = t?.seed ?? null;
    const rooted = t?.lifecycle === 'emerged' || t?.lifecycle === 'fruiting';
    return {
      component: o ? VISUAL : null,
      operation: ID,
      mode,
      phase,
      workId: j?.id ?? t?.workId ?? null,
      patch: o?.id ?? null,
      source: {
        lot: j?.lot ?? seed?.item ?? null,
        extraction: seed?.extraction ?? null,
        parent: j?.parent ?? t?.parent ?? null,
      },
      site: o
        ? { x: o.spatial.x, y: o.spatial.y, radius: LAW.radius }
        : j
          ? { x: j.siteX, y: j.siteY, radius: LAW.radius }
          : null,
      labor: {
        completed: t ? labor(t) : (j?.phases.length ?? 0),
        required: P.phases,
      },
      lifecycle: t ? DRAWN[t.lifecycle] : null,
      unitVisible: false,
      unitPresent: t?.lifecycle === 'sown',
      sprouted: rooted,
      harvestableStock: rooted && o ? Number(o.data.stock ?? 0) : 0,
      material: t ? MATERIAL[t.lifecycle] : null,
      plantStage: t ? STAGES[t.lifecycle] : null,
      evidence: t?.evidence ?? null,
      badge: null,
      tick: w.tick,
      ...extra,
    };
  }
  /** Public plant fields, labels and drawing metadata; confers no growth or reward. */
  function refresh(w: V7World, o: V7Object, j?: Sowing) {
    const t = patchOf(o);
    o.data.mode = t.lifecycle;
    o.data.progress = round(labor(t) / P.phases);
    o.data.elapsed = t.sownAt === null ? 0 : w.tick - t.sownAt;
    o.visual.state = t.lifecycle;
    o.visual.label = t.lifecycle === 'fruiting' ? o.name : LABELS[t.lifecycle];
    o.data.view = v7Json(view(w, o, j, 'sow', t.lifecycle));
  }
  function patchSummary(w: V7World, o: V7Object): V7Data {
    const t = patchOf(o);
    return {
      patch: o.id,
      x: o.spatial.x,
      y: o.spatial.y,
      lifecycle: t.lifecycle,
      plantStage: STAGES[t.lifecycle],
      stock: Number(o.data.stock ?? 0),
      record: v7Json(t),
      tick: w.tick,
    };
  }
  function summary(w: V7World, j: Sowing, extra: V7Data = {}): V7Data {
    const o = patchById(w, j.patch);
    return {
      workId: j.id,
      status: j.status,
      stage: j.stage,
      phase: j.phase,
      lot: j.lot,
      sourceLot: j.sourceLot,
      species: j.species,
      parent: j.parent,
      quantity: j.quantity,
      patch: j.patch,
      site: { x: j.siteX, y: j.siteY },
      phases: [...j.phases],
      adopted: j.adopted,
      completedRounds: j.completedWork,
      remaining: j.remainingWork,
      paidEnergy: round(j.paidEnergy),
      ...(o ? { patchRecord: patchSummary(w, o) } : {}),
      tick: w.tick,
      view: view(w, o, j, 'sow', j.phase, extra),
    };
  }

  /** Why an own item cannot be crushed for seeds, or null; also its composition. */
  function sourceProblem(w: V7World, s: V7Stack) {
    const d = compositionOf(s.resource);
    if (lotOf(s))
      return {
        d,
        problem: `${s.id} is already separated material from an earlier extraction.`,
      };
    if (!d)
      return {
        d,
        problem: `No seed anatomy is represented for ${s.resource} in this version; only whole berries are opened for seeds.`,
      };
    if (TREATED.some((k) => s[k] !== undefined))
      return {
        d,
        problem:
          'A dried, processed, combined or otherwise treated unit has no extraction rule in this version.',
      };
    if (foodTenths(s.quantity) < 10)
      return {
        d,
        problem: `One extraction takes one whole unit; ${s.id} holds ${String(s.quantity)}.`,
      };
    if ((s.decay ?? 0) >= cultivationLifetime(w, s))
      return { d, problem: `${s.id} has spoiled.` };
    return { d, problem: null };
  }

  function extract(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((x) => x.id === text(action.args.target));
    if (!s || s.owner !== a.id)
      throw nothing(
        'Give target: one of your own whole fruit items by its exact item id.',
      );
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const { d, problem } = sourceProblem(w, s);
    if (problem || !d) throw nothing(problem ?? 'Nothing to extract.');
    const unit = w.resources.find((r) => r.id === s.resource);
    const seedRow = w.resources.find((r) => r.id === d.seeds.resource);
    const pulpRow = w.resources.find((r) => r.id === d.pulp.resource);
    if (!unit || !seedRow || !pulpRow)
      throw new Error('The seed part materials are not installed.');
    if (a.vitals.energy + 1e-8 < P.extractEnergy)
      throw nothing(`Extraction needs ${String(P.extractEnergy)} energy.`);
    v7Spend(a, P.extractEnergy);
    const mass = foodUnitMass(w, s);
    // The existing plant rules give a propagule only to a unit of a living plant of its food.
    const parent = w.objects.find((o) => o.id === s.origin);
    const living = !!parent && cultivationPlantOf(parent, s.resource);
    foodSetQuantity(s, foodTenths(s.quantity) - 10);
    if (s.quantity <= 0) w.stacks = w.stacks.filter((x) => x.id !== s.id);
    const extraction = v7Id(w, 'extraction');
    const lineage = (part: string, propagules: number): LotRecord => ({
      version: 1,
      revision: REVISION,
      part,
      species: d.species,
      extraction,
      source: s.id,
      parent: s.origin,
      parentCapacity: living ? Number(parent.data.capacity) : 0,
      parentInterval: living ? Number(parent.data.interval) : 0,
      sourceHarvestedAt: s.harvestedAt ?? null,
      sourceDecay: round(s.decay ?? 0),
      extractedAt: w.tick,
      extractedBy: a.id,
      propagules,
      viability: propagules > 0 ? 'unknown' : null,
    });
    const base = {
      quantity: 1,
      quantityTenths: 10,
      position: { ...a.position },
      owner: a.id,
      origin: s.origin,
      ...(s.harvestedAt === undefined ? {} : { harvestedAt: s.harvestedAt }),
      decay: s.decay ?? 0,
    };
    const water = round(mass * d.water);
    const pulp: V7Stack = {
      id: v7Id(w, 'item'),
      resource: d.pulp.resource,
      ...base,
      processing: { [KEY]: lineage('pulp', 0) },
      // A unit with no seed is all pulp: its whole mass stays in the pulp item.
      ...(living
        ? {}
        : {
            physical: {
              unitMass: round(mass),
              unitWater: water,
              unitSolids: round(mass - water),
            },
          }),
    };
    const seeds: V7Stack | null = living
      ? {
          id: v7Id(w, 'item'),
          resource: d.seeds.resource,
          ...base,
          processing: { [KEY]: lineage('seed lot', P.propagules) },
        }
      : null;
    w.stacks.push(pulp, ...(seeds ? [seeds] : []));
    const seedMass = seeds ? seedRow.mass : 0,
      pulpMass = pulp.physical?.unitMass ?? pulpRow.mass;
    const ledger = {
      input: {
        item: s.id,
        resource: s.resource,
        quantity: 1,
        mass: round(mass),
        nutrition: unit.nutrition,
      },
      seeds: {
        item: seeds?.id ?? null,
        quantity: seeds ? 1 : 0,
        mass: round(seedMass),
        nutrition: 0,
        propagules: seeds ? P.propagules : 0,
      },
      pulp: {
        item: pulp.id,
        quantity: 1,
        mass: round(pulpMass),
        nutrition: pulpRow.nutrition,
      },
      balanced:
        Math.abs(mass - seedMass - pulpMass) < 1e-9 &&
        pulpRow.nutrition === unit.nutrition,
    };
    const shown = {
      component: null,
      operation: ID,
      mode: 'extract',
      phase: 'extraction',
      workId: null,
      patch: null,
      source: { item: s.id, extraction, parent: s.origin },
      site: { x: round(a.position.x), y: round(a.position.y) },
      labor: { completed: 1, required: 1 },
      material: seeds ? 'separated seeds and pulp' : 'pulp only; no seed',
      plantStage: seeds ? 'unverified seed' : null,
      seedProduct: !!seeds,
      evidence: `${extraction}:extract`,
      badge: null,
      tick: w.tick,
    };
    const data = {
      extraction,
      source: s.id,
      parent: s.origin,
      ledger,
      remaining: s.quantity,
      energy: P.extractEnergy,
      view: shown,
    };
    // One personal record per parent plant and outcome: repeating a result adds no new fact.
    openRemember(c, {
      key: `${s.origin}:seed-extraction:${seeds ? 'seeds' : 'no-seed'}`,
      subject: d.species,
      property: 'seeds separated by hand from one whole unit',
      value: {
        parent: s.origin,
        seedLots: seeds ? 1 : 0,
        seedMass: ledger.seeds.mass,
        pulpMass: ledger.pulp.mass,
        look: seeds ? d.seeds.look : 'no seed found',
        viability: seeds ? 'unknown' : null,
      },
      method: 'one unit crushed and the seeds rubbed free by hand',
      condition: openConditions(w, a.position).regime,
      verified: true,
    });
    if (seeds)
      c.emit(
        'seed-propagation-extracted',
        `One whole unit of ${s.id} was crushed and its seeds rubbed free by hand: ${String(ledger.seeds.mass)} kg of seeds into ${seeds.id} and ${String(ledger.pulp.mass)} kg of pulp with all its food value into ${pulp.id}. Both keep origin ${s.origin}, harvest round and decay. Whether the seeds can grow is unknown.`,
        data,
        seeds.id,
      );
    else
      c.emit(
        'seed-propagation-no-seed',
        `One whole unit of ${s.id} was crushed and searched by hand, but no seed was separated: its parent ${s.origin} is not a living ${d.species} plant, so no propagule is represented in it. The whole unit is now pulp in ${pulp.id}; the energy is not refunded.`,
        data,
        pulp.id,
      );
    return {
      complete: true,
      writes: [s.id, pulp.id, ...(seeds ? [seeds.id] : [])],
    };
  }

  /** What a site within reach shows: ground, soil, weather, neighbours and the sowing rule. */
  function describeSite(c: V7ActionContext, species: string): V7Data {
    const { world: w, actor: a, action } = c;
    const x = v7Number(action.args.x, 'site x'),
      y = v7Number(action.args.y, 'site y');
    const s = cultivationPosition(round(x), round(y));
    if (!inReach(a, s)) throw nothing('Move within reach of the site.');
    const soil = openConditions(w, s),
      climate = forestClimate(w, s);
    const row = w.resources.find((r) => r.id === species)?.properties;
    const near = w.objects.map((o) => v7Distance(o.spatial, s));
    const problem = siteProblem(w, a, s, species);
    return {
      x: s.x,
      y: s.y,
      ground: GROUND[soil.ground] ?? soil.ground,
      moisture: soil.moisture,
      waterlogging: soil.waterlogging,
      drought: soil.drought,
      regime: soil.regime,
      temperature: round(climate.temperature),
      light: round(climate.light),
      season: climate.season,
      nearestObject: near.length ? round(Math.min(...near)) : null,
      sameFoodPlantsWithin5m: crowding(w, s, species),
      sowable: problem === null,
      reason: problem,
      rule: {
        ground: 'open ordinary soil',
        moisture: [LAW.soilMin, LAW.soilMax],
        waterloggingAtMost: 0.1,
        clearOfObjects: LAW.spacing,
        fewerThan: LAW.crowdingLimit,
        within: LAW.crowdingRadius,
        loosen: { radius: P.loosenRadius, depth: P.loosenDepth },
        coverDepth: P.coverDepth,
        growthAbove: row?.minGrowth ?? null,
        fullGrowthAt: row?.optimalGrowth ?? null,
        moistureScale: row?.moisture ?? null,
        establishment: P.establishment,
        stockAtMost: LAW.capacity,
      },
    };
  }
  function describeItem(w: V7World, s: V7Stack): V7Data {
    const rec = lotOf(s);
    const life = cultivationLifetime(w, s);
    const freshness =
      life > 0 ? round(Math.max(0, 1 - (s.decay ?? 0) / life)) : null;
    if (rec)
      return {
        item: s.id,
        part: rec.part,
        quantity: s.quantity,
        mass: round(foodUnitMass(w, s) * s.quantity),
        parent: rec.parent,
        extraction: rec.extraction,
        extractedAt: rec.extractedAt,
        look:
          rec.part === 'seed lot'
            ? (compositionOf(rec.species)?.seeds.look ?? null)
            : 'crushed pulp and skins',
        condition: rec.part === 'seed lot' ? 'intact' : freshness,
        viability: rec.viability,
        reserved: !!s.reservedFor,
      };
    const { problem } = sourceProblem(w, s);
    return {
      item: s.id,
      resource: s.resource,
      quantity: s.quantity,
      parent: s.origin,
      harvestedAt: s.harvestedAt ?? null,
      condition: freshness,
      seeds: 'not visible until a unit is opened',
      extractable: problem === null && !s.reservedFor,
      reason: s.reservedFor ? 'reserved for unfinished work' : problem,
    };
  }
  function describePatch(w: V7World, o: V7Object): V7Data {
    const t = patchOf(o);
    const rooted = t.lifecycle === 'emerged' || t.lifecycle === 'fruiting';
    return {
      patch: o.id,
      plantStage: STAGES[t.lifecycle],
      visible: MATERIAL[t.lifecycle],
      roundsSinceSowing: t.sownAt === null ? null : w.tick - t.sownAt,
      seedlingVisible: rooted,
      visibleStock: rooted ? Number(o.data.stock ?? 0) : 0,
      rooted,
      conditions: cultivationInputs(w, o),
    };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const target = text(action.args.target);
    const site = action.args.x !== undefined || action.args.y !== undefined;
    if (!target && !site)
      throw nothing(
        'Give x, y for a site within reach and/or target: your own item or a sowing patch in reach.',
      );
    let item: V7Data | null = null,
      patch: V7Data | null = null,
      species = BERRY_SEED_COMPOSITION.species;
    if (target) {
      const s = w.stacks.find((x) => x.id === target);
      const o = w.objects.find((x) => x.id === target);
      if (s) {
        if (s.owner !== a.id) throw nothing('Inspect only your own items.');
        item = describeItem(w, s);
        species = lotOf(s)?.species ?? s.resource;
      } else if (o && isPatch(o)) {
        if (!inReach(a, o.spatial))
          throw nothing('Move within reach of the patch.');
        patch = describePatch(w, o);
        species = patchOf(o).species;
      } else
        throw nothing(
          'target must be your own item or a sowing patch of this operation.',
        );
    }
    if (site && !compositionOf(species))
      throw nothing(`No seed anatomy is represented for ${species}.`);
    const where = site ? describeSite(c, species) : null;
    if (a.vitals.energy + 1e-8 < P.inspectEnergy)
      throw nothing(`Inspection needs ${String(P.inspectEnergy)} energy.`);
    v7Spend(a, P.inspectEnergy);
    // Non-destructive: nothing in the world but the person's energy and records changes.
    const o = patch ? w.objects.find((x) => x.id === target) : undefined;
    const data: V7Data = {
      item,
      patch,
      site: where,
      energy: P.inspectEnergy,
      view: o
        ? view(w, o, undefined, 'inspect', 'inspection')
        : {
            component: null,
            operation: ID,
            mode: 'inspect',
            phase: 'inspection',
            site: where ? { x: where.x ?? null, y: where.y ?? null } : null,
            plantStage:
              item && item.part === 'seed lot' ? 'unverified seed' : null,
            evidence: `inspect@${String(w.tick)}`,
            badge: null,
            tick: w.tick,
          },
    };
    const facts: [string, string, V7Data][] = [
      ...(item
        ? [
            [
              `${target}:seed-propagation-item`,
              'visible condition of an item',
              item,
            ] as [string, string, V7Data],
          ]
        : []),
      ...(patch
        ? [
            [
              `${target}:sowing-patch`,
              'visible state of a sowing patch',
              patch,
            ] as [string, string, V7Data],
          ]
        : []),
      ...(where
        ? [
            [
              `site:${String(Number(where.x))}:${String(Number(where.y))}:sowing-site`,
              'planting site conditions seen and felt',
              where,
            ] as [string, string, V7Data],
          ]
        : []),
    ];
    for (const [key, property, value] of facts)
      openRemember(c, {
        key,
        subject: species,
        property,
        value,
        method: 'direct look and touch',
        condition: 'current local conditions',
        verified: false,
      });
    c.emit(
      'seed-propagation-inspected',
      `Inspected ${[target, where ? `the site at ${String(Number(where.x))}, ${String(Number(where.y))}` : ''].filter(Boolean).join(' and ')} by hand and eye; only what can be seen and felt was recorded.`,
      data,
      target || null,
    );
    return { complete: true, writes: [] };
  }

  /** Records a pause before any charge; paid phases, the reserved seeds and the patch remain. */
  function pause(
    c: V7ActionContext,
    j: Sowing,
    reason: string,
    failed = false,
  ): V7HandlerResult {
    const { world: w } = c;
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = w.tick;
    j.phase = 'paused';
    if (failed)
      j.failures = [...j.failures, { tick: w.tick, reason }].slice(-12);
    const o = patchById(w, j.patch);
    if (o) {
      const t = patchOf(o);
      if (failed)
        t.failures = [...t.failures, { tick: w.tick, reason }].slice(-12);
      refresh(w, o, j);
    }
    c.emit(
      'seed-propagation-paused',
      `${reason} Sowing is paused; paid rounds, the reserved seeds and any loosened soil remain and nothing was charged.`,
      summary(w, j, { result: reason }),
      j.id,
    );
    sync(c.actor, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(j.patch ? [j.patch] : []), j.lot],
    };
  }
  /** Ends open work whose reserved seeds or patch are gone; nothing is refunded. */
  function lost(w: V7World, a: V7Actor, j: Sowing, reason: string) {
    j.escrow = reserved(w, j) ? [j.lot] : [];
    workStop(w, a, j, reason, false);
    j.stage = 'failed';
    j.phase = 'done';
    j.endedAt = w.tick;
    release(w, j);
    forestEvent(
      w,
      'seed-propagation-failed',
      `${reason} The sowing ended; nothing is refunded.`,
      a.position,
      a.id,
      { ...summary(w, j, { result: reason }), cause: 'material lost' },
      j.id,
    );
    j.escrow = [];
    sync(a, j);
  }
  /** An unfinished patch keeps its loosened soil and is free for later sowing. */
  function release(w: V7World, j: Sowing) {
    const o = patchById(w, j.patch);
    if (!o) return;
    const t = patchOf(o);
    if (t.lifecycle === 'preparing') {
      t.lifecycle = 'prepared';
      t.workId = null;
    }
    refresh(w, o);
  }

  /** Opens the work and reserves one seed lot; a prepared patch left by earlier work is reused. */
  function begin(
    c: V7ActionContext,
    lot: V7Stack,
    rec: LotRecord,
    s: V7Spatial,
    patch: V7Object | undefined,
  ): Sowing {
    const { world: w, actor: a } = c;
    const j = workCreate(c, 'sow', patch ? 1 : P.phases) as Sowing;
    let item: V7Stack | undefined = lot;
    if (foodTenths(lot.quantity) === 10) {
      lot.reservedFor = j.id;
      j.escrow.push(lot.id);
      j.sources.push({
        itemId: lot.id,
        escrowId: lot.id,
        resource: lot.resource,
        quantity: 1,
        owner: a.id,
        origin: lot.origin,
      });
    } else {
      workReserve(c, j, workAllocations(c, [{ itemId: lot.id, quantity: 1 }]));
      item = w.stacks.find((x) => x.id === j.escrow[0]);
      if (item) item.position = { ...a.position };
    }
    if (!item) throw new Error('The reserved seed lot is missing.');
    Object.assign(j, {
      stage: 'working',
      phase: patch ? 'cover' : 'prepare',
      lot: item.id,
      sourceLot: lot.id,
      species: rec.species,
      parent: rec.parent,
      quantity: 1,
      patch: patch?.id ?? null,
      siteX: s.x,
      siteY: s.y,
      phases: patch ? ['prepare'] : [],
      adopted: !!patch,
      pausedAt: null,
      startedAt: w.tick,
      endedAt: null,
      failures: [],
    });
    j.target = patch?.id ?? null;
    if (patch) {
      const t = patchOf(patch);
      t.workId = j.id;
      t.lifecycle = 'preparing';
    }
    sync(a, j);
    return j;
  }

  /** Round one: a small patch of soil is loosened by hand; the seeds are still carried. */
  function prepare(
    c: V7ActionContext,
    j: Sowing,
    s: V7Spatial,
    lot: V7Stack,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const fruit = w.resources.find((r) => r.id === j.species);
    const t: PatchRecord = {
      version: 1,
      revision: REVISION,
      lifecycle: 'preparing',
      species: j.species,
      preparedBy: a.id,
      preparedAt: w.tick,
      workId: j.id,
      loosened: {
        radius: P.loosenRadius,
        depth: P.loosenDepth,
        volume: disc(P.loosenRadius, P.loosenDepth),
      },
      cover: null,
      seed: null,
      parent: null,
      parentCapacity: 0,
      parentInterval: 0,
      sownBy: null,
      sownAt: null,
      emergedAt: null,
      fruitedAt: null,
      growth: {
        rounds: 0,
        eligibleRounds: 0,
        stalledRounds: 0,
        establishment: 0,
        moistureRounds: 0,
        moistureSum: 0,
        minMoisture: null,
        maxMoisture: null,
        coldRounds: 0,
        darkRounds: 0,
        waterloggedRounds: 0,
      },
      failures: [],
      evidence: `${j.id}:prepare`,
    };
    const o: V7Object = {
      id: v7Id(w, 'sowing'),
      kind: KIND,
      name: 'Sowing patch',
      spatial: { ...s },
      visual: {
        component: VISUAL,
        color: '#7a5f40',
        accent: fruit?.color ?? '#b34f66',
        label: LABELS.preparing,
        state: 'preparing',
      },
      data: { species: j.species, [SITE]: t },
      // Like every plant: observers see public plant fields only; the people are in the record.
      createdBy: null,
      createdAt: w.tick,
      revision: REVISION,
    };
    w.objects.push(o);
    j.patch = o.id;
    j.target = o.id;
    j.phases = ['prepare'];
    j.phase = 'cover';
    refresh(w, o, j);
    c.emit(
      'seed-propagation-prepared',
      `A ${String(P.loosenRadius * 2)} m patch at ${String(o.spatial.x)}, ${String(o.spatial.y)} was loosened ${String(P.loosenDepth)} m deep by hand; the seeds in ${lot.id} are still carried. One more round places and covers them.`,
      { ...summary(w, j), energy: P.phaseEnergy },
      o.id,
    );
    sync(a, j);
    return {
      complete: false,
      remaining: j.remainingWork,
      writes: [j.id, o.id, lot.id],
    };
  }

  /** Round two: the seeds leave the inventory into the patch record and are covered; the patch
   * becomes a propagule of the existing ecology exactly like a dispersed one. */
  function cover(
    c: V7ActionContext,
    j: Sowing,
    o: V7Object,
    lot: V7Stack,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const t = patchOf(o);
    const rec = lotOf(lot);
    if (!rec) throw new Error('Invalid seed lot record.');
    t.seed = {
      item: lot.id,
      resource: lot.resource,
      quantity: lot.quantity,
      mass: round(foodUnitMass(w, lot) * lot.quantity),
      origin: lot.origin,
      harvestedAt: lot.harvestedAt ?? null,
      decay: round(lot.decay ?? 0),
      extraction: rec.extraction,
      source: rec.source,
      parent: rec.parent,
      extractedAt: rec.extractedAt,
      extractedBy: rec.extractedBy,
      propagules: rec.propagules,
      sownBy: a.id,
      sownAt: w.tick,
      absorbedAt: null,
    };
    w.stacks = w.stacks.filter((s) => s.id !== lot.id);
    j.escrow = [];
    t.cover = {
      depth: P.coverDepth,
      volume: disc(P.loosenRadius, P.coverDepth),
    };
    t.parent = rec.parent;
    t.parentCapacity = rec.parentCapacity;
    t.parentInterval = rec.parentInterval;
    t.sownBy = a.id;
    t.sownAt = w.tick;
    t.lifecycle = 'sown';
    t.workId = null;
    t.evidence = `${j.id}:cover`;
    o.data.resource = t.species;
    o.data.stock = 0;
    o.data.capacity = Math.min(LAW.capacity, rec.parentCapacity);
    o.data.interval = rec.parentInterval;
    o.data.stage = 'seedling';
    o.data.establishment = 0;
    o.data.seedUnits = rec.propagules;
    o.data.parent = rec.parent;
    o.data.nextDispersal = w.tick + LAW.dispersalDelay;
    j.phases = [...j.phases, 'cover'];
    j.status = 'completed';
    j.stage = 'completed';
    j.phase = 'done';
    j.endedAt = w.tick;
    j.outputs = [o.id];
    j.remainingWork = 0;
    refresh(w, o);
    c.emit(
      'seed-propagation-sown',
      `The seeds of ${lot.id} were placed in the loosened patch ${o.id} and covered ${String(P.coverDepth)} m deep; they left your inventory. Nothing is rooted: the patch gains establishment only from actual temperature, light, soil moisture and season, may stall, and has no fruit.`,
      { ...summary(w, j), seed: v7Json(t.seed), energy: P.phaseEnergy },
      o.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id, lot.id] };
  }

  /** The next paid round of open work, after rechecks. A fresh start or explicit resume refuses
   * at no cost; a continuing round pauses at no charge. */
  function proceed(
    c: V7ActionContext,
    j: Sowing,
    fresh: boolean,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const halt = (problem: string) => {
      if (fresh) throw nothing(problem);
      return pause(c, j, problem, true);
    };
    const lot = reserved(w, j);
    if (!lot) {
      lost(w, a, j, 'The reserved seeds are gone.');
      return { complete: true, remaining: 0, writes: [j.id] };
    }
    const o = patchById(w, j.patch);
    if (j.patch && !o) {
      lost(w, a, j, 'The loosened patch is gone.');
      return { complete: true, remaining: 0, writes: [j.id, lot.id] };
    }
    const s = o?.spatial ?? cultivationPosition(j.siteX, j.siteY);
    if (!inReach(a, s)) return halt('Return within reach of the site.');
    const problem = siteProblem(w, a, s, j.species, o?.id);
    if (problem) return halt(problem);
    if (a.vitals.energy + 1e-8 < P.phaseEnergy)
      return halt(`A sowing round needs ${String(P.phaseEnergy)} energy.`);
    const resumed = j.pausedAt !== null;
    if (!workPay(c, j, P.phaseEnergy))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    j.x = a.position.x;
    j.y = a.position.y;
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'seed-propagation-resumed',
        'Paused sowing resumed after rechecking the seeds, the site, reach and energy; only the remaining round is paid.',
        summary(w, j),
        j.id,
      );
    }
    return o ? cover(c, j, o, lot) : prepare(c, j, s, lot);
  }

  /** The person's own work named by workId, else their one open work. */
  function named(c: V7ActionContext): Sowing | undefined {
    const workId = text(c.action.args.workId);
    if (!workId) return current(c.world, c.actor);
    const j = works(c.world).find(
      (j) => j.id === workId && j.owner === c.actor.id,
    );
    if (!j) throw nothing('No sowing work of yours has this workId.');
    if (!isOpen(j)) throw nothing(`Work ${j.id} is already settled.`);
    return j;
  }

  function sow(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const open = named(c);
    const target = text(action.args.target);
    if (open) {
      const elsewhere =
        typeof action.args.x === 'number' &&
        typeof action.args.y === 'number' &&
        v7Distance(
          { x: action.args.x, y: action.args.y },
          { x: open.siteX, y: open.siteY },
        ) > LAW.radius;
      if (
        (target && target !== open.lot && target !== open.sourceLot) ||
        elsewhere
      )
        throw nothing(
          `Your sowing work ${open.id} is still open; resume, pause or cancel it.`,
        );
      return proceed(c, open, open.status === 'paused');
    }
    const lot = w.stacks.find((s) => s.id === target);
    if (!lot || lot.owner !== a.id)
      throw nothing(
        'Give target: one of your own separated seed lots by its exact item id.',
      );
    if (lot.reservedFor)
      throw nothing(`${lot.id} is reserved for unfinished work.`);
    const rec = lotOf(lot);
    if (!rec || rec.part !== 'seed lot' || rec.propagules < 1)
      throw nothing(
        `${lot.id} is not a separated seed lot; extract the seeds of a whole berry first.`,
      );
    if (foodTenths(lot.quantity) < 10)
      throw nothing('Sow the seeds of one whole unit (quantity 1).');
    if (action.args.x === undefined || action.args.y === undefined)
      throw nothing('Give x and y: a site within your reach.');
    const x = round(v7Number(action.args.x, 'site x')),
      y = round(v7Number(action.args.y, 'site y'));
    // A loosened patch left by cancelled work is reused: only placing and covering remain.
    const patch = w.objects.find(
      (o) =>
        isPatch(o) &&
        patchOf(o).lifecycle === 'prepared' &&
        patchOf(o).workId === null &&
        patchOf(o).species === rec.species &&
        v7Distance(o.spatial, { x, y }) <= LAW.radius,
    );
    const s = patch ? patch.spatial : cultivationPosition(x, y);
    if (!inReach(a, s)) throw nothing('Move within reach of the site.');
    const problem = siteProblem(w, a, s, rec.species, patch?.id);
    if (problem) throw nothing(problem);
    if (a.vitals.energy + 1e-8 < P.phaseEnergy)
      throw nothing(`A sowing round needs ${String(P.phaseEnergy)} energy.`);
    return proceed(c, begin(c, lot, rec, s, patch), true);
  }

  function resume(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open sowing work to resume.');
    return proceed(c, j, true);
  }
  function pauseMode(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open sowing work to pause.');
    if (j.status === 'paused') throw nothing(`Work ${j.id} is already paused.`);
    return pause(c, j, 'Paused on request.');
  }
  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = named(c);
    if (!j) throw nothing('You have no open sowing work to cancel.');
    const lot = reserved(w, j);
    j.escrow = lot ? [lot.id] : [];
    workStop(
      w,
      a,
      j,
      'Sowing cancelled; unsown seeds return once as they are and loosened soil stays. Spent energy and time are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.phase = 'done';
    j.endedAt = w.tick;
    release(w, j);
    c.emit(
      'seed-propagation-cancelled',
      `Sowing cancelled. ${lot ? `${lot.id} returned to you as it is` : 'No reserved seeds were left'}${j.patch ? `; the loosened soil of ${j.patch} stays unsown` : ''}.`,
      {
        ...summary(w, j, { result: 'cancelled' }),
        released: lot ? [lot.id] : [],
      },
      j.id,
    );
    j.escrow = [];
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, j.lot, ...(j.patch ? [j.patch] : [])],
    };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    if (c.actor.vitals.health <= 0)
      throw nothing('Only a living person can work.');
    const mode = text(c.action.args.mode);
    if (mode === 'extract') return extract(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'sow') return sow(c);
    if (mode === 'pause') return pauseMode(c);
    if (mode === 'resume') return resume(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing(`Give mode: ${MODES.join(', ')}.`);
  }

  /** Persists the conditions a sown patch met this round, after the unchanged ecology ran. */
  function account(w: V7World, o: V7Object) {
    const t = patchOf(o),
      g = t.growth;
    const established = Number(o.data.establishment ?? 0);
    const soil = openConditions(w, o.spatial),
      climate = forestClimate(w, o.spatial);
    const row = w.resources.find((r) => r.id === t.species)?.properties;
    g.rounds += 1;
    if (established > g.establishment + 1e-12) g.eligibleRounds += 1;
    else g.stalledRounds += 1;
    g.establishment = round(established);
    if (soil.moisture >= LAW.soilMin && soil.moisture <= LAW.soilMax)
      g.moistureRounds += 1;
    g.moistureSum = round(g.moistureSum + soil.moisture);
    g.minMoisture = Math.min(g.minMoisture ?? soil.moisture, soil.moisture);
    g.maxMoisture = Math.max(g.maxMoisture ?? soil.moisture, soil.moisture);
    if (row && climate.temperature <= row.minGrowth) g.coldRounds += 1;
    if (climate.light <= 0) g.darkRounds += 1;
    if (soil.waterlogging > 0.1) g.waterloggedRounds += 1;
  }

  /** Ordinary simulation: unattended work pauses; sown patches root, stall or fruit only as
   * the existing ecology makes them. Nothing advances while the world does not step. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      const lot = reserved(w, j);
      if (!lot) {
        lost(w, a, j, 'The reserved seeds are gone.');
        continue;
      }
      lot.position = { ...a.position };
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.pausedAt = w.tick;
        j.phase = 'paused';
        j.reason = `No sowing round was worked this round; resume work ${j.id}, or cancel it.`;
        const o = patchById(w, j.patch);
        if (o) refresh(w, o, j);
        forestEvent(
          w,
          'seed-propagation-paused',
          'Sowing paused because it was not worked this round; the seeds and any loosened soil remain and nothing was charged.',
          a.position,
          a.id,
          summary(w, j, { result: 'paused: not worked this round' }),
          j.id,
        );
      }
      sync(a, j);
    }
    for (const o of w.objects.filter(isPatch)) {
      const t = patchOf(o);
      if (t.lifecycle === 'sown') {
        account(w, o);
        if (o.data.stage === 'mature') {
          // The existing establishment rule completed this round: the seeds became a plant.
          t.lifecycle = 'emerged';
          t.emergedAt = w.tick;
          if (t.seed) t.seed.absorbedAt = w.tick;
          t.evidence = `${o.id}:emerged@${String(w.tick)}`;
          o.kind = 'plant';
          o.name =
            w.resources.find((r) => r.id === t.species)?.name ?? t.species;
          refresh(w, o);
          forestEvent(
            w,
            'seed-propagation-established',
            `A seedling rooted in the sown patch ${o.id}: its accumulated establishment reached the existing threshold of ${String(P.establishment)} under actual conditions. It has no fruit; fruit grows only under the existing growth rule.`,
            o.spatial,
            null,
            {
              ...patchSummary(w, o),
              planter: t.sownBy,
              view: view(w, o, undefined, 'sow', 'emerged'),
            },
            o.id,
          );
        }
      }
      if (t.lifecycle === 'emerged' && Number(o.data.produced ?? 0) >= 1) {
        t.lifecycle = 'fruiting';
        t.fruitedAt = w.tick;
        t.evidence = `${o.id}:fruit@${String(w.tick)}`;
        refresh(w, o);
        forestEvent(
          w,
          'seed-propagation-first-fruit',
          `The plant grown from seed in ${o.id} produced its first fruit unit under the existing growth rule; anyone can gather it.`,
          o.spatial,
          null,
          {
            ...patchSummary(w, o),
            planter: t.sownBy,
            view: view(w, o, undefined, 'sow', 'fruit'),
          },
          o.id,
        );
      }
      refresh(
        w,
        o,
        works(w).find((j) => j.id === t.workId),
      );
    }
    // A plant dispersed from one grown here is ordinary: it shows its plant name.
    for (const o of w.objects.filter(
      (o) => o.revision === REVISION && !isPatch(o),
    ))
      o.visual.label = o.name;
  }

  return {
    id: ID,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Hand extraction of the seeds of one owned whole fruit unit with conserved mass and food value, inspection of a planting site, and two-round sowing of the seeds into a hand-loosened patch that roots, stalls or fruits only under the existing plant establishment and growth rules.',
    reuse: {
      experiment:
        'ex15 cultivation-trial@1 propagation-law constants and predicates (CULTIVATION_LAW: 0.25 m plant footprint, 0.6 m spacing, fewer than 3 plants of the food within 5 m, soil moisture 0.3-1.2, capacity 4, dispersal delay 600; cultivationPlantOf, cultivationInputs, cultivationPosition, cultivationLifetime, CULTIVATION_TREATED) and its drawing; ex16-ex18 cultivate-plants@1, plant-cultivation@1 and plant-establishment-trial@1 (a hand-dug plot that becomes an ecology propagule, establishment read from the unchanged ecology); ex23 crack-and-separate-casing@1 (part materials whose unit is that part of one whole source unit); ex23 rooted-plant-watering@1 (watering a rooted plant, unchanged)',
      source:
        'open-ecology.ts (openPlants: establishment 12 for non-woody propagules, growth, dispersal, unchanged); forest-climate.ts (forestClimate, forestGrowth); forest-foundation.ts berry row; open-preservation-physics.ts berry water share 0.85; long-planting-site.ts; collective-work.ts; open-foundation.ts (openRemember); forest-food-accounting.ts',
      description:
        'Implementation reuse only; every existing package is unchanged and no ability, item or mastery is inherited. New: seed and pulp part materials, hand extraction, site inspection, two-round sowing into a patch record, emergence and first-fruit transitions read from the unchanged ecology, pause, resume, cancel and death handling.',
    },
    abilities: [
      {
        id: ID,
        name: 'Propagate from seed',
        function:
          'Crush one of your own whole berries and rub its seeds free by hand, inspect a planting site, and sow the seeds in a small hand-loosened patch where they may root as a new plant under the existing plant rules; pause, resume or cancel sowing.',
        equivalence: 'plant:seed-extract-sow-establish:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: [...MODES] },
            target: { type: 'string' },
            quantity: { type: 'integer', minimum: 1, maximum: 1 },
            x: { type: 'number' },
            y: { type: 'number' },
            workId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: { target: 'optional-exact-visible' },
        prerequisites: [],
        learning: 4,
        learningEnergy: P.studyEnergy,
        costs:
          'Study: 4 rounds, 0.2 energy each. extract: target your own whole untreated berry item; one unit per attempt (quantity 1): 1 round, 0.5 energy. inspect: x, y a site in reach and/or target your own item or a sowing patch in reach: 1 round, 0.2 energy. sow: target your seed lot; x, y a site in reach on open ordinary soil (.), moisture 0.3-1.2, waterlogging at most 0.1, 0.6 m clear of objects and people, fewer than 3 berry plants or patches being sown within 5 m. 2 rounds of 1 energy: loosen the patch, then place and cover the seeds; a loosened patch left by cancelled work needs only the second. pause, resume (workId), cancel: no energy. Refusals and failed rechecks cost nothing. No tool, vessel, water or soil is supplied.',
        effects:
          'A whole berry unit (0.2 kg, food 8) is crushed: 0.01 kg of seeds (5 %, no food, no ageing) and 0.19 kg of pulp with all its food and age; both keep origin, harvest round and decay. The seeds of one unit are the one propagule the plant rules give one fruit unit; viability is unknown until something emerges. A unit whose parent is not a living berry plant has no represented seed: a paid failure, all pulp. Sowing moves the seeds from your inventory into the patch record, covered 5 mm deep in soil loosened 0.03 m. The patch gains establishment only from actual temperature (none at 6 C or below, full from 20 C), light, soil moisture (full from 0.6) and season; cold, darkness, drought or waterlogging stall it. At 12 a rooted seedling appears with no fruit (stock at most 4, the parent plant interval); fruit grows only under the existing growth rule; anyone may gather it. Watering a rooted plant is rooted-plant-watering. An unworked round pauses; cancel returns unsown seeds once and leaves loosened soil; death leaves them where you died. No reward or refund.',
        handler: HANDLER,
        revision: REVISION,
        authored: false,
        // The sowing event carries no qualified flag: this operation earns no practice milestone.
        practiceEvidence: 'seed-propagation-sown',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'extract and inspect take one round; sowing is two paid one-round phases whose work, reserved seeds and patch persist; resume pays only the remaining phase after rechecks; rooting and growth run only in ordinary simulation.',
        },
      },
    ],
    handlers: { [HANDLER]: execute },
    processes: {},
    visualComponents: [VISUAL],
    events: [
      'seed-propagation-extracted',
      'seed-propagation-no-seed',
      'seed-propagation-inspected',
      'seed-propagation-prepared',
      'seed-propagation-sown',
      'seed-propagation-paused',
      'seed-propagation-resumed',
      'seed-propagation-cancelled',
      'seed-propagation-failed',
      'seed-propagation-established',
      'seed-propagation-first-fruit',
    ],
    resources: RESOURCES,
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        const lot = reserved(w, j);
        j.escrow = lot ? [lot.id] : [];
        j.x = a.position.x;
        j.y = a.position.y;
        workStop(
          w,
          a,
          j,
          'Performer died; unsown seeds stay where they died and loosened soil stays. Nothing is refunded.',
          true,
        );
        j.stage = 'failed';
        j.phase = 'done';
        j.endedAt = w.tick;
        release(w, j);
        forestEvent(
          w,
          'seed-propagation-failed',
          'Sowing ended by death; the unsown seeds lie where the person died and any loosened soil stays.',
          { x: j.x, y: j.y },
          a.id,
          { ...summary(w, j, { result: 'ended by death' }), cause: 'death' },
          j.id,
        );
        j.escrow = [];
        sync(a, j);
      }
    },
  };
}

/** ex23: Lin's propagation of a berry plant from seed. */
export const LONG_EX23_SEED_PROPAGATION = seedPropagationPackage('long-ex23');
