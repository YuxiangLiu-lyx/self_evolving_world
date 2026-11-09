import { describe, expect, it } from 'vitest';
import {
  acceptLearningProgram,
  advanceLearningRound,
  createLearningRun,
  lastLearningFrame,
  learningData,
  pendingLearningPrograms,
  walkable,
  reconstructLearningRun,
} from '@self-evolving-world/world-core';
import {
  initialLearningWorld,
  learningScenario,
} from '../src/learning-scenario.js';
import {
  ordinaryLearningInput,
  worldLearningInput,
} from '../src/learning-input.js';
import {
  ORDINARY_LEARNING_PROMPT,
  WORLD_LEARNING_PROMPT,
} from '../src/learning-provider.js';
import {
  acceptDevelopment,
  continueLearningExecution,
  learningExecutionRun,
  newLearningExecution,
} from '../src/learning-run.js';
import type { LearningExecution } from '../src/learning-run.js';
import type { ProgramResponse } from '../src/survival-run.js';

function response(value: object): ProgramResponse {
  return {
    decision: {
      text: JSON.stringify(value),
      responseId: 'test-response',
      responseFormat: 'sse',
    },
    http: {
      status: 200,
      requestId: 'fixture',
      contentType: 'text/event-stream',
    },
  };
}
const request = {
  name: 'Nourishment',
  purpose: 'Use owned edible resources to restore satiety',
  target: 'Owned food unit',
  conditions: 'Appropriate food in inventory',
  expectedEffect: 'Nutrition with resource consumption and toxicity',
};
const learnCode = `learn(${JSON.stringify(request)}); wait(3);`;
function reviews(input: ReturnType<typeof worldLearningInput>, duration = 1) {
  return input.requests.map((r) => ({
    agentId: r.agentId,
    decision: 'create',
    reason: 'One round is sufficient to learn direct consumption.',
    prerequisites: ['Owned food for use'],
    learningRounds: duration,
    skillId: null,
    specification: {
      name: 'Nourish',
      description: 'Consume an owned resource.',
      parameters: ['food'],
      code: 'consume("food", 1);',
    },
  }));
}

