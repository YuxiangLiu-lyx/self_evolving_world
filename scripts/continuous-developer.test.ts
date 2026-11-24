import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import { declaredDeveloper } from './continuous-source.js';

const ex13 = JSON.parse(
  readFileSync('experiment/ex13/initial.json', 'utf8'),
) as V7World;

it('accepts retained declarations without a developer and records a declared one', () => {
  const declaration = JSON.parse(
    readFileSync(
      'experiment/ex13/development/development-14-declaration.json',
      'utf8',
    ),
  ) as Record<string, unknown>;
  expect('developer' in declaration).toBe(false);
  expect(declaredDeveloper(declaration, ex13)).toBeUndefined();
  expect(
    declaredDeveloper({ developer: 'current-claude-conversation' }, ex13),
  ).toBe('current-claude-conversation');
  expect(() => declaredDeveloper({ developer: 'someone' }, ex13)).toThrow(
    'coding conversation',
  );
});

it('requires named long scenarios to record who developed each handoff', () => {
  const fixes = initialLongWorld('long-ex14', 'long-fixes');
  expect(() => declaredDeveloper({}, fixes)).toThrow('record its developer');
  expect(
    declaredDeveloper({ developer: 'current-claude-conversation' }, fixes),
  ).toBe('current-claude-conversation');
});
