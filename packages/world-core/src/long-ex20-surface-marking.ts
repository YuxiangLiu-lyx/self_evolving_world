import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7Signature,
  v7String,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7SegmentDistance,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { foodWaterActive, foodWaterInitialize } from './food-water.js';
import { openConditions, openMaterial } from './open-physical.js';
import { OPEN_FOUNDATION, openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

/** Hand reach for the surface, measured from the body centre (World Agent specification). */
const REACH = 0.5;
/** The reused probe press: its load; the probe itself charges 0.5 energy and a 0.1 sample. */
const PRESS = 0.5;
const SAMPLE = 0.1;
const TEST_ENERGY = 0.5;
/** Draw bounds (World Agent specification). */
const STROKES = 3;
const PATH = 0.3;
const STROKE_ENERGY = 0.2;
const STROKE_MATERIAL = 0.3;
const POINTS = 4;
const BUDGET = 1;
/** Declared contact geometry: a fingertip press spot and a finger-wide stroke. */
const DAB = 0.02;
const WIDTH = 0.02;
/** Share of the released liquid that stays on the hand as residue. */
const HAND = 0.25;
/** Deposited mass per unit area that covers the contact area completely. */
const FULL = 0.05;
/** A liquid stain is translucent: at full coverage it carries this share of its own colour. */
const OPACITY = 0.6;
/** Smallest colour distance (0-1) counted as a visible mark. */
const VISIBLE = 0.05;
/** Strokes closer than one stroke width touch. */
const TOUCH = WIDTH;
/** Step for checking the ground along a stroke. */
const STEP = 0.05;
/** Ground that holds a liquid film when not waterlogged. The only represented ground
 * appearance is the observatory terrain palette, so its tones are the assumed ground tones. */
const RETAINING = ['f', '.', ':'];
const WATER = ['~', '='];
const TONES: Record<string, string> = {
  f: '#52644a',
  '.': '#7d8860',
  ':': '#888b78',
  ',': '#596e61',
};
const GROUND_NAMES: Record<string, string> = {
  f: 'forest floor',
  '.': 'meadow ground',
  ':': 'rocky ground',
  ',': 'wet bank',
};
const TREATED = [
  'componentLots',
  'materialLayer',
  'frictionKit',
  'waterCup',
  'mantle',
  'canopyDrying',
] as const;

type Rgb = [number, number, number];
type Pt = { x: number; y: number };
type Planned = { points: Pt[]; material: number; length: number };
interface Facts {
  resource: string;
  name: string;
  color: string;
  unitMass: number;
  liquidShare: number;
  liquidBasis: string;
  strength: number;
  flexibility: number;
  pulps: boolean;
}
/** One contact: what was debited and where it went. */
interface Transfer extends V7Data {
  debit: number;
  pulped: boolean;
  liquid: number;
  deposit: number;
  residue: number;
  waste: number;
  coverage: number;
  color: string;
  contrast: number;
  visible: boolean;
}
/** A deposited mark in surface-local coordinates (offsets from the test point). */
interface Mark extends Transfer {
  kind: 'dab' | 'stroke';
  index: number;
  points: Pt[];
  radius: number;
  width: number;
  length: number;
  at: number;
}
interface Surface extends V7Data {
  ref: string;
  x: number;
  y: number;
  ground: string;
  name: string;
  moisture: number;
  waterlogging: number;
  regime: string;
  holdsLiquid: boolean;
  tone: string;
  observedAt: number;
}
interface Totals extends V7Data {
  debited: number;
  liquid: number;
  deposit: number;
  residue: number;
  waste: number;
}
/** The persistent marking record: one test round, then optional paid strokes. */
interface Marking extends CollectiveWork {
  stage: string;
  source: string;
  resource: string;
  floor: number;
  budget: number;
  surface: Surface;
  test: V7Data;
  plan: Planned[];
  quote: V7Data | null;
  marks: Mark[];
  totals: Totals;
  deposit: string | null;
  pattern: V7Data | null;
  pausedAt: number | null;
  endedAt: number | null;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const fine = (x: number) => Math.round(x * 1e4) / 1e4;
const nothing = (text: string, cause?: unknown) =>
  new Error(
    `${text} Nothing was spent.`,
    cause === undefined ? undefined : { cause },
  );

function rgb(value: string): Rgb | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  return m
    ? [
        parseInt(m[1] ?? '', 16),
        parseInt(m[2] ?? '', 16),
        parseInt(m[3] ?? '', 16),
      ]
    : null;
}
const hex = (c: Rgb) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
/** Colour distance on 0-1: Euclidean RGB distance over its maximum. */
const distance = (a: Rgb, b: Rgb) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (255 * Math.sqrt(3));
const lengthOf = (points: Pt[]) =>
  points.slice(1).reduce((n, p, i) => n + v7Distance(points[i] ?? p, p), 0);
const at = (anchor: V7Point, p: Pt): V7Point => ({
  x: anchor.x + p.x,
  y: anchor.y + p.y,
});
/** Vertices plus points every STEP along each segment. */
function along(points: V7Point[]): V7Point[] {
  const out: V7Point[] = [];
  points.forEach((p, i) => {
    out.push(p);
    const q = points[i + 1];
    if (!q) return;
    const n = Math.floor(v7Distance(p, q) / STEP);
    for (let k = 1; k <= n; k++)
      out.push({
        x: p.x + ((q.x - p.x) * k) / (n + 1),
        y: p.y + ((q.y - p.y) * k) / (n + 1),
      });
  });
  return out;
}
const retains = (k: ReturnType<typeof openConditions>) =>
  RETAINING.includes(k.ground) && k.waterlogging <= 0.1;

/** The represented facts a contact transfer needs, or why the material has none. */
function facts(w: V7World, s: V7Stack): Facts | string {
  const r: V7Resource | undefined =
    collectiveFoodProfile(w, s) ?? w.resources.find((x) => x.id === s.resource);
  if (!r) return 'The material has no represented properties.';
  if (!rgb(r.color)) return 'The material has no represented colour.';
  const life =
    w.resources.find((x) => x.id === s.resource)?.properties?.decay ?? 0;
  if (life > 0 && (s.decay ?? 0) >= life)
    return 'Spoiled material is not usable.';
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== 'preservationPhysics')
  )
    return 'Treated or combined material has no defined contact result.';
  let liquidShare: number | null = null,
    liquidBasis = '';
  if (s.physical && s.physical.unitMass > 0) {
    liquidShare = s.physical.unitWater / s.physical.unitMass;
    liquidBasis = 'its own water record';
  } else if (foodWaterActive(w))
    try {
      // The food water composition (berry 0.85, root 0.75), read on a copy.
      liquidShare = foodWaterInitialize(w, v7Clone(s)).initialWaterFraction;
      liquidBasis = 'the food water composition';
    } catch {
      liquidShare = null;
    }
  if (liquidShare === null && typeof r.properties?.moisture === 'number') {
    liquidShare = r.properties.moisture;
    liquidBasis = 'its moisture property';
  }
  if (liquidShare === null) return 'The material has no represented liquid.';
  const p = openMaterial(r);
  return {
    resource: s.resource,
    name: r.name,
    color: r.color,
    unitMass: s.physical?.unitMass ?? r.mass,
    liquidShare: Math.max(0, Math.min(1, liquidShare)),
    liquidBasis,
    strength: p.strength,
    flexibility: p.flexibility,
    // The probe press reports held = strength >= load; a soft sample without flexibility pulps.
    pulps: p.strength < PRESS && p.flexibility === 0,
  };
}

