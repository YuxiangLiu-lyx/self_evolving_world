import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  foodSetQuantity,
  foodTenths,
  foodUnitMass,
} from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_RESOURCES } from './forest-foundation.js';
import { materialPortion } from './material-lots.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
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
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialGround,
  ex19MaterialPiece,
} from './long-ex19-material-contact.js';
import {
  HAZELNUT_COMPOSITION,
  SAMPLE_OPENING_LAWS,
} from './long-ex20-sample-opening.js';
import type { EnclosedComposition } from './long-ex20-sample-opening.js';

/** A general cracking and separation of an owned hard casing in work blocks of 0.1 unit: each
 * cracking round is one controlled impact of an own hard blunt striker on the block resting on
 * a stable support, under the ex17/ex19/ex20 compression law; each separation round takes the
 * loose casing of an opened block off by hand. Products are exact tenths of part materials
 * whose unit is that part of one whole source unit, so every block partitions exactly. */

/** Work block: one tenth, the engine's material quantum; one job takes at most one unit. */
const BLOCK = 1;
const JOB = 10;
/** One cracking round: 1 energy; one separation round: 0.5 energy (World Agent specification). */
const CRACK = 1;
const SEPARATE = 0.5;
/** Processing key of material cracked, opened or produced by this operation. */
const KEY = 'casingCracking';
/** Wear record on a striker or support item. */
const WEAR_KEY = 'casingImpactWear';
/** Mass one abrasive contact detaches: the open-hardness-physics scratchStroke dust quantum. */
const ABRASION = 0.0001;
/** A surface harder by this margin marks the other without wearing (scratchStroke groove rule). */
const MARGIN = 0.5;
/** Contacts per impact a surface can be abraded in: against the casing and, after a fracture,
 * the striker following through onto the support. */
const CONTACTS = 2;
/** The forest meal quality a food without its own record gets (as ex20's derived contents). */
const MEAL_QUALITY = 0.8;
const UNKNOWN = ['edibility', 'nutrition', 'toxins', 'safety', 'preparation'];
/** Represented treatments without a cracking law in this version (as ex20 refuses them). */
const TREATED = [
  'componentLots',
  'physical',
  'materialLayer',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'canopyDrying',
] as const;
const PLANS = ['crack', 'separate', 'crack-and-separate'] as const;
type Plan = (typeof PLANS)[number];
const { passes, deterioration } = SAMPLE_OPENING_LAWS;

const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const hardness = (r: V7Resource) => r.properties?.hardness ?? 0;

/** Ids of the three part materials of a composition. */
export function casingPartIds(d: EnclosedComposition) {
  return {
    kernel: `${d.unit}-loose-kernel`,
    fragments: `${d.unit}-casing-fragments`,
    mixed: `${d.unit}-cracked-mixed`,
  };
}

/** The part materials of one composition, derived from the unit's own row as ex20 derives its
 * parts, but with each part's unit equal to that part of one whole source unit: kernel mass
 * unit mass x contents share with all of the unit's nutrition and toxicity; casing fragments
 * the rest of the mass, no food value, no decay (like other inedible material); cracked mixed
 * material the whole unit, opened but unseparated. 0.1 of a unit thus yields exactly 0.1 of
 * kernel and 0.1 of fragments, and mass and food value are conserved. */
export function casingResources(
  d: EnclosedComposition,
  unit: V7Resource,
): V7Resource[] {
  const kernel = foodTenths(d.contents.share),
    casing = foodTenths(d.enclosure.share);
  if (
    unit.id !== d.unit ||
    kernel < 1 ||
    casing < 1 ||
    kernel + casing !== 10 ||
    d.contents.recoverable !== 1
  )
    throw new Error(`Invalid casing composition for ${d.unit}.`);
  const ids = casingPartIds(d),
    p = unit.properties,
    food = {
      ingredients: [{ resource: unit.id, share: 1 }],
      method: 'unprocessed',
      quality: MEAL_QUALITY,
    };
  return [
    {
      id: ids.kernel,
      name: `Loose ${d.contents.name.toLowerCase()}`,
      mass: round(unit.mass * d.contents.share),
      nutrition: unit.nutrition,
      toxicity: unit.toxicity,
      color: d.contents.color,
      food,
      ...(p ? { properties: { ...p } } : {}),
    },
    {
      id: ids.fragments,
      name: `Cracked ${d.enclosure.name.toLowerCase()}`,
      mass: round(unit.mass * d.enclosure.share),
      nutrition: 0,
      toxicity: 0,
      color: unit.color,
      ...(p ? { properties: { ...p, decay: 0 } } : {}),
    },
    {
      id: ids.mixed,
      name: `Cracked ${unit.name.toLowerCase()}, unseparated`,
      mass: unit.mass,
      nutrition: unit.nutrition,
      toxicity: unit.toxicity,
      color: unit.color,
      food,
      ...(p ? { properties: { ...p } } : {}),
    },
  ];
}

type Field = 'untouched' | 'closed' | 'opened';
type Support = { kind: 'object' | 'item'; id: string; resource: string };
interface Gear {
  striker: V7Stack;
  strikerMaterial: V7Resource;
  support: Support;
  supportMaterial: V7Resource;
  supportItem: V7Stack | null;
  /** Load reaching a block; never stored or reported (it derives from hidden properties). */
  load: number;
  key: string;
}
interface Block extends V7Data {
  index: number;
  tick: number;
  phase: string;
  outcome: string;
  damage: number;
}
interface Tally extends V7Data {
  untouched: number;
  closed: number;
  opened: number;
  separated: number;
  strikerContacts: number;
  strikerWorn: number;
  supportContacts: number;
  supportWorn: number;
}
/** The persistent casing work: pinned identities, reserved material, phase and products. */
interface Casing extends CollectiveWork {
  plan: string;
  stage: string;
  phase: string;
  source: string;
  resource: string;
  unitMass: number;
  quantity: number;
  blocks: number;
  done: number;
  striker: string | null;
  support: string | null;
  supportKind: string | null;
  startDamage: number;
  closedDamage: number;
  untouched: string | null;
  closed: string | null;
  opened: string | null;
  kernel: string | null;
  fragments: string | null;
  log: Block[];
  tally: Tally;
  quote: V7Data;
  pausedAt: number | null;
  startedAt: number;
  endedAt: number | null;
}

