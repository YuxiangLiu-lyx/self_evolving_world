import type {
  V7Ability,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Observation,
  V7Package,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Clone, v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Interior,
  v7ShapeDistance,
  v7Visible,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestPhysiology } from './forest-environment.js';
import { shelterTemperature } from './forest-thermal.js';

/** ex25: Moss's heat-exposure assessment and occupancy trial. The world's thermal model has no
 * shade: the air temperature at a point comes from season, weather, daylight, the ground kind,
 * the climate offset and the seasonal pressure (forestClimate), and only an enclosure interior
 * (a cave, or an installed shelter) changes it there; trees, plants and rocks change no air,
 * light or wind value. Body temperature moves toward that air once per round (forestPhysiology,
 * applied by v7Physiology). This operation reports those represented values, never shade, and
 * measures the person's own body temperature before and after rounds spent standing still. It
 * adds no cooling, shelter, health or reward; any protection comes from the existing update. */

const ID = 'heat-exposure-trial';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open trial as shown with the person's active work, its full record, the latest closed
 * trial records, and the latest inspection and comparison. */
const OPEN = `${ID}:work:open`;
const CURRENT = `${ID}:current`;
const RECORDS = `${ID}:records`;
const LOOKED = `${ID}:inspection`;
const COMPARED = `${ID}:comparison`;
const KEEP = 4;
const MODES = [
  'inspect',
  'sample',
  'compare',
  'inspect-progress',
  'resume',
  'cancel',
];
/** The arguments each mode takes besides mode; any other given argument is refused. */
const ARGS: Record<string, string[]> = {
  inspect: ['targetId', 'x', 'y'],
  sample: ['sampleRounds', 'baselineId'],
  compare: ['baselineId'],
  'inspect-progress': [],
  resume: [],
  cancel: [],
};
/** World Agent specification costs. */
const COST = {
  study: 0.2,
  inspect: 0.2,
  sample: 0.2,
  compare: 0.2,
  check: 0.2,
};
const ROUNDS = { min: 1, max: 3 };
/** The specification's conservative activity guards: no sample starts or continues outside them.
 * 7 and 34 are the body temperatures beyond which forest physiology deals thermal damage. */
const GUARD = { health: 20, cold: 7, hot: 34 };
/** A resumed segment must be at the trial position, within this distance. */
const SAME_PLACE = 0.1;
/** Differences of body temperature per round below this are reported as none. */
const TOLERANCE = 0.001;
/** At most this many candidate positions in one inspection. */
const CANDIDATES = 6;
const GROUND: Record<string, string> = {
  '.': 'open ordinary soil',
  f: 'forest floor',
  ':': 'rocky ground',
  ',': 'wet bank',
  '~': 'water',
  '=': 'shallow water',
};
/** What the existing thermal model represents, and what it does not. */
const REPRESENTED = [
  'air temperature: season, weather, daylight, ground kind, climate offset and seasonal pressure',
  'outdoors only: rain and wind lower the air value',
  'inside an enclosure (a cave or an installed shelter): air pulled toward 12 and light reduced; its insulation slows body change',
  'body temperature: moves part of the way toward the air each round, slower with insulation; heat damage above 34',
  'installed shelter, fire or worn-insulation rules, only where they are present',
];
const UNKNOWN = [
  'sun or shade on the body: not represented',
  'cover from trees, plants or rocks: not represented; they change no air, light or wind value',
  'humidity and sweating: not represented in body heat',
  'places out of view: not inspected',
];
/** The established code every reading and prediction comes from. */
const PROVENANCE = {
  air: 'forestClimate (forest-climate.ts, foundation-forest@1)',
  body: 'forestPhysiology (forest-environment.ts, foundation-forest@1), applied once per round by v7Physiology',
};
const EVENTS = {
  inspected: 'heat-exposure-inspected',
  sampled: 'heat-exposure-sampled',
  measured: 'heat-exposure-sample-completed',
  completed: 'heat-exposure-trial-completed',
  paused: 'heat-exposure-paused',
  resumed: 'heat-exposure-resumed',
  cancelled: 'heat-exposure-cancelled',
  stopped: 'heat-exposure-stopped',
  ended: 'heat-exposure-ended',
  checked: 'heat-exposure-checked',
  compared: 'heat-exposure-compared',
} as const;

type Say = (type: string, description: string, data: V7Data) => void;
/** This round's represented values at a point. */
interface Reading extends V7Data {
  x: number;
  y: number;
  ground: string;
  air: number;
  indoor: boolean;
  light: number;
  rain: number | null;
  wind: number | null;
  daylight: number;
  season: string;
  trend: string;
  insulation: number;
  enclosure: string | null;
}
/** The computed open-ground value of the same round: open ordinary soil, outdoors. */
interface Reference extends V7Data {
  x: number;
  y: number;
  air: number;
  bodyAfter: number;
}
/** One candidate position: model-derived values with the person's body as it is now. */
interface Candidate extends V7Data {
  source: string;
  target: string | null;
  x: number;
  y: number;
  distance: number;
  standing: boolean;
  modelDerived: {
    ground: string;
    air: number;
    airDifference: number;
    indoor: boolean;
    light: number;
    insulation: number;
    bodyAfter: number;
    change: number;
  };
}
interface Sample extends V7Data {
  n: number;
  round: number;
  segment: number;
  /** Measured at the start of the round: the person's body and this round's readings there. */
  body: number;
  health: number;
  reading: Reading;
  /** Model-derived: the world's body-heat update on a discarded copy, here and on open soil. */
  predicted: number;
  open: Reference | null;
  /** Measured at the start of the next round; null until then, and for good after death. */
  after: number | null;
  change: number | null;
  energy: number;
}
interface Segment extends V7Data {
  n: number;
  startedAt: number;
}
interface Trial extends V7Data {
  id: string;
  actor: string;
  status: string;
  requested: number;
  site: { x: number; y: number };
  baseline: string | null;
  samples: Sample[];
  segments: Segment[];
  paidEnergy: number;
  paidRounds: number;
  lastSampled: number;
  reason: string | null;
  startedAt: number;
  endedAt: number | null;
  comparison: Compared | null;
}
/** A comparison result: measured records, model-derived references, deterministic labels. */
interface Compared extends V7Data {
  tick: number;
  subject: string;
  baseline: string | null;
  evidence: string;
  body: string | null;
  /** Lower heat exposure than open ordinary soil, measured against the same-round reference. */
  supported: boolean;
  conclusion: string;
}
interface Summary {
  id: string;
  x: number;
  y: number;
  ground: string;
  indoor: boolean;
  insulation: number;
  rounds: number[];
  body: number;
  change: number;
  air: number;
  daylight: number;
  rain: number;
  wind: number;
  /** Mean model-derived site minus open-soil body temperature after the same rounds. */
  site: number | null;
  /** Mean measured body temperature minus the open-soil value computed for the same rounds. */
  contrast: number | null;
  airOffset: number | null;
  agrees: boolean;
}