/** One contact: the debited amount splits into deposit, hand residue and waste. */
function transfer(
  m: Facts,
  debit: number,
  retain: boolean,
  area: number,
  tone: string,
): Transfer {
  const liquid = m.pulps ? debit * m.liquidShare : 0,
    residue = liquid * HAND,
    deposit = retain ? liquid - residue : 0;
  const ground = rgb(tone) ?? [0, 0, 0],
    own = rgb(m.color) ?? ground;
  const coverage =
    deposit > 0 ? Math.min(1, (deposit * m.unitMass) / (area * FULL)) : 0;
  const a = OPACITY * coverage;
  const color = hex([
    ground[0] + (own[0] - ground[0]) * a,
    ground[1] + (own[1] - ground[1]) * a,
    ground[2] + (own[2] - ground[2]) * a,
  ]);
  const contrast = fine(distance(rgb(color) ?? ground, ground));
  return {
    debit: round(debit),
    pulped: m.pulps,
    liquid: round(liquid),
    deposit: round(deposit),
    residue: round(residue),
    waste: round(debit - round(deposit) - round(residue)),
    coverage: fine(coverage),
    color,
    contrast,
    visible: deposit > 0 && contrast >= VISIBLE,
  };
}

/** Visible strokes that meet with at least three arms at one point form a branching. */
function junctions(strokes: V7Point[][]): number {
  const found: V7Point[] = [];
  const near = (p: V7Point, q: V7Point | undefined) =>
    !!q && v7Distance(p, q) <= TOUCH;
  for (const s of strokes)
    for (const p of [s[0], s.at(-1)]) {
      if (!p || found.some((q) => near(p, q))) continue;
      let arms = 0;
      for (const t of strokes) {
        const d = Math.min(
          ...t.slice(1).map((q, i) => v7SegmentDistance(t[i] ?? q, q, p)),
        );
        if (d > TOUCH) continue;
        arms += near(p, t[0]) || near(p, t.at(-1)) ? 1 : 2;
      }
      if (arms >= 3) found.push(p);
    }
  return found.length;
}