describe('bounded learning experiment control', () => {
  it('provides reachable food in every initial window and paths across the river to distant resources', () => {
    const world = initialLearningWorld(),
      data = learningData(world);
    expect(world.settings).toMatchObject({ width: 24, height: 18 });
    for (const actor of world.agents) {
      const distances = new Map<string, number>([
          [`${String(actor.position.x)},${String(actor.position.y)}`, 0],
        ]),
        queue = [actor.position];
      for (let at = 0; at < queue.length; at++) {
        const p = queue[at];
        if (!p) throw Error('Missing BFS cell.');
        const d = distances.get(`${String(p.x)},${String(p.y)}`) ?? 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const q = { x: p.x + (dx ?? 0), y: p.y + (dy ?? 0) },
            key = `${String(q.x)},${String(q.y)}`;
          if (
            q.x < 0 ||
            q.x >= 24 ||
            q.y < 0 ||
            q.y >= 18 ||
            !walkable(data.environment, q) ||
            distances.has(key)
          )
            continue;
          distances.set(key, d + 1);
          queue.push(q);
        }
      }
      const food = world.items.find((i) => i.id === `${actor.id}-fruit`);
      expect(food).toBeDefined();
      expect(
        (distances.get(
          `${String(food?.position.x)},${String(food?.position.y)}`,
        ) ?? Infinity) + 3,
      ).toBeLessThanOrEqual(5);
      expect(distances.has('22,15')).toBe(true);
      expect(distances.has('2,16')).toBe(true);
    }
    expect(
      learningScenario().environment.resources.some((r) => r.toxicity > 0),
    ).toBe(true);
  });
  it('isolates actor inputs and keeps named skill examples only in the World Agent instructions', () => {
    const run = createLearningRun(initialLearningWorld()),
      a = ordinaryLearningInput(run, 'lin');
    expect(a.observation.self.id).toBe('lin');
    expect(JSON.stringify(a.environment)).not.toContain('sol-fruit');
    expect(a.recentFeedback).toEqual([]);
    expect(ORDINARY_LEARNING_PROMPT).not.toMatch(
      /\beat\b|fishing|tree.felling|spacecraft|shelter/i,
    );
    expect(WORLD_LEARNING_PROMPT).toMatch(/Learning eat/);
    expect(WORLD_LEARNING_PROMPT).toMatch(/3-4 rounds/);
    expect(WORLD_LEARNING_PROMPT).toMatch(/spacecraft/);
  });
  it('interrupts long waits on deterioration and on learning completion, preserving feedback for replanning', () => {
    let run = createLearningRun(initialLearningWorld());
    for (const id of pendingLearningPrograms(run))
      run = acceptLearningProgram(run, {
        agentId: id,
        tick: 0,
        call: 1,
        code: 'wait(4);',
        summary: 'Controlled waiting.',
      });
    for (let n = 0; n < 3; n++) run = advanceLearningRound(run, []);
    expect(pendingLearningPrograms(run)).toHaveLength(3);
    expect(ordinaryLearningInput(run, 'lin').interruption).toContain(
      'deteriorated',
    );
    expect(ordinaryLearningInput(run, 'lin').recentFeedback).toHaveLength(3);
    let learn = createLearningRun(initialLearningWorld());
    for (const id of pendingLearningPrograms(learn))
      learn = acceptLearningProgram(learn, {
        agentId: id,
        tick: 0,
        call: 1,
        code: learnCode,
        summary: 'Request functionality.',
      });
    learn = advanceLearningRound(
      learn,
      reviews(worldLearningInput(learn)) as Parameters<
        typeof advanceLearningRound
      >[1],
    );
    expect(pendingLearningPrograms(learn)).toHaveLength(3);
    expect(learn.cursors.lin?.remaining).toEqual([]);
    expect(ordinaryLearningInput(learn, 'lin').learnedSkills).toHaveLength(1);
  });
  it('persists a development barrier without a game tick, resumes it once and never repeats model decisions', async () => {
    let ordinaryCalls = 0,
      worldCalls = 0;
    const saved: LearningExecution[] = [];
    const state = await continueLearningExecution(
      newLearningExecution('fixture', 'simulated-test'),
      async (role, input) => {
        await Promise.resolve();
        if (role === 'ordinary') {
          ordinaryCalls++;
          return response({
            code: learnCode,
            summary: 'Request useful functionality.',
          });
        }
        worldCalls++;
        return response({
          reviews: reviews(input as ReturnType<typeof worldLearningInput>),
          needsDevelopment: true,
        });
      },
      async (s) => {
        await Promise.resolve();
        saved.push(structuredClone(s));
      },
    );
    expect(ordinaryCalls).toBe(3);
    expect(worldCalls).toBe(1);
    expect(state.phase).toBe('development');
    expect(lastLearningFrame(learningExecutionRun(state)).tick).toBe(0);
    expect(saved.some((s) => s.attempts.at(-1)?.status === 'started')).toBe(
      true,
    );
    const b = state.barrier;
    if (!b) throw Error('Missing development barrier.');
    expect(() =>
      acceptDevelopment(state, {
        barrierId: 'stale',
        tick: 0,
        reviews: reviews(b.input),
        notes: 'Reviewed bounded syntax and resource enforcement.',
      }),
    ).toThrow();
    const accepted = acceptDevelopment(state, {
      barrierId: b.id,
      tick: b.tick,
      reviews: reviews(b.input),
      notes:
        'Inspected generated code and fixed-resource runtime; no host code or direct vital assignments.',
    });
    expect(accepted.rounds).toHaveLength(0);
    expect(() => acceptDevelopment(accepted, {})).toThrow();
    const completed = await continueLearningExecution(
      accepted,
      async (role) => {
        await Promise.resolve();
        if (role === 'world')
          throw Error('Unexpected repeated World Agent call.');
        ordinaryCalls++;
        return response({
          code: 'wait(3);',
          summary: 'Controlled no-food baseline after learning.',
        });
      },
      async () => {},
    );
    expect(completed.phase).toBe('completed');
    expect(completed.rounds).toHaveLength(18);
    expect(completed.developments).toHaveLength(1);
    expect(completed.attempts.filter((a) => a.role === 'world')).toHaveLength(
      1,
    );
    expect(
      completed.attempts.filter((a) => a.role === 'ordinary' && a.tick === 0),
    ).toHaveLength(3);
    expect(
      lastLearningFrame(learningExecutionRun(completed)).learning?.vitals.lin
        ?.health,
    ).toBe(0);
    expect(() =>
      reconstructLearningRun(
        initialLearningWorld(),
        completed.programs,
        completed.rounds.map((r, n) =>
          n
            ? r
            : {
                ...r,
                actions: r.actions.map((a) => ({
                  type: 'wait',
                  agentId: a.agentId,
                })),
              },
        ),
      ),
    ).toThrow('disagree');
  });
  it('bounds invalid World Agent retries and blocks uncertain interrupted requests', async () => {
    let worldCalls = 0;
    const state = await continueLearningExecution(
      newLearningExecution('fixture', 'simulated-test'),
      async (role) => {
        await Promise.resolve();
        if (role === 'ordinary')
          return response({
            code: learnCode,
            summary: 'Request functionality.',
          });
        worldCalls++;
        return response({ bad: 'unsafe/invalid review' });
      },
      async () => {},
    );
    expect(worldCalls).toBe(2);
    expect(state.phase).toBe('development');
    expect(state.rounds).toEqual([]);
    let called = false;
    await expect(
      continueLearningExecution(
        {
          ...state,
          attempts: state.attempts.map((a, n) =>
            n === 0 ? { ...a, status: 'started' } : a,
          ),
        },
        async () => {
          await Promise.resolve();
          called = true;
          throw Error('Never call.');
        },
        async () => {},
      ),
    ).rejects.toThrow('uncertain');
    expect(called).toBe(false);
  });
});
