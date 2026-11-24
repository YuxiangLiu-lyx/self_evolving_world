import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coevolutionPreflight } from '../../../scripts/coevolution-preflight.js';
import {
  auditCoevolution,
  readCoevolutionExecution,
} from '../../../scripts/coevolution-analysis.js';
import { acceptCDevelopment } from '../src/coevolution-run.js';
import type { CoevolutionExecution } from '../src/coevolution-run.js';
import {
  coevolutionRequest,
  ORDINARY_COEVOLUTION_PROMPT,
} from '../src/coevolution-provider.js';
import {
  acceptCoevolutionProgram,
  createCoevolutionRun,
  EMPTY_COEVOLUTION_PROPOSAL,
  pendingCoevolutionPrograms,
} from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../src/coevolution-scenario.js';
import {
  ordinaryCoevolutionInput,
  worldCoevolutionInput,
} from '../src/coevolution-input.js';
const project = {
  problem: 'Repeated physical work',
  reason: 'Preserve health and energy',
  progress: 'Observing requirements',
  missing: 'Verified material effect',
  observedEffects: 'None',
};
const request = {
  name: 'Reduce effort',
  purpose: 'Use materials to reduce effort',
  target: 'Owned material',
  conditions: 'Costed physical construction',
  expectedEffect: 'Persistent efficiency improvement',
};
describe('coevolution feasibility, disclosure and archive audit', () => {
  it('proves three connected sustainable starts offline without adding fixtures to model context', () => {
    const p = coevolutionPreflight();
    expect(p.rounds).toBe(180);
    expect(Object.values(p.finalVitals).every((v) => v.health === 100)).toBe(
      true,
    );
    expect(p.starts.map((s) => s.firstFoodDistance)).toEqual([1, 1, 1]);
    expect(p.nutrition + p.initialSatiety).toBeGreaterThan(p.metabolicDemand);
    const input = ordinaryCoevolutionInput(
      createCoevolutionRun(initialCoevolutionWorld()),
      'lin',
    );
    expect(JSON.stringify(input)).not.toMatch(
      /simulated-test|legalRoute|preflight|fixture/,
    );
    expect(ORDINARY_COEVOLUTION_PROMPT).not.toMatch(
      /fishing|house|trade|profession examples/i,
    );
    expect(input.visibleAgents).toEqual([]);
    expect(input.project).toBeNull();
    expect(coevolutionRequest('fixture', 'ordinary', input).instructions).toBe(
      ORDINARY_COEVOLUTION_PROMPT,
    );
  });
  it('accepts development only at the saved barrier without advancing time', () => {
    let run = createCoevolutionRun(initialCoevolutionWorld());
    for (const agentId of pendingCoevolutionPrograms(run))
      run = acceptCoevolutionProgram(run, {
        agentId,
        tick: 0,
        call: 1,
        code: `learn(${JSON.stringify(request)});`,
        summary: 'Simulated fixture decision.',
        project,
      });
    const state: CoevolutionExecution = {
      version: 1,
      controller: 'simulated-test',
      model: 'fixture',
      programs: run.programs,
      rounds: run.rounds,
      attempts: [],
      developments: [],
      developmentAttempts: [],
      phase: 'development',
      stopReason: null,
      checkpoints: [],
      developmentMetering:
        'Conversation interventions capped at 10; internal model calls and tokens unavailable, not zero.',
      barrier: {
        id: 'round-0-world-1',
        tick: 0,
        input: worldCoevolutionInput(run),
        errors: [],
        proposed: null,
      },
    };
    const proposal = {
      ...EMPTY_COEVOLUTION_PROPOSAL,
      objects: [
        {
          id: 'support',
          name: 'Support',
          description: 'Costed persistent rest effect.',
          portable: false,
          restBonus: 3,
          carryBonus: 0,
          recipe: null,
        },
      ],
      mechanics: [
        {
          id: 'make-support',
          name: 'Make support',
          description: 'Spend two branches for a shared rest surface.',
          parameters: [],
          code: JSON.stringify([
            {
              op: 'place',
              target: null,
              resource: 'support',
              quantity: 1,
              costs: [{ resource: 'branch', quantity: 2 }],
              tool: null,
              chance: 100,
            },
          ]),
        },
      ],
      reviews: ['lin', 'moss', 'sol'].map((agentId) => ({
        agentId,
        decision: 'create',
        reason: 'Reviewed simulated declaration with material cost.',
        prerequisites: ['Two owned branches'],
        learningRounds: 1,
        mechanicId: 'make-support',
      })),
    };
    const accepted = acceptCDevelopment(state, {
      barrierId: 'round-0-world-1',
      tick: 0,
      proposal,
      notes:
        'Inspected the simulated request, finite construction costs and shared effect. No host code or source changes; game time remains at zero.',
    });
    expect(accepted.phase).toBe('running');
    expect(accepted.rounds).toHaveLength(0);
    expect(accepted.developments).toHaveLength(1);
    expect(accepted.developments[0]?.reviewer).toBe(
      'current-codex-conversation',
    );
    const byClaude = acceptCDevelopment(
      state,
      {
        barrierId: 'round-0-world-1',
        tick: 0,
        proposal,
        notes:
          'Inspected the simulated request, finite construction costs and shared effect. No host code or source changes; game time remains at zero.',
      },
      'current-claude-conversation',
    );
    expect(byClaude.developments[0]?.reviewer).toBe(
      'current-claude-conversation',
    );
    expect(() => acceptCDevelopment(accepted, {})).toThrow();
    expect(() =>
      acceptCDevelopment(state, {
        barrierId: 'wrong',
        tick: 0,
        proposal,
        notes: 'A deliberately wrong barrier must be rejected.',
      }),
    ).toThrow();
  });
  it('audits the archived run and rejects altered checkpoints', () => {
    const archived = readCoevolutionExecution(
      JSON.parse(readFileSync('experiment/ex6/execution.json', 'utf8')),
    );
    expect(auditCoevolution(archived).rounds).toHaveLength(
      archived.rounds.length,
    );
    expect(() => auditCoevolution({ ...archived, checkpoints: [] })).toThrow(
      /checkpoint/,
    );
  });
});
