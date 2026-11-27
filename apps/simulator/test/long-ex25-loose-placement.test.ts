import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Observe,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Event,
  V7Object,
  V7Package,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'position-loose-material';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const RECORDS = `${id}:records`;
const KIND = 'placed-loose-material';
const PREFIX = 'material-placement-';
const SOURCE = 'canopy-69';
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list itself. */
const EXTRA_EXCLUDED =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition|history|spiritual/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 131 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex25/hashes-before-2.json, taken before this change). */
const EXISTING_DIGEST =
  '9aeab29ab696ae82a428dc2881aec54b26abdd58127e119372db82b73d9383ba';
/** Sol stands beside the fallen branches of canopy-69; the site is clear, firm forest floor
 * 0.67 m away. Lin, 3.8 units from the site, watches; Moss is moved far out of sight. */
const BESIDE = { x: 13.75, y: 17 };
const SITE = { x: 13.3, y: 17.5, angle: 0.6 };
const FAR = { x: 17.5, y: 3.5 };
/** The ex21 declared rod of one 1.1 kg branch unit: 900 kg/m3, length 25 diameters. */
const DIAMETER = Math.cbrt((4 * (1.1 / 900)) / (Math.PI * 25));
const LENGTH = 25 * DIAMETER;

type Scenario = 'long-culture-v2' | 'long-culture-v2-incentives';
type Data = Record<string, unknown>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const placement = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
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
const actor = (w: V7World, who = 'sol'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const ok = (r: ReturnType<typeof step>, who = 'sol') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
/** A refusal by the kernel before the operation runs (mastery, reference resolution). */
const failed = (r: ReturnType<typeof step>, pattern: RegExp, who = 'sol') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  return r.world;
};
/** A refusal by the operation itself, before any cost. */
const refused = (r: ReturnType<typeof step>, pattern: RegExp, who = 'sol') => {
  failed(r, pattern, who);
  expect(r.outcomes[who]?.reason).toMatch(/Nothing was spent\.$/);
  return r.world;
};
const op = (args: V7Data): V7Action => ({ interface: id, args });
const place = (item: string, extra: V7Data = {}) =>
  op({ mode: 'place', target: item, ...SITE, ...extra });
const energy = (w: V7World, who = 'sol') => actor(w, who).vitals.energy;
const ours = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === `${PREFIX}${type}`);
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const last = (w: V7World) =>
  (actor(w).extensionState[RECORDS] as Data[] | undefined)?.at(-1);
const placedObjects = (w: V7World): V7Object[] =>
  w.objects.filter((o) => o.kind === KIND);
const branches = (w: V7World) =>
  w.stacks.filter((s) => s.resource === 'branch');
const total = (w: V7World) =>
  branches(w).reduce((n, s) => n + s.quantity, 0) +
  Number(w.objects.find((o) => o.id === SOURCE)?.data.stock ?? 0);
const installed = (scenario: Scenario = 'long-culture-v2') => {
  const g = initialLongWorld('long-ex25', scenario);
  const w = v7Clone(v7Install(g, continuousRegistry(g), REVISION));
  actor(w).position = { ...BESIDE };
  actor(w, 'moss').position = { ...FAR };
  return w;
};
/** Sol learns the operation in round 1 and gathers real branch units from canopy-69 in round 2. */
function prepared(scenario: Scenario = 'long-culture-v2', units = 1) {
  let w = ok(step(installed(scenario), { sol: LEARN }));
  w = ok(
    step(w, {
      sol: {
        interface: 'gather',
        args: { target: SOURCE, quantity: units },
      },
    }),
  );
  const item = w.stacks.find(
    (s) => s.owner === 'sol' && s.resource === 'branch',
  );
  if (!item) throw new Error('Missing gathered branch.');
  return { world: w, item: item.id };
}
/** Rounds 3 and 4: the two stages of placing the gathered unit at SITE. */
function placedWorld(scenario: Scenario = 'long-culture-v2') {
  const { world, item } = prepared(scenario);
  const w = ok(
    step(ok(step(world, { sol: place(item) })), { sol: place(item) }),
  );
  const object = placedObjects(w)[0];
  const ground = w.stacks.find((s) => s.id === object?.data.item);
  if (!object || !ground) throw new Error('Missing placed unit.');
  return { world: w, item, object, ground };
}

