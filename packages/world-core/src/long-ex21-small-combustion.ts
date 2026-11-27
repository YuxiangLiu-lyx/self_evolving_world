import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Interior,
  v7Reach,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestResolveReference } from './forest-references.js';
import { OPEN_FOUNDATION, openRemember } from './open-foundation.js';
import { openConditions } from './open-physical.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  ex19MaterialContact,
  ex19MaterialGround,
  ex19MaterialPiece,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';
import { BURN, DRILL, HEAT, drillRound } from './long-thermal-physics.js';
import type { Drill } from './long-thermal-physics.js';
import {
  SMALL_FIRE,
  SMALL_FIRE_ABILITY,
  SMALL_FIRE_COVERS,
  SMALL_FIRE_COVER_MASS,
  SMALL_FIRE_EXPOSURE,
  SMALL_FIRE_ID,
  SMALL_FIRE_KIND,
  SMALL_FIRE_REVISION,
  isSmallFire,
  smallFireCombustible,
  smallFireComposition,
  smallFireConsume,
  smallFireCover,
  smallFireExposed,
  smallFireFuelMass,
  smallFireLot,
  smallFireLotMass,
  smallFireLotWater,
  smallFireOf,
  smallFireOffer,
  smallFireRod,
  smallFireRound,
  smallFireTinder,
  smallFireWaterShare,
  smallFireWear,
  smallFireWeather,
} from './long-ex21-small-combustion-physics.js';
import type {
  SmallFire,
  SmallFireCover,
  SmallFireLot,
} from './long-ex21-small-combustion-physics.js';

/** ex21: Wren's small controlled heat source. A person lays a small open fuel bed of real owned
 * fuel, lights it by two-piece hand friction or from an existing hot bed, feeds, inspects and
 * smothers it. A lit bed burns as an ordinary world process until fuel or air runs out, rain
 * douses it or a cover closes it; leaving or death never puts it out. */

const HANDLER = 'long.small-combustion-source';
const STATE = `long:work:${SMALL_FIRE_ABILITY}`;
const MODES = ['attempt-ignition', 'tend', 'inspect', 'extinguish'];
/** World Agent specification costs: an active friction round, tending, a hot-target ignition and
 * smothering; inspection reuses probe observe at its own 0.2 energy. */
const ATTEMPT = 1;
const TEND = 0.5;
const LOOK = 0.2;
const SMOTHER = 0.5;
const ROUNDS = 3;
/** A pre-ignition inspection of the bed and its surroundings counts for this many rounds. */
const INSPECTED = 10;
/** A brand is carried from a burning bed whose centre lies within this distance. */
const BRAND_REACH = 1;
const BRAND = 0.1;
const MAX_ROUNDS = 5;

interface Attempt extends CollectiveWork {
  drill: Drill;
  wear: V7Data[];
  rounds: V7Data[];
  vapour: number;
  dust: number;
}

const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const attempts = (w: V7World) =>
  collectiveJobs(w, SMALL_FIRE_ABILITY).map((j) => j as Attempt);
const resource = (w: V7World, id: string) =>
  w.resources.find((r) => r.id === id);
function sync(a: V7Actor, j: Attempt) {
  a.extensionState[STATE] = v7Json({
    id: j.id,
    mode: j.mode,
    status: j.status,
    target: j.target,
    rounds: j.drill.rounds,
    requested: j.initialWork,
    paidEnergy: j.paidEnergy,
    pieces: j.escrow,
    ...(j.outcome ? { outcome: j.outcome } : {}),
  });
}
function list(c: V7ActionContext, key: string): string[] {
  const v = c.action.args[key];
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}
function amount(c: V7ActionContext): number {
  const q =
    c.action.args.quantity === undefined
      ? 1
      : v7Number(c.action.args.quantity, 'quantity', 0.1);
  foodTenths(q);
  return q;
}
const units = (f: SmallFire, role: string) =>
  f.lots
    .filter((l) => (role === 'tinder') === (l.role === 'tinder'))
    .reduce((n, l) => n + l.quantity, 0);
const friction = (w: V7World, o: V7Object) =>
  attempts(w).find((j) => open(j) && j.target === o.id);

/** The bed footprint: a non-solid 0.2 m disc on the ground with the 0.65 m interaction reach. */
function bedSpatial(x: number, y: number): V7Spatial {
  return {
    x,
    y,
    angle: 0,
    shape: { kind: 'circle', radius: SMALL_FIRE.bedRadius },
    solid: false,
    interaction: SMALL_FIRE.reach,
    entrances: [],
  };
}
/** A new bed site: inside the world and in reach, firm ground at the centre and rim, open sky,
 * no solid object or other bed on the footprint and nobody standing on it. Exposed combustibles
 * nearby are allowed; inspection reports them and they may catch. */
function siteError(w: V7World, a: V7Actor, s: V7Spatial): string | null {
  const r = SMALL_FIRE.bedRadius;
  if (!v7Inside(w, s, r)) return 'The bed must lie inside the world.';
  if (!v7Reach(a, s))
    return 'Lay the bed within reach (0.65 m) of where you stand.';
  for (const p of [
    s,
    ...[0, 1, 2, 3].map((i) => ({
      x: s.x + r * Math.cos((i * Math.PI) / 2),
      y: s.y + r * Math.sin((i * Math.PI) / 2),
    })),
  ])
    if (
      ex19MaterialGround(w, p) ||
      openConditions(w, p).regime === 'saturated soil'
    )
      return 'The bed needs firm ground, not water, a wet bank, waterlogged or saturated soil.';
  if (
    forestClimate(w, s).indoor ||
    w.objects.some((o) => v7Interior(s, o.spatial))
  )
    return 'A fire bed needs open sky, not a roof or enclosure.';
  const block = w.objects.find(
    (o) =>
      (o.spatial.solid && v7ShapeDistance(s, o.spatial) < r) ||
      (isSmallFire(o) && v7Distance(s, o.spatial) < 2 * r),
  );
  if (block) return `${block.name} occupies the bed footprint.`;
  if (
    w.actors.some(
      (p) => p.vitals.health > 0 && v7Distance(p.position, s) < p.radius + r,
    )
  )
    return 'Nobody, including you, may stand on the bed footprint.';
  return null;
}