/** A general hand-applied marking operation: a probe press test, then bounded strokes. */
export function surfaceMarkingPackage(id: string, scope: string): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const stateKey = `long:work:${id}`;
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Marking);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && open(j));
  const sync = (a: V7Actor, j: Marking) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const escrowOf = (w: V7World, j: Marking) =>
    w.stacks.find((s) => j.escrow.includes(s.id) && s.reservedFor === j.id);
  const anchorOf = (j: Marking): V7Point => ({
    x: j.surface.x,
    y: j.surface.y,
  });
  const seenBy = (w: V7World, a: V7Actor) =>
    new Set(
      v7Observe(w, a.id).terrain.map((t) => `${String(t.x)},${String(t.y)}`),
    );

  /** Why a point cannot take a mark now, or null. */
  function blocked(
    w: V7World,
    a: V7Actor,
    p: V7Point,
    seen: Set<string>,
  ): string | null {
    if (!v7Inside(w, p, 0)) return 'lies outside the world';
    if (v7Distance(a.position, p) > REACH + 1e-9)
      return `is beyond hand reach (${String(REACH)} from you)`;
    if (!seen.has(`${String(Math.floor(p.x))},${String(Math.floor(p.y))}`))
      return 'is on ground you do not see now';
    if (WATER.includes(openConditions(w, p).ground))
      return 'is water, not ground';
    if (
      w.actors.some(
        (x) => x.vitals.health > 0 && v7Distance(x.position, p) < x.radius,
      )
    )
      return 'is under a body';
    if (
      w.objects.some(
        (o) =>
          (o.spatial.solid || o.spatial.reserved) &&
          v7ShapeDistance(p, o.spatial) <= 0,
      )
    )
      return 'is covered by a solid or reserved object';
    return null;
  }

  /** Rechecks for one stroke on the tested surface; null when it may be drawn. */
  function strokeProblem(
    w: V7World,
    a: V7Actor,
    j: Marking,
    s: Planned,
  ): string | null {
    const seen = seenBy(w, a),
      anchor = anchorOf(j);
    for (const p of along(s.points.map((p) => at(anchor, p)))) {
      const why = blocked(w, a, p, seen);
      if (why) return `A stroke point ${why}.`;
      const k = openConditions(w, p);
      if (k.ground !== j.surface.ground || !retains(k))
        return `A stroke point leaves the tested ${j.surface.name}, or that ground is now waterlogged.`;
    }
    return null;
  }

  /** What a mark shows on the ground: geometry, deposit, colour, contrast and coverage. The
   * full debit split stays in the work record and the events. */
  const shown = (m: Mark): V7Data => ({
    kind: m.kind,
    index: m.index,
    points: m.points,
    ...(m.kind === 'dab'
      ? { radius: m.radius }
      : { width: m.width, length: m.length }),
    deposit: m.deposit,
    coverage: m.coverage,
    color: m.color,
    contrast: m.contrast,
    visible: m.visible,
    at: m.at,
  });

  /** Reusable rendering metadata: only actually deposited, visible portions are drawn. */
  function view(w: V7World, j: Marking): V7Data {
    const o = w.objects.find((o) => o.id === j.deposit);
    return {
      component: 'applied-mark',
      deposit: j.deposit,
      surface: j.surface.ref,
      x: j.surface.x,
      y: j.surface.y,
      ground: j.surface.ground,
      groundTone: j.surface.tone,
      marks: j.marks.filter((m) => m.visible).map(shown),
      transferred: j.totals.deposit,
      residue: j.totals.residue,
      wetness: 'not modelled after application',
      durability: 'untested',
      state: j.stage,
      createdAt: o?.createdAt ?? null,
      updatedAt: w.tick,
    };
  }
  function summary(w: V7World, j: Marking): V7Data {
    return {
      work: j.id,
      stage: j.stage,
      status: j.status,
      source: j.source,
      reserve: j.escrow,
      floor: j.floor,
      budget: j.budget,
      surface: j.surface,
      test: j.test,
      quote: j.quote,
      strokesDone: j.marks.filter((m) => m.kind === 'stroke').length,
      strokesPlanned: j.plan.length,
      totals: j.totals,
      pattern: j.pattern,
      paidEnergy: round(j.paidEnergy),
      tick: w.tick,
      view: view(w, j),
    };
  }
  function add(j: Marking, t: Transfer) {
    j.totals = {
      debited: round(j.totals.debited + t.debit),
      liquid: round(j.totals.liquid + t.liquid),
      deposit: round(j.totals.deposit + t.deposit),
      residue: round(j.totals.residue + t.residue),
      waste: round(j.totals.waste + t.waste),
    };
  }
  function changed(o: V7Object, tick: number, change: string) {
    o.data.changes = [
      ...(Array.isArray(o.data.changes) ? o.data.changes : []),
      { tick, change },
    ];
  }
  /** Records a deposited mark on the ground mark object, creating it at the first deposit. */
  function lay(c: V7ActionContext, j: Marking, mark: Mark, name: string) {
    const w = c.world;
    j.marks = [...j.marks, mark];
    let o = w.objects.find((o) => o.id === j.deposit);
    if (!o) {
      o = {
        id: v7Id(w, 'mark'),
        kind: 'applied-mark',
        name: `${name} mark`,
        spatial: {
          ...anchorOf(j),
          angle: 0,
          shape: { kind: 'circle', radius: DAB },
          solid: false,
          interaction: w.config.interaction,
          entrances: [],
        },
        visual: {
          component: 'applied-mark',
          color: mark.color,
          accent: j.surface.tone,
          label: 'Applied mark',
          state: j.stage,
        },
        data: {
          operation: id,
          owner: c.actor.id,
          workId: j.id,
          material: j.resource,
          source: j.source,
          surface: {
            ref: j.surface.ref,
            ground: j.surface.name,
            tone: j.surface.tone,
          },
          marks: [],
          transferred: 0,
          durability: 'untested',
          persistence:
            'No rain, smearing or fading rule is represented; this is the mark as applied.',
          changes: [],
        },
        createdBy: c.actor.id,
        createdAt: w.tick,
        revision,
      };
      w.objects.push(o);
      j.deposit = o.id;
      j.target = o.id;
      j.outputs = [o.id];
    }
    o.data.marks = j.marks.map(shown);
    o.data.transferred = j.totals.deposit;
    changed(o, w.tick, `${mark.kind} ${String(mark.index)} applied`);
    const extent = Math.max(
      DAB,
      ...j.marks.flatMap((m) => m.points.map((p) => Math.hypot(p.x, p.y))),
    );
    o.spatial.shape = { kind: 'circle', radius: round(extent + WIDTH / 2) };
    if (mark.visible) o.visual.color = mark.color;
    o.visual.state = j.stage;
  }
  function note(w: V7World, j: Marking, change: string) {
    const o = w.objects.find((o) => o.id === j.deposit);
    if (!o) return;
    o.visual.state = j.stage;
    changed(o, w.tick, change);
  }

  function test(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const existing = current(w, a);
    if (existing)
      throw nothing(
        `Your marking work ${existing.id} is still open; draw or cancel it first.`,
      );
    if (action.args.strokes !== undefined)
      throw nothing('Test takes no strokes; draw after a visible test.');
    const tool = action.args.applicatorId;
    if (typeof tool === 'string' && tool) {
      const held = w.stacks.find((s) => s.id === tool);
      if (!held || held.owner !== a.id)
        throw nothing('An applicator must be an item you hold.');
      throw nothing(
        'No applicator transfer is represented in this version; apply with your hand.',
      );
    }
    const source = w.stacks.find(
      (s) => s.id === v7String(action.args.sourceId, 'sourceId'),
    );
    if (!source || source.owner !== a.id)
      throw nothing('Name one of your own stacks by its exact item id.');
    if (source.reservedFor)
      throw nothing('That item is reserved for unfinished work.');
    const m = facts(w, source);
    if (typeof m === 'string') throw nothing(m);
    const budget =
      action.args.budget === undefined
        ? SAMPLE
        : v7Number(action.args.budget, 'budget', SAMPLE, BUDGET);
    const floor =
      action.args.floor === undefined
        ? 0
        : v7Number(action.args.floor, 'floor', 0);
    let budgetTenths: number, floorTenths: number;
    try {
      budgetTenths = foodTenths(budget);
      floorTenths = foodTenths(floor);
    } catch (error) {
      throw nothing('Budget and floor are whole tenths of a unit.', error);
    }
    if (foodTenths(source.quantity) - budgetTenths < floorTenths)
      throw nothing(
        `${source.id} holds ${String(source.quantity)}; a budget of ${String(budget)} would leave less than the floor of ${String(floor)}.`,
      );
    if (action.args.x === undefined || action.args.y === undefined)
      throw nothing('Give x and y: a ground point within hand reach.');
    const point = {
      x: v7Number(action.args.x, 'x'),
      y: v7Number(action.args.y, 'y'),
    };
    const why = blocked(w, a, point, seenBy(w, a));
    if (why) throw nothing(`The test point ${why}.`);
    if (a.vitals.energy < TEST_ENERGY)
      throw nothing('The test needs 0.5 energy.');
    const probe = OPEN_FOUNDATION.handlers['open.probe'];
    if (!probe) throw new Error('Missing baseline probe.');
    // The reused probe press: one round, 0.5 energy and a consumed 0.1 sample of the source.
    const before = a.vitals.energy;
    probe({
      ...c,
      action: {
        interface: action.interface,
        args: { target: source.id, mode: 'press', intensity: PRESS },
      },
    });
    const k = openConditions(w, point),
      tone = TONES[k.ground] ?? '#000000',
      retain = retains(k);
    const t = transfer(m, SAMPLE, retain, Math.PI * DAB * DAB, tone);
    const j = workCreate(c, 'mark', 1) as Marking;
    j.paidEnergy = round(before - a.vitals.energy);
    j.completedWork = 1;
    j.remainingWork = 0;
    j.lastPaid = w.tick;
    const surface: Surface = {
      ref: `ground:${String(Math.floor(point.x))}:${String(Math.floor(point.y))}`,
      x: point.x,
      y: point.y,
      ground: k.ground,
      name: GROUND_NAMES[k.ground] ?? 'ground',
      moisture: k.moisture,
      waterlogging: k.waterlogging,
      regime: k.regime,
      holdsLiquid: retain,
      tone,
      observedAt: w.tick,
    };
    Object.assign(j, {
      stage: t.visible ? 'tested' : 'no-visible-transfer',
      source: source.id,
      resource: source.resource,
      floor,
      budget,
      surface,
      test: {
        ...t,
        tick: w.tick,
        load: PRESS,
        held: m.strength >= PRESS,
        flexibility: m.flexibility,
        liquidShare: round(m.liquidShare),
        liquidBasis: m.liquidBasis,
        materialColor: m.color,
      },
      plan: [],
      quote: null,
      marks: [],
      totals: { debited: 0, liquid: 0, deposit: 0, residue: 0, waste: 0 },
      deposit: null,
      pattern: null,
      pausedAt: null,
      endedAt: null,
    });
    add(j, t);
    if (t.visible)
      lay(
        c,
        j,
        {
          ...t,
          kind: 'dab',
          index: 0,
          points: [{ x: 0, y: 0 }],
          radius: DAB,
          width: 0,
          length: 0,
          at: w.tick,
        },
        m.name,
      );
    const more = t.visible && budgetTenths > foodTenths(SAMPLE);
    if (more)
      workReserve(
        c,
        j,
        workAllocations(c, [
          { itemId: source.id, quantity: round(budget - SAMPLE) },
        ]),
      );
    j.x = point.x;
    j.y = point.y;
    j.status = more ? 'paused' : 'completed';
    j.reason = more
      ? 'Tested; the reserve waits for draw or cancel.'
      : 'Test complete.';
    if (!more) j.endedAt = w.tick;
    openRemember(c, {
      key: `${source.resource}:hand-press-mark:${k.ground}:${k.regime}`,
      subject: source.resource,
      property: 'mark left by a hand press on ground',
      value: {
        visible: t.visible,
        contrast: t.contrast,
        coverage: t.coverage,
        color: t.color,
        deposit: t.deposit,
        pulped: t.pulped,
        ground: surface.name,
      },
      method: 'hand press of a 0.1 sample at load 0.5, then a direct look',
      condition: `${surface.name}, ${k.regime}; durability and other surfaces untested`,
      verified: true,
    });
    c.emit(
      'marking-tested',
      t.visible
        ? `The pressed sample left a visible mark on the ${surface.name} (contrast ${String(t.contrast)}).${more ? ` ${String(round(budget - SAMPLE))} is reserved for drawing.` : ''} Durability untested.`
        : t.pulped
          ? `The pressed sample left no visible mark on the ${surface.name}; the sample is spent.`
          : 'The sample did not pulp under the press: no liquid was released and no mark was left; the sample is spent.',
      {
        ...summary(w, j),
        mode: 'test',
        debit: { item: source.id, quantity: SAMPLE },
      },
      j.deposit ?? source.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, source.id, ...j.escrow, ...(j.deposit ? [j.deposit] : [])],
    };
  }

  function strokesOf(value: unknown): Planned[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > STROKES)
      throw nothing('Give strokes: 1 to 3 strokes.');
    const list = value.map((raw: unknown): Planned => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw nothing('Each stroke needs points and material.');
      const r = raw as Record<string, unknown>;
      const material = v7Number(
        r.material,
        'stroke material',
        SAMPLE,
        STROKE_MATERIAL,
      );
      try {
        foodTenths(material);
      } catch (error) {
        throw nothing('Stroke material is whole tenths of a unit.', error);
      }
      if (
        !Array.isArray(r.points) ||
        r.points.length < 2 ||
        r.points.length > POINTS
      )
        throw nothing('Each stroke has 2 to 4 points.');
      const points = r.points.map((raw: unknown): Pt => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw nothing('Each point is an x, y offset.');
        const p = raw as Record<string, unknown>;
        return {
          x: v7Number(p.x, 'point x', -1, 1),
          y: v7Number(p.y, 'point y', -1, 1),
        };
      });
      const length = lengthOf(points);
      if (!(length > 0)) throw nothing('A stroke needs a positive length.');
      return { points, material, length: fine(length) };
    });
    const total = list.reduce((n, s) => n + lengthOf(s.points), 0);
    if (total > PATH + 1e-9)
      throw nothing(
        `The strokes total ${String(fine(total))}; at most ${String(PATH)} is allowed.`,
      );
    return list;
  }
  const shape = (list: Planned[]) =>
    v7Signature(list.map((s) => ({ points: s.points, material: s.material })));

  function pause(c: V7ActionContext, j: Marking, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    c.emit(
      'marking-paused',
      `${reason} Drawing paused before any charge; strokes already drawn remain.`,
      summary(c.world, j),
      j.deposit ?? j.id,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  /** Ends open work whose reserve is gone or unusable; applied marks remain. */
  function lost(w: V7World, a: V7Actor, j: Marking, reason: string) {
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(w, a, j, reason, false);
    j.stage = 'ended';
    j.endedAt = w.tick;
    note(w, j, 'work ended');
    forestEvent(
      w,
      'marking-ended',
      `${reason} Marks already applied remain; nothing is refunded.`,
      anchorOf(j),
      a.id,
      summary(w, j),
      j.deposit ?? j.id,
    );
    sync(a, j);
  }

  function finish(c: V7ActionContext, j: Marking): V7HandlerResult {
    const { world: w, actor: a } = c;
    const released: string[] = [];
    for (const s of w.stacks.filter(
      (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
    )) {
      delete s.reservedFor;
      s.owner = a.id;
      s.position = { ...a.position };
      released.push(s.id);
    }
    const visible = j.marks.filter((m) => m.kind === 'stroke' && m.visible);
    const anchor = anchorOf(j);
    const n = junctions(visible.map((m) => m.points.map((p) => at(anchor, p))));
    j.pattern = {
      visibleStrokes: visible.length,
      junctions: n,
      branching: n > 0,
    };
    j.status = 'completed';
    j.stage = 'completed';
    j.reason = 'All planned strokes were drawn.';
    j.endedAt = w.tick;
    note(w, j, 'drawing completed');
    openRemember(c, {
      key: `${j.deposit ?? j.id}:applied-pattern`,
      subject: j.resource,
      property: 'pattern drawn by hand on ground',
      value: { ...j.pattern, transferred: j.totals.deposit },
      method: 'paid hand strokes, then a direct look',
      condition: `${j.surface.name}; durability untested`,
      verified: true,
    });
    c.emit(
      'marking-completed',
      `${String(visible.length)} visible stroke(s) drawn on the ${j.surface.name}${n > 0 ? '; they meet in a branching pattern' : '; they form no branching'}. Unused reserve returned. Durability untested.`,
      { ...summary(w, j), released },
      j.deposit ?? j.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...j.escrow, ...(j.deposit ? [j.deposit] : [])],
    };
  }

  function draw(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const j = current(w, a);
    if (!j) throw nothing('You have no tested marking work open; test first.');
    if (j.stage === 'tested') {
      const list = strokesOf(action.args.strokes);
      const escrow = escrowOf(w, j);
      const material = list.reduce((n, s) => n + foodTenths(s.material), 0);
      if (!escrow || foodTenths(escrow.quantity) < material)
        throw nothing(
          `The strokes need ${String(material / 10)}; the reserve holds ${String(escrow?.quantity ?? 0)}.`,
        );
      for (const s of list) {
        const why = strokeProblem(w, a, j, s);
        if (why) throw nothing(why);
      }
      if (a.vitals.energy < STROKE_ENERGY)
        throw nothing('A stroke needs 0.2 energy.');
      const quote = {
        strokes: list.length,
        length: fine(list.reduce((n, s) => n + lengthOf(s.points), 0)),
        energy: round(STROKE_ENERGY * list.length),
        material: material / 10,
        rounds: list.length,
      };
      j.plan = list;
      j.quote = quote;
      j.stage = 'drawing';
      j.initialWork = 1 + list.length;
      j.remainingWork = list.length;
      c.emit(
        'marking-draw-quoted',
        `Drawing ${String(quote.strokes)} stroke(s), ${String(quote.length)} long in total: at most ${String(quote.energy)} energy, ${String(quote.material)} material and ${String(quote.rounds)} round(s).`,
        summary(w, j),
        j.deposit ?? j.id,
      );
    } else if (j.stage !== 'drawing')
      throw nothing('Your marking work is not ready to draw.');
    else if (
      action.args.strokes !== undefined &&
      shape(strokesOf(action.args.strokes)) !== shape(j.plan)
    )
      throw nothing(
        'A different stroke plan is a new attempt; cancel this work first.',
      );
    const done = j.marks.filter((m) => m.kind === 'stroke').length;
    const s = j.plan[done];
    if (!s) return finish(c, j);
    const escrow = escrowOf(w, j);
    const m = escrow ? facts(w, escrow) : 'The reserved material is gone.';
    if (!escrow || typeof m === 'string') {
      lost(w, a, j, typeof m === 'string' ? m : 'The reserve is unusable.');
      return { complete: true, remaining: 0, writes: [j.id] };
    }
    const source = w.stacks.find((x) => x.id === j.source);
    const problem =
      foodTenths(escrow.quantity) < foodTenths(s.material)
        ? 'The reserve holds less than this stroke needs.'
        : foodTenths(source?.quantity ?? 0) < foodTenths(j.floor)
          ? `The source holds less than the floor of ${String(j.floor)}; cancel to return the reserve.`
          : (strokeProblem(w, a, j, s) ??
            (a.vitals.energy < STROKE_ENERGY
              ? 'A stroke needs 0.2 energy.'
              : null));
    if (problem) {
      if (done === 0 && j.pausedAt === null) throw nothing(problem);
      return pause(c, j, problem);
    }
    const resumed = j.pausedAt !== null;
    if (!workPay(c, j, STROKE_ENERGY))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'marking-resumed',
        'Drawing resumed after rechecking reach, surface, reserve, floor and energy.',
        summary(w, j),
        j.deposit ?? j.id,
      );
    }
    foodSetQuantity(
      escrow,
      foodTenths(escrow.quantity) - foodTenths(s.material),
    );
    if (escrow.quantity <= 0)
      w.stacks = w.stacks.filter((x) => x.id !== escrow.id);
    const t = transfer(m, s.material, true, s.length * WIDTH, j.surface.tone);
    add(j, t);
    const mark: Mark = {
      ...t,
      kind: 'stroke',
      index: done + 1,
      points: s.points,
      radius: 0,
      width: WIDTH,
      length: s.length,
      at: w.tick,
    };
    lay(c, j, mark, m.name);
    c.emit(
      'marking-stroke',
      t.visible
        ? `Stroke ${String(done + 1)} of ${String(j.plan.length)} drawn: ${String(t.deposit)} deposited, contrast ${String(t.contrast)}.`
        : `Stroke ${String(done + 1)} of ${String(j.plan.length)} left no visible mark.`,
      {
        ...summary(w, j),
        mode: 'draw',
        stroke: mark,
        debit: { item: escrow.id, quantity: s.material },
      },
      j.deposit ?? j.id,
    );
    if (done + 1 >= j.plan.length) return finish(c, j);
    sync(a, j);
    return {
      complete: false,
      remaining: j.plan.length - done - 1,
      writes: [j.id, escrow.id, ...(j.deposit ? [j.deposit] : [])],
    };
  }

  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j) throw nothing('You have no open marking work to cancel.');
    const released = j.escrow.filter((x) =>
      w.stacks.some((s) => s.id === x && s.reservedFor === j.id),
    );
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Marking cancelled; the unused reserve returns to you. Spent material, time and energy are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.endedAt = w.tick;
    note(w, j, 'work cancelled');
    c.emit(
      'marking-cancelled',
      'Marking cancelled. Marks already applied remain; the unused reserve is yours again.',
      { ...summary(w, j), released },
      j.deposit ?? j.id,
    );
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, ...released] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = v7String(c.action.args.mode, 'mode');
    if (mode === 'test') return test(c);
    if (mode === 'draw') return draw(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing('Unknown marking mode.');
  }

  /** The reserve stays in hand; a spoiled reserve ends the work; an unworked drawing round
   * stops contact without charge. */
  function environment(w: V7World) {
    for (const j of works(w).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      const escrow = escrowOf(w, j);
      if (!escrow) {
        lost(w, a, j, 'The reserved material spoiled or is gone.');
        continue;
      }
      escrow.position = { ...a.position };
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.reason = 'Not drawn this round; strokes already drawn remain.';
        j.pausedAt = w.tick;
        forestEvent(
          w,
          'marking-interrupted',
          'Drawing stopped because no stroke was made this round; strokes already drawn remain and nothing was charged.',
          anchorOf(j),
          a.id,
          summary(w, j),
          j.deposit ?? j.id,
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
      'Hand application of a marking material to ground: the reused probe press tests whether a small sample leaves a visible mark on a reachable ground patch; if it does, up to three bounded paid strokes deposit more of a reserved budget there. Deposit, hand residue and waste are conserved; colour and contrast come from the material colour and the ground; durability is untested.',
    reuse: {
      experiment:
        'foundation-open@1 probe press (open.probe) for the test; expression mark (a sign without physical effect) is not equivalent; ex16 branch-screen@1 (appearance-valued structure, no deposit) and the ex13 residue-transfer packages (loose non-food residue, no colour) do not fit',
      source:
        'open-foundation.ts (open.probe press, openRemember); open-physical.ts (openConditions, openMaterial); collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); food-water.ts (food water composition); collective-food-profile.ts; forest-food-accounting.ts; continuous-geometry.ts; continuous-observation.ts',
      description:
        'The test is the unchanged probe press, not a new invention. New work is the contact transfer, the stroke path, the ground mark record and the reserve floor.',
    },
    abilities: [
      {
        id,
        name: 'Apply marking material',
        function:
          'Press a small sample of your own material onto nearby ground to see whether it leaves a visible mark; if so, draw up to three short strokes there.',
        equivalence: 'surface:hand-applied-material-mark:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['test', 'draw', 'cancel'] },
            sourceId: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            budget: { type: 'number', minimum: SAMPLE, maximum: BUDGET },
            floor: { type: 'number', minimum: 0 },
            applicatorId: { type: 'string' },
            strokes: {
              type: 'array',
              items: v7ObjectSchema({
                points: {
                  type: 'array',
                  items: v7ObjectSchema({
                    x: { type: 'number' },
                    y: { type: 'number' },
                  }),
                },
                material: {
                  type: 'number',
                  minimum: SAMPLE,
                  maximum: STROKE_MATERIAL,
                },
              }),
            },
          }),
          required: ['mode'],
        },
        references: {
          sourceId: 'optional-exact-visible',
          applicatorId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 1,
        costs:
          'Study: 1 round. test: sourceId, exact id of your own unreserved, unspoiled, untreated stack; x, y, a ground point at most 0.5 from you that you see now, not water, a body or a solid object; budget 0.1-1 in tenths (default 0.1) for the test and strokes; floor (default 0) must stay in the source, which needs floor + budget. One round: the probe press at load 0.5, 0.5 energy and 0.1 of the source; after a visible mark, budget - 0.1 is reserved. draw: strokes, 1-3, each 2-4 points as x, y offsets from the test point, total length at most 0.3, material 0.1-0.3 from the reserve; per stroke one round, 0.2 energy and that material, continuing each round; draw again resumes a pause. cancel: one round, no energy. Checks run before any charge; an applicator is refused (only hand contact is represented).',
        effects:
          'The press records the probe load response. A sample that does not hold the load and has no flexibility pulps and releases its liquid share (its water record, else the food water composition, else its moisture property); 1/4 stays on your hand, the rest reaches the ground; solids are waste. Firm forest floor, meadow or rocky ground keeps it; a wet bank or waterlogged ground disperses it. Colour: the material colour at 0.6 opacity times coverage over the ground tone; contrast is the 0-1 colour distance, visible from 0.05. Only a visible test allows drawing, on that ground type; strokes are 0.02 wide. Deposits form a ground mark nearby people see, with geometry, amounts, colour, contrast and coverage; branching is reported only where visible strokes meet with three arms. Durability is untested: no rain, smearing or fading rule exists. A failed recheck or an unworked round pauses at no charge. The unused reserve returns at completion or cancel and drops at death. Nothing is refunded; no food, reward or comfort.',
        handler,
        revision,
        authored: false,
        // The completion event carries no qualified flag: marking earns no practice milestone.
        practiceEvidence: 'marking-completed',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'test and cancel take one round; draw makes one paid stroke per round. Completed strokes, the reserve and the plan persist across interruption; draw resumes after rechecks.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: ['applied-mark'],
    events: [
      'marking-tested',
      'marking-draw-quoted',
      'marking-stroke',
      'marking-paused',
      'marking-resumed',
      'marking-interrupted',
      'marking-completed',
      'marking-cancelled',
      'marking-ended',
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && open(j))) {
        j.x = a.position.x;
        j.y = a.position.y;
        workStop(
          w,
          a,
          j,
          'Performer died; the unused reserve dropped where they fell. Marks already applied remain; nothing is refunded.',
          true,
        );
        j.stage = 'ended';
        j.endedAt = w.tick;
        note(w, j, 'work ended by death');
        forestEvent(
          w,
          'marking-ended',
          'Marking ended by death; marks already applied remain.',
          a.position,
          a.id,
          summary(w, j),
          j.deposit ?? j.id,
        );
        sync(a, j);
      }
    },
  };
}

/** ex20: Sol's hand-applied marking material, test and draw modes. */
export const LONG_EX20_SURFACE_MARKING = surfaceMarkingPackage(
  'apply-marking-material',
  'long-ex20',
);

/** Declared contact constants, ground palette and pure helpers above, shared read-only with
 * later ground work (ex22 draw-from-observation@1). Exporting them leaves the ex20 package, its
 * text and its behavior unchanged. */
export const SURFACE_MARKING_SHARED = {
  reach: REACH,
  width: WIDTH,
  visible: VISIBLE,
  step: STEP,
  water: WATER,
  tones: TONES,
  groundNames: GROUND_NAMES,
  rgb,
  hex,
  colorDistance: distance,
  along,
} as const;
