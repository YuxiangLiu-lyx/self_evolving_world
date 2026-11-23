import { expect, it } from 'vitest';
import { sameDevelopmentBaseline } from './continuous-source.js';
it('keeps the original source receipt while allowing only non-runtime source changes after the runtime guard', () => {
  const saved = {
    world: 'world',
    attempts: 'calls',
    barrier: 'barrier',
    history: 'history',
    source: 'a'.repeat(64),
  };
  const current = { ...saved, source: 'b'.repeat(64) };
  expect(sameDevelopmentBaseline(saved, current)).toBe(true);
  for (const key of ['world', 'attempts', 'barrier', 'history'] as const)
    expect(
      sameDevelopmentBaseline(saved, { ...current, [key]: 'changed' }),
    ).toBe(false);
  expect(sameDevelopmentBaseline({ ...saved, source: null }, current)).toBe(
    false,
  );
  expect(saved.source).toBe('a'.repeat(64));
});