/** The exact visible bed of this operation within reach. */
function bed(c: V7ActionContext, own: boolean): V7Object {
  const id = text(c.action.args.target);
  if (!id) throw nothing('Name the target bed.');
  const o = c.world.objects.find((x) => x.id === id && isSmallFire(x));
  if (!o) throw nothing('Target a small fuel bed of this operation.');
  if (!v7Reach(c.actor, o.spatial))
    throw nothing('Move within reach (0.65 m) of the bed.');
  if (own && smallFireOf(o).builder !== c.actor.id)
    throw nothing(
      'Only the person who laid this bed may feed or light it; anyone in reach may inspect or smother it.',
    );
  return o;
}

/** Why a supplied item cannot be laid in the bed in this role, or null. Food is never fuel. */
function fuelError(w: V7World, s: V7Stack, role: string): string | null {
  const r = resource(w, s.resource);
  if (!r || r.nutrition > 0) return `${s.id} is food; food is never fuel here.`;
  if (s.componentLots || s.frictionKit || s.mantle || s.waterCup)
    return `${s.id} is equipment or a combined lot, not plain fuel.`;
  if (role === 'tinder' && !smallFireTinder(w, s.resource))
    return `${s.id} is not fine tinder (dry grass, bark, moss or reed).`;
  if (!smallFireCombustible(w, s.resource))
    return `${s.id} has no represented fuel value.`;
  return null;
}

/** Why a supplied piece cannot serve in two-piece hand friction, or null. Stone strikes give no
 * sparks in this world; only wood worked against wood heats a contact. */
function pieceError(
  w: V7World,
  a: V7Actor,
  s: V7Stack,
  role: string,
): string | null {
  const piece = ex19MaterialPiece(w, a, s);
  if (piece) return piece;
  const r = resource(w, s.resource);
  if (!r || (r.properties?.fuel ?? 0) < 7 || (r.properties?.hardness ?? 0) < 3)
    return `${s.id} is not a whole wood piece; stone gives no sparks here and other materials heat no friction contact.`;
  if ((r.properties?.flexibility ?? 10) > SMALL_FIRE.rigid)
    return `${s.id} bends (flexibility ${String(r.properties?.flexibility)}); a friction piece must be rigid.`;
  const contact = ex19MaterialContact(w, s);
  if (contact.fractured) return `${s.id} is fractured.`;
  const rod = smallFireRod(w, s);
  if (rod.length < SMALL_FIRE.lengthMin)
    return `${s.id} is ${String(rod.length)} m long; 0.3 m is needed to hold it.`;
  if (
    role === 'rubbing' &&
    (rod.diameter < SMALL_FIRE.gripMin || rod.diameter > SMALL_FIRE.gripMax)
  )
    return `${s.id} is ${String(rod.diameter)} m thick; a two-hand grip needs 0.015-0.05 m.`;
  if (role === 'base' && rod.diameter < SMALL_FIRE.baseMin)
    return `${s.id} is ${String(rod.diameter)} m thick; a base groove needs 0.03 m.`;
  return null;
}

/** Owned covering material: from the listed items in order, the tenths that reach 2.01 kg, or the
 * given quantity from each. */
function coverings(c: V7ActionContext, take: boolean) {
  const ids = list(c, 'extinguishingItemIds');
  if (!ids.length)
    throw nothing(
      `Name extinguishingItemIds: your own sand or clay totaling ${SMALL_FIRE_COVER_MASS.toFixed(2)} kg.`,
    );
  const given = take && c.action.args.quantity !== undefined;
  const q = given ? amount(c) : 0;
  let need = SMALL_FIRE_COVER_MASS;
  const out: { stack: V7Stack; quantity: number; mass: number }[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = forestResolveReference(c.world, c.actor, raw, 'owned', q);
    if (seen.has(id)) throw nothing('Duplicate extinguishing item.');
    seen.add(id);
    const s = c.world.stacks.find((x) => x.id === id);
    if (!s) throw nothing(`${raw} is not one of your items.`);
    if (!(SMALL_FIRE_COVERS as readonly string[]).includes(s.resource))
      throw nothing(
        `${s.id} is not sand or clay; only these close the bed to air here.`,
      );
    const unit = smallFireComposition(c.world, s).unitMass;
    const tenths = given
      ? foodTenths(q)
      : take
        ? Math.min(foodTenths(s.quantity), Math.ceil((need / unit) * 10 - 1e-9))
        : foodTenths(s.quantity);
    if (tenths <= 0) continue;
    out.push({ stack: s, quantity: tenths / 10, mass: (tenths / 10) * unit });
    need -= (tenths / 10) * unit;
  }
  const mass = out.reduce((n, x) => n + x.mass, 0);
  if (mass + 1e-9 < SMALL_FIRE_COVER_MASS)
    throw nothing(
      `Smothering this bed needs ${SMALL_FIRE_COVER_MASS.toFixed(2)} kg of sand or clay; the named items give ${String(round(mass))} kg.`,
    );
  return out;
}

/** Why the bed cannot be lit now, or null: present tinder and fuel, a recent inspection of the bed
 * and its surroundings, and an executable way to put it out that the person holds. */
function readiness(c: V7ActionContext, f: SmallFire): string | null {
  if (f.lit) return 'The bed is already burning.';
  if (f.covered) return 'The bed is smothered under its cover.';
  if (
    units(f, 'tinder') + 1e-9 < BURN.tinder ||
    units(f, 'fuel') + 1e-9 < BURN.kindling
  )
    return 'Lay at least 0.5 tinder and 0.5 other fuel on the bed with tend first.';
  if (
    !f.inspections.some(
      (i) =>
        i.actor === c.actor.id && c.world.tick - Number(i.tick) <= INSPECTED,
    )
  )
    return 'Inspect the bed and its surroundings within 10 rounds before lighting it.';
  coverings(c, false);
  return null;
}

/** Why the bed's tinder cannot take a flame now (local-fire@1 ignition limits), or null. */
function tinderError(f: SmallFire, rain: number, wind: number): string | null {
  const tinder = f.lots.filter((l) => l.role === 'tinder');
  const mass = tinder.reduce((n, l) => n + smallFireLotMass(l), 0),
    water = tinder.reduce((n, l) => n + l.quantity * l.unitWater, 0);
  const share = mass > 0 ? water / mass : 1;
  if (share > BURN.moisture)
    return `the tinder holds water share ${String(round(share))}, above 0.35`;
  if (rain > BURN.rain)
    return `rain ${String(round(rain))} above 0.15 wets the tinder`;
  if (wind > BURN.wind)
    return `wind ${String(round(wind))} above 0.65 scatters the tinder`;
  return null;
}

