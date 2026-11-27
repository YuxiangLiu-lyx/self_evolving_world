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
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Reach, v7ShapeDistance, v7Visible } from './continuous-geometry.js';
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
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';
import {
  HAZELNUT_COMPOSITION,
  SAMPLE_OPENING_LAWS,
  enclosedResources,
} from './long-ex20-sample-opening.js';
import type { EnclosedComposition } from './long-ex20-sample-opening.js';

/** A general inspection and shelling of owned shelled food in finite batches: whole units are
 * inspected by eye for visible defects, or reserved and shelled one unit at a time, a press
 * round under the ex17/ex19/ex20 compression law and then a separation round into a kernel
 * item and a shell item by the represented composition. Kernels stay unverified specimens. */

/** Inspection: one round, 0.2 energy per unit inspected (World Agent specification). */
const INSPECT = 0.2;
/** Shelling: two active rounds per unit, 0.5 energy per round (World Agent specification). */
const ROUND = 0.5;
/** A finite batch: at most five whole units, the stock a represented hazelnut plant holds. */
const BATCH = 5;
/** Processing key of a unit altered, set aside or produced by this operation. */
const KEY = 'shelledFood';
const SPECIMEN = 'unverified shelled specimen';
/** Represented treatments without a shelling law in this version (as ex20 refuses them). */
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
const UNKNOWN = ['edibility', 'nutrition', 'toxins', 'safety', 'preparation'];
const { passes, handLoad, deterioration } = SAMPLE_OPENING_LAWS;

type Piece = { kind: 'item' | 'object'; id: string; resource: string };
interface Gear {
  method: 'hand' | 'supported';
  implement: Piece | null;
  support: Piece | null;
  /** Load reaching the unit; never stored or reported (it derives from hidden properties). */
  load: number;
  /** Surfaces of the method, for personal records and futile-repeat refusals. */
  key: string;
}
/** One unit of the batch: untouched (pending), worked, or separated into its parts. */
interface Unit extends V7Data {
  index: number;
  item: string | null;
  stage: string;
  damage: number;
  presses: number;
  kernel: string | null;
  shell: string | null;
  verdict: string | null;
  condition: string | null;
}
interface Press extends V7Data {
  tick: number;
  unit: number;
  method: string;
  implement: string | null;
  support: string | null;
  response: string;
  crack: number;
}
interface Totals extends V7Data {
  input: number;
  kernel: number;
  shell: number;
  rejects: number;
  losses: number;
}
/** The persistent shelling record: reserved batch, current unit, substep and outputs. */
interface Shelling extends CollectiveWork {
  stage: string;
  source: string;
  resource: string;
  quantity: number;
  batch: string | null;
  method: string | null;
  implement: string | null;
  support: string | null;
  current: number;
  units: Unit[];
  presses: Press[];
  held: string[];
  input: V7Data;
  ledger: Totals;
  pausedAt: number | null;
  startedAt: number;
  endedAt: number | null;
}

const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const responseOf = (damage: number) =>
  damage >= 1 ? 'opened' : damage > 0 ? 'cracked' : 'intact';
const integrity = (stage: string) =>
  stage === 'separated'
    ? 'split into pieces'
    : stage === 'opened'
      ? 'split open'
      : stage === 'cracked'
        ? 'cracked, closed'
        : 'intact';
function recordOf(s: V7Stack): V7Data | null {
  const h = s.processing?.[KEY];
  return h && typeof h === 'object' && !Array.isArray(h) ? h : null;
}
/** Visible condition by the examine-food@1 deterioration classes ex17, ex19 and ex20 use. */
function conditionOf(s: V7Stack, r: V7Resource) {
  const life = r.properties?.decay ?? 0,
    decay = s.decay ?? 0;
  const seen = deterioration(life > 0 ? Math.min(1, decay / life) : 0);
  const spoiled = life > 0 && decay >= life;
  return {
    seen,
    spoiled,
    suspect: spoiled || seen !== 'little observable deterioration',
  };
}

