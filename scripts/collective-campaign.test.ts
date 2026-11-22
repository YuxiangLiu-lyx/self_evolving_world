import { afterEach, describe, expect, it, vi } from 'vitest';
import { newContext, parseIntent } from './task-context.js';
import { LocalTaskEffects } from './task-runtime.js';
import { continuousCheckpoint } from './continuous-files.js';
import { prepareContinuousWindow } from './continuous-window.js';
import { newContinuousExecution } from '../apps/simulator/src/continuous-run.js';
import {
  initialCollectiveWorld,
  collectivePhysicalGenesis,
} from '../apps/simulator/src/collective-scenario.js';
import { restoreUnstartedCollectiveArm } from './task-continuous-repair.js';
import { v7Clone } from '@self-evolving-world/world-core';

vi.mock('./continuous-files.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  continuousCheckpoint: vi.fn(),
}));
vi.mock('./continuous-window.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  prepareContinuousWindow: vi.fn(),
}));
const basis = {
  source: 'task-instruction',
  reference: 'Isolated coordinator fixture',
  quote: 'Run an isolated local fixture; do not publish or invoke any model.',
};
function intent() {
  return {
    id: 'fixture-collective',
    task: 'Collective coordinator fixture',
    request: 'Test allocation, pause and actual checkpoint continuation.',
    plan: 'docs/exec-plans/active/pr-99-fixture.md',
    requirementsVersion: 1,
    requestedType: 'mixed',
    experiment: {
      mode: 'continuous',
      allocation: 'new',
      comparison: 'collective-life-v1',
      basis,
    },
    analyze: [],
    delivery: { mode: 'local-only', basis },
    merge: { status: 'forbidden', basis },
  };
}
afterEach(() => vi.restoreAllMocks());
describe('collective campaign adapter inside the existing task coordinator', () => {
  it.each(['window-complete', 'budget-paused'] as const)(
    'allocates A and B once, preserves handoffs and continues the %s B checkpoint',
    async (ending) => {
      const c = newContext(parseIntent(intent())),
        effects = new LocalTaskEffects('/fixture-only', () => {});
      const checkpoint = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialCollectiveWorld('collective-ex12', 'B'),
      );
      checkpoint.world = v7Clone(checkpoint.world);
      checkpoint.world.tick = ending === 'window-complete' ? 200 : 80;
      checkpoint.windowTarget = 200;
      checkpoint.phase =
        ending === 'window-complete' ? 'window-complete' : 'paused';
      checkpoint.reason =
        ending === 'budget-paused'
          ? 'ordinary attempted-call budget exhausted.'
          : null;
      vi.mocked(continuousCheckpoint).mockReturnValue(checkpoint);
      let first = true;
      const stages: string[] = [];
      vi.spyOn(effects, 'singleExperiment').mockImplementation((context) => {
        const stage = context.comparison?.stage ?? '';
        stages.push(stage);
        context.experiment ??= {
          before: [],
          phase: 'started',
          id: stage === 'A' ? 'ex11' : 'ex12',
        };
        if (first) {
          first = false;
          return Promise.resolve({
            experiment: 'ex11',
            barrier: { retained: true },
            schema: 'existing handoff',
          });
        }
        context.experiment.phase = 'recorded';
        return Promise.resolve(undefined);
      });
      expect((await effects.experiment(c, () => {}))?.experiment).toBe('ex11');
      expect(c.comparison?.stage).toBe('A');
      await effects.experiment(c, () => {});
      expect(stages).toEqual(['A', 'A', 'B-short', 'B-long']);
      expect(c.comparison).toEqual({ stage: 'complete', a: 'ex11', b: 'ex12' });
      expect(prepareContinuousWindow).toHaveBeenCalledExactlyOnceWith(
        '/fixture-only',
        'ex12',
        1600,
      );
    },
  );
  it('does not continue an unexplained or technical short pause', async () => {
    const c = newContext(parseIntent(intent())),
      effects = new LocalTaskEffects('/fixture-only', () => {});
    const checkpoint = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialCollectiveWorld('collective-ex12', 'B'),
    );
    checkpoint.world = v7Clone(checkpoint.world);
    checkpoint.world.tick = 80;
    checkpoint.phase = 'paused';
    vi.mocked(continuousCheckpoint).mockReturnValue(checkpoint);
    vi.mocked(prepareContinuousWindow).mockClear();
    vi.spyOn(effects, 'singleExperiment').mockImplementation((context) => {
      context.experiment = {
        before: [],
        phase: 'recorded',
        id: context.comparison?.stage === 'A' ? 'ex11' : 'ex12',
      };
      return Promise.resolve(undefined);
    });
    await expect(effects.experiment(c, () => {})).rejects.toThrow(
      'unresolved technical pause',
    );
    expect(c.comparison?.stage).toBe('A');
    expect(prepareContinuousWindow).not.toHaveBeenCalled();
  });
  it('rejects reuse-mode comparisons and detects any physical baseline change while allowing the declared treatment', () => {
    const malformed = intent();
    malformed.experiment.allocation = 'reuse';
    expect(() => parseIntent(malformed)).toThrow(/newly allocated/);
    const a = initialCollectiveWorld('collective-ex11', 'A'),
      b = v7Clone(initialCollectiveWorld('collective-ex12', 'B'));
    expect(collectivePhysicalGenesis(a)).toBe(collectivePhysicalGenesis(b));
    b.config.hunger += 0.1;
    expect(collectivePhysicalGenesis(a)).not.toBe(collectivePhysicalGenesis(b));
  });
});

it('restores only the accidentally advanced, unallocated startup relation and refuses a new allocated arm', () => {
  const c = newContext(parseIntent(intent())),
    prior = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialCollectiveWorld('collective-ex11', 'A'),
    );
  prior.phase = 'paused';
  prior.reason =
    'Observation input exceeds computational context protection; no hidden truncation or inference.';
  c.status = 'needs_fix';
  c.comparison = { stage: 'B-short', a: 'ex11' };
  c.experiment = {
    before: ['ex1', 'ex11'],
    phase: 'started',
    error:
      'pnpm experiment:continuous failed (143). Retained actual startup failure fixture.',
  };
  const allocated = v7Clone(c);
  if (!allocated.experiment) throw new Error('Missing journal.');
  allocated.experiment.id = 'ex12';
  expect(() => {
    restoreUnstartedCollectiveArm(allocated, prior, ['ex1', 'ex11', 'ex12']);
  }).toThrow('Cannot restore');
  expect(() => {
    restoreUnstartedCollectiveArm(v7Clone(c), prior, ['ex1', 'ex11', 'ex12']);
  }).toThrow('Cannot restore');
  restoreUnstartedCollectiveArm(c, prior, ['ex1', 'ex11']);
  expect(c.comparison.stage).toBe('A');
  expect(c.experiment).toEqual({
    id: 'ex11',
    before: ['ex1'],
    phase: 'recorded',
  });
  expect(c.history.at(-1)?.detail).toContain('no call, world, budget');
});
