import { expect, it } from 'vitest';
import type { V7Object } from '@self-evolving-world/world-core';
import {
  CONTINUOUS_VISUALS,
  continuousObjectVisual,
} from '../src/continuous-visuals.js';

/** The footprint record position-loose-material@1 leaves for one placed branch unit. */
function placed(state: string, angle = 0.6): V7Object {
  return {
    id: 'placed-4-sol-31',
    kind: 'placed-loose-material',
    name: 'Placed branch',
    spatial: {
      x: 13.3,
      y: 17.5,
      angle,
      shape: { kind: 'rectangle', width: 0.99078655, height: 0.03963146 },
      solid: false,
      reserved: true,
      interaction: 0.15421057,
      entrances: [],
    },
    visual: {
      component: 'placed-rod',
      color: '#8d704e',
      accent: '#4f3d2a',
      label: 'Placed branch',
      state,
    },
    data: {
      item: 'item-4-sol-29',
      material: 'branch',
      view: { component: 'placed-rod', status: state, provisional: false },
    },
    createdBy: 'sol',
    createdAt: 4,
    revision: 'position-loose-material@1',
  };
}

it('draws a placed unit as its rod at the recorded length, thickness, angle and material colour, and nothing else', () => {
  expect(typeof CONTINUOUS_VISUALS['placed-rod']).toBe('function');
  const svg = continuousObjectVisual(placed('placed'), []);
  // 0.6 rad is 34.377 degrees; the rod carries its own rotation for the unrotated forest canvas.
  expect(svg).toBe(
    '<g transform="rotate(34.377)"><rect x="-0.495" y="-0.02" width="0.991" height="0.04" rx="0.02" fill="#8d704e" stroke="#4f3d2a" stroke-width=".006"/></g>',
  );
  expect(svg).not.toContain('<text');
  expect(svg).not.toContain('stroke-dasharray');
  const turned = continuousObjectVisual(placed('placed', Math.PI / 2), []);
  expect(turned).toContain('rotate(90)');
});

it('never draws a laid rod for any state other than placed', () => {
  for (const state of ['provisional', 'paused', 'removed']) {
    const svg = continuousObjectVisual(placed(state), []);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke-dasharray=".05 .04"');
    expect(svg).not.toContain('#8d704e');
  }
  const circle = placed('placed');
  circle.spatial.shape = { kind: 'circle', radius: 0.1 };
  expect(continuousObjectVisual(circle, [])).toBe('');
});

it('adds only the placed-rod drawing after every existing one', () => {
  const keys = Object.keys(CONTINUOUS_VISUALS);
  expect(keys.at(-1)).toBe('placed-rod');
  expect(keys.filter((k) => k === 'placed-rod')).toHaveLength(1);
  // The existing loose-material drawing keeps its own key and output.
  const loose = {
    ...placed('ready'),
    visual: { ...placed('ready').visual, component: 'loose-material' },
  };
  loose.spatial = { ...loose.spatial, shape: { kind: 'circle', radius: 0.2 } };
  expect(continuousObjectVisual(loose, [])).toBe(
    '<circle r="0.2" fill="none" stroke="#88a377" stroke-width=".015" stroke-dasharray=".03 .03"/>',
  );
});