const round = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const signed = (x: number) => `${x > 0 ? '+' : ''}${shown(x)}`;
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const current = (a: V7Actor) =>
  record(a.extensionState[CURRENT]) as Trial | null;
const records = (a: V7Actor): Trial[] => {
  const list = a.extensionState[RECORDS];
  return Array.isArray(list) ? (list as Trial[]) : [];
};
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const cell = (w: V7World, p: V7Point) =>
  w.terrain[Math.floor(p.y)]?.[Math.floor(p.x)] ?? '.';
const where = (p: V7Point) => `(${shown(p.x)}, ${shown(p.y)})`;
const place = (r: Reading) =>
  `${r.ground}, ${r.indoor ? 'inside an enclosure' : 'outdoors'}`;
const measured = (j: Trial) => j.samples.filter((s) => s.after !== null);
const mean = (values: number[]) =>
  values.length
    ? round(values.reduce((t, v) => t + v, 0) / values.length)
    : null;

/** A point a person can stand on: inside the world, not deep water, clear of solid footprints. */
function standing(w: V7World, a: V7Actor, p: V7Point): boolean {
  return (
    v7Inside(w, p, a.radius) &&
    cell(w, p) !== '~' &&
    !w.objects.some(
      (o) => o.spatial.solid && v7ShapeDistance(p, o.spatial) < a.radius,
    )
  );
}
const enclosed = (w: V7World, p: V7Point) =>
  w.objects.some((o) => v7Interior(p, o.spatial));
/** This round's climate where the body-heat update reads it, and the insulation it applies there
 * (the person's own and that of every enclosing object). */
function reading(w: V7World, a: V7Actor, p: V7Point): Reading {
  const c = forestClimate(w, p);
  const inside = w.objects.filter((o) => v7Interior(p, o.spatial));
  const kind = cell(w, p);
  return {
    x: round(p.x),
    y: round(p.y),
    ground: GROUND[kind] ?? kind,
    air: c.temperature,
    indoor: c.indoor,
    light: c.light,
    rain: c.rain ?? null,
    wind: c.wind ?? null,
    daylight: c.daylight,
    season: c.season,
    trend: c.trend,
    insulation: Math.max(
      0,
      Number(a.extensionState.insulation ?? 0),
      ...inside.map((o) => Number(o.data.insulation ?? 0)),
    ),
    enclosure: inside[0]?.id ?? null,
  };
}
/** The world's own body-heat update for this round, forestPhysiology (the function v7Physiology
 * applies once per round), run on a discarded copy with the person standing at p. */
function bodyAfter(w: V7World, a: V7Actor, p: V7Point): number {
  const copy = v7Clone(w);
  const body = copy.actors.find((x) => x.id === a.id);
  if (!body) throw new Error('Missing person.');
  body.position = { x: p.x, y: p.y };
  forestPhysiology(copy, body);
  return body.vitals.temperature;
}
/** The nearest centre of an open ordinary soil cell the person sees or remembers, outside every
 * enclosure, where a person can stand: the place of the computed open-ground value. */
function openSoil(w: V7World, a: V7Actor, seen: V7Observation): V7Point | null {
  const cells = [
    ...seen.terrain.map((t) => ({ x: t.x, y: t.y })),
    ...a.memory.cells.map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: x ?? -1, y: y ?? -1 };
    }),
  ];
  let best: V7Point | null = null,
    distance = Infinity;
  for (const c of cells) {
    const p = { x: c.x + 0.5, y: c.y + 0.5 };
    const d = v7Distance(a.position, p);
    if (
      d >= distance - 1e-9 ||
      cell(w, p) !== '.' ||
      enclosed(w, p) ||
      !standing(w, a, p)
    )
      continue;
    best = p;
    distance = d;
  }
  return best;
}
function reference(w: V7World, a: V7Actor, p: V7Point | null) {
  if (!p) return null;
  const r: Reference = {
    x: p.x,
    y: p.y,
    air: forestClimate(w, p).temperature,
    bodyAfter: bodyAfter(w, a, p),
  };
  return r;
}
/** Model-derived values of one candidate position, with the person's body as it is now. */
function candidate(
  w: V7World,
  a: V7Actor,
  p: V7Point,
  here: Reading,
  about: V7Data & { source: string; target: string | null },
): Candidate {
  const r = reading(w, a, p);
  const after = bodyAfter(w, a, p);
  return {
    ...about,
    x: r.x,
    y: r.y,
    distance: round(v7Distance(a.position, p)),
    standing: standing(w, a, p),
    modelDerived: {
      ground: r.ground,
      air: r.air,
      airDifference: round(r.air - here.air),
      indoor: r.indoor,
      light: r.light,
      insulation: r.insulation,
      bodyAfter: after,
      change: round(after - a.vitals.temperature),
    },
  };
}
/** The nearest visible standing cell of each other ground kind, and every visible enclosure
 * interior: the represented differences reachable from here. */