function stateOf(w: V7World, o: V7Object): string {
  const f = smallFireOf(o);
  if (f.lit)
    return f.burnFraction > 0 || f.litAt === w.tick ? 'burning' : 'embers';
  if (friction(w, o)) return 'friction';
  if (!f.ignitions) return 'laid';
  if (f.verifiedCold !== null) return 'cold-residue';
  return f.bed > f.air + SMALL_FIRE.cooled
    ? 'hot-remains'
    : 'cooling-unverified';
}
const LOOKS: Record<string, [string, string, string]> = {
  laid: ['#7a6a52', '#a89470', 'Unlit fuel bed'],
  friction: ['#7a6a52', '#c8bba0', 'Friction attempt, no fire'],
  burning: ['#c4562f', '#e39c3c', 'Small fire burning'],
  embers: ['#8c3b22', '#c4562f', 'Glowing embers'],
  'hot-remains': ['#6b5a4a', '#b75b38', 'Hot remains'],
  'cooling-unverified': ['#7d776c', '#a4a49a', 'Remains, cold not verified'],
  'cold-residue': ['#a4a49a', '#d4d6bd', 'Cold residue, verified'],
};
/** Reusable drawing metadata of actual state; flame, smoke and embers only with combustion. */
function refresh(w: V7World, o: V7Object) {
  const f = smallFireOf(o),
    state = stateOf(w, o),
    j = friction(w, o),
    look = LOOKS[state] ?? LOOKS.laid ?? ['#7a6a52', '#a89470', 'Fuel bed'];
  o.visual.state = state;
  o.visual.color = f.covered ? '#b9a77c' : look[0];
  o.visual.accent = look[1];
  o.visual.label = f.covered ? `Smothered: ${look[2]}` : look[2];
  o.data.mode = f.covered ? `smothered ${state}` : state;
  o.data.progress = j ? round(j.drill.rounds / j.initialWork) : 0;
  o.data.view = v7Json({
    component: SMALL_FIRE_KIND,
    source: o.id,
    builder: f.builder,
    x: o.spatial.x,
    y: o.spatial.y,
    footprint: SMALL_FIRE.bedRadius,
    hazardRadius: SMALL_FIRE_EXPOSURE,
    state,
    activeMode: j ? 'friction' : null,
    progress: j ? { rounds: j.drill.rounds, requested: j.initialWork } : null,
    frictionSmoke: j ? j.drill.last >= DRILL.smoke : false,
    flame: state === 'burning',
    flameIntensity: f.burnFraction,
    smoke: f.burnFraction > 0,
    ember: state === 'embers',
    covered: f.covered,
    fuelMass: round(smallFireFuelMass(f)),
    exposedTemperature: f.bed,
    residue: round(f.ledger.ash + f.ledger.dust),
    updatedAt: w.tick,
  });
}
function note(f: SmallFire, tick: number, entry: V7Data) {
  f.log = [...f.log, { tick, ...entry }].slice(-12);
}
function summary(o: V7Object): V7Data {
  const f = smallFireOf(o);
  return {
    source: o.id,
    tick: f.lastTick,
    view: o.data.view ?? null,
    fuel: f.lots.map((l) => ({
      item: l.item,
      resource: l.resource,
      role: l.role,
      quantity: l.quantity,
      waterShare: round(smallFireLotWater(l)),
    })),
  };
}

function newFire(a: V7Actor, tick: number, air: number): SmallFire {
  return {
    version: 1,
    builder: a.id,
    laidAt: tick,
    lit: false,
    litAt: null,
    embers: 0,
    burnFraction: 0,
    covered: false,
    coveredAt: null,
    covers: [],
    lots: [],
    bed: round(air),
    air: round(air),
    wind: 0,
    rain: 0,
    pool: 0,
    offered: 0,
    ledger: {
      laid: 0,
      caught: 0,
      rain: 0,
      ember: 0,
      burned: 0,
      ash: 0,
      exhaust: 0,
      vapour: 0,
      dust: 0,
      cover: 0,
      coverVapour: 0,
      brands: 0,
    },
    heat: {
      released: 0,
      vapour: 0,
      bed: 0,
      actors: 0,
      environment: 0,
      loss: 0,
      probes: 0,
      cover: 0,
    },
    ignitions: 0,
    failures: 0,
    inspections: [],
    verifiedCold: null,
    flameOutAt: null,
    // The first ordinary round after laying updates the bed like every later one.
    lastTick: -1,
    log: [],
  };
}

function tend(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const fuel = list(c, 'fuelItemIds'),
    tinder = list(c, 'tinderItemIds');
  if (!fuel.length && !tinder.length)
    throw nothing('Name fuelItemIds or tinderItemIds to lay on the bed.');
  const q = amount(c);
  const allocations = workAllocations(
    c,
    [...fuel, ...tinder].map((itemId) => ({ itemId, quantity: q })),
  );
  const roles = allocations.map((_, i) =>
    i < fuel.length ? 'fuel' : 'tinder',
  );
  allocations.forEach(({ stack }, i) => {
    const error = fuelError(w, stack, roles[i] ?? 'fuel');
    if (error) throw nothing(error);
  });
  const hasXY = c.action.args.x !== undefined || c.action.args.y !== undefined;
  let o: V7Object | undefined;
  let spatial: V7Spatial | null = null;
  if (text(c.action.args.target)) {
    if (hasXY)
      throw nothing('x and y only place a new bed; omit them to feed one.');
    o = bed(c, true);
    if (smallFireOf(o).covered)
      throw nothing(
        'The bed is smothered under its cover; lay a new bed elsewhere.',
      );
  } else {
    spatial = bedSpatial(
      v7Number(c.action.args.x, 'bed x'),
      v7Number(c.action.args.y, 'bed y'),
    );
    const error = siteError(w, a, spatial);
    if (error) throw nothing(error);
  }
  const lots: SmallFireLot[] = allocations.map(({ stack, quantity }, i) =>
    smallFireLot(
      w,
      {
        item: stack.id,
        resource: stack.resource,
        origin: stack.origin,
        role: roles[i] ?? 'fuel',
      },
      quantity,
      smallFireComposition(w, stack),
    ),
  );
  const added = lots.reduce((n, l) => n + smallFireLotMass(l), 0);
  const present = o ? smallFireFuelMass(smallFireOf(o)) : 0;
  if (present + added > SMALL_FIRE.capacity + 1e-9)
    throw nothing(
      `The 0.2 m bed holds ${String(SMALL_FIRE.capacity)} kg of fuel; it has ${String(round(present))} kg and you add ${String(round(added))} kg.`,
    );
  if (a.vitals.energy + 1e-9 < TEND) throw nothing('Tending needs 0.5 energy.');
  v7Spend(a, TEND);
  for (const { stack, quantity } of allocations)
    foodSetQuantity(stack, foodTenths(stack.quantity) - foodTenths(quantity));
  if (!o && spatial) {
    const air = smallFireWeather(w, spatial).temperature;
    o = {
      id: v7Id(w, 'small-fire'),
      kind: SMALL_FIRE_KIND,
      name: 'Small fuel bed',
      spatial,
      visual: {
        component: SMALL_FIRE_KIND,
        color: '#7a6a52',
        accent: '#a89470',
        label: 'Unlit fuel bed',
        state: 'laid',
      },
      data: { fire: newFire(a, w.tick, air), availableHeat: 0 },
      // Observers see only the public mode and progress; readings come from inspection.
      createdBy: null,
      createdAt: w.tick,
      revision: SMALL_FIRE_REVISION,
    };
    w.objects.push(o);
  }
  if (!o) throw new Error('Missing bed.');
  const f = smallFireOf(o);
  const laid = spatial !== null;
  f.lots.push(...lots);
  f.ledger.laid = round(f.ledger.laid + added);
  note(f, w.tick, {
    type: laid ? 'laid' : 'fed',
    actor: a.id,
    mass: round(added),
  });
  smallFireOffer(o);
  refresh(w, o);
  c.emit(
    laid ? 'small-fire-bed-laid' : 'small-fire-fed',
    laid
      ? 'Your fuel and tinder were laid in a 0.2 m bed on the ground. Nothing burns until it is lit.'
      : `Your fuel was added to the bed${f.lit ? '; it burns only as the fire reaches it' : ''}.`,
    {
      ...summary(o),
      inputs: lots.map((l) => ({
        item: l.item,
        resource: l.resource,
        role: l.role,
        quantity: l.quantity,
        mass: round(smallFireLotMass(l)),
        waterShare: round(smallFireLotWater(l)),
      })),
      energy: TEND,
    },
    o.id,
  );
  return {
    complete: true,
    writes: [o.id, ...allocations.map((x) => x.stack.id)],
  };
}

