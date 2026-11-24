import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'air-dry-food';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: wait, moss: action, sol: wait }, continuousRegistry(w));
const moss = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
function learned() {
  const genesis = initialLongWorld('long-ex14', 'long-fixes');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  moss(w).position = { x: 20.1, y: 13.4 };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'start-1-roots', quantity: 2 },
    }).world,
  );
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  for (let i = 0; i < 5 && !moss(w).mastered.includes(id); i++)
    w = v7Clone(step(w, wait).world);
  expect(moss(w).mastered).toContain(id);
  return w;
}

describe('air-dry-food first release in ex14', () => {
  it('checks the food and support, then reports the unsupported conditions without spending', () => {
    const w = learned();
    const food = w.stacks.find(
      (s) => s.owner === 'moss' && s.resource === 'root',
    );
    if (!food) throw new Error('Missing gathered food.');
    const tried = step(w, {
      interface: id,
      args: {
        mode: 'set-up',
        inputStackId: food.id,
        supportId: 'start-1-stone',
      },
    });
    const waited = step(w, wait);
    expect(tried.outcomes.moss?.success).toBe(false);
    expect(moss(tried.world).vitals.energy).toBeCloseTo(
      moss(waited.world).vitals.energy,
      9,
    );
    expect(tried.world.stacks).toEqual(waited.world.stacks);
    const reason = JSON.stringify(tried.outcomes.moss);
    expect(reason).toContain(`${food.id} is owned, unspoiled, nontoxic food`);
    expect(reason).toContain('no shape, exposed area or cleanliness');
  });

  it('fails every other mode because no batch can exist', () => {
    const w = learned();
    for (const mode of ['inspect', 'retrieve', 'resume', 'cancel'])
      expect(
        step(w, { interface: id, args: { mode, target: 'none' } }).outcomes.moss
          ?.success,
      ).toBe(false);
  });
});
