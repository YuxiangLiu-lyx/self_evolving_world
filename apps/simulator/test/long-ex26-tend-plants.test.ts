import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  forestGrowth,
  openConditions,
  openPlants,
  v7Clone,
  v7Install,
  v7Observe,
  v7Reach,
  v7RoundNumber,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Object,
  V7Package,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'tend-rooted-plants';
const REVISION = `${id}@1`;
const PATCHES = `${id}:patches`;
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list, and no mention of the far group. */
const EXTRA_EXCLUDED = /history|spiritual/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 137 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-5.json, taken before this change). */
const EXISTING_DIGEST =
  '275d67d2ea027fea6a4e00a6f3bca2900b70944b2aa6ba64caa895fa82cd9be8';
/** A copied acorn tree, harvested at genesis, within Wren's reach at her start. */
const ACORN = 'forest-acorn-3';
/** Wren's own root patch, stock 4 of 4 at genesis. */
const ROOT = 'commons-root-4-0';
/** Wren's start, and a spot from which she reaches both plants. */
const START = { x: 131.1, y: 13.09 };
const BOTH = { x: 131.3, y: 11.8 };
/** forestClimate's daylight ceiling: 0.65 + 11 / 30. */
const LIGHT_CEILING = 0.65 + 11 / 30;
const INELIGIBLE =
  /is not an established rooted food plant that regrows, so it cannot be tended; fungi, fish, seedlings, plants that are not food and plants that do not regrow are excluded\. Nothing was spent\.$/;