/** What a person can perceive and read at the bed; the temperature is a hand-held reading. */
function observation(w: V7World, o: V7Object, a: V7Actor): V7Data {
  const f = smallFireOf(o),
    wx = smallFireWeather(w, o.spatial),
    exposed = smallFireExposed(w, o);
  return {
    source: o.id,
    state: stateOf(w, o),
    flame: f.burnFraction > 0 && f.lit,
    smoke: f.burnFraction > 0,
    embers: f.lit && f.burnFraction <= 0,
    covered: f.covered,
    bedTemperature: {
      reading: round(Math.round(f.bed * 10) / 10),
      uncertainty: round(Math.max(5, Math.abs(f.bed) * 0.1)),
      air: round(wx.temperature),
    },
    fuel: f.lots.map((l) => ({
      resource: l.resource,
      role: l.role,
      quantity: round(l.quantity),
      waterShare: round(smallFireLotWater(l)),
    })),
    ready:
      units(f, 'tinder') + 1e-9 >= BURN.tinder &&
      units(f, 'fuel') + 1e-9 >= BURN.kindling,
    weather: { rain: round(wx.rain), wind: round(wx.wind) },
    exposed: {
      radius: SMALL_FIRE_EXPOSURE,
      items: exposed.items.map((s) => s.id),
      objects: exposed.objects.map((x) => x.id),
    },
    people: w.actors
      .filter(
        (p) =>
          p.vitals.health > 0 &&
          v7Distance(p.position, o.spatial) < SMALL_FIRE.warmthRange,
      )
      .map((p) => p.id),
    smother: { materials: [...SMALL_FIRE_COVERS], mass: SMALL_FIRE_COVER_MASS },
    burned: f.ledger.burned,
    ash: f.ledger.ash,
    releasedMJ: round(f.heat.released / 1e6),
    by: a.id,
  };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const o = bed(c, false),
    f = smallFireOf(o);
  if (a.vitals.energy + 1e-9 < LOOK)
    throw nothing('Inspection reuses probe observe and needs 0.2 energy.');
  const probe = OPEN_FOUNDATION.handlers['open.probe'];
  if (!probe) throw new Error('Missing baseline probe.');
  // The reused probe observation: one round and its own 0.2 energy; no fee is added.
  probe({
    ...c,
    action: {
      interface: c.action.interface,
      args: { target: o.id, mode: 'observe', intensity: 0 },
    },
  });
  const value = observation(w, o, a);
  const near = smallFireExposed(w, o),
    exposed = near.items.length + near.objects.length;
  f.inspections = [...f.inspections, { actor: a.id, tick: w.tick }].slice(-6);
  const cold =
    !f.lit &&
    f.ignitions > 0 &&
    f.verifiedCold === null &&
    f.bed <= f.air + SMALL_FIRE.cooled;
  if (cold) f.verifiedCold = w.tick;
  openRemember(c, {
    key: `${o.id}:small-fire-inspection`,
    subject: o.id,
    property: 'small fuel bed condition',
    value,
    method: 'direct observation and a hand-held temperature reading at the bed',
    condition: openConditions(w, o.spatial).regime,
    verified: false,
  });
  refresh(w, o);
  c.emit(
    'small-fire-inspected',
    `The bed was inspected: ${stateOf(w, o)}, bed reading ${f.bed.toFixed(1)} C (air ${String(round(f.air))} C), ${String(exposed)} exposed combustible within 0.45 m. A reading is not a safety guarantee.`,
    { ...summary(o), observation: value, energy: LOOK },
    o.id,
  );
  if (cold)
    c.emit(
      'small-fire-cooled',
      'No combustion and a bed reading within 5 C of the air: the remains were verified cold.',
      { ...summary(o), reading: f.bed, air: f.air },
      o.id,
    );
  return { complete: true, writes: [o.id] };
}