function survey(
  w: V7World,
  a: V7Actor,
  seen: V7Observation,
  here: Reading,
): Candidate[] {
  const own = cell(w, a.position);
  const best = new Map<string, { p: V7Point; d: number }>();
  for (const t of seen.terrain) {
    if (t.kind === '~' || t.kind === own) continue;
    const p = { x: t.x + 0.5, y: t.y + 0.5 };
    const d = v7Distance(a.position, p);
    const old = best.get(t.kind);
    if (old && old.d <= d + 1e-9) continue;
    if (enclosed(w, p) || !standing(w, a, p)) continue;
    best.set(t.kind, { p, d });
  }
  const out = [...best.values()]
    .sort((x, y) => x.d - y.d)
    .map((b) =>
      candidate(w, a, b.p, here, {
        source: 'nearest visible spot of this ground kind',
        target: null,
      }),
    );
  for (const o of seen.objects)
    if (
      o.spatial.enclosure &&
      o.spatial.shape.kind === 'rectangle' &&
      !v7Interior(a.position, o.spatial)
    )
      out.push(
        candidate(w, a, o.spatial, here, {
          source: 'visible enclosure interior, its centre',
          target: o.id,
          kind: o.kind,
        }),
      );
  return out.slice(0, CANDIDATES);
}
/** A named visible object or item: its visible geometry and represented protection. */
function aimed(
  w: V7World,
  a: V7Actor,
  seen: V7Observation,
  id: string,
  here: Reading,
): Candidate {
  const o = seen.objects.find((x) => x.id === id);
  if (o) {
    const e = o.spatial.enclosure;
    const interior = !!e && o.spatial.shape.kind === 'rectangle';
    return candidate(w, a, o.spatial, here, {
      source: interior
        ? 'the named enclosure interior, its centre'
        : 'the ground under the named object',
      target: o.id,
      kind: o.kind,
      geometry: {
        shape: o.spatial.shape,
        solid: o.spatial.solid,
        enclosure: e ? { wall: e.wall, doorway: e.doorway } : null,
        entrances: o.spatial.entrances.map((p) => ({
          x: round(
            o.spatial.x +
              p.x * Math.cos(o.spatial.angle) -
              p.y * Math.sin(o.spatial.angle),
          ),
          y: round(
            o.spatial.y +
              p.x * Math.sin(o.spatial.angle) +
              p.y * Math.cos(o.spatial.angle),
          ),
        })),
      },
      protection: interior
        ? 'represented: an enclosure interior; the climate rule treats it as indoors'
        : 'none represented: without an enclosure this object enters no climate or body-heat rule, so it gives no shade',
    });
  }
  const s = seen.stacks.find((x) => x.id === id);
  if (!s) throw nothing(`${id} is not a visible object or item.`);
  const owner = w.actors.find((x) => x.id === s.owner);
  return candidate(w, a, owner?.position ?? s.position, here, {
    source: 'where the named item is',
    target: s.id,
    kind: 'item',
    protection:
      'none represented: items enter no climate or body-heat rule, so they give no shade',
  });
}

function blockers(a: V7Actor): { stop: string[]; pause: string[] } {
  const v = a.vitals;
  return {
    stop: [
      ...(v.health < GUARD.health
        ? [`health ${shown(v.health)} is below ${String(GUARD.health)}`]
        : []),
      ...(v.temperature < GUARD.cold || v.temperature > GUARD.hot
        ? [
            `body temperature ${shown(v.temperature)} is outside ${String(GUARD.cold)}-${String(GUARD.hot)}`,
          ]
        : []),
    ],
    pause:
      v.energy < COST.sample - 1e-9
        ? [
            `not enough energy: ${shown(v.energy)} of the ${String(COST.sample)} a sampled round needs`,
          ]
        : [],
  };
}
const brief = (s: Sample): V7Data => ({
  n: s.n,
  round: s.round,
  segment: s.segment,
  body: s.body,
  after: s.after,
  change: s.change,
  air: s.reading.air,
  ground: s.reading.ground,
  indoor: s.reading.indoor,
  insulation: s.reading.insulation,
  predicted: s.predicted,
  open: s.open,
});
/** The open trial as the person sees it with their active work. */
function openView(j: Trial): V7Data {
  const last = j.samples.at(-1);
  return {
    work: j.id,
    operation: ID,
    status: j.status,
    site: j.site,
    requested: j.requested,
    taken: j.samples.length,
    measured: measured(j).length,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    reason: j.reason,
    last: last ? brief(last) : null,
  };
}
/** Reusable view metadata: what is happening, its provenance and evidence status, no badge. */
function view(
  w: V7World,
  a: V7Actor,
  mode: string,
  status: string,
  j: Trial | null,
  extra: V7Data,
): V7Data {
  return {
    component: null,
    operation: ID,
    work: j?.id ?? null,
    actor: a.id,
    mode,
    tick: w.tick,
    location: { x: a.position.x, y: a.position.y },
    site: j?.site ?? null,
    status,
    samples: j
      ? {
          requested: j.requested,
          taken: j.samples.length,
          measured: measured(j).length,
        }
      : null,
    targets: [],
    provenance: 'measured',
    evidence: 'measured',
    overlay: null,
    // Attention only accompanies performed work, never a pause, stop or ending.
    attention: false,
    badge: null,
    ...extra,
  };
}
function save(a: V7Actor, j: Trial) {
  a.extensionState[CURRENT] = j;
  a.extensionState[OPEN] = openView(j);
}
function close(w: V7World, a: V7Actor, j: Trial, status: string, why: string) {
  j.status = status;
  j.reason = why;
  j.endedAt = w.tick;
  delete a.extensionState['heat-exposure-trial:current'];
  delete a.extensionState['heat-exposure-trial:work:open'];
  a.extensionState[RECORDS] = [...records(a), j].slice(-KEEP);
}
function summary(
  w: V7World,
  a: V7Actor,
  j: Trial,
  mode: string,
  extra: V7Data = {},
): V7Data {
  return {
    operation: ID,
    work: j.id,
    by: j.actor,
    status: j.status,
    site: j.site,
    requested: j.requested,
    taken: j.samples.length,
    measured: measured(j).length,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    segments: j.segments,
    reason: j.reason,
    view: view(w, a, mode, j.status, j, {
      evidence: measured(j).length ? 'measured' : 'unknown',
      ...extra,
    }),
  };
}

