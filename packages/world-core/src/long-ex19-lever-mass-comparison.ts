import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Clone, v7Id, v7Json, v7RoundNumber } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestResolveReference } from './forest-references.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { BRANCH_SCREEN_GEOMETRY } from './long-branch-screen-exposure.js';
import {
  ex19MaterialContact,
  ex19MaterialGround,
} from './long-ex19-material-contact.js';

const KIND = 'lever-comparator';

/** World Agent costs: study 0.5 energy in each of 4 rounds; assess, every empty or loaded
 * reading, inspection (the probe observation cost) and dismantling one round at 0.2; assembly
 * three work rounds at 0.5. */
const STUDY = 0.5;
const LOOK = 0.2;
const WORK = 0.5;
const ROUNDS = 3;

/** Declared beam geometry. One whole fallen-branch unit is a straight uniform rod of the declared
 * branch-screen@1 rod length (1.1 m), laid across the fulcrum at its visible midpoint, so its own
 * weight acts at the fulcrum (centre-of-mass offset 0; taper is not represented). */
const LENGTH = BRANCH_SCREEN_GEOMETRY.rodLength;
const HALF = LENGTH / 2;
const OFFSET = 0;
/** Positions are fractions of the half-beam from the fulcrum contact, positive toward the
 * reference end, judged by eye against the beam ends, the fulcrum and the seat (no ruler). The
 * fixed seat is 0.9 of the half-beam on the other side, one tenth in from that end. */
const SEAT = 0.9;
/** The reference slides from 0.8 on the seat side (clear of the seat) to 0.95 on its own side. */
const SLIDE = { min: -0.8, max: 0.95 };
/** Visible-position resolution and seat placement repeatability: 0.02 of the half-beam
 * (0.011 m). Two observations of one tip agree within two steps. */
const RES = 0.02;
const AGREE = 2 * RES;
/** Pivot stiction, the bounded resolution parameter: the effective rolling-resistance arm of a
 * round branch resting on rough stone, 0.005 m (half an assumed 0.01 m contact width, well below
 * the 0.033 m beam diameter). The beam tips only when the net gravitational torque exceeds
 * g x 0.005 m x the total mass on the fulcrum, so the two approach directions bracket a null range
 * whose width is the hysteresis. */
const STICTION = 0.005;
const GRAVITY = 9.81;
/** material-geometry@1 wood values, restated (mass units read as kg): dry density 600 kg/m3,
 * modulus 4e9 Pa and bending strength 45e6 Pa, with the resource moisture as the water share. */
const WOOD = { density: 600, modulus: 4e9, strength: 45e6 };
/** Declared bound: a visibly wetted stone or flint reference carries at most 1% of its mass as
 * surface water. Represented masses do not change with rain; the bound only widens intervals. */
const SURFACE_WATER = 0.01;
const BEAM = 'branch';
/** The represented hard rigid pieces (the stone-edge rule's materials). */
const HARD = ['stone', 'flint'];
const TREATED = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
  'materialLayer',
  'canopyDrying',
  'fuelMoisture',
] as const;
const EQUIPMENT = ['mantle', 'frictionKit', 'waterCup'] as const;
/** Records kept in the person's reading record. */
const KEEP = { readings: 12, endpoints: 8, comparisons: 4, series: 12 };
const ARGS: Record<string, string[]> = {
  assess: [
    'materialIds',
    'supportIds',
    'referenceId',
    'sampleId',
    'comparatorId',
  ],
  assemble: ['materialIds', 'supportIds', 'referenceId', 'comparatorId'],
  test: ['comparatorId', 'reading', 'approach', 'sampleId'],
  compare: ['comparatorId', 'reading', 'approach', 'sampleId'],
  inspect: ['comparatorId'],
  dismantle: ['comparatorId'],
};
const METHOD =
  'null ranges from inward and outward tips +/- 0.02 of the half-beam; sample/reference = (loaded - empty) / (0.9 +/- 0.02)';
const LIMITS =
  'positions are visual coordinates; masses, water content, contamination, preservation and food safety are not measured; repeatability is not absolute accuracy';

interface Reading extends V7Data {
  event: string;
  tick: number;
  comparator: string;
  series: string;
  reading: string;
  approach: string;
  sample: string | null;
  quantity: number | null;
  outcome: string;
  position: number | null;
}
interface Test extends V7Data {
  comparator: string;
  sample: string | null;
  readings: Reading[];
  result: V7Data | null;
}
interface Series extends V7Data {
  comparator: string;
  sample: string | null;
  checks: Reading[];
  loaded: Reading[];
}
interface Endpoint extends V7Data {
  event: string;
  tick: number;
  comparator: string;
  beam: string;
  reference: string;
  material: string;
  sample: string[];
  transfers: V7Data[];
  resource: string;
  quantity: number;
  readings: string[];
  baseline: number[];
  nullRange: number[];
  ratio: number[] | null;
  problems: string[];
  wet: boolean;
}
interface Ledger extends V7Data {
  test: Test | null;
  series: Series | null;
  readings: Reading[];
  endpoints: Endpoint[];
  comparisons: V7Data[];
}
interface Row extends V7Data {
  requirement: string;
  met: boolean;
  detail: string;
}
interface Range {
  problems: string[];
  range: number[];
  hysteresis: number | null;
  spread: number | null;
}

const round = (x: number) => v7RoundNumber(x);
/** A JSON-safe record from plain values (interfaces such as points carry no index signature). */
const jsonData = (v: unknown) => v7Json(v7Clone(v)) as V7Data;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const massOf = (w: V7World, s: V7Stack) => s.quantity * foodUnitMass(w, s);
const snap = (u: number) => round(Math.round(u / RES) * RES);
const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
/** The options that distinguish one reviewed comparator package from another built here. */
export interface LeverComparatorOptions {
  id: string;
  scope: string;
  dependencies: string[];
  /** Prefix of every event type the package emits. */
  events: string;
  name: string;
  equivalence: string;
  reuse: { experiment: string; source: string; description: string };
}
/** A tested comparator another reviewed operation may weigh its own items on now: the device,
 * its beam and reference pieces and the person's own passed test (its empty null range is the
 * tare). Values are read from the world, never written. */
export interface LeverCalibration {
  device: string;
  beam: V7Stack;
  reference: V7Stack;
  emptyNull: number[];
  test: V7Data;
}
/** One weighing: the item seated and the reference slid in from each end until the beam tips. */
export interface LeverWeighing {
  outward: V7Data;
  inward: V7Data;
  /** Loaded null range in half-beams, or null when a tip fell outside the slide. */
  nullRange: number[] | null;
  /** Item mass over reference mass as an interval, or null without a closed range. */
  ratio: number[] | null;
  resolution: number;
  method: string;
  limits: string;
}
/** A comparator package with read-only weighing access for other reviewed operations. */
export interface LeverComparatorKit {
  package: V7Package;
  calibrated(
    w: V7World,
    a: V7Actor,
    deviceId: string,
  ): LeverCalibration | string;
  weigh(w: V7World, c: LeverCalibration, item: V7Stack): LeverWeighing | string;
}

/** A general lever mass comparator package for one experiment scope. The ex19 package is built
 * here with its original identity, texts and behaviour; another scope gets its own package id,
 * handler, record keys and event prefix. */