/** Lights the bed: the ember or brand takes in dry tinder and a first flame burns 0.1 of it. */
function kindle(
  c: V7ActionContext,
  o: V7Object,
  mode: string,
  extra: V7Data,
): void {
  const f = smallFireOf(o);
  const first = f.lots.find((l) => l.role === 'tinder');
  const flame = smallFireConsume(
    f,
    DRILL.tinderBurn * (first?.energy ?? 0),
    true,
  );
  f.heat.released = round(f.heat.released + flame.joules);
  f.heat.vapour = round(f.heat.vapour + flame.vapourHeat);
  f.heat.environment = round(
    f.heat.environment + flame.joules - flame.vapourHeat,
  );
  f.lit = true;
  f.embers = BURN.embers;
  f.litAt = c.world.tick;
  f.flameOutAt = null;
  f.verifiedCold = null;
  f.ignitions += 1;
  note(f, c.world.tick, { type: 'ignited', mode, actor: c.actor.id });
  refresh(c.world, o);
  c.emit(
    'small-fire-ignited',
    'The tinder caught and a small flame rose: the bed is burning on its own present fuel. It burns until fuel or air runs out, rain douses it or it is smothered.',
    { ...summary(o), mode, firstFlame: flame.consumed, ...extra },
    o.id,
  );
}

/** Writes the worn mass (per whole unit) onto the returned pieces, ends the attempt once and
 * releases them. */
function settle(
  w: V7World,
  a: V7Actor,
  j: Attempt,
  status: string,
  reason: string,
  ground: boolean,
) {
  j.escrow.forEach((id, i) => {
    const s = w.stacks.find((x) => x.id === id);
    if (!s) return;
    const old = smallFireWear(s),
      worn = Number(j.wear[i]?.worn ?? 0);
    s.processing = {
      ...s.processing,
      smallFireFriction: {
        role: i === 0 ? 'rubbing' : 'base',
        groove: i === 1 ? round(j.drill.socket) : Number(old?.groove ?? 0),
        worn: round(Number(old?.worn ?? 0) + worn),
        attempts: Number(old?.attempts ?? 0) + 1,
      },
    };
  });
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  j.status = status;
  j.outcome = {
    status,
    reason,
    rounds: j.drill.rounds,
    peak: round(j.drill.peak),
  };
  sync(a, j);
}

