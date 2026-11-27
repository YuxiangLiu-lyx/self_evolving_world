import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  checkAnalysis,
  parseAnalysis,
  windowMaterial,
} from './experiment-review.js';

const root = process.cwd();
const earlier = JSON.parse(
  readFileSync('experiment/analyses/ex16/pr-39-culture-v2-run.json', 'utf8'),
) as { artifacts: Record<string, string> };

it('keeps the round-80 ex16 analysis bound to its preserved window after the extension', () => {
  expect(() => {
    checkAnalysis(root, 'ex16', 'pr-39-culture-v2-run');
  }).not.toThrow();
  const window = windowMaterial(root, 'ex16', earlier.artifacts);
  expect(window).toEqual(earlier.artifacts);
  // The preserved window is the round-80 manifest, not the extended one.
  expect(window?.['experiment/ex16/manifest.json']).toBe(
    earlier.artifacts['experiment/ex16/manifest.json'],
  );
});

it('rejects an analysis whose artifacts match neither the archive nor a preserved window', () => {
  const changed = { ...earlier.artifacts };
  changed['experiment/ex16/manifest.json'] = '0'.repeat(64);
  expect(windowMaterial(root, 'ex16', changed)).toBeNull();
  expect(() => parseAnalysis(root, { ...earlier, artifacts: changed })).toThrow(
    'Analysis artifacts changed',
  );
  // An archive that was never extended has no preserved window.
  expect(windowMaterial(root, 'ex15', earlier.artifacts)).toBeNull();
});

it('keeps the round-250 ex16 analysis bound through nested windows and the history of its time', () => {
  // The round-250 window includes the copies preserved at rounds 80 and 150 and the two-entry
  // window history that existed then; later extensions appended to that history.
  expect(() => {
    checkAnalysis(root, 'ex16', 'pr-42-culture-v2-extension');
  }).not.toThrow();
  const later = JSON.parse(
    readFileSync(
      'experiment/analyses/ex16/pr-42-culture-v2-extension.json',
      'utf8',
    ),
  ) as { artifacts: Record<string, string> };
  expect(
    Object.keys(later.artifacts).some((k) =>
      k.startsWith('experiment/ex16/windows/through-80/'),
    ),
  ).toBe(true);
  expect(windowMaterial(root, 'ex16', later.artifacts)).toEqual(
    later.artifacts,
  );
});
