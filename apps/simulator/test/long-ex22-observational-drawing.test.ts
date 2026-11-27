import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  v7Clone,
  v7Install,
  v7Observe,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'draw-from-observation';
const KIND = 'groove-drawing';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Sol's visible berry plant and Sol's position at the round-9 request. */
const SUBJECT = 'forest-berry-1';
const STAND = { x: 13.60929723, y: 16.57717592 };
/** A forest-floor point 0.31 from Sol: outside Sol's body, within hand reach. */
const SPOT = { x: 13.3, y: 16.58 };
/** A stem, a leaf outline and a berry circle inside the 0.3 patch, clear of Sol's body. */
const PICTURE = [
  {
    points: [
      { x: 0.03, y: 0.12 },
      { x: 0.03, y: -0.02 },
    ],
  },
  {
    points: [
      { x: 0.03, y: 0.06 },
      { x: -0.05, y: 0.03 },
      { x: 0.03, y: 0.03 },
    ],
  },
  {
    points: [
      { x: 0.03, y: -0.02 },
      { x: 0.06, y: -0.05 },
      { x: 0.03, y: -0.08 },
      { x: 0, y: -0.05 },
      { x: 0.03, y: -0.02 },
    ],
  },
  {
    points: [
      { x: -0.08, y: -0.04 },
      { x: -0.12, y: -0.08 },
    ],
  },
];
/** sha256 of JSON.stringify of ex20's marking package, taken before this change. */
const MARKING_BEFORE =
  '67214432d1d7420a964bf31f3371d0faed6555c0af79a0ee534e0ae63ae74cde';

function step(w: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [a.id, actions[a.id] ?? WAIT]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { ...result, world: v7Clone(result.world) };
}
const actor = (w: V7World, name = 'sol'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
type Groove = {
  kind: string;
  index: number;
  points: { x: number; y: number }[];
  length: number;
  width: number;
  depth: number;
  retained: boolean;
  displaced: number;
  color: string;
  contrast: number;
  visible: boolean;
};
type Drawing = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  paidEnergy: number;
  completedWork: number;
  surface: Record<string, unknown>;
  test: Record<string, unknown>;
  subject: Record<string, unknown> | null;
  quote: Record<string, unknown> | null;
  grooves: Groove[];
  drawing: string | null;
  pausedAt: number | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Drawing);
