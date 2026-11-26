import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7ShapeDistance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'mechanical-food-handling';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** A natural solid rock (stone, hardness 8, flexibility 0) used as the support. */
const ROCK = 'start-1-stone';

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
const act = (mode: string, extra: V7Action['args'] = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const own = (w: V7World, resource: string, who = 'sol'): V7Stack => {
  const s = w.stacks.find(
    (s) => s.owner === who && s.resource === resource && !s.reservedFor,
  );
  if (!s) throw new Error(`Missing owned ${resource}.`);
  return s;
};
const total = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + s.quantity, 0);
const handling = (s: V7Stack | undefined) =>
  s?.processing?.foodHandling as V7Data | undefined;
const job = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(
      ([, v]) =>
        v as {
          id: string;
          status: string;
          escrow: string[];
          outputs: string[];
          paidEnergy: number;
          implement: string | null;
        },
    )
    .at(-1);
/** The unit reserved by unfinished work. */
const reserved = (w: V7World) => {
  const j = job(w);
  return w.stacks.find((s) => s.id === j?.escrow[0] && s.reservedFor === j.id);
};
const observation = (w: V7World) =>
  events(w, 'food-handling-examined')[0]?.data.observation as
    V7Data | undefined;
/** Keep everyone fed and rested so the tests isolate handling from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who = 'sol') {
  for (let k = 0; k < 16; k++) {
    const p = {
      x: x + d * Math.cos((k * Math.PI) / 8),
      y: y + d * Math.sin((k * Math.PI) / 8),
    };
    if (
      w.objects.every(
        (o) => !o.spatial.solid || v7ShapeDistance(p, o.spatial) > 0.25,
      ) &&
      w.actors.every((a) => a.id === who || v7Distance(a.position, p) > 0.5)
    )
      return p;
  }
  throw new Error('No free fixture position.');
}
/** Stand within reach of an object (shape distance 0.45 m). */
function near(w: V7World, object: string, who = 'sol') {
  const o = w.objects.find((x) => x.id === object);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w, who).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, who);
  return w;
}
function gather(w: V7World, source: string, quantity: number) {
  near(w, source);
  const result = step(w, {
    sol: { interface: 'gather', args: { target: source, quantity } },
  });
  expect(result.outcomes.sol?.success).toBe(true);
  return fed(result.world);
}

let cache: V7World | null = null;
/** Sol and Lin study; Sol gathers a hazelnut, two roots, a stone, oak and a branch and stands
 * beside the rock. */
function ready(): V7World {
  if (!cache) {
    const genesis = initialLongWorld('long-ex17', 'long-culture-v3');
    let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
    const learn: V7Action = { interface: 'learn', args: { ability: id } };
    w = step(w, { sol: learn, lin: learn }).world;
    w = gather(fed(w), 'start-1-nuts', 1);
    w = gather(w, 'commons-root-5-1', 2);
    w = gather(w, ROCK, 1);
    w = gather(w, 'forest-oak-0', 1);
    w = gather(w, 'start-1-branches', 1);
    cache = fed(near(w, ROCK));
  }
  return v7Clone(cache);
}
const strike = (w: V7World, tool: string, extra: V7Action['args'] = {}) =>
  act('open', {
    inputStackId: own(w, 'hazelnut').id,
    toolIds: [own(w, tool).id],
    supportTargetId: ROCK,
    ...extra,
  });
/** A blocked attempt succeeds as a report but changes nothing compared with waiting. */
function blocked(w: V7World, action: V7Action) {
  const result = step(w, { sol: action }),
    idle = step(w).world;
  expect(result.outcomes.sol?.success).toBe(true);
  const report = events(result.world, 'food-handling-blocked');
  expect(report).toHaveLength(1);
  expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(job(result.world)?.id).toBe(job(w)?.id);
  expect(report[0]?.data.energy).toBe(0);
  return (report[0]?.data.reasons as string[]).join(' ');
}
/** The action fails and changes no vitals or stacks compared with waiting. */
function refused(w: V7World, action: V7Action, who = 'sol') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  return result.outcomes[who]?.reason ?? '';
}

