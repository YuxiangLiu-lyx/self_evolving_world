import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Step,
  fireState,
  forestResolveAction,
  v7Validate,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  willowFixture,
  willowStudy,
  willowOperation,
} from './fixtures/willow.js';
import {
  fireOperation,
  fireWait,
  fireRegistry,
  fireAction,
} from './fixtures/local-fire.js';
import { forestPlanArguments } from '../src/forest-plan-arguments.js';
import { continuousRequest } from '../src/continuous-provider.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';
const required = <T>(v: T | undefined | null): T => {
  if (v == null) throw new Error('Missing isolated value');
  return v;
};
const mass = (w: V7World) =>
  w.stacks.reduce(
    (n, s) =>
      n +
      s.quantity * Number(w.resources.find((r) => r.id === s.resource)?.mass),
    0,
  );
it('uses finite source stock, actual study and paid material conservation; strips and twists retain provenance', () => {
  let w = willowFixture();
  expect(w.stacks.some((s) => s.resource.startsWith('willow-'))).toBe(false);
  expect(w.actors[0]?.mastered).not.toContain('process-willow');
  w = willowStudy(w);
  const initial = mass(w),
    strip = willowOperation(w, 'strip', 'object:isolated-willow');
  expect(strip.outcomes.every((o) => o?.success)).toBe(true);
  expect(strip.frames).toHaveLength(4);
  w = strip.world;
  expect(w.objects.find((o) => o.id === 'isolated-willow')?.data.stock).toBe(2);
  expect(mass(w) - initial).toBeCloseTo(1.2);
  expect(w.stacks.find((s) => s.resource === 'willow-bark')?.quantity).toBe(2);
  const bast = required(w.stacks.find((s) => s.resource === 'willow-bast'));
  const twist = willowOperation(w, 'twist', bast.id);
  expect(twist.frames).toHaveLength(3);
  expect(twist.outcomes.every((o) => o?.success)).toBe(true);
  expect(mass(twist.world)).toBeCloseTo(mass(w));
  const cord = required(
    twist.world.stacks.find((s) => s.resource === 'bast-cord'),
  );
  expect(cord.origin).toBe('isolated-willow');
  expect(cord.processing?.mode).toBe('twist');
  expect(cord.fuelMoisture).toBeDefined();
  const source = twist.world.actors[0]?.wellbeing.sources.find(
    (s) => s.source === 'willow-engagement',
  );
  expect(source?.value).toBeLessThanOrEqual(1);
  expect(source?.sustained).toBeCloseTo(0.1 + 0.075 - 2 * 0.003, 5);
});
it('cancellation and death release the actual bundle once without restoring tree stock or rewarding work', () => {
  const r = willowOperation(
    willowStudy(willowFixture()),
    'strip',
    'isolated-willow',
    2,
  );
  let w = v7Clone(
    v7Step(
      r.world,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world,
  );
  expect(w.objects.find((o) => o.id === 'isolated-willow')?.data.stock).toBe(2);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    w.actors[0]?.wellbeing.sources.some(
      (s) => s.source === 'willow-engagement',
    ),
  ).toBe(false);
  const bundle = required(
    w.stacks.find((s) => s.resource === 'willow-shoot-bundle'),
  );
  const resumed = willowOperation(w, 'strip', bundle.id);
  expect(resumed.frames).toHaveLength(4);
  expect(resumed.outcomes.every((o) => o?.success)).toBe(true);
  expect(
    resumed.world.objects.find((o) => o.id === 'isolated-willow')?.data.stock,
  ).toBe(2);
  w = v7Clone(r.world);
  required(w.actors[0]).vitals.health = 0.01;
  required(w.actors[0]).vitals.satiety = 0;
  w = v7Clone(
    v7Step(w, { lin: fireWait, moss: fireWait, sol: fireWait }, fireRegistry)
      .world,
  );
  expect(w.events.some((e) => e.type === 'died' && e.actor === 'lin')).toBe(
    true,
  );
  const dropped = required(
    w.stacks.find((s) => s.resource === 'willow-shoot-bundle'),
  );
  expect(dropped.owner).toBeNull();
  expect(dropped.reservedFor).toBeUndefined();
  expect(w.stacks.some((s) => s.resource === 'willow-bark')).toBe(false);
});
it('rejects exhausted stock, hidden or blocked sources, wrong ownership and renamed material without reward', () => {
  const w = willowStudy(willowFixture());
  required(w.objects[0]).data.stock = 0;
  expect(
    willowOperation(w, 'strip', 'isolated-willow').outcomes[0]?.success,
  ).toBe(false);
  required(w.objects[0]).data.stock = 3;
  required(w.actors[0]).position = { x: 11, y: 10 };
  expect(() => willowOperation(w, 'strip', 'isolated-willow')).toThrow(
    'overlap an actor body',
  );
  required(w.actors[0]).position = { x: 1, y: 1 };
  expect(
    willowOperation(w, 'strip', 'isolated-willow').outcomes[0]?.success,
  ).toBe(false);
  required(w.actors[0]).position = { x: 10, y: 10 };
  w.stacks.push({
    id: 'false-bast',
    resource: 'branch',
    quantity: 1,
    owner: 'lin',
    position: { x: 10, y: 10 },
    origin: 'renamed',
  });
  expect(willowOperation(w, 'twist', 'false-bast').outcomes[0]?.success).toBe(
    false,
  );
  const r = willowOperation(w, 'strip', 'isolated-willow');
  const bast = required(
    r.world.stacks.find((s) => s.resource === 'willow-bast'),
  );
  bast.owner = 'moss';
  expect(willowOperation(r.world, 'twist', bast.id).outcomes[0]?.success).toBe(
    false,
  );
});
it('qualifies real willow panels and manufactured cord for unchanged mantle and hearth recipe costs', () => {
  let w = willowStudy(willowFixture());
  // Remove authored bark/vine fixture supply: only the processed willow products can satisfy recipes.
  w.stacks = w.stacks.filter((s) => !['bark', 'vine'].includes(s.resource));
  for (let i = 0; i < 3; i++)
    w = willowOperation(w, 'strip', 'isolated-willow').world;
  for (const s of [...w.stacks].filter((s) => s.resource === 'willow-bast'))
    w = willowOperation(w, 'twist', s.id).world;
  w = willowStudy(w, 'portable-insulation');
  for (let i = 0; i < 6; i++)
    w = v7Clone(
      v7Step(
        w,
        { lin: { interface: 'rest', args: {} }, moss: fireWait, sol: fireWait },
        fireRegistry,
      ).world,
    );
  const craft = fireOperation(w, {
    interface: 'portable-insulation',
    args: { mode: 'craft' },
  });
  expect(craft.outcomes.every((o) => o?.success)).toBe(true);
  w = craft.world;
  const mantle = required(w.stacks.find((s) => s.mantle));
  expect(
    mantle.mantle?.inputs.every(
      (i) =>
        typeof i.resource === 'string' &&
        ['willow-bark', 'bast-cord'].includes(i.resource),
    ),
  ).toBe(true);
  expect(mantle.mantle?.moisture).toBeGreaterThan(0);
  w = willowStudy(w, 'tend-fire', 6);
  expect(
    ordinaryContinuousInput(w, 'lin', undefined, 10).harness['tend-fire'],
  ).toBeDefined();
  const bark = required(
      w.stacks.find((s) => s.resource === 'willow-bark' && s.quantity === 2),
    ),
    cord = required(
      w.stacks.find((s) => s.resource === 'bast-cord' && s.quantity === 1),
    );
  const build = fireOperation(
    w,
    fireAction('build', {
      x: 10,
      y: 9,
      materials: [
        { target: 'fixture-stone', quantity: 4 },
        { target: bark.id, quantity: 2 },
        { target: cord.id, quantity: 1 },
      ],
    }),
  );
  expect(build.outcomes.every((o) => o?.success)).toBe(true);
  const hearth = required(
    build.world.objects.find((o) => o.kind === 'stone-hearth'),
  );
  expect(fireState(hearth).inputs.some((i) => i.resource === 'bast-cord')).toBe(
    true,
  );
  expect(
    build.world.objects.find((o) => o.id === 'isolated-willow')?.data.stock,
  ).toBe(0);
});
it('nullable output placeholders omit only optional fields; required references and unrelated fields still fail', () => {
  const w = willowFixture(),
    ability = required(w.abilities.find((a) => a.id === 'portable-insulation'));
  const input = ordinaryContinuousInput(w, 'lin', undefined, 10),
    body = continuousRequest('isolated-fixture', 'ordinary', input);
  expect(JSON.stringify(body.text.format.schema)).toContain(
    'Null denotes an omitted optional argument',
  );
  const args = forestPlanArguments(ability.parameters, {
    mode: 'craft',
    target: null,
  });
  expect(args).toEqual({ mode: 'craft' });
  expect(() => {
    v7Validate(ability.parameters, args);
  }).not.toThrow();
  expect(
    forestResolveAction(w, required(w.actors[0]), {
      interface: 'portable-insulation',
      args,
    }),
  ).toEqual({ interface: 'portable-insulation', args: { mode: 'craft' } });
  const willow = required(w.abilities.find((a) => a.id === 'process-willow'));
  expect(() => {
    v7Validate(
      willow.parameters,
      forestPlanArguments(willow.parameters, { mode: 'strip', target: null }),
    );
  }).toThrow();
  expect(() => {
    v7Validate(
      ability.parameters,
      forestPlanArguments(ability.parameters, {
        mode: 'craft',
        invented: null,
      }),
    );
  }).toThrow();
});

it('low satiety processing creates only real products and no engagement reward', () => {
  const w = willowStudy(willowFixture());
  required(w.actors[0]).vitals.satiety = 19;
  const result = willowOperation(w, 'strip', 'isolated-willow');
  expect(result.outcomes.every((o) => o?.success)).toBe(true);
  expect(
    result.world.events.some((e) => e.type === 'willow-engagement-qualified'),
  ).toBe(false);
  const output = result.world.stacks.filter(
    (s) => s.processing?.mode === 'strip',
  );
  expect(
    output.reduce(
      (n, s) =>
        n +
        s.quantity *
          Number(
            result.world.resources.find((r) => r.id === s.resource)?.properties
              ?.fuel,
          ),
      0,
    ),
  ).toBeLessThanOrEqual(7);
});
