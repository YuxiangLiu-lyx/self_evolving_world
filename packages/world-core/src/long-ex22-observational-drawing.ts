import type {
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
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7Signature,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  ex19MaterialDark,
  ex19MaterialPiece,
} from './long-ex19-material-contact.js';
import { SURFACE_MARKING_SHARED } from './long-ex20-surface-marking.js';

/** A general drawing from direct observation: a one-groove suitability test on a reachable
 * soil patch, then up to six short finger grooves traced in two paid rounds while the subject
 * stays in view. A groove deposits nothing; it shows by the shade of its displaced-soil walls. */

const {
  reach: REACH,
  width: WIDTH,
  visible: VISIBLE,
  water: WATER,
  tones: TONES,
  groundNames: GROUND_NAMES,
  rgb,
  hex,
  colorDistance,
  along,
} = SURFACE_MARKING_SHARED;
/** Suitability trial and each drawing round (World Agent specification). */
const TEST_ENERGY = 0.5;
const ROUND_ENERGY = 0.5;
const ROUNDS = 2;
/** Drawing bounds (World Agent specification): six short strokes in a 0.3 by 0.3 patch. */
const STROKES = 6;
const EXTENT = 0.3;
const MIN_EXTENT = 0.05;
const POINTS = 8;
/** One short test groove, centred on the patch. */
const TEST = 0.05;
/** A shallow fingertip groove, half as deep as it is wide, in yielding soil. */
const DEPTH = 0.01;
/** Waterlogging above this is waterlogged ground (as ex19 and ex20 treat it). */
const WATERLOGGED = 0.1;
/** Fine, yielding soil: forest floor and meadow ground. Rocky ground is not yielding; water,
 * a wet bank and waterlogged soil flow back into a groove. */
const YIELDING = ['f', '.'];
const KIND = 'groove-drawing';
const METHODS = ['finger-groove', 'implement-groove', 'material-mark'];
const PERSISTENCE =
  'No rain, trampling or erosion rule acts on ground marks in this world, so the grooves stay as made; durability is untested.';

type Pt = { x: number; y: number };
type Planned = { points: Pt[]; length: number };
/** One groove in surface-local coordinates (offsets from the patch centre). */
interface Groove extends V7Data {
  kind: 'test' | 'stroke';
  index: number;
  points: Pt[];
  length: number;
  width: number;
  depth: number;
  retained: boolean;
  displaced: number;
  color: string;
  contrast: number;
  visible: boolean;
  at: number;
}
interface Surface extends V7Data {
  ref: string;
  x: number;
  y: number;
  ground: string;
  name: string;
  yielding: boolean;
  moisture: number;
  waterlogging: number;
  regime: string;
  tone: string;
  light: number;
  extent: number;
  observedAt: number;
}
interface Subject extends V7Data {
  ref: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  distance: number;
  observedAt: number;
}
/** The persistent drawing record: the test groove, then the planned and performed strokes. */
interface Drawing extends CollectiveWork {
  stage: string;
  method: string;
  surface: Surface;
  test: V7Data;
  subject: Subject | null;
  plan: Planned[];
  quote: V7Data | null;
  grooves: Groove[];
  drawing: string | null;
  cover: string;
  pausedAt: number | null;
  endedAt: number | null;
}

const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const fine = (x: number) => Math.round(x * 1e4) / 1e4;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const lengthOf = (points: Pt[]) =>
  points.slice(1).reduce((n, p, i) => n + v7Distance(points[i] ?? p, p), 0);
const at = (anchor: V7Point, p: Pt): V7Point => ({
  x: anchor.x + p.x,
  y: anchor.y + p.y,
});
const strokesIn = (list: Groove[]) => list.filter((g) => g.kind === 'stroke');
/** Strokes made in a round: the first half (rounded up), then the rest. */
const share = (n: number, done: number) =>
  done === 0 ? Math.ceil(n / ROUNDS) : n - done;

