import { expect, it } from 'vitest';
import {
  cameraRect,
  fitCamera,
  minimapPoint,
  wideMap,
  zoomLimit,
} from '../src/observatory-camera.js';

const stage = { width: 1040, height: 700 };

it('keeps the historical square framing for every map up to twice as wide as tall', () => {
  for (const map of [
    { width: 24, height: 24 },
    { width: 48, height: 36 },
    { width: 16, height: 12 },
  ]) {
    expect(wideMap(map)).toBe(false);
    expect(fitCamera(map, stage)).toEqual({
      x: 0,
      y: 0,
      size: Math.max(map.width, map.height),
    });
    expect(zoomLimit(map)).toBe(48);
    const camera = { x: 3, y: 4, size: 12 };
    expect(cameraRect(camera, map, stage)).toEqual({ ...camera, height: 12 });
  }
});

it('fits and centres a wide map on the stage and lets the zoom reach it', () => {
  const map = { width: 144, height: 36 };
  expect(wideMap(map)).toBe(true);
  const camera = fitCamera(map, stage);
  // The stage's shorter side is its height, so the whole width fits at 1040 / 144 px per unit.
  expect(camera.size).toBeCloseTo((144 * 700) / 1040, 9);
  const rect = cameraRect(camera, map, stage);
  expect(rect.x).toBeCloseTo(0, 9);
  expect(rect.size).toBeCloseTo(144, 9);
  expect(rect.y + rect.height / 2).toBeCloseTo(18, 9);
  expect(rect.height).toBeGreaterThan(36);
  expect(zoomLimit(map)).toBe(144);
  expect(camera.size).toBeLessThan(zoomLimit(map));
  // A tall stage fits the width in the same way.
  const phone = { width: 390, height: 560 };
  const portrait = cameraRect(fitCamera(map, phone), map, phone);
  expect(portrait.size).toBeCloseTo(144, 9);
  expect(portrait.x).toBeCloseTo(0, 9);
});

it('maps minimap clicks through the letterbox to the world point underneath', () => {
  const box = { left: 100, top: 50, width: 134, height: 134 };
  // A 48 x 36 map is drawn 134 x 100.5 px, 16.75 px below the top of its square box.
  const ex13 = { width: 48, height: 36 };
  expect(minimapPoint({ x: 100 + 67, y: 50 + 67 }, box, ex13)).toEqual({
    x: 24,
    y: 18,
  });
  expect(minimapPoint({ x: 100, y: 50 + 16.75 }, box, ex13)).toEqual({
    x: 0,
    y: 0,
  });
  // A square map fills the box exactly as before.
  expect(
    minimapPoint({ x: 100 + 33.5, y: 50 + 100.5 }, box, {
      width: 24,
      height: 24,
    }),
  ).toEqual({ x: 6, y: 18 });
  // Clicks on the letterbox clamp to the map edge.
  expect(minimapPoint({ x: 100, y: 50 }, box, ex13)).toEqual({ x: 0, y: 0 });
});
