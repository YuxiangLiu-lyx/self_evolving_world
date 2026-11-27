import { expect, it } from 'vitest';
import type { V7Json, V7Object } from '@self-evolving-world/world-core';
import {
  CONTINUOUS_VISUALS,
  continuousObjectVisual,
} from '../src/continuous-visuals.js';

const piece = (
  slot: string,
  role: string,
  extra: Record<string, V7Json> = {},
): V7Json => ({
  slot,
  role,
  u: slot === 'support-0' ? -0.4 : slot === 'support-1' ? 0.4 : 0,
  v: slot === 'crosspiece-0' ? -0.08 : slot === 'crosspiece-2' ? 0.08 : 0,
  length: 0.99,
  diameter: 0.04,
  condition: 0.99,
  color: '#8d704e',
  ...extra,
});
const ALL = [
  piece('support-0', 'support'),
  piece('support-1', 'support'),
  piece('crosspiece-0', 'crosspiece'),
  piece('crosspiece-1', 'crosspiece'),
  piece('crosspiece-2', 'crosspiece'),
];
/** A rack as prepare-ventilated-food-storage@1 records its view. */
function rack(view: Record<string, V7Json>): V7Object {
  return {
    id: 'rack-23-wren-190',
    kind: 'ventilated-food-rack',
    name: 'Ventilated branch rack',
    spatial: {
      x: 11.25,
      y: 11.5,
      angle: 0,
      shape: { kind: 'rectangle', width: 0.8, height: 0.2 },
      solid: true,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'ventilated-food-rack',
      color: '#8d704e',
      accent: '#c9b48a',
      label: 'Branch rack',
      state: typeof view.status === 'string' ? view.status : 'planned',
    },
    data: {
      view: {
        component: 'ventilated-food-rack',
        footprint: 0.99,
        pieces: ALL,
        food: null,
        favourable: false,
        demonstrated: false,
        ...view,
      },
    },
    createdBy: 'wren',
    createdAt: 23,
    revision: 'prepare-ventilated-food-storage@1',
  };
}
const rects = (svg: string) => svg.match(/<rect /g)?.length ?? 0;

it('draws a partial rack as incomplete, with only the laid pieces', () => {
  expect(typeof CONTINUOUS_VISUALS['ventilated-food-rack']).toBe('function');
  const svg = continuousObjectVisual(
    rack({ status: 'in-progress', pieces: ALL.slice(0, 2) }),
    [],
  );
  // The dashed footprint and the two laid supports; no crosspiece, food or airflow yet.
  expect(svg).toContain('stroke-dasharray=".05 .04"');
  expect(rects(svg)).toBe(3);
  expect(svg).toContain(
    '<rect x="-0.42" y="-0.495" width="0.04" height="0.99"',
  );
  expect(svg).toContain('<rect x="0.38" y="-0.495" width="0.04" height="0.99"');
  expect(svg).not.toContain('<ellipse');
  expect(svg).not.toContain('<path');
  expect(svg).toContain('>Rack in-progress 2 / 5</text>');
  expect(svg).not.toMatch(/slower decay/);
});

it('draws a complete rack with its food, without any result badge or airflow unless earned', () => {
  const plain = continuousObjectVisual(
    rack({
      status: 'complete',
      food: { resource: 'root', color: '#cfaf79', quantity: 2, wet: true },
    }),
    [],
  );
  expect(plain).not.toContain('stroke-dasharray');
  expect(rects(plain)).toBe(5);
  expect(plain).toContain(
    '<rect x="-0.495" y="-0.1" width="0.99" height="0.04"',
  );
  expect(plain.match(/<ellipse /g)).toHaveLength(2);
  // Wet food is edged blue; no airflow mark is drawn while the coded checks do not pass.
  expect(plain).toContain('stroke="#7fb2d6"');
  expect(plain).not.toContain('<path');
  expect(plain).toContain('>Rack</text>');
  const favourable = continuousObjectVisual(
    rack({
      status: 'complete',
      favourable: true,
      food: { resource: 'root', color: '#cfaf79', quantity: 2, wet: false },
    }),
    [],
  );
  expect(favourable).toContain('<path d="M-.34 .16');
  expect(favourable).not.toContain('#7fb2d6');
  // The conditional storage rate alone never claims a shown result.
  expect(favourable).toContain('>Rack</text>');
  const shown = continuousObjectVisual(
    rack({ status: 'complete', demonstrated: true }),
    [],
  );
  expect(shown).toContain('>Rack: slower decay shown</text>');
});

it('draws loosened pieces grey and a damaged or collapsed rack as not complete', () => {
  const damaged = continuousObjectVisual(
    rack({
      status: 'damaged',
      pieces: [
        ...ALL.slice(0, 4),
        piece('crosspiece-2', 'crosspiece', { condition: 0.4 }),
      ],
      food: { resource: 'root', color: '#cfaf79', quantity: 2, wet: false },
    }),
    [],
  );
  expect(damaged).toContain('fill="#8b8273"');
  expect(damaged).toContain('stroke-dasharray');
  expect(damaged).toContain('>Rack damaged 5 / 5</text>');
  const collapsed = continuousObjectVisual(
    rack({
      status: 'collapsed',
      pieces: [
        piece('support-0', 'support', { condition: 0.3 }),
        ...ALL.slice(1),
      ],
    }),
    [],
  );
  expect(collapsed).toContain('>Rack collapsed 5 / 5</text>');
  expect(collapsed).not.toContain('<ellipse');
  // An unknown colour falls back to the neutral tint.
  const odd = continuousObjectVisual(
    rack({
      status: 'complete',
      pieces: [piece('support-0', 'support', { color: 'brown' })],
    }),
    [],
  );
  expect(odd).not.toContain('brown');
});
