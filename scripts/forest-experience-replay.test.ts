import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  v7Clone,
  v7Cursor,
  v7TaskAction,
  v7Step,
  v7FinishTasks,
  v7Signature,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7Action, V7Plan } from '@self-evolving-world/world-core';
import { initialForestExperienceWorld } from '../apps/simulator/src/forest-experience-scenario.js';
import { newContinuousExecution } from '../apps/simulator/src/continuous-run.js';
import {
  continuousSink,
  buildContinuousReplay,
  continuousRead,
  reconstructContinuousSegment,
} from './continuous-store.js';
import type { V7ReplaySegment } from './continuous-store.js';
import { replaySceneSegment } from '../apps/viewer/src/continuous-history.js';

describe('experience replay retains actual operation inputs', () => {
  it('reconstructs a resource-alias sample across a segment boundary without selecting reserved material or changing any events', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'experience-operation-replay-'));
    try {
      const initial = v7Clone(initialForestExperienceWorld());
      initial.objects = [];
      initial.processes = [];
      // Replay-boundary semantics need one actor and four cells per axis, not a full forest's repeated observations.
      initial.config.width = 4;
      initial.config.height = 4;
      initial.config.vision = 1;
      initial.terrain = ['....', '....', '....', '....'];
      initial.actors = initial.actors.slice(0, 1);
      initial.actors.forEach((a) => {
        a.position = { x: 2, y: 2 };
        a.memory.cells = [];
        a.memory.objects = [];
        a.memory.stacks = [];
      });
      initial.actors.forEach((a) => {
        a.vitals.satiety = 100;
      });
      const actor = initial.actors[0];
      if (!actor) throw new Error('Missing isolated actor');
      // Explicit isolated replay setup; real personal study is tested by the execution regressions.
      actor.mastered.push('assess-food');
      initial.stacks = [
        {
          id: 'isolated-nut',
          resource: 'hazelnut',
          quantity: 1,
          owner: actor.id,
          position: { ...actor.position },
          origin: 'isolated-replay',
        },
      ];
      const state = newContinuousExecution(
        'fixture-no-model',
        'isolated-fixture',
        initial,
      );
      const wait: V7Action = { interface: 'wait', args: {} };
      const plan: V7Plan = {
        intention: 'Isolated boundary sample',
        steps: [
          { action: wait, repeat: 98, until: null, guard: null },
          {
            action: {
              interface: 'assess-food',
              args: {
                target: 'resource:hazelnut',
                mode: 'sample',
                fraction: 0.2,
              },
            },
            repeat: 1,
            until: null,
            guard: null,
          },
        ],
        repeat: 1,
        until: null,
        interrupts: [],
        notes: [],
        preferences: [],
      };
      state.cursors.lin = v7Cursor(plan, 0);
      const sink = continuousSink(root, 'ex1');
      for (let n = 0; n < 103; n++) {
        const before = state.world,
          input = v7Clone(before);
        const actions = {
          lin: v7TaskAction(before, 'lin', state.cursors.lin) ?? wait,
          moss: wait,
          sol: wait,
        };
        const self = input.actors[0];
        if (!self) throw new Error('Missing actor');
        self.memory.notes = [];
        self.memory.preferences = [];
        self.memory.intention = plan.intention;
        const result = v7Step(
          input,
          actions,
          continuousRegistry(),
          state.cursors,
        );
        expect(result.outcomes.lin?.success).toBe(true);
        v7FinishTasks(before, result, state.cursors);
        state.world = result.world;
        await sink.round(
          {
            tick: state.world.tick,
            before: v7Signature(before),
            after: v7Signature(state.world),
            actions,
            reviews: [],
            registrations: [],
            memory: {
              lin: { notes: [], preferences: [], intention: plan.intention },
            },
            events: state.world.events,
            tasks: v7Clone(state.cursors),
          },
          state,
        );
      }
      const index = buildContinuousReplay(root, 'ex1', initial, state);
      expect(index.segments).toHaveLength(2);
      const frames = index.segments.map((p) =>
        reconstructContinuousSegment(
          continuousRead<V7ReplaySegment>(
            resolve(root, 'experiment/ex1', p.path),
          ),
        ),
      );
      expect(frames[1]?.at(-1)).toEqual(state.world);
      for (const [i, part] of index.segments.entries()) {
        const browserFrames = await replaySceneSegment(
          continuousRead<V7ReplaySegment>(
            resolve(root, 'experiment/ex1', part.path),
          ),
        );
        expect(browserFrames).toEqual(frames[i]);
      }
      const second = index.segments[1];
      if (!second) throw new Error('Missing second segment');
      const damaged = continuousRead<V7ReplaySegment>(
        resolve(root, 'experiment/ex1', second.path),
      );
      delete damaged.initialCursors;
      expect(() => reconstructContinuousSegment(damaged)).toThrow(
        'reconstruction disagrees',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