/** Whether the soil at a point keeps a finger groove, and why not. */
function soilAt(w: V7World, p: V7Point) {
  const k = openConditions(w, p);
  const name =
    GROUND_NAMES[k.ground] ?? (WATER.includes(k.ground) ? 'water' : 'ground');
  const reason =
    k.ground === ':'
      ? 'rocky ground does not yield to a finger: grit was brushed aside and no groove formed'
      : k.ground === ','
        ? 'the wet bank is saturated: the soil flowed back and the groove closed'
        : k.waterlogging > WATERLOGGED
          ? 'the soil is waterlogged: it flowed back and the groove closed'
          : !YIELDING.includes(k.ground)
            ? `${name} is not represented as fine, yielding soil`
            : null;
  return { k, name, retained: reason === null, reason };
}

/** A groove of the given geometry on the surface. Its floor is shaded by the share of sky its
 * walls hide at the centre of a long trench, 1 - 1 / sqrt(1 + (2 depth / width)^2), which
 * darkens the ground tone; contrast is the ex20 colour distance against that tone. */
function grooveOf(
  kind: Groove['kind'],
  index: number,
  points: Pt[],
  surface: Surface,
  retained: boolean,
  tick: number,
): Groove {
  const length = lengthOf(points),
    depth = retained ? DEPTH : 0;
  const tone = rgb(surface.tone) ?? [0, 0, 0];
  const shade = 1 - 1 / Math.sqrt(1 + ((2 * depth) / WIDTH) ** 2);
  const color = hex([
    tone[0] * (1 - shade),
    tone[1] * (1 - shade),
    tone[2] * (1 - shade),
  ]);
  const contrast = fine(colorDistance(rgb(color) ?? tone, tone));
  return {
    kind,
    index,
    points,
    length: fine(length),
    width: WIDTH,
    depth,
    retained,
    // Soil pushed into low ridges along both edges; nothing becomes portable stock.
    displaced: round(length * WIDTH * depth),
    color,
    contrast,
    visible: retained && contrast >= VISIBLE,
    at: tick,
  };
}

