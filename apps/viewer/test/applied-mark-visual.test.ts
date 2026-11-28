import { expect, it } from 'vitest';
import type { V7Json, V7Object } from '@self-evolving-world/world-core';
import {
  CONTINUOUS_VISUALS,
  continuousObjectVisual,
} from '../src/continuous-visuals.js';

/** A ground mark object as apply-marking-material@1 records it, with the given marks. */
function mark(marks: V7Json[]): V7Object {
  return {
    id: 'mark-3-sol-28',
    kind: 'applied-mark',
    name: 'Red berries mark',
    spatial: {
      x: 13.3,
      y: 16.58,
      angle: 0,
      shape: { kind: 'circle', radius: 0.03 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'applied-mark',
      color: '#8c575b',
      accent: '#52644a',
      label: 'Applied mark',
      state: 'drawing',
    },
    data: { marks, durability: 'untested' },
    createdBy: 'sol',
    createdAt: 3,
    revision: 'apply-marking-material@1',
  };
}
const dab = {
  kind: 'dab',
  points: [{ x: 0, y: 0 }],
  radius: 0.02,
  deposit: 0.06375,
  color: '#8c575b',
  visible: true,
};
const stroke = (extra: Record<string, V7Json> = {}): V7Json => ({
  kind: 'stroke',
  points: [
    { x: 0, y: 0.1 },
    { x: 0, y: 0 },
  ],
  width: 0.02,
  deposit: 0.1275,
  color: '#8c575b',
  visible: true,
  ...extra,
});

it('draws only deposited, visible marks at their recorded colour, width and geometry', () => {
  const svg = continuousObjectVisual(
    mark([
      dab,
      stroke(),
      // An invisible deposit, a failed transfer and an unparseable colour draw nothing.
      stroke({ visible: false, color: '#545f4b' }),
      stroke({ deposit: 0, color: '#123456' }),
      stroke({ color: 'red' }),
    ]),
    [],
  );
  expect(svg.match(/<circle /g)).toHaveLength(1);
  expect(svg.match(/<polyline /g)).toHaveLength(1);
  expect(svg).toContain('<circle cx="0" cy="0" r="0.02" fill="#8c575b"/>');
  expect(svg).toContain(
    '<polyline points="0,0.1 0,0" fill="none" stroke="#8c575b" stroke-width="0.02"',
  );
  expect(svg).not.toContain('#545f4b');
  expect(svg).not.toContain('#123456');
  expect(svg).not.toContain('red');
  // No label, preview or shadow stands in for pigment.
  expect(svg).not.toContain('<text');
  expect(svg).not.toContain('<ellipse');
});

it('draws nothing for a mark object without a visible deposit instead of the generic fallback', () => {
  expect(CONTINUOUS_VISUALS['applied-mark']).toBeDefined();
  expect(continuousObjectVisual(mark([]), [])).toBe('');
  expect(continuousObjectVisual(mark([stroke({ visible: false })]), [])).toBe(
    '',
  );
});
