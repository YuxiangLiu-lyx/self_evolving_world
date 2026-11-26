import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'thermal-food-preparation';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Kai's actual ex18 root source: the commons root patch Kai's two roots came from. */
const SOURCE = 'commons-root-1-0';
/** A branch like Kai's ex18 item-24-kai-281: owned, 0.8 units, recorded at a stale position. */
const BRANCH = 'kai-branch';

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
const actor = (w: V7World, name = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack | undefined =>
  w.stacks.find((s) => s.id === item);
/** Every unit of a resource held as a stack anywhere. */
const units = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const assess = (
  unit: string,
  extra: Record<string, string | number | string[]> = {},
): V7Action => ({
  interface: id,
  args: { mode: 'assess', inputStackId: unit, ...extra },
});
const heat = (extra: Record<string, string | number> = {}): V7Action => ({
  interface: id,
  args: { mode: 'heat', ...extra },
});
/** Keep everyone fed and rested so the tests isolate the assessment from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex18', 'long-culture-v2-incentives');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}

/** Kai gathers two real roots from the commons patch, as in ex18, holds a branch like Kai's and
 * berries, and studies for three rounds. */
function setup(study = true) {
  let w = installed();
  const from = w.objects.find((o) => o.id === SOURCE);
  if (!from) throw new Error('Missing fixture source.');
  actor(w).position = { x: from.spatial.x, y: from.spatial.y + 0.6 };
  w = step(w, {
    kai: { interface: 'gather', args: { target: SOURCE, quantity: 2 } },
  }).world;
  const roots = w.stacks.find((s) => s.owner === 'kai' && s.origin === SOURCE);
  if (!roots) throw new Error('Missing actually gathered fixture roots.');
  w.stacks.push(
    {
      id: BRANCH,
      resource: 'branch',
      quantity: 0.8,
      quantityTenths: 8,
      position: { x: 11.4, y: 18.25 },
      owner: 'kai',
      origin: 'canopy-41',
    },
    {
      id: 'kai-berries',
      resource: 'berry',
      quantity: 2,
      quantityTenths: 20,
      position: { ...actor(w).position },
      owner: 'kai',
      origin: 'commons-berry-1-1',
      decay: 9,
    },
  );
  if (study) {
    w = step(w, { kai: { interface: 'learn', args: { ability: id } } }).world;
    w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return { w: fed(w), roots: roots.id };
}
/** The action fails and changes no vitals, stacks, objects or records compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'kai') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(actor(result.world, who).memory.knowledge).toEqual(
    actor(idle, who).memory.knowledge,
  );
  expect(events(result.world, 'thermal-feasibility-assessed')).toHaveLength(0);
  return result.outcomes[who]?.reason ?? '';
}

describe('thermal food preparation in ex18', () => {
  it('is scoped to ex18, fits the frozen text limit, adds no reward source, keeps the reused package byte-identical and needs three rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex16', 'long-culture-v2'],
      ['long-ex17', 'long-culture-v3'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers['long.thermal-food-preparation']).toBeDefined();
    expect(all.handlers['long.unheated-food-preparation']).toBeDefined();
    // The reused ex18 unheated package serializes exactly as before this handoff.
    const unheated = all.packages.find(
      (p) => p.id === 'unheated-food-preparation',
    );
    expect(
      createHash('sha256').update(JSON.stringify(unheated)).digest('hex'),
    ).toBe('b6e6735b336b500e95346abe49e7f5e8107ea26695cabbb02abcd4dc1ed7259f');
    const f = setup(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['assess', 'heat'],
    });
    expect(ability?.references).toEqual({
      inputStackId: 'optional-exact-visible',
    });
    expect(ability?.practiceEvidence).toBe('thermal-feasibility-assessed');
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex18');
    expect(pkg?.abilities).toHaveLength(1);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    // No object is made, so no drawing is needed, and no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(f.w.config.longDevelopment?.culture?.incentives).toBe(true);
    // Unstudied use is refused without any cost.
    unchanged(f.w, assess(f.roots));
  });

  it('assesses owned roots in one round for 0.2 energy, consuming, moving and reserving nothing', () => {
    const { w, roots } = setup();
    const control = step(w).world;
    const result = step(w, { kai: assess(roots, { quantity: 2 }) });
    expect(result.outcomes.kai?.success).toBe(true);
    const after = result.world;
    // The real cost: one round and exactly 0.2 energy above an idle round.
    expect(
      actor(control).vitals.energy - actor(after).vitals.energy,
    ).toBeCloseTo(0.2, 6);
    expect(actor(after).vitals.satiety).toBe(actor(control).vitals.satiety);
    // Conservation: every stack, including the roots' quantity, origin and ageing, is unchanged.
    expect(v7Signature(after.stacks)).toBe(v7Signature(control.stacks));
    expect(v7Signature(after.objects)).toBe(v7Signature(control.objects));
    for (const r of ['root', 'berry', 'branch'])
      expect(units(after, r)).toBe(units(w, r));
    expect(stack(after, roots)).toMatchObject({
      quantity: 2,
      owner: 'kai',
      origin: SOURCE,
    });
    expect(stack(after, roots)?.decay).toBe(stack(control, roots)?.decay);
    expect(stack(after, roots)?.processing).toBeUndefined();
    expect(after.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    // The observable event and the real effect: an unverified personal record.
    expect(events(after, 'thermal-feasibility-assessed')).toHaveLength(1);
    const value = data(after, 'thermal-feasibility-assessed');
    expect(value).toMatchObject({
      input: roots,
      quantity: 2,
      heatSource: null,
      reachableHeatSources: [],
      apparatus: [],
      evidence: null,
      processingRule: null,
      localWater: false,
      missing: ['heat-source', 'exposure-support', 'heat-transfer'],
      unverified: [],
      absent: [],
      heating: { available: false },
      safety: 'unknown',
      tick: after.tick,
      display: {
        food: 'raw-unchanged',
        heating: 'dependency-blocked',
        indicator: 'missing-prerequisites',
      },
    });
    expect(value?.food).toMatchObject({
      item: roots,
      resource: 'root',
      quantity: 2,
      origin: SOURCE,
      visibleSpoilage: 'none seen',
      treatment: [],
      heated: false,
      cooked: false,
      edibility: 'not established',
      safety: 'unknown',
    });
    // Kai has never eaten roots, so there is no eating record to report.
    expect(value?.eatingRecord).toBeNull();
    expect(String(value?.assessmentId)).toMatch(/^thermal-assessment-/);
    expect(value?.position).toEqual(actor(after).position);
    const record =
      actor(after).memory.knowledge?.[`${roots}:thermal-feasibility`];
    expect(record).toMatchObject({ verified: false, subject: 'root' });
    expect(record?.evidence).toBe(events(after, 'trial-result').at(-1)?.id);
    expect(record?.value).toEqual(value);
    // Assessing confirms no information, earns no practice milestone and gives no reward.
    expect(events(after, 'information-confirmed')).toHaveLength(0);
    expect(events(after, 'practice-confirmed')).toHaveLength(0);
    expect(events(after, 'satisfaction')).toHaveLength(0);
    // Physical wellbeing follows the spent energy only; no source or mental gain is added.
    expect(actor(after).wellbeing.sources).toEqual(
      actor(control).wellbeing.sources,
    );
    expect(actor(after).wellbeing.mental).toBe(actor(control).wellbeing.mental);
    expect(actor(after).wellbeing.physical).toBeLessThan(
      actor(control).wellbeing.physical,
    );
    expect(actor(after).experience?.mental).toBe(
      actor(control).experience?.mental,
    );
    for (const a of after.actors.filter((a) => a.id !== 'kai'))
      expect(a.wellbeing).toEqual(actor(control, a.id).wellbeing);
    // Repeating costs the same again and still earns nothing.
    const again = step(fed(v7Clone(after)), { kai: assess(roots) });
    expect(again.outcomes.kai?.success).toBe(true);
    expect(data(again.world, 'thermal-feasibility-assessed')?.quantity).toBe(2);
    expect(events(again.world, 'practice-confirmed')).toHaveLength(0);
    expect(events(again.world, 'satisfaction')).toHaveLength(0);
  });

  it('reports supplied prerequisites as present with an unverified role or absent, and never treats a branch as heat', () => {
    const { w, roots } = setup();
    const here = actor(w).position;
    const far = w.objects.find(
      (o) =>
        o.kind === 'tree' &&
        Math.hypot(o.spatial.x - here.x, o.spatial.y - here.y) > 3,
    );
    if (!far) throw new Error('Missing far fixture object.');
    const first = step(w, { kai: assess(roots) }).world;
    const key = `${roots}:thermal-feasibility`;
    const result = step(fed(first), {
      kai: assess(roots, {
        quantity: 1.5,
        sourceId: BRANCH,
        apparatusIds: [SOURCE, 'kai-berries', 'no-such-item', far.id],
        evidenceKey: key,
      }),
    });
    expect(result.outcomes.kai?.success).toBe(true);
    const value = data(result.world, 'thermal-feasibility-assessed');
    expect(value?.quantity).toBe(1.5);
    // The branch is Kai's carried item, but no item is a represented heat source.
    expect(value?.heatSource).toEqual({
      id: BRANCH,
      status: 'present; no represented heat',
      kind: 'item',
      resource: 'branch',
      quantity: 0.8,
      carried: true,
      reserved: false,
      heatSource: false,
    });
    expect(value?.apparatus).toEqual([
      {
        id: SOURCE,
        status: 'present; role unverified',
        kind: 'object',
        type: 'plant',
        heatSource: false,
      },
      expect.objectContaining({
        id: 'kai-berries',
        status: 'present; role unverified',
        kind: 'item',
      }),
      { id: 'no-such-item', status: 'absent from your items and reach' },
      { id: far.id, status: 'absent from your items and reach' },
    ]);
    expect(value?.unverified).toEqual([SOURCE, 'kai-berries']);
    expect(value?.absent).toEqual(['no-such-item', far.id]);
    // A present support whose role is unverified is not reported as missing; heat still is.
    expect(value?.missing).toEqual(['heat-source', 'heat-transfer']);
    expect(value?.evidence).toEqual({
      key,
      status: 'present',
      subject: 'root',
      property: 'thermal preparation feasibility',
      verified: false,
    });
    const absentKey = step(fed(first), {
      kai: assess(roots, { evidenceKey: 'no-such-record' }),
    }).world;
    expect(data(absentKey, 'thermal-feasibility-assessed')?.evidence).toEqual({
      key: 'no-such-record',
      status: 'absent from your records',
    });
    // Nothing supplied was used, moved or reserved.
    expect(stack(result.world, BRANCH)).toMatchObject({
      quantity: 0.8,
      position: { x: 11.4, y: 18.25 },
    });
    expect(result.world.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(units(result.world, 'branch')).toBe(units(w, 'branch'));
    expect(units(result.world, 'berry')).toBe(units(w, 'berry'));
  });

  it('reports existing treatment records without treating dry brushing as heating', () => {
    const { w, roots } = setup();
    const brushed = stack(w, roots);
    if (brushed)
      brushed.processing = {
        unheatedPreparation: { raw: true, heated: false, safety: 'unknown' },
      };
    const result = step(w, { kai: assess(roots) });
    expect(result.outcomes.kai?.success).toBe(true);
    const value = data(result.world, 'thermal-feasibility-assessed');
    expect(value?.food).toMatchObject({
      treatment: ['unheatedPreparation'],
      heated: false,
      cooked: false,
      safety: 'unknown',
    });
    expect(value?.missing).toContain('heat-source');
    expect(stack(result.world, roots)?.processing).toEqual(brushed?.processing);
  });

  it('reports an object with available heat under the probe heat rule, and still refuses heating at no cost', () => {
    const { w, roots } = setup();
    // A reachable object without available heat is no source.
    const cold = step(w, { kai: assess(roots, { sourceId: SOURCE }) }).world;
    expect(data(cold, 'thermal-feasibility-assessed')?.heatSource).toEqual({
      id: SOURCE,
      status: 'present; no represented heat',
      kind: 'object',
      type: 'plant',
      heatSource: false,
    });
    const rock = w.objects.find((o) => o.kind === 'rock');
    if (!rock) throw new Error('Missing rock fixture.');
    const hot = v7Clone(rock);
    hot.id = 'test-heat-source';
    hot.spatial = {
      ...hot.spatial,
      x: actor(w).position.x + 0.9,
      y: actor(w).position.y,
    };
    hot.data = { ...hot.data, availableHeat: 1 };
    w.objects.push(hot);
    const seen = step(w, {
      kai: assess(roots, { sourceId: hot.id }),
    }).world;
    const value = data(seen, 'thermal-feasibility-assessed');
    expect(value?.reachableHeatSources).toEqual([hot.id]);
    expect(value?.heatSource).toMatchObject({
      id: hot.id,
      status: 'present; represented heat',
      heatSource: true,
    });
    expect(value?.missing).toEqual(['exposure-support', 'heat-transfer']);
    expect(value?.heating).toMatchObject({ available: false });
    // Assessing reads the source without drawing on its heat.
    expect(seen.objects.find((o) => o.id === hot.id)?.data.availableHeat).toBe(
      1,
    );
    // Heating has no represented transfer into food, so it is refused before any cost.
    const reason = unchanged(
      w,
      heat({ inputStackId: roots, quantity: 2, sourceId: hot.id }),
    );
    expect(reason).toMatch(/Heating is not available/);
    expect(reason).toMatch(/Nothing was spent/);
  });

  it('refuses heating and invalid assessments without spending anything', () => {
    const { w, roots } = setup();
    // The thermal mode is refused before any cost, with or without arguments.
    expect(unchanged(w, heat({ inputStackId: roots, quantity: 2 }))).toMatch(
      /no usable heat source, no heat transfer into food/,
    );
    expect(unchanged(w, heat())).toMatch(/Heating is not available/);
    // The refusal is observable as the kernel's failed event naming the missing dependency.
    const refused = step(w, { kai: heat({ inputStackId: roots }) }).world;
    expect(
      events(refused, 'failed').find((e) => e.actor === 'kai'),
    ).toMatchObject({
      interface: id,
      success: false,
      description: expect.stringMatching(/no usable heat source/) as unknown,
    });
    // Exact owned item ids only: a resource name is not an identity.
    unchanged(w, assess('root'));
    unchanged(w, { interface: id, args: { mode: 'assess' } });
    expect(unchanged(w, assess(BRANCH))).toMatch(/not food/);
    expect(unchanged(w, assess(roots, { quantity: 3 }))).toMatch(
      /name a quantity/,
    );
    expect(unchanged(w, assess(roots, { quantity: 0.15 }))).toMatch(/tenths/);
    unchanged(w, assess(roots, { quantity: 0 }));
    unchanged(w, {
      interface: id,
      args: { mode: 'cook', inputStackId: roots },
    });
    expect(
      unchanged(w, assess(roots, { apparatusIds: ['a', 'b', 'c', 'd', 'e'] })),
    ).toMatch(/at most 4/);
    expect(unchanged(w, assess(roots, { sourceId: roots }))).toMatch(
      /appear once/,
    );
    expect(
      unchanged(w, assess(roots, { sourceId: BRANCH, apparatusIds: [BRANCH] })),
    ).toMatch(/appear once/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.1;
    expect(unchanged(tired, assess(roots))).toMatch(/0\.2 energy/);
    const theirs = v7Clone(w);
    const lent = stack(theirs, roots);
    if (lent) lent.owner = 'lin';
    unchanged(theirs, assess(roots));
    const reserved = v7Clone(w);
    const held = stack(reserved, roots);
    if (held) held.reservedFor = 'other-work';
    unchanged(reserved, assess(roots));
  });

  it('lets only the owner assess their food and keeps the record personal', () => {
    const { w, roots } = setup();
    const other = v7Clone(w);
    actor(other, 'lin').mastered.push(id);
    actor(other, 'lin').position = {
      x: actor(other).position.x + 0.75,
      y: actor(other).position.y,
    };
    // Lin stands within reach of Kai, but Kai's carried roots are not Lin's food.
    unchanged(other, assess(roots), 'lin');
    const done = step(other, { kai: assess(roots) }).world;
    expect(
      actor(done).memory.knowledge?.[`${roots}:thermal-feasibility`],
    ).toBeDefined();
    expect(
      actor(done, 'lin').memory.knowledge?.[`${roots}:thermal-feasibility`],
    ).toBeUndefined();
    expect(stack(done, roots)?.owner).toBe('kai');
  });
});