export function observationalDrawingPackage(
  id: string,
  scope: string,
): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const stateKey = `long:work:${id}`;
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Drawing);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const sync = (a: V7Actor, j: Drawing) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const anchorOf = (j: Drawing): V7Point => ({
    x: j.surface.x,
    y: j.surface.y,
  });
  const seenBy = (w: V7World, a: V7Actor) =>
    new Set(
      v7Observe(w, a.id).terrain.map((t) => `${String(t.x)},${String(t.y)}`),
    );
  /** Other objects whose footprint reaches the patch: the surface revision others can change. */
  const coverOf = (w: V7World, anchor: V7Point, extent: number, own: string) =>
    v7Signature(
      w.objects
        .filter(
          (o) =>
            o.id !== own &&
            v7ShapeDistance(anchor, o.spatial) <= (extent / 2) * Math.SQRT2,
        )
        .map((o) => o.id)
        .sort(),
    );

  /** Why a point cannot take a groove now, or null. */
  function blocked(
    w: V7World,
    a: V7Actor,
    p: V7Point,
    seen: Set<string>,
    own: string | null,
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
      w.objects.some((o) => o.id !== own && v7ShapeDistance(p, o.spatial) <= 0)
    )
      return 'is not exposed soil: an object, plant or other drawing covers it';
    return null;
  }

  /** The subject named in subjectRef (else the drawing's own subject): an object the person
   * sees now. */
  function subjectOf(
    c: V7ActionContext,
    own: string | null,
    stored: Subject | null = null,
  ): Subject | string {
    const { world: w, actor: a, action } = c;
    const ref = text(action.args.subjectRef) || (stored?.ref ?? '');
    if (!ref) return 'Give subjectRef: an object you see now.';
    const o = v7Observe(w, a.id).objects.find((o) => o.id === ref);
    if (!o)
      return `You do not see ${ref} now, so it cannot be drawn from observation.`;
    if (o.id === own) return 'The drawing itself is not the subject.';
    return {
      ref: o.id,
      name: o.name,
      kind: o.kind,
      x: round(o.spatial.x),
      y: round(o.spatial.y),
      distance: round(Math.max(0, v7ShapeDistance(a.position, o.spatial))),
      observedAt: w.tick,
    };
  }

  /** The requested method; only finger-groove has its physical prerequisites represented. */
  function method(c: V7ActionContext): string {
    const { world: w, actor: a, action } = c;
    const m =
      action.args.method === undefined
        ? 'finger-groove'
        : text(action.args.method);
    const tool = text(action.args.implementRef),
      material = text(action.args.markingStackRef);
    if (m === 'finger-groove') {
      if (tool || material)
        throw nothing(
          'finger-groove uses only your finger: give no implementRef or markingStackRef.',
        );
      return m;
    }
    if (m === 'implement-groove') {
      if (!tool)
        throw nothing(
          'implement-groove needs implementRef: an implement you hold.',
        );
      const problem = ex19MaterialPiece(
        w,
        a,
        w.stacks.find((s) => s.id === tool),
      );
      if (problem) throw nothing(problem);
      throw nothing(
        'implement-groove is unavailable: soil has no represented material strength, so the wear of an implement dragged through it cannot be accounted. Use finger-groove.',
      );
    }
    if (m === 'material-mark') {
      if (!material)
        throw nothing(
          'material-mark needs markingStackRef: marking material you own.',
        );
      const s = w.stacks.find((s) => s.id === material);
      if (!s || s.owner !== a.id || s.reservedFor)
        throw nothing('markingStackRef must be your own unreserved item.');
      throw nothing(
        'material-mark is unavailable: this operation represents no per-stroke deposit, residue and waste accounting for a marking material. Use finger-groove.',
      );
    }
    throw nothing(`Give method: ${METHODS.join(', ')}.`);
  }

  /** What a groove shows on the ground; the work record keeps the same values. */
  const shown = (g: Groove): V7Data => ({ ...g });
  function view(w: V7World, j: Drawing): V7Data {
    const o = w.objects.find((o) => o.id === j.drawing);
    return {
      component: KIND,
      operation: id,
      drawing: j.drawing,
      actor: j.owner,
      method: j.method,
      surface: j.surface.ref,
      x: j.surface.x,
      y: j.surface.y,
      ground: j.surface.name,
      groundTone: j.surface.tone,
      extent: j.surface.extent,
      subject: j.subject?.ref ?? null,
      grooves: j.grooves.map(shown),
      strokesDone: strokesIn(j.grooves).length,
      strokesPlanned: j.plan.length,
      pigment: 'none',
      status: statusOf(j),
      durability: 'untested',
      createdAt: o?.createdAt ?? null,
      updatedAt: w.tick,
      badge: null,
    };
  }
  function statusOf(j: Drawing) {
    const done = strokesIn(j.grooves).length;
    return j.stage === 'unsuitable'
      ? 'unsuitable'
      : done === 0
        ? 'test groove only'
        : j.stage === 'completed'
          ? 'completed'
          : 'partial';
  }
  function summary(w: V7World, j: Drawing): V7Data {
    return {
      work: j.id,
      stage: j.stage,
      status: j.status,
      method: j.method,
      surface: j.surface,
      test: j.test,
      subject: j.subject,
      quote: j.quote,
      strokesDone: strokesIn(j.grooves).length,
      strokesPlanned: j.plan.length,
      paidEnergy: round(j.paidEnergy),
      tick: w.tick,
      view: view(w, j),
    };
  }
  function changed(o: V7Object, tick: number, change: string) {
    const list = Array.isArray(o.data.changes) ? o.data.changes : [];
    o.data.changes = [...list, { tick, change }];
    o.data.revision = list.length + 1;
  }
  /** Writes the work's grooves onto its ground drawing, creating it at the test groove. */
  function lay(c: V7ActionContext, j: Drawing, change: string) {
    const w = c.world;
    let o = w.objects.find((o) => o.id === j.drawing);
    if (!o) {
      o = {
        id: v7Id(w, 'drawing'),
        kind: KIND,
        name: 'Finger grooves in soil',
        spatial: {
          ...anchorOf(j),
          angle: 0,
          shape: { kind: 'circle', radius: TEST / 2 + WIDTH / 2 },
          solid: false,
          interaction: w.config.interaction,
          entrances: [],
        },
        visual: {
          component: KIND,
          color: j.surface.tone,
          accent: j.surface.tone,
          label: 'Ground drawing',
          state: j.stage,
        },
        data: {
          operation: id,
          owner: c.actor.id,
          workId: j.id,
          method: j.method,
          surface: {
            ref: j.surface.ref,
            ground: j.surface.name,
            tone: j.surface.tone,
            extent: j.surface.extent,
          },
          pigment: 'none',
          persistence: PERSISTENCE,
          durability: 'untested',
          changes: [],
          revision: 0,
        },
        createdBy: c.actor.id,
        createdAt: w.tick,
        revision,
      };
      w.objects.push(o);
      j.drawing = o.id;
      j.target = o.id;
      j.outputs = [o.id];
    }
    const points = j.grooves.flatMap((g) => g.points);
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    o.data.grooves = j.grooves.map(shown);
    o.data.subject = j.subject;
    o.data.strokes = strokesIn(j.grooves).length;
    o.data.status = statusOf(j);
    o.data.bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    o.data.displaced = round(j.grooves.reduce((n, g) => n + g.displaced, 0));
    o.spatial.shape = {
      kind: 'circle',
      radius: round(
        Math.max(...points.map((p) => Math.hypot(p.x, p.y))) + WIDTH / 2,
      ),
    };
    const shade = j.grooves.findLast((g) => g.visible);
    if (shade) o.visual.color = shade.color;
    o.visual.state = j.stage;
    changed(o, w.tick, change);
  }
  function note(w: V7World, j: Drawing, change: string) {
    const o = w.objects.find((o) => o.id === j.drawing);
    if (!o) return;
    o.visual.state = j.stage;
    o.data.status = statusOf(j);
    changed(o, w.tick, change);
  }

  function test(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    const existing = current(w, a);
    if (existing)
      throw nothing(
        `Your drawing work ${existing.id} is still open; draw or cancel it first.`,
      );
    if (action.args.strokes !== undefined)
      throw nothing('test takes no strokes; draw after a suitable test.');
    const m = method(c);
    if (action.args.x === undefined || action.args.y === undefined)
      throw nothing(
        'Give x and y: the centre of a soil patch within hand reach.',
      );
    const point = {
      x: v7Number(action.args.x, 'x'),
      y: v7Number(action.args.y, 'y'),
    };
    const extent =
      action.args.extent === undefined
        ? EXTENT
        : v7Number(action.args.extent, 'extent', MIN_EXTENT, EXTENT);
    const local: Pt[] = [
      { x: -TEST / 2, y: 0 },
      { x: TEST / 2, y: 0 },
    ];
    const seen = seenBy(w, a);
    for (const p of along(local.map((p) => at(point, p)))) {
      const why = blocked(w, a, p, seen, null);
      if (why) throw nothing(`The test groove ${why}.`);
    }
    const subject = text(action.args.subjectRef) ? subjectOf(c, null) : null;
    if (typeof subject === 'string') throw nothing(subject);
    const dark = ex19MaterialDark(w, a);
    if (dark) throw nothing(dark);
    if (a.vitals.energy + 1e-8 < TEST_ENERGY)
      throw nothing('The suitability test needs 0.5 energy.');
    const j = workCreate(c, 'draw', 1) as Drawing;
    if (!workPay(c, j, TEST_ENERGY))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    const soil = soilAt(w, point);
    const surface: Surface = {
      ref: `ground:${String(Math.floor(point.x))}:${String(Math.floor(point.y))}`,
      x: point.x,
      y: point.y,
      ground: soil.k.ground,
      name: soil.name,
      yielding: soil.retained,
      moisture: soil.k.moisture,
      waterlogging: soil.k.waterlogging,
      regime: soil.k.regime,
      tone: TONES[soil.k.ground] ?? '#000000',
      light: forestClimate(w, a.position).light,
      extent,
      observedAt: w.tick,
    };
    const groove = grooveOf('test', 0, local, surface, soil.retained, w.tick);
    const suitable = groove.visible;
    const reason = suitable
      ? null
      : (soil.reason ?? 'the groove is too faint to see on this ground');
    Object.assign(j, {
      stage: suitable ? 'tested' : 'unsuitable',
      method: m,
      surface,
      test: {
        retained: groove.retained,
        visible: groove.visible,
        depth: groove.depth,
        contrast: groove.contrast,
        reason,
        tick: w.tick,
      },
      subject,
      plan: [],
      quote: null,
      grooves: [groove],
      drawing: null,
      cover: '',
      pausedAt: null,
      endedAt: null,
    });
    j.x = point.x;
    j.y = point.y;
    // The disturbance stays on the ground even when no groove was kept.
    lay(c, j, suitable ? 'test groove made' : 'test groove failed');
    j.cover = coverOf(w, point, extent, j.drawing ?? '');
    j.status = suitable ? 'paused' : 'completed';
    j.reason = suitable
      ? 'Tested: draw on this patch, or cancel.'
      : 'Unsuitable patch: no drawing is possible here.';
    if (!suitable) j.endedAt = w.tick;
    openRemember(c, {
      key: `ground:${soil.k.ground}:finger-groove:${suitable ? 'kept' : 'not-kept'}:${soil.k.regime}`,
      subject: soil.name,
      property: 'whether a finger groove stays visible in this soil',
      value: {
        kept: suitable,
        depth: groove.depth,
        contrast: groove.contrast,
        reason,
        ground: soil.name,
        moisture: soil.k.moisture,
      },
      method:
        'one short finger groove pressed and drawn in place, then a direct look',
      condition: `${soil.name}, ${soil.k.regime}; durability untested`,
      verified: true,
    });
    c.emit(
      'ground-drawing-tested',
      suitable
        ? `The test groove stayed in the ${soil.name}: ${String(DEPTH)} deep, contrast ${String(groove.contrast)}. The patch is suitable for finger drawing; durability untested.`
        : `The test groove did not stay in the ${soil.name}.`,
      { ...summary(w, j), mode: 'test', energy: TEST_ENERGY },
      j.drawing ?? j.id,
    );
    if (!suitable)
      c.emit(
        'ground-drawing-failed',
        `Unsuitable: ${reason ?? ''}. The disturbed spot remains; no picture was made. Another patch is a new paid test.`,
        { ...summary(w, j), result: 'unsuitable surface' },
        j.drawing ?? j.id,
      );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(j.drawing ? [j.drawing] : [])],
    };
  }

  function strokesOf(value: unknown, extent: number): Planned[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > STROKES)
      throw nothing(`Give strokes: 1 to ${String(STROKES)} strokes.`);
    return value.map((raw: unknown): Planned => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw nothing('Each stroke needs points.');
      const r = raw as Record<string, unknown>;
      if (
        !Array.isArray(r.points) ||
        r.points.length < 2 ||
        r.points.length > POINTS
      )
        throw nothing(`Each stroke has 2 to ${String(POINTS)} points.`);
      const points = r.points.map((raw: unknown): Pt => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw nothing('Each point is an x, y offset from the patch centre.');
        const p = raw as Record<string, unknown>;
        const x = v7Number(p.x, 'point x'),
          y = v7Number(p.y, 'point y');
        if (Math.abs(x) > extent / 2 + 1e-9 || Math.abs(y) > extent / 2 + 1e-9)
          throw nothing(
            `Every point lies within the ${String(extent)} by ${String(extent)} patch: offsets at most ${String(extent / 2)}.`,
          );
        return { x, y };
      });
      const length = lengthOf(points);
      if (!(length > 0)) throw nothing('A stroke needs a positive length.');
      if (length > extent + 1e-9)
        throw nothing(
          `A short stroke is at most ${String(extent)} long; one is ${String(fine(length))}.`,
        );
      return { points, length: fine(length) };
    });
  }
  const shape = (list: Planned[]) => v7Signature(list.map((s) => s.points));

  /** Rechecks for the next strokes; null when they may be drawn. */
  function problemOf(
    c: V7ActionContext,
    j: Drawing,
    next: Planned[],
  ): string | null {
    const { world: w, actor: a } = c;
    const subject = subjectOf(c, j.drawing, j.subject);
    if (typeof subject === 'string') return subject;
    if (j.subject && subject.ref !== j.subject.ref)
      return 'This drawing traces another subject; cancel to start a new one.';
    const seen = seenBy(w, a),
      anchor = anchorOf(j);
    for (const s of next)
      for (const p of along(s.points.map((p) => at(anchor, p)))) {
        const why = blocked(w, a, p, seen, j.drawing);
        if (why) return `A stroke point ${why}.`;
        const soil = soilAt(w, p);
        if (soil.k.ground !== j.surface.ground || !soil.retained)
          return `A stroke point leaves the tested ${j.surface.name}, or that soil no longer keeps a groove.`;
      }
    if (coverOf(w, anchor, j.surface.extent, j.drawing ?? '') !== j.cover)
      return 'The patch changed since the test: another object or drawing now reaches it.';
    return (
      ex19MaterialDark(w, a) ??
      (a.vitals.energy + 1e-8 < ROUND_ENERGY
        ? 'A drawing round needs 0.5 energy.'
        : null)
    );
  }

  function pause(c: V7ActionContext, j: Drawing, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    note(c.world, j, 'drawing paused');
    c.emit(
      'ground-drawing-paused',
      `${reason} Drawing paused before any charge; grooves already made remain.`,
      summary(c.world, j),
      j.drawing ?? j.id,
    );
    sync(c.actor, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(j.drawing ? [j.drawing] : [])],
    };
  }

  function finish(c: V7ActionContext, j: Drawing): V7HandlerResult {
    const { world: w, actor: a } = c;
    j.status = 'completed';
    j.stage = 'completed';
    j.remainingWork = 0;
    j.reason = 'Every planned stroke was made.';
    j.endedAt = w.tick;
    note(w, j, 'drawing completed');
    const strokes = strokesIn(j.grooves);
    openRemember(c, {
      key: `${j.drawing ?? j.id}:drawn-from-observation`,
      subject: j.subject?.ref ?? j.surface.name,
      property: 'grooves drawn in soil while looking at a subject',
      value: {
        drawing: j.drawing,
        subject: j.subject?.ref ?? null,
        strokes: strokes.length,
        visible: strokes.filter((g) => g.visible).length,
        length: fine(strokes.reduce((n, g) => n + g.length, 0)),
        ground: j.surface.name,
      },
      method:
        'paid finger strokes traced while the subject was in view, then a direct look',
      condition: `${j.surface.name}; likeness not assessed; durability untested`,
      verified: true,
    });
    c.emit(
      'ground-drawing-completed',
      `${String(strokes.length)} finger stroke(s) were made in the ${j.surface.name} while looking at ${j.subject?.name ?? 'the subject'}. This records the strokes made, not how well they show it. Durability untested.`,
      summary(w, j),
      j.drawing ?? j.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(j.drawing ? [j.drawing] : [])],
    };
  }

  function draw(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can work.');
    const j = current(w, a);
    if (!j) throw nothing('You have no tested drawing work open; test first.');
    if (method(c) !== j.method)
      throw nothing('This drawing uses its tested method.');
    let fresh = false;
    if (j.stage === 'tested') {
      const subject = subjectOf(c, j.drawing);
      if (typeof subject === 'string') throw nothing(subject);
      const list = strokesOf(action.args.strokes, j.surface.extent);
      const rounds = Math.min(ROUNDS, list.length);
      j.plan = list;
      j.subject = subject;
      j.quote = {
        strokes: list.length,
        length: fine(list.reduce((n, s) => n + s.length, 0)),
        rounds,
        energy: round(ROUND_ENERGY * rounds),
      };
      j.stage = 'drawing';
      j.initialWork = 1 + rounds;
      j.remainingWork = rounds;
      fresh = true;
    } else if (j.stage !== 'drawing')
      throw nothing('Your drawing work is not ready to draw.');
    else if (
      action.args.strokes !== undefined &&
      shape(strokesOf(action.args.strokes, j.surface.extent)) !== shape(j.plan)
    )
      throw nothing(
        'A different stroke plan is a new attempt; cancel this drawing first.',
      );
    const done = strokesIn(j.grooves).length;
    const next = j.plan.slice(done, done + share(j.plan.length, done));
    if (!next.length) return finish(c, j);
    const problem = problemOf(c, j, next);
    if (problem) {
      if (fresh) throw nothing(problem);
      return pause(c, j, problem);
    }
    const resumed = j.pausedAt !== null;
    j.remainingWork = Math.max(1, j.remainingWork);
    if (!workPay(c, j, ROUND_ENERGY))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'ground-drawing-resumed',
        'Drawing resumed after rechecking the subject, reach, soil, patch, light and energy.',
        summary(w, j),
        j.drawing ?? j.id,
      );
    }
    const subject = subjectOf(c, j.drawing, j.subject);
    if (typeof subject !== 'string') j.subject = subject;
    next.forEach((s, i) => {
      const g = grooveOf(
        'stroke',
        done + i + 1,
        s.points,
        j.surface,
        true,
        w.tick,
      );
      j.grooves = [...j.grooves, g];
      lay(c, j, `stroke ${String(g.index)} made`);
      c.emit(
        'ground-drawing-stroke',
        `Stroke ${String(g.index)} of ${String(j.plan.length)} traced with a finger: ${String(g.length)} long, contrast ${String(g.contrast)}.`,
        { ...summary(w, j), stroke: g, energy: i === 0 ? ROUND_ENERGY : 0 },
        j.drawing ?? j.id,
      );
    });
    if (strokesIn(j.grooves).length >= j.plan.length) return finish(c, j);
    j.reason = 'The next round traces the remaining strokes.';
    sync(a, j);
    return {
      complete: false,
      remaining: 1,
      writes: [j.id, ...(j.drawing ? [j.drawing] : [])],
    };
  }

  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j) throw nothing('You have no open drawing work to cancel.');
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Drawing cancelled; grooves already made and the disturbed soil remain. Spent time and energy are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.endedAt = w.tick;
    note(w, j, 'drawing cancelled');
    c.emit(
      'ground-drawing-cancelled',
      `Drawing cancelled with ${String(strokesIn(j.grooves).length)} stroke(s) made; they remain in the soil.`,
      summary(w, j),
      j.drawing ?? j.id,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, ...(j.drawing ? [j.drawing] : [])],
    };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'test') return test(c);
    if (mode === 'draw') return draw(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing('Give mode: test, draw or cancel.');
  }

  /** An unworked drawing round stops at no charge; nothing draws on its own. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.reason = 'Not drawn this round; grooves already made remain.';
        j.pausedAt = w.tick;
        note(w, j, 'drawing interrupted');
        forestEvent(
          w,
          'ground-drawing-paused',
          'Drawing stopped because no stroke was made this round; grooves already made remain and nothing was charged.',
          anchorOf(j),
          a.id,
          summary(w, j),
          j.drawing ?? j.id,
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
      'Drawing from direct observation in soil: a one-groove suitability test on a reachable ground patch, then up to six short finger grooves traced in two paid rounds while the subject stays in view. Grooves deposit nothing; they show by the shade of their walls on the ground tone. Durability is untested.',
    reuse: {
      experiment:
        'ex20 apply-marking-material@1 (hand reach, finger width, stroke stepping, ground palette, colour distance and visibility threshold, ground blocking rules, work record lifecycle); foundation-expression mark (a text sign without geometry or physical effect) checked and not equivalent; foundation-open probe (objects and owned material only, no in-place ground trial) checked and not reused',
      source:
        'long-ex20-surface-marking.ts (SURFACE_MARKING_SHARED); long-ex19-material-contact.ts (light, own piece); open-physical.ts (openConditions); forest-climate.ts; collective-work.ts (workCreate, workPay, workStop, collectiveJobs); open-foundation.ts (openRemember); continuous-geometry.ts; continuous-observation.ts',
      description:
        'Implementation reuse only; ex20 packages are unchanged and no ability or mastery is inherited. New: the soil suitability rule, the groove geometry and shade contrast, the subject check, the two-round stroke schedule and the groove-drawing ground object.',
    },
    abilities: [
      {
        id,
        name: 'Draw from observation',
        function:
          'Draw a simple picture of something you see now by tracing short grooves with a finger in nearby soil, after a one-groove test of whether that patch keeps them.',
        equivalence: 'surface:observational-drawing:finger-groove:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['test', 'draw', 'cancel'] },
            subjectRef: { type: 'string' },
            surfaceRef: { type: 'string', enum: ['ground'] },
            method: { type: 'string', enum: METHODS },
            implementRef: { type: 'string' },
            markingStackRef: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            extent: { type: 'number', minimum: MIN_EXTENT, maximum: EXTENT },
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
              }),
            },
          }),
          required: ['mode'],
        },
        references: {
          subjectRef: 'optional-exact-visible',
          implementRef: 'optional-exact-visible',
          markingStackRef: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 2,
        costs:
          'Study: 2 rounds. test: surfaceRef ground (the only drawable surface) at x, y, a point at most 0.5 from you that you see now, not water, a body or any object; extent, the square patch side, 0.05-0.3 (default 0.3); method finger-groove (implement-groove and material-mark are refused as unavailable, naming what is missing); optional subjectRef. One round, 0.5 energy: one short test groove, which stays even if the soil fails. draw: subjectRef, an object you see now; strokes, 1-6, each 2-8 points as x, y offsets inside the patch, each at most extent long; two rounds, 0.5 energy each (one round for a single stroke), half the strokes per round, continuing; draw again resumes a pause. cancel: one round, no energy. All need light. Checks run before any charge.',
        effects:
          'Forest floor and meadow ground (fine, yielding soil) keep a finger groove 0.02 wide and 0.01 deep unless waterlogged; rocky ground, a wet bank or waterlogged soil does not, and the test says why. No pigment or item is used: soil is pushed to the groove edges. A groove shows by its shaded floor: the ground tone darkened by 1 - 1/sqrt(1 + (2 depth / width)^2); contrast is the 0-1 colour distance, visible from 0.05. The grooves form one ground drawing nearby people see, with geometry, depth, colour, contrast, subject, strokes and status. Only performed strokes are recorded; completion means they were made, not that they look like the subject. Losing sight of the subject, reach, light or an unchanged patch pauses at no charge, as does an unworked round. No rain, trampling or erosion rule acts on ground marks here, so durability is untested. Nothing is refunded; no reward.',
        handler,
        revision,
        authored: false,
        // The completion event carries no qualified flag: drawing earns no practice milestone.
        practiceEvidence: 'ground-drawing-completed',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'test and cancel take one round; draw traces half the strokes per paid round and continues. The test groove, completed strokes, plan and subject persist across interruption; draw resumes after rechecks.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [KIND],
    events: [
      'ground-drawing-tested',
      'ground-drawing-failed',
      'ground-drawing-stroke',
      'ground-drawing-paused',
      'ground-drawing-resumed',
      'ground-drawing-completed',
      'ground-drawing-cancelled',
      'ground-drawing-ended',
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        j.x = a.position.x;
        j.y = a.position.y;
        workStop(
          w,
          a,
          j,
          'Performer died; grooves already made remain. Nothing is refunded.',
          true,
        );
        j.stage = 'ended';
        j.endedAt = w.tick;
        note(w, j, 'work ended by death');
        forestEvent(
          w,
          'ground-drawing-ended',
          'Drawing ended by death; grooves already made remain.',
          a.position,
          a.id,
          summary(w, j),
          j.drawing ?? j.id,
        );
        sync(a, j);
      }
    },
  };
}

/** ex22: Sol's drawing from observation with finger grooves in soil. */
export const LONG_EX22_OBSERVATIONAL_DRAWING = observationalDrawingPackage(
  'draw-from-observation',
  'long-ex22',
);
