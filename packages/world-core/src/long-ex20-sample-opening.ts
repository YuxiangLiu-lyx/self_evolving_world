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
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_RESOURCES } from './forest-foundation.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import { HAND_FORCE } from './long-hand-break-food.js';
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
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';

/** A general opening and separation of owned enclosed material: one whole unit is pressed by
 * hand or with a blunt tool on a rigid support under the ex17/ex19 compression law; once its
 * enclosure is split open, its contents are separated by hand into their own items by the
 * represented composition. */

/** One opening attempt: one round and 0.5 energy (World Agent specification). */
const ATTEMPT = 0.5;
/** One inspection and separation round after a real opening: 0.2 energy. */
const SEPARATE = 0.2;
/** Processing key of an altered (cracked or opened) unit of this operation. */
const KEY = 'enclosureOpening';
/** Represented treatments without an opening law in this version. */
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
/** The forest meal quality a food without its own record gets (forest-experience), so a
 * separated contents item eats exactly like its unit: same ingredient, method and quality. */
const MEAL_QUALITY = 0.8;
const UNKNOWN = ['edibility', 'nutrition', 'toxins', 'safety', 'preparation'];

/** Composition of one enclosed material: an outer enclosure and its contents as mass shares
 * of one whole unit, how much of the contents a split enclosure releases by hand, and the
 * appearance used for observation records and drawing metadata. */
export interface EnclosedComposition {
  /** Resource of a whole enclosed unit; its represented hardness is the enclosure's strength. */
  unit: string;
  enclosure: { resource: string; name: string; share: number };
  contents: {
    resource: string;
    name: string;
    share: number;
    /** Share of the contents that comes free of a split-open enclosure by hand. */
    recoverable: number;
    color: string;
    texture: string;
  };
  appearance: { shape: string; length: number; width: number; texture: string };
}

/** Hazelnut. Kernel share 0.4: hazelnut (Corylus avellana) kernel percentages, kernel mass over
 * in-shell mass, are commonly reported at about 40-50 %; the lower bound is used, which is also
 * exact in the world's tenths accounting. The kernel lies loose in the shell cavity, so a split
 * shell releases all of it by hand (its thin skin is counted with the kernel). Appearance: the
 * ex13 owned-hazelnut exterior model (ovoid, 0.035 wide, 0.04-0.06 long, fine ridges) and the
 * ex13 opening model's interior colour and texture; geometry is drawing metadata only. */
export const HAZELNUT_COMPOSITION: EnclosedComposition = {
  unit: 'hazelnut',
  enclosure: {
    resource: 'hazelnut-shell',
    name: 'Hazelnut shell pieces',
    share: 0.6,
  },
  contents: {
    resource: 'hazelnut-kernel',
    name: 'Hazelnut kernels',
    share: 0.4,
    recoverable: 1,
    color: '#d8bd91',
    texture: 'pale compact surface',
  },
  appearance: {
    shape: 'ovoid',
    length: 0.05,
    width: 0.035,
    texture: 'fine visible ridges',
  },
};

/** Material definitions of the two separated parts, derived from the unit's own row. One unit
 * of either part is one whole unit's mass, so the parts' quantities are their mass shares and
 * sum to the unit. The contents carry all of the unit's nutrition and toxicity (per unit
 * divided by their share) and its other represented properties, including the decay
 * lifetime; the enclosure carries no nutrition or toxicity, keeps the unit's hardness,
 * flexibility, fuel and moisture, and, like the world's other inedible materials, does not
 * decay. */
export function enclosedResources(
  d: EnclosedComposition,
  unit: V7Resource,
): V7Resource[] {
  const share = foodTenths(d.contents.share),
    enclosure = foodTenths(d.enclosure.share),
    recovered = d.contents.share * d.contents.recoverable * 10;
  if (
    unit.id !== d.unit ||
    share < 1 ||
    enclosure < 1 ||
    share + enclosure !== 10 ||
    !Number.isSafeInteger(Math.round(recovered)) ||
    Math.abs(recovered - Math.round(recovered)) > 1e-9 ||
    d.contents.recoverable < 0 ||
    d.contents.recoverable > 1
  )
    throw new Error(`Invalid enclosed composition for ${d.unit}.`);
  const p = unit.properties;
  return [
    {
      id: d.contents.resource,
      name: d.contents.name,
      mass: unit.mass,
      nutrition: (unit.nutrition * 10) / share,
      toxicity: (unit.toxicity * 10) / share,
      color: d.contents.color,
      food: {
        ingredients: [{ resource: unit.id, share: 1 }],
        method: 'unprocessed',
        quality: MEAL_QUALITY,
      },
      ...(p ? { properties: { ...p } } : {}),
    },
    {
      id: d.enclosure.resource,
      name: d.enclosure.name,
      mass: unit.mass,
      nutrition: 0,
      toxicity: 0,
      color: unit.color,
      ...(p ? { properties: { ...p, decay: 0 } } : {}),
    },
  ];
}

