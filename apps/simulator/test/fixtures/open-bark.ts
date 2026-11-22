import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { examinationFixture } from './open-food-examination.js';
export const barkAction = (mode = 'inspect'): V7Action => ({
  interface: 'inspect-strip-bark',
  args: {
    mode,
    target: 'layer-source',
    tool: mode === 'strip' ? 'stone-tool' : '',
  },
});
export const barkStep = (w: V7World, action = barkAction()) =>
  v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === 'lin' ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
/** Positive composition is only an explicit isolated input, never formal genesis or migration. */
export function barkFixture(represented = false) {
  let w = v7Clone(
    v7Install(
      examinationFixture(),
      continuousRegistry(),
      'inspect-strip-bark@1',
    ),
  );
  w.objects = [
    {
      id: 'layer-source',
      kind: 'resource-source',
      name: 'Isolated branch substrate',
      spatial: {
        x: 8.65,
        y: 8,
        angle: 0,
        shape: { kind: 'circle', radius: 0.2 },
        solid: false,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'plant',
        color: '#936b43',
        accent: '#c3ad7f',
        label: 'Actual substrate',
        state: 'ready',
      },
      data: {
        resource: 'branch',
        stock: 2,
        interval: 0,
        ...(represented
          ? {
              materialLayer: {
                resource: 'bark',
                unitMass: 1.1,
                unitLayerMass: 0.12,
                separable: true,
                sheetArea: 1,
                moisture: 0.5,
                evidence: 'explicit-isolated-layer-input',
              },
            }
          : {}),
      },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-open@1',
    },
  ];
  w.stacks.push({
    id: 'stone-tool',
    resource: 'stone',
    quantity: 1,
    owner: 'lin',
    position: { x: 8, y: 8 },
    origin: 'isolated-stone',
  });
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      barkStep(w, {
        interface: 'learn',
        args: { ability: 'inspect-strip-bark' },
      }).world,
    );
  return w;
}
export function barkFrames() {
  let unknown = barkFixture();
  unknown = v7Clone(barkStep(unknown).world);
  let w = barkFixture(true);
  w = v7Clone(barkStep(w).world);
  const inspected = w;
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  const partial = w;
  w = v7Clone(barkStep(w, barkAction('strip')).world);
  return [unknown, inspected, partial, w];
}