function failed(
  c: V7ActionContext,
  j: Attempt,
  o: V7Object | undefined,
  reason: string,
): V7HandlerResult {
  if (o) {
    const f = smallFireOf(o);
    f.failures += 1;
    f.ledger.dust = round(f.ledger.dust + j.drill.dust);
    note(f, c.world.tick, {
      type: 'friction-failed',
      rounds: j.drill.rounds,
    });
  }
  j.dust = round(j.dust + j.drill.dust);
  j.drill.dust = 0;
  settle(c.world, c.actor, j, 'failed', reason, false);
  if (o) refresh(c.world, o);
  c.emit(
    'small-fire-ignition-failed',
    `${reason} The pieces return worn; their dust stays in the bed; no fire exists. Spent energy is not refunded.`,
    {
      ...(o ? summary(o) : {}),
      mode: 'friction',
      attempt: j.id,
      measurements: v7Json(j.rounds),
      peak: round(j.drill.peak),
      groove: round(j.drill.socket),
      paidEnergy: j.paidEnergy,
    },
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** Wears one piece by `mass` kg: its solids become dust, its water leaves as vapour. */
function wearPiece(
  w: V7World,
  j: Attempt,
  i: number,
  s: V7Stack,
  mass: number,
) {
  const share = smallFireWaterShare(w, s);
  const entry = j.wear[i] ?? { worn: 0 };
  entry.worn = round(Number(entry.worn) + mass);
  j.wear[i] = entry;
  j.vapour = round(j.vapour + mass * share);
  return { solids: mass * (1 - share), water: mass * share };
}

function rubbing(c: V7ActionContext, j: Attempt): V7HandlerResult {
  const { world: w, actor: a } = c;
  const o = w.objects.find((x) => x.id === j.target && isSmallFire(x));
  if (!o) return failed(c, j, undefined, 'The bed is gone.');
  const f = smallFireOf(o);
  const stop = (why: string): V7HandlerResult => {
    j.dust = round(j.dust + j.drill.dust);
    f.ledger.dust = round(f.ledger.dust + j.drill.dust);
    j.drill.dust = 0;
    settle(w, a, j, 'interrupted', why, false);
    refresh(w, o);
    c.emit(
      'small-fire-friction-ended',
      `${why} The attempt ended without charge this round; the groove stays, the contact heat does not.`,
      { ...summary(o), attempt: j.id, paidEnergy: j.paidEnergy },
      o.id,
    );
    return { complete: true, writes: [j.id, ...j.escrow] };
  };
  if (f.lit || f.covered) return stop('The bed is already burning or covered.');
  if (!v7Reach(a, o.spatial)) return stop('You are out of reach of the bed.');
  if (a.vitals.energy + 1e-9 < ATTEMPT)
    return stop('Not enough energy for another worked round.');
  const pieces = j.escrow.map((id) =>
    w.stacks.find((s) => s.id === id && s.reservedFor === j.id),
  );
  const [rub, base] = pieces;
  if (!rub || !base) return failed(c, j, o, 'A reserved piece is gone.');
  if (!workPay(c, j, ATTEMPT))
    return stop('Not enough energy for another worked round.');
  a.vitals.energy = round(Math.max(0, a.vitals.energy));
  j.paidEnergy = round(j.paidEnergy);
  const wx = smallFireWeather(w, o.spatial);
  const water = Math.max(
    smallFireWaterShare(w, rub),
    smallFireWaterShare(w, base),
  );
  const r = drillRound(j.drill, water, wx);
  const worn = [
    wearPiece(w, j, 0, rub, DRILL.spindleWear),
    wearPiece(w, j, 1, base, DRILL.boardWear),
  ];
  // drillRound counts the worn fresh mass as dust; the dust keeps only the worn dry solids, the
  // worn water leaves as vapour.
  j.drill.dust = round(
    j.drill.dust -
      DRILL.boardWear -
      DRILL.spindleWear +
      worn.reduce((n, x) => n + x.solids, 0),
  );
  const work = ATTEMPT * SMALL_FIRE.workPerEnergy,
    vapourHeat = worn.reduce((n, x) => n + x.water, 0) * HEAT.latent,
    dustHeat = Math.min(
      work - vapourHeat,
      j.drill.dust * HEAT.solidHeat * Math.max(0, r.peak - wx.temperature),
    );
  const measured = {
    round: j.drill.rounds,
    peak: round(r.peak),
    contact: round(r.contact),
    dryness: round(r.dryness),
    waterShare: round(water),
    air: round(wx.temperature),
    wind: round(wx.wind),
    smoke: r.smoke,
    dust: round(j.drill.dust),
    groove: round(j.drill.socket),
    workJoules: work,
    vapourJoules: round(vapourHeat),
    dustJoules: round(dustHeat),
    lostJoules: round(work - vapourHeat - dustHeat),
  };
  j.rounds = [...j.rounds, measured].slice(-5);
  refresh(w, o);
  c.emit(
    'small-fire-friction-worked',
    r.smoke
      ? 'One worked round of rubbing: the groove deepened and the dust smoked.'
      : 'One worked round of rubbing: the groove deepened and dust collected without smoke.',
    {
      ...summary(o),
      attempt: j.id,
      rubbing: rub.id,
      base: base.id,
      measured,
      energy: ATTEMPT,
    },
    o.id,
  );
  // An ember needs the represented 350 C at the contact with 2 g of dry dust.
  const ember = r.peak >= DRILL.ember && j.drill.dust >= DRILL.dust - 1e-9;
  if (ember) {
    j.drill.embers += 1;
    c.emit(
      'small-fire-ember-formed',
      'Hot dust at the end of the groove began to glow and was tipped into the tinder.',
      {
        ...summary(o),
        attempt: j.id,
        dust: round(j.drill.dust),
        peak: round(r.peak),
      },
      o.id,
    );
    const why = tinderError(f, wx.rain, wx.wind);
    const dust = j.drill.dust;
    j.drill.dust = 0;
    if (!why) {
      f.ledger.ember = round(f.ledger.ember + dust);
      f.ledger.burned = round(f.ledger.burned + dust);
      f.ledger.ash = round(f.ledger.ash + dust * BURN.ash);
      f.ledger.exhaust = round(f.ledger.exhaust + dust * (1 - BURN.ash));
      settle(
        w,
        a,
        j,
        'completed',
        'The tinder caught; the pieces were returned worn.',
        false,
      );
      kindle(c, o, 'friction', {
        attempt: j.id,
        rounds: j.drill.rounds,
        emberDust: round(dust),
      });
      return { complete: true, writes: [j.id, o.id, ...j.escrow] };
    }
    j.dust = round(j.dust + dust);
    f.ledger.dust = round(f.ledger.dust + dust);
    c.emit(
      'small-fire-ember-died',
      `The ember died in the tinder: ${why}.`,
      { ...summary(o), attempt: j.id, reason: why },
      o.id,
    );
  }
  if (j.drill.rounds >= j.initialWork) {
    const reasons = [
      `contact heat peaked near ${String(Math.round(j.drill.peak))} C`,
      ...(j.drill.peak < DRILL.ember ? ['below the 350 C an ember needs'] : []),
      ...(water > 0
        ? [
            `the pieces hold water share ${String(round(water))}${water >= BURN.moisture ? ', at or above 0.35, so their water takes the heat' : ''}`,
          ]
        : []),
      ...(j.drill.embers
        ? ['an ember formed but the tinder did not take it']
        : []),
    ];
    return failed(
      c,
      j,
      o,
      `No flame in ${String(j.drill.rounds)} worked rounds: ${reasons.join('; ')}.`,
    );
  }
  j.remainingWork = j.initialWork - j.drill.rounds;
  sync(a, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, o.id, ...j.escrow],
  };
}

function frictionStart(c: V7ActionContext, o: V7Object): V7HandlerResult {
  const { world: w, actor: a } = c;
  const ids = list(c, 'toolItemIds');
  if (ids.length !== 2)
    throw nothing('toolItemIds: name the rubbing piece, then the base piece.');
  const same = ids[0] === ids[1];
  const allocations = same
    ? workAllocations(c, [{ itemId: ids[0], quantity: 2 }])
    : workAllocations(
        c,
        ids.map((itemId) => ({ itemId, quantity: 1 })),
      );
  const pieces = same
    ? [allocations[0], allocations[0]].map(
        (x) => x && { stack: x.stack, quantity: 1 },
      )
    : allocations;
  const [rub, base] = pieces;
  if (!rub || !base) throw nothing('Two whole pieces are required.');
  if (same && ex19MaterialWhole(rub.stack) < 2)
    throw nothing(`${rub.stack.id} holds fewer than two whole pieces.`);
  for (const [role, p] of [
    ['rubbing', rub],
    ['base', base],
  ] as const) {
    const error = pieceError(w, a, p.stack, role);
    if (error) throw nothing(error);
  }
  const hard = (s: V7Stack) =>
    resource(w, s.resource)?.properties?.hardness ?? 0;
  if (hard(rub.stack) < hard(base.stack))
    throw nothing(
      'The rubbing piece must be at least as hard as the base; name the harder piece first.',
    );
  const rounds =
    c.action.args.durationRounds === undefined
      ? ROUNDS
      : v7Number(c.action.args.durationRounds, 'durationRounds', 1, MAX_ROUNDS);
  if (!Number.isSafeInteger(rounds))
    throw nothing('durationRounds must be 1 to 5.');
  if (a.vitals.energy + 1e-9 < ATTEMPT)
    throw nothing('A worked friction round needs 1 energy.');
  const j = workCreate(c, 'friction', rounds) as Attempt;
  j.target = o.id;
  const groove = Number(smallFireWear(base.stack)?.groove ?? 0);
  j.drill = {
    stage: 'friction',
    rounds: 0,
    streak: 0,
    socket: groove,
    dust: 0,
    last: 0,
    peak: 0,
    boardWear: 0,
    spindleWear: 0,
    charred: 0,
    embers: 0,
  };
  j.wear = [{ worn: 0 }, { worn: 0 }];
  j.rounds = [];
  j.vapour = 0;
  j.dust = 0;
  workReserve(c, j, [rub, base]);
  return rubbing(c, j);
}

function hotTarget(c: V7ActionContext, o: V7Object): V7HandlerResult {
  const { world: w, actor: a } = c;
  const f = smallFireOf(o);
  const centre = { x: o.spatial.x, y: o.spatial.y };
  const donor = w.objects
    .filter((x) => {
      if (x.id === o.id || !isSmallFire(x)) return false;
      const d = smallFireOf(x);
      return (
        d.builder === a.id &&
        d.lit &&
        !d.covered &&
        d.burnFraction > 0 &&
        v7Reach(a, x.spatial) &&
        v7Distance(x.spatial, centre) <= BRAND_REACH &&
        d.lots.some((l) => l.role === 'fuel' && l.quantity >= BRAND - 1e-9)
      );
    })
    .sort(
      (x, y) =>
        v7Distance(x.spatial, centre) - v7Distance(y.spatial, centre) ||
        x.id.localeCompare(y.id),
    )[0];
  const retained = f.bed >= SMALL_FIRE.hotIgnition;
  if (!retained && !donor)
    throw nothing(
      'No hot physical target exists: the bed is below 300 C and none of your burning beds lies within 1 m of it and your reach.',
    );
  if (a.vitals.energy + 1e-9 < TEND)
    throw nothing('A hot-target ignition needs 0.5 energy.');
  v7Spend(a, TEND);
  let brand: V7Data | null = null;
  if (!retained && donor) {
    const d = smallFireOf(donor);
    const lot = d.lots.find(
      (l) => l.role === 'fuel' && l.quantity >= BRAND - 1e-9,
    );
    if (!lot) throw new Error('Missing brand.');
    lot.quantity = round(lot.quantity - BRAND);
    d.lots = d.lots.filter((l) => l.quantity > 1e-8);
    const moved: SmallFireLot = {
      ...v7Clone(lot),
      quantity: BRAND,
      joinedAt: w.tick,
    };
    const mass = smallFireLotMass(moved);
    d.ledger.brands = round(d.ledger.brands + mass);
    f.lots.push(moved);
    f.ledger.laid = round(f.ledger.laid + mass);
    brand = {
      from: donor.id,
      item: lot.item,
      resource: lot.resource,
      quantity: BRAND,
      mass: round(mass),
    };
    smallFireOffer(donor);
    refresh(w, donor);
  }
  const wx = smallFireWeather(w, o.spatial);
  const why = tinderError(f, wx.rain, wx.wind);
  const extra = {
    hotTarget: retained
      ? { kind: 'retained bed heat', temperature: f.bed }
      : { kind: 'brand', ...brand },
    energy: TEND,
  };
  if (!why) {
    kindle(c, o, 'hot-target', extra);
    return { complete: true, writes: [o.id, ...(donor ? [donor.id] : [])] };
  }
  f.failures += 1;
  note(f, w.tick, { type: 'hot-target-failed', reason: why });
  refresh(w, o);
  c.emit(
    'small-fire-ignition-failed',
    `The tinder did not take the heat: ${why}. ${brand ? 'The brand lies unlit in the bed. ' : ''}Spent energy is not refunded.`,
    { ...summary(o), mode: 'hot-target', reason: why, ...extra },
    o.id,
  );
  return { complete: true, writes: [o.id, ...(donor ? [donor.id] : [])] };
}

function ignite(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c) as Attempt | undefined;
  if (existing && open(existing)) {
    if (existing.target !== text(c.action.args.target))
      throw nothing(
        `Your friction attempt on ${String(existing.target)} is still open; it ends unless worked this round.`,
      );
    return rubbing(c, existing);
  }
  if (c.operation?.first === false)
    throw new Error('The bound ignition attempt is already settled.');
  const mode = text(c.action.args.ignitionMode) || 'friction';
  const o = bed(c, true);
  const error = readiness(c, smallFireOf(o));
  if (error) throw nothing(error);
  if (mode === 'hot-target') return hotTarget(c, o);
  if (mode !== 'friction')
    throw nothing('ignitionMode is friction or hot-target.');
  return frictionStart(c, o);
}