export function shelledFoodPackage(
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
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Shelling);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const sync = (a: V7Actor, j: Shelling) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const compositionOf = (resource: string) =>
    compositions.find((d) => d.unit === resource);
  const reserved = (w: V7World, j: Shelling, item: string | null) =>
    item
      ? w.stacks.find((s) => s.id === item && s.reservedFor === j.id)
      : undefined;
  const unitOf = (j: Shelling) => j.units[j.current];

  /** Reusable drawing metadata from the same record the events carry. Intact, cracked and
   * split units, separated kernels, shells and rejects appear only as they exist; no badge. */
  function view(w: V7World, j: Shelling): V7Data {
    const u = unitOf(j);
    const done = j.units.filter((x) => x.stage === 'separated');
    return {
      operation: id,
      workId: j.id,
      phase: j.stage,
      substep: !u
        ? 'done'
        : u.stage === 'opened'
          ? 'separate'
          : u.stage === 'separated'
            ? 'done'
            : 'press',
      actor: j.owner,
      source: j.source,
      workpiece: u?.stage === 'separated' ? null : (u?.item ?? null),
      x: round(j.x),
      y: round(j.y),
      quantity: j.quantity,
      mass: j.input.mass ?? null,
      progress: {
        unitsSeparated: done.length,
        of: j.quantity,
        paidRounds: j.completedWork,
      },
      shell: u ? integrity(u.stage) : null,
      crack: u ? round(Math.min(1, u.damage)) : 0,
      method: j.method,
      implement: j.implement,
      support: j.support,
      pose:
        j.method === 'hand'
          ? 'squeezing one unit between both hands'
          : j.method === 'supported'
            ? 'pressing the implement down onto one unit resting on the support'
            : null,
      outputs: {
        kernels: done
          .filter((x) => x.verdict === SPECIMEN)
          .flatMap((x) => (x.kernel ? [x.kernel] : [])),
        shells: done.flatMap((x) => (x.shell ? [x.shell] : [])),
        rejects: done
          .filter((x) => x.verdict === 'rejected')
          .flatMap((x) => (x.kernel ? [x.kernel] : [])),
      },
      defects: done
        .filter((x) => x.verdict === 'rejected')
        .map((x) => ({ unit: x.index, condition: x.condition })),
      status: j.status,
      startedAt: j.startedAt,
      updatedAt: w.tick,
      badge: null,
    };
  }
  function summary(w: V7World, j: Shelling): V7Data {
    return {
      workId: j.id,
      stage: j.stage,
      status: j.status,
      source: j.source,
      quantity: j.quantity,
      current: j.current,
      units: j.units,
      presses: j.presses.length,
      input: j.input,
      ledger: j.ledger,
      paidEnergy: round(j.paidEnergy),
      tick: w.tick,
      view: view(w, j),
    };
  }

  /** Why an own item cannot serve as a clean, sound, hard blunt piece, or null (ex19/ex20). */
  function pieceProblem(w: V7World, a: V7Actor, s: V7Stack | undefined) {
    const problem = ex19MaterialPiece(w, a, s);
    if (problem || !s) return problem ?? 'Name one of your own items.';
    const m = collectiveFoodProfile(w, s);
    if (!m || (m.properties?.hardness ?? 0) < 1)
      return `${s.id} is not hard enough to press with.`;
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      return `${s.id} is fractured or too small to give a sound blunt surface.`;
    if (Object.keys(s.processing ?? {}).length)
      return `${s.id} carries a represented treatment, so it is not a clean surface.`;
    return null;
  }

  /** Method and equipment from the action, else those stored on the work. Malformed arguments
   * throw; a physical shortcoming of the named equipment is returned as a problem. */
  function gearOf(
    c: V7ActionContext,
    unitMass: number,
    exclude: string[],
    j: Shelling | null,
  ): Gear | string {
    const { world: w, actor: a, action } = c;
    const given = !!(
      text(action.args.implementRef) || text(action.args.supportRef)
    );
    const implementId = given
        ? text(action.args.implementRef)
        : (j?.implement ?? ''),
      supportId = given ? text(action.args.supportRef) : (j?.support ?? '');
    if (!implementId && !supportId)
      return {
        method: 'hand',
        implement: null,
        support: null,
        load: handLoad(unitMass),
        key: 'hand',
      };
    if (!implementId || !supportId)
      throw nothing(
        'Shelling on a support needs both implementRef (your own blunt implement) and supportRef (a clean, stable, hard support); give neither for the hand method.',
      );
    if (implementId === supportId || exclude.includes(implementId))
      throw nothing('The unit, implement and support must be different.');
    const tool = w.stacks.find((s) => s.id === implementId);
    const toolProblem = pieceProblem(w, a, tool);
    if (toolProblem || !tool) return toolProblem ?? 'The implement is missing.';
    const toolMaterial = collectiveFoodProfile(w, tool);
    if (!toolMaterial) return 'The implement has no represented material.';
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
        return 'The support is not hard enough to press on.';
      if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
        return 'Move within reach of the support.';
      if (
        w.stacks.some(
          (s) =>
            s.owner === null && v7ShapeDistance(s.position, o.spatial) <= 0,
        )
      )
        return 'Loose material lies on the support, so it is not clean.';
      support = { kind: 'object', id: o.id, resource: supportMaterial.id };
    } else {
      if (exclude.includes(supportId))
        throw nothing('The unit, implement and support must be different.');
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
      method: 'supported',
      implement: { kind: 'item', id: tool.id, resource: toolMaterial.id },
      support,
      load: Math.min(passes(toolMaterial), passes(supportMaterial)),
      key: `${toolMaterial.id}-on-${supportMaterial.id}`,
    };
  }
  /** Own verified record that this method left the shell of this material intact. */
  const heldBefore = (a: V7Actor, resource: string, key: string) =>
    a.memory.knowledge?.[`${resource}:shell-press:${key}:held`]?.verified ===
    true;
  const heldText = (g: Gear) =>
    g.method === 'hand'
      ? 'a bare hand'
      : `${g.implement?.resource ?? ''} pressed on ${g.support?.resource ?? ''}`;

  /** The own item named in targetStack, its composition and the selected whole units. */
  function sourceOf(c: V7ActionContext) {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((s) => s.id === text(action.args.targetStack));
    if (!s || s.owner !== a.id)
      throw nothing(
        'Name one of your own items by its exact item id in targetStack.',
      );
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const d = compositionOf(s.resource),
      r = w.resources.find((r) => r.id === s.resource);
    if (!d || !r || openMaterial(r).strength <= 0)
      throw nothing(
        `No shell and kernel are represented for ${s.resource} in this world, so it cannot be inspected or shelled here.`,
      );
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).some((k) => k !== KEY)
    )
      throw nothing(
        'Material under another represented treatment has no shelling law in this version.',
      );
    const h = recordOf(s);
    if (h && h.revision !== revision)
      throw nothing('This unit carries another revision of this record.');
    const q =
      action.args.quantity === undefined
        ? 1
        : v7Number(action.args.quantity, 'quantity', 1, BATCH);
    if (!Number.isSafeInteger(q))
      throw nothing('quantity is a whole number of units.');
    if (ex19MaterialWhole(s) < q)
      throw nothing(
        `${s.id} holds ${String(s.quantity)}; ${String(q)} whole unit(s) were selected.`,
      );
    const damage = Number(h?.damage ?? 0);
    if (damage > 0 && (q !== 1 || foodTenths(s.quantity) !== 10))
      throw nothing(
        'A cracked or opened unit is worked alone: quantity 1 of one whole unit.',
      );
    return { s, d, r, q, h, damage };
  }

  /** Sets the inspected portion aside as its own rejected item; it stays the same material. */
  function setAside(
    c: V7ActionContext,
    s: V7Stack,
    q: number,
    reasons: string[],
  ): V7Stack {
    const { world: w, actor: a } = c;
    let target = s;
    if (foodTenths(s.quantity) > q * 10) {
      target = {
        ...materialPortion(s, q * 10),
        id: v7Id(w, 'item'),
        quantity: q,
        quantityTenths: q * 10,
        owner: a.id,
        position: { ...a.position },
      };
      foodSetQuantity(s, foodTenths(s.quantity) - q * 10);
      w.stacks.push(target);
    }
    target.processing = {
      ...(target.processing ?? {}),
      [KEY]: {
        ...(recordOf(target) ?? {}),
        version: 1,
        revision,
        verdict: 'rejected',
        reasons,
        inspectedAt: w.tick,
        by: a.id,
      },
    };
    return target;
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    if (
      text(action.args.implementRef) ||
      text(action.args.supportRef) ||
      text(action.args.workId)
    )
      throw nothing(
        'Inspection is by eye and hand: it takes targetStack and quantity only.',
      );
    const { s, r, q, h } = sourceOf(c);
    const dark = ex19MaterialDark(w, a);
    if (dark) throw nothing(dark);
    const energy = round(INSPECT * q);
    if (a.vitals.energy + 1e-8 < energy)
      throw nothing(
        `Inspecting ${String(q)} unit(s) needs ${String(energy)} energy.`,
      );
    v7Spend(a, energy);
    const shell = integrity(responseOf(Number(h?.damage ?? 0)));
    const base = {
      operation: id,
      phase: 'inspect',
      actor: a.id,
      source: s.id,
      quantity: q,
      x: round(a.position.x),
      y: round(a.position.y),
      shell,
      updatedAt: w.tick,
      badge: null,
    };
    c.emit(
      'shelled-food-inspect-started',
      `Inspecting ${String(q)} unit(s) of ${s.id} by eye and hand.`,
      { energy, view: { ...base, status: 'inspecting' } },
      s.id,
    );
    const k = conditionOf(s, r);
    const reasons = [
      ...(k.spoiled ? ['spoiled'] : []),
      ...(k.seen !== 'little observable deterioration' ? [k.seen] : []),
    ];
    const defects = [
      ...reasons,
      ...(shell !== 'intact' ? [`shell ${shell}`] : []),
    ];
    for (const defect of defects)
      c.emit(
        'shelled-food-defect-observed',
        `Visible defect on ${s.id}: ${defect}.`,
        {
          defect,
          rejected: reasons.includes(defect),
          view: { ...base, status: 'inspecting', defects },
        },
        s.id,
      );
    const reject = reasons.length ? setAside(c, s, q, reasons) : null;
    const observation = {
      item: s.id,
      resource: s.resource,
      name: r.name,
      quantity: q,
      origin: s.origin,
      harvestedAt: s.harvestedAt ?? null,
      maturity:
        s.harvestedAt === undefined
          ? 'not established by eye'
          : 'ripe: taken as ripe stock from a plant',
      shell,
      mould: 'none seen; mould is not represented in this world',
      infestation: 'none seen; infestation is not represented in this world',
      deterioration: k.seen,
      spoiled: k.spoiled,
      verdict: reject ? 'rejected' : 'accepted for shelling',
      reasons,
      setAside: reject?.id ?? null,
      evidence: 'by eye and touch in light; exterior only, no instrument',
      unknown: [...UNKNOWN, ...(shell === 'split open' ? [] : ['interior'])],
    };
    openRemember(c, {
      key: `${s.id}:shelled-food-inspection`,
      subject: s.resource,
      property: 'visible condition of whole units before shelling',
      value: observation,
      method: 'direct look and handling of each selected unit',
      condition: `${openConditions(w, a.position).regime}; external inspection only, not a safety test`,
      verified: false,
    });
    c.emit(
      'shelled-food-inspected',
      reject
        ? `${String(q)} unit(s) of ${s.id} show ${reasons.join(', ')} and were set aside as rejected item ${reject.id}; they are not shelled. External inspection is not a safety test.`
        : `${String(q)} unit(s) of ${s.id}: ripe, shell ${shell}, ${k.seen}; no mould or infestation is represented. Accepted for shelling; external inspection is not a safety test.`,
      {
        energy,
        observation,
        view: {
          ...base,
          status: 'completed',
          defects,
          verdict: observation.verdict,
        },
      },
      reject?.id ?? s.id,
    );
    return {
      complete: true,
      remaining: 0,
      writes: [s.id, ...(reject && reject.id !== s.id ? [reject.id] : [])],
    };
  }

  /** Opens a work record and reserves the selected batch from the exact owned stack. */
  function begin(
    c: V7ActionContext,
    s: V7Stack,
    r: V7Resource,
    q: number,
    damage: number,
  ): Shelling {
    const { world: w, actor: a } = c;
    const j = workCreate(c, 'shell', 2 * q) as Shelling;
    workReserve(c, j, workAllocations(c, [{ itemId: s.id, quantity: q }]));
    const batch = w.stacks.find((x) => x.id === j.escrow[0]);
    if (!batch) throw new Error('The reserved batch is missing.');
    w.stacks = w.stacks.filter((x) => x.id !== s.id || x.quantity > 0);
    Object.assign(j, {
      stage: 'shelling',
      source: s.id,
      resource: r.id,
      quantity: q,
      batch: batch.id,
      method: null,
      implement: null,
      support: null,
      current: 0,
      units: Array.from({ length: q }, (_, i): Unit => ({
        index: i,
        item: null,
        stage: i === 0 && damage > 0 ? responseOf(damage) : 'pending',
        damage: i === 0 ? damage : 0,
        presses: 0,
        kernel: null,
        shell: null,
        verdict: null,
        condition: null,
      })),
      presses: [],
      held: [],
      // The selected units' actual mass, provenance and decay at reservation.
      input: {
        item: batch.id,
        source: s.id,
        resource: r.id,
        quantity: q,
        mass: round(q * foodUnitMass(w, batch)),
        origin: batch.origin,
        harvestedAt: batch.harvestedAt ?? null,
        decay: round(batch.decay ?? 0),
        crack: round(Math.min(1, damage)),
      },
      ledger: { input: q, kernel: 0, shell: 0, rejects: 0, losses: 0 },
      pausedAt: null,
      startedAt: w.tick,
      endedAt: null,
    });
    c.emit(
      'shelled-food-shelling-started',
      `${String(q)} whole unit(s) of ${s.id} are reserved as ${batch.id} in shelling work ${j.id}; the rest of the source is unchanged.`,
      summary(w, j),
      batch.id,
    );
    sync(a, j);
    return j;
  }

  /** The next whole unit to work: the batch item itself when one unit is left, else one unit
   * split off it, still reserved for the work. */
  function takeUnit(w: V7World, j: Shelling): V7Stack | undefined {
    const batch = reserved(w, j, j.batch);
    if (!batch) return undefined;
    if (foodTenths(batch.quantity) <= 10) {
      j.batch = null;
      return batch;
    }
    const unit: V7Stack = {
      ...materialPortion(batch, 10),
      id: v7Id(w, 'item'),
      quantity: 1,
      quantityTenths: 10,
    };
    foodSetQuantity(batch, foodTenths(batch.quantity) - 10);
    w.stacks.push(unit);
    j.escrow.push(unit.id);
    return unit;
  }

  /** Nominal paid rounds left: one for an open unit, two for every closed or pending one. */
  function remaining(j: Shelling): number {
    return j.units
      .slice(j.current)
      .reduce(
        (n, u) =>
          n + (u.stage === 'separated' ? 0 : u.stage === 'opened' ? 1 : 2),
        0,
      );
  }
  function writes(j: Shelling, extra: string[] = []) {
    return [...new Set([j.id, ...j.escrow, ...j.outputs, ...extra])];
  }

  /** Records a pause before any charge; done work, damage and reserved units remain. */
  function pause(c: V7ActionContext, j: Shelling, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    c.emit(
      'shelled-food-paused',
      `${reason} The shelling work is paused before any charge; reserved units and recorded damage remain.`,
      summary(c.world, j),
      j.id,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: writes(j) };
  }
  /** Ends open work whose reserved material is gone; nothing is refunded or restored. */
  function lost(w: V7World, a: V7Actor, j: Shelling, reason: string) {
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(w, a, j, reason, false);
    j.stage = 'failed';
    j.endedAt = w.tick;
    forestEvent(
      w,
      'shelled-food-failed',
      `${reason} The shelling work ended; untouched reserved units return to their owner and nothing is refunded.`,
      a.position,
      a.id,
      { ...summary(w, j), result: 'material lost' },
      j.id,
    );
    sync(a, j);
  }
  /** Pays one round of the work; a pause recorded before is resumed explicitly. */
  function pay(c: V7ActionContext, j: Shelling) {
    const resumed = j.pausedAt !== null;
    j.remainingWork = Math.max(1, j.remainingWork);
    j.initialWork = j.completedWork + j.remainingWork;
    if (!workPay(c, j, ROUND))
      throw new Error('Energy changed before the paid round.');
    c.actor.vitals.energy = round(Math.max(0, c.actor.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'shelled-food-resumed',
        'The paused shelling work resumed after rechecking the reserved units, light, energy and equipment.',
        summary(c.world, j),
        j.id,
      );
    }
  }
  /** Rechecks of a paid round: null when it may proceed. */
  function recheck(c: V7ActionContext): string | null {
    return (
      ex19MaterialDark(c.world, c.actor) ??
      (c.actor.vitals.energy + 1e-8 < ROUND
        ? `A shelling round needs ${String(ROUND)} energy.`
        : null)
    );
  }

  /** One paid press round on the current unit: positioning and compression. */
  function press(
    c: V7ActionContext,
    j: Shelling,
    u: Unit,
    piece: V7Stack,
    r: V7Resource,
    g: Gear,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    pay(c, j);
    const strength = openMaterial(r).strength;
    // ex17/ex19/ex20 damage law: nothing at or below the strength, else (load - strength) / strength.
    const added =
      g.load <= strength ? 0 : round((g.load - strength) / strength);
    u.item = piece.id;
    u.damage = round(u.damage + added);
    u.presses += 1;
    const response = responseOf(u.damage),
      crack = round(Math.min(1, u.damage));
    u.stage = response;
    j.method = g.method;
    j.implement = g.implement?.id ?? null;
    j.support = g.support?.id ?? null;
    j.presses = [
      ...j.presses,
      {
        tick: w.tick,
        unit: u.index,
        method: g.method,
        implement: j.implement,
        support: j.support,
        response,
        crack,
      },
    ];
    if (u.damage > 0)
      piece.processing = {
        ...(piece.processing ?? {}),
        [KEY]: {
          version: 1,
          revision,
          work: j.id,
          part: 'unit',
          stage: response,
          damage: u.damage,
          presses: u.presses,
          openedAt:
            response === 'opened'
              ? Number(recordOf(piece)?.openedAt ?? w.tick)
              : null,
        },
      };
    piece.position = { ...a.position };
    const shell = integrity(response);
    openRemember(c, {
      key: `${r.id}:shell-press:${g.key}:${added > 0 ? response : 'held'}`,
      subject: r.id,
      property: 'shell response of one whole unit to one press round',
      value: {
        unit: piece.id,
        method: g.method,
        implement: j.implement,
        support: j.support,
        response: added > 0 ? response : 'held',
        shell,
        crack,
        interior:
          response === 'opened'
            ? 'exposed'
            : 'not visible; only the exterior can be seen',
      },
      method:
        g.method === 'hand'
          ? 'one bare-hand squeeze of one whole unit, then a direct look'
          : 'one press of the implement on the unit resting on the support, then a direct look',
      condition: `${openConditions(w, a.position).regime}; by eye and touch in light`,
      verified: true,
    });
    const data = {
      ...summary(w, j),
      unit: u.index,
      item: piece.id,
      response,
      shell,
      energy: ROUND,
      newDamage: added > 0,
    };
    c.emit(
      'shelled-food-pressed',
      g.method === 'hand'
        ? `One bare-hand squeeze of ${piece.id}: shell ${shell}.`
        : `One press of ${piece.id} with ${j.implement ?? ''} on ${j.support ?? ''}: shell ${shell}.`,
      data,
      piece.id,
    );
    if (added === 0) {
      j.held = [...new Set([...j.held, g.key])];
      j.status = 'paused';
      j.pausedAt = w.tick;
      j.reason = `Unmet prerequisite: ${heldText(g)} did not crack the shell. Continue with a harder implement on a clean, stable, hard support, or cancel.`;
      c.emit(
        'shelled-food-failed',
        `The shell of ${piece.id} held under ${heldText(g)}: nothing was cracked or produced. Shelling it needs a harder implement on a clean, stable, hard support.`,
        { ...data, result: 'unmet prerequisite' },
        piece.id,
      );
      sync(a, j);
      return { complete: true, remaining: 0, writes: writes(j, [piece.id]) };
    }
    c.emit(
      'shelled-food-shell-cracked',
      response === 'opened'
        ? `The shell of ${piece.id} split open; the kernel is exposed but not yet separated. ${UNKNOWN.join(', ')} are not established.`
        : `The shell of ${piece.id} cracked without opening; the crack stays on the unit and another press round follows.`,
      data,
      piece.id,
    );
    j.reason =
      response === 'opened'
        ? 'Split open: the next round separates the kernel.'
        : 'Cracked: the next round presses again.';
    sync(a, j);
    return {
      complete: false,
      remaining: remaining(j),
      writes: writes(j, [piece.id]),
    };
  }

  /** One paid round that separates and inspects the kernel of the split unit. */
  function separate(
    c: V7ActionContext,
    j: Shelling,
    u: Unit,
    piece: V7Stack,
    r: V7Resource,
    d: EnclosedComposition,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    pay(c, j);
    const contents = foodTenths(d.contents.share),
      recovered = Math.round(contents * d.contents.recoverable),
      attached = contents - recovered,
      enclosure = 10 - contents,
      mass = foodUnitMass(w, piece),
      part = (tenths: number) => ({
        quantity: tenths / 10,
        mass: round((mass * tenths) / 10),
      });
    const k = conditionOf(piece, r);
    const verdict = k.suspect ? 'rejected' : SPECIMEN;
    /** A carried part with the unit's origin, age and decay (shelling resets neither). */
    const product = (
      resource: string,
      tenths: number,
      record: V7Data,
    ): V7Stack => ({
      id: v7Id(w, 'item'),
      resource,
      quantity: tenths / 10,
      quantityTenths: tenths,
      position: { ...a.position },
      owner: a.id,
      origin: piece.origin,
      ...(piece.harvestedAt === undefined
        ? {}
        : { harvestedAt: piece.harvestedAt }),
      decay: piece.decay ?? 0,
      processing: {
        [KEY]: {
          version: 1,
          revision,
          work: j.id,
          unit: piece.id,
          separatedAt: w.tick,
          method: j.method,
          implement: j.implement,
          support: j.support,
          ...record,
        },
      },
    });
    const kernel =
      recovered > 0
        ? product(d.contents.resource, recovered, {
            part: 'kernel',
            verdict,
            certified: false,
            condition: k.seen,
            treatment: 'none: not washed, heated or detoxified',
          })
        : null;
    // Contents that stay attached remain with the shell pieces, without food value.
    const shell = product(d.enclosure.resource, enclosure + attached, {
      part: 'shell',
      verdict: 'waste',
    });
    w.stacks = [
      ...w.stacks.filter((s) => s.id !== piece.id),
      ...(kernel ? [kernel] : []),
      shell,
    ];
    j.escrow = j.escrow.filter((x) => x !== piece.id);
    j.outputs = [...j.outputs, ...(kernel ? [kernel.id] : []), shell.id];
    j.target = kernel?.id ?? shell.id;
    const rejected = verdict === 'rejected' ? recovered : 0;
    const ledger = {
      input: { item: piece.id, resource: r.id, ...part(10) },
      kernel: {
        item: rejected ? null : (kernel?.id ?? null),
        ...part(recovered - rejected),
      },
      shell: { item: shell.id, ...part(enclosure + attached) },
      rejects: {
        item: rejected ? (kernel?.id ?? null) : null,
        ...part(rejected),
      },
      losses: part(0),
    };
    j.ledger = {
      input: j.ledger.input,
      kernel: round(j.ledger.kernel + (recovered - rejected) / 10),
      shell: round(j.ledger.shell + (enclosure + attached) / 10),
      rejects: round(j.ledger.rejects + rejected / 10),
      losses: j.ledger.losses,
    };
    Object.assign(u, {
      stage: 'separated',
      kernel: kernel?.id ?? null,
      shell: shell.id,
      verdict,
      condition: k.seen,
      ledger,
    });
    const observation = {
      kernel: kernel?.id ?? null,
      shell: shell.id,
      form: 'one whole loose kernel',
      color: d.contents.color,
      texture: d.contents.texture,
      condition: k.seen,
      mould: 'none seen; mould is not represented in this world',
      infestation: 'none seen; infestation is not represented in this world',
      verdict,
      certified: false,
      preparationRule: 'none represented for this material',
      visibility: 'by eye and touch in light; surfaces only, no instrument',
      unknown: UNKNOWN,
    };
    openRemember(c, {
      key: `${r.id}:shelled-kernel:${verdict}:${k.seen}`,
      subject: r.id,
      property: 'kernel found in one shelled unit',
      value: { unit: piece.id, ...observation },
      method: 'one round of hand separation and a direct look at the kernel',
      condition: `${openConditions(w, a.position).regime}; ${UNKNOWN.join(', ')} not established`,
      verified: true,
    });
    if (verdict === 'rejected')
      c.emit(
        'shelled-food-defect-observed',
        `The kernel ${kernel?.id ?? ''} shows ${k.seen} and is kept as a rejected item, not food.`,
        {
          defect: k.seen,
          rejected: true,
          ...summary(w, j),
        },
        kernel?.id ?? shell.id,
      );
    c.emit(
      'shelled-food-kernel-separated',
      `The kernel of ${piece.id} was separated by hand into ${kernel?.id ?? 'nothing'} (${String(recovered / 10)} of a unit's mass, ${verdict}) and the shell pieces into ${shell.id} (${String((enclosure + attached) / 10)}). The parts carry the unit's origin, age and decay; nothing was washed, heated or made safe.`,
      { ...summary(w, j), unit: u.index, observation, energy: ROUND },
      kernel?.id ?? shell.id,
    );
    j.current += 1;
    if (j.current < j.quantity) {
      j.reason = 'The next round presses the next reserved unit.';
      sync(a, j);
      return {
        complete: false,
        remaining: remaining(j),
        writes: writes(j, [piece.id]),
      };
    }
    j.status = 'completed';
    j.stage = 'completed';
    j.remainingWork = 0;
    j.reason = 'Every reserved unit was shelled.';
    j.endedAt = w.tick;
    c.emit(
      'shelled-food-completed',
      `Shelling work ${j.id} finished: ${String(j.ledger.kernel)} kernel, ${String(j.ledger.shell)} shell and ${String(j.ledger.rejects)} rejected from ${String(j.quantity)} unit(s). The kernels are unverified shelled specimens, not certified food.`,
      summary(w, j),
      j.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: writes(j, [piece.id]) };
  }

  /** One round of open work: the current unit's next substep, after rechecks. */
  function proceed(
    c: V7ActionContext,
    j: Shelling,
    fresh: boolean,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const u = unitOf(j),
      r = w.resources.find((x) => x.id === j.resource),
      d = compositionOf(j.resource);
    if (!u || !r || !d) throw new Error('Invalid shelling record.');
    const piece = reserved(w, j, u.item),
      sample = piece ?? (u.item ? undefined : reserved(w, j, j.batch));
    if (!sample) {
      lost(w, a, j, 'The reserved units spoiled or are gone.');
      return { complete: true, remaining: 0, writes: writes(j) };
    }
    const halt = (problem: string) => {
      if (fresh) throw nothing(problem);
      return pause(c, j, problem);
    };
    const spoiled = conditionOf(sample, r).spoiled
      ? 'The reserved unit has spoiled.'
      : null;
    if (u.stage === 'opened') {
      const problem = spoiled ?? recheck(c);
      if (problem) return halt(problem);
      const unit = piece ?? takeUnit(w, j);
      if (!unit) throw new Error('The reserved unit is missing.');
      return separate(c, j, u, unit, r, d);
    }
    const g = gearOf(c, foodUnitMass(w, sample), [...j.escrow, j.source], j);
    if (typeof g !== 'string' && j.held.includes(g.key))
      throw nothing(
        `${heldText(g)} already left this shell intact; name a harder implement and a support, or cancel.`,
      );
    const problem = typeof g === 'string' ? g : (spoiled ?? recheck(c));
    if (problem || typeof g === 'string')
      return halt(problem ?? 'The equipment is unusable.');
    const unit = piece ?? takeUnit(w, j);
    if (!unit) throw new Error('The reserved unit is missing.');
    return press(c, j, u, unit, r, g);
  }

  /** The person's own work named by workId, else their one open work. */
  function named(c: V7ActionContext): Shelling | undefined {
    const workId = text(c.action.args.workId);
    if (!workId) return current(c.world, c.actor);
    const j = works(c.world).find(
      (j) => j.id === workId && j.owner === c.actor.id,
    );
    if (!j) throw nothing('No shelling work of yours has this workId.');
    if (!isOpen(j)) throw nothing(`Shelling work ${j.id} is already settled.`);
    return j;
  }

  function shell(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    const open = named(c);
    if (open) {
      const target = text(action.args.targetStack);
      if (target && target !== open.source)
        throw nothing(
          `Your shelling work ${open.id} is still open; continue it with shell (no targetStack, or its workId) or cancel it.`,
        );
      return proceed(c, open, false);
    }
    if (!text(action.args.targetStack))
      throw nothing(
        'Give targetStack: one of your own items of a material with represented shell and kernel.',
      );
    const { s, r, q, h, damage } = sourceOf(c);
    if (h?.verdict === 'rejected')
      throw nothing(
        `${s.id} was set aside as rejected by inspection, so it is not shelled.`,
      );
    const k = conditionOf(s, r);
    if (k.suspect)
      throw nothing(
        `${s.id} shows ${k.spoiled ? 'spoilage' : k.seen}; an inspection would reject it, so it is not shelled.`,
      );
    if (damage < 1) {
      const g = gearOf(c, foodUnitMass(w, s), [s.id], null);
      if (typeof g === 'string') throw nothing(g);
      if (heldBefore(a, r.id, g.key))
        throw nothing(
          `Your own trial showed that ${heldText(g)} does not crack ${r.name}: an unmet prerequisite. Use a harder implement on a clean, stable, hard support.`,
        );
    }
    const problem = recheck(c);
    if (problem) throw nothing(problem);
    return proceed(c, begin(c, s, r, q, damage), true);
  }

  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = named(c);
    if (!j) throw nothing('You have no open shelling work to cancel.');
    const released = j.escrow.filter((x) => !!reserved(w, j, x));
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Shelling work cancelled; reserved units return to you as they now are. Spent energy, time and cracks are not refunded or restored.',
      false,
    );
    j.stage = 'stopped';
    j.endedAt = w.tick;
    c.emit(
      'shelled-food-stopped',
      `Shelling work cancelled. ${released.length ? `${released.join(', ')} returned to you as they now are` : 'No reserved unit was left'}; separated kernels and shells stay as they are.`,
      { ...summary(w, j), released, cause: 'cancelled' },
      j.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: writes(j, released) };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'shell') return shell(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing('Give mode: inspect, shell or cancel.');
  }

  /** Reserved units stay with their owner; vanished or spoiled units end the work; a round
   * without a paid substep pauses the work between substeps at no charge. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      const u = unitOf(j);
      if (
        (u?.item && !reserved(w, j, u.item)) ||
        (j.batch && !reserved(w, j, j.batch))
      ) {
        lost(w, a, j, 'Reserved units spoiled or are gone.');
        continue;
      }
      for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
        s.position = { ...a.position };
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.pausedAt = w.tick;
        j.reason =
          'Not worked this round; the work waits between substeps. Continue with shell or cancel.';
        forestEvent(
          w,
          'shelled-food-paused',
          'Shelling paused because no substep was worked this round; reserved units and recorded damage remain and nothing was charged.',
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
      'Inspection and shelling of owned shelled food in finite batches: whole units are inspected by eye for visible defects and suspect ones set aside, or reserved in a work record and shelled one unit at a time, a press round on a clean hard support with an own blunt implement (or by hand) under the ex17/ex19/ex20 compression law, then a separation round into a kernel item and a shell item by the represented composition. Kernels are unverified specimens.',
    reuse: {
      experiment:
        'ex20 open-and-separate-sample@1 (hazelnut composition kernel 0.4 and shell 0.6, derived part materials, bare-hand load, compression and deterioration laws, work lifecycle pattern); ex19 shell-compression-opening@1 and its shared light, piece, contact and ground checks; ex17 mechanical-food-handling@1 transmission law; ex16 hand-break-food@1 hand force; foundation gather, probe and eat stay separate and unchanged',
      source:
        'long-ex20-sample-opening.ts (HAZELNUT_COMPOSITION, enclosedResources, SAMPLE_OPENING_LAWS); long-ex19-material-contact.ts; collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); open-foundation.ts (openRemember); open-physical.ts; forest-food-accounting.ts; material-lots.ts; collective-food-profile.ts; continuous-geometry.ts',
      description:
        'Implementation reuse only; ex19 and ex20 packages are unchanged and no ability, item or mastery is inherited. New: defect inspection with set-aside rejects, finite batches, the two-round press and separation schedule, the support cleanliness check, futile-method refusal and the per-unit ledger with rejects.',
    },
    abilities: [
      {
        id,
        name: 'Prepare shelled food',
        function:
          'Inspect whole units of your own shelled food, such as hazelnuts, for visible defects, or shell a batch one unit at a time: press each on a clean hard support with your own blunt implement (or by hand where that works), then separate kernel and shell. Kernels are unverified, not certified food.',
        equivalence: 'food:shelled:inspect-shell-batch:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['inspect', 'shell', 'cancel'] },
            targetStack: { type: 'string' },
            quantity: { type: 'integer', minimum: 1, maximum: BATCH },
            supportRef: { type: 'string' },
            implementRef: { type: 'string' },
            workId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: {
          targetStack: 'optional-exact-visible',
          supportRef: 'optional-exact-visible',
          implementRef: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 2,
        costs:
          'Study: 2 rounds. inspect: targetStack (your own unreserved, untreated item of a material with represented shell and kernel) and quantity (whole units, 1-5, default 1); one round, 0.2 energy per unit. shell: targetStack and quantity reserve that batch in a work record (workId); each unit then takes a press round and a separation round, 0.5 energy each; a press that only cracks the shell adds a round. Press with implementRef (your own whole, hard, sound inedible piece) on supportRef (a solid unreserved inedible object in reach, not a plant or animal, with no loose item on it, or another such own piece on firm ground where you stand), or by hand with neither. shell continues round by round until the batch is done; shell again (or with workId) resumes a pause. cancel: one round, no energy. All need light. Checks run before any charge; a failed recheck pauses open work at no charge.',
        effects:
          'Inspection records ripeness, shell state, deterioration and spoilage by eye (mould and infestation are not represented); spoiled or visibly deteriorated units are set aside as a rejected item and not shelled. Strength is hardness / 10; a press passes the lower of implement and support strength x (1 - flexibility), a bare hand 0.1 / unit mass^(2/3). At or below the shell strength the shell holds: an unmet-prerequisite result that pauses the work, and that method is refused for it. Above it damage (load - strength) / strength accumulates: below 1 cracked, at 1 split open. Separation makes a kernel item and a shell item whose quantities are their mass shares and sum to the unit; the kernel carries all of its food value and toxicity, origin, age and decay, is inspected by eye and is an unverified shelled specimen or a rejected item, never certified food; a 0.4 item is less than the whole unit eat takes. Nothing is washed, heated or made safe. Unworked rounds pause; cancel returns reserved units as they now are; death drops them. Nothing is refunded; no reward.',
        handler,
        revision,
        authored: false,
        // The completion event carries no qualified flag: shelling earns no practice milestone.
        practiceEvidence: 'shelled-food-completed',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'inspect and cancel take one round. shell works one substep per paid round, a press then a separation per unit, and continues while units remain; the work record, reserved units, damage and outputs persist across interruption, and shell resumes after rechecks.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'shelled-food-inspect-started',
      'shelled-food-defect-observed',
      'shelled-food-inspected',
      'shelled-food-shelling-started',
      'shelled-food-pressed',
      'shelled-food-shell-cracked',
      'shelled-food-kernel-separated',
      'shelled-food-completed',
      'shelled-food-paused',
      'shelled-food-resumed',
      'shelled-food-stopped',
      'shelled-food-failed',
    ],
    resources,
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        const released = j.escrow.filter((x) => !!reserved(w, j, x));
        j.x = a.position.x;
        j.y = a.position.y;
        workStop(
          w,
          a,
          j,
          'Performer died; reserved units stay where they fell as they now are. Nothing is refunded or restored.',
          true,
        );
        j.stage = 'stopped';
        j.endedAt = w.tick;
        forestEvent(
          w,
          'shelled-food-stopped',
          'Shelling work ended by death; reserved units were neither restored nor shelled.',
          a.position,
          a.id,
          { ...summary(w, j), released, cause: 'death' },
          j.id,
        );
        sync(a, j);
      }
    },
  };
}

/** ex22: Lin's inspection and shelling of owned hazelnuts. */
export const LONG_EX22_SHELLED_FOOD = shelledFoodPackage(
  'prepare-shelled-food',
  'long-ex22',
  [HAZELNUT_COMPOSITION],
);
