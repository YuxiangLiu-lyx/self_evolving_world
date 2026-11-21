import { v7Clone, v7Install, v7Step } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  fireFixture,
  fireRegistry,
  fireWait,
  fireOperation,
} from './local-fire.js';
export function willowFixture() {
  let w = fireFixture();
  w.tick = 100;
  w.time = 100;
  w.actors.forEach((a) => {
    a.vitals.temperature = 20;
  });
  w.objects.push({
    id: 'isolated-willow',
    kind: 'tree',
    name: 'Observed willow',
    spatial: {
      x: 11,
      y: 10,
      angle: 0,
      shape: { kind: 'circle', radius: 0.5 },
      solid: true,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'tree',
      color: '#61865a',
      accent: '#9d8c66',
      label: 'Willow',
      state: 'standing',
    },
    data: {
      resource: 'willow',
      stock: 3,
      capacity: 3,
      interval: 0,
      growth: 0,
      produced: 0,
    },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  });
  w = v7Clone(v7Install(w, fireRegistry, 'portable-insulation@1'));
  w = v7Clone(v7Install(w, fireRegistry, 'willow-materials@1'));
  return v7Clone(v7Install(w, fireRegistry, 'willow-operation-continuity@1'));
}
export function willowStudy(
  w: V7World,
  ability = 'process-willow',
  rounds = 4,
) {
  for (let i = 0; i < rounds; i++)
    w = v7Clone(
      v7Step(
        w,
        {
          lin: i ? fireWait : { interface: 'learn', args: { ability } },
          moss: fireWait,
          sol: fireWait,
        },
        fireRegistry,
      ).world,
    );
  return w;
}
export function willowOperation(
  w: V7World,
  mode: string,
  target: string,
  limit = 30,
) {
  return fireOperation(
    w,
    { interface: 'process-willow', args: { mode, target } },
    'lin',
    limit,
  );
}
