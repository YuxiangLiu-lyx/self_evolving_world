import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  acceptEvolutionProgram,
  createEvolutionRun,
  evolutionData,
  eWalkable,
  isVisible,
  pendingEvolutionPrograms,
} from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from '../src/evolution-scenario.js';
import {
  ordinaryEvolutionInput,
  worldEvolutionInput,
} from '../src/evolution-input.js';
import {
  ORDINARY_EVOLUTION_PROMPT,
  WORLD_EVOLUTION_PROMPT,
} from '../src/evolution-provider.js';
import {
  acceptDevelopment,
  evolutionExecutionRun,
} from '../src/evolution-run.js';
import type { EvolutionExecution } from '../src/evolution-run.js';
import {
  auditEvolution,
  evolutionCallArchive,
  measureEvolution,
  readEvolutionExecution,
} from '../../../scripts/evolution-analysis.js';
import { evolutionSmoke } from '../../../scripts/evolution-smoke.js';
import { parseReplay, serializeReplay } from '../../viewer/src/timeline.js';
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
  it('accepts development only at the saved barrier without advancing time', () => {
    let run = createEvolutionRun(initialEvolutionWorld());
    for (const agentId of pendingEvolutionPrograms(run))
      run = acceptEvolutionProgram(run, {
        agentId,
        tick: 0,
        call: 1,
        code,
        summary: 'Offline fixture requesting local identification.',
      });
    const input = worldEvolutionInput(run);
    const state: EvolutionExecution = {
      version: 1,
      controller: 'simulated-test',
      model: 'offline-fixture',
      programs: run.programs,
      rounds: run.rounds,
      attempts: [],
      developments: [],
      phase: 'development',
      barrier: {
        id: 'round-0-world-1',
        tick: 0,
        input,
        errors: [],
        proposed: null,
      },
    };
    expect(() =>
      acceptDevelopment(state, {
        barrierId: 'wrong',
        tick: 0,
        proposal: proposal(input),
        notes: 'Inspect constrained code and physical effect boundaries.',
      }),
    ).toThrow();
    const accepted = acceptDevelopment(state, {
      barrierId: 'round-0-world-1',
      tick: 0,
      proposal: proposal(input),
      notes:
        'Offline fixture review: identification only, no state injection and no material creation.',
    });
    expect(accepted.phase).toBe('running');
    expect(accepted.rounds).toHaveLength(0);
    expect(accepted.developments).toHaveLength(1);
    expect(() => acceptDevelopment(accepted, {})).toThrow();
  });
  it('audits every retained private input of the archived run and rejects bypassed reviews or simulated provenance', () => {
    const archived = readEvolutionExecution(
      JSON.parse(readFileSync('experiment/ex5/execution.json', 'utf8')),
    );
    const run = auditEvolution(archived);
    expect(evolutionExecutionRun(archived).rounds).toHaveLength(120);
    const replay = serializeReplay({
      schedule: 'evolution-v1',
      frames: run.frames,
      evolutionPrograms: run.programs,
      evolutionRounds: run.rounds,
    });
    expect(parseReplay(replay).frames).toEqual(run.frames);
    const simulated = { ...archived, controller: 'simulated-test' as const };
    expect(() =>
      measureEvolution(
        'ex99',
        'Offline fixture, never real evidence.',
        simulated,
        evolutionCallArchive(simulated),
      ),
    ).toThrow('real-model');
    expect(() =>
      auditEvolution({
        ...archived,
        attempts: archived.attempts.map((a, i) =>
          i ? a : { ...a, input: { ...a.input, tick: 999 } },
        ),
      }),
    ).toThrow('input');
    expect(() =>
      auditEvolution({
        ...archived,
        rounds: archived.rounds.map((r, i) =>
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
  });
});
