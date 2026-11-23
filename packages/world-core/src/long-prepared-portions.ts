import type { V7Data, V7Spatial } from './continuous-types.js';
import { v7Number } from './continuous-data.js';
export function preparedPortions(value: unknown): V7Spatial[] {
  if (!Array.isArray(value))
    throw new Error(
      'Unsupported material representation; clearance remains unknown.',
    );
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Invalid material extent; clearance remains unknown.');
    const e = entry as V7Data;
    if (v7Number(e.mass, 'represented mass', 0) === 0) return [];
    return [
      {
        x: v7Number(e.x, 'material x'),
        y: v7Number(e.y, 'material y'),
        angle: 0,
        shape: {
          kind: 'circle' as const,
          radius: v7Number(e.radius, 'material radius', 0.001),
        },
        solid: true,
        interaction: 0,
        entrances: [],
      },
    ];
  });
}