describe('mechanical food handling in ex17', () => {
  it('is scoped to ex17, fits the frozen text limit, avoids the excluded vocabulary and needs one round of study', () => {
    const ex16 = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(continuousRegistry(ex16).packages.some((p) => p.id === id)).toBe(
      false,
    );
    expect(
      continuousRegistry().handlers['long.mechanical-food-handling'],
    ).toBeDefined();
    const genesis = initialLongWorld('long-ex17', 'long-culture-v3');
    const w = v7Clone(
      v7Install(genesis, continuousRegistry(genesis), `${id}@1`),
    );
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(1);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['examine', 'open', 'cancel'],
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(pkg?.abilities).toHaveLength(1);
    expect(pkg?.visualComponents).toEqual([]);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    // Installation grants no implement, food, record or mastery.
    expect(v7Signature(w.stacks)).toBe(v7Signature(genesis.stacks));
    expect(v7Signature(w.objects)).toBe(v7Signature(genesis.objects));
    expect(w.actors.some((a) => a.mastered.includes(id))).toBe(false);
    // An untrained person is refused; one study round masters it.
    expect(
      step(w, { sol: act('examine', { inputStackId: 'item-x' }) }).outcomes.sol
        ?.reason,
    ).toMatch(/not mastered/);
    const s = step(w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('examines a unit for perceivable condition and cites only personal records, spending 0.2 energy and no material', () => {
    let w = ready();
    const nut = own(w, 'hazelnut');
    // A baseline observation of the unit leaves a personal record that examination cites.
    w = fed(
      step(w, {
        sol: {
          interface: 'probe',
          args: { target: nut.id, mode: 'observe', intensity: 0 },
        },
      }).world,
    );
    const energy = actor(w).vitals.energy;
    const result = step(w, { sol: act('examine', { inputStackId: nut.id }) }),
      idle = step(w).world;
    expect(result.outcomes.sol?.success).toBe(true);
    expect(actor(result.world).vitals.energy).toBe(energy - 0.2);
    expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
    expect(
      events(result.world, 'food-handling-examination-started'),
    ).toHaveLength(1);
    const seen = observation(result.world);
    expect(seen).toMatchObject({
      item: nut.id,
      resource: 'hazelnut',
      origin: 'start-1-nuts',
      shape: 'not represented',
      firmness: 'firm',
      outer: 'no damage seen',
      crack: 0,
      interior: 'not visible',
      exterior: 'little observable deterioration',
      interiorCondition: 'unknown',
      eaten: null,
      safety: 'not established by examination',
    });
    expect(seen?.unknown).toEqual(
      expect.arrayContaining([
        'edibility',
        'nutrition',
        'safety',
        'toxins',
        'interior condition',
      ]),
    );
    // The cited record is the person's own observation with its evidence event.
    const probed = actor(w).memory.knowledge?.[`${nut.id}:observed-state`];
    expect(seen?.records).toEqual([
      {
        key: `${nut.id}:observed-state`,
        property: 'visible state',
        tick: probed?.tick,
        evidence: probed?.evidence,
        verified: false,
      },
    ]);
    // The new record is unverified: no confirmed-information event, no reward.
    expect(
      actor(result.world).memory.knowledge?.[`${nut.id}:food-examination`],
    ).toMatchObject({ verified: false });
    expect(events(result.world, 'information-confirmed')).toHaveLength(0);
    // Only the ordinary effect of spent energy differs: no satisfaction or mental change.
    expect(actor(result.world).wellbeing.sources).toEqual(
      actor(idle).wellbeing.sources,
    );
    expect(actor(result.world).wellbeing.mental).toBe(
      actor(idle).wellbeing.mental,
    );
    // A food the person has eaten cites that eating record; safety is still not certified.
    const roots = step(w, {
      sol: act('examine', { inputStackId: own(w, 'root').id }),
    }).world;
    expect(observation(roots)).toMatchObject({
      firmness: 'soft',
      eaten: { record: 'discoveries:root', nutrition: 14, toxicity: 0 },
      safety: 'not established by examination',
    });
    expect(observation(roots)?.unknown).not.toContain('edibility');
    // Examination needs the person's own food unit.
    expect(
      refused(w, act('examine', { inputStackId: own(w, 'stone').id })),
    ).toMatch(/food units only/);
    expect(refused(w, act('examine', { inputStackId: 'item-none' }))).toMatch(
      /./,
    );
  });

  it('reports unmet opening prerequisites as blocked and spends nothing', () => {
    const w = ready();
    const nut = own(w, 'hazelnut');
    // Bare hands do not open firm food.
    expect(blocked(w, act('open', { inputStackId: nut.id }))).toMatch(
      /Bare hands/,
    );
    // An implement needs a support, and a support alone does nothing.
    expect(
      blocked(
        w,
        act('open', { inputStackId: nut.id, toolIds: [own(w, 'stone').id] }),
      ),
    ).toMatch(/solid support/);
    expect(
      blocked(w, act('open', { inputStackId: nut.id, supportTargetId: ROCK })),
    ).toMatch(/support alone/);
    // One implement at a time; food is not an implement.
    expect(
      blocked(
        w,
        strike(w, 'stone', {
          toolIds: [own(w, 'stone').id, own(w, 'oak').id],
        }),
      ),
    ).toMatch(/one implement/);
    expect(blocked(w, strike(w, 'root'))).toMatch(/Food is not used/);
    // The support must be solid and within reach.
    expect(
      blocked(w, strike(w, 'stone', { supportTargetId: 'start-1-nuts' })),
    ).toMatch(/solid, unreserved/);
    const away = v7Clone(w);
    const rock = away.objects.find((o) => o.id === ROCK);
    actor(away).position = free(
      away,
      rock?.spatial.x ?? 0,
      rock?.spatial.y ?? 0,
      2,
    );
    expect(blocked(away, strike(away, 'stone'))).toMatch(/within reach/);
    // Too little energy for a performed round.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.4;
    expect(blocked(tired, strike(tired, 'stone'))).toMatch(/0.5 energy/);
    // Identity and form errors fail outright.
    expect(
      refused(w, act('open', { inputStackId: own(w, 'stone').id })),
    ).toMatch(/food units only/);
    expect(
      refused(w, act('open', { inputStackId: nut.id, quantity: 2 })),
    ).toMatch(/./);
    const lin = v7Clone(w);
    const linNut: V7Stack = {
      ...nut,
      id: 'item-lin-nut',
      owner: 'lin',
      position: { ...actor(lin, 'lin').position },
    };
    lin.stacks.push(linNut);
    expect(refused(lin, act('open', { inputStackId: linNut.id }))).toMatch(/./);
  });

  it('opens a hazelnut with an owned stone on a rock in one paid strike and conserves the unit', () => {
    const w = ready();
    const nut = own(w, 'hazelnut'),
      stone = own(w, 'stone');
    const rock = w.objects.find((o) => o.id === ROCK);
    const energy = actor(w).vitals.energy;
    const result = step(w, { sol: strike(w, 'stone') }),
      idle = step(w).world;
    const r = result.world;
    expect(result.outcomes.sol?.success).toBe(true);
    expect(result.outcomes.sol?.complete).toBe(true);
    expect(actor(r).vitals.energy).toBe(energy - 0.5);
    expect(events(r, 'food-handling-started')).toHaveLength(1);
    expect(events(r, 'food-handling-opened')).toHaveLength(1);
    expect(events(r, 'food-handling-damaged')).toHaveLength(0);
    // The product is the same single unit, reserved during the strike and now carried again.
    const product = own(r, 'hazelnut');
    expect(product.id).not.toBe(nut.id);
    expect(r.stacks.some((s) => s.id === nut.id)).toBe(false);
    expect(product).toMatchObject({
      quantity: 1,
      origin: nut.origin,
      harvestedAt: nut.harvestedAt,
      owner: 'sol',
      position: actor(r).position,
    });
    expect(handling(product)).toMatchObject({
      outer: 'split open',
      interior: 'exposed',
      damage: 1,
      attempts: 1,
      parents: [nut.id],
      openedBy: 'sol',
      ledger: {
        parts: ['outer layer', 'interior'],
        partMasses: 'not represented',
        mass: 0.2,
        eatingUnits: 1,
        detached: 0,
        losses: 0,
      },
    });
    expect(job(r)).toMatchObject({
      status: 'completed',
      outputs: [product.id],
      paidEnergy: 0.5,
    });
    // Conservation: no unit, fragment or debris appears; ageing is unchanged.
    expect(total(r, 'hazelnut')).toBe(total(w, 'hazelnut'));
    expect(r.stacks).toHaveLength(idle.stacks.length);
    expect(product.decay).toBe(own(idle, 'hazelnut').decay);
    // The implement and the rock are only touched, not changed.
    expect(own(r, 'stone')).toEqual(own(idle, 'stone'));
    expect(own(r, 'stone').id).toBe(stone.id);
    expect(r.objects.find((o) => o.id === ROCK)).toEqual(rock);
    expect(
      actor(r).memory.knowledge?.['hazelnut:opening:stone:stone'],
    ).toMatchObject({ verified: false, value: { outcome: 'split open' } });
    // Examining it now shows the exposed interior, still without any safety claim.
    let next = fed(r);
    const exam = step(next, {
      sol: act('examine', { inputStackId: product.id }),
    }).world;
    expect(observation(exam)).toMatchObject({
      outer: 'split open',
      crack: 1,
      interior: 'exposed',
      interiorCondition: 'little observable deterioration',
      safety: 'not established by examination',
    });
    expect(observation(exam)?.unknown).not.toContain('interior condition');
    expect(
      refused(
        next,
        act('open', {
          inputStackId: product.id,
          toolIds: [stone.id],
          supportTargetId: ROCK,
        }),
      ),
    ).toMatch(/already open/);
    // Eating follows the existing rule unchanged: same nutrition as an unopened unit.
    const eat = (x: V7World, target: string) =>
      events(
        step(x, { sol: { interface: 'eat', args: { target, quantity: 1 } } })
          .world,
        'ate',
      )[0]?.data;
    const control = fed(v7Clone(w));
    expect(eat(next, product.id)).toMatchObject({
      nutrition: 18,
      realized: eat(control, nut.id)?.realized,
    });
    // A planting check refuses the opened unit as treated.
    next = v7Clone(v7Install(r, continuousRegistry(r), 'plant-cultivation@1'));
    actor(next).mastered.push('plant-cultivation');
    const plant = step(next, {
      sol: {
        interface: 'plant-cultivation',
        args: { mode: 'inspect', inputStackId: product.id },
      },
    }).world;
    const check = actor(plant).memory.knowledge?.[`${product.id}:planting-unit`]
      ?.value as V7Data | undefined;
    expect(check?.plantable).toBe(false);
    expect(check?.reason).toMatch(/treated/);
  });

  it('accumulates damage with a softer implement, pauses when unworked and resumes with the kept method', () => {
    let w = ready();
    const nut = own(w, 'hazelnut');
    let energy = actor(w).vitals.energy;
    // Oak: strength 0.7 times (1 - 0.2) = 0.56 against hazelnut 0.4 adds 0.4 per strike.
    let result = step(w, { sol: strike(w, 'oak') });
    w = result.world;
    expect(result.outcomes.sol?.complete).toBe(false);
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'food-handling-damaged')[0]?.data.crack).toBe(0.4);
    expect(handling(reserved(w))).toMatchObject({
      outer: 'cracked',
      interior: 'not exposed',
      damage: 0.4,
    });
    expect(job(w)).toMatchObject({ status: 'active' });
    expect(job(w)?.implement).toBe(own(w, 'oak').id);
    // The cracked, closed unit is not an opened product.
    expect(reserved(w)?.reservedFor).toBe(job(w)?.id);
    expect(w.stacks.filter((s) => s.resource === 'hazelnut')).toHaveLength(1);
    // Lin studied too but cannot continue or cancel Sol's work.
    actor(w, 'lin').position = free(
      w,
      actor(w).position.x,
      actor(w).position.y,
      1,
      'lin',
    );
    expect(refused(w, act('cancel'), 'lin')).toMatch(/No unfinished/);
    expect(refused(w, act('open'), 'lin')).toMatch(/inputStackId/);
    // An unworked round pauses without spending.
    energy = actor(w).vitals.energy;
    w = step(w).world;
    expect(events(w, 'food-handling-paused')).toHaveLength(1);
    expect(job(w)?.status).toBe('paused');
    expect(actor(w).vitals.energy).toBe(energy);
    // Resuming names nothing but the mode: the kept oak and rock strike again.
    result = step(w, { sol: act('open') });
    w = result.world;
    expect(events(w, 'food-handling-resumed')).toHaveLength(1);
    expect(handling(reserved(w))?.damage).toBe(0.8);
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    // A continuing round opens it at 1.2.
    result = step(w, { sol: act('open', { inputStackId: nut.id }) });
    w = result.world;
    expect(events(w, 'food-handling-opened')).toHaveLength(1);
    expect(events(w, 'food-handling-resumed')).toHaveLength(0);
    expect(handling(own(w, 'hazelnut'))).toMatchObject({
      outer: 'split open',
      damage: 1.2,
      attempts: 3,
    });
    expect(job(w)).toMatchObject({ status: 'completed', paidEnergy: 1.5 });
    expect(actor(w).vitals.energy).toBe(energy - 1);
  });

  it('records a strike that cannot pass a load above the food strength as a paid failed trial that changes nothing else', () => {
    const w = ready();
    const nut = own(w, 'hazelnut');
    // Branch: strength 0.3 times (1 - 0.2) = 0.24 is below hazelnut 0.4.
    const energy = actor(w).vitals.energy;
    const result = step(w, { sol: strike(w, 'branch') }),
      idle = step(w).world;
    const r = result.world;
    expect(result.outcomes.sol?.success).toBe(true);
    expect(actor(r).vitals.energy).toBe(energy - 0.5);
    expect(events(r, 'food-handling-trial-failed')).toHaveLength(1);
    expect(events(r, 'food-handling-opened')).toHaveLength(0);
    expect(job(r)?.status).toBe('stopped');
    const back = own(r, 'hazelnut');
    expect(handling(back)).toBeUndefined();
    expect(back).toMatchObject({
      quantity: 1,
      origin: nut.origin,
      decay: own(idle, 'hazelnut').decay,
    });
    expect(
      actor(r).memory.knowledge?.['hazelnut:opening:branch:stone'],
    ).toMatchObject({ verified: false, value: { outcome: 'held' } });
    // A weak support limits the load too: a stone on fallen branches fails the same way.
    const log = near(v7Clone(w), 'start-2-branches');
    const weak = step(log, {
      sol: strike(log, 'stone', { supportTargetId: 'start-2-branches' }),
    }).world;
    expect(events(weak, 'food-handling-trial-failed')).toHaveLength(1);
    expect(handling(own(weak, 'hazelnut'))).toBeUndefined();
  });

  it('cancel returns a cracked unit once without refund, and a new attempt continues from the kept damage', () => {
    let w = fed(step(ready(), { sol: strike(ready(), 'oak') }).world);
    const energy = actor(w).vitals.energy;
    const result = step(w, { sol: act('cancel') }),
      idle = step(w).world;
    expect(result.outcomes.sol?.success).toBe(true);
    w = result.world;
    expect(events(w, 'food-handling-cancelled')).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(actor(idle).vitals.energy);
    expect(actor(w).vitals.energy).toBe(energy);
    expect(job(w)?.status).toBe('stopped');
    const cracked = own(w, 'hazelnut');
    expect(cracked.reservedFor).toBeUndefined();
    expect(handling(cracked)).toMatchObject({
      outer: 'cracked',
      interior: 'not exposed',
      damage: 0.4,
    });
    expect(refused(w, act('cancel'))).toMatch(/No unfinished/);
    const exam = step(w, {
      sol: act('examine', { inputStackId: cracked.id }),
    }).world;
    expect(observation(exam)).toMatchObject({
      outer: 'cracked',
      crack: 0.4,
      interior: 'not visible',
    });
    // The stone adds 1 to the kept 0.4: one strike opens it.
    w = step(w, { sol: strike(w, 'stone') }).world;
    expect(handling(own(w, 'hazelnut'))).toMatchObject({
      outer: 'split open',
      damage: 1.4,
      attempts: 2,
    });
    expect(handling(own(w, 'hazelnut'))?.parents).toHaveLength(2);
  });

  it('opens soft food by hand in one paid round, splitting one unit off a stack', () => {
    const w = ready();
    const roots = own(w, 'root');
    expect(roots.quantity).toBe(2);
    const energy = actor(w).vitals.energy;
    const r = step(w, { sol: act('open', { inputStackId: roots.id }) }).world;
    expect(actor(r).vitals.energy).toBe(energy - 0.5);
    expect(events(r, 'food-handling-opened')).toHaveLength(1);
    const opened = r.stacks.filter(
      (s) => s.resource === 'root' && handling(s)?.outer === 'split open',
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]?.quantity).toBe(1);
    expect(r.stacks.find((s) => s.id === roots.id)?.quantity).toBe(1);
    expect(total(r, 'root')).toBe(total(w, 'root'));
  });

  it('at death stops the opening and leaves the cracked unit where the person died', () => {
    const w = fed(step(ready(), { sol: strike(ready(), 'oak') }).world);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    const unit = reserved(dead);
    const at = { x: actor(dead).position.x + 0.5, y: actor(dead).position.y };
    actor(dead).position = at;
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'food-handling-cancelled')).toHaveLength(1);
    const left = dead.stacks.find((s) => s.id === unit?.id);
    expect(left).toMatchObject({ owner: null, position: at });
    expect(left?.reservedFor).toBeUndefined();
    expect(handling(left)).toMatchObject({ outer: 'cracked', damage: 0.4 });
  });
});
