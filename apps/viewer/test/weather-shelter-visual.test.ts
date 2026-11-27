import { expect, it } from 'vitest';
import type { V7Json, V7Object } from '@self-evolving-world/world-core';
import {
  CONTINUOUS_VISUALS,
  continuousObjectVisual,
} from '../src/continuous-visuals.js';

const rod = (
  slot: string,
  role: string,
  extra: Record<string, V7Json> = {},
): V7Json => ({
  slot,
  role,
  side: slot.includes('-L') ? 'L' : slot.includes('-R') ? 'R' : null,
  row: slot.includes('upper')
    ? 'upper'
    : slot.includes('lower')
      ? 'lower'
      : null,
  from: Number(slot.at(-1) ?? 0),
  to: role === 'leg' ? Number(slot.at(-1) ?? 0) : Number(slot.at(-1) ?? 0) + 1,
  condition: 0.99,
  color: '#8d704e',
  ...extra,
});
const LEGS = [
  'leg-L-0',
  'leg-R-0',
  'leg-L-1',
  'leg-R-1',
  'leg-L-2',
  'leg-R-2',
].map((s) => rod(s, 'leg'));
const FRAME = [
  ...LEGS,
  rod('ridge-0', 'ridge'),
  rod('ridge-1', 'ridge'),
  rod('rail-L-0', 'rail'),
  rod('rail-L-1', 'rail'),
  rod('rail-R-0', 'rail'),
  rod('rail-R-1', 'rail'),
];
const panel = (id: string, cover = 1, laid = 1): V7Json => ({
  id,
  side: id.startsWith('L') ? 'L' : id.startsWith('R') ? 'R' : null,
  course: id.includes('upper')
    ? 'upper'
    : id.includes('lower')
      ? 'lower'
      : null,
  bay: id.endsWith('1') ? 1 : id === 'rear' ? null : 0,
  laid,
  cover,
  condition: cover,
});
const PANELS = [
  'L-lower-0',
  'L-lower-1',
  'L-upper-0',
  'L-upper-1',
  'R-lower-0',
  'R-lower-1',
  'R-upper-0',
  'R-upper-1',
  'rear',
].map((p) => panel(p));
/** A shelter as construct-weather-shelter@1 records its view. */
function shelter(view: Record<string, V7Json>): V7Object {
  return {
    id: 'shelter-20-kai-300',
    kind: 'thatched-weather-shelter',
    name: 'Thatched weather shelter',
    spatial: {
      x: 13.5,
      y: 14.5,
      angle: 0,
      shape: { kind: 'rectangle', width: 1, height: 1.8 },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'thatched-weather-shelter',
      color: '#8d704e',
      accent: '#b6c27a',
      label: 'Weather shelter',
      state: typeof view.status === 'string' ? view.status : 'planned',
    },
    data: {
      view: {
        component: 'thatched-weather-shelter',
        status: 'in-progress',
        rods: LEGS,
        panels: [],
        materials: { covering: '#b6c27a', bedding: '#b6c27a' },
        bedding: { laid: 0, dry: true },
        joints: { lashed: 3, total: 34, weakest: 1, broken: 0 },
        work: { completed: 2, required: 10 },
        dripping: false,
        protectionActive: false,
        ...view,
      },
    },
    createdBy: 'kai',
    createdAt: 20,
    revision: 'construct-weather-shelter@1',
  };
}
const count = (svg: string, tag: string) =>
  svg.match(new RegExp(`<${tag} `, 'g'))?.length ?? 0;

it('draws an incomplete frame as unfinished, with only the laid rods and no covering', () => {
  expect(typeof CONTINUOUS_VISUALS['thatched-weather-shelter']).toBe(
    'function',
  );
  const svg = continuousObjectVisual(shelter({}), []);
  expect(svg).toContain('stroke-dasharray=".05 .04"');
  expect(count(svg, 'path')).toBe(6);
  // The floor outline only; no panel or bedding rectangle, drip or occupancy mark.
  expect(count(svg, 'rect')).toBe(1);
  expect(count(svg, 'circle')).toBe(0);
  expect(svg).toContain('<path d="M-0.4 -0.8L0 -0.8"');
  expect(svg).toContain('>Shelter in-progress 2 / 10</text>');
});

it('draws partial covering by laid panels and a complete shelter only after the final inspection', () => {
  const partial = continuousObjectVisual(
    shelter({
      rods: FRAME,
      panels: PANELS.slice(0, 4),
      work: { completed: 6, required: 10 },
    }),
    [],
  );
  expect(count(partial, 'rect')).toBe(5);
  expect(partial).toContain('stroke-dasharray=".05 .04"');
  expect(partial).toContain('>Shelter in-progress 6 / 10</text>');
  const complete = continuousObjectVisual(
    shelter({
      status: 'complete',
      rods: FRAME,
      panels: PANELS,
      bedding: { laid: 1, dry: true },
      work: { completed: 10, required: 10 },
    }),
    [],
  );
  expect(complete).not.toContain('stroke-dasharray');
  expect(count(complete, 'rect')).toBe(11);
  expect(complete).toContain('<rect x="-0.4" y="0.8" width="0.8" height="0.1"');
  expect(complete).toContain('>Shelter</text>');
  expect(complete).not.toContain('#7fb2d6');
  // An occupancy mark only while protection is active.
  const used = continuousObjectVisual(
    shelter({
      status: 'complete',
      rods: FRAME,
      panels: PANELS,
      bedding: { laid: 1, dry: true },
      protectionActive: true,
    }),
    [],
  );
  expect(used).toContain('<circle r=".12"');
  expect(used).toContain('>Shelter (sheltering)</text>');
});

it('draws gaps, drips, wet bedding, broken lashings and a collapse as state changes', () => {
  const worn = continuousObjectVisual(
    shelter({
      status: 'complete',
      rods: FRAME,
      panels: PANELS.map((p, i) =>
        i === 0 && p && typeof p === 'object' && !Array.isArray(p)
          ? { ...p, cover: 0.6 }
          : p,
      ),
      bedding: { laid: 1, dry: false },
      dripping: true,
    }),
    [],
  );
  expect(worn).toContain('stroke-dasharray=".03 .03"');
  expect(worn).toContain('stroke="#7fb2d6"');
  expect(count(worn, 'circle')).toBe(2);
  const collapsed = continuousObjectVisual(
    shelter({
      status: 'collapsed',
      rods: FRAME,
      panels: PANELS.map(() => panel('L-lower-0', 0)),
      joints: { lashed: 34, total: 34, weakest: 0.49, broken: 9 },
    }),
    [],
  );
  expect(collapsed).toContain('stroke="#8b8273"');
  expect(collapsed).toContain('stroke="#c0392b"');
  expect(collapsed).toContain('>Shelter collapsed');
  expect(collapsed).not.toContain('(sheltering)');
  // An unknown colour falls back to the neutral tint.
  const odd = continuousObjectVisual(
    shelter({ rods: [rod('leg-L-0', 'leg', { color: 'brown' })] }),
    [],
  );
  expect(odd).not.toContain('brown');
});