function extinguish(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const o = bed(c, false),
    f = smallFireOf(o);
  if (f.covered) throw nothing('The bed is already smothered under a cover.');
  if (!f.lit && f.bed <= f.air + SMALL_FIRE.cooled)
    throw nothing('Nothing is burning or hot in this bed.');
  const taken = coverings(c, true);
  if (a.vitals.energy + 1e-9 < SMOTHER)
    throw nothing('Smothering needs 0.5 energy.');
  v7Spend(a, SMOTHER);
  const covers: SmallFireCover[] = taken.map(({ stack, quantity }) => {
    const unit = smallFireComposition(w, stack);
    foodSetQuantity(stack, foodTenths(stack.quantity) - foodTenths(quantity));
    return {
      item: stack.id,
      resource: stack.resource,
      origin: stack.origin,
      quantity,
      mass: round(quantity * unit.unitMass),
      water: round(quantity * unit.unitWater),
    };
  });
  const burning = f.lit;
  smallFireCover(f, covers);
  f.coveredAt = w.tick;
  f.flameOutAt = w.tick;
  note(f, w.tick, { type: 'smothered', actor: a.id });
  smallFireOffer(o);
  refresh(w, o);
  c.emit(
    'small-fire-smothered',
    `The bed was covered with ${String(round(covers.reduce((n, x) => n + x.mass, 0)))} kg of ${covers.map((x) => x.resource).join(' and ')}: no combustion; residual bed reading ${f.bed.toFixed(1)} C (air ${String(round(f.air))} C)${f.bed > f.air + SMALL_FIRE.cooled ? ', still hot under the cover' : ''}. Unburned fuel stays under it.`,
    {
      ...summary(o),
      combustionAbsent: true,
      wasBurning: burning,
      residualTemperature: f.bed,
      air: f.air,
      hot: f.bed > f.air + SMALL_FIRE.cooled,
      cover: v7Json(covers),
      energy: SMOTHER,
    },
    o.id,
  );
  return { complete: true, writes: [o.id, ...taken.map((x) => x.stack.id)] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode);
  if (mode === 'attempt-ignition') return ignite(c);
  if (mode === 'tend') return tend(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'extinguish') return extinguish(c);
  throw nothing('Unknown mode.');
}

/** Ordinary simulation: unworked friction attempts end, then every bed burns, cools and catches. */
function environment(w: V7World) {
  for (const j of attempts(w).filter(open)) {
    const a = w.actors.find((x) => x.id === j.owner);
    if (!a) continue;
    for (const id of j.escrow) {
      const s = w.stacks.find((x) => x.id === id && x.reservedFor === j.id);
      if (s) s.position = { ...a.position };
    }
    if (j.lastPaid >= w.tick) continue;
    const o = w.objects.find((x) => x.id === j.target && isSmallFire(x));
    if (o) {
      smallFireOf(o).ledger.dust = round(
        smallFireOf(o).ledger.dust + j.drill.dust,
      );
    }
    j.dust = round(j.dust + j.drill.dust);
    j.drill.dust = 0;
    settle(
      w,
      a,
      j,
      'interrupted',
      'Not worked this round; the contact cooled and the attempt ended. The groove stays.',
      false,
    );
    forestEvent(
      w,
      'small-fire-friction-ended',
      'An unworked friction attempt ended; the pieces were returned worn and no fire exists.',
      a.position,
      a.id,
      { attempt: j.id, source: j.target, paidEnergy: j.paidEnergy },
      j.target,
    );
  }
  for (const o of w.objects.filter(isSmallFire)) {
    smallFireRound(w, o);
    refresh(w, o);
  }
}

