import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { diagnosticFixture } from './open-shelter-diagnostics.js';
export function metrologyFixture() {
  let w = diagnosticFixture();
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture');
  a.position = { x: 8, y: 8 };
  w.objects = [
    {
      id: 'forest-branch-0',
      name: 'Finite natural branch source',
      kind: 'tree',
      spatial: {
        x: 17.2,
        y: 13.3,
        angle: 0,
        shape: { kind: 'circle', radius: 0.42 },
        solid: true,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'tree',
        color: '#48674b',
        accent: '#8d704e',
        label: 'Branches',
        state: 'ready',
      },
      data: {
        resource: 'branch',
        capacity: 9,
        stock: 8,
        interval: 0,
        produced: 0,
        growth: 0,
        depletion: 1,
      },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    },
  ];
  w = v7Clone(v7Install(w, continuousRegistry(w), 'material-geometry@1'));
  w = v7Clone(
    v7Install(w, continuousRegistry(w), 'shelter-material-metrology@1'),
  );
  for (let i = 0; i < 2; i++)
    w = v7Clone(
      metrologyStep(w, {
        interface: 'learn',
        args: { ability: 'shelter-material-metrology' },
      }).world,
    );
  return w;
}
export const metrologyAction = (
  mode: string,
  project = 'measure-one',
  target = 'item:item-112-moss-648',
  loads: V7Data[] = [],
  span = 0,
): V7Action => ({
  interface: 'shelter-material-metrology',
  args: {
    mode,
    project,
    target,
    loads,
    span,
    x: mode === 'resume' || mode === 'cancel' ? 0 : 8,
    y: mode === 'resume' || mode === 'cancel' ? 0 : 8.65,
    angle: 0,
  },
});
export const metrologyStep = (w: V7World, action: V7Action) =>
  v7Step(w, { moss: action }, continuousRegistry(w));
export function measuredFixture() {
  let w = metrologyFixture();
  for (let i = 0; i < 2; i++) {
    const r = metrologyStep(w, metrologyAction('measure'));
    if (!r.outcomes.moss?.success) throw new Error(r.outcomes.moss?.reason);
    w = v7Clone(r.world);
  }
  return w;
}
export function metrologyFrames() {
  let w = metrologyFixture();
  const frames = [v7Clone(w)];
  for (let i = 0; i < 2; i++) {
    w = v7Clone(metrologyStep(w, metrologyAction('measure')).world);
    frames.push(w);
  }
  w.stacks.push({
    id: 'fixture-test-weight',
    resource: 'stone',
    quantity: 2,
    owner: 'moss',
    origin: 'isolated-weight',
    position: { x: 8, y: 8 },
  });
  for (let i = 0; i < 2; i++) {
    w = v7Clone(
      metrologyStep(
        w,
        metrologyAction(
          'load-test',
          'test-one',
          'item:item-112-moss-648',
          [{ item: 'fixture-test-weight', quantity: 2 }],
          0.4,
        ),
      ).world,
    );
    frames.push(w);
  }
  return frames;
}