function summarize(j: Trial): Summary | null {
  const done = measured(j);
  const first = done[0];
  if (!first) return null;
  const pick = (f: (s: Sample) => number | null) =>
    done.flatMap((s) => {
      const v = f(s);
      return v === null ? [] : [v];
    });
  return {
    id: j.id,
    x: j.site.x,
    y: j.site.y,
    ground: first.reading.ground,
    indoor: first.reading.indoor,
    insulation: first.reading.insulation,
    rounds: done.map((s) => s.round),
    body: first.body,
    change: mean(pick((s) => s.change)) ?? 0,
    air: mean(pick((s) => s.reading.air)) ?? 0,
    daylight: mean(pick((s) => s.reading.daylight)) ?? 0,
    rain: mean(pick((s) => s.reading.rain)) ?? 0,
    wind: mean(pick((s) => s.reading.wind)) ?? 0,
    site: mean(pick((s) => (s.open ? s.predicted - s.open.bodyAfter : null))),
    contrast: mean(
      pick((s) =>
        s.open && s.after !== null ? s.after - s.open.bodyAfter : null,
      ),
    ),
    airOffset: mean(pick((s) => (s.open ? s.reading.air - s.open.air : null))),
    agrees: done.every((s) => s.after === s.predicted),
  };
}
function heatInput(difference: number | null, versus: string): string {
  if (difference === null) return `unknown: no ${versus} value`;
  return difference < -TOLERANCE
    ? `lower represented heat input than ${versus}`
    : difference > TOLERANCE
      ? `higher represented heat input than ${versus}`
      : `no represented difference from ${versus}`;
}
function direction(s: Summary): string {
  const label =
    s.change < -TOLERANCE
      ? 'net body cooling (measured)'
      : s.change > TOLERANCE
        ? 'net body warming (measured)'
        : 'no measurable body change';
  return s.change > TOLERANCE && s.contrast !== null && s.contrast < -TOLERANCE
    ? `${label}; slower warming than open ordinary soil, not cooling`
    : label;
}
function contexts(x: Summary, y: Summary): string[] {
  const out = [`rounds ${x.rounds.join(', ')} against ${y.rounds.join(', ')}`];
  const differ = (name: string, p: number, q: number, gap = 0.01) => {
    if (Math.abs(p - q) > gap)
      out.push(`${name} ${shown(p)} against ${shown(q)}`);
  };
  if (x.indoor !== y.indoor)
    out.push(
      x.indoor
        ? 'inside an enclosure against outdoors'
        : 'outdoors against inside an enclosure',
    );
  if (x.ground !== y.ground) out.push(`${x.ground} against ${y.ground}`);
  differ('insulation', x.insulation, y.insulation);
  differ('daylight', x.daylight, y.daylight);
  differ('rain', x.rain, y.rain);
  differ('wind', x.wind, y.wind);
  differ('starting body temperature', x.body, y.body);
  return out;
}
/** Deterministic labels: measured readings, model-derived references and what stays unknown. */
function comparison(
  w: V7World,
  subject: Trial,
  baseline: Trial | null,
): Compared {
  const x = summarize(subject);
  const out = {
    tick: w.tick,
    subject: subject.id,
    baseline: baseline?.id ?? null,
  };
  if (!x)
    return {
      ...out,
      evidence: 'insufficient',
      body: null,
      supported: false,
      conclusion: `${subject.id} has no measured sample: insufficient evidence; no option is established.`,
    };
  const lower =
    x.site !== null &&
    x.contrast !== null &&
    x.site < -TOLERANCE &&
    x.contrast < -TOLERANCE;
  const open: V7Data =
    x.site === null || x.contrast === null
      ? {
          evidence: 'unknown',
          reason:
            'no open ordinary soil was in view or remembered for a reference',
        }
      : {
          reference:
            'open ordinary soil in the same rounds from the same body temperature (model-derived)',
          airDifference: x.airOffset,
          modelDifference: x.site,
          measuredDifference: x.contrast,
          represented: heatInput(x.site, 'open ordinary soil'),
          exposure: lower
            ? `lower heat exposure than open ordinary soil: the measured body temperature ended ${shown(-x.contrast)} below the model-derived open-soil value of the same round(s)`
            : 'no lower heat exposure than open ordinary soil established',
        };
  let versus: V7Data | null = null;
  if (baseline) {
    const y = summarize(baseline);
    if (!y)
      versus = {
        evidence: 'insufficient',
        reason: `${baseline.id} has no measured sample`,
      };
    else {
      const same = v7Distance(x, y) <= SAME_PLACE;
      const gap =
        x.site === null || y.site === null ? null : round(x.site - y.site);
      const supported =
        !same &&
        gap !== null &&
        gap < -TOLERANCE &&
        x.contrast !== null &&
        y.contrast !== null &&
        x.contrast < y.contrast - TOLERANCE;
      versus = {
        evidence: 'measured',
        distance: round(v7Distance(x, y)),
        context: contexts(x, y),
        represented: same
          ? 'same position: no represented site difference; differences come from time, weather and body temperature'
          : heatInput(gap, 'the baseline position'),
        trend: `observed trend only, not controlled: measured change per round ${signed(round(x.change - y.change))} against the baseline`,
        exposure: supported
          ? 'lower heat exposure than the baseline position, each against its own same-round open-soil reference'
          : 'no lower heat exposure than the baseline position established',
      };
    }
  }
  const range =
    x.rounds.length > 1
      ? `rounds ${String(x.rounds[0])}-${String(x.rounds.at(-1))}`
      : `round ${String(x.rounds[0])}`;
  return {
    ...out,
    evidence: 'measured',
    samples: x.rounds.length,
    meanChange: x.change,
    meanAir: x.air,
    predictionMatched: x.agrees,
    body: direction(x),
    supported: lower,
    openGround: open,
    versusBaseline: versus,
    conclusion: lower
      ? `Lower heat exposure than open ordinary soil was measured at ${where(x)} (${x.ground}, ${x.indoor ? 'inside an enclosure' : 'outdoors'}) in ${range} with daylight ${shown(x.daylight)}, rain ${shown(x.rain)} and wind ${shown(x.wind)}; it holds only while those represented conditions hold, so reassess after weather, time of day or geometry change. Travel there with navigate.`
      : `No lower heat exposure than open ordinary soil has been established at ${where(x)}.`,
  };
}