const work = (w: V7World): Drawing => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing drawing work.');
  return j;
};
const drawings = (w: V7World) => w.objects.filter((o) => o.kind === KIND);
const drawingOf = (w: V7World): V7Object => {
  const o = drawings(w).at(-1);
  if (!o) throw new Error('Missing ground drawing.');
  return o;
};
const grooves = (o: V7Object) => o.data.grooves as unknown as Groove[];
const act = (m: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
const test = (at = SPOT, extra: Record<string, unknown> = {}) =>
  act('test', { surfaceRef: 'ground', ...at, ...extra });
const draw = (
  strokes: unknown = PICTURE,
  extra: Record<string, unknown> = {},
) => act('draw', { subjectRef: SUBJECT, strokes, ...extra });
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex22', 'long-culture-v2', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
/** Sol at the round-9 position; optionally with gathered berries and a branch; studied. */
function setup(opts: { study?: boolean; items?: boolean } = {}) {
  let w = installed();
  actor(w).position = { ...STAND };
  if (opts.items) {
    for (const [target, quantity] of [
      [SUBJECT, 2],
      ['canopy-69', 1],
    ] as const) {
      const r = step(w, {
        sol: { interface: 'gather', args: { target, quantity } },
      });
      expect(r.outcomes.sol?.success).toBe(true);
      w = fed(r.world);
    }
  }
  if (opts.study ?? true) {
    w = step(w, { sol: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 1 });
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  const own = (res: string) =>
    w.stacks.find((s) => s.owner === 'sol' && s.resource === res)?.id ?? '';
  return { w: fed(w), berry: own('berry'), branch: own('branch') };
}
/** The action fails and changes no vitals, stacks, objects or works compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'sol') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'sol') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    idle,
    outcome: r.outcomes[who],
    energy: actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy,
  };
}
/** Sol tests the spot and draws the picture in two rounds. */
function drawn() {
  const f = setup();
  let w = fed(step(f.w, { sol: test() }).world);
  w = fed(step(w, { sol: draw() }).world);
  w = fed(step(w, { sol: draw() }).world);
  expect(work(w)).toMatchObject({ status: 'completed', stage: 'completed' });
  return { ...f, w };
}

describe('draw from observation in ex22', () => {
  it('is scoped to ex22, fits the text limit, registers its drawing and needs two rounds of study', () => {
    const world = initialLongWorld('long-ex20', 'long-culture-v2');
    expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
      /not approved/,
    );
    const all = continuousRegistry();
    expect(all.handlers['long.draw-from-observation']).toBeDefined();
    expect(all.handlers['long.apply-marking-material']).toBeDefined();
    const g = genesis();
    const pkg = continuousRegistry(g).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex22');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.visualComponents).toEqual([KIND]);
    for (const c of pkg?.visualComponents ?? [])
      expect(typeof CONTINUOUS_VISUALS[c]).toBe('function');
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.resources).toEqual([]);
    const f = setup({ study: false });
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.parameters.properties?.method).toMatchObject({
      enum: ['finger-groove', 'implement-groove', 'material-mark'],
    });
    expect(ability?.references).toEqual({
      subjectRef: 'optional-exact-visible',
      implementRef: 'optional-exact-visible',
      markingStackRef: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // The existing mark interface is a text sign without geometry: not equivalent, not reused.
    const mark = f.w.abilities.find((a) => a.id === 'mark');
    expect(Object.keys(mark?.parameters.properties ?? {}).sort()).toEqual([
      'subject',
      'text',
    ]);
    expect(mark?.effects).toMatch(/No physical effect/);
    expect(ability?.equivalence).not.toBe(mark?.equivalence);
    // Unstudied use is refused without any cost; two study rounds master it.
    expect(unchanged(f.w, test())).toMatch(/master|learn|stud/i);
    let w = step(f.w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('keeps apply-marking-material byte-identical, with its applied-mark drawing unchanged', () => {
    const p = V7_PACKAGES.find((x) => x.id === 'apply-marking-material');
    expect(createHash('sha256').update(JSON.stringify(p)).digest('hex')).toBe(
      MARKING_BEFORE,
    );
    expect(p?.visualComponents).toEqual(['applied-mark']);
    // The applied-mark drawing needs a deposit, so it cannot show a groove without pigment.
    const groove = drawingOf(drawn().w);
    expect(
      CONTINUOUS_VISUALS['applied-mark']?.(
        {
          ...groove,
          kind: 'applied-mark',
          data: { marks: groove.data.grooves ?? [] },
        },
        [],
      ),
    ).toBe('');
  });

  it('a suitability test on forest floor costs one round and 0.5 energy and leaves one visible groove', () => {
    const f = setup();
    const r = cost(f.w, test(SPOT, { subjectRef: SUBJECT }));
    expect(r.energy).toBeCloseTo(0.5, 8);
    const w = r.world;
    // No pigment, item or stock is used; the ground drawing is the only new thing.
    expect(v7Signature(w.stacks)).toBe(v7Signature(r.idle.stacks));
    expect(w.objects.length).toBe(r.idle.objects.length + 1);
    const j = work(w);
    expect(j).toMatchObject({
      owner: 'sol',
      status: 'paused',
      stage: 'tested',
      paidEnergy: 0.5,
      surface: {
        ref: 'ground:13:16',
        ground: 'f',
        name: 'forest floor',
        yielding: true,
        tone: '#52644a',
        extent: 0.3,
      },
      test: { retained: true, visible: true, depth: 0.01, reason: null },
      subject: { ref: SUBJECT },
    });
    const o = drawingOf(w);
    expect(o).toMatchObject({
      createdBy: 'sol',
      revision: `${id}@1`,
      spatial: { x: SPOT.x, y: SPOT.y, solid: false },
      visual: { component: KIND, color: '#3a4734', accent: '#52644a' },
      data: {
        method: 'finger-groove',
        pigment: 'none',
        durability: 'untested',
        status: 'test groove only',
        strokes: 0,
      },
    });
    const [g] = grooves(o);
    // The shaded floor of a groove half as deep as wide: 1 - 1 / sqrt(2) of the light is hidden.
    expect(g).toMatchObject({
      kind: 'test',
      length: 0.05,
      width: 0.02,
      depth: 0.01,
      retained: true,
      visible: true,
      color: '#3a4734',
      displaced: 0.00001,
    });
    expect(g?.contrast).toBeCloseTo(0.0987, 4);
    expect(o.data.persistence).toEqual(
      expect.stringMatching(/No rain, trampling or erosion rule/),
    );
    expect(data(w, 'ground-drawing-tested')).toMatchObject({
      mode: 'test',
      energy: 0.5,
      view: { component: KIND, status: 'test groove only', badge: null },
    });
    expect(events(w, 'ground-drawing-failed')).toHaveLength(0);
    expect(
      actor(w).memory.knowledge?.['ground:f:finger-groove:kept:ordinary soil'],
    ).toMatchObject({ verified: true, value: { kept: true } });
    // A nearby person sees the drawing through ordinary observation.
    expect(
      v7Observe(w, 'moss').objects.some((x) => x.id === o.id && x.data.grooves),
    ).toBe(true);
  });

  it('draws six or fewer strokes in two paid rounds, keeping only performed grooves', () => {
    const f = setup();
    let w = fed(step(f.w, { sol: test() }).world);
    const seen: string[] = [];
    const first = cost(w, draw());
    expect(first.energy).toBeCloseTo(0.5, 8);
    expect(first.outcome?.complete).toBe(false);
    seen.push(...first.world.events.map((e) => e.type));
    w = fed(first.world);
    // The first round traces half the strokes; the partial drawing shows exactly those.
    expect(work(w)).toMatchObject({
      stage: 'drawing',
      status: 'active',
      quote: { strokes: 4, rounds: 2, energy: 1 },
    });
    expect(drawingOf(w).data).toMatchObject({ strokes: 2, status: 'partial' });
    const second = cost(w, draw());
    expect(second.energy).toBeCloseTo(0.5, 8);
    expect(second.outcome?.complete).toBe(true);
    seen.push(...second.world.events.map((e) => e.type));
    w = second.world;
    expect(seen.filter((t) => t === 'ground-drawing-stroke')).toHaveLength(4);
    expect(seen.filter((t) => t === 'ground-drawing-completed')).toHaveLength(
      1,
    );
    const j = work(w);
    expect(j).toMatchObject({
      status: 'completed',
      stage: 'completed',
      paidEnergy: 1.5,
      completedWork: 3,
      subject: { ref: SUBJECT, name: 'Red berries' },
    });
    const o = drawingOf(w);
    const strokes = grooves(o).filter((g) => g.kind === 'stroke');
    expect(strokes.map((g) => g.points)).toEqual(PICTURE.map((s) => s.points));
    expect(
      strokes.every((g) => g.retained && g.visible && g.depth === 0.01),
    ).toBe(true);
    expect(o.data).toMatchObject({
      strokes: 4,
      status: 'completed',
      subject: { ref: SUBJECT },
      bounds: { minX: -0.12, maxX: 0.06, minY: -0.08, maxY: 0.12 },
    });
    expect(Number(o.data.revision)).toBe((o.data.changes as unknown[]).length);
    // The displaced soil equals length x width x depth of every groove; no stock is created.
    const length = grooves(o).reduce((n, g) => n + g.length, 0);
    expect(Number(o.data.displaced)).toBeCloseTo(length * 0.02 * 0.01, 8);
    expect(w.stacks.some((s) => s.origin === o.id)).toBe(false);
    expect(
      actor(w).memory.knowledge?.[`${o.id}:drawn-from-observation`],
    ).toMatchObject({ verified: true, value: { strokes: 4, visible: 4 } });
    expect(data(w, 'ground-drawing-completed')).toMatchObject({
      view: { status: 'completed', badge: null },
    });
    const mine = (type: string) =>
      events(w, type).filter((e) => e.actor === 'sol');
    expect(mine('practice-confirmed')).toHaveLength(0);
    expect(mine('satisfaction')).toHaveLength(0);
    expect(actor(w).wellbeing.sources.map((s) => s.source)).toEqual(
      actor(f.w).wellbeing.sources.map((s) => s.source),
    );
    // A single stroke is one round.
    const one = fed(step(f.w, { sol: test() }).world);
    const r = cost(one, draw([PICTURE[0]]));
    expect(r.energy).toBeCloseTo(0.5, 8);
    expect(r.outcome?.complete).toBe(true);
  });

  it('rocky ground and a wet bank fail the paid test with a reason and keep the disturbance', () => {
    const f = setup();
    for (const [stand, spot, reason] of [
      [{ x: 40.5, y: 3.5 }, { x: 40.2, y: 3.5 }, /rocky ground does not yield/],
      [{ x: 21.5, y: 18.5 }, { x: 21.2, y: 18.5 }, /wet bank is saturated/],
    ] as const) {
      const w0 = v7Clone(f.w);
      actor(w0).position = { ...stand };
      const r = cost(w0, test(spot));
      expect(r.energy).toBeCloseTo(0.5, 8);
      const w = fed(r.world);
      expect(work(w)).toMatchObject({
        status: 'completed',
        stage: 'unsuitable',
        test: { retained: false, visible: false, depth: 0 },
      });
      expect(String(work(w).test.reason)).toMatch(reason);
      expect(String(data(w, 'ground-drawing-failed')?.result)).toBe(
        'unsuitable surface',
      );
      const o = drawingOf(w);
      expect(o.data).toMatchObject({ status: 'unsuitable', strokes: 0 });
      expect(grooves(o)[0]).toMatchObject({ retained: false, visible: false });
      // The failed groove is recorded but not drawn; no picture is possible on that patch.
      expect(CONTINUOUS_VISUALS[KIND]?.(o, [])).toBe('');
      expect(unchanged(w, act('draw', { strokes: PICTURE }))).toMatch(
        /test first/,
      );
    }
    // Meadow ground keeps a groove with its own, lighter tone.
    const meadow = v7Clone(f.w);
    actor(meadow).position = { x: 16.6, y: 15.9 };
    const m = fed(step(meadow, { sol: test({ x: 16.9, y: 15.9 }) }).world);
    expect(work(m)).toMatchObject({ stage: 'tested' });
    expect(grooves(drawingOf(m))[0]?.contrast).toBeGreaterThan(0.0987);
  });

  it('refuses invalid requests and unavailable methods before any charge', () => {
    const f = setup({ items: true });
    const w = f.w;
    expect(
      unchanged(w, test({ x: 13.3, y: 16.58 }, { strokes: PICTURE })),
    ).toMatch(/test takes no strokes/);
    expect(unchanged(w, act('test'))).toMatch(/Give x and y/);
    expect(unchanged(w, test({ x: 12.9, y: 16.58 }))).toMatch(
      /beyond hand reach/,
    );
    expect(unchanged(w, test(STAND))).toMatch(/under a body/);
    // A plant covers its patch: the soil there is not exposed.
    const plant = v7Clone(w);
    actor(plant).position = { x: 14.2, y: 15.9 };
    expect(unchanged(plant, test({ x: 14.2, y: 16.2 }))).toMatch(
      /not exposed soil/,
    );
    // Water is not ground.
    const river = v7Clone(w);
    actor(river).position = { x: 24.7, y: 18.5 };
    expect(unchanged(river, test({ x: 25.06, y: 18.5 }))).toMatch(/water/);
    // Light and energy.
    const dark = v7Clone(w);
    dark.time = (dark.config.forest?.day ?? 80) * 0.6;
    expect(unchanged(dark, test())).toMatch(/too dark/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    expect(unchanged(tired, test())).toMatch(/0.5 energy/);
    // implement-groove and material-mark name what is missing and stay unavailable.
    expect(unchanged(w, test(SPOT, { method: 'implement-groove' }))).toMatch(
      /needs implementRef/,
    );
    expect(
      unchanged(
        w,
        test(SPOT, { method: 'implement-groove', implementRef: f.branch }),
      ),
    ).toMatch(/implement-groove is unavailable: soil has no represented/);
    expect(unchanged(w, test(SPOT, { method: 'material-mark' }))).toMatch(
      /needs markingStackRef/,
    );
    expect(
      unchanged(
        w,
        test(SPOT, { method: 'material-mark', markingStackRef: f.berry }),
      ),
    ).toMatch(/material-mark is unavailable/);
    expect(unchanged(w, test(SPOT, { implementRef: f.branch }))).toMatch(
      /uses only your finger/,
    );
    expect(unchanged(w, test(SPOT, { subjectRef: 'forest-oak-2' }))).not.toBe(
      '',
    );
    expect(unchanged(w, act('cancel'))).toMatch(/no open drawing work/);
    // Draw rules after a suitable test.
    const tested = fed(step(w, { sol: test() }).world);
    expect(unchanged(tested, test())).toMatch(/still open/);
    expect(unchanged(tested, draw(PICTURE, { subjectRef: '' }))).toMatch(
      /Give subjectRef/,
    );
    const seven = Array.from({ length: 7 }, () => PICTURE[0]);
    expect(unchanged(tested, draw(seven))).toMatch(/1 to 6 strokes/);
    expect(
      unchanged(
        tested,
        draw([
          {
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 0.2 },
            ],
          },
        ]),
      ),
    ).toMatch(/within the 0.3 by 0.3 patch/);
    expect(
      unchanged(
        tested,
        draw([
          {
            points: [
              { x: -0.15, y: -0.15 },
              { x: -0.15, y: 0.15 },
              { x: -0.1, y: -0.15 },
            ],
          },
        ]),
      ),
    ).toMatch(/at most 0.3 long/);
    expect(
      unchanged(
        tested,
        draw([
          {
            points: [
              { x: 0.03, y: 0 },
              { x: 0.12, y: 0 },
            ],
          },
        ]),
      ),
    ).toMatch(/under a body/);
    // A different plan after the first round is a new attempt.
    const started = fed(step(tested, { sol: draw() }).world);
    expect(unchanged(started, draw(PICTURE.slice(0, 2)))).toMatch(
      /different stroke plan/,
    );
  });

  it('pauses at no charge when the round is not worked or the subject is out of sight, then resumes', () => {
    const f = setup();
    let w = fed(step(f.w, { sol: test() }).world);
    w = fed(step(w, { sol: draw() }).world);
    // An unworked round stops the drawing; nothing is charged and the two strokes remain.
    const idle = step(w);
    w = fed(idle.world);
    expect(work(w)).toMatchObject({ status: 'paused' });
    expect(events(w, 'ground-drawing-paused')).toHaveLength(1);
    expect(drawingOf(w).data).toMatchObject({ strokes: 2, status: 'partial' });
    // The subject moved out of sight: the resumed round pauses before any charge.
    const hidden = v7Clone(w);
    const plant = hidden.objects.find((o) => o.id === SUBJECT);
    if (!plant) throw new Error('Missing subject.');
    plant.spatial = { ...plant.spatial, x: 40.2, y: 30.3 };
    // A continuing round carries its first, already resolved action; the stored subject is checked.
    const away = step(hidden, { sol: act('draw') });
    expect(away.outcomes.sol?.success).toBe(true);
    expect(actor(away.world).vitals.energy).toBe(
      actor(step(hidden).world).vitals.energy,
    );
    expect(away.outcomes.sol?.reason).toMatch(/do not see forest-berry-1 now/);
    expect(work(away.world)).toMatchObject({ status: 'paused' });
    expect(drawingOf(away.world).data).toMatchObject({ strokes: 2 });
    // Back in view: the same plan resumes and completes, appending to the strokes.
    const r = cost(w, draw());
    expect(r.energy).toBeCloseTo(0.5, 8);
    expect(events(r.world, 'ground-drawing-resumed')).toHaveLength(1);
    expect(work(r.world)).toMatchObject({ status: 'completed' });
    expect(
      grooves(drawingOf(r.world)).filter((g) => g.kind === 'stroke'),
    ).toHaveLength(4);
  });

  it('cancel keeps the partial grooves; death ends the work and leaves the drawing', () => {
    const f = setup();
    let w = fed(step(f.w, { sol: test() }).world);
    w = fed(step(w, { sol: draw() }).world);
    const c = cost(w, act('cancel'));
    expect(c.energy).toBeCloseTo(0, 8);
    expect(work(c.world)).toMatchObject({
      status: 'stopped',
      stage: 'cancelled',
    });
    expect(events(c.world, 'ground-drawing-cancelled')).toHaveLength(1);
    expect(drawingOf(c.world).data).toMatchObject({
      strokes: 2,
      status: 'partial',
    });
    expect(work(c.world).paidEnergy).toBe(1);
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'ended' });
    expect(events(died, 'ground-drawing-ended')).toHaveLength(1);
    expect(drawingOf(died).data).toMatchObject({ strokes: 2 });
  });

  it('is owner-only, cannot be drawn over, and stays as drawn through rain and footsteps', () => {
    const d = drawn();
    let w = v7Clone(d.w);
    const o = drawingOf(w);
    const before = v7Signature(o);
    actor(w, 'moss').position = { x: 13.3, y: 16.9 };
    w = fed(
      step(w, { moss: { interface: 'learn', args: { ability: id } } }).world,
    );
    w = fed(step(w).world);
    expect(actor(w, 'moss').mastered).toContain(id);
    // Moss cannot continue or cancel Sol's work, nor test over Sol's drawing.
    expect(unchanged(w, draw(), 'moss')).toMatch(/test first/);
    expect(unchanged(w, act('cancel'), 'moss')).toMatch(/no open drawing work/);
    expect(unchanged(w, test({ x: 13.3, y: 16.62 }), 'moss')).toMatch(
      /other drawing covers it/,
    );
    // No rain, trampling or erosion rule acts on ground marks: the grooves stay as made.
    const rainy = v7Clone(w);
    rainy.time = 62;
    actor(rainy).position = { x: 13.6, y: 17.2 };
    actor(rainy, 'moss').position = { x: 13.3, y: 16.58 };
    expect(forestClimate(rainy, o.spatial).rain ?? 0).toBeGreaterThan(0);
    const later = step(step(rainy).world).world;
    expect(v7Signature(drawingOf(later))).toBe(before);
  });
});
