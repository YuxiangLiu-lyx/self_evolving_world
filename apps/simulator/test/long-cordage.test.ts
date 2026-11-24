import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'make-and-test-cordage';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: wait, moss: wait, sol: action }, continuousRegistry(w));
const sol = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'sol');
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
function learned() {
  const genesis = initialLongWorld('long-ex14', 'long-fixes');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  const source = w.objects.find((o) => o.id === 'forest-vine-2');
  if (!source) throw new Error('Missing vine source.');
  sol(w).position = { x: source.spatial.x + 0.6, y: source.spatial.y };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'forest-vine-2', quantity: 2 },
    }).world,
  );
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  for (let i = 0; i < 5 && !sol(w).mastered.includes(id); i++)
    w = v7Clone(step(w, wait).world);
  expect(sol(w).mastered).toContain(id);
  const vine = w.stacks.find((s) => s.owner === 'sol' && s.resource === 'vine');
  if (!vine) throw new Error('Missing gathered vine.');
  return { w, vine: vine.id };
}

describe('cordage first release in ex14', () => {
  it('checks the sample and reports unsupported measurements without spending', () => {
    const { w, vine } = learned();
    const tried = step(w, {
      interface: id,
      args: { mode: 'prepare', inputStackId: vine, quantity: 1 },
    });
    const waited = step(w, wait);
    expect(tried.outcomes.sol?.success).toBe(false);
    expect(sol(tried.world).vitals.energy).toBeCloseTo(
      sol(waited.world).vitals.energy,
      9,
    );
    expect(tried.world.stacks).toEqual(waited.world.stacks);
    const reason = JSON.stringify(tried.outcomes.sol);
    expect(reason).toContain(`${vine} (vine) holds enough for 1`);
    expect(reason).toContain('labeled unsupported');
    const uneven = step(w, {
      interface: id,
      args: { mode: 'prepare', inputStackId: vine, quantity: 0.15 },
    });
    expect(JSON.stringify(uneven.outcomes.sol)).toContain(
      'is not a 0.1-unit amount',
    );
  });

  it('fails every other mode because no sample, cord or test can exist', () => {
    const { w } = learned();
    for (const mode of [
      'form',
      'test',
      'inspect',
      'resume',
      'cancel',
      'recover-material',
    ])
      expect(
        step(w, { interface: id, args: { mode } }).outcomes.sol?.success,
      ).toBe(false);
  });
});