/** Readings due from the round just ended, at no cost: the body temperature now is the one that
 * round's update left. A trial whose requested samples are all measured completes here. */
function settle(w: V7World, a: V7Actor, say: Say): void {
  const j = current(a);
  if (!j) return;
  let changed = false;
  for (const s of j.samples) {
    if (s.after !== null || s.round >= w.tick) continue;
    s.after = a.vitals.temperature;
    s.change = round(s.after - s.body);
    changed = true;
    const ref = s.open
      ? ` On open ordinary soil the same round gives ${shown(s.open.bodyAfter)} (model-derived).`
      : '';
    say(
      EVENTS.measured,
      `Sample ${String(s.n)} of ${String(j.requested)} measured: body ${shown(s.body)} to ${shown(s.after)} (${signed(s.change)}) over round ${String(s.round)} at ${where(s.reading)}, air ${shown(s.reading.air)} (${place(s.reading)}). The world's body-heat update predicted ${shown(s.predicted)}${s.after === s.predicted ? ', as measured' : ''}.${ref} A temperature change alone is not evidence of shade.`,
      {
        operation: ID,
        work: j.id,
        by: a.id,
        sample: brief(s),
        provenance: PROVENANCE,
        view: view(w, a, 'sample', 'measured', j, {
          targets: s.reading.enclosure ? [s.reading.enclosure] : [],
          provenance: 'measured',
          evidence: 'measured',
          attention: true,
        }),
      },
    );
  }
  if (!changed) return;
  if (j.samples.length < j.requested || measured(j).length < j.requested) {
    if (current(a)) save(a, j);
    return;
  }
  const base = j.baseline
    ? (records(a).find((r) => r.id === j.baseline) ?? null)
    : (records(a).at(-1) ?? null);
  j.comparison = comparison(w, j, base);
  const enclosure = j.samples[0]?.reading.enclosure ?? null;
  close(w, a, j, 'completed', 'every requested sample was measured');
  say(
    EVENTS.completed,
    `Heat exposure trial ${j.id} completed: ${String(j.requested)} sample(s) at ${where(j.site)} for ${shown(j.paidEnergy)} energy. Body: ${j.comparison.body ?? 'insufficient evidence'}. ${j.comparison.conclusion}`,
    {
      ...summary(w, a, j, 'sample', {
        // A protection overlay only for a represented enclosure with a supported result.
        overlay:
          j.comparison.supported && enclosure
            ? {
                kind: 'enclosure interior',
                target: enclosure,
                label: 'measured against a model-derived reference',
              }
            : null,
        targets: enclosure ? [enclosure] : [],
      }),
      comparison: j.comparison,
    },
  );
}

