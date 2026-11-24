import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'weather-barrier';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: action, moss: wait, sol: wait }, continuousRegistry(w));
const lin = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
function learned() {
  const genesis = initialLongWorld('long-ex14', 'long-fixes');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  for (let i = 0; i < 5 && !lin(w).mastered.includes(id); i++)
    w = v7Clone(step(w, wait).world);
  expect(lin(w).mastered).toContain(id);
  return w;
}

describe('weather barrier first release in ex14', () => {
  it('checks the site and branches, then reports the unsupported conditions without building or spending', () => {
    const w = learned();
    const a = lin(w);
    const build: V7Action = {
      interface: id,
      args: {
        mode: 'build',
        x: a.position.x + 1,
        y: a.position.y,
        orientation: 90,
      },
    };
    const tried = step(w, build);
    expect(tried.outcomes.lin?.success).toBe(false);
    const waited = step(w, wait);
    expect(lin(tried.world).vitals.energy).toBeCloseTo(
      lin(waited.world).vitals.energy,
      9,
    );
    expect(tried.world.objects).toEqual(waited.world.objects);
    expect(tried.world.stacks).toEqual(waited.world.stacks);
    const reason = JSON.stringify(tried.outcomes.lin);
    expect(reason).toContain('Owned unreserved branch units: 0 of 12');
    expect(reason).toContain('no length or diameter');
    expect(reason).toContain('no direction');
  });

  it('fails every other mode because no barrier can exist', () => {
    const w = learned();
    for (const mode of ['resume', 'inspect', 'repair', 'cancel', 'dismantle'])
      expect(
        step(w, { interface: id, args: { mode, target: 'none' } }).outcomes.lin
          ?.success,
      ).toBe(false);
  });
});