const UNAVAILABLE =
  'Reference unavailable: no valid personally observed reference. Observable candidates: none.';

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const tendPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const tend = (mode: string, args: Data = {}): V7Action => ({
  interface: id,
  args: { mode, ...args },
});
const probe = (target: string): V7Action => ({
  interface: 'probe',
  args: { target, mode: 'observe', intensity: 0 },
});
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
  return { outcomes: result.outcomes, world: v7Clone(result.world) };
}
const actor = (w: V7World, who = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const object = (w: V7World, oid: string): V7Object => {
  const o = w.objects.find((o) => o.id === oid);
  if (!o) throw new Error(`Missing ${oid}.`);
  return o;
};
const place = (w: V7World, p: V7Point, who = 'wren') => {
  actor(w, who).position = { ...p };
  return w;
};
/** The person's events of this package in the round. */
const mine = (w: V7World, who = 'wren'): V7Event[] =>
  w.events.filter((e) => e.actor === who && e.type.startsWith(`${id}-`));
const records = (w: V7World, who = 'wren') => {
  const v = actor(w, who).extensionState[PATCHES];
  return (Array.isArray(v) ? v : []) as Data[];
};
const ok = (r: Round, who = 'wren') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  expect(r.outcomes[who]?.complete).toBe(true);
  return r.world;
};
/** A round that succeeds without completing: study, or a multi-round walk. */
const succeeded = (r: Round, who = 'wren') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const refused = (r: Round, pattern: RegExp | string, who = 'wren') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  expect(mine(r.world, who)).toEqual([]);
  return r.world;
};
const installed = () => {
  const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Wren studies three rounds and masters the operation. */
function learned(world?: V7World) {
  let w = world ?? installed();
  for (let i = 0; i < 3; i++) w = succeeded(step(w, { wren: LEARN }));
  expect(actor(w).mastered).toContain(id);
  return w;
}
/** Plants that the existing plant rule grows. */
const growing = (w: V7World) =>
  w.objects.filter(
    (o) =>
      o.kind !== 'animal' &&
      Number(o.data.interval) > 0 &&
      o.data.resource !== 'fish',
  );
const contractOf = (e: V7Event | undefined) => {
  if (!e) throw new Error('Missing inspection.');
  return e.data.contract as Data & {
    now: Data;
    needs: Data;
    limits: string[];
  };
};

describe('tending rooted plants in ex26', () => {
  it('is registered last for long-ex26, with new names, learning 3, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = tendPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    expect(V7_PACKAGES.at(-1)).toBe(pkg);
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26').map((p) => p.id),
    ).toEqual(['bounded-resource-search', 'reciprocal-conversation', id]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: ['foundation-forest@1', 'foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        `${id}-inspected`,
        `${id}-assessed`,
        `${id}-cancelled`,
        `${id}-ended`,
      ],
    });
    expect(pkg.afterEnvironment).toBeUndefined();
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 3,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: ['probe'],
      dependencies: { abilities: ['probe'], resources: [], knowledge: [] },
      references: { target: 'object' },
      practiceEvidence: `${id}-inspected`,
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'target',
      'quantity',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'prepare',
      'maintain',
      'cancel',
    ]);
    expect(ability.parameters.properties?.quantity).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 3,
    });
    // The published costs: real work would cost 3 x 2 and 1 x 1; here nothing is indicated.
    expect(ability.costs).toContain(
      'would take 3 rounds at 2 energy each and maintain 1 round at 1 energy',
    );
    expect(ability.costs).toContain('1 round, 0.2 energy');
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e.startsWith(`${id}-`)).toBe(false);
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
    for (const e of pkg.events ?? [])
      expect(g.eventTypes?.filter((x) => x === e)).toEqual([e]);
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      description: pkg.description,
      reuse: pkg.reuse,
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(visible).not.toMatch(MENTION);
    // Every package registered before this one, by id@version, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(137);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // Only the current scope can install it, and only where the ordinary probe exists.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const blind = v7Clone(
      initialLongWorld('long-ex26', 'long-culture-v2-villages'),
    );
    blind.abilities = blind.abilities.filter((a) => a.id !== 'probe');
    expect(() => v7Install(blind, continuousRegistry(blind), REVISION)).toThrow(
      /ordinary probe interface/,
    );
    // Installing changes no person, object, item, process or state.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(v7Signature(g.state)).toBe(v7Signature(before.state));
    expect(g.processes).toEqual(before.processes);
  });

  it('takes three study rounds without study energy and refuses every mode before mastery at no cost', () => {
    let w = installed(),
      idle = installed();
    const r = step(w, { wren: tend('inspect', { target: ACORN }) });
    expect(r.outcomes.wren?.success).toBe(false);
    expect(r.outcomes.wren?.reason).toMatch(/not mastered/);
    w = r.world;
    idle = step(idle).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    for (let i = 0; i < 3; i++) {
      w = succeeded(step(w, { wren: LEARN }));
      idle = step(idle).world;
      expect(actor(w).mastered.includes(id)).toBe(i === 2);
      expect(actor(w).vitals).toEqual(actor(idle).vitals);
      // Studying and mastery give no satisfaction or practice milestone.
      expect(
        w.events.filter(
          (e) =>
            e.actor === 'wren' &&
            ['satisfaction', 'practice-confirmed'].includes(e.type),
        ),
      ).toEqual([]);
    }
    expect(actor(w).wellbeing).toEqual(actor(idle).wellbeing);
  });

  it("inspects a rooted food plant in reach with probe's own observation for 0.2 energy in one round and reports its growth contract from the existing evaluator", () => {
    const w0 = learned();
    const r = step(w0, { wren: tend('inspect', { target: ACORN }) });
    const w = ok(r),
      idle = step(v7Clone(w0)).world;
    expect(actor(w).vitals.energy).toBeCloseTo(
      actor(idle).vitals.energy - 0.2,
      9,
    );
    expect(actor(w).position).toEqual(START);
    // The observation is probe's own record of the plant.
    const known = actor(w).memory.knowledge?.[`${ACORN}:observed-state`];
    expect(known).toMatchObject({
      property: 'visible state',
      method: 'direct observation',
      verified: false,
      tick: w.tick,
    });
    const events = mine(w);
    expect(events.map((e) => e.type)).toEqual([`${id}-inspected`]);
    const e = events[0];
    const c = contractOf(e);
    // Every value comes from the plant and the existing growth evaluator at this round.
    const at = v7Clone(w0);
    at.tick += 1;
    at.time += at.config.dt;
    const plant = object(at, ACORN);
    const acorn = at.resources.find((x) => x.id === 'acorn')?.properties;
    if (!acorn) throw new Error('Missing acorn.');
    const scale = at.config.experience?.growthScale ?? 0;
    const ceiling = scale * LIGHT_CEILING;
    const growth = Number(plant.data.growth ?? 0);
    const interval = Number(plant.data.interval);
    const climate = forestClimate(at, plant.spatial);
    expect(c).toMatchObject({
      resource: 'acorn',
      interval,
      stock: 0,
      capacity: plant.data.capacity,
      growth: v7RoundNumber(growth),
      rate: v7RoundNumber(forestGrowth(at, plant)),
      ceiling: v7RoundNumber(ceiling),
      minRounds: Math.ceil((interval - growth) / ceiling - 1e-9),
      needs: {
        temperature: [acorn.minGrowth, acorn.optimalGrowth],
        moisture: acorn.moisture,
      },
      now: {
        temperature: v7RoundNumber(climate.temperature),
        light: v7RoundNumber(climate.light),
        moisture: openConditions(at, plant.spatial).moisture,
        waterlogging: 0,
        depletion: 0,
        season: climate.season,
      },
    });
    // Ordinary soil at 0.65 already reaches the 0.5 an acorn needs: no water is needed.
    expect(c.water).toMatch(/^water is not needed: soil moisture 0\.65/);
    expect(e?.data.treatment).toMatchObject({ indicated: false });
    expect(String((e?.data.treatment as Data | undefined)?.reason)).toContain(
      'no surface crust or compaction',
    );
    expect(e?.description).toContain('No corrective work indicated');
    expect(e?.description).toContain('Baseline recorded.');
    expect(e?.data.view).toMatchObject({
      component: null,
      badge: null,
      overlay: null,
      actor: 'wren',
      mode: 'inspect',
      target: ACORN,
      work: { done: 0, required: 0 },
    });
    // A persistent patch record with the baseline; no treatment, work, input or change.
    expect(records(w)).toHaveLength(1);
    expect(records(w)[0]).toMatchObject({
      plant: ACORN,
      resource: 'acorn',
      size: 1,
      status: 'open',
      inspections: 1,
      assessments: 0,
      treatment: null,
      workDone: 0,
      workRequired: 0,
      inputs: [],
      change: null,
      lastMaintenance: null,
      baseline: { tick: w.tick, stock: 0 },
    });
    // Inspection leaves the plant exactly as without it.
    expect(object(w, ACORN)).toEqual(object(idle, ACORN));
    // Wren's own root patch reads the same 0.65 against the 0.5 it needs; a fern root needs 0.7,
    // which ordinary soil does not reach, and inspection says so without carrying water.
    let near = place(v7Clone(w), BOTH);
    near = ok(step(near, { wren: tend('inspect', { target: ROOT }) }));
    expect(contractOf(mine(near)[0]).water).toMatch(
      /^water is not needed: soil moisture 0\.65 reaches the 0\.5/,
    );
    let fern = place(v7Clone(w), { x: 136.2, y: 20.3 });
    fern = ok(
      step(fern, { wren: tend('inspect', { target: 'forest-fern-root-5' }) }),
    );
    const f = contractOf(mine(fern)[0]);
    expect(f.water).toBe('water would help, but this operation carries none');
    expect(f.limits).toContain('soil moisture 0.65 is below the 0.7 it needs');
    expect(mine(fern)[0]?.data.treatment).toMatchObject({ indicated: false });
  });

  it('prepares and maintains with "no corrective work indicated" in one round at no energy, changing nothing however often it is repeated', () => {
    let w = place(learned(), BOTH),
      idle = v7Clone(w);
    const actions = [
      tend('prepare', { target: ROOT, quantity: 3 }),
      tend('prepare', { target: ROOT, quantity: 3 }),
      tend('maintain', { target: ROOT }),
      tend('maintain', { target: ROOT, quantity: 1 }),
      tend('prepare', { target: ACORN }),
      tend('maintain', { target: ACORN }),
      tend('prepare', { target: ACORN, quantity: 2 }),
    ];
    for (const action of actions) {
      w = ok(step(w, { wren: action }));
      idle = step(idle).world;
      const events = mine(w);
      expect(events.map((e) => e.type)).toEqual([`${id}-assessed`]);
      const e = events[0];
      expect(e?.description).toMatch(
        /^No corrective work indicated for (commons-root-4-0|forest-acorn-3): this soil has ground type, moisture, drought and waterlogging but no surface crust or compaction to loosen, and other plants do not compete with this one for growth, so there is nothing to clear\./,
      );
      expect(e?.description).toContain(
        'no energy was spent and nothing changed',
      );
      expect(e?.data).toMatchObject({
        mode: action.args.mode,
        indicated: false,
        energy: 0,
        view: { overlay: null, work: { done: 0, required: 0 } },
      });
      // No energy, no movement and nothing physical changes: repeated calls cannot stack.
      expect(actor(w).vitals).toEqual(actor(idle).vitals);
      expect(actor(w).position).toEqual(BOTH);
      expect(v7Signature(w.objects)).toBe(v7Signature(idle.objects));
      expect(v7Signature(w.stacks)).toBe(v7Signature(idle.stacks));
      expect(w.processes).toEqual(idle.processes);
    }
    expect(
      mine(ok(step(w, { wren: actions[0] ?? WAIT })))[0]?.description,
    ).toContain('quantity 3 was not used');
    expect(records(w)).toEqual([
      expect.objectContaining({
        plant: ROOT,
        assessments: 4,
        inspections: 0,
        baseline: null,
        lastAssessment: {
          tick: w.tick - 3,
          mode: 'maintain',
          indicated: false,
        },
      }),
      expect.objectContaining({
        plant: ACORN,
        assessments: 3,
        lastAssessment: { tick: w.tick, mode: 'prepare', indicated: false },
      }),
    ]);
    // Nothing is left pending: no operation, no active work.
    const execution = longOrdinaryInput(w, 'wren').packet.execution as {
      binding: unknown;
      activeState: Data;
    };
    expect(execution.binding).toBeNull();
    expect(Object.keys(execution.activeState)).toEqual([]);
  });

  it('refuses at no cost a target out of view or only remembered, out of reach, a non-plant, an item, a fungus, a seedling and a plant that does not regrow', () => {
    const base = learned();
    const cases: [V7Point, V7Action, RegExp | string][] = [
      [
        START,
        tend('inspect'),
        /^Give target: a rooted food plant within your reach\. Nothing was spent\.$/,
      ],
      [START, tend('inspect', { target: 'start-4-roots' }), UNAVAILABLE],
      [START, tend('prepare', { target: 'no-such-plant' }), UNAVAILABLE],
      [
        START,
        tend('prepare', { target: 'commons-berry-4-0' }),
        /^commons-berry-4-0 is not within your reach; approach it first with navigate\. Nothing was spent\.$/,
      ],
      [
        { x: 133.5, y: 9.3 },
        tend('inspect', { target: 'start-3-branches' }),
        INELIGIBLE,
      ],
      [
        { x: 129, y: 11.3 },
        tend('maintain', { target: 'start-4-stone' }),
        INELIGIBLE,
      ],
      [
        { x: 135.2, y: 13.3 },
        tend('inspect', { target: 'forest-vine-4' }),
        INELIGIBLE,
      ],
      [
        { x: 129.2, y: 16.3 },
        tend('prepare', { target: 'forest-dry-grass-3' }),
        INELIGIBLE,
      ],
      [
        { x: 132.2, y: 18.3 },
        tend('inspect', { target: 'forest-mushroom-5' }),
        INELIGIBLE,
      ],
    ];
    for (const [where, action, pattern] of cases) {
      const w = place(v7Clone(base), where),
        idle = v7Clone(w);
      const r = step(w, { wren: action });
      refused(r, pattern);
      const quiet = step(idle).world;
      expect(actor(r.world).vitals).toEqual(actor(quiet).vitals);
      expect(actor(r.world).position).toEqual(where);
      expect(records(r.world)).toEqual([]);
      expect(v7Signature(r.world.objects)).toBe(v7Signature(quiet.objects));
    }
    // The plant without regrowth and the fungus are visible and in reach; the refusal is the
    // same words as for a stone, so it tells nothing beyond ineligibility.
    const vine = place(v7Clone(base), { x: 135.2, y: 13.3 });
    expect(v7Reach(actor(vine), object(vine, 'forest-vine-4').spatial)).toBe(
      true,
    );
    expect(object(vine, 'forest-vine-4').data.interval).toBe(0);
    // A seedling is not yet established.
    const young = v7Clone(base);
    object(young, ACORN).data.stage = 'seedling';
    refused(
      step(young, { wren: tend('inspect', { target: ACORN }) }),
      INELIGIBLE,
    );
    // An item is not a plant: the shared resolver accepts only objects.
    let carrying = place(v7Clone(base), BOTH);
    carrying = ok(
      step(carrying, {
        wren: { interface: 'gather', args: { target: ROOT, quantity: 1 } },
      }),
    );
    const item = carrying.stacks.find((s) => s.owner === 'wren');
    if (!item) throw new Error('Missing item.');
    refused(
      step(carrying, { wren: tend('inspect', { target: item.id }) }),
      /^Reference wrong-kind-or-ownership/,
    );
    // A plant seen earlier but out of view now must be revisited: the refusal reads exactly
    // as for an identity that does not exist.
    let away = place(v7Clone(base), { x: 124.6, y: 14 });
    away = step(away).world;
    expect(
      actor(away).memory.objects.some((m) => m.object.id === 'start-4-roots'),
    ).toBe(true);
    away = place(away, START);
    expect(
      v7Observe(away, 'wren').objects.some((o) => o.id === 'start-4-roots'),
    ).toBe(false);
    const remembered = step(away, {
      wren: tend('inspect', { target: 'start-4-roots' }),
    });
    const unknown = step(away, {
      wren: tend('inspect', { target: 'no-such-plant' }),
    });
    refused(remembered, UNAVAILABLE);
    expect(remembered.outcomes.wren?.reason).toBe(
      unknown.outcomes.wren?.reason,
    );
    expect(
      remembered.world.events.filter(
        (e) => e.actor === 'wren' && e.type === 'failed',
      )[0]?.data,
    ).toEqual(
      unknown.world.events.filter(
        (e) => e.actor === 'wren' && e.type === 'failed',
      )[0]?.data,
    );
  });

  it('never moves anyone or reveals anything beyond the plant in reach', () => {
    let w = place(learned(), BOTH);
    const texts: unknown[] = [];
    for (const action of [
      tend('inspect', { target: ROOT }),
      tend('prepare', { target: ACORN }),
      tend('maintain', { target: ROOT }),
      tend('inspect', { target: ACORN }),
      tend('cancel'),
    ]) {
      const before = w.actors.map((a) => ({ ...a.position }));
      const target =
        typeof action.args.target === 'string' ? action.args.target : '';
      w = ok(step(w, { wren: action }));
      expect(w.actors.map((a) => a.position)).toEqual(before);
      const seen = new Set(v7Observe(w, 'wren').objects.map((o) => o.id));
      const said = JSON.stringify(mine(w));
      const kept = JSON.stringify(records(w));
      texts.push(said, kept);
      // The round's events name no object but the target (for cancel, the plants of the
      // closed records), the records only the plants tended, and nothing outside view at all.
      for (const o of w.objects) {
        const tended = [ROOT, ACORN].includes(o.id);
        if (o.id !== target && !(tended && !target))
          expect(said).not.toContain(o.id);
        if (!tended) expect(kept).not.toContain(o.id);
        if (!seen.has(o.id)) expect(said + kept).not.toContain(o.id);
      }
    }
    // The ordinary input names no remote food (the far area's plants are wild-*).
    const input = JSON.stringify(longOrdinaryInput(w, 'wren'));
    expect(input).not.toContain('wild-');
    expect(JSON.stringify(texts)).not.toContain('wild-');
  });

  it("has no treatment to apply: the soil has no crust or compaction state, other plants never change a plant's growth, and Wren's berries and roots have the moisture they need", () => {
    const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    const acorn = object(g, ACORN);
    // The soil model holds ground, moisture, drought, waterlogging and travel only.
    expect(Object.keys(openConditions(g, acorn.spatial)).sort()).toEqual([
      'drought',
      'ground',
      'hazards',
      'moisture',
      'regime',
      'travelFactor',
      'waterlogging',
    ]);
    // A second plant 0.3 m away changes nothing of the acorn's growth in the existing rule.
    const alone = v7Clone(g),
      crowded = v7Clone(g);
    crowded.objects.push({
      ...v7Clone(acorn),
      id: 'test-crowding-plant',
      spatial: { ...acorn.spatial, x: acorn.spatial.x + 0.3 },
    });
    for (const x of [alone, crowded]) {
      x.tick += 1;
      x.time += x.config.dt;
      openPlants(x);
    }
    expect(object(crowded, ACORN).data).toEqual(object(alone, ACORN).data);
    expect(Number(object(alone, ACORN).data.growth)).toBeGreaterThan(0);
    // Every berry and root plant of Wren's side has the soil moisture its growth needs.
    const need = (r: string) =>
      g.resources.find((x) => x.id === r)?.properties?.moisture ?? 2;
    const food = g.objects.filter(
      (o) =>
        o.spatial.x > 96 &&
        ['berry', 'root'].includes(
          typeof o.data.resource === 'string' ? o.data.resource : '',
        ) &&
        Number(o.data.interval) > 0,
    );
    expect(food.length).toBeGreaterThan(10);
    for (const o of food)
      expect(openConditions(g, o.spatial).moisture).toBeGreaterThanOrEqual(
        need(typeof o.data.resource === 'string' ? o.data.resource : ''),
      );
    expect(openConditions(g, object(g, ROOT).spatial).moisture).toBe(0.65);
  });

  it('leaves every plant growing exactly as in a world without the package over 120 rounds, tended or not', () => {
    let bare = place(
        v7Clone(initialLongWorld('long-ex26', 'long-culture-v2-villages')),
        BOTH,
      ),
      w = place(installed(), BOTH);
    // In both worlds Wren takes all four roots of her patch, which then regrows from 0, and
    // eats one at four fixed rounds; everything else differs only by her tending.
    const shared: Record<number, V7Action> = {
      0: { interface: 'gather', args: { target: ROOT, quantity: 4 } },
      30: { interface: 'eat', args: { target: 'root', quantity: 1 } },
      55: { interface: 'eat', args: { target: 'root', quantity: 1 } },
      80: { interface: 'eat', args: { target: 'root', quantity: 1 } },
      105: { interface: 'eat', args: { target: 'root', quantity: 1 } },
    };
    const cycle = [
      tend('inspect', { target: ACORN }),
      tend('prepare', { target: ROOT, quantity: 3 }),
      tend('maintain', { target: ACORN }),
      tend('inspect', { target: ROOT }),
      tend('prepare', { target: ACORN, quantity: 3 }),
      tend('maintain', { target: ROOT }),
    ];
    const ceiling = (w.config.experience?.growthScale ?? 0) * LIGHT_CEILING;
    let start = { acorn: 0, root: 0 };
    let tended = 0,
      inspected = 0,
      assessed = 0;
    for (let round = 0; round < 120; round++) {
      const before = new Map(
        growing(w).map((o) => [
          o.id,
          { growth: Number(o.data.growth ?? 0), stock: Number(o.data.stock) },
        ]),
      );
      const both = shared[round];
      if (both) {
        w = ok(step(w, { wren: both }));
        bare = ok(step(bare, { wren: both }));
      } else if (round <= 3) {
        w = succeeded(step(w, { wren: LEARN }));
        bare = step(bare).world;
      } else {
        const action = cycle[tended++ % cycle.length] ?? WAIT;
        if (action.args.target === ROOT)
          if (action.args.mode === 'inspect') inspected += 1;
          else assessed += 1;
        w = ok(step(w, { wren: action }));
        bare = step(bare).world;
      }
      if (round === 0)
        start = {
          acorn: Number(object(w, ACORN).data.growth ?? 0),
          root: Number(object(w, ROOT).data.growth ?? 0),
        };
      // Tended or not, every object (plants, animals, everything) is byte-identical.
      expect(v7Signature(w.objects)).toBe(v7Signature(bare.objects));
      // No plant ever grows faster than the evaluator's ceiling, which inspection publishes.
      for (const o of growing(w)) {
        const old = before.get(o.id);
        const growth = Number(o.data.growth ?? 0);
        if (old && growth >= old.growth && Number(o.data.stock) === old.stock)
          expect(growth - old.growth).toBeLessThanOrEqual(ceiling + 1e-9);
      }
    }
    expect(tended).toBeGreaterThanOrEqual(100);
    expect(actor(w).vitals.health).toBe(100);
    // Both tended plants actually grew under the existing rule.
    expect(Number(object(w, ACORN).data.growth)).toBeGreaterThan(start.acorn);
    expect(
      Number(object(w, ROOT).data.growth) +
        Number(object(w, ROOT).data.interval) *
          Number(object(w, ROOT).data.stock),
    ).toBeGreaterThan(start.root);
    // The record holds the observed change since its baseline, from probe's values.
    const root = records(w).find((p) => p.plant === ROOT);
    expect(root).toMatchObject({
      inspections: inspected,
      assessments: assessed,
      status: 'open',
    });
    const baseline = root?.baseline as Data | undefined;
    const latest = root?.latest as Data | undefined;
    expect(Number(latest?.tick)).toBeGreaterThan(Number(baseline?.tick));
    // The daylight ceiling holds over a whole year of rounds.
    const year = v7Clone(w);
    for (let t = 0; t < 800; t++) {
      year.time = t;
      expect(
        forestClimate(year, object(year, ROOT).spatial).light,
      ).toBeLessThanOrEqual(LIGHT_CEILING + 1e-12);
    }
  });

  it('never harvests or refills: stock changes only through gather at its own cost', () => {
    let w = place(learned(), BOTH),
      idle = v7Clone(w);
    for (const mode of ['inspect', 'prepare', 'maintain']) {
      w = ok(step(w, { wren: tend(mode, { target: ROOT }) }));
      idle = step(idle).world;
      expect(object(w, ROOT).data.stock).toBe(4);
      expect(w.stacks).toEqual(idle.stacks);
    }
    const energy = actor(w).vitals.energy;
    const r = step(w, {
      wren: { interface: 'gather', args: { target: ROOT, quantity: 1 } },
    });
    w = ok(r);
    expect(object(w, ROOT).data.stock).toBe(3);
    expect(
      w.events.some((e) => e.type === 'gathered' && e.actor === 'wren'),
    ).toBe(true);
    expect(
      w.stacks.filter((s) => s.owner === 'wren' && s.origin === ROOT),
    ).toEqual([expect.objectContaining({ resource: 'root', quantity: 1 })]);
    // gather's own cost: 2 energy per unit (the idle world shows the ordinary round drift).
    const drift =
      actor(step(v7Clone(idle)).world).vitals.energy -
      actor(idle).vitals.energy;
    expect(actor(w).vitals.energy).toBeCloseTo(energy - 2 + drift, 6);
    // Inspection afterwards finds 3 and adds nothing.
    w = ok(step(w, { wren: tend('inspect', { target: ROOT }) }));
    expect(object(w, ROOT).data.stock).toBe(3);
    expect(contractOf(mine(w)[0]).stock).toBe(3);
    expect(mine(w)[0]?.description).toContain('units were taken');
  });

  it('leaves nothing pending: another action pauses no work, a repeated call rechecks reach and eligibility, cancel closes records and death closes them without touching plants', () => {
    let w = place(learned(), BOTH);
    w = ok(step(w, { wren: tend('prepare', { target: ROOT, quantity: 3 }) }));
    const first = records(w)[0];
    // Another action takes the next round: no work was started, so nothing pauses.
    w = succeeded(
      step(w, {
        wren: {
          interface: 'navigate',
          args: { target: '', x: START.x, y: START.y },
        },
      }),
    );
    expect(
      w.events.filter((e) => e.actor === 'wren' && e.type.startsWith(`${id}-`)),
    ).toEqual([]);
    expect(
      Object.keys(
        (longOrdinaryInput(w, 'wren').packet.execution as { activeState: Data })
          .activeState,
      ),
    ).toEqual([]);
    // A later call rechecks reach before anything else, at no cost.
    expect(v7Reach(actor(w), object(w, ROOT).spatial)).toBe(false);
    refused(
      step(w, { wren: tend('prepare', { target: ROOT }) }),
      /not within your reach/,
    );
    w = place(w, BOTH);
    w = ok(step(w, { wren: tend('prepare', { target: ROOT }) }));
    expect(records(w)).toEqual([
      expect.objectContaining({
        patch: first?.patch,
        assessments: 2,
        status: 'open',
      }),
    ]);
    // Cancel closes one record; nothing is undone and the plant keeps growing.
    w = ok(step(w, { wren: tend('inspect', { target: ACORN }) }));
    const plantBefore = v7Clone(object(w, ROOT));
    w = ok(step(w, { wren: tend('cancel', { target: ROOT }) }));
    expect(mine(w)[0]).toMatchObject({
      type: `${id}-cancelled`,
      data: { closed: [first?.patch] },
    });
    expect(records(w)).toEqual([
      expect.objectContaining({
        plant: ROOT,
        status: 'closed',
        cause: 'cancelled',
      }),
      expect.objectContaining({ plant: ACORN, status: 'open' }),
    ]);
    expect(Number(object(w, ROOT).data.growth)).toBeGreaterThanOrEqual(
      Number(plantBefore.data.growth),
    );
    refused(
      step(w, { wren: tend('cancel', { target: ROOT }) }),
      /^You keep no open patch record for commons-root-4-0\. Nothing was spent\.$/,
    );
    // A new call on that plant opens a new record with a new identity.
    w = ok(step(w, { wren: tend('maintain', { target: ROOT }) }));
    const reopened = records(w).find(
      (p) => p.plant === ROOT && p.status === 'open',
    );
    expect(reopened?.patch).not.toBe(first?.patch);
    // Death closes the open records; the plants, soil and items stay as without any record.
    const control = v7Clone(w);
    actor(control).extensionState = Object.fromEntries(
      Object.entries(actor(control).extensionState).filter(
        ([key]) => key !== PATCHES,
      ),
    );
    for (const x of [w, control]) {
      actor(x).vitals.health = 0.5;
      actor(x).vitals.satiety = 0;
    }
    w = step(w).world;
    const after = step(control).world;
    const types = w.events.filter((e) => e.actor === 'wren').map((e) => e.type);
    expect(types).toContain('died');
    expect(types).toContain(`${id}-ended`);
    expect(types).toContain('respawned');
    expect(records(w).every((p) => p.status === 'closed')).toBe(true);
    expect(records(w).filter((p) => p.cause === 'death')).toHaveLength(2);
    expect(v7Signature(w.objects)).toBe(v7Signature(after.objects));
    expect(v7Signature(w.stacks)).toBe(v7Signature(after.stacks));
    // Nothing continues after respawn.
    refused(
      step(w, { wren: tend('cancel') }),
      /^You keep no open patch record\. Nothing was spent\.$/,
    );
  });

  it('keeps at most 8 patch records, dropping the oldest', () => {
    let w = learned();
    const plants = [
      ACORN,
      ROOT,
      'commons-berry-4-0',
      'start-3-roots',
      'forest-hazelnut-4',
      'start-4-nuts',
      'forest-berry-4',
      'commons-root-3-0',
      'start-4-berries',
    ];
    for (const p of plants) {
      const o = object(w, p);
      w = place(w, { x: o.spatial.x - 0.6, y: o.spatial.y });
      w = ok(step(w, { wren: tend('prepare', { target: p }) }));
    }
    expect(records(w).map((p) => p.plant)).toEqual(plants.slice(1));
    expect(mine(w)[0]?.data.dropped).toMatch(
      new RegExp(`^patch-wren-${ACORN}-`),
    );
  });

  it('counts each round as probe by hand counts for routine and experience, with no satisfaction, practice milestone or progress credit', () => {
    let viaTend = place(learned(), BOTH),
      byHand = v7Clone(viaTend),
      assessing = v7Clone(viaTend);
    // Long enough after study that rounds can count as routine.
    for (let i = 0; i < 17; i++) {
      viaTend = step(viaTend).world;
      byHand = step(byHand).world;
      assessing = step(assessing).world;
    }
    for (let round = 0; round < 6; round++) {
      viaTend = ok(step(viaTend, { wren: tend('inspect', { target: ACORN }) }));
      byHand = ok(step(byHand, { wren: probe(ACORN) }));
      assessing = ok(
        step(assessing, { wren: tend('prepare', { target: ROOT }) }),
      );
      for (const x of [viaTend, assessing])
        expect(
          x.events.filter(
            (e) =>
              e.actor === 'wren' &&
              [
                'satisfaction',
                'practice-confirmed',
                'information-confirmed',
              ].includes(e.type),
          ),
        ).toEqual([]);
    }
    const a = actor(viaTend),
      b = actor(byHand),
      c = actor(assessing);
    for (const key of [
      'open:routine',
      'open:routineBurden',
      'long:lastProgress',
    ]) {
      expect(a.extensionState[key]).toEqual(b.extensionState[key]);
      expect(c.extensionState[key]).toEqual(b.extensionState[key]);
    }
    // The last six rounds are routine, as six probe rounds are.
    const routine = b.extensionState['open:routine'] as boolean[];
    expect(routine.slice(-6)).toEqual([true, true, true, true, true, true]);
    expect(a.vitals).toEqual(b.vitals);
    expect(a.wellbeing).toEqual(b.wellbeing);
    // The experience record names the interface of each round; otherwise it is identical.
    const named = (x: V7Actor) =>
      JSON.parse(
        JSON.stringify(x.experience).replaceAll(
          `"action":"${id}"`,
          '"action":"probe"',
        ),
      ) as unknown;
    expect(named(a)).toEqual(named(b));
    expect(JSON.stringify(c.experience)).toContain(`"action":"${id}"`);
    expect(
      Object.keys(a.extensionState).filter((k) =>
        k.startsWith('open:practice'),
      ),
    ).toEqual([]);
    // The same observation is retained, as by hand.
    const key = `${ACORN}:observed-state`;
    expect(a.memory.knowledge?.[key]?.value).toEqual(
      b.memory.knowledge?.[key]?.value,
    );
  });

  it('shows no excluded word in anything a person sees of it', () => {
    let w = place(learned(), BOTH);
    const texts: unknown[] = [];
    const keep = (r: Round) => {
      const world = r.world;
      texts.push(
        world.events.filter((e) => e.actor === 'wren'),
        records(world),
        longOrdinaryInput(world, 'wren').packet.execution,
      );
      return world;
    };
    for (const action of [
      tend('inspect', { target: ROOT }),
      tend('prepare', { target: ROOT, quantity: 2 }),
      tend('maintain', { target: ACORN }),
      tend('inspect', { target: 'start-3-branches' }),
      tend('inspect', { target: 'commons-berry-4-0' }),
      tend('cancel', { target: ROOT }),
      tend('cancel'),
      tend('cancel'),
    ])
      w = keep(step(w, { wren: action }));
    actor(w).vitals.health = 0.5;
    actor(w).vitals.satiety = 0;
    w = keep(
      step(place(w, BOTH), { wren: tend('inspect', { target: ACORN }) }),
    );
    const input = longOrdinaryInput(w, 'wren');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${id}-inspected`);
    expect(text).toContain(`${id}-assessed`);
    expect(text).toContain(`${id}-cancelled`);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
  });
});