function take(c: V7ActionContext, j: Trial): V7HandlerResult {
  const { world: w, actor: a } = c;
  const seen = v7Observe(w, a.id);
  const body = a.vitals.temperature;
  const r = reading(w, a, a.position);
  const predicted = bodyAfter(w, a, a.position);
  const open = reference(w, a, openSoil(w, a, seen));
  v7Spend(a, COST.sample);
  const s: Sample = {
    n: j.samples.length + 1,
    round: w.tick,
    segment: j.segments.length,
    body,
    health: a.vitals.health,
    reading: r,
    predicted,
    open,
    after: null,
    change: null,
    energy: COST.sample,
  };
  j.samples = [...j.samples, s];
  j.paidEnergy = round(j.paidEnergy + COST.sample);
  j.paidRounds += 1;
  j.lastSampled = w.tick;
  j.status = 'active';
  j.reason = null;
  save(a, j);
  c.emit(
    EVENTS.sampled,
    `Sample ${String(s.n)} of ${String(j.requested)} at ${where(r)} (${place(r)}) for ${String(COST.sample)} energy: body ${shown(body)} at the start of round ${String(w.tick)}, air ${shown(r.air)}. The after reading is taken at the start of the next round; the world's body-heat update predicts ${shown(predicted)} (model-derived).`,
    {
      operation: ID,
      work: j.id,
      by: a.id,
      sample: brief(s),
      view: view(w, a, 'sample', 'sampling', j, {
        targets: r.enclosure ? [r.enclosure] : [],
        provenance: 'measured start; model-derived prediction',
        evidence: 'unknown until the after reading',
        attention: true,
      }),
    },
    j.id,
  );
  const more = j.samples.length < j.requested;
  return {
    complete: !more,
    remaining: more ? j.requested - j.samples.length : 0,
    writes: [j.id],
  };
}
function pause(w: V7World, a: V7Actor, j: Trial, why: string[], say: Say) {
  j.status = 'paused';
  j.reason = why.join('; ');
  save(a, j);
  say(
    EVENTS.paused,
    `Heat exposure trial ${j.id} paused without charge after ${String(j.samples.length)} of ${String(j.requested)} sample(s): ${j.reason}. Measured samples stay; nothing is refunded. resume at ${where(j.site)} continues in a new segment; cancel ends it.`,
    summary(w, a, j, 'sample'),
  );
}
function stop(w: V7World, a: V7Actor, j: Trial, why: string, say: Say) {
  close(w, a, j, 'stopped', why);
  say(
    EVENTS.stopped,
    `Heat exposure trial ${j.id} stopped after ${String(j.samples.length)} of ${String(j.requested)} sample(s): ${why}. Measured samples and ${shown(j.paidEnergy)} paid energy stay; nothing is refunded.`,
    summary(w, a, j, 'sample'),
  );
}
/** The next round of a trial: fresh checks, then a sample, a pause without charge or a stop. */
function next(c: V7ActionContext, j: Trial): V7HandlerResult {
  const { world: w, actor: a } = c;
  const say: Say = (type, description, data) => {
    c.emit(type, description, data, j.id);
  };
  const unmet = blockers(a);
  if (unmet.stop.length) {
    stop(w, a, j, `activity guard: ${unmet.stop.join('; ')}`, say);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  const away = v7Distance(a.position, j.site) > SAME_PLACE;
  if (unmet.pause.length || away) {
    pause(
      w,
      a,
      j,
      [
        ...unmet.pause,
        ...(away ? ['you are away from the trial position'] : []),
      ],
      say,
    );
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  return take(c, j);
}
const continuing = (c: V7ActionContext, j: Trial) =>
  j.status === 'active' &&
  j.lastSampled === c.world.tick - 1 &&
  j.samples.length < j.requested &&
  c.operation?.first === false;
function baselineOf(a: V7Actor, value: unknown): Trial | null {
  const id = text(value);
  if (!id) return null;
  const found = records(a).find((r) => r.id === id);
  if (!found)
    throw nothing(
      `baselineId ${id} is not one of your trial records (${records(a)
        .map((r) => r.id)
        .join(', ')}).`,
    );
  return found;
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const target = text(action.args.targetId);
  const x = action.args.x,
    y = action.args.y;
  if ((typeof x === 'number') !== (typeof y === 'number'))
    throw nothing('Give both x and y for a point.');
  if (target && typeof x === 'number')
    throw nothing('Give targetId or x and y, not both.');
  if (a.vitals.energy < COST.inspect - 1e-9)
    throw nothing(
      `Not enough energy: inspect needs ${String(COST.inspect)}, you have ${shown(a.vitals.energy)}.`,
    );
  const seen = v7Observe(w, a.id);
  const here = reading(w, a, a.position);
  let candidates: Candidate[];
  if (target) candidates = [aimed(w, a, seen, target, here)];
  else if (typeof x === 'number' && typeof y === 'number') {
    const p = { x, y };
    if (
      !v7Inside(w, p, 0) ||
      v7Distance(a.position, p) > w.config.vision ||
      !v7Visible(w, a.position, p)
    )
      throw nothing(
        `${where(p)} is not a visible point within ${String(w.config.vision)} of you.`,
      );
    candidates = [
      candidate(w, a, p, here, { source: 'the named point', target: null }),
    ];
  } else candidates = survey(w, a, seen, here);
  const after = bodyAfter(w, a, a.position);
  const plain = shelterTemperature(
    a.vitals.temperature,
    here.air,
    here.insulation,
    false,
  ).temperature;
  const open = reference(w, a, openSoil(w, a, seen));
  v7Spend(a, COST.inspect);
  const unaffected: Record<string, number> = {};
  for (const o of seen.objects)
    if (!o.spatial.enclosure)
      unaffected[o.kind] = (unaffected[o.kind] ?? 0) + 1;
  const inspection: V7Data = {
    id: `look-${a.id}-${String(w.tick)}`,
    tick: w.tick,
    site: {
      measured: {
        body: a.vitals.temperature,
        air: here.air,
        indoor: here.indoor,
        light: here.light,
        rain: here.rain,
        wind: here.wind,
        daylight: here.daylight,
        season: here.season,
        trend: here.trend,
        ground: here.ground,
        x: here.x,
        y: here.y,
      },
      modelDerived: {
        insulation: here.insulation,
        enclosure: here.enclosure,
        bodyAfter: after,
        change: round(after - a.vitals.temperature),
        otherRules: round(after - plain),
        openGround: open,
      },
      unknown: UNKNOWN,
    },
    candidates,
    withoutEffect: unaffected,
    represented: REPRESENTED,
    provenance: PROVENANCE,
  };
  a.extensionState[LOOKED] = inspection;
  const listed = candidates
    .map(
      (k) =>
        `${k.target ? `${k.target} (${k.modelDerived.indoor ? 'enclosure interior' : `no represented protection; its ${k.modelDerived.ground} ground`})` : k.modelDerived.ground} at ${shown(k.distance)}: air ${signed(k.modelDerived.airDifference)}, next-round body change ${signed(k.modelDerived.change)}`,
    )
    .join('; ');
  const count = Object.values(unaffected).reduce((t, n) => t + n, 0);
  c.emit(
    EVENTS.inspected,
    `Inspected heat exposure for ${String(COST.inspect)} energy at ${where(here)}: body ${shown(a.vitals.temperature)}, air ${shown(here.air)} (${place(here)}); the world's body-heat update gives ${signed(round(after - a.vitals.temperature))} next round (model-derived).${listed ? ` Candidates, model-derived, nothing measured there: ${listed}.` : ' No other represented position is in view.'}${count ? ` The ${String(count)} visible objects without an enclosure change no air, light or wind value: no shade is represented.` : ''}`,
    {
      operation: ID,
      by: a.id,
      inspection,
      view: view(w, a, 'inspect', 'inspected', null, {
        targets: candidates.flatMap((k) => (k.target ? [k.target] : [])),
        provenance: 'measured here; model-derived elsewhere',
        evidence: 'model-derived',
        attention: true,
      }),
    },
    target,
  );
  return { complete: true, remaining: 0, writes: [] };
}
function sample(c: V7ActionContext, open: Trial | null): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const base = baselineOf(a, action.args.baselineId);
  if (open && continuing(c, open)) return next(c, open);
  const unmet = blockers(a);
  const all = [...unmet.stop, ...unmet.pause];
  if (all.length)
    throw nothing(`You cannot start sampling now: ${all.join('; ')}.`);
  if (open)
    stop(w, a, open, 'a new trial replaced it', (type, description, data) => {
      c.emit(type, description, data, open.id);
    });
  const j: Trial = {
    id: `heat-${a.id}-${String(w.tick)}`,
    actor: a.id,
    status: 'active',
    requested:
      action.args.sampleRounds === undefined
        ? ROUNDS.min
        : Number(action.args.sampleRounds),
    site: { x: a.position.x, y: a.position.y },
    baseline: base?.id ?? null,
    samples: [],
    segments: [{ n: 1, startedAt: w.tick }],
    paidEnergy: 0,
    paidRounds: 0,
    lastSampled: -1,
    reason: null,
    startedAt: w.tick,
    endedAt: null,
    comparison: null,
  };
  return take(c, j);
}
function resume(c: V7ActionContext, open: Trial | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open)
    throw nothing(
      'There is no open heat exposure trial to resume; give sample.',
    );
  if (open.status === 'active' && open.lastSampled === w.tick - 1)
    return next(c, open);
  if (open.samples.length >= open.requested)
    throw nothing(
      `All ${String(open.requested)} requested samples of ${open.id} are taken; its last reading comes at the start of the next round.`,
    );
  const d = v7Distance(a.position, open.site);
  if (d > SAME_PLACE)
    throw nothing(
      `You are ${shown(d)} from the trial position ${where(open.site)}; resume only there, or give sample for a new trial here.`,
    );
  const unmet = blockers(a);
  const all = [...unmet.stop, ...unmet.pause];
  if (all.length)
    throw nothing(`You cannot resume sampling now: ${all.join('; ')}.`);
  open.segments = [
    ...open.segments,
    { n: open.segments.length + 1, startedAt: w.tick },
  ];
  open.status = 'active';
  open.reason = null;
  c.emit(
    EVENTS.resumed,
    `Resumed heat exposure trial ${open.id} at ${where(open.site)} in segment ${String(open.segments.length)}; the interrupted rounds are not continuous exposure evidence.`,
    summary(w, a, open, 'resume'),
    open.id,
  );
  return take(c, open);
}
function cancel(c: V7ActionContext, open: Trial | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open) throw nothing('There is no open heat exposure trial to cancel.');
  close(w, a, open, 'cancelled', 'cancelled on request');
  c.emit(
    EVENTS.cancelled,
    `Cancelled heat exposure trial ${open.id} after ${String(open.samples.length)} of ${String(open.requested)} sample(s); measured samples and ${shown(open.paidEnergy)} paid energy stay, nothing is refunded.`,
    summary(w, a, open, 'cancel'),
    open.id,
  );
  return { complete: true, remaining: 0, writes: [open.id] };
}
function check(c: V7ActionContext, open: Trial | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = open ?? records(a).at(-1) ?? null;
  if (!j) throw nothing('There is no heat exposure trial to report.');
  if (a.vitals.energy < COST.check - 1e-9)
    throw nothing(
      `Not enough energy: inspect-progress needs ${String(COST.check)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.check);
  const unmet = blockers(a);
  const live = open
    ? {
        distanceFromSite: round(v7Distance(a.position, open.site)),
        stopsSampling: unmet.stop,
        pausesSampling: unmet.pause,
      }
    : null;
  c.emit(
    EVENTS.checked,
    `Checked heat exposure trial ${j.id} for ${String(COST.check)} energy: ${j.status}${j.reason ? ` (${j.reason})` : ''}; ${String(measured(j).length)} of ${String(j.requested)} sample(s) measured, ${shown(j.paidEnergy)} energy paid.`,
    {
      ...summary(w, a, j, 'inspect-progress', { attention: true }),
      samples: j.samples.map(brief),
      current: live,
      energy: COST.check,
    },
    j.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}
function compare(c: V7ActionContext, open: Trial | null): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const list = records(a);
  const subject = open ?? list.at(-1) ?? null;
  if (!subject)
    throw nothing('There is no heat exposure trial record to compare.');
  const named = baselineOf(a, action.args.baselineId);
  if (named?.id === subject.id)
    throw nothing(`${subject.id} cannot be its own baseline.`);
  const earlier = list.filter((r) => r.id !== subject.id);
  const baseline = named ?? earlier.at(-1) ?? null;
  if (a.vitals.energy < COST.compare - 1e-9)
    throw nothing(
      `Not enough energy: compare needs ${String(COST.compare)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.compare);
  const result = comparison(w, subject, baseline);
  a.extensionState[COMPARED] = result;
  c.emit(
    EVENTS.compared,
    `Compared heat exposure trial ${subject.id}${baseline ? ` with ${baseline.id}` : ' with the open-soil reference only'} for ${String(COST.compare)} energy; no sample was used. Body: ${result.body ?? 'insufficient evidence'}. ${result.conclusion}`,
    {
      operation: ID,
      by: a.id,
      comparison: result,
      view: view(w, a, 'compare', 'compared', open, {
        targets: [subject.id, ...(baseline ? [baseline.id] : [])],
        provenance: 'measured records; model-derived references',
        evidence:
          result.evidence === 'insufficient' ? 'insufficient' : 'measured',
        attention: true,
      }),
    },
    subject.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = typeof c.action.args.mode === 'string' ? c.action.args.mode : '';
  if (!MODES.includes(mode)) throw nothing(`Give mode ${MODES.join(', ')}.`);
  const allowed = ARGS[mode] ?? [];
  const extra = Object.entries(c.action.args)
    .filter(([k, v]) => k !== 'mode' && !allowed.includes(k) && v !== '')
    .map(([k]) => k);
  if (extra.length)
    throw nothing(
      `${mode} takes ${allowed.length ? allowed.join(', ') : 'no argument but mode'}; leave out ${extra.join(', ')}.${mode === 'sample' ? ' Sampling is only where you stand; move first with navigate.' : ''}`,
    );
  settle(c.world, c.actor, (type, description, data) => {
    c.emit(type, description, data);
  });
  const open = current(c.actor);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'sample') return sample(c, open);
  if (mode === 'compare') return compare(c, open);
  if (mode === 'inspect-progress') return check(c, open);
  if (mode === 'resume') return resume(c, open);
  return cancel(c, open);
}

/** After each round's environment, before its body-heat update: readings due from the round
 * before are taken, and a trial not sampled this round pauses without charge. */
function environment(w: V7World) {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    const work = current(a)?.id ?? null;
    const say: Say = (type, description, data) => {
      forestEvent(w, type, description, a.position, a.id, data, work);
    };
    settle(w, a, say);
    const j = current(a);
    if (
      !j ||
      j.status !== 'active' ||
      j.lastSampled >= w.tick ||
      j.samples.length >= j.requested
    )
      continue;
    pause(
      w,
      a,
      j,
      [
        v7Distance(a.position, j.site) > SAME_PLACE
          ? 'you moved away from the trial position'
          : 'this round went to another action, a refused action or no action',
      ],
      say,
    );
  }
}
/** Death ends the trial at once; a reading still due stays unknown. */
function onDeath(w: V7World, a: V7Actor) {
  const j = current(a);
  if (!j) return;
  close(w, a, j, 'ended', 'the person died; a reading still due stays unknown');
  forestEvent(
    w,
    EVENTS.ended,
    `Heat exposure trial ${j.id} ended by death after ${String(measured(j).length)} measured sample(s); nothing is refunded.`,
    a.position,
    a.id,
    summary(w, a, j, 'sample'),
    j.id,
  );
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Heat exposure trial',
  function:
    'Inspect what the world represents about heat exposure here, at a visible point or object, then measure your own body temperature while staying where you are for 1-3 rounds and compare your records; no shade, shelter or cooling is made or assumed.',
  equivalence: 'thermal:occupied-position-exposure:measured-trial:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      targetId: { type: 'string', maxLength: 1000 },
      x: { type: 'number' },
      y: { type: 'number' },
      baselineId: { type: 'string', maxLength: 1000 },
      sampleRounds: {
        type: 'integer',
        minimum: ROUNDS.min,
        maximum: ROUNDS.max,
      },
    }),
    required: ['mode'],
  },
  references: { targetId: 'optional-exact-visible' },
  prerequisites: [],
  learning: 2,
  learningEnergy: COST.study,
  costs: `Study: 2 rounds, ${String(COST.study)} energy each. inspect: 1 round, ${String(COST.inspect)}; targetId (visible object or item) or x, y (visible point within 5), or neither for a survey. sample: only where you stand, sampleRounds 1-${String(ROUNDS.max)} (default 1), ${String(COST.sample)} per sampled round; needs ${String(COST.sample)} energy, health ${String(GUARD.health)}+ and body ${String(GUARD.cold)}-${String(GUARD.hot)} (activity guards, not safety); baselineId names an earlier record. compare: 1 round, ${String(COST.compare)}, uses no sample. inspect-progress: 1 round, ${String(COST.check)}. resume: at the trial position, as sample. cancel: 1 round, no energy. Refusals cost nothing; nothing is used or given; travel is navigate.`,
  effects:
    "inspect gives your body and air readings (measured) and, here and at candidates (the nearest visible spot of each other ground kind and each visible enclosure interior, or the named one), model-derived air, indoor, light, insulation and next-round body change from the world's own update. Ground kind, time, weather, enclosure interiors (air pulled toward 12, insulation slowing change) and installed shelter or fire rules change exposure; trees, plants and rocks change no air, light or wind, so no shade is reported. sample records body temperature at each round's start and the next (measured), the prediction and the same-round open-soil value (model-derived). Trial end and compare label evidence, represented heat input, observed trend and body direction (cooling only if body temperature fell). Another action, moving or low energy pauses free; guards stop; death ends. No reward, buff, shelter or cooling.",
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: a trial earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'sample pays and records one round at a time with the same action up to sampleRounds; each after reading is taken at the next round start. resume continues a paused trial; inspect, compare, inspect-progress and cancel take one round.',
  },
};

