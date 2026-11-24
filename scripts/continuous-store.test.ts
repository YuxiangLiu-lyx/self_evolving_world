import { initialForestExperienceWorld } from '../apps/simulator/src/forest-experience-scenario.js';
import { initialForestWorld } from '../apps/simulator/src/forest-scenario.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import {
  newContinuousExecution,
  continueContinuousExecution,
  extendContinuousWindow,
} from '../apps/simulator/src/continuous-run.js';
import type { V7Provider } from '../apps/simulator/src/continuous-provider.js';
import {
  continuousSink,
  continuousAtomic,
  buildContinuousReplay,
  continuousRead,
  reconstructContinuousSegment,
  readContinuousExecution,
  continuousHash,
} from './continuous-store.js';
import type { V7ReplaySegment } from './continuous-store.js';

describe('continuous durable segmented evidence', () => {
  it('binds the new experience checkpoint to its exact 650/60/20 budgets and immutable mental policy', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'experience-checkpoint-'));
    try {
      const state = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialForestExperienceWorld(),
      );
      const path = resolve(root, 'experiment/ex1/execution.json');
      continuousAtomic(path, state);
      expect(readContinuousExecution(root, 'ex1')).toEqual(state);
      expect(state.windowTarget).toBe(1200);
      const altered = v7Clone(state);
      if (!altered.world.config.experience) throw new Error('Missing policy');
      altered.world.config.experience.restMin = 0.1;
      continuousAtomic(path, altered);
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('accepts an unchanged forest checkpoint and rejects altered forest budgets or hunger', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'forest-checkpoint-'));
    try {
      const state = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialForestWorld(),
      );
      const path = resolve(root, 'experiment/ex1/execution.json');
      continuousAtomic(path, state);
      expect(readContinuousExecution(root, 'ex1')).toEqual(state);
      const altered = v7Clone(state);
      altered.world.config.budgets.ordinary += 1;
      continuousAtomic(path, altered);
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
      altered.world.config.budgets.ordinary -= 1;
      altered.world.config.hunger += 0.01;
      continuousAtomic(path, altered);
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('recovers the committed world after interruption, reconstructs fractional navigation and preserves a shorter window when continued', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'continuous-journal-'));
    try {
      const initial = newContinuousExecution('fixture', 'isolated-fixture');
      initial.windowTarget = 6;
      const provider: V7Provider = (_role, input) => {
        if (!('identity' in input))
          throw new Error('Unexpected fixture review.');
        return Promise.resolve({
          text: JSON.stringify({
            intention: '',
            steps: [
              {
                action: {
                  interface: 'navigate',
                  args: {
                    target: '',
                    x: input.state.position.x + 0.7,
                    y: input.state.position.y + 0.3,
                  },
                },
                repeat: 1,
                until: null,
                guard: null,
              },
              {
                action: { interface: 'wait', args: {} },
                repeat: 20,
                until: null,
                guard: null,
              },
            ],
            repeat: 1,
            until: null,
            interrupts: [],
            notes: [],
            preferences: [],
          }),
          responseId: 'fixture',
          usage: null,
          http: { status: 200, requestId: null, contentType: null },
          evidence: 'Isolated fixture only.',
        });
      };
      const sink = continuousSink(root, 'ex1'),
        saved = await continueContinuousExecution(initial, provider, sink);
      const index = buildContinuousReplay(root, 'ex1', initial.world, saved),
        part = present(index.segments[0]);
      const segment = continuousRead<V7ReplaySegment>(
        resolve(root, 'experiment/ex1', part.path),
      );
      expect(reconstructContinuousSegment(segment).at(-1)).toEqual(saved.world);
      rmSync(resolve(root, 'validation-results/continuous/ex1/rounds'), {
        recursive: true,
      });
      const next = await continueContinuousExecution(
        extendContinuousWindow(saved, 9),
        provider,
        sink,
      );
      const longer = buildContinuousReplay(root, 'ex1', initial.world, next);
      expect(longer.segments[0]?.path).not.toBe(part.path);
      expect(
        continuousRead<V7ReplaySegment>(
          resolve(root, 'experiment/ex1', part.path),
        ),
      ).toEqual(segment);
      expect(next.attempts).toHaveLength(3);
      const interrupted = v7Clone(next);
      interrupted.world = present(
        reconstructContinuousSegment(
          continuousRead<V7ReplaySegment>(
            resolve(root, 'experiment/ex1', present(longer.segments[0]).path),
          ),
        ).at(-2),
      );
      continuousAtomic(
        resolve(root, 'experiment/ex1/execution.json'),
        interrupted,
      );
      const recovered = readContinuousExecution(root, 'ex1');
      expect(recovered.world.tick).toBe(9);
      expect(continuousHash(recovered.world)).toBe(continuousHash(next.world));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required fixture value is missing.');
  return value;
}