export function leverMassComparatorKit(
  options: LeverComparatorOptions,
): LeverComparatorKit {
  const ID = options.id;
  const HANDLER = `long.${ID}`;
  const REVISION = `${ID}@1`;
  /** The person's own reading record (tests, endpoint series, endpoints and comparisons). */
  const STATE = `long:${ID}`;
  const WORK_STATE = `long:work:${ID}`;
  const event = (name: string) => `${options.events}-${name}`;

  const comparators = (w: V7World) =>
    w.objects.filter((o) => o.kind === KIND && o.data.operation === ID);
  const mine = (w: V7World, a: V7Actor) =>
    comparators(w).find((o) => o.data.owner === a.id);
  const current = (w: V7World, a: V7Actor) =>
    collectiveJobs(w, ID).find((j) => j.owner === a.id && open(j));
  const parts = (o: V7Object): V7Stack[] =>
    Array.isArray(o.data.components)
      ? (o.data.components as unknown as V7Stack[])
      : [];
  const part = (o: V7Object, role: 'beam' | 'reference' | 'fulcrumItem') =>
    parts(o).find((s) => s.id === o.data[role]);
  const fulcrumOf = (o: V7Object) =>
    (o.data.fulcrum ?? {}) as { kind?: string; id?: string; resource?: string };

  function list(value: unknown, name: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((x) => typeof x !== 'string'))
      throw new Error(`${name} lists exact ids. Nothing was spent.`);
    return value as string[];
  }
  function ledger(a: V7Actor): Ledger {
    const raw = a.extensionState[STATE];
    const l =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (v7Clone(raw) as unknown as Partial<Ledger>)
        : {};
    return {
      test: l.test ?? null,
      series: l.series ?? null,
      readings: l.readings ?? [],
      endpoints: l.endpoints ?? [],
      comparisons: l.comparisons ?? [],
    };
  }
  function save(a: V7Actor, l: Ledger) {
    a.extensionState[STATE] = v7Json(v7Clone(l));
  }
  function sync(a: V7Actor, j: CollectiveWork) {
    a.extensionState[WORK_STATE] = v7Json(v7Clone(j));
  }

  /** The null-range edges of the beam in half-beam units, from the actual conserved masses. The
   * gravitational torque about the fulcrum, positive toward the reference end, is
   * g (reference x u x HALF + beam x OFFSET - sample x SEAT x HALF); it overcomes the stiction
   * g x STICTION x (beam + reference + sample) beyond these positions. */
  function edges(beam: number, reference: number, sample: number) {
    const balance = (sample * SEAT * HALF - beam * OFFSET) / (reference * HALF),
      band = (STICTION * (beam + reference + sample)) / (reference * HALF);
    return { inward: balance - band, outward: balance + band };
  }

  /** Bending of the declared round beam at the fulcrum under the worst placement of a reading
   * (reference at either end of its slide, sample seated). All point loads are taken at the arm
   * end for the deflection, an upper bound. */
  function strain(
    w: V7World,
    beam: V7Stack,
    reference: number,
    sample: number,
  ) {
    const mb = massOf(w, beam),
      water =
        w.resources.find((r) => r.id === beam.resource)?.properties?.moisture ??
        0.5,
      d = Math.sqrt((4 * mb * (1 - water)) / (WOOD.density * Math.PI * LENGTH)),
      inertia = (Math.PI * d ** 4) / 64,
      section = (Math.PI * d ** 3) / 32,
      weight = (mb * GRAVITY) / LENGTH,
      own = (weight * HALF ** 2) / 2,
      moment =
        Math.max(
          GRAVITY * (sample * SEAT - reference * SLIDE.min) * HALF,
          GRAVITY * reference * SLIDE.max * HALF,
        ) + own,
      deflection =
        ((sample + reference) * GRAVITY * HALF ** 3) /
          (3 * WOOD.modulus * inertia) +
        (weight * HALF ** 4) / (8 * WOOD.modulus * inertia);
    return {
      holds: moment / section < WOOD.strength,
      rigid: deflection <= RES * HALF,
    };
  }

  /** One reading: the load is seated (or the seat left empty), the starting end pressed down and
   * the reference slid from the far end of its slide until the beam visibly tips. */
  function tip(e: { inward: number; outward: number }, approach: string) {
    if (approach === 'outward') {
      const start = 'seat end down';
      if (e.outward <= SLIDE.min)
        return {
          outcome: 'tipped at the start',
          position: null,
          rest: SLIDE.min,
          from: start,
          to: 'reference end down',
        };
      if (e.outward > SLIDE.max)
        return {
          outcome: 'no tip within the slide',
          position: null,
          rest: SLIDE.max,
          from: start,
          to: start,
        };
      return {
        outcome: 'tipped',
        position: snap(e.outward),
        rest: e.outward,
        from: start,
        to: 'reference end down',
      };
    }
    const start = 'reference end down';
    if (e.inward >= SLIDE.max)
      return {
        outcome: 'tipped at the start',
        position: null,
        rest: SLIDE.max,
        from: start,
        to: 'seat end down',
      };
    if (e.inward < SLIDE.min)
      return {
        outcome: 'no tip within the slide',
        position: null,
        rest: SLIDE.min,
        from: start,
        to: start,
      };
    return {
      outcome: 'tipped',
      position: snap(e.inward),
      rest: e.inward,
      from: start,
      to: 'seat end down',
    };
  }

  const both = (l: Reading[]) =>
    l.some((r) => r.approach === 'outward') &&
    l.some((r) => r.approach === 'inward');
  const enough = (l: Reading[]) => l.length >= 3 && both(l);

  /** The observed null range of a set of readings: from the lowest inward tip to the highest
   * outward tip, each widened by the visible resolution; it includes the hysteresis between
   * directions, the reload spread and any drift between readings. */
  function nullRange(readings: Reading[]): Range {
    const problems: string[] = [];
    if (readings.some((r) => r.position === null))
      problems.push('a reading found no tip inside the slide range');
    const at = (approach: string) =>
      readings
        .filter((r) => r.approach === approach && r.position !== null)
        .map((r) => Number(r.position));
    const inward = at('inward'),
      outward = at('outward');
    if (!inward.length || !outward.length)
      return {
        problems: [...problems, 'no tip was seen from one direction'],
        range: [],
        hysteresis: null,
        spread: null,
      };
    const spread = round(
      Math.max(
        Math.max(...inward) - Math.min(...inward),
        Math.max(...outward) - Math.min(...outward),
      ),
    );
    if (spread > AGREE + 1e-9)
      problems.push('readings from one direction differ by more than 0.04');
    if (Math.max(...inward) > Math.min(...outward) + AGREE + 1e-9)
      problems.push('the inward and outward tips do not close into one range');
    return {
      problems,
      range: [
        round(Math.min(...inward) - RES),
        round(Math.max(...outward) + RES),
      ],
      hysteresis: round(mean(outward) - mean(inward)),
      spread,
    };
  }

  /** Sample mass over reference mass from m/R = (x - x0) / L with x the loaded null range, x0 the
   * empty null range and L the seat arm 0.9 +/- 0.02, all in half-beams; a mass is never negative. */
  function ratio(loaded: number[], empty: number[]): number[] {
    const lo = (loaded[0] ?? 0) - (empty[1] ?? 0),
      hi = (loaded[1] ?? 0) - (empty[0] ?? 0),
      div = (x: number, low: boolean) =>
        x / (x >= 0 === low ? SEAT + RES : SEAT - RES);
    return [
      round(Math.max(0, div(lo, true))),
      round(Math.max(0, div(hi, false))),
    ];
  }

  /** Why an item cannot be the beam, or null. */
  function beamProblem(a: V7Actor, s: V7Stack): string | null {
    if (s.owner !== a.id) return `${s.id} is not yours`;
    if (s.reservedFor) return `${s.id} is reserved for unfinished work`;
    if (s.resource !== BEAM)
      return `${s.id} is ${s.resource}; only a fallen-branch unit has a represented piece length (1.1 m) for a beam`;
    if (foodTenths(s.quantity) !== 10)
      return 'the beam must be exactly one whole branch unit';
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).length
    )
      return 'worked or treated material has no represented beam geometry';
    return null;
  }
  /** Why an item cannot be the fulcrum piece: one whole sound stone or flint unit. */
  function fulcrumProblem(w: V7World, a: V7Actor, s: V7Stack): string | null {
    if (s.owner !== a.id) return `${s.id} is not yours`;
    if (s.reservedFor) return `${s.id} is reserved for unfinished work`;
    if (!HARD.includes(s.resource))
      return 'the fulcrum must be stone or flint, the represented hard rigid pieces';
    if (foodTenths(s.quantity) !== 10)
      return 'the fulcrum piece must be exactly one whole unit';
    if (TREATED.some((k) => s[k] !== undefined))
      return 'equipment and combined lots are not plain pieces';
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      return `${s.id} is fractured or too small for stable contact`;
    return null;
  }
  /** Why an item cannot be the reference: one own piece of stable mass, that is non-food
   * material that does not decay, untreated, of at most 1 unit. */
  function referenceProblem(w: V7World, a: V7Actor, s: V7Stack): string | null {
    const r = w.resources.find((r) => r.id === s.resource);
    if (s.owner !== a.id) return `${s.id} is not yours`;
    if (s.reservedFor) return `${s.id} is reserved for unfinished work`;
    if (!r || r.nutrition > 0 || (r.properties?.decay ?? 0) > 0)
      return 'the reference must be non-food material that does not decay, so that its mass stays stable';
    if (s.quantity > 1)
      return 'the reference must be one piece of at most 1 unit';
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).length
    )
      return 'equipment, combined lots and worked material are not plain pieces';
    return null;
  }
  function supportObjectProblem(
    w: V7World,
    a: V7Actor,
    o: V7Object | undefined,
  ): string | null {
    const r = w.resources.find((r) => r.id === o?.data.resource);
    if (
      !o ||
      !r ||
      !HARD.includes(r.id) ||
      !o.spatial.solid ||
      o.spatial.reserved ||
      o.kind === 'animal'
    )
      return 'the support must be a solid, unreserved stone or flint object';
    if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
      return `${o.id} is out of reach; walk there first`;
    return null;
  }
  function sampleProblem(
    a: V7Actor,
    s: V7Stack,
    excluded: string[],
  ): string | null {
    if (s.owner !== a.id) return `${s.id} is not yours`;
    if (s.reservedFor) return `${s.id} is reserved for unfinished work`;
    if (excluded.includes(s.id))
      return 'the sample must be a separate item from the comparator parts';
    if (s.quantity > 1) return 'the seat holds one piece of at most 1 unit';
    if (EQUIPMENT.some((k) => s[k] !== undefined))
      return 'equipment is not weighed in this version';
    return null;
  }
  /** Why the comparator's fulcrum no longer carries the beam, or null. */
  function supportProblem(w: V7World, o: V7Object): string | null {
    const f = fulcrumOf(o);
    if (f.kind === 'item')
      return ex19MaterialGround(w, o.spatial)
        ? 'the ground under the fulcrum piece is no longer firm'
        : null;
    const s = w.objects.find((x) => x.id === f.id);
    return s?.spatial.solid ? null : 'the support object is gone';
  }

  /** The person's own carried item named by a raw id, or the reason it is unavailable. */
  function lookup(c: V7ActionContext, raw: string): V7Stack | string {
    try {
      const id = forestResolveReference(c.world, c.actor, raw, 'owned');
      return (
        c.world.stacks.find((s) => s.id === id) ?? `${raw} is not available`
      );
    } catch (error) {
      return error instanceof Error ? error.message : `${raw} is not available`;
    }
  }
  function exact(c: V7ActionContext, key: string): V7Stack | string | null {
    const id = text(c.action.args[key]);
    if (!id) return null;
    return (
      c.world.stacks.find((s) => s.id === id) ?? `${id} is not an item you hold`
    );
  }

  /** Every requirement of a candidate assembly from the named items, met or missing. */
  function survey(c: V7ActionContext) {
    const { world: w, actor: a, action } = c;
    const rows: Row[] = [];
    const row = (requirement: string, problem: string | null, ok: string) =>
      rows.push({ requirement, met: !problem, detail: problem ?? ok });
    const materials = list(action.args.materialIds, 'materialIds'),
      supports = list(action.args.supportIds, 'supportIds');
    const named = materials[0],
      found = named ? lookup(c, named) : null,
      beamIssue =
        !found || typeof found === 'string' ? found : beamProblem(a, found),
      beam = found && typeof found !== 'string' && !beamIssue ? found : null;
    row(
      'beam',
      !named
        ? 'missing: name one whole untreated fallen-branch unit of your own first in materialIds (gather one)'
        : beamIssue,
      'one whole fallen-branch unit, taken as a uniform 1.1 m rod',
    );
    let fulcrum: { kind: string; stack?: V7Stack; object?: V7Object } | null =
      null;
    const second = materials[1];
    if (materials.length > 2 || supports.length > 1 || (second && supports[0]))
      row(
        'fulcrum',
        'name exactly one fulcrum: a second item in materialIds or one supportId',
        '',
      );
    else if (second) {
      const piece = lookup(c, second);
      const problem =
        typeof piece === 'string'
          ? piece
          : (fulcrumProblem(w, a, piece) ??
            (ex19MaterialGround(w, a.position)
              ? 'the fulcrum piece needs firm ordinary ground where you stand, not water, a wet bank or waterlogged ground'
              : null));
      if (typeof piece !== 'string' && !problem)
        fulcrum = { kind: 'item', stack: piece };
      row(
        'fulcrum',
        problem,
        'your whole stone or flint unit set on firm ground where you stand',
      );
    } else if (supports[0]) {
      const o = w.objects.find((o) => o.id === supports[0]);
      const problem = supportObjectProblem(w, a, o);
      if (o && !problem) fulcrum = { kind: 'object', object: o };
      row('fulcrum', problem, 'the beam rests across the top of this object');
    } else
      row(
        'fulcrum',
        'missing: a whole stone or flint unit of your own in materialIds, or a solid stone or flint object in reach in supportIds',
        '',
      );
    const ref = exact(c, 'referenceId'),
      refIssue =
        !ref || typeof ref === 'string' ? ref : referenceProblem(w, a, ref),
      reference = ref && typeof ref !== 'string' && !refIssue ? ref : null;
    row(
      'reference',
      !ref
        ? 'missing: name one non-food piece of your own that does not decay, of at most 1 unit, in referenceId'
        : refIssue,
      'your stable piece, slid along the beam; results are fractions of its mass',
    );
    const ids = [beam?.id, fulcrum?.stack?.id, reference?.id].filter(
      (x): x is string => !!x,
    );
    const smp = exact(c, 'sampleId'),
      sampleIssue =
        !smp || typeof smp === 'string' ? smp : sampleProblem(a, smp, ids),
      sample = smp && typeof smp !== 'string' && !sampleIssue ? smp : null;
    if (smp)
      row(
        'sample',
        sampleIssue,
        'one piece of at most 1 unit, seated by hand for each reading',
      );
    if (new Set(ids).size !== ids.length)
      row(
        'distinct parts',
        'the beam, fulcrum and reference must be different items',
        '',
      );
    if (beam && reference) {
      const s = strain(
        w,
        beam,
        massOf(w, reference),
        sample ? massOf(w, sample) : 0,
      );
      row(
        'capacity',
        !s.holds
          ? 'the loads would exceed the assumed bending strength of the beam'
          : !s.rigid
            ? 'the beam would bend visibly under these loads'
            : null,
        'no visible bending; within the assumed bending strength',
      );
    }
    return { rows, beam, fulcrum, reference, sample };
  }

  function at(o: V7Object, u: number): V7Point {
    return {
      x: round(o.spatial.x + u * HALF * Math.cos(o.spatial.angle)),
      y: round(o.spatial.y + u * HALF * Math.sin(o.spatial.angle)),
    };
  }
  /** Reusable drawing metadata; it never shows a balanced, calibrated, dried or safe badge. */
  function view(
    o: V7Object,
    state: string,
    events: string[] = [],
    sample: string | null = null,
  ): V7Data {
    const f = fulcrumOf(o),
      ref =
        typeof o.data.referencePosition === 'number'
          ? o.data.referencePosition
          : null,
      beam = part(o, 'beam'),
      work = o.data.progress as V7Data | undefined;
    return v7Json({
      component: 'loose-material',
      operation: ID,
      comparator: o.id,
      owner: o.data.owner ?? null,
      state,
      x: round(o.spatial.x),
      y: round(o.spatial.y),
      orientation: round((o.spatial.angle * 180) / Math.PI),
      unit: 'fraction of the half-beam from the fulcrum, + toward the reference end',
      beam: beam
        ? { id: beam.id, from: at(o, -1), to: at(o, 1) }
        : { id: o.data.beam ?? null, laid: false },
      fulcrum: {
        kind: f.kind ?? null,
        id: f.id ?? null,
        contact: 'beam resting across the fulcrum top',
        ...at(o, 0),
      },
      seat: { position: -SEAT, uncertainty: RES, ...at(o, -SEAT), sample },
      reference: {
        id: o.data.reference ?? null,
        placed: ref !== null,
        position: ref,
        uncertainty: RES,
        ...(ref !== null ? at(o, ref) : {}),
      },
      tilt: o.data.tilt ?? null,
      progress: work ?? null,
      validity: o.data.status ?? null,
      events,
      badge: null,
    }) as V7Data;
  }
  function refresh(o: V7Object, events: string[] = []) {
    const status = text(o.data.status);
    o.visual.state = status;
    o.visual.label = `Lever comparator (${status})`;
    o.data.view = view(o, status, events);
  }
  function last(w: V7World): string {
    return w.events.at(-1)?.id ?? '';
  }
  /** A record as emitted, before its own event id exists. */
  function shown(r: Reading | Endpoint): V7Data {
    const copy: V7Data = { ...r };
    delete copy.event;
    return copy;
  }

  /** Moves a whole own stack into the comparator, keeping its identity and record. */
  function install(w: V7World, o: V7Object, s: V7Stack) {
    const record = v7Clone(s);
    delete record.reservedFor;
    record.owner = null;
    record.position = { x: o.spatial.x, y: o.spatial.y };
    w.stacks = w.stacks.filter((x) => x.id !== s.id);
    o.data.components = v7Json([...parts(o), record]);
  }

  function pause(
    c: V7ActionContext,
    j: CollectiveWork,
    o: V7Object,
    reason: string,
  ): V7HandlerResult {
    j.status = 'paused';
    j.reason = reason;
    c.emit(
      event('paused'),
      `${reason} Completed rounds and placed parts are kept; nothing was spent.`,
      {
        workId: j.id,
        completedRounds: j.completedWork,
        view: view(o, 'assembling'),
      },
      o.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id] };
  }

  /** One paid assembly round after rechecking reach, reserved parts, support and energy. */
  function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
    const { world: w, actor: a } = c;
    const o = w.objects.find((x) => x.id === j.target && x.kind === KIND);
    if (!o || !open(j))
      throw new Error('This assembly is already settled. Nothing was spent.');
    if (o.data.status === 'damaged')
      throw new Error(
        'The partial comparator is damaged; dismantle it. Nothing was spent.',
      );
    if (!v7Reach(a, o.spatial))
      return pause(c, j, o, 'The comparator is beyond hand reach.');
    const placed = parts(o).map((s) => s.id),
      waiting = j.escrow.filter((id) => !placed.includes(id));
    if (
      waiting.some(
        (id) =>
          !w.stacks.some(
            (s) => s.id === id && s.reservedFor === j.id && s.owner === a.id,
          ),
      )
    )
      throw new Error('A reserved part is missing. Nothing was spent.');
    const support = supportProblem(w, o);
    if (support) return pause(c, j, o, `Assembly paused: ${support}.`);
    if (a.vitals.energy + 1e-8 < WORK)
      return pause(c, j, o, 'Not enough energy for the next paid round (0.5).');
    const resumed = j.status === 'paused';
    if (!workPay(c, j, WORK))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    if (resumed)
      c.emit(
        event('resumed'),
        'Assembly resumed after rechecking reach, the reserved parts, the support and energy.',
        { workId: j.id, view: view(o, 'assembling') },
        o.id,
      );
    const n = j.completedWork;
    const take = (role: 'beam' | 'reference') => {
      const s = w.stacks.find((x) => x.id === o.data[role]);
      if (s) install(w, o, s);
    };
    if (n === 2) {
      take('beam');
      o.data.stage = 'beam laid across the fulcrum at its midpoint';
      o.data.tilt = 'seat end down';
    } else if (n >= ROUNDS) {
      take('reference');
      o.data.stage = 'reference set over the fulcrum';
      o.data.referencePosition = 0;
    }
    o.data.progress = { completed: n, total: ROUNDS };
    if (n < ROUNDS) {
      refresh(o);
      c.emit(
        event('progress'),
        `Paid assembly round ${String(n)} of 3: ${text(o.data.stage)}. An unfinished comparator gives no reading.`,
        { workId: j.id, round: n, energy: WORK, view: view(o, 'assembling') },
        o.id,
      );
      sync(a, j);
      return {
        complete: false,
        remaining: j.remainingWork,
        writes: [j.id, o.id],
      };
    }
    j.status = 'completed';
    j.outputs = [o.id];
    o.data.workId = null;
    o.data.status = 'untested';
    o.data.assembledAt = w.tick;
    refresh(o);
    c.emit(
      event('assembled'),
      'The comparator stands: a branch beam across the fulcrum, a seat near one end and the reference over the fulcrum. It is untested; no reading is valid until a test passes.',
      {
        workId: j.id,
        components: parts(o).map((s) => s.id),
        paidEnergy: j.paidEnergy,
        view: view(o, 'untested'),
      },
      o.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }

  function assemble(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const job = current(w, a);
    if (job) {
      const named = text(action.args.comparatorId);
      if (
        action.args.materialIds !== undefined ||
        action.args.supportIds !== undefined ||
        action.args.referenceId !== undefined ||
        (named && named !== job.target)
      )
        throw new Error(
          `Your assembly of ${String(job.target)} is unfinished; resume it with assemble and only its comparatorId, or dismantle it. Nothing was spent.`,
        );
      return advance(c, job);
    }
    if (action.args.comparatorId !== undefined)
      throw new Error(
        'No unfinished assembly of yours has this comparatorId. Nothing was spent.',
      );
    const standing = mine(w, a);
    if (standing)
      throw new Error(
        `Your comparator ${standing.id} still stands; dismantle it before assembling another. Nothing was spent.`,
      );
    const s = survey(c),
      bad = s.rows.find((r) => !r.met);
    if (bad)
      throw new Error(`${bad.requirement}: ${bad.detail}. Nothing was spent.`);
    const { beam, fulcrum, reference } = s;
    if (!beam || !fulcrum || !reference)
      throw new Error('The assembly is incomplete. Nothing was spent.');
    if (a.vitals.energy + 1e-8 < WORK)
      throw new Error(
        'The first assembly round needs 0.5 energy. Nothing was spent.',
      );
    // All checks passed: the first paid round seats the fulcrum.
    const j = workCreate(c, 'assemble', ROUNDS);
    if (!workPay(c, j, WORK))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    const members = [
      beam,
      ...(fulcrum.stack ? [fulcrum.stack] : []),
      reference,
    ];
    for (const m of members) {
      m.reservedFor = j.id;
      j.escrow.push(m.id);
      j.sources.push({
        itemId: m.id,
        resource: m.resource,
        quantity: m.quantity,
        owner: a.id,
        origin: m.origin,
      });
    }
    const site = fulcrum.object
      ? { x: fulcrum.object.spatial.x, y: fulcrum.object.spatial.y }
      : { ...a.position };
    const color = (id: string) =>
      w.resources.find((r) => r.id === id)?.color ?? '#8d704e';
    const o: V7Object = {
      id: v7Id(w, 'object'),
      kind: KIND,
      name: 'Lever comparator',
      spatial: {
        ...site,
        angle: a.angle,
        shape: { kind: 'circle', radius: HALF },
        solid: false,
        interaction: w.config.interaction,
        entrances: [],
      },
      visual: {
        component: 'loose-material',
        color: color(BEAM),
        accent: color(reference.resource),
        label: 'Lever comparator',
        state: 'assembling',
      },
      data: {
        operation: ID,
        owner: a.id,
        workId: j.id,
        status: 'assembling',
        fulcrum: fulcrum.stack
          ? {
              kind: 'item',
              id: fulcrum.stack.id,
              resource: fulcrum.stack.resource,
            }
          : {
              kind: 'object',
              id: fulcrum.object?.id ?? '',
              resource: text(fulcrum.object?.data.resource),
            },
        fulcrumItem: fulcrum.stack?.id ?? null,
        beam: beam.id,
        reference: reference.id,
        components: [],
        referencePosition: null,
        tilt: null,
        wet: false,
        wetSpells: 0,
        assembledAt: null,
        progress: { completed: 1, total: ROUNDS },
        geometry: {
          beamLength: LENGTH,
          seat: -SEAT,
          slide: [SLIDE.min, SLIDE.max],
          resolution: RES,
          stiction: STICTION,
        },
      },
      createdBy: a.id,
      createdAt: w.tick,
      revision: REVISION,
    };
    w.objects.push(o);
    if (fulcrum.stack) install(w, o, fulcrum.stack);
    o.data.stage = fulcrum.stack
      ? 'fulcrum piece set on firm ground'
      : 'beam seat on the support checked';
    j.target = o.id;
    refresh(o);
    c.emit(
      event('progress'),
      `Paid assembly round 1 of 3: ${text(o.data.stage)}; the beam and reference are reserved. An unfinished comparator gives no reading.`,
      {
        workId: j.id,
        round: 1,
        energy: WORK,
        reserved: members.map((m) => m.id),
        view: view(o, 'assembling'),
      },
      o.id,
    );
    sync(a, j);
    return {
      complete: false,
      remaining: j.remainingWork,
      writes: [j.id, o.id, ...members.map((m) => m.id)],
    };
  }

  /** The comparator a mode acts on: comparatorId or your own, within reach. */
  function comparator(
    c: V7ActionContext,
    access: 'use' | 'take' | 'look',
  ): V7Object {
    const { world: w, actor: a } = c;
    const id = text(c.action.args.comparatorId),
      o = id ? comparators(w).find((x) => x.id === id) : mine(w, a);
    if (!o)
      throw new Error(
        id
          ? `${id} is not a lever comparator. Nothing was spent.`
          : 'You have no lever comparator; name one with comparatorId. Nothing was spent.',
      );
    if (
      access === 'use'
        ? o.data.owner !== a.id
        : access === 'take' && o.data.owner !== a.id && o.data.owner !== null
    )
      throw new Error(
        'Only the person who assembled this comparator may use or dismantle it. Nothing was spent.',
      );
    if (!v7Reach(a, o.spatial))
      throw new Error(
        `${o.id} is beyond hand reach; walk to it first. Nothing was spent.`,
      );
    return o;
  }

  function assess(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (action.args.comparatorId !== undefined) {
      const o = comparator(c, 'look');
      if (a.vitals.energy + 1e-8 < LOOK)
        throw new Error('Assessment needs 0.2 energy. Nothing was spent.');
      v7Spend(a, LOOK);
      const beam = part(o, 'beam'),
        reference = part(o, 'reference'),
        support = supportProblem(w, o);
      const s =
        beam && reference ? strain(w, beam, massOf(w, reference), 0) : null;
      const value: V7Data = jsonData({
        comparator: o.id,
        status: o.data.status ?? null,
        fulcrum: o.data.fulcrum ?? null,
        components: parts(o).map((p) => ({
          id: p.id,
          resource: p.resource,
          quantity: p.quantity,
        })),
        support: support ?? 'the fulcrum carries the beam',
        capacity: s
          ? s.holds && s.rigid
            ? 'no visible bending; within the assumed bending strength'
            : 'the beam would bend or fail'
          : 'not laid yet',
        wet: o.data.wet === true,
        geometry: o.data.geometry ?? null,
        limits: LIMITS,
      });
      openRemember(c, {
        key: `${o.id}:lever-comparator-assessment`,
        subject: o.id,
        property: 'lever comparator physical setup',
        value,
        method: 'direct look at the comparator',
        condition: 'no reading was made',
        verified: false,
      });
      c.emit(
        event('assessed'),
        `Assessed ${o.id}: ${text(o.data.status)}. Nothing was changed or measured.`,
        { ...value, energy: LOOK, view: view(o, 'assessed') },
        o.id,
      );
      return { complete: true, writes: [] };
    }
    const s = survey(c);
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('Assessment needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const missing = s.rows.filter((r) => !r.met);
    const value: V7Data = jsonData({
      requirements: s.rows,
      missing: missing.map((r) => `${r.requirement}: ${r.detail}`),
      feasible: missing.length === 0,
      geometry: {
        beam: 'one whole fallen-branch unit, taken as a uniform 1.1 m rod laid across the fulcrum at its midpoint',
        unit: 'fraction of the half-beam from the fulcrum, + toward the reference end',
        seat: -SEAT,
        slide: [SLIDE.min, SLIDE.max],
        resolution: RES,
        stiction: `${String(STICTION)} m effective rolling-resistance arm`,
        relation: 'sample/reference = (loaded null - empty null) / 0.9',
      },
      limits: LIMITS,
    });
    openRemember(c, {
      key: `${a.id}:lever-comparator-assessment`,
      subject: 'lever comparator',
      property: 'requirements met and missing for a lever comparator',
      value,
      method: 'direct look at the named items and support',
      condition: 'nothing was assembled or measured',
      verified: false,
    });
    c.emit(
      event('assessed'),
      missing.length
        ? `Assessment: missing ${missing.map((r) => r.requirement).join(', ')}. Nothing was assembled or measured.`
        : 'Assessment: every requirement for a lever comparator is met; nothing was assembled or measured.',
      {
        ...value,
        energy: LOOK,
        view: jsonData({
          component: 'loose-material',
          operation: ID,
          state: 'assessed',
          x: round(a.position.x),
          y: round(a.position.y),
          beam: s.beam?.id ?? null,
          fulcrum: s.fulcrum?.stack?.id ?? s.fulcrum?.object?.id ?? null,
          reference: s.reference?.id ?? null,
          sample: s.sample?.id ?? null,
          badge: null,
        }),
      },
      null,
    );
    return { complete: true, writes: [] };
  }

  /** A test result or an endpoint becomes invalid and the comparator needs a new test. */
  function invalidate(
    c: V7ActionContext,
    o: V7Object,
    l: Ledger,
    reason: string,
    data: V7Data,
  ) {
    o.data.status = 'invalid';
    l.test = null;
    l.series = null;
    refresh(o);
    c.emit(
      event('invalid'),
      `${reason} The comparator is invalid until a new test passes; no balance or result is established.`,
      { ...data, reason, view: view(o, 'invalid') },
      o.id,
    );
  }

  /** Compares an endpoint with the latest earlier endpoint of the same sample and reference. */
  function contrast(l: Ledger, after: Endpoint): V7Data | null {
    const id = after.sample.at(-1) ?? '';
    const before = l.endpoints
      .filter(
        (e) =>
          e.event !== after.event &&
          e.reference === after.reference &&
          e.sample.includes(id),
      )
      .at(-1);
    if (!before) return null;
    const reasons: string[] = [],
      wet = before.wet || after.wet;
    if (!before.ratio || !after.ratio) reasons.push('an endpoint is invalid');
    if (wet && !HARD.includes(after.material))
      reasons.push(
        'the reference was visibly wet at an endpoint and no surface-water bound is represented for its material',
      );
    const upper = (e: Endpoint) =>
      (e.ratio?.[1] ?? 0) * (e.wet ? 1 + SURFACE_WATER : 1);
    const lo =
        after.ratio && upper(before) > 0
          ? round((after.ratio[0] ?? 0) / upper(before))
          : null,
      hi =
        after.ratio && before.ratio && (before.ratio[0] ?? 0) > 0
          ? round(upper(after) / (before.ratio[0] ?? 1))
          : null;
    const direction =
      reasons.length || lo === null
        ? 'inconclusive'
        : hi !== null && hi < 1
          ? 'decrease'
          : lo > 1
            ? 'increase'
            : 'inconclusive';
    if (!reasons.length && direction === 'inconclusive')
      reasons.push(
        hi === null
          ? 'the earlier endpoint does not exclude zero, so no upper bound exists'
          : 'the after/before interval includes 1',
      );
    return jsonData({
      before: before.event,
      after: after.event,
      beforeTick: before.tick,
      afterTick: after.tick,
      comparators: [before.comparator, after.comparator],
      beam: [before.beam, after.beam],
      reference: after.reference,
      sample: after.sample,
      transfers: after.transfers,
      quantity: { before: before.quantity, after: after.quantity },
      observedRemoval: round(before.quantity - after.quantity),
      wet: { before: before.wet, after: after.wet },
      surfaceWaterBound:
        wet && HARD.includes(after.material) ? SURFACE_WATER : 0,
      ratio: lo === null ? null : [lo, hi],
      direction,
      reasons,
      meaning:
        'net mass change of this sample relative to the same reference only; not water loss, contamination, preservation, food safety or a cause',
    });
  }

  /** One paid reading after rechecking ownership, reach, status, loads, support and energy. */
  function reading(
    c: V7ActionContext,
    series: 'test' | 'compare',
  ): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const o = comparator(c, 'use'),
      status = text(o.data.status);
    if (status === 'assembling')
      throw new Error(
        'The comparator is not assembled yet. Nothing was spent.',
      );
    if (status === 'damaged')
      throw new Error(
        'The comparator is damaged and gives no reading; dismantle it. Nothing was spent.',
      );
    const l = ledger(a);
    const tested =
      status === 'tested' && l.test?.comparator === o.id && !!l.test.result;
    if (series === 'compare' && !tested)
      throw new Error(
        `compare needs this comparator to pass a test first (it is ${status}). Nothing was spent.`,
      );
    const kind = text(action.args.reading),
      approach = text(action.args.approach);
    if (
      !['empty', 'loaded'].includes(kind) ||
      !['outward', 'inward'].includes(approach)
    )
      throw new Error(
        'A reading needs reading (empty or loaded) and approach (outward or inward). Nothing was spent.',
      );
    const beam = part(o, 'beam'),
      reference = part(o, 'reference');
    if (!beam || !reference)
      throw new Error(
        'The comparator lacks its beam or reference. Nothing was spent.',
      );
    let sample: V7Stack | undefined;
    if (kind === 'loaded') {
      sample = w.stacks.find((s) => s.id === text(action.args.sampleId));
      if (!sample)
        throw new Error(
          'A loaded reading needs sampleId: one of your own items of at most 1 unit. Nothing was spent.',
        );
      const problem = sampleProblem(a, sample, [beam.id, reference.id]);
      if (problem) throw new Error(`${problem}. Nothing was spent.`);
    } else if (action.args.sampleId !== undefined)
      throw new Error(
        'An empty reading seats no sample; leave out sampleId. Nothing was spent.',
      );
    // The series this reading joins; refusals here spend nothing.
    let test =
      l.test?.comparator === o.id && status === 'untested' ? l.test : null;
    let run = l.series?.comparator === o.id ? l.series : null;
    if (series === 'test') {
      if (sample && test?.sample && test.sample !== sample.id)
        throw new Error(
          `This test uses sample ${test.sample}; finish it with that sample. Nothing was spent.`,
        );
    } else if (sample) {
      if (!run?.checks.length)
        throw new Error(
          'Open the endpoint with an empty check first. Nothing was spent.',
        );
      if (run.sample && run.sample !== sample.id)
        throw new Error(
          `This endpoint uses sample ${run.sample}; close it with an empty check first. Nothing was spent.`,
        );
    }
    const support = supportProblem(w, o);
    if (support) throw new Error(`${support}. Nothing was spent.`);
    const mb = massOf(w, beam),
      mr = massOf(w, reference),
      ms = sample ? massOf(w, sample) : 0;
    const s = strain(w, beam, mr, ms);
    if (!s.holds || !s.rigid)
      throw new Error(
        'These loads would bend the beam visibly or exceed its assumed strength. Nothing was spent.',
      );
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('A reading needs 0.2 energy. Nothing was spent.');
    // All checks passed: one paid round seats the load, slides the reference and watches the tilt.
    v7Spend(a, LOOK);
    const result = tip(edges(mb, mr, ms), approach),
      empty = edges(mb, mr, 0);
    o.data.referencePosition = snap(result.rest);
    o.data.tilt =
      result.rest > empty.outward
        ? 'reference end down'
        : result.rest < empty.inward
          ? 'seat end down'
          : result.to;
    const record: Reading = {
      event: '',
      tick: w.tick,
      comparator: o.id,
      series,
      reading: kind,
      approach,
      sample: sample?.id ?? null,
      quantity: sample?.quantity ?? null,
      outcome: result.outcome,
      position: result.position,
    };
    refresh(o);
    c.emit(
      event('reading'),
      `${series} reading, ${kind}, ${approach}: ${result.outcome}${result.position === null ? '' : ` at ${String(result.position)} +/- ${String(RES)} of the half-beam`}; ${sample ? `${sample.id} was seated and taken back` : 'seat empty'}.`,
      {
        ...shown(record),
        interval:
          result.position === null
            ? null
            : [round(result.position - RES), round(result.position + RES)],
        motion: {
          tilt: { from: result.from, to: result.to },
          reference: {
            from: approach === 'outward' ? SLIDE.min : SLIDE.max,
            to: o.data.referencePosition,
          },
        },
        slip: 'none represented',
        bending: 'not visible',
        energy: LOOK,
        view: view(o, status, [], sample?.id ?? null),
      },
      o.id,
    );
    record.event = last(w);
    l.readings = [...l.readings, record].slice(-KEEP.readings);
    const writes = [o.id];
    if (series === 'test') {
      if (!test) {
        test = { comparator: o.id, sample: null, readings: [], result: null };
        l.series = null;
        o.data.status = 'untested';
      }
      test.readings = [...test.readings, record].slice(-KEEP.series);
      if (sample) test.sample = sample.id;
      l.test = test;
      const empties = test.readings.filter((r) => r.reading === 'empty'),
        loads = test.readings.filter((r) => r.reading === 'loaded');
      if (enough(empties) && enough(loads)) {
        const z = nullRange(empties),
          x = nullRange(loads),
          problems = [
            ...z.problems.map((p) => `empty: ${p}`),
            ...x.problems.map((p) => `loaded: ${p}`),
          ];
        const data: V7Data = jsonData({
          comparator: o.id,
          setup: o.id,
          beam: beam.id,
          reference: reference.id,
          sample: test.sample,
          readings: test.readings.map((r) => r.event),
          emptyNull: z.range,
          loadedNull: x.range,
          hysteresis: { empty: z.hysteresis, loaded: x.hysteresis },
          reloadSpread: { empty: z.spread, loaded: x.spread },
          ratio: problems.length ? null : ratio(x.range, z.range),
          problems,
          method: METHOD,
          limits: LIMITS,
        });
        openRemember(c, {
          key: `${o.id}:lever-comparator-test`,
          subject: o.id,
          property: 'lever comparator validity test',
          value: data,
          method: 'paid empty and loaded readings from both tilt directions',
          condition: LIMITS,
          verified: false,
        });
        if (problems.length)
          invalidate(c, o, l, `Test failed: ${problems.join('; ')}.`, data);
        else {
          o.data.status = 'tested';
          test.result = data;
          l.test = test;
          l.series = null;
          refresh(o);
          c.emit(
            event('tested'),
            'Test passed: empty and loaded readings from both directions repeat and close into null ranges. The comparator is valid for this setup only; repeatability does not establish absolute accuracy.',
            {
              ...data,
              view: view(
                o,
                'tested',
                test.readings.map((r) => r.event),
              ),
            },
            o.id,
          );
        }
      }
    } else {
      const result = l.test?.result;
      if (!result) throw new Error('The test result is missing.');
      const pending = run ?? {
        comparator: o.id,
        sample: null,
        checks: [],
        loaded: [],
      };
      if (kind === 'loaded') {
        pending.loaded = [...pending.loaded, record].slice(-KEEP.series);
        pending.sample = sample?.id ?? null;
        run = pending;
        l.series = run;
      } else {
        const base = (l.test?.readings ?? []).filter(
            (r) =>
              r.reading === 'empty' &&
              r.approach === approach &&
              r.position !== null,
          ),
          drift =
            record.position === null || !base.length
              ? null
              : round(
                  record.position - mean(base.map((r) => Number(r.position))),
                );
        if (drift === null || Math.abs(drift) > AGREE + 1e-9) {
          invalidate(
            c,
            o,
            l,
            drift === null
              ? 'The empty check found no tip inside the slide range.'
              : `The empty check drifted ${String(drift)} from the tested baseline.`,
            jsonData({ reading: record.event, drift }),
          );
          save(a, l);
          return { complete: true, writes };
        }
        if (enough(pending.loaded)) {
          const x = nullRange(pending.loaded),
            baseline = (result.emptyNull ?? []) as number[];
          const endpoint: Endpoint = {
            event: '',
            tick: w.tick,
            comparator: o.id,
            beam: beam.id,
            reference: reference.id,
            material: reference.resource,
            sample: [pending.sample ?? ''],
            transfers: [],
            resource:
              w.stacks.find((s) => s.id === pending.sample)?.resource ?? '',
            quantity: pending.loaded.at(-1)?.quantity ?? 0,
            readings: [
              ...pending.checks.map((r) => r.event),
              ...pending.loaded.map((r) => r.event),
              record.event,
            ],
            baseline,
            nullRange: x.range,
            ratio: x.problems.length ? null : ratio(x.range, baseline),
            problems: x.problems,
            wet: o.data.wet === true,
          };
          c.emit(
            endpoint.ratio ? event('endpoint') : event('inconclusive'),
            endpoint.ratio
              ? `Endpoint for ${endpoint.sample[0] ?? ''}: mass ${String(endpoint.ratio[0])} to ${String(endpoint.ratio[1])} of the reference, bracketed by empty checks. A net mass relative to this reference only.`
              : `Endpoint for ${endpoint.sample[0] ?? ''} is inconclusive: ${x.problems.join('; ')}.`,
            {
              ...shown(endpoint),
              method: METHOD,
              limits: LIMITS,
              view: view(o, 'tested', endpoint.readings),
            },
            o.id,
          );
          endpoint.event = last(w);
          l.endpoints = [...l.endpoints, endpoint].slice(-KEEP.endpoints);
          openRemember(c, {
            key: `${endpoint.sample[0] ?? ''}:lever-comparator-endpoint`,
            subject: endpoint.resource,
            property: 'mass relative to the comparator reference',
            value: jsonData(endpoint),
            method:
              'paid loaded readings from both directions between empty checks',
            condition: LIMITS,
            verified: false,
          });
          const comparison = contrast(l, endpoint);
          if (comparison) {
            const decided = comparison.direction !== 'inconclusive';
            openRemember(c, {
              key: `${endpoint.sample[0] ?? ''}:lever-comparator-comparison`,
              subject: endpoint.resource,
              property:
                'before/after mass ratio relative to the same reference',
              value: comparison,
              method: 'two endpoints of the same sample and reference',
              condition: LIMITS,
              verified: false,
            });
            c.emit(
              decided ? event('compared') : event('inconclusive'),
              decided
                ? `Before/after comparison: the sample's mass relative to the reference shows a ${text(comparison.direction)} (after/before ${JSON.stringify(comparison.ratio)}). This is net mass change only, not water loss, preservation or safety.`
                : `Before/after comparison is inconclusive: ${(comparison.reasons as string[]).join('; ')}.`,
              {
                ...comparison,
                view: view(o, 'tested', [
                  comparison.before as string,
                  endpoint.event,
                ]),
              },
              o.id,
            );
            l.comparisons = [
              ...l.comparisons,
              { ...comparison, event: last(w) },
            ].slice(-KEEP.comparisons);
          }
          run = {
            comparator: o.id,
            sample: null,
            checks: [record],
            loaded: [],
          };
        } else {
          pending.checks = [...pending.checks, record].slice(-KEEP.series);
          run = pending;
        }
        l.series = run;
      }
    }
    save(a, l);
    return { complete: true, writes };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const o = comparator(c, 'use');
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('Inspection needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const l = ledger(a),
      mineTest = l.test?.comparator === o.id ? l.test : null,
      run = l.series?.comparator === o.id ? l.series : null;
    const value: V7Data = jsonData({
      comparator: o.id,
      status: o.data.status ?? null,
      fulcrum: o.data.fulcrum ?? null,
      components: parts(o).map((p) => ({
        id: p.id,
        resource: p.resource,
        quantity: p.quantity,
      })),
      referencePosition: o.data.referencePosition ?? null,
      tilt: o.data.tilt ?? null,
      support: supportProblem(w, o) ?? 'the fulcrum carries the beam',
      wet: o.data.wet === true,
      wetSpells: o.data.wetSpells ?? 0,
      test: mineTest
        ? {
            readings: mineTest.readings.length,
            sample: mineTest.sample,
            result: mineTest.result,
          }
        : null,
      endpointSeries: run
        ? {
            sample: run.sample,
            checks: run.checks.length,
            loaded: run.loaded.length,
          }
        : null,
      endpoints: l.endpoints
        .filter((e) => e.comparator === o.id)
        .slice(-3)
        .map((e) => ({
          event: e.event,
          tick: e.tick,
          sample: e.sample,
          ratio: e.ratio,
        })),
      comparisons: l.comparisons.slice(-2),
      limits: LIMITS,
    });
    openRemember(c, {
      key: `${o.id}:lever-comparator`,
      subject: o.id,
      property: 'lever comparator state and own readings',
      value,
      method: 'direct look at the comparator and own reading record',
      condition: LIMITS,
      verified: false,
    });
    c.emit(
      event('inspected'),
      `Inspected ${o.id}: ${text(o.data.status)}, ${text(o.data.tilt)}${o.data.wet === true ? ', visibly wet' : ''}. Nothing was changed.`,
      { ...value, energy: LOOK, view: view(o, text(o.data.status)) },
      o.id,
    );
    return { complete: true, writes: [] };
  }

  function dismantle(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const o = comparator(c, 'take');
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('Dismantling needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const job = collectiveJobs(w, ID).find((j) => j.target === o.id && open(j));
    let released: string[] = [];
    if (job) {
      released = job.escrow.filter((id) =>
        w.stacks.some((s) => s.id === id && s.reservedFor === job.id),
      );
      job.x = a.position.x;
      job.y = a.position.y;
      workStop(
        w,
        a,
        job,
        'Assembly cancelled by dismantling; unplaced reserved parts return to ordinary use. Spent energy is not refunded.',
        false,
      );
      sync(a, job);
    }
    const recovered = parts(o).map((s) => {
      w.stacks.push({
        ...v7Clone(s),
        owner: a.id,
        position: { ...a.position },
      });
      return s.id;
    });
    o.data.components = [];
    w.objects = w.objects.filter((x) => x.id !== o.id);
    const l = ledger(a);
    if (l.test?.comparator === o.id) l.test = null;
    if (l.series?.comparator === o.id) l.series = null;
    save(a, l);
    c.emit(
      event('dismantled'),
      `Dismantled ${o.id}: ${recovered.join(', ') || 'nothing'} returned to your hands${released.length ? `; reserved ${released.join(', ')} released` : ''}. Its test does not carry over to a new setup.`,
      {
        comparator: o.id,
        recovered,
        released,
        energy: LOOK,
        view: { ...view(o, 'dismantled'), beam: null, reference: null },
      },
      o.id,
    );
    return { complete: true, writes: [o.id, ...recovered, ...released] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode),
      allowed = ARGS[mode];
    if (!allowed)
      throw new Error('Unknown comparator mode. Nothing was spent.');
    // The bound assembly continues each round with its original request.
    const job = current(c.world, c.actor);
    if (mode === 'assemble' && job && c.operation?.first === false)
      return advance(c, job);
    if (mode === 'assemble' && c.operation?.first === false)
      throw new Error('The bound assembly is already settled.');
    const extra = Object.keys(c.action.args).filter(
      (k) => k !== 'mode' && !allowed.includes(k),
    );
    if (extra.length)
      throw new Error(
        `${mode} does not use ${extra.join(', ')}. Nothing was spent.`,
      );
    if (mode === 'assess') return assess(c);
    if (mode === 'assemble') return assemble(c);
    if (mode === 'test' || mode === 'compare') return reading(c, mode);
    if (mode === 'inspect') return inspect(c);
    return dismantle(c);
  }

  /** The whole-identity continuation of a tracked item this round, through base pickup, the
   * thin-slice cut or the air-exposure placement, or null while it keeps its identity. */
  function follow(w: V7World, id: string) {
    if (!id || w.stacks.some((s) => s.id === id)) return null;
    for (const e of w.events) {
      const pair =
        e.type === 'picked-up'
          ? [e.target, text(e.data.item)]
          : e.type === 'slice-drying-cut'
            ? [text(e.data.parent), text(e.data.unit)]
            : e.type === 'air-exposure-placed'
              ? [text(e.data.input), e.target]
              : null;
      const to = pair?.[1];
      if (pair?.[0] === id && to && w.stacks.some((s) => s.id === to))
        return { id: to, via: e.type, event: e.id };
    }
    return null;
  }

  /** Unattended effects: an unworked assembly round pauses; rain visibly wets a standing comparator
   * and voids its test; a fulcrum that loses its footing damages it; tracked samples are followed. */
  function environment(w: V7World) {
    for (const j of collectiveJobs(w, ID).filter(open)) {
      const a = w.actors.find((x) => x.id === j.owner);
      if (!a || j.status !== 'active' || j.lastPaid >= w.tick) continue;
      j.status = 'paused';
      j.reason =
        'Not worked this round; completed rounds and placed parts are kept.';
      forestEvent(
        w,
        event('paused'),
        'Assembly paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        { workId: j.id, completedRounds: j.completedWork },
        j.target,
      );
      sync(a, j);
    }
    for (const o of comparators(w)) {
      const owner = w.actors.find((x) => x.id === o.data.owner),
        status = text(o.data.status),
        climate = forestClimate(w, o.spatial),
        wet = !climate.indoor && (climate.rain ?? 0) > 0;
      if (wet && o.data.wet !== true) {
        o.data.wet = true;
        o.data.wetSpells = Number(o.data.wetSpells ?? 0) + 1;
        o.data.wetSince = w.tick;
        if (['tested', 'untested', 'invalid'].includes(status)) {
          o.data.status = 'untested';
          if (owner) {
            const l = ledger(owner);
            if (l.test?.comparator === o.id) l.test = null;
            if (l.series?.comparator === o.id) l.series = null;
            save(owner, l);
          }
        }
        refresh(o);
        forestEvent(
          w,
          event('wetted'),
          'Rain is visibly wetting the comparator; any earlier test no longer holds and a new test is needed.',
          o.spatial,
          owner?.id ?? null,
          {
            comparator: o.id,
            rain: climate.rain ?? 0,
            view: view(o, text(o.data.status)),
          },
          o.id,
        );
      } else if (!wet && o.data.wet === true) {
        o.data.wet = false;
        o.data.wetSince = null;
      }
      const problem = status === 'damaged' ? null : supportProblem(w, o);
      if (problem && parts(o).length) {
        o.data.status = 'damaged';
        o.data.tilt = 'beam shifted off level on its fulcrum';
        if (owner) {
          const l = ledger(owner);
          if (l.test?.comparator === o.id) l.test = null;
          if (l.series?.comparator === o.id) l.series = null;
          save(owner, l);
        }
        refresh(o);
        forestEvent(
          w,
          event('failed'),
          `The comparator failed physically: ${problem}. Its parts stay in place; it gives no reading and can only be dismantled.`,
          o.spatial,
          owner?.id ?? null,
          { comparator: o.id, cause: problem, view: view(o, 'damaged') },
          o.id,
        );
      }
    }
    for (const a of w.actors) {
      const raw = a.extensionState[STATE];
      if (!raw) continue;
      const l = ledger(a);
      let changed = false;
      for (const e of l.endpoints) {
        const next = follow(w, e.sample.at(-1) ?? '');
        if (!next) continue;
        e.sample = [...e.sample, next.id].slice(-8);
        e.transfers = [
          ...e.transfers,
          { tick: w.tick, to: next.id, via: next.via, event: next.event },
        ].slice(-8);
        changed = true;
      }
      if (changed) save(a, l);
    }
  }

  function onDeath(w: V7World, a: V7Actor) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; unplaced reserved parts lie where the person died and placed parts stay in the partial comparator. Nothing is refunded.',
        true,
      );
      sync(a, j);
    }
    for (const o of comparators(w).filter((o) => o.data.owner === a.id)) {
      o.data.owner = null;
      o.data.workId = null;
      refresh(o);
      forestEvent(
        w,
        event('interrupted'),
        'The owner died; the comparator stays where it stands with its parts, unowned. Its readings give nobody knowledge or permission.',
        o.spatial,
        a.id,
        { comparator: o.id, view: view(o, text(o.data.status)) },
        o.id,
      );
    }
    const l = ledger(a);
    l.test = null;
    l.series = null;
    if (a.extensionState[STATE]) save(a, l);
  }

  /** Read-only access for another reviewed operation that weighs its own items on a tested
   * comparator of this package: the same owner, reach, status and support rules as a reading. */
  function calibrated(
    w: V7World,
    a: V7Actor,
    deviceId: string,
  ): LeverCalibration | string {
    const o = comparators(w).find((x) => x.id === deviceId);
    if (!o) return `${deviceId} is not a comparator of ${ID}`;
    if (o.data.owner !== a.id)
      return 'only the person who assembled this comparator may weigh on it';
    if (!v7Reach(a, o.spatial))
      return `${o.id} is beyond hand reach; walk to it first`;
    const status = text(o.data.status),
      l = ledger(a),
      result = l.test?.comparator === o.id ? l.test.result : null;
    if (status !== 'tested' || !result)
      return `${o.id} has no passed test of yours (it is ${status}); test it first`;
    const support = supportProblem(w, o);
    if (support) return support;
    const beam = part(o, 'beam'),
      reference = part(o, 'reference');
    if (!beam || !reference) return `${o.id} lacks its beam or reference`;
    const readings = l.test?.readings ?? [];
    return {
      device: o.id,
      beam,
      reference,
      emptyNull: (result.emptyNull ?? []) as number[],
      test: jsonData({
        readings: result.readings ?? [],
        sample: result.sample ?? null,
        ratio: result.ratio ?? null,
        testedAt: readings.length
          ? Math.max(...readings.map((r) => r.tick))
          : null,
        emptyNull: result.emptyNull ?? [],
      }),
    };
  }

  /** One weighing on a calibrated comparator from the true represented masses; nothing changes. */
  function weigh(
    w: V7World,
    cal: LeverCalibration,
    item: V7Stack,
  ): LeverWeighing | string {
    if (item.quantity > 1) return 'the seat holds one piece of at most 1 unit';
    const mb = massOf(w, cal.beam),
      mr = massOf(w, cal.reference),
      ms = massOf(w, item),
      s = strain(w, cal.beam, mr, ms);
    if (!s.holds || !s.rigid)
      return 'these loads would bend the beam visibly or exceed its assumed strength';
    const e = edges(mb, mr, ms),
      outward = tip(e, 'outward'),
      inward = tip(e, 'inward');
    // Only what the eye reads: the snapped tip position, never the exact rest point.
    const seen = (t: ReturnType<typeof tip>) =>
      jsonData({
        outcome: t.outcome,
        position: t.position,
        from: t.from,
        to: t.to,
      });
    const range =
      outward.position === null || inward.position === null
        ? null
        : [round(inward.position - RES), round(outward.position + RES)];
    return {
      outward: seen(outward),
      inward: seen(inward),
      nullRange: range,
      ratio: range ? ratio(range, cal.emptyNull) : null,
      resolution: RES,
      method: METHOD,
      limits: LIMITS,
    };
  }

  const pkg: V7Package = {
    id: ID,
    version: 1,
    scope: options.scope,
    dependencies: options.dependencies,
    description:
      'A general lever mass comparator: an own branch beam across a stone or flint fulcrum with a fixed seat and an own sliding non-food reference piece, assembled in three paid rounds; paid readings tip the beam by torques of the actual masses against a bounded pivot stiction and report null ranges, validity tests, reference-relative endpoints and before/after ratios as intervals; no grams, water content, preservation or safety.',
    reuse: options.reuse,
    abilities: [
      {
        id: ID,
        name: options.name,
        function:
          'Assess, assemble, test, use, inspect or dismantle a lever comparator: your branch beam across a stone fulcrum, a fixed seat and your own sliding reference piece. Readings give sample mass as a fraction of the reference and before/after ratios, as intervals.',
        equivalence: options.equivalence,
        parameters: {
          ...v7ObjectSchema({
            mode: {
              type: 'string',
              enum: [
                'assess',
                'assemble',
                'test',
                'compare',
                'inspect',
                'dismantle',
              ],
            },
            materialIds: { type: 'array', items: { type: 'string' } },
            supportIds: { type: 'array', items: { type: 'string' } },
            referenceId: { type: 'string' },
            sampleId: { type: 'string' },
            comparatorId: { type: 'string' },
            reading: { type: 'string', enum: ['empty', 'loaded'] },
            approach: { type: 'string', enum: ['outward', 'inward'] },
          }),
          required: ['mode'],
        },
        references: {
          referenceId: 'optional-exact-visible',
          sampleId: 'optional-exact-visible',
          comparatorId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 4,
        learningEnergy: STUDY,
        costs:
          'Study: 4 rounds, 0.5 energy each. assess (materialIds, supportIds, referenceId, sampleId, or comparatorId): 1 round, 0.2; reports each requirement met or missing. assemble: materialIds [beam: your whole untreated branch unit; optional fulcrum: your whole stone or flint unit, set where you stand on firm ground], or supportIds [a solid stone or flint object in reach], and referenceId (your non-food piece that does not decay, at most 1 unit): 3 paid rounds of 0.5, continuing; resume with assemble and comparatorId. test, compare: one reading, 1 round, 0.2, at your comparator; reading empty or loaded (sampleId: your unreserved item, at most 1 unit); approach outward or inward. inspect: 1 round, 0.2. dismantle: 1 round, 0.2. Checks run before any charge; gather, pickup and travel are separate; no refund.',
        effects:
          'Assumed: a branch is a uniform 1.1 m beam laid at its midpoint; positions are fractions of the half-beam from the fulcrum (+ toward the reference), read to 0.02; the seat is at -0.9. A reading slides the reference until the beam tips: torques of the actual masses against stiction 0.005 m x mass on the fulcrum, so outward and inward tips bracket a null range. A test (3+ empty and 3+ loaded readings of one sample, both directions each) passes if each set repeats within 0.04 and closes; a new test replaces it. compare on a tested comparator: an empty check, 3+ loaded readings of one sample (both directions) and a closing empty check within 0.04 of the test give an endpoint: sample/reference = (null - empty null)/0.9 as an interval. A later endpoint of the same sample (followed through pickup, cutting or exposure) and reference gives after/before: decrease or increase only if it excludes 1, else inconclusive; a wet stone or flint reference adds 1%, other wet references are inconclusive. Rain voids a test; a fulcrum losing firm ground damages it. Parts keep their ids and return on dismantle. No grams, water, safety or reward.',
        handler: HANDLER,
        revision: REVISION,
        authored: false,
        // The assembly event carries no qualified flag: assembling earns no practice milestone.
        practiceEvidence: event('assembled'),
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'Assembly continues each round; an unworked round pauses it, keeping placed parts, and assemble with comparatorId resumes after rechecks. Other modes take one round.',
        },
      },
    ],
    handlers: { [HANDLER]: execute },
    processes: {},
    visualComponents: [],
    events: [
      event('assessed'),
      event('progress'),
      event('paused'),
      event('resumed'),
      event('assembled'),
      event('reading'),
      event('tested'),
      event('invalid'),
      event('endpoint'),
      event('compared'),
      event('inconclusive'),
      event('inspected'),
      event('wetted'),
      event('failed'),
      event('dismantled'),
      event('interrupted'),
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath,
  };
  return { package: pkg, calibrated, weigh };
}