/** ex25: Moss's request to assess and reduce environmental heat exposure. */
export const LONG_EX25_HEAT_EXPOSURE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex25',
  dependencies: ['foundation-open@1'],
  description:
    "A general heat-exposure assessment and occupancy trial: paid inspection of the represented climate and body-heat values at the person's position and at visible candidate positions, measured before and after body temperatures over 1-3 paid stationary rounds against the same-round open-soil value and earlier personal records, deterministic comparison labels, pause, resume, cancellation and death handling. Readings and predictions come from the existing climate and body-heat update; no shade, shelter, cooling, health or reward is added.",
  reuse: {
    experiment:
      'foundation-forest@1 climate and body heat: forestClimate (air from season, weather, daylight, ground kind, climate offset and seasonal pressure; enclosure interiors buffered toward 12; outdoor rain and wind) and forestPhysiology, the update v7Physiology applies once per round (body temperature toward the air by 0.035 / (1 + insulation), installed shelter, fire and insulation rules, heat damage above 34); continuous-v1 observation and navigate',
    source:
      "forest-climate.ts (forestClimate, forestEvent); forest-environment.ts (forestPhysiology, run on a discarded copy for predictions); forest-thermal.ts (shelterTemperature); continuous-observation.ts (v7Observe); continuous-geometry.ts (v7Interior, v7Visible, v7ShapeDistance, v7Inside, v7Distance); continuous-base.ts (v7ObjectSchema, v7Spend); forest-references.ts through the ability's references",
    description:
      'Implementation reuse only: the world keeps its single body-heat update per round and this operation reads its result; it resolves no shade or obstruction because the model has none beyond enclosure interiors. New: the inspection report, trial records, comparison labels and lifecycle.',
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
};
