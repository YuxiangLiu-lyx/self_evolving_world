import { expect, it } from 'vitest';
import {
  initialCollectiveWorld,
  collectivePhysicalGenesis,
} from '../apps/simulator/src/collective-scenario.js';
import { v7Clone } from '@self-evolving-world/world-core';

it('detects any physical baseline change between collective arms while allowing the declared treatment', () => {
  const a = initialCollectiveWorld('collective-ex11', 'A'),
    b = v7Clone(initialCollectiveWorld('collective-ex12', 'B'));
  expect(collectivePhysicalGenesis(a)).toBe(collectivePhysicalGenesis(b));
  b.config.hunger += 0.1;
  expect(collectivePhysicalGenesis(a)).not.toBe(collectivePhysicalGenesis(b));
});
