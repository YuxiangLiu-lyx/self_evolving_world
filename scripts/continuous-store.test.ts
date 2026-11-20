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
