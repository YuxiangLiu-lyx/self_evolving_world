import { describe, expect, it } from 'vitest';
import {
  createEvolutionRun,
  evolutionData,
  eWalkable,
  isVisible,
  lastEvolutionFrame,
} from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from '../src/evolution-scenario.js';
import {
  ordinaryEvolutionInput,
  type worldEvolutionInput,
} from '../src/evolution-input.js';
import {
  ORDINARY_EVOLUTION_PROMPT,
  WORLD_EVOLUTION_PROMPT,
} from '../src/evolution-provider.js';
import {
  acceptDevelopment,
  continueEvolutionExecution,
  evolutionExecutionRun,
  newEvolutionExecution,
} from '../src/evolution-run.js';
import type { ProgramResponse } from '../src/survival-run.js';
import {
  auditEvolution,
  evolutionCallArchive,
  measureEvolution,
} from '../../../scripts/evolution-analysis.js';
import { evolutionSmoke } from '../../../scripts/evolution-smoke.js';
import { parseReplay, serializeReplay } from '../../viewer/src/timeline.js';
let sequence = 0;
const response = (value: object): ProgramResponse => ({
  decision: {
    text: JSON.stringify(value),
    responseId: `offline-${String(++sequence)}`,
    responseFormat: 'sse',
  },
  http: { status: 200, requestId: null, contentType: 'text/event-stream' },
});
const request = {
  name: 'Resource observation',
  purpose: 'Understand local material properties',
  target: 'An owned or nearby object',
  conditions: 'Within reach',
  expectedEffect: 'Learn properties without creating resources',
};
const code = `learn(${JSON.stringify(request)});`;
function proposal(input: ReturnType<typeof worldEvolutionInput>) {
  return {
    resources: [],
    ecology: [],
    mechanics: [
      {
        id: 'examination',
        name: 'Examination',
        description: 'Identify an adjacent or owned material',
        parameters: ['subject'],
        code: JSON.stringify([
          {
            op: 'identify',
            target: 'subject',
            resource: null,
            quantity: 1,
            costs: [],
            tool: null,
            chance: 100,
          },
        ]),
      },
    ],
    reviews: input.requests.map((r) => ({
      agentId: r.agentId,
      decision: 'create',
      reason: 'Simple observations require one learning round.',
      prerequisites: ['Reachable material'],
      learningRounds: 1,
      mechanicId: 'examination',
    })),
  };
}
describe('heterogeneous evolution runtime', () => {
  it('connects distinct regions and reachable initial food without enough local energy for 120 rounds', () => {
    const world = initialEvolutionWorld(),
      data = evolutionData(world);
    expect(world.settings).toMatchObject({ width: 48, height: 48 });
    for (const actor of world.agents) {
      const distance = new Map([
          [`${String(actor.position.x)},${String(actor.position.y)}`, 0],
        ]),
        queue = [actor.position];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        if (!p) throw Error('Missing cell.');
        const d = distance.get(`${String(p.x)},${String(p.y)}`) ?? 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const q = { x: p.x + dx, y: p.y + dy },
            key = `${String(q.x)},${String(q.y)}`;
          if (eWalkable(data, q) && !distance.has(key)) {
            distance.set(key, d + 1);
            queue.push(q);
          }
        }
      }
      for (const other of world.agents)
        expect(
          distance.has(
            `${String(other.position.x)},${String(other.position.y)}`,
          ),
        ).toBe(true);
      const nearby = data.stacks.filter(
        (s) => s.position && isVisible(actor.position, s.position, 5),
      );
      expect(
        nearby.some(
          (s) =>
            s.position &&
            (distance.get(`${String(s.position.x)},${String(s.position.y)}`) ??
              Infinity) +
              3 <
              30 &&
            (data.types.find((t) => t.id === s.type)?.nutrition ?? 0) > 0,
        ),
      ).toBe(true);
      const initialEnergy = nearby.reduce(
          (n, s) =>
            n +
            s.quantity *
              (data.types.find((t) => t.id === s.type)?.nutrition ?? 0),
          0,
        ),
        potential = data.sites
          .filter((s) => isVisible(actor.position, s.position, 5))
          .reduce((n, s) => n + s.capacity * s.energyLimit, 0);
      expect(60 + initialEnergy + potential).toBeLessThan(240);
    }
    expect(data.types.some((t) => t.id === 'fish')).toBe(false);
  });
  it('does not leak distant locations, private actor data or unfamiliar toxicity', () => {
    const run = createEvolutionRun(initialEvolutionWorld()),
      a = ordinaryEvolutionInput(run, 'reed');
    expect(a.resources.every((r) => r.knownProperties === null)).toBe(true);
    expect(a.experience.knownTypes).toEqual([]);
    expect(a.visibleAgents).toEqual([]);
    expect(JSON.stringify(a)).not.toContain('forest-fallen');
    expect(JSON.stringify(a)).not.toContain('"toxicity":18');
    expect(ORDINARY_EVOLUTION_PROMPT).not.toMatch(
      /fishing|shelter|tree.cutting|fruit.gathering|spacecraft/i,
    );
    expect(WORLD_EVOLUTION_PROMPT).toContain('fishing about3-4');
  });
  it('runs the short offline smoke with no inference and round-trips version 5', () => {
    const smoke = evolutionSmoke();
    expect(smoke.externalModelCalls).toBe(0);
    expect(smoke.finalVitals.lin?.satiety).toBe(52);
  });
  it('pauses development at the same tick, resumes once, and audits every retained private input', async () => {
    let worldCalls = 0;
    const state = await continueEvolutionExecution(
      newEvolutionExecution('offline-fixture', 'simulated-test'),
      async (role, input) => {
        await Promise.resolve();
        if (role === 'ordinary')
          return response({
            code,
            summary: 'Offline fixture requesting local identification.',
          });
        worldCalls++;
        return response({
          proposal: proposal(input as ReturnType<typeof worldEvolutionInput>),
          needsDevelopment: true,
        });
      },
      async () => {},
    );
    expect(state.phase).toBe('development');
    expect(state.rounds).toHaveLength(0);
    expect(worldCalls).toBe(1);
    expect(state.programs).toHaveLength(4);
    const barrier = state.barrier;
    if (!barrier) throw Error('Missing barrier.');
    expect(() =>
      acceptDevelopment(state, {
        barrierId: 'wrong',
        tick: 0,
        proposal: proposal(barrier.input),
        notes: 'Inspect constrained code and physical effect boundaries.',
      }),
    ).toThrow();
    const accepted = acceptDevelopment(state, {
      barrierId: barrier.id,
      tick: 0,
      proposal: proposal(barrier.input),
      notes:
        'Offline fixture review: identification only, no state injection and no material creation.',
    });
    expect(accepted.rounds).toHaveLength(0);
    expect(() => acceptDevelopment(accepted, {})).toThrow();
    const completed = await continueEvolutionExecution(
      accepted,
      async (role) => {
        await Promise.resolve();
        if (role === 'world') throw Error('Repeated world call.');
        return response({
          code: 'wait(12);',
          summary: 'Offline no-food baseline.',
        });
      },
      async () => {},
    );
    expect(completed.phase).toBe('completed');
    expect(completed.rounds).toHaveLength(120);
    expect(completed.attempts.filter((a) => a.role === 'world')).toHaveLength(
      1,
    );
    const run = auditEvolution(completed);
    expect(lastEvolutionFrame(run).evolution?.vitals.lin?.health).toBe(0);
    const replay = serializeReplay({
      schedule: 'evolution-v1',
      frames: run.frames,
      evolutionPrograms: run.programs,
      evolutionRounds: run.rounds,
    });
    expect(parseReplay(replay).frames).toEqual(run.frames);
    expect(() =>
      measureEvolution(
        'ex99',
        'Offline fixture, never real evidence.',
        completed,
        evolutionCallArchive(completed),
      ),
    ).toThrow('real-model');
    expect(() =>
      auditEvolution({
        ...completed,
        attempts: completed.attempts.map((a, i) =>
          i ? a : { ...a, input: { ...a.input, tick: 999 } },
        ),
      }),
    ).toThrow('input');
    expect(() =>
      auditEvolution({
        ...completed,
        rounds: completed.rounds.map((r, i) =>
          i
            ? r
            : {
                ...r,
                proposal: {
                  resources: [],
                  ecology: [],
                  mechanics: [],
                  reviews: [],
                },
              },
        ),
      }),
    ).toThrow('bypassed');
    expect(evolutionExecutionRun(completed).rounds).toHaveLength(120);
  });
  it('bounds invalid world responses and refuses uncertain requests without retrying', async () => {
    const state = await continueEvolutionExecution(
      newEvolutionExecution('fixture', 'simulated-test'),
      async (role) => {
        await Promise.resolve();
        return response(
          role === 'ordinary'
            ? { code, summary: 'Offline request.' }
            : { invalid: true },
        );
      },
      async () => {},
    );
    expect(state.attempts.filter((a) => a.role === 'world')).toHaveLength(2);
    expect(state.rounds).toEqual([]);
    let called = false;
    await expect(
      continueEvolutionExecution(
        {
          ...state,
          attempts: state.attempts.map((a, i) =>
            i ? a : { ...a, status: 'started' },
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