it('binds fresh checkpoint scope and baseline, preserves projects through real replay records, and rejects cross-experiment recovery', async () => {
  const { initialOpenWorld } =
    await import('../apps/simulator/src/open-scenario.js');
  const root = mkdtempSync(resolve(tmpdir(), 'open-checkpoint-'));
  try {
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialOpenWorld('open-ex1'),
    );
    const path = resolve(root, 'experiment/ex1/execution.json');
    continuousAtomic(path, state);
    expect(readContinuousExecution(root, 'ex1')).toEqual(state);
    const altered = v7Clone(state);
    if (!altered.world.config.development)
      throw new Error('Missing fresh config');
    altered.world.config.development.scope = 'open-ex2';
    continuousAtomic(path, altered);
    expect(() => readContinuousExecution(root, 'ex1')).toThrow(
      /protected run configuration/,
    );
    const project = {
      id: 'question',
      status: 'active',
      question: 'A test question',
      evidence: [],
      uncertainty: 'Unknown',
      goal: 'Test continuity',
      completedSteps: [],
      outputs: [],
      missing: 'Evidence',
      next: 'Observe',
      pauseReason: '',
      benefit: '',
    };
    const provider: V7Provider = () =>
      Promise.resolve({
        text: JSON.stringify({
          intention: 'fixture',
          steps: [
            {
              action: { interface: 'wait', args: {} },
              repeat: 3,
              until: null,
              guard: null,
            },
          ],
          repeat: 1,
          until: null,
          interrupts: [],
          notes: [],
          preferences: [],
          projects: [project],
        }),
        responseId: 'fixture',
        usage: { inputTokens: 1, outputTokens: 1 },
        http: { status: 200, requestId: null, contentType: 'application/json' },
        evidence: 'isolated fixture only',
      });
    state.windowTarget = 3;
    const final = await continueContinuousExecution(
      state,
      provider,
      continuousSink(root, 'ex1'),
    );
    const index = buildContinuousReplay(root, 'ex1', state.world, final);
    const part = index.segments[0];
    if (!part) throw new Error('Missing segment');
    const frames = reconstructContinuousSegment(
      continuousRead<V7ReplaySegment>(
        resolve(root, 'experiment/ex1', part.path),
      ),
    );
    expect(frames.at(-1)?.actors[0]?.memory.projects?.question).toMatchObject(
      project,
    );
    expect(frames.at(-1)).toEqual(final.world);
    expect(final.attempts).toHaveLength(3);
    expect(final.attempts.every((a) => (a.contextBytes ?? 0) > 0)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('binds the long-run checkpoint to its fresh scope and frozen environment policy', async () => {
  const { initialLongWorld } =
    await import('../apps/simulator/src/long-scenario.js');
  const root = mkdtempSync(resolve(tmpdir(), 'long-checkpoint-'));
  try {
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialLongWorld('long-ex1'),
    );
    const path = resolve(root, 'experiment/ex1/execution.json');
    continuousAtomic(path, state);
    expect(readContinuousExecution(root, 'ex1')).toEqual(state);
    const altered = v7Clone(state);
    if (!altered.world.config.longDevelopment)
      throw new Error('Missing policy');
    altered.world.config.longDevelopment.cold = 9;
    continuousAtomic(path, altered);
    expect(() => readContinuousExecution(root, 'ex1')).toThrow(
      'protected run configuration',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('binds the long-fixes checkpoint to its own frozen fixes and limits', async () => {
  const { initialLongWorld } =
    await import('../apps/simulator/src/long-scenario.js');
  const root = mkdtempSync(resolve(tmpdir(), 'long-fixes-checkpoint-'));
  try {
    const state = newContinuousExecution(
      'fixture',
      'isolated-fixture',
      initialLongWorld('long-ex1', 'long-fixes'),
    );
    expect(state.windowTarget).toBe(40);
    const path = resolve(root, 'experiment/ex1/execution.json');
    continuousAtomic(path, state);
    expect(readContinuousExecution(root, 'ex1')).toEqual(state);
    const altered = v7Clone(state);
    altered.world.config.budgets.development = 15;
    continuousAtomic(path, altered);
    expect(() => readContinuousExecution(root, 'ex1')).toThrow(
      'protected run configuration',
    );
    const untagged = v7Clone(state);
    delete untagged.world.config.longDevelopment?.scenario;
    continuousAtomic(path, untagged);
    expect(() => readContinuousExecution(root, 'ex1')).toThrow(
      'protected run configuration',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('binds both culture checkpoints to their frozen switches and budget mechanics', async () => {
  const { initialLongWorld } =
    await import('../apps/simulator/src/long-scenario.js');
  const root = mkdtempSync(resolve(tmpdir(), 'long-culture-checkpoint-'));
  try {
    for (const scenario of [
      'long-culture',
      'long-culture-incentives',
    ] as const) {
      const state = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialLongWorld('long-ex1', scenario),
      );
      expect(state.windowTarget).toBe(80);
      const path = resolve(root, 'experiment/ex1/execution.json');
      continuousAtomic(path, state);
      expect(readContinuousExecution(root, 'ex1')).toEqual(state);
      // An extension changes only the window, never the frozen configuration.
      const extended = v7Clone(state);
      extended.windowTarget = 250;
      continuousAtomic(path, extended);
      expect(readContinuousExecution(root, 'ex1').windowTarget).toBe(250);
      for (const alter of [
        (s: typeof state) => {
          s.world.config.budgets.development = 16;
        },
        (s: typeof state) => {
          s.world.config.longDevelopment?.tokenCeilings?.splice(0, 1);
        },
        (s: typeof state) => {
          const culture = s.world.config.longDevelopment?.culture;
          if (culture) culture.incentives = !culture.incentives;
        },
        (s: typeof state) => {
          delete s.world.config.longDevelopment?.scenario;
        },
      ]) {
        const altered = v7Clone(state);
        alter(altered);
        continuousAtomic(path, altered);
        expect(() => readContinuousExecution(root, 'ex1')).toThrow(
          'protected run configuration',
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