describe('positioning loose material in ex25', () => {
  it('is registered second for long-ex25 only, learned in one round, within the size limit, with new names, no excluded word, and every earlier package byte-identical', () => {
    const pkg = placement();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The second ex25 package; later ex25 packages follow it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex25')
        .slice(0, 2)
        .map((p) => p.id),
    ).toEqual(['vocal-music', id]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex25',
      dependencies: ['foundation-forest@1'],
      visualComponents: ['placed-rod'],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        'material-placement-inspected',
        'material-placement-paused',
        'material-placement-infeasible',
        'material-placement-completed',
        'material-placement-cancelled',
        'material-placement-checked',
        'material-placement-ended',
        'material-placement-removed',
      ],
    });
    // Its one drawing exists in the viewer.
    for (const c of pkg.visualComponents)
      expect(typeof CONTINUOUS_VISUALS[c]).toBe('function');
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      learningEnergy: 0.2,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: [],
      references: { target: 'optional-owned' },
      dependencies: { abilities: ['drop'], resources: [], knowledge: [] },
      practiceEvidence: 'material-placement-completed',
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'target',
      'quantity',
      'x',
      'y',
      'angle',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'place',
      'inspect-progress',
      'resume',
      'cancel',
    ]);
    // New package, ability, equivalence, handler, event and object names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^material-placement/);
      expect(p.visualComponents).not.toContain('placed-rod');
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
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
    // Every package registered before this one, by id@version, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(131);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // Only the current scope can install it.
    const other = initialLongWorld('long-ex24', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex25', 'long-culture-v2');
    const after = v7Install(before, continuousRegistry(before), REVISION);
    expect(v7Signature(after.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(after.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(after.stacks)).toBe(v7Signature(before.stacks));
    expect(after.processes).toEqual(before.processes);
  });

  it('is learned in one round at 0.2 energy; inspect takes one round and 0.2 energy, reports the represented rod and the site, and reserves nothing', () => {
    const base = installed();
    failed(
      step(base, { sol: op({ mode: 'inspect', target: 'resource:branch' }) }),
      /not mastered/,
    );
    const learned = ok(step(base, { sol: LEARN })),
      idle = step(base).world;
    expect(energy(idle) - energy(learned)).toBeCloseTo(0.2, 9);
    expect(actor(learned).mastered).toContain(id);
    expect(actor(learned).learning).toBeNull();

    const { world, item } = prepared();
    const twin = step(world).world;
    const inspected = ok(
      step(world, { sol: op({ mode: 'inspect', target: item, ...SITE }) }),
    );
    expect(energy(twin) - energy(inspected)).toBeCloseTo(0.2, 9);
    const report = ours(inspected, 'inspected')[0];
    expect(report).toMatchObject({
      actor: 'sol',
      interface: id,
      target: item,
      data: {
        work: expect.stringMatching(/^placement-3-sol-/) as unknown,
        status: 'inspected',
        stage: 'inspection',
        destination: { x: SITE.x, y: SITE.y },
        angle: SITE.angle,
        paidEnergy: 0.2,
        paidRounds: 1,
        findings: {
          item: { id: item, material: 'branch', quantity: 1, origin: SOURCE },
          shape: { known: true, kind: 'straight rod', mass: 1.1 },
          site: { ground: ['f', 'f', 'f', 'f', 'f'], firm: true, blockers: [] },
          unknown: [],
          unmet: [],
          placeable: true,
        },
        view: { component: 'placed-rod', provisional: true },
      },
    });
    const shape = (report?.data.findings as Data).shape as Data;
    expect(shape.length).toBeCloseTo(LENGTH, 6);
    expect(shape.diameter).toBeCloseTo(DIAMETER, 6);
    // Only a closed record is kept: no open work, reservation, object or moved material.
    expect(open(inspected)).toBeUndefined();
    expect(last(inspected)).toMatchObject({
      status: 'inspected',
      mode: 'inspect',
    });
    expect(v7Signature(inspected.stacks)).toBe(v7Signature(twin.stacks));
    expect(v7Signature(inspected.objects)).toBe(v7Signature(twin.objects));

    // Without a site, only the unit is inspected.
    const unitOnly = ok(
      step(world, { sol: op({ mode: 'inspect', target: item }) }),
    );
    expect(ours(unitOnly, 'inspected')[0]?.data).toMatchObject({
      status: 'inspected',
      destination: null,
      findings: { site: null, placeable: null },
    });
    refused(
      step(world, { sol: op({ mode: 'inspect', target: item, x: 13 }) }),
      /Give x, y and angle/,
    );
  });

  it('reports a shape it cannot establish as unknown after a paid inspection, and keeps placement unavailable for that unit at no cost', () => {
    const { world } = prepared();
    const w = v7Clone(world);
    for (const resource of ['stone', 'willow'])
      w.stacks.push({
        id: `fixture-${resource}`,
        resource,
        quantity: 1,
        quantityTenths: 10,
        position: { ...BESIDE },
        owner: 'sol',
        origin: 'fixture',
        harvestedAt: 0,
      });
    const twin = step(w).world;
    for (const [resource, pattern] of [
      ['stone', /no shape is represented for stone/],
      ['willow', /willow bends/],
    ] as const) {
      const target = `fixture-${resource}`;
      const r = ok(step(w, { sol: op({ mode: 'inspect', target, ...SITE }) }));
      expect(energy(twin) - energy(r)).toBeCloseTo(0.2, 9);
      const data = ours(r, 'inspected')[0]?.data;
      expect(data).toMatchObject({
        status: 'infeasible',
        findings: {
          shape: { known: false, length: null, diameter: null },
          placeable: false,
        },
      });
      expect(((data?.findings as Data).unknown as string[])[0]).toMatch(
        pattern,
      );
      const p = step(w, { sol: place(target) });
      refused(p, /Placement is unavailable for fixture-/);
      expect(energy(p.world)).toBe(energy(twin));
      expect(
        p.world.stacks.find((s) => s.id === target)?.reservedFor,
      ).toBeUndefined();
    }
  });

  it('places one carried unit in two rounds for 0.2 and 0.5 energy, moving that same unit through ordinary drop to the chosen point and angle', () => {
    const { world, item } = prepared();
    const first = step(world, { sol: place(item) });
    expect(first.outcomes.sol).toMatchObject({
      success: true,
      complete: false,
    });
    const w1 = first.world,
      t1 = step(world).world;
    expect(energy(t1) - energy(w1)).toBeCloseTo(0.2, 9);
    const work = open(w1);
    expect(work).toMatchObject({
      status: 'ready',
      stage: 'move-and-orient',
      item,
      unit: item,
      x: SITE.x,
      y: SITE.y,
      angle: SITE.angle,
      paidEnergy: 0.2,
      paidRounds: 1,
      output: null,
    });
    // Until the move the unit stays carried, owned, reserved and shown as active work.
    expect(w1.stacks.find((s) => s.id === item)).toMatchObject({
      owner: 'sol',
      quantity: 1,
      reservedFor: work?.id,
    });
    const input = longOrdinaryInput(w1, 'sol').packet as {
      execution: { activeState: Data; reserved: V7Stack[] };
    };
    expect(input.execution.activeState[OPEN]).toMatchObject({
      status: 'ready',
    });
    expect(input.execution.reserved.map((s) => s.id)).toEqual([item]);
    expect(placedObjects(w1)).toEqual([]);
    expect(ours(w1, 'inspected')[0]?.data.view).toMatchObject({
      provisional: true,
      status: 'ready',
    });
    // Nothing else may use the reserved unit meanwhile.
    failed(
      step(w1, {
        sol: { interface: 'drop', args: { target: item, quantity: 1 } },
      }),
      /reserved|ongoing work/,
    );

    const w2 = ok(step(w1, { sol: place(item) })),
      t2 = step(t1).world;
    expect(energy(t2) - energy(w2)).toBeCloseTo(0.7, 9);
    const dropped = w2.events.find(
      (e) => e.type === 'dropped' && e.actor === 'sol',
    );
    expect(dropped).toMatchObject({
      interface: id,
      target: item,
      data: { quantity: 1, resource: 'branch', recipient: null },
    });
    const groundId =
      typeof dropped?.data.item === 'string' ? dropped.data.item : '';
    expect(groundId).not.toBe(item);
    // Exactly the selected unit left the inventory: nothing carried, one ground unit, no copy.
    expect(branches(w2).filter((s) => s.owner === 'sol')).toEqual([]);
    expect(branches(w2)).toHaveLength(1);
    expect(total(w2)).toBe(total(t2));
    const ground = w2.stacks.find((s) => s.id === groundId);
    expect(ground).toMatchObject({
      owner: null,
      quantity: 1,
      resource: 'branch',
      origin: SOURCE,
      harvestedAt: 2,
      position: { x: SITE.x, y: SITE.y },
      processing: {
        groundPlacement: {
          x: SITE.x,
          y: SITE.y,
          angle: SITE.angle,
          from: item,
          by: 'sol',
          at: 4,
        },
      },
    });
    expect(ground?.reservedFor).toBeUndefined();
    const objects = placedObjects(w2);
    expect(objects).toHaveLength(1);
    const object = objects[0];
    expect(object).toMatchObject({
      name: 'Placed branch',
      spatial: {
        x: SITE.x,
        y: SITE.y,
        angle: SITE.angle,
        solid: false,
        reserved: true,
      },
      visual: { component: 'placed-rod', state: 'placed' },
      data: {
        item: groundId,
        from: item,
        material: 'branch',
        quantity: 1,
        origin: SOURCE,
        harvestedAt: 2,
        placedBy: 'sol',
        placedAt: 4,
        view: { status: 'placed', provisional: false },
      },
      createdBy: 'sol',
      revision: REVISION,
    });
    if (object?.spatial.shape.kind !== 'rectangle')
      throw new Error('Footprint.');
    expect(object.spatial.shape.width).toBeCloseTo(LENGTH, 6);
    expect(object.spatial.shape.height).toBeCloseTo(DIAMETER, 6);
    const completed = ours(w2, 'completed')[0];
    expect(completed).toMatchObject({
      actor: 'sol',
      target: object.id,
      position: { x: SITE.x, y: SITE.y },
      data: {
        status: 'completed',
        output: groundId,
        object: object.id,
        transform: { x: SITE.x, y: SITE.y, angle: SITE.angle },
        mapping: { carried: item, ground: groundId },
        provenance: { origin: SOURCE, harvestedAt: 2 },
        stageEnergy: 0.5,
        paidEnergy: 0.7,
        paidRounds: 2,
        drop: dropped?.id,
        view: { provisional: false, status: 'completed' },
      },
    });
    expect(open(w2)).toBeUndefined();
    expect(last(w2)).toMatchObject({
      status: 'completed',
      output: groundId,
      object: object.id,
      paidEnergy: 0.7,
      paidRounds: 2,
      stages: [
        { stage: 'inspection', energy: 0.2, outcome: 'ready' },
        { stage: 'move-and-orient', energy: 0.5, outcome: 'completed' },
      ],
    });
    // It persists: later rounds leave the unit, its transform and its record unchanged.
    const later = step(step(w2).world).world;
    expect(placedObjects(later)).toEqual(objects);
    expect(later.stacks.find((s) => s.id === groundId)).toEqual(ground);
  });

  it('shows the placed unit with its position and angle in a nearby person’s ordinary observation, and not to someone far away', () => {
    const { world, object, ground } = placedWorld();
    const seen = v7Observe(world, 'lin');
    expect(seen.objects.find((o) => o.id === object.id)).toMatchObject({
      spatial: { x: SITE.x, y: SITE.y, angle: SITE.angle },
      data: { item: ground.id, material: 'branch', placedBy: 'sol' },
    });
    expect(seen.stacks.find((s) => s.id === ground.id)).toMatchObject({
      position: { x: SITE.x, y: SITE.y },
      processing: { groundPlacement: { angle: SITE.angle } },
    });
    expect(seen.events.map((e) => e.type)).toContain(
      'material-placement-completed',
    );
    const packet = longOrdinaryInput(world, 'lin').packet as {
      observation: { ground: { records: { id: string; value?: V7Stack }[] } };
    };
    const record = packet.observation.ground.records.find(
      (r) => r.id === ground.id,
    );
    expect(record?.value?.processing?.groundPlacement).toMatchObject({
      x: SITE.x,
      y: SITE.y,
      angle: SITE.angle,
    });
    // Remembered as seen afterwards.
    expect(
      actor(world, 'lin').memory.objects.some((m) => m.object.id === object.id),
    ).toBe(true);
    const far = v7Observe(world, 'moss');
    expect(far.objects.some((o) => o.id === object.id)).toBe(false);
    expect(far.stacks.some((s) => s.id === ground.id)).toBe(false);
  });

  it('refuses for free a point beyond reach, a footprint that is not clear or leaves the world, wet ground, too little energy and other quantities', () => {
    const { world, item } = prepared();
    const idle = step(world).world;
    const at = (who: string, p: { x: number; y: number }) => {
      const w = v7Clone(world);
      actor(w, who).position = { ...p };
      return w;
    };
    const low = v7Clone(world);
    actor(low).vitals.energy = 0.1;
    const cases: [V7World, V7Data, RegExp][] = [
      [world, { x: SITE.x - 1 }, /beyond your 0\.87 m reach/],
      [world, { x: 14.15, y: 17.45, angle: 0 }, /not clear: canopy-69/],
      [world, { x: 13.75, y: 17.5, angle: Math.PI / 2 }, /your own body/],
      [at('lin', { x: SITE.x, y: SITE.y }), {}, /not clear: lin/],
      [
        at('sol', { x: 17.6, y: 17.5 }),
        { x: 18.2, y: 17.5, angle: Math.PI / 2 },
        /water, a wet bank or waterlogged/,
      ],
      [
        at('sol', { x: 0.6, y: 5 }),
        { x: 0.4, y: 5, angle: 0 },
        /leaves the world/,
      ],
      [low, {}, /Not enough energy/],
      [world, { quantity: 2 }, /One independently placed unit at a time/],
    ];
    for (const [w, args, pattern] of cases) {
      const r = step(w, { sol: place(item, args) });
      refused(r, pattern);
      expect(energy(r.world)).toBe(energy(w === world ? idle : step(w).world));
      expect(r.world.stacks.find((s) => s.id === item)).toMatchObject({
        owner: 'sol',
        quantity: 1,
      });
      expect(
        r.world.stacks.find((s) => s.id === item)?.reservedFor,
      ).toBeUndefined();
      expect(open(r.world)).toBeUndefined();
      expect(placedObjects(r.world)).toEqual([]);
      expect(r.world.events.filter((e) => e.type.startsWith(PREFIX))).toEqual(
        [],
      );
    }
  });

  it('sets exactly one unit apart from a larger stack, maps it one to one, and keeps separately placed units apart with their own transforms', () => {
    const { world, item } = prepared('long-culture-v2', 2);
    expect(world.stacks.find((s) => s.id === item)?.quantity).toBe(2);
    const w1 = ok(step(world, { sol: place(item) }));
    const work = open(w1);
    const unit = String(work?.unit);
    expect(unit).not.toBe(item);
    expect(w1.stacks.find((s) => s.id === item)).toMatchObject({
      owner: 'sol',
      quantity: 1,
    });
    expect(w1.stacks.find((s) => s.id === item)?.reservedFor).toBeUndefined();
    expect(w1.stacks.find((s) => s.id === unit)).toMatchObject({
      owner: 'sol',
      quantity: 1,
      origin: SOURCE,
      harvestedAt: 2,
      reservedFor: work?.id,
    });
    expect(total(w1)).toBe(total(world));
    const w2 = ok(step(w1, { sol: place(item) }));
    const first = placedObjects(w2)[0];
    expect(first?.data).toMatchObject({ from: unit });
    expect(ours(w2, 'completed')[0]?.data.mapping).toEqual({
      carried: unit,
      ground: first?.data.item,
    });
    expect(w2.stacks.find((s) => s.id === item)).toMatchObject({
      owner: 'sol',
      quantity: 1,
    });
    // The remaining unit cannot be laid across the first one.
    refused(step(w2, { sol: place(item) }), /not clear: placed-/);
    // Laid alongside it, the two stay separate items, each with its own transform.
    const beside = { x: 13.3, y: 17.6, angle: 0.6 };
    const w4 = ok(
      step(ok(step(w2, { sol: place(item, beside) })), {
        sol: place(item, beside),
      }),
    );
    const objects = placedObjects(w4);
    expect(
      objects.map((o) => [o.spatial.x, o.spatial.y, o.spatial.angle]),
    ).toEqual([
      [SITE.x, SITE.y, SITE.angle],
      [beside.x, beside.y, beside.angle],
    ]);
    const ground = branches(w4).filter((s) => s.owner === null);
    expect(ground.map((s) => [s.quantity, s.position])).toEqual([
      [1, { x: SITE.x, y: SITE.y }],
      [1, { x: beside.x, y: beside.y }],
    ]);
    expect(new Set(objects.map((o) => o.data.item))).toEqual(
      new Set(ground.map((s) => s.id)),
    );
    expect(branches(w4).filter((s) => s.owner === 'sol')).toEqual([]);
    expect(total(w4)).toBe(total(world));
  });

  it('pauses before the move without charge, resumes after fresh checks, reports progress for 0.2 energy, and cancels once for no energy', () => {
    const { world, item } = prepared();
    const w1 = ok(step(world, { sol: place(item) }));
    const t1 = step(world).world;
    // Lin stands on the footprint: the move round pauses and charges nothing.
    const blocked = v7Clone(w1);
    actor(blocked, 'lin').position = { x: SITE.x, y: SITE.y };
    const paused = ok(step(blocked, { sol: place(item) }));
    const t2 = step(t1).world;
    expect(energy(t2) - energy(paused)).toBeCloseTo(0.2, 9);
    expect(open(paused)).toMatchObject({ status: 'paused', paidEnergy: 0.2 });
    expect(String(open(paused)?.reason)).toMatch(/not clear: lin/);
    expect(ours(paused, 'paused')[0]?.data.view).toMatchObject({
      provisional: true,
      status: 'paused',
    });
    expect(paused.stacks.find((s) => s.id === item)).toMatchObject({
      owner: 'sol',
      reservedFor: open(paused)?.id,
    });
    expect(placedObjects(paused)).toEqual([]);
    expect(paused.events.some((e) => e.type === 'dropped')).toBe(false);
    // Resume refuses while Lin is still there, then moves the unit once Lin steps away.
    refused(step(paused, { sol: op({ mode: 'resume' }) }), /not clear: lin/);
    const cleared = v7Clone(paused);
    actor(cleared, 'lin').position = { x: 16.2, y: 15 };
    const resumed = ok(step(cleared, { sol: op({ mode: 'resume' }) }));
    expect(energy(step(t2).world) - energy(resumed)).toBeCloseTo(0.7, 9);
    expect(ours(resumed, 'completed')[0]?.data).toMatchObject({
      resumed: true,
      paidEnergy: 0.7,
    });
    expect(placedObjects(resumed)).toHaveLength(1);

    // Another action in the move round pauses it after the round.
    const waited = step(w1).world;
    expect(open(waited)).toMatchObject({ status: 'paused' });
    expect(ours(waited, 'paused')[0]?.description).toMatch(/another action/);
    // inspect-progress reports the existing work for 0.2 energy, with the live checks.
    const checked = ok(step(waited, { sol: op({ mode: 'inspect-progress' }) }));
    expect(energy(waited) - energy(checked)).toBeCloseTo(0.2, 9);
    expect(ours(checked, 'checked')[0]?.data).toMatchObject({
      status: 'paused',
      paidEnergy: 0.2,
      current: {
        unitCarried: true,
        unitReserved: true,
        materialChange: null,
        liveProblems: [],
        moveEnergy: 0.5,
      },
    });
    // Starting another placement is refused while this one is open.
    failed(
      step(checked, {
        sol: op({ mode: 'place', target: 'resource:branch', ...SITE }),
      }),
      /Reference reserved/,
    );
    const cancelled = ok(step(checked, { sol: op({ mode: 'cancel' }) }));
    expect(energy(cancelled)).toBe(energy(checked));
    expect(open(cancelled)).toBeUndefined();
    expect(last(cancelled)).toMatchObject({
      status: 'cancelled',
      paidEnergy: 0.2,
    });
    expect(ours(cancelled, 'cancelled')[0]?.data).toMatchObject({
      released: true,
    });
    expect(cancelled.stacks.find((s) => s.id === item)).toMatchObject({
      owner: 'sol',
      quantity: 1,
    });
    expect(
      cancelled.stacks.find((s) => s.id === item)?.reservedFor,
    ).toBeUndefined();
    refused(
      step(cancelled, { sol: op({ mode: 'cancel' }) }),
      /no open placement work/,
    );
    refused(
      step(cancelled, { sol: op({ mode: 'resume' }) }),
      /no open placement work/,
    );
    // The completed placement is reported only while it is in view.
    const checkedDone = ok(
      step(resumed, { sol: op({ mode: 'inspect-progress' }) }),
    );
    expect(ours(checkedDone, 'checked')[0]?.data).toMatchObject({
      status: 'completed',
      current: { inView: true, footprintPresent: true, itemOnGround: true },
    });
  });

  it('pauses for too little energy, ends the work when the unit changes, and ends it at death with the unit released once', () => {
    const { world, item } = prepared();
    const w1 = ok(step(world, { sol: place(item) }));
    // Too little energy for the move: a pause without charge.
    const tired = v7Clone(w1);
    actor(tired).vitals.energy = 0.3;
    const short = ok(step(tired, { sol: place(item) }));
    expect(energy(short)).toBeCloseTo(0.3, 9);
    expect(String(open(short)?.reason)).toMatch(/not enough energy/);
    // A materially changed unit needs a new paid inspection: the work ends, the unit is freed.
    const wet = v7Clone(w1);
    const unit = wet.stacks.find((s) => s.id === item);
    if (unit) unit.fuelMoisture = 0.4;
    const changed = ok(step(wet, { sol: place(item) }));
    expect(energy(changed)).toBe(energy(wet));
    expect(open(changed)).toBeUndefined();
    expect(last(changed)).toMatchObject({ status: 'infeasible' });
    expect(ours(changed, 'infeasible')[0]?.data).toMatchObject({
      released: true,
    });
    expect(
      changed.stacks.find((s) => s.id === item)?.reservedFor,
    ).toBeUndefined();
    expect(placedObjects(changed)).toEqual([]);
    // Death right after the paid inspection ends the work; the unit is handled once by death.
    const dying = v7Clone(world);
    actor(dying).vitals.health = 0.01;
    actor(dying).vitals.satiety = 0;
    const died = step(dying, { sol: place(item) }).world;
    expect(
      died.events.some((e) => e.type === 'died' && e.actor === 'sol'),
    ).toBe(true);
    expect(open(died)).toBeUndefined();
    expect(last(died)).toMatchObject({ status: 'ended' });
    expect(ours(died, 'ended')[0]?.data).toMatchObject({ released: true });
    const dropped = died.stacks.filter((s) => s.id === item);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.owner).toBeNull();
    expect(dropped[0]?.reservedFor).toBeUndefined();
    expect(placedObjects(died)).toEqual([]);
    expect(total(died)).toBe(total(world));
  });

  it('is recovered through ordinary pickup at its own cost, which ends the footprint record and clears the placement record from the taken item', () => {
    const { world, object, ground } = placedWorld();
    const twin = step(world).world;
    const picked = ok(
      step(world, {
        sol: { interface: 'pickup', args: { target: ground.id, quantity: 1 } },
      }),
    );
    expect(energy(twin) - energy(picked)).toBeCloseTo(1 + 0.2 * 1.1, 9);
    expect(placedObjects(picked)).toEqual([]);
    expect(ours(picked, 'removed')[0]).toMatchObject({
      actor: 'sol',
      target: object.id,
      position: { x: SITE.x, y: SITE.y },
      data: {
        object: object.id,
        item: ground.id,
        reason: 'it was picked up',
        by: 'sol',
      },
    });
    const carried = branches(picked);
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({
      owner: 'sol',
      quantity: 1,
      origin: SOURCE,
      harvestedAt: 2,
    });
    expect(carried[0]?.processing).toBeUndefined();
    expect(total(picked)).toBe(total(twin));
    // Lin, nearby, observes the change of the recorded footprint.
    expect(
      v7Observe(picked, 'lin').objects.some((o) => o.id === object.id),
    ).toBe(false);
  });

  it('never rewards placing: no satisfaction, mood, practice milestone, progress credit or made-work notice, with incentives off or on', () => {
    for (const scenario of [
      'long-culture-v2',
      'long-culture-v2-incentives',
    ] as const) {
      const { world, item } = prepared(scenario);
      let w = world,
        idle = world;
      const seen: V7Event[] = [];
      const script: Record<number, V7Action> = {
        3: op({ mode: 'inspect', target: item, ...SITE }),
        4: place(item),
        5: place(item),
        6: op({ mode: 'inspect-progress' }),
      };
      for (let round = 3; round <= 9; round++) {
        const action = script[round];
        w = ok(step(w, action ? { sol: action } : {}));
        idle = step(idle).world;
        seen.push(...w.events);
      }
      expect(placedObjects(w)).toHaveLength(1);
      expect(
        seen.filter((e) =>
          [
            'satisfaction',
            'satisfaction-maintained',
            'practice-confirmed',
            'work-noticed',
            'acknowledged',
            'reciprocated',
          ].includes(e.type),
        ),
      ).toEqual([]);
      for (const e of seen.filter(
        (e) => e.type.startsWith(PREFIX) || e.interface === id,
      )) {
        expect(e.data.qualified).toBeUndefined();
        for (const key of ['remaining', 'progress', 'elapsed'])
          expect(typeof e.data[key]).not.toBe('number');
      }
      for (const a of w.actors) {
        const b = actor(idle, a.id);
        expect(a.wellbeing.sources).toEqual(b.wellbeing.sources);
        expect(a.experience?.mental).toBe(b.experience?.mental);
        expect(a.experience?.pleasure).toBe(b.experience?.pleasure);
        expect(a.extensionState['long:lastProgress']).toBe(
          b.extensionState['long:lastProgress'],
        );
        expect(
          Object.keys(a.extensionState).filter((k) =>
            k.startsWith('open:practice:'),
          ),
        ).toEqual([]);
      }
      expect(actor(w).wellbeing.physical).toBeLessThanOrEqual(10);
      // Lin and others saw the placed unit for several rounds; it is never counted as made work.
      const noticed = (w.state['expression:noticed'] ?? {}) as Data;
      expect(Object.keys(noticed)).not.toContain(placedObjects(w)[0]?.id);
      expect(
        w.satisfaction.find((r) => r.id === `practice:${id}`),
      ).toMatchObject({
        event: 'practice-confirmed',
        interface: id,
      });
      if (scenario !== 'long-culture-v2-incentives') continue;
      // Control: the same record under any other kind would be noticed as Sol's made work.
      const control = v7Clone(w);
      const record = placedObjects(control)[0];
      if (record) record.kind = 'fixture-made';
      expect(
        step(control)
          .world.events.filter((e) => e.type === 'work-noticed')
          .map((e) => e.actor),
      ).toContain('sol');
    }
  });

  it('keeps every agent-visible text it adds clear of the excluded vocabulary', () => {
    const { world, item } = prepared('long-culture-v2', 2);
    let w = world;
    const seen: V7Event[] = [];
    const script: Record<number, V7Action> = {
      3: op({ mode: 'inspect', target: item, ...SITE }),
      4: place(item),
      5: WAIT,
      6: op({ mode: 'inspect-progress' }),
      7: op({ mode: 'resume' }),
      8: place(item, { x: 13.3, y: 17.6 }),
      9: op({ mode: 'cancel' }),
      10: op({ mode: 'inspect', target: item, x: 14.15, y: 17.45, angle: 0 }),
    };
    for (let round = 3; round <= 10; round++) {
      const action = script[round];
      w = step(w, action ? { sol: action } : {}).world;
      seen.push(
        ...w.events.filter(
          (e) => e.type.startsWith(PREFIX) || e.interface === id,
        ),
      );
      if (round === 8) {
        const text = JSON.stringify(longOrdinaryInput(w, 'sol'));
        expect(text).toContain(OPEN);
        expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
        expect(text).not.toMatch(EXTRA_EXCLUDED);
      }
    }
    const held = placedObjects(w)[0]?.data.item;
    const placedGround = typeof held === 'string' ? held : '';
    w = ok(
      step(w, {
        sol: {
          interface: 'pickup',
          args: { target: placedGround, quantity: 1 },
        },
      }),
    );
    seen.push(...ours(w, 'removed'));
    expect(new Set(seen.map((e) => e.type))).toEqual(
      new Set([
        'material-placement-inspected',
        'material-placement-paused',
        'material-placement-checked',
        'material-placement-completed',
        'material-placement-cancelled',
        'material-placement-removed',
        'dropped',
      ]),
    );
    const text = JSON.stringify(seen);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    for (const who of ['sol', 'lin']) {
      const input = JSON.stringify(longOrdinaryInput(w, who));
      expect(input).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(input).not.toMatch(EXTRA_EXCLUDED);
    }
    expect(JSON.stringify(actor(w).extensionState[RECORDS])).not.toMatch(
      EXTRA_EXCLUDED,
    );
  });
});
