import { expect, it } from 'vitest';
import type { V7Json, V7Object } from '@self-evolving-world/world-core';
import {
  CONTINUOUS_VISUALS,
  continuousObjectVisual,
} from '../src/continuous-visuals.js';

/** A ground drawing as draw-from-observation@1 records it, with the given grooves. */
function drawing(grooves: V7Json[]): V7Object {
  return {
    id: 'drawing-3-sol-14',
    kind: 'groove-drawing',
    name: 'Finger grooves in soil',
    spatial: {
      x: 13.3,
      y: 16.58,
      angle: 0,
      shape: { kind: 'circle', radius: 0.15 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'groove-drawing',
      color: '#3a4734',
      accent: '#52644a',
      label: 'Ground drawing',
      state: 'drawing',
    },
    data: { grooves, pigment: 'none', durability: 'untested' },
    createdBy: 'sol',
    createdAt: 3,
    revision: 'draw-from-observation@1',
  };
}
const groove = (extra: Record<string, V7Json> = {}): V7Json => ({
  kind: 'stroke',
  points: [
    { x: 0.03, y: 0.12 },
    { x: 0.03, y: -0.02 },
  ],
  width: 0.02,
  depth: 0.01,
  retained: true,
  color: '#3a4734',
  contrast: 0.0987,
  visible: true,
  ...extra,
});

it('draws only grooves the soil kept and that are visible, at their shaded colour, width and geometry', () => {
  const svg = continuousObjectVisual(
    drawing([
      groove({
        kind: 'test',
        points: [
          { x: -0.025, y: 0 },
          { x: 0.025, y: 0 },
        ],
      }),
      groove(),
      // A groove the soil did not keep, an invisible one, a flat one and a bad colour draw nothing.
      groove({ retained: false, depth: 0, color: '#123456' }),
      groove({ visible: false, color: '#654321' }),
      groove({ depth: 0, color: '#abcdef' }),
      groove({ color: 'brown' }),
    ]),
    [],
  );
  expect(svg.match(/<polyline /g)).toHaveLength(2);
  expect(svg).toContain(
    '<polyline points="-0.025,0 0.025,0" fill="none" stroke="#3a4734" stroke-width="0.02"',
  );
  expect(svg).toContain(
    '<polyline points="0.03,0.12 0.03,-0.02" fill="none" stroke="#3a4734" stroke-width="0.02"',
  );
  for (const absent of ['#123456', '#654321', '#abcdef', 'brown'])
    expect(svg).not.toContain(absent);
  // No label, badge, pigment fill or shadow stands in for the grooves.
  expect(svg).not.toContain('<text');
  expect(svg).not.toContain('<ellipse');
  expect(svg).not.toContain('<circle');
});

it('draws nothing for a failed test groove instead of the generic fallback, and leaves the applied-mark drawing unchanged', () => {
  expect(CONTINUOUS_VISUALS['groove-drawing']).toBeDefined();
  expect(continuousObjectVisual(drawing([]), [])).toBe('');
  expect(
    continuousObjectVisual(
      drawing([groove({ kind: 'test', retained: false, depth: 0 })]),
      [],
    ),
  ).toBe('');
  // The ex20 applied-mark drawing still needs a deposit: grooves give it nothing to draw.
  expect(
    CONTINUOUS_VISUALS['applied-mark']?.(
      { ...drawing([]), kind: 'applied-mark', data: { marks: [groove()] } },
      [],
    ),
  ).toBe('');
});