/** ex19: Moss's general lever mass comparator: assessment, paid assembly, validity tests,
 * reference-relative before/after comparisons, inspection and dismantling. */
export const LONG_EX19_LEVER_MASS_COMPARATOR: V7Package =
  leverMassComparatorKit({
    id: 'lever-mass-comparator',
    scope: 'long-ex19',
    dependencies: ['foundation-open@1'],
    events: 'lever-comparator',
    name: 'Lever mass comparator',
    equivalence: 'measurement:lever-comparator:reference-mass-ratio:1',
    reuse: {
      experiment:
        'Registry check: no installed or installable long-ex19 interface weighs or compares masses; ex10 food-assay@1 (prepare-balance), assay-woven-supports@1, measured-food-preservation@1 and noningestive-extractability@1 weigh with calibrated pan balances in scope open-ex10, are not installable here and are not argument-compatible (vine pans, calibrated weights, mastery), so none is reused. Reused: ex16 branch-screen@1 (declared 1.1 m branch rod); ex10 material-geometry@1 (wood density, modulus, strength); ex19 shell-compression-opening@1 and cutting-edge-assessment@1 (shared contact and firm-ground checks)',
      source:
        'long-branch-screen-exposure.ts (BRANCH_SCREEN_GEOMETRY); long-ex19-material-contact.ts; collective-work.ts (workCreate, workPay, workStop, collectiveJobs); open-foundation.ts (openRemember); forest-food-accounting.ts (foodUnitMass); forest-climate.ts (rain); forest-references.ts; events of base pickup, thin-slice-food-drying-trial@1 and food-air-exposure-trial@1 read to follow a sample; loose-material object drawing',
      description:
        'Implementation reuse only; no beam, stone, instrument, skill or mastery is supplied and the reused packages are unchanged. New work is the lever geometry, the torque and stiction law, the reading, test and endpoint rules and the comparator object.',
    },
  }).package;
