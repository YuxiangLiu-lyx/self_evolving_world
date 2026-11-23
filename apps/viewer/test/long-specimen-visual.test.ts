import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7World } from '@self-evolving-world/world-core';
import { specimenAppearance } from '../src/long-specimen-visual.js';
it('keeps legacy exposure and requires a real inspection for the new source visual without inventing an interior', () => {
  const { world } = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-opening-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const s = world.stacks.find((s) => s.id === 'item-140-moss-811');
  if (!s) throw Error('Missing actual specimen');
  expect(specimenAppearance(s)).toBeNull();
  s.processing = {
    method: 'moss-source-bound-hazelnut-interior-access-trial@1',
    exposed: true,
    interiorObserved: false,
  };
  expect(specimenAppearance(s)).toMatchObject({ exposed: false });
  s.processing.interiorObserved = true;
  expect(specimenAppearance(s)).toMatchObject({ exposed: true });
  s.processing.exposed = false;
  expect(specimenAppearance(s)).toMatchObject({ exposed: false });
  s.processing = {
    method: 'source-bound-hazelnut-opening-trial@1',
    exposed: true,
  };
  expect(specimenAppearance(s)).toMatchObject({ exposed: true });
});