export function casingCrackingPackage(
  id: string,
  scope: string,
  compositions: EnclosedComposition[],
): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const stateKey = `long:work:${id}`;
  const resources = compositions.flatMap((d) => {
    const unit = FOREST_RESOURCES.find((r) => r.id === d.unit);
    if (!unit) throw new Error(`No represented unit material ${d.unit}.`);
    return casingResources(d, unit);
  });
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Casing);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const sync = (a: V7Actor, j: Casing) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const compositionOf = (resource: string) =>
    compositions.find(
      (d) => d.unit === resource || casingPartIds(d).mixed === resource,
    );
  const reserved = (w: V7World, j: Casing, item: string | null) =>
    item
      ? w.stacks.find((s) => s.id === item && s.reservedFor === j.id)
      : undefined;
  const escrowOf = (j: Casing) =>
    [j.untouched, j.closed, j.opened].filter((x): x is string => !!x);
  const writes = (j: Casing, extra: (string | null)[] = []) => [
    ...new Set(
      [j.id, ...escrowOf(j), j.kernel, j.fragments, j.striker, ...extra].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const stateOf = (damage: number) =>
    damage >= 1
      ? 'fractured open'
      : damage > 0
        ? 'closed, damaged'
        : 'closed, undamaged';

  /** Exact ledger: quantities in tenths of source units, masses in kg from the reserved
   * unit mass, nutrition from the source row; casing debris is never produced here. */
  function ledger(w: V7World, j: Casing): V7Data {
    const d = compositionOf(j.resource),
      unit = w.resources.find((r) => r.id === d?.unit);
    const share = d?.contents.share ?? 0,
      t = j.tally,
      q = (n: number) => ({
        quantity: n / 10,
        mass: round((n * j.unitMass) / 10),
      });
    const kept = t.untouched + t.closed + t.opened + t.separated;
    return {
      quantum: 0.1,
      input: {
        ...q(j.blocks),
        nutrition: round((j.blocks * (unit?.nutrition ?? 0)) / 10),
      },
      untouched: q(t.untouched),
      closed: { ...q(t.closed), item: j.closed, damage: j.closedDamage },
      mixed: { ...q(t.opened), item: j.opened },
      kernel: {
        item: j.kernel,
        quantity: t.separated / 10,
        mass: round((t.separated * j.unitMass * share) / 10),
        nutrition: round((t.separated * (unit?.nutrition ?? 0)) / 10),
      },
      fragments: {
        item: j.fragments,
        quantity: t.separated / 10,
        mass: round((t.separated * j.unitMass * (1 - share)) / 10),
      },
      debris: { quantity: 0, mass: 0 },
      wear: {
        striker: {
          item: j.striker,
          contacts: t.strikerContacts,
          mass: round(t.strikerWorn),
        },
        support: {
          ref: j.support,
          contacts: t.supportContacts,
          mass: round(t.supportWorn),
        },
      },
      balanced: kept === j.blocks,
    };
  }
  /** Reusable drawing metadata from the same record the events carry. A closed block is drawn
   * closed with its actual damage; contents appear only for a fractured block; products only
   * as they exist; no badge. Drawing reuses ex20's enclosure and contents fields. */
  function view(w: V7World, j: Casing, extra: V7Data = {}): V7Data {
    const d = compositionOf(j.resource),
      unit = w.resources.find((r) => r.id === d?.unit);
    const amount = (item: string | null) =>
      item ? (w.stacks.find((s) => s.id === item)?.quantity ?? 0) : 0;
    return {
      operation: id,
      renderer: 'open-and-separate-sample@1 enclosure and contents fields',
      workId: j.id,
      plan: j.plan,
      phase: j.phase,
      status: j.status,
      actor: j.owner,
      target: j.source,
      striker: j.striker,
      support: j.support,
      supportKind: j.supportKind,
      x: round(j.x),
      y: round(j.y),
      material: {
        resource: d?.unit ?? j.resource,
        casingColor: unit?.color ?? null,
        kernelColor: d?.contents.color ?? null,
        shape: d?.appearance.shape ?? null,
        texture: d?.appearance.texture ?? null,
      },
      // Only a committed phase event shows a physical action.
      pose: null,
      progress: {
        blocksDone: j.done,
        of: j.blocks,
        paidRounds: j.completedWork,
        paidEnergy: round(j.paidEnergy),
      },
      products: {
        kernel: { item: j.kernel, quantity: amount(j.kernel) },
        fragments: { item: j.fragments, quantity: amount(j.fragments) },
        mixed: { item: j.opened, quantity: amount(j.opened) },
        closed: { item: j.closed, quantity: amount(j.closed) },
      },
      badge: null,
      ...extra,
    };
  }
  function summary(w: V7World, j: Casing, extra: V7Data = {}): V7Data {
    return {
      workId: j.id,
      plan: j.plan,
      stage: j.stage,
      status: j.status,
      phase: j.phase,
      source: j.source,
      quantity: j.quantity,
      blocks: j.blocks,
      done: j.done,
      striker: j.striker,
      support: j.support,
      ledger: ledger(w, j),
      paidEnergy: round(j.paidEnergy),
      tick: w.tick,
      view: view(w, j, extra),
    };
  }

  /** Why an own item cannot serve as a whole, rigid, sound blunt piece, or null (ex19/ex20). */
  function pieceProblem(w: V7World, a: V7Actor, s: V7Stack | undefined) {
    const problem = ex19MaterialPiece(w, a, s);
    if (problem || !s) return problem ?? 'Name one of your own items.';
    const m = collectiveFoodProfile(w, s);
    if (!m || hardness(m) < 1) return `${s.id} is not rigid enough.`;
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      return `${s.id} is fractured or too small to give a sound blunt face.`;
    return null;
  }
  /** The pinned or named striker and support, or the physical problem with them. */
  function gearOf(
    c: V7ActionContext,
    strikerId: string,
    supportId: string,
    exclude: string[],
  ): Gear | string {
    const { world: w, actor: a } = c;
    if (!strikerId || !supportId)
      throw nothing(
        'Cracking needs striker (your own hard blunt piece) and support (a stable hard support).',
      );
    if (
      strikerId === supportId ||
      exclude.includes(strikerId) ||
      exclude.includes(supportId)
    )
      throw nothing('The target, striker and support must be different.');
    const striker = w.stacks.find((s) => s.id === strikerId);
    const problem = pieceProblem(w, a, striker);
    if (problem || !striker) return problem ?? 'The striker is missing.';
    const strikerMaterial = collectiveFoodProfile(w, striker);
    if (!strikerMaterial) return 'The striker has no represented material.';
    const o = w.objects.find((o) => o.id === supportId);
    let support: Support,
      supportMaterial: V7Resource | undefined,
      supportItem: V7Stack | null = null;
    if (o) {
      supportMaterial = w.resources.find(
        (r) => r.id === o.data.resource && !!r.properties,
      );
      if (
        !supportMaterial ||
        !o.spatial.solid ||
        o.spatial.reserved ||
        ['animal', 'plant'].includes(o.kind) ||
        supportMaterial.nutrition > 0
      )
        return 'The support must be a solid, unreserved object of a represented inedible material, not a plant or an animal.';
      if (hardness(supportMaterial) < 1)
        return 'The support is not rigid enough.';
      if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
        return 'Move within reach of the support.';
      support = { kind: 'object', id: o.id, resource: supportMaterial.id };
    } else {
      const lower = w.stacks.find((s) => s.id === supportId);
      const issue =
        pieceProblem(w, a, lower) ?? ex19MaterialGround(w, a.position);
      if (issue || !lower) return issue ?? 'The support is missing.';
      supportMaterial = collectiveFoodProfile(w, lower);
      if (!supportMaterial) return 'The support has no represented material.';
      supportItem = lower;
      support = { kind: 'item', id: lower.id, resource: supportMaterial.id };
    }
    return {
      striker,
      strikerMaterial,
      support,
      supportMaterial,
      supportItem,
      load: Math.min(passes(strikerMaterial), passes(supportMaterial)),
      key: `${strikerMaterial.id}-on-${supportMaterial.id}`,
    };
  }
  /** Visible condition of a striker: carried mass, recorded contacts and soundness. */
  function condition(w: V7World, s: V7Stack): V7Data {
    const wear = s.processing?.[WEAR_KEY];
    const record =
      wear && typeof wear === 'object' && !Array.isArray(wear) ? wear : null;
    const contact = ex19MaterialContact(w, s);
    return {
      item: s.id,
      resource: s.resource,
      mass: round(foodUnitMass(w, s) * s.quantity),
      contacts: Number(record?.contacts ?? 0),
      worn: round(Number(record?.worn ?? 0)),
      sound: contact.controlledContact && !contact.fractured,
    };
  }
  /** Detaches one abrasion quantum from an inedible item's solids, as scratchStroke's dust
   * does, and records it on the item. Returns the detached mass. */
  function abrade(w: V7World, s: V7Stack): number {
    const r = w.resources.find((r) => r.id === s.resource);
    if (!r || r.nutrition > 0 || r.toxicity > 0) return 0;
    if (!s.physical) {
      const wet = r.properties?.moisture ?? 0;
      s.physical = {
        unitMass: r.mass,
        unitWater: r.mass * wet,
        unitSolids: r.mass * (1 - wet),
      };
    }
    if (s.physical.unitSolids * s.quantity < ABRASION) return 0;
    s.physical.unitSolids = round(
      s.physical.unitSolids - ABRASION / s.quantity,
    );
    s.physical.unitMass = round(s.physical.unitWater + s.physical.unitSolids);
    const old = s.processing?.[WEAR_KEY];
    const record =
      old && typeof old === 'object' && !Array.isArray(old) ? old : null;
    s.processing = {
      ...(s.processing ?? {}),
      [WEAR_KEY]: {
        revision,
        contacts: Number(record?.contacts ?? 0) + 1,
        worn: round(Number(record?.worn ?? 0) + ABRASION),
        lastTick: w.tick,
      },
    };
    return ABRASION;
  }

  /** The own target, its composition and casing state, or a refusal. */
  function targetOf(c: V7ActionContext, plan: Plan) {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((s) => s.id === text(action.args.target));
    if (!s || s.owner !== a.id)
      throw nothing(
        'Name one of your own items by its exact item id in target.',
      );
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const d = compositionOf(s.resource),
      unit = w.resources.find((r) => r.id === d?.unit);
    if (!d || !unit || openMaterial(unit).strength <= 0)
      throw nothing(
        `No casing and contents are represented for ${s.resource} in this world, so it cannot be cracked or separated.`,
      );
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).some((k) => k !== KEY)
    )
      throw nothing(
        'Material under another represented treatment has no cracking law in this version.',
      );
    const h = s.processing?.[KEY];
    const record = h && typeof h === 'object' && !Array.isArray(h) ? h : null;
    if (record && record.revision !== revision)
      throw nothing('This item carries another revision of this record.');
    const life = unit.properties?.decay ?? 0;
    if (life > 0 && (s.decay ?? 0) >= life)
      throw nothing('Spoiled material cannot be worked.');
    const opened = s.resource === casingPartIds(d).mixed;
    if (opened && plan !== 'separate')
      throw nothing(
        `${s.id} is already cracked open: use mode separate to remove its loose casing.`,
      );
    if (!opened && plan === 'separate')
      throw nothing(
        `The casing of ${s.id} is ${stateOf(Number(record?.damage ?? 0))}: nothing is accessible to separate. Crack it first.`,
      );
    let n = Math.min(JOB, foodTenths(s.quantity));
    if (action.args.quantity !== undefined) {
      const q = v7Number(action.args.quantity, 'quantity', 0.1, 1);
      if (Math.abs(q * 10 - Math.round(q * 10)) > 1e-7)
        throw nothing('quantity is given in exact tenths of a unit.');
      n = Math.round(q * 10);
    }
    if (n < BLOCK || n > foodTenths(s.quantity))
      throw nothing(
        `${s.id} holds ${String(s.quantity)}; ${String(n / 10)} was selected.`,
      );
    return {
      s,
      d,
      unit,
      n,
      opened,
      damage: opened ? 1 : Number(record?.damage ?? 0),
    };
  }

  function quoteOf(
    w: V7World,
    plan: Plan,
    s: V7Stack,
    n: number,
    damage: number,
    gear: Gear | null,
  ): V7Data {
    const cracking = plan === 'separate' ? 0 : n,
      separating = plan === 'crack' ? 0 : n;
    return {
      plan,
      target: s.id,
      resource: s.resource,
      quantity: n / 10,
      blocks: n,
      blockSize: 0.1,
      casing: stateOf(damage),
      phases: { cracking, separatingAtMost: separating },
      maxPhases: cracking + separating,
      maxEnergy: round(cracking * CRACK + separating * SEPARATE),
      phaseEnergy: { crack: CRACK, separate: SEPARATE },
      striker: gear ? condition(w, gear.striker) : null,
      support: gear ? { ...gear.support } : null,
      wearBound: gear
        ? {
            perImpactEachSurface: round(CONTACTS * ABRASION),
            jobEachSurface: round(cracking * CONTACTS * ABRASION),
          }
        : null,
      casingDebris: 0,
      excludes: 'travel, getting a striker or support, and study',
      unknown: UNKNOWN,
    };
  }

  /** Opens a work record and reserves exactly the selected quantity of the target. */
  function begin(
    c: V7ActionContext,
    plan: Plan,
    t: ReturnType<typeof targetOf>,
    gear: Gear | null,
    quote: V7Data,
  ): Casing {
    const { world: w, actor: a } = c;
    const j = workCreate(c, plan, Number(quote.maxPhases)) as Casing;
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: t.s.id, quantity: t.n / 10 }]),
    );
    const lot = w.stacks.find((x) => x.id === j.escrow[0]);
    if (!lot) throw new Error('The reserved material is missing.');
    w.stacks = w.stacks.filter((x) => x.id !== t.s.id || x.quantity > 0);
    Object.assign(j, {
      plan,
      stage: 'working',
      phase: plan === 'separate' ? 'separate' : 'crack',
      source: t.s.id,
      resource: t.d.unit,
      unitMass: round(foodUnitMass(w, lot)),
      quantity: t.n / 10,
      blocks: t.n,
      done: 0,
      striker: gear?.striker.id ?? null,
      support: gear?.support.id ?? null,
      supportKind: gear?.support.kind ?? null,
      startDamage: t.damage,
      closedDamage: t.damage,
      untouched: t.opened ? null : lot.id,
      closed: null,
      opened: t.opened ? lot.id : null,
      kernel: null,
      fragments: null,
      log: [],
      tally: {
        untouched: t.opened ? 0 : t.n,
        closed: 0,
        opened: t.opened ? t.n : 0,
        separated: 0,
        strikerContacts: 0,
        strikerWorn: 0,
        supportContacts: 0,
        supportWorn: 0,
      },
      quote: {
        ...quote,
        reserved: lot.id,
        origin: lot.origin,
        harvestedAt: lot.harvestedAt ?? null,
        decay: round(lot.decay ?? 0),
      },
      pausedAt: null,
      startedAt: w.tick,
      endedAt: null,
    });
    c.emit(
      'casing-cracking-started',
      `${String(t.n / 10)} of ${t.s.id} is reserved as ${lot.id} in casing work ${j.id}: at most ${String(Number(quote.maxPhases))} rounds and ${String(Number(quote.maxEnergy))} energy; the rest of the item is unchanged.`,
      summary(w, j, { quote: j.quote }),
      lot.id,
    );
    sync(a, j);
    return j;
  }

  /** Takes one block from a reserved item: the item itself when one block is left. */
  function takeBlock(w: V7World, j: Casing, field: Field) {
    const s = reserved(w, j, j[field]);
    if (!s) return undefined;
    if (foodTenths(s.quantity) <= BLOCK) {
      j[field] = null;
      return s;
    }
    const piece: V7Stack = {
      ...materialPortion(s, BLOCK),
      id: v7Id(w, 'item'),
      quantity: BLOCK / 10,
      quantityTenths: BLOCK,
    };
    foodSetQuantity(s, foodTenths(s.quantity) - BLOCK);
    w.stacks.push(piece);
    return piece;
  }
  /** Sets or clears this operation's record on an item. */
  function mark(s: V7Stack, record: V7Data | null) {
    const rest: V7Data = Object.fromEntries(
      Object.entries(s.processing ?? {}).filter(([k]) => k !== KEY),
    );
    if (record) rest[KEY] = record;
    if (Object.keys(rest).length) s.processing = rest;
    else delete s.processing;
  }
  /** Adds a lot to an existing item of the same material; merged lots keep the oldest decay
   * and earliest harvest, so merging never refreshes material. */
  function absorb(
    w: V7World,
    into: V7Stack,
    lot: V7Stack,
    record: V7Data | null,
  ) {
    foodSetQuantity(into, foodTenths(into.quantity) + foodTenths(lot.quantity));
    into.decay = Math.max(into.decay ?? 0, lot.decay ?? 0);
    if (lot.harvestedAt !== undefined)
      into.harvestedAt = Math.min(
        into.harvestedAt ?? lot.harvestedAt,
        lot.harvestedAt,
      );
    mark(into, record);
    w.stacks = w.stacks.filter((s) => s.id !== lot.id);
  }
  /** Puts a reserved block into the work's closed, opened or untouched item. */
  function place(
    w: V7World,
    j: Casing,
    field: Field,
    piece: V7Stack,
    resource: string,
    record: V7Data | null,
  ) {
    piece.resource = resource;
    mark(piece, record);
    const into = reserved(w, j, j[field]);
    if (into && into.id !== piece.id && into.resource === resource)
      absorb(w, into, piece, record);
    else j[field] = piece.id;
  }
  /** A new owned product of one block, or the work's earlier product grown by it. */
  function produce(
    c: V7ActionContext,
    j: Casing,
    field: 'kernel' | 'fragments',
    piece: V7Stack,
    resource: string,
    record: V7Data,
  ): V7Stack {
    const { world: w, actor: a } = c;
    const lot: V7Stack = {
      id: v7Id(w, 'item'),
      resource,
      quantity: BLOCK / 10,
      quantityTenths: BLOCK,
      position: { ...a.position },
      owner: a.id,
      origin: piece.origin,
      ...(piece.harvestedAt === undefined
        ? {}
        : { harvestedAt: piece.harvestedAt }),
      decay: piece.decay ?? 0,
      processing: { [KEY]: record },
    };
    w.stacks.push(lot);
    const into = w.stacks.find(
      (s) =>
        s.id === j[field] &&
        s.owner === a.id &&
        !s.reservedFor &&
        s.resource === resource,
    );
    if (into) {
      absorb(w, into, lot, record);
      return into;
    }
    j[field] = lot.id;
    return lot;
  }

  function remaining(j: Casing): number {
    const left = j.blocks - j.done;
    return j.plan === 'crack-and-separate'
      ? 2 * left - (j.phase === 'separate' ? 1 : 0)
      : left;
  }
  function result(
    c: V7ActionContext,
    j: Casing,
    extra: (string | null)[] = [],
  ) {
    j.remainingWork = remaining(j);
    j.initialWork = j.completedWork + j.remainingWork;
    j.escrow = escrowOf(j);
    sync(c.actor, j);
    return j.remainingWork > 0 && isOpen(j)
      ? {
          complete: false,
          remaining: j.remainingWork,
          writes: writes(j, extra),
        }
      : { complete: true, remaining: 0, writes: writes(j, extra) };
  }

  /** Records a pause before any charge; done work, damage, reserved material and products remain. */
  function pause(c: V7ActionContext, j: Casing, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    c.emit(
      'casing-cracking-paused',
      `${reason} The casing work is paused before any charge; fractures, reserved material and products remain.`,
      summary(c.world, j),
      j.id,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: writes(j) };
  }
  /** Ends open work whose reserved material is gone; what remains returns, nothing is refunded. */
  function lost(w: V7World, a: V7Actor, j: Casing, reason: string) {
    j.untouched = reserved(w, j, j.untouched)?.id ?? null;
    j.closed = reserved(w, j, j.closed)?.id ?? null;
    j.opened = reserved(w, j, j.opened)?.id ?? null;
    j.escrow = escrowOf(j);
    workStop(w, a, j, reason, false);
    j.stage = 'failed';
    j.endedAt = w.tick;
    forestEvent(
      w,
      'casing-cracking-failed',
      `${reason} The casing work ended; remaining reserved material returned and nothing is refunded.`,
      a.position,
      a.id,
      { ...summary(w, j), cause: 'material lost' },
      j.id,
    );
    sync(a, j);
  }
  /** Pays one phase; a pause recorded before is resumed explicitly. */
  function pay(c: V7ActionContext, j: Casing, energy: number) {
    const resumed = j.pausedAt !== null;
    j.remainingWork = Math.max(1, j.remainingWork);
    j.initialWork = j.completedWork + j.remainingWork;
    if (!workPay(c, j, energy))
      throw new Error('Energy changed before the paid round.');
    c.actor.vitals.energy = round(Math.max(0, c.actor.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'casing-cracking-resumed',
        'The paused casing work resumed after rechecking the reserved material, energy, striker and support.',
        summary(c.world, j),
        j.id,
      );
    }
  }
  /** Releases surviving reserved material to its owner once at completion. */
  function finish(c: V7ActionContext, j: Casing, outcome: string) {
    const { world: w, actor: a } = c;
    const released = escrowOf(j).filter((x) => !!reserved(w, j, x));
    for (const x of released) {
      const s = w.stacks.find((s) => s.id === x);
      if (!s) continue;
      delete s.reservedFor;
      s.owner = a.id;
      s.position = { ...a.position };
    }
    j.status = 'completed';
    j.stage = 'completed';
    j.phase = 'done';
    j.reason = outcome;
    j.endedAt = w.tick;
    j.remainingWork = 0;
    j.initialWork = j.completedWork;
    j.escrow = [];
    c.emit(
      'casing-cracking-completed',
      `Casing work ${j.id} ended: ${outcome}${released.length ? ` ${released.join(', ')} returned to you as they now are.` : ''}`,
      { ...summary(w, j), released, outcome },
      j.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: writes(j, released) };
  }

  /** One cracking phase: one bounded supported impact on one block. */
  function crack(c: V7ActionContext, j: Casing, g: Gear): V7HandlerResult {
    const { world: w, actor: a } = c;
    const d = compositionOf(j.resource),
      unit = w.resources.find((r) => r.id === j.resource);
    if (!d || !unit) throw new Error('Invalid casing record.');
    pay(c, j, CRACK);
    const piece = takeBlock(w, j, 'untouched');
    if (!piece) throw new Error('The reserved block is missing.');
    piece.position = { ...a.position };
    const index = j.done;
    const strength = openMaterial(unit).strength;
    // ex17/ex19/ex20 damage law: nothing at or below the strength, else (load - strength) / strength.
    const added =
      g.load <= strength ? 0 : round((g.load - strength) / strength);
    const damage = round(j.startDamage + added);
    const outcome =
      added === 0 ? 'unchanged' : damage >= 1 ? 'fractured' : 'damaged';
    // Deterministic contact wear (scratchStroke rules): a surface no harder than the one it
    // strikes sheds one quantum; a support softer by the margin than what presses on it does.
    const hs = hardness(g.strikerMaterial),
      hk = hardness(unit),
      hp = hardness(g.supportMaterial);
    const strikerHits =
      (hs <= hk ? 1 : 0) + (outcome === 'fractured' && hs <= hp ? 1 : 0);
    const supportHits =
      (hk - hp >= MARGIN ? 1 : 0) +
      (outcome === 'fractured' && hs - hp >= MARGIN ? 1 : 0);
    let strikerWorn = 0,
      supportWorn = 0;
    for (let i = 0; i < strikerHits; i++) strikerWorn += abrade(w, g.striker);
    for (let i = 0; i < supportHits; i++)
      supportWorn += g.supportItem ? abrade(w, g.supportItem) : ABRASION;
    const t = j.tally;
    t.strikerContacts += strikerHits;
    t.strikerWorn = round(t.strikerWorn + strikerWorn);
    t.supportContacts += supportHits;
    t.supportWorn = round(t.supportWorn + supportWorn);
    const record = (part: string): V7Data => ({
      version: 1,
      revision,
      work: j.id,
      parent: j.source,
      part,
      damage,
      openedAt: outcome === 'fractured' ? w.tick : null,
    });
    t.untouched -= BLOCK;
    if (outcome === 'unchanged') {
      place(
        w,
        j,
        'untouched',
        piece,
        j.resource,
        j.startDamage > 0 ? record('closed') : null,
      );
      t.untouched += BLOCK;
    } else if (outcome === 'damaged') {
      j.closedDamage = damage;
      place(w, j, 'closed', piece, j.resource, record('closed'));
      t.closed += BLOCK;
    } else {
      place(
        w,
        j,
        'opened',
        piece,
        casingPartIds(d).mixed,
        record('cracked-mixed'),
      );
      t.opened += BLOCK;
    }
    const before = stateOf(j.startDamage),
      after = outcome === 'unchanged' ? before : stateOf(damage);
    j.log = [
      ...j.log,
      {
        index,
        tick: w.tick,
        phase: 'crack',
        outcome,
        damage: outcome === 'unchanged' ? j.startDamage : damage,
      },
    ];
    const evidence = `${j.id}:block-${String(index)}:crack`;
    const shown = {
      phase: 'crack',
      pose: 'striking a block resting on the support with the striker',
      block: index,
      affected: BLOCK / 10,
      casing: {
        before,
        after,
        crack: round(
          Math.min(1, outcome === 'unchanged' ? j.startDamage : damage),
        ),
      },
      contents:
        outcome === 'fractured' ? { exposed: true, separated: false } : null,
      evidence,
    };
    const data = { ...summary(w, j, shown), outcome, energy: CRACK };
    c.emit(
      'casing-cracking-impact',
      `One controlled impact of ${g.striker.id} on a 0.1 block of ${j.source} resting on ${g.support.id}.`,
      data,
      piece.id,
    );
    c.emit(
      `casing-cracking-${outcome}`,
      outcome === 'unchanged'
        ? `The casing of the block held: ${after}; nothing was opened.`
        : outcome === 'damaged'
          ? 'The casing of the block cracked but stayed closed; the interior is not visible.'
          : `The casing of the block fractured open; its contents are exposed but not separated. ${UNKNOWN.join(', ')} are not established.`,
      data,
      piece.id,
    );
    if (strikerHits || supportHits)
      c.emit(
        'casing-cracking-tool-wear',
        `Contact wear: ${g.striker.id} lost ${String(round(strikerWorn))} kg; ${g.support.id} ${g.supportItem ? 'lost' : 'was marked by'} ${String(round(supportWorn))} kg.`,
        {
          ...data,
          striker: condition(w, g.striker),
          strikerContacts: strikerHits,
          supportContacts: supportHits,
          supportMassRepresented: !!g.supportItem,
        },
        g.striker.id,
      );
    openRemember(c, {
      key: `${unit.id}:casing-impact:${g.key}:${outcome}`,
      subject: unit.id,
      property: 'casing response of a 0.1 block to one supported impact',
      value: {
        striker: g.striker.id,
        support: g.support.id,
        outcome,
        casing: after,
        crack: shown.casing.crack,
        interior:
          outcome === 'fractured'
            ? 'exposed, not yet separated'
            : 'not visible; only the exterior can be felt or seen',
      },
      method:
        'one controlled impact of a hand-held striker on a block resting on a support',
      condition: `${openConditions(w, a.position).regime}; by hand and direct look`,
      verified: true,
    });
    if (outcome === 'fractured' && j.plan === 'crack') {
      c.emit(
        'casing-cracking-products',
        `Cracked, unseparated material now ${String(reserved(w, j, j.opened)?.quantity ?? 0)} in ${j.opened ?? ''}.`,
        data,
        j.opened,
      );
    }
    if (outcome === 'unchanged')
      return finish(
        c,
        j,
        `${g.striker.id} on ${g.support.id} left the casing unchanged; further identical impacts would not change it. A reattempt is new paid work.`,
      );
    if (outcome === 'fractured' && j.plan === 'crack-and-separate')
      j.phase = 'separate';
    else j.done += 1;
    if (j.done >= j.blocks)
      return finish(c, j, 'every reserved block was worked.');
    return result(c, j, [
      piece.id,
      g.support.kind === 'item' ? g.support.id : null,
    ]);
  }

  /** One separation phase: the loose casing of one opened block is taken off by hand. */
  function separate(c: V7ActionContext, j: Casing): V7HandlerResult {
    const { world: w, actor: a } = c;
    const d = compositionOf(j.resource),
      unit = w.resources.find((r) => r.id === j.resource);
    if (!d || !unit) throw new Error('Invalid casing record.');
    pay(c, j, SEPARATE);
    const piece = takeBlock(w, j, 'opened');
    if (!piece) throw new Error('The opened block is missing.');
    const index = j.done;
    const ids = casingPartIds(d);
    const record = (part: string): V7Data => ({
      version: 1,
      revision,
      work: j.id,
      parent: j.source,
      part,
      separatedAt: w.tick,
      certified: false,
      treatment: 'none: not washed, heated or made safe',
    });
    const kernel = produce(
      c,
      j,
      'kernel',
      piece,
      ids.kernel,
      record('loose kernel'),
    );
    const fragments = produce(
      c,
      j,
      'fragments',
      piece,
      ids.fragments,
      record('casing fragments'),
    );
    w.stacks = w.stacks.filter((s) => s.id !== piece.id);
    j.tally.opened -= BLOCK;
    j.tally.separated += BLOCK;
    const life = unit.properties?.decay ?? 0;
    const seen = ex19MaterialDark(w, a)
      ? 'not seen in this light'
      : deterioration(life > 0 ? Math.min(1, (piece.decay ?? 0) / life) : 0);
    j.log = [
      ...j.log,
      {
        index,
        tick: w.tick,
        phase: 'separate',
        outcome: 'separated',
        damage: 1,
      },
    ];
    j.done += 1;
    if (j.plan === 'crack-and-separate') j.phase = 'crack';
    const observation = {
      kernel: kernel.id,
      fragments: fragments.id,
      form: 'loose kernel pieces among casing fragments, picked apart by hand',
      color: d.contents.color,
      texture: d.contents.texture,
      condition: seen,
      certified: false,
      unknown: UNKNOWN,
    };
    const shown = {
      phase: 'separate',
      pose: 'picking loose casing off an opened block by hand',
      block: index,
      affected: BLOCK / 10,
      casing: {
        before: 'fractured open',
        after: 'removed as fragments',
        crack: 1,
      },
      contents: { exposed: true, separated: true },
      evidence: `${j.id}:block-${String(index)}:separate`,
    };
    const data = { ...summary(w, j, shown), observation, energy: SEPARATE };
    c.emit(
      'casing-cracking-separated',
      `The loose casing of one opened 0.1 block of ${j.source} was taken off by hand: 0.1 loose kernel into ${kernel.id} and 0.1 casing fragments into ${fragments.id}. The parts carry the source's origin, age and decay; nothing was washed, heated or made safe.`,
      data,
      kernel.id,
    );
    c.emit(
      'casing-cracking-products',
      `Products now: ${String(kernel.quantity)} loose kernel in ${kernel.id}, ${String(fragments.quantity)} casing fragments in ${fragments.id}. ${UNKNOWN.join(', ')} are not established.`,
      data,
      kernel.id,
    );
    openRemember(c, {
      key: `${unit.id}:casing-separation:loose-kernel:${seen}`,
      subject: unit.id,
      property: 'parts found in one opened 0.1 block',
      value: { ...observation, kernelQuantity: 0.1, fragmentQuantity: 0.1 },
      method: 'one round of hand separation of loose casing and a direct look',
      condition: `${openConditions(w, a.position).regime}; ${UNKNOWN.join(', ')} not established`,
      verified: true,
    });
    if (j.done >= j.blocks)
      return finish(c, j, 'every reserved block was worked.');
    return result(c, j, [piece.id]);
  }

  /** The next phase of open work, after rechecks. A fresh start or explicit resume refuses at no
   * cost; a continuing round pauses at no charge. */
  function proceed(
    c: V7ActionContext,
    j: Casing,
    fresh: boolean,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const halt = (problem: string) => {
      if (fresh) throw nothing(problem);
      return pause(c, j, problem);
    };
    const field: Field = j.phase === 'separate' ? 'opened' : 'untouched';
    if (!reserved(w, j, j[field])) {
      lost(w, a, j, 'The reserved material is gone.');
      return { complete: true, remaining: 0, writes: writes(j) };
    }
    if (j.phase === 'separate') {
      if (a.vitals.energy + 1e-8 < SEPARATE)
        return halt(`A separation round needs ${String(SEPARATE)} energy.`);
      return separate(c, j);
    }
    const g = gearOf(c, j.striker ?? '', j.support ?? '', escrowOf(j));
    if (typeof g === 'string') return halt(g);
    if (a.vitals.energy + 1e-8 < CRACK)
      return halt(`A cracking round needs ${String(CRACK)} energy.`);
    return crack(c, j, g);
  }

  /** The person's own work named by workId, else their one open work. */
  function named(c: V7ActionContext): Casing | undefined {
    const workId = text(c.action.args.workId);
    if (!workId) return current(c.world, c.actor);
    const j = works(c.world).find(
      (j) => j.id === workId && j.owner === c.actor.id,
    );
    if (!j) throw nothing('No casing work of yours has this workId.');
    if (!isOpen(j)) throw nothing(`Casing work ${j.id} is already settled.`);
    return j;
  }

  function work(c: V7ActionContext, plan: Plan): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const open = named(c);
    if (open) {
      const target = text(action.args.target);
      if (
        open.plan !== plan ||
        (target && target !== open.source) ||
        action.args.quoteOnly === true
      )
        throw nothing(
          `Your casing work ${open.id} (${open.plan}) is still open; continue it with the same action or resume, or pause or cancel it.`,
        );
      for (const [field, pinned] of [
        ['striker', open.striker],
        ['support', open.support],
      ] as const)
        if (text(action.args[field]) && text(action.args[field]) !== pinned)
          throw nothing(
            `The ${field} of work ${open.id} is pinned to ${pinned ?? 'none'}.`,
          );
      return proceed(c, open, open.status === 'paused');
    }
    if (!text(action.args.target))
      throw nothing(
        'Give target: one of your own items of a material with a represented casing.',
      );
    const t = targetOf(c, plan);
    let gear: Gear | null = null;
    if (plan === 'separate') {
      if (text(action.args.striker) || text(action.args.support))
        throw nothing('Separation is by hand: give no striker or support.');
    } else {
      const g = gearOf(
        c,
        text(action.args.striker),
        text(action.args.support),
        [t.s.id],
      );
      if (typeof g === 'string') throw nothing(g);
      gear = g;
    }
    const first = plan === 'separate' ? SEPARATE : CRACK;
    if (a.vitals.energy + 1e-8 < first)
      throw nothing(`The first round needs ${String(first)} energy.`);
    const quote = quoteOf(w, plan, t.s, t.n, t.damage, gear);
    if (action.args.quoteOnly === true) {
      c.emit(
        'casing-cracking-quoted',
        `Quote for ${plan} of ${String(t.n / 10)} of ${t.s.id}: ${String(Number(quote.maxPhases))} rounds and ${String(Number(quote.maxEnergy))} energy at most; nothing was reserved or spent.`,
        {
          quote,
          view: {
            operation: id,
            phase: 'quote',
            actor: a.id,
            target: t.s.id,
            badge: null,
          },
        },
        t.s.id,
      );
      return { complete: true, remaining: 0, writes: [] };
    }
    return proceed(c, begin(c, plan, t, gear, quote), true);
  }

  function resume(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open casing work to resume.');
    return proceed(c, j, true);
  }
  function pauseMode(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open casing work to pause.');
    if (j.status === 'paused')
      throw nothing(`Casing work ${j.id} is already paused.`);
    return pause(c, j, 'Paused on request.');
  }
  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = named(c);
    if (!j) throw nothing('You have no open casing work to cancel.');
    const released = escrowOf(j).filter((x) => !!reserved(w, j, x));
    j.escrow = released;
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Casing work cancelled; reserved material returns to you as it now is. Spent energy, time, wear and damage are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.phase = 'done';
    j.endedAt = w.tick;
    c.emit(
      'casing-cracking-cancelled',
      `Casing work cancelled. ${released.length ? `${released.join(', ')} returned to you as they now are` : 'No reserved material was left'}; products stay as they are.`,
      { ...summary(w, j), released, cause: 'cancelled' },
      j.id,
    );
    j.escrow = [];
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, ...released] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    if (c.actor.vitals.health <= 0)
      throw nothing('Only a living person can work.');
    const mode = text(c.action.args.mode);
    if ((PLANS as readonly string[]).includes(mode))
      return work(c, mode as Plan);
    if (mode === 'resume') return resume(c);
    if (mode === 'pause') return pauseMode(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing(
      'Give mode: crack, separate, crack-and-separate, resume, pause or cancel.',
    );
  }

  /** Reserved material stays with its owner; vanished material ends the work; a round without
   * a paid phase pauses the work between phases at no charge. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      if (escrowOf(j).some((x) => !reserved(w, j, x))) {
        lost(w, a, j, 'Reserved material spoiled or is gone.');
        continue;
      }
      for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
        s.position = { ...a.position };
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.pausedAt = w.tick;
        j.reason =
          'Not worked this round; the work waits between phases. Continue with the same action or resume, or cancel.';
        forestEvent(
          w,
          'casing-cracking-paused',
          'Casing work paused because no phase was worked this round; fractures, reserved material and products remain and nothing was charged.',
          a.position,
          a.id,
          summary(w, j),
          j.id,
        );
      }
      sync(a, j);
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Cracking and separation of an owned hard casing in blocks of 0.1 unit: the selected quantity (at most one unit) is reserved in a work record with a pinned own striker and support; each cracking round is one controlled supported impact on one block under the ex17/ex19/ex20 compression law with deterministic scratch-model contact wear, and each separation round takes the loose casing of an opened block off by hand into a loose kernel item and a casing fragment item whose unit is that part of one whole source unit.',
    reuse: {
      experiment:
        'ex20 open-and-separate-sample@1 (hazelnut composition kernel 0.4 and shell 0.6, compression transmission and deterioration laws via SAMPLE_OPENING_LAWS, piece and support checks, work lifecycle and enclosure/contents view fields); ex22 prepare-shelled-food@1 (multi-round continuation, pause between phases, futile-press handling); ex19 shell-compression-opening@1 shared piece, contact, ground and light checks; open-hardness-physics scratchStroke contact rules and dust quantum; referenced, not replaced: open.probe (foundation-open@1) for the measured press evidence only, forest.pickup (foundation-forest@1) and base gather for separately requested collection, base eat, give and drop',
      source:
        'long-ex20-sample-opening.ts (HAZELNUT_COMPOSITION, SAMPLE_OPENING_LAWS); long-ex19-material-contact.ts; open-hardness-physics.ts (rules re-applied, not called); collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); open-foundation.ts (openRemember); open-physical.ts; forest-food-accounting.ts; material-lots.ts; collective-food-profile.ts; continuous-geometry.ts; viewer: generic stack glyphs by resource colour and event view metadata',
      description:
        'Implementation reuse only; ex19, ex20, ex22 and ex23 rooted-plant-watering packages are unchanged and no ability, item or mastery is inherited. New: 0.1 work blocks for fractional stacks, part materials per source unit (loose kernel, casing fragments, cracked unseparated material), pinned striker and support, per-block impact and separation phases, deterministic striker and support wear, the exact block ledger, quote, pause, resume, cancel and death handling.',
    },
    abilities: [
      {
        id,
        name: 'Crack and separate a hard casing',
        function:
          'Crack the hard casing of your own shelled material, such as hazelnuts, in 0.1 blocks with controlled impacts of your own hard blunt striker on a stable support, and take the loose casing off opened blocks by hand to separate the kernel.',
        equivalence:
          'material:hard-casing:supported-impact-block-crack-separate:1',
        parameters: {
          ...v7ObjectSchema({
            mode: {
              type: 'string',
              enum: [...PLANS, 'resume', 'pause', 'cancel'],
            },
            target: { type: 'string' },
            quantity: { type: 'number', minimum: 0.1, maximum: 1 },
            striker: { type: 'string' },
            support: { type: 'string' },
            workId: { type: 'string' },
            quoteOnly: { type: 'boolean' },
          }),
          required: ['mode'],
        },
        references: {
          target: 'optional-exact-visible',
          striker: 'optional-exact-visible',
          support: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 3,
        costs:
          'Study: 3 rounds. target: your own unreserved, untreated item of a material with a represented casing (closed for crack modes, cracked unseparated for separate); quantity: exact tenths, 0.1-1 (default all, up to 1), reserved in one work (workId). Crack modes need striker (your own whole, rigid, sound inedible piece, e.g. a stone) and support (a solid inedible object in reach, not a plant or animal, or another own piece on firm ground), pinned for the work. Per 0.1 block: one cracking round, 1 energy; in crack-and-separate a block that opens adds one separation round, 0.5 energy; separate: one hand round, 0.5 energy per block. 0.9 units: at most 18 rounds, 13.5 energy. quoteOnly true reports quantity, striker condition, phases, maximum energy and wear bounds at no cost. pause, resume, cancel: one round, no energy. Checks run before any charge; failed rechecks pause open work at no charge. Travel and getting a striker are separate actions.',
        effects:
          'Strength is hardness / 10; an impact passes the lower of striker and support strength x (1 - flexibility). At or below the casing strength the casing is unchanged: a real paid result that ends the work, the material returns as it was. Above it a block gains damage (load - strength) / strength: below 1 closed and damaged (a reattempt is new work), at 1 fractured open. Separation takes an opened block apart into 0.1 loose kernel and 0.1 casing fragments (a unit of each is that part of one whole unit) with the source origin, age and decay; the kernel carries all food value and toxicity, whatever they are. Opened blocks not separated stay cracked unseparated material. Wear: a striker no harder than what it strikes, or a support softer by 0.5 than what presses on it, loses 0.0001 kg per contact. Cancel returns reserved material as it now is; death leaves it at the worksite. Nothing is refunded, made safe or eaten; edibility, nutrition and toxins stay unknown; no reward.',
        handler,
        revision,
        authored: false,
        // The completion event carries no qualified flag: this operation earns no practice milestone.
        practiceEvidence: 'casing-cracking-completed',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'One phase per paid round; the work, reserved material, damage, products and pinned striker and support persist; the same action continues it, resume restarts a pause after rechecks.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'casing-cracking-quoted',
      'casing-cracking-started',
      'casing-cracking-impact',
      'casing-cracking-unchanged',
      'casing-cracking-damaged',
      'casing-cracking-fractured',
      'casing-cracking-tool-wear',
      'casing-cracking-separated',
      'casing-cracking-products',
      'casing-cracking-completed',
      'casing-cracking-paused',
      'casing-cracking-resumed',
      'casing-cracking-cancelled',
      'casing-cracking-failed',
    ],
    resources,
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        const released = escrowOf(j).filter((x) => !!reserved(w, j, x));
        j.escrow = released;
        workStop(
          w,
          a,
          j,
          'Performer died; reserved material stays at the worksite as it now is. Nothing is refunded or restored.',
          true,
        );
        j.stage = 'failed';
        j.phase = 'done';
        j.endedAt = w.tick;
        forestEvent(
          w,
          'casing-cracking-failed',
          'Casing work ended by death; reserved material was left at the worksite, neither restored nor separated.',
          { x: j.x, y: j.y },
          a.id,
          { ...summary(w, j), released, cause: 'death' },
          j.id,
        );
        j.escrow = [];
        sync(a, j);
      }
    },
  };
}

/** ex23: Kai's cracking and separation of an owned hazelnut casing. */
export const LONG_EX23_CASING_CRACKING = casingCrackingPackage(
  'crack-and-separate-casing',
  'long-ex23',
  [HAZELNUT_COMPOSITION],
);