export const LONG_EX21_SMALL_COMBUSTION: V7Package = {
  id: SMALL_FIRE_ID,
  version: 1,
  scope: 'long-ex21',
  dependencies: ['foundation-open@1'],
  description:
    'A general small open combustion source: a 0.2 m bed of owned fuel on open firm ground, lit by two-piece wood friction or from an existing hot bed, fed, inspected and smothered with sand or clay, with a mass and heat ledger, open-air burning, warmth for nearby people, burns on the bed and catching of exposed combustibles.',
  reuse: {
    experiment:
      'local-fire@1 (open-air burn rule, ash, embers, rain dousing, wetting and burning-fuel drying, ignition limits, tinder and kindling minimums, warmth law), ex17 hearth-food-preparation@1 (friction contact law and coefficients, ember transfer, rim catching rule, thermal round, fuel heat, bed values), ex19 material checks; local-fire@1 itself is not installable here (unscoped, needs active-warming@1 and the thermal-refuge reward, and has no friction geometry, material smothering or hazard rules)',
    source:
      'long-thermal-physics.ts (BURN, DRILL, HEAT, drillRound); long-ex19-material-contact.ts (ex19MaterialPiece, ex19MaterialContact, ex19MaterialGround, ex19MaterialWhole); collective-work.ts; open-foundation.ts (open.probe observe, openRemember); forest-environment.ts physiology (warmth and burns, gated by this revision); base gather, pickup, navigate and learn as separate actions',
    description:
      'Implementation reuse only; no fire, fuel, tool or mastery is granted. Geometry, the energy conversion, bed shares, cover mass and burn rate are declared modeling values.',
  },
  abilities: [
    {
      id: SMALL_FIRE_ABILITY,
      name: 'Operate small combustion source',
      function:
        'Lay a small open fuel bed of your own fuel, light it by hand friction or from a hot bed, feed, inspect or smother it; it burns on its own until fuel or air runs out.',
      equivalence: 'heat:small-open-bed:friction-or-hot-target:smother:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: MODES },
          target: { type: 'string' },
          fuelItemIds: { type: 'array', items: { type: 'string' } },
          tinderItemIds: { type: 'array', items: { type: 'string' } },
          ignitionMode: { type: 'string', enum: ['friction', 'hot-target'] },
          toolItemIds: { type: 'array', items: { type: 'string' } },
          quantity: { type: 'number', minimum: 0.1 },
          durationRounds: { type: 'integer', minimum: 1, maximum: 5 },
          extinguishingItemIds: { type: 'array', items: { type: 'string' } },
          x: { type: 'number' },
          y: { type: 'number' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 4,
      costs:
        'Study 4 rounds. Beds are in reach within 0.65 m. tend, 1 round, 0.5 energy: with x,y lays a new 0.2 m bed (firm open ground, footprint clear, nobody on it), else feeds your own bed; takes quantity (default 1) from each own fuelItemIds item (inedible with fuel value) and tinderItemIds item (dry grass, bark, moss, reed); holds 1.6 kg. inspect: anyone, 1 round, 0.2 energy via probe observe. attempt-ignition on your unlit bed with 0.5 tinder and 0.5 fuel, inspected by you within 10 rounds, while you hold sand or clay totaling 2.01 kg named in extinguishingItemIds: friction, toolItemIds rubbing then base piece, whole rigid wood units at least 0.3 m long, rubbing 1.5-5 cm thick and not softer, base 3 cm+, durationRounds 1-5 (default 3) at 1 energy per worked round; hot-target, 1 round, 0.5 energy, from the bed at 300 C+ or a brand from your burning bed within 1 m. extinguish: anyone, 1 round, 0.5 energy plus 2.01 kg of your listed sand or clay (or quantity from each). Failed checks spend nothing.',
      effects:
        'Water share is the represented one (branch 0.5, dry grass 0.4); only burning fuel dries. Friction: 1 energy = 21.6 kJ; contact reaches air+15(n-1)+contact*dryness*500/(1+0.5wind) C, dryness 1-water/0.35, contact rising as the groove wears; 350 C with 2 g dust forms an ember, which lights tinder of water <=0.35 at rain <=0.15 and wind <=0.65; wear 2 g a round. Fire: up to 1 fuel unit (2 MJ) a round times (1-water), 10% ash, embers 3 rounds, rain >0.6 douses, rain wets fuel +0.08*rain; burning fuel dries 0.08 a round; leaving or death never stops it. A fifth of the heat holds the bed, a tenth reaches people: within 2 m +0.6*burn*(1-d/2)*(1-0.5wind) degrees; on the bed -5*burn health; loose fuel and combustible stock within 0.45 m catch; probes in reach draw stored heat. Smothering closes air; the bed cools; inspect reads it. No cooking, safety or reward.',
      handler: HANDLER,
      revision: SMALL_FIRE_REVISION,
      authored: false,
      // The ignition event carries no qualified flag: lighting earns no practice milestone.
      practiceEvidence: 'small-fire-ignited',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Friction is worked and paid round by round up to durationRounds; an unworked round, lost reach or energy ends it, returning the worn pieces. Other modes take one round. Beds burn and cool every round unattended.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    'small-fire-bed-laid',
    'small-fire-fed',
    'small-fire-inspected',
    'small-fire-cooled',
    'small-fire-friction-worked',
    'small-fire-friction-ended',
    'small-fire-ember-formed',
    'small-fire-ember-died',
    'small-fire-ignition-failed',
    'small-fire-ignited',
    'small-fire-burned',
    'small-fire-spread',
    'small-fire-doused',
    'small-fire-flame-out',
    'small-fire-smothered',
    'small-fire-heat-received',
    'small-fire-actor-burned',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of attempts(w).filter((j) => j.owner === a.id && open(j))) {
      const o = w.objects.find((x) => x.id === j.target && isSmallFire(x));
      if (o)
        smallFireOf(o).ledger.dust = round(
          smallFireOf(o).ledger.dust + j.drill.dust,
        );
      j.dust = round(j.dust + j.drill.dust);
      j.drill.dust = 0;
      settle(
        w,
        a,
        j,
        'interrupted',
        'Performer died; the pieces lie where they died. Any fire stays.',
        true,
      );
      forestEvent(
        w,
        'small-fire-friction-ended',
        'Friction stopped by death; the pieces lie where the person died.',
        a.position,
        a.id,
        { attempt: j.id, source: j.target },
        j.target,
      );
    }
  },
};