type Method = 'hand' | 'supported-tool';
type Piece = { kind: 'item' | 'object'; id: string; resource: string };
interface Gear {
  method: Method;
  tool: Piece | null;
  support: Piece | null;
  /** Load reaching the unit; never stored or reported (it derives from hidden properties). */
  load: number;
}
interface Attempt extends V7Data {
  tick: number;
  method: string;
  tool: string | null;
  support: string | null;
  response: string;
  crack: number;
}
/** The persistent opening record: reserved unit, attempts, damage, then separation. */
interface Opening extends CollectiveWork {
  stage: string;
  source: string;
  specimen: string;
  resource: string;
  method: string | null;
  tool: string | null;
  support: string | null;
  input: V7Data;
  damage: number;
  attempts: Attempt[];
  observation: V7Data | null;
  ledger: V7Data | null;
  products: V7Data;
  pausedAt: number | null;
  endedAt: number | null;
}

const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
/** ex17/ex19 transmission law: a surface passes strength x (1 - flexibility); strength is
 * hardness / 10 (the probe press scale). */
function passes(r: V7Resource): number {
  const m = openMaterial(r);
  return round(m.strength * (1 - m.flexibility));
}
/** Load a bare hand applies to one whole unit: hand-break-food@1's bounded hand force on its
 * size-scaled scale (strength x mass^(2/3)), spread over the unit, HAND_FORCE / mass^(2/3). */
function handLoad(unitMass: number): number {
  return round(Math.cbrt(HAND_FORCE ** 3 / unitMass ** 2));
}
/** examine-food@1 deterioration classes, as ex17 and ex19 use them. */
const deterioration = (fraction: number) =>
  fraction < 0.25
    ? 'little observable deterioration'
    : fraction < 0.65
      ? 'observable deterioration'
      : 'advanced deterioration';
function altered(s: V7Stack): V7Data | null {
  const h = s.processing?.[KEY];
  return h && typeof h === 'object' && !Array.isArray(h) ? h : null;
}
const responseOf = (damage: number) =>
  damage >= 1 ? 'opened' : damage > 0 ? 'cracked' : 'intact';
/** Observable residue quantity of a completed separation. */
function residueOf(j: { ledger: V7Data | null }): number {
  const residue = j.ledger?.residue;
  return residue && typeof residue === 'object' && !Array.isArray(residue)
    ? Number(residue.quantity ?? 0)
    : 0;
}

export function sampleOpeningPackage(
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
    return enclosedResources(d, unit);
  });
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Opening);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const sync = (a: V7Actor, j: Opening) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const compositionOf = (resource: string) =>
    compositions.find((d) => d.unit === resource);
  const specimenOf = (w: V7World, j: Opening) =>
    w.stacks.find((s) => s.id === j.specimen && s.reservedFor === j.id);

  /** Reusable drawing metadata from the same record the events carry. An intact or cracked
   * unit is drawn closed; contents appear only once the enclosure is open, and products,
   * residue and pieces only after a completed separation. No success badge. */
  function view(j: Opening): V7Data {
    const d = compositionOf(j.resource),
      unit = FOREST_RESOURCES.find((r) => r.id === j.resource);
    const exposed = ['opened', 'separated'].includes(j.stage) && j.damage >= 1;
    const separated = j.stage === 'separated';
    const scale = d ? Math.cbrt(d.contents.share) : 0;
    return {
      operation: id,
      workId: j.id,
      source: j.source,
      specimen: j.specimen,
      stage: j.stage,
      method: j.method,
      actor: j.owner,
      pose:
        j.method === 'hand'
          ? 'squeezing one unit between both hands'
          : j.method === 'supported-tool'
            ? 'pressing a tool down onto the unit resting on the support'
            : null,
      x: round(j.x),
      y: round(j.y),
      tool: j.tool,
      support: j.support,
      enclosure: d
        ? {
            shape: d.appearance.shape,
            length: d.appearance.length,
            width: d.appearance.width,
            color: unit?.color ?? null,
            texture: d.appearance.texture,
            fracture: separated
              ? 'split into pieces'
              : exposed
                ? 'split open'
                : j.damage > 0
                  ? 'cracked, closed'
                  : 'intact',
            crack: round(Math.min(1, j.damage)),
          }
        : null,
      contents:
        d && exposed
          ? {
              exposed: true,
              separated,
              shape: d.appearance.shape,
              length: round(d.appearance.length * scale),
              width: round(d.appearance.width * scale),
              color: d.contents.color,
              texture: d.contents.texture,
            }
          : null,
      products: separated ? j.products : null,
      residue: separated ? residueOf(j) : 0,
      badge: null,
    };
  }
  function summary(w: V7World, j: Opening): V7Data {
    return {
      workId: j.id,
      stage: j.stage,
      status: j.status,
      method: j.method,
      source: j.source,
      specimen: j.specimen,
      tool: j.tool,
      support: j.support,
      attempts: j.attempts.length,
      crack: round(Math.min(1, j.damage)),
      products: j.products,
      ledger: j.ledger,
      paidEnergy: round(j.paidEnergy),
      tick: w.tick,
      view: view(j),
    };
  }

  /** Why an own item cannot serve as a blunt pressing piece, or null (ex19 checks). */
  function pieceProblem(w: V7World, a: V7Actor, s: V7Stack | undefined) {
    const problem = ex19MaterialPiece(w, a, s);
    if (problem || !s) return problem ?? 'Name one of your own items.';
    const m = collectiveFoodProfile(w, s);
    if (!m || (m.properties?.hardness ?? 0) < 1)
      return `${s.id} is not rigid enough to press with.`;
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      return `${s.id} is fractured or too small to give a sound blunt surface.`;
    return null;
  }

  /** Method and equipment named in the action. Malformed arguments throw; a physical
   * shortcoming of the named equipment is returned as a problem. */
  function equipment(
    c: V7ActionContext,
    unit: V7Stack,
    exclude: string[],
  ): Gear | string {
    const { world: w, actor: a, action } = c;
    const method = text(action.args.method);
    const toolId = text(action.args.toolId),
      supportId = text(action.args.supportRef);
    if (method === 'hand') {
      if (toolId || supportId)
        throw nothing(
          'Hand compression uses no tool or support; use method supported-tool to press with them.',
        );
      return {
        method,
        tool: null,
        support: null,
        load: handLoad(foodUnitMass(w, unit)),
      };
    }
    if (method !== 'supported-tool')
      throw nothing('Give method: hand or supported-tool.');
    if (!toolId || !supportId)
      throw nothing(
        'Supported tool compression needs toolId (your own blunt tool) and supportRef (a rigid support).',
      );
    if (toolId === supportId || exclude.includes(toolId))
      throw nothing('The unit, tool and support must be different.');
    const tool = w.stacks.find((s) => s.id === toolId);
    const toolProblem = pieceProblem(w, a, tool);
    if (toolProblem || !tool) return toolProblem ?? 'The tool is missing.';
    const toolMaterial = collectiveFoodProfile(w, tool);
    if (!toolMaterial) return 'The tool has no represented material.';
    const o = w.objects.find((o) => o.id === supportId);
    let support: Piece, supportMaterial: V7Resource | undefined;
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
      if ((supportMaterial.properties?.hardness ?? 0) < 1)
        return 'The support is not rigid enough to press on.';
      if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
        return 'Move within reach of the support.';
      support = { kind: 'object', id: o.id, resource: supportMaterial.id };
    } else {
      if (exclude.includes(supportId))
        throw nothing('The unit, tool and support must be different.');
      const lower = w.stacks.find((s) => s.id === supportId);
      const problem =
        pieceProblem(w, a, lower) ?? ex19MaterialGround(w, a.position);
      if (problem || !lower)
        return problem ?? 'The support is missing or out of reach.';
      supportMaterial = collectiveFoodProfile(w, lower);
      if (!supportMaterial) return 'The support has no represented material.';
      support = { kind: 'item', id: lower.id, resource: supportMaterial.id };
    }
    return {
      method,
      tool: { kind: 'item', id: tool.id, resource: toolMaterial.id },
      support,
      load: Math.min(passes(toolMaterial), passes(supportMaterial)),
    };
  }

  /** The own unit named in sourceId, with its composition, or a refusal. */
  function sourceOf(c: V7ActionContext) {
    const { world: w, actor: a, action } = c;
    if (
      action.args.quantity !== undefined &&
      v7Number(action.args.quantity, 'quantity') !== 1
    )
      throw nothing('One unit per work in this version: quantity is 1.');
    const s = w.stacks.find((s) => s.id === text(action.args.sourceId));
    if (!s || s.owner !== a.id)
      throw nothing('Name one of your own items by its exact item id.');
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const d = compositionOf(s.resource),
      r = w.resources.find((r) => r.id === s.resource);
    if (!d || !r || openMaterial(r).strength <= 0)
      throw nothing(
        `No enclosure and contents are represented for ${s.resource} in this world, so it cannot be opened and separated.`,
      );
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).some((k) => k !== KEY)
    )
      throw nothing(
        'Material under another represented treatment has no opening law in this version.',
      );
    const h = altered(s);
    if (h && (h.revision !== revision || foodTenths(s.quantity) !== 10))
      throw nothing(
        'An altered unit can be worked again only as one whole unit of this operation.',
      );
    if (ex19MaterialWhole(s) < 1)
      throw nothing(`${s.id} holds less than one whole unit.`);
    const life = r.properties?.decay ?? 0;
    if (life > 0 && (s.decay ?? 0) >= life)
      throw nothing('Spoiled material cannot be worked.');
    return { s, d, r, damage: Number(h?.damage ?? 0) };
  }

  /** Opens a work record and reserves exactly one whole unit of the source. */
  function begin(
    c: V7ActionContext,
    s: V7Stack,
    r: V7Resource,
    damage: number,
  ): { j: Opening; unit: V7Stack } {
    const { world: w, actor: a } = c;
    const j = workCreate(c, 'open', 1) as Opening;
    workReserve(c, j, workAllocations(c, [{ itemId: s.id, quantity: 1 }]));
    const unit = w.stacks.find((x) => x.id === j.escrow[0]);
    if (!unit) throw new Error('The reserved unit is missing.');
    w.stacks = w.stacks.filter((x) => x.id !== s.id || x.quantity > 0);
    Object.assign(j, {
      stage: responseOf(damage),
      source: s.id,
      specimen: unit.id,
      resource: r.id,
      method: null,
      tool: null,
      support: null,
      // The selected unit's actual mass, provenance and decay at reservation.
      input: {
        item: unit.id,
        source: s.id,
        resource: r.id,
        quantity: 1,
        mass: round(foodUnitMass(w, unit)),
        origin: unit.origin,
        harvestedAt: unit.harvestedAt ?? null,
        decay: round(unit.decay ?? 0),
        crack: round(Math.min(1, damage)),
      },
      damage,
      attempts: [],
      observation: null,
      ledger: null,
      products: { contents: null, enclosure: null },
      pausedAt: null,
      endedAt: null,
    });
    c.emit(
      'sample-opening-started',
      `One whole unit of ${s.id} is reserved as ${unit.id} in opening work ${j.id}; the rest of the source is unchanged.`,
      summary(w, j),
      unit.id,
    );
    a.extensionState[stateKey] = v7Json(j);
    return { j, unit };
  }

  /** Records a pause before any charge; done work, damage and the reserved unit remain. */
  function pause(c: V7ActionContext, j: Opening, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    c.emit(
      'sample-opening-paused',
      `${reason} The work is paused before any charge; its reserved unit and recorded damage remain.`,
      summary(c.world, j),
      j.specimen,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  /** Ends open work whose reserved unit is gone; nothing is refunded or restored. */
  function lost(w: V7World, a: V7Actor, j: Opening, reason: string) {
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(w, a, j, reason, false);
    j.stage = 'failed';
    j.endedAt = w.tick;
    forestEvent(
      w,
      'sample-opening-failed',
      `${reason} The opening work ended; nothing is refunded.`,
      a.position,
      a.id,
      summary(w, j),
      j.id,
    );
    sync(a, j);
  }
  /** Pays one round of the work; a pause recorded before is resumed explicitly. */
  function pay(c: V7ActionContext, j: Opening, energy: number) {
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
        'sample-opening-resumed',
        'The paused opening work resumed after rechecking the reserved unit, light, energy and equipment.',
        summary(c.world, j),
        j.specimen,
      );
    }
  }

  /** One paid compression attempt on the reserved unit. */
  function attempt(
    c: V7ActionContext,
    j: Opening,
    unit: V7Stack,
    r: V7Resource,
    gear: Gear,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    pay(c, j, ATTEMPT);
    const strength = openMaterial(r).strength;
    // ex17/ex19 damage law: nothing below or at the strength, else (load - strength) / strength.
    const added =
      gear.load <= strength ? 0 : round((gear.load - strength) / strength);
    const before = j.damage;
    j.damage = round(j.damage + added);
    const response = responseOf(j.damage),
      crack = round(Math.min(1, j.damage));
    j.method = gear.method;
    j.tool = gear.tool?.id ?? null;
    j.support = gear.support?.id ?? null;
    j.stage = response;
    j.attempts = [
      ...j.attempts,
      {
        tick: w.tick,
        method: gear.method,
        tool: j.tool,
        support: j.support,
        response,
        crack,
      },
    ];
    if (j.damage > 0)
      unit.processing = {
        ...(unit.processing ?? {}),
        [KEY]: {
          version: 1,
          revision,
          work: j.id,
          stage: response,
          damage: j.damage,
          attempts: j.attempts.length,
          openedAt:
            response === 'opened'
              ? Number(altered(unit)?.openedAt ?? w.tick)
              : null,
        },
      };
    unit.position = { ...a.position };
    j.status = 'paused';
    j.remainingWork = response === 'opened' ? 1 : 0;
    j.initialWork = j.completedWork + j.remainingWork;
    j.reason =
      response === 'opened'
        ? 'Open: separate with this workId next, or cancel.'
        : 'Not open: another attempt is a new explicit open with this workId at full cost; or cancel.';
    const surfaces =
      gear.method === 'hand'
        ? 'hand'
        : `${gear.tool?.resource ?? ''}-on-${gear.support?.resource ?? ''}`;
    const exterior =
      response === 'intact'
        ? 'intact, no visible crack'
        : response === 'cracked'
          ? 'cracked but closed'
          : 'split open';
    const life = r.properties?.decay ?? 0;
    openRemember(c, {
      key: `${r.id}:enclosure-response:${surfaces}:${response}`,
      subject: r.id,
      property: 'response of one whole unit to one compression opening attempt',
      value: {
        unit: unit.id,
        method: gear.method,
        tool: j.tool,
        support: j.support,
        response,
        exterior,
        crack,
        interior:
          response === 'opened'
            ? `exposed: ${deterioration(life > 0 ? Math.min(1, (unit.decay ?? 0) / life) : 0)}`
            : 'not visible; only the exterior can be seen',
      },
      method:
        gear.method === 'hand'
          ? 'one bare-hand squeeze of one whole unit, then a direct look'
          : 'one press of a blunt tool on the unit resting on a rigid support, then a direct look',
      condition: `${openConditions(w, a.position).regime}; by eye and touch in light`,
      verified: true,
    });
    const data = {
      ...summary(w, j),
      response,
      exterior,
      energy: ATTEMPT,
      newDamage: j.damage > before,
    };
    c.emit(
      'sample-opening-attempted',
      gear.method === 'hand'
        ? `One bare-hand squeeze of ${unit.id}: ${exterior}.`
        : `One press of ${unit.id} with ${j.tool ?? ''} on ${j.support ?? ''}: ${exterior}.`,
      data,
      unit.id,
    );
    if (response === 'cracked' && j.damage > before)
      c.emit(
        'sample-opening-fractured',
        `The enclosure of ${unit.id} cracked without opening; the interior is still not visible. The crack stays on the unit.`,
        data,
        unit.id,
      );
    if (response === 'opened' && before < 1)
      c.emit(
        'sample-opening-opened',
        `The enclosure of ${unit.id} split open and its contents are exposed but not yet separated. ${UNKNOWN.join(', ')} are not established.`,
        data,
        unit.id,
      );
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, unit.id, j.source] };
  }

  /** One paid round that takes the contents out of a split enclosure into their own items. */
  function separate(
    c: V7ActionContext,
    j: Opening,
    unit: V7Stack,
    r: V7Resource,
    d: EnclosedComposition,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    pay(c, j, SEPARATE);
    const contents = foodTenths(d.contents.share),
      recovered = Math.round(contents * d.contents.recoverable),
      attached = contents - recovered,
      enclosure = 10 - contents,
      mass = foodUnitMass(w, unit),
      part = (tenths: number) => ({
        quantity: tenths / 10,
        mass: round((mass * tenths) / 10),
      });
    /** A carried part with the unit's origin, age and decay (fracture resets neither). */
    const product = (resource: string, tenths: number): V7Stack => ({
      id: v7Id(w, 'item'),
      resource,
      quantity: tenths / 10,
      quantityTenths: tenths,
      position: { ...a.position },
      owner: a.id,
      origin: unit.origin,
      ...(unit.harvestedAt === undefined
        ? {}
        : { harvestedAt: unit.harvestedAt }),
      decay: unit.decay ?? 0,
    });
    const kernel =
      recovered > 0 ? product(d.contents.resource, recovered) : null;
    // Contents that stay attached remain with the enclosure pieces, without nutrition.
    const shell = product(d.enclosure.resource, enclosure + attached);
    w.stacks = [
      ...w.stacks.filter((s) => s.id !== unit.id),
      ...(kernel ? [kernel] : []),
      shell,
    ];
    j.escrow = [];
    j.ledger = {
      input: { item: unit.id, resource: r.id, ...part(10) },
      enclosure: {
        item: shell.id,
        resource: shell.resource,
        ...part(enclosure),
      },
      recovered: {
        item: kernel?.id ?? null,
        resource: d.contents.resource,
        ...part(recovered),
      },
      attached: { item: attached > 0 ? shell.id : null, ...part(attached) },
      fragments: part(0),
      residue: part(0),
      total: part(enclosure + recovered + attached),
    };
    j.products = { contents: kernel?.id ?? null, enclosure: shell.id };
    j.outputs = [...(kernel ? [kernel.id] : []), shell.id];
    j.target = kernel?.id ?? shell.id;
    j.stage = 'separated';
    j.status = 'completed';
    j.remainingWork = 0;
    j.reason = 'Contents separated from the split enclosure.';
    j.endedAt = w.tick;
    const life = r.properties?.decay ?? 0,
      seen = deterioration(
        life > 0 ? Math.min(1, (unit.decay ?? 0) / life) : 0,
      );
    j.observation = {
      enclosure: {
        item: shell.id,
        state: 'split open, in pieces',
        color: w.resources.find((x) => x.id === r.id)?.color ?? null,
        texture: d.appearance.texture,
      },
      contents: kernel
        ? {
            item: kernel.id,
            form: 'loose whole contents',
            color: d.contents.color,
            texture: d.contents.texture,
            condition: seen,
          }
        : null,
      visibility: 'by eye and touch in light; surfaces only, no instrument',
      unknown: UNKNOWN,
    };
    openRemember(c, {
      key: `${r.id}:enclosure-contents:${kernel ? 'recovered' : 'none'}:${seen}`,
      subject: r.id,
      property: 'contents found in one split-open unit',
      value: {
        unit: unit.id,
        contents: kernel?.id ?? null,
        enclosure: shell.id,
        recovered: recovered / 10,
        enclosurePieces: (enclosure + attached) / 10,
        observation: j.observation,
      },
      method: 'one round of hand separation and a direct look',
      condition: `${openConditions(w, a.position).regime}; ${UNKNOWN.join(', ')} not established`,
      verified: true,
    });
    c.emit(
      'sample-opening-separated',
      kernel
        ? `The contents of ${unit.id} were separated by hand into ${kernel.id} (${String(kernel.quantity)} of a unit's mass) and the enclosure pieces into ${shell.id} (${String(shell.quantity)}). The parts carry the unit's origin, age and decay. ${UNKNOWN.join(', ')} are not established.`
        : `No contents could be taken out of ${unit.id} by hand; the enclosure pieces are ${shell.id}.`,
      { ...summary(w, j), observation: j.observation, energy: SEPARATE },
      kernel?.id ?? shell.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, unit.id, shell.id, ...(kernel ? [kernel.id] : [])],
    };
  }

  /** The person's own work named by workId, else their one open work. */
  function named(c: V7ActionContext): Opening | undefined {
    const workId = text(c.action.args.workId);
    if (!workId) return current(c.world, c.actor);
    const j = works(c.world).find(
      (j) => j.id === workId && j.owner === c.actor.id,
    );
    if (!j) throw nothing('No opening work of yours has this workId.');
    if (!isOpen(j)) throw nothing(`Opening work ${j.id} is already settled.`);
    return j;
  }
  /** Rechecks of a paid round on existing work: null when it may proceed. */
  function recheck(c: V7ActionContext, energy: number): string | null {
    return (
      ex19MaterialDark(c.world, c.actor) ??
      (c.actor.vitals.energy + 1e-8 < energy
        ? `This round needs ${String(energy)} energy.`
        : null)
    );
  }

  function openMode(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    if (text(action.args.workId)) {
      const j = named(c);
      if (!j) throw nothing('No opening work of yours has this workId.');
      if (j.stage === 'opened')
        throw nothing(
          'The enclosure is already open: separate it with this workId, or cancel.',
        );
      const unit = specimenOf(w, j),
        r = w.resources.find((x) => x.id === j.resource);
      if (!unit || !r) {
        lost(w, a, j, 'The reserved unit is gone.');
        return { complete: true, remaining: 0, writes: [j.id] };
      }
      const gear = equipment(c, unit, [unit.id, j.source]);
      const problem = typeof gear === 'string' ? gear : recheck(c, ATTEMPT);
      if (problem || typeof gear === 'string')
        return pause(c, j, problem ?? 'The equipment is unusable.');
      return attempt(c, j, unit, r, gear);
    }
    const existing = current(w, a);
    if (existing)
      throw nothing(
        `Your opening work ${existing.id} is still open; continue it with its workId, or cancel it.`,
      );
    const { s, r, damage } = sourceOf(c);
    if (damage >= 1)
      throw nothing(
        `${s.id} is already open: use separate with this sourceId.`,
      );
    const gear = equipment(c, s, [s.id]);
    if (typeof gear === 'string') throw nothing(gear);
    const problem = recheck(c, ATTEMPT);
    if (problem) throw nothing(problem);
    const { j, unit } = begin(c, s, r, damage);
    return attempt(c, j, unit, r, gear);
  }

  function separateMode(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    const j = named(c);
    if (j) {
      const unit = specimenOf(w, j),
        r = w.resources.find((x) => x.id === j.resource),
        d = compositionOf(j.resource);
      if (!unit || !r || !d) {
        lost(w, a, j, 'The reserved unit is gone.');
        return { complete: true, remaining: 0, writes: [j.id] };
      }
      if (j.stage !== 'opened')
        throw nothing(
          `The enclosure of ${unit.id} is ${j.stage}: only its exterior can be seen; the interior cannot be inspected or separated before it is open.`,
        );
      const problem = recheck(c, SEPARATE);
      if (problem) return pause(c, j, problem);
      return separate(c, j, unit, r, d);
    }
    if (!text(action.args.sourceId))
      throw nothing(
        'You have no open opening work; give the workId of open work or the sourceId of your own opened unit.',
      );
    const { s, r, d, damage } = sourceOf(c);
    if (damage < 1)
      throw nothing(
        `${s.id} is not open: only its exterior can be seen; the interior cannot be inspected or separated. Open it first.`,
      );
    const problem = recheck(c, SEPARATE);
    if (problem) throw nothing(problem);
    const started = begin(c, s, r, damage);
    started.j.stage = 'opened';
    return separate(c, started.j, started.unit, r, d);
  }

  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = named(c);
    if (!j) throw nothing('You have no open opening work to cancel.');
    const unit = specimenOf(w, j);
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Opening work cancelled; the reserved unit returns to you as it now is. Spent energy, time and damage are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.endedAt = w.tick;
    c.emit(
      'sample-opening-cancelled',
      unit
        ? `Opening work cancelled. ${unit.id} is yours again, ${j.damage > 0 ? `as an altered unit (${responseOf(j.damage)})` : 'untouched'}.`
        : 'Opening work cancelled; its reserved unit was already gone.',
      { ...summary(w, j), released: unit ? [unit.id] : [] },
      unit?.id ?? j.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(unit ? [unit.id] : [])],
    };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'open') return openMode(c);
    if (mode === 'separate') return separateMode(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing('Give mode: open, separate or cancel.');
  }

  /** The reserved unit stays with its owner; a unit that spoiled or vanished ends the work. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      const unit = specimenOf(w, j);
      if (!unit) {
        lost(w, a, j, 'The reserved unit spoiled or is gone.');
        continue;
      }
      unit.position = { ...a.position };
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Opening and separation of an owned enclosed material: one whole unit is reserved in a work record and pressed once per paid round by hand or with an own blunt tool on a rigid support under the ex17/ex19 compression law; a split-open unit is separated by hand in one paid round into a contents item and an enclosure item whose quantities are their represented mass shares and sum to the unit.',
    reuse: {
      experiment:
        'ex19 shell-compression-opening@1 (compression between surfaces, damage accumulation, firmness and deterioration classes, shared light, piece, contact and ground checks) and ex17 mechanical-food-handling@1 (load transmission strength x (1 - flexibility)); foundation-open@1 open.probe press rule (a material holds a load not above its strength, strength = hardness / 10) and reach rule, without invoking the probe or its 0.5 energy and 0.1 sample; ex16 hand-break-food@1 bounded bare-hand force; ex13 owned-hazelnut exterior and opening models (appearance only); ex20 apply-marking-material@1 helpers (openMaterial, openConditions, openRemember, tenths accounting, collective-work escrow)',
      source:
        'long-ex19-material-contact.ts (ex19MaterialDark, ex19MaterialGround, ex19MaterialPiece, ex19MaterialContact, ex19MaterialWhole); long-hand-break-food.ts (HAND_FORCE); open-physical.ts; open-foundation.ts (openRemember); collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); forest-food-accounting.ts; collective-food-profile.ts; forest-foundation.ts (hazelnut row); continuous-geometry.ts',
      description:
        'Implementation reuse only; ex16, ex17, ex19 and ex20 packages are unchanged and no ability, item or mastery is inherited. New: the enclosed composition (hazelnut kernel 0.4, shell 0.6 by mass, kernel fully recoverable from a split shell), the two derived part materials, the hand load and the separation ledger.',
    },
    abilities: [
      {
        id,
        name: 'Open and separate a sample',
        function:
          'Try to open one whole unit of your own enclosed material, such as a nut, by squeezing it by hand or pressing it with your own blunt tool on a rigid support; once it is open, separate its contents from the enclosure into items of their own.',
        equivalence: 'material:enclosed-unit:compression-open-separate:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['open', 'separate', 'cancel'] },
            sourceId: { type: 'string' },
            quantity: { type: 'number', minimum: 1, maximum: 1 },
            method: { type: 'string', enum: ['hand', 'supported-tool'] },
            toolId: { type: 'string' },
            supportRef: { type: 'string' },
            workId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: {
          sourceId: 'optional-exact-visible',
          toolId: 'optional-exact-visible',
          supportRef: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 1,
        costs:
          'Study: 1 round. open: sourceId, your own unreserved, unspoiled, untreated item of an enclosed material with a represented composition; quantity 1. method hand, or supported-tool with toolId (your own whole, rigid, unfractured inedible piece) and supportRef (a solid unreserved inedible object in reach, not a plant or animal, or another such own piece on firm ground where you stand). One round, 0.5 energy; the first attempt reserves one unit in a work record (workId); open with workId tries again at full cost. separate: workId of open work (or sourceId of your own opened unit); one round, 0.2 energy. cancel: one round, no energy. All need light (outdoors daylight above 0.1, indoors light above 0.1). Checks run before any charge; a failed recheck pauses existing work at no charge.',
        effects:
          'Strength is hardness / 10. A tool passes the lower of tool and support strength x (1 - flexibility), so neither is worn; a bare hand passes at most the bounded hand force of hand-break-food spread over the unit (0.1 / unit mass^(2/3)). At or below the unit strength it stays intact; above it, damage (load - strength) / strength accumulates on the unit: below 1 cracked and closed, at 1 split open. A failed attempt is a real result; repeating it changes nothing. Separation of an open unit makes a contents item and an enclosure item whose quantities are their mass shares of the unit and sum to it; the contents carry all of its food value and toxicity, whatever they are, and its origin, age and decay; the enclosure carries none. Before opening, only the exterior is seen. Cancel returns the unit to you as it now is; death leaves it where you fell. Nothing is refunded or restored; edibility, nutrition, toxins and safety stay unknown; no eating, reward or comfort.',
        handler,
        revision,
        authored: false,
        // The separation event carries no qualified flag: this operation earns no practice milestone.
        practiceEvidence: 'sample-opening-separated',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Each mode takes one round and commits at its end. The work record (workId), reserved unit, damage, method and equipment persist between rounds; open or separate with the workId continues after rechecks.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'sample-opening-started',
      'sample-opening-attempted',
      'sample-opening-fractured',
      'sample-opening-opened',
      'sample-opening-separated',
      'sample-opening-paused',
      'sample-opening-resumed',
      'sample-opening-cancelled',
      'sample-opening-failed',
    ],
    resources,
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        const unit = specimenOf(w, j);
        j.x = a.position.x;
        j.y = a.position.y;
        workStop(
          w,
          a,
          j,
          'Performer died; the reserved unit stays where they fell as it now is. Nothing is refunded or restored.',
          true,
        );
        j.stage = 'failed';
        j.endedAt = w.tick;
        forestEvent(
          w,
          'sample-opening-failed',
          'Opening work ended by death; the unit was neither restored nor separated.',
          a.position,
          a.id,
          { ...summary(w, j), released: unit ? [unit.id] : [] },
          unit?.id ?? j.id,
        );
        sync(a, j);
      }
    },
  };
}

/** ex20: Lin's opening and separation of an owned hazelnut. */
export const LONG_EX20_SAMPLE_OPENING = sampleOpeningPackage(
  'open-and-separate-sample',
  'long-ex20',
  [HAZELNUT_COMPOSITION],
);
