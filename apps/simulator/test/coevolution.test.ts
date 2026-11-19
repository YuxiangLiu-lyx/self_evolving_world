import { describe, expect, it } from 'vitest';
import { coevolutionPreflight } from '../../../scripts/coevolution-preflight.js';
import {
  auditCoevolution,
  readCoevolutionExecution,
} from '../../../scripts/coevolution-analysis.js';
import {
  continueCoevolutionExecution,
  newCoevolutionExecution,
  acceptCDevelopment,
  recordCDevelopmentAttempt,
} from '../src/coevolution-run.js';
import type { CoevolutionProvider } from '../src/coevolution-provider.js';
import {
  coevolutionRequest,
  ORDINARY_COEVOLUTION_PROMPT,
} from '../src/coevolution-provider.js';
import {
  createCoevolutionRun,
  EMPTY_COEVOLUTION_PROPOSAL,
  coevolutionData,
  lastCoevolutionFrame,
} from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../src/coevolution-scenario.js';
import { ordinaryCoevolutionInput } from '../src/coevolution-input.js';
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
function fixtureProvider(
  code: string,
  worldDevelopment = false,
): CoevolutionProvider {
  let id = 0;
  return (role, input) => {
    id++;
    const answer =
      role === 'ordinary'
        ? { code, summary: 'Simulated fixture decision.', project }
        : {
            needsDevelopment: worldDevelopment,
            proposal: {
              ...EMPTY_COEVOLUTION_PROPOSAL,
              reviews: ('requests' in input ? input.requests : []).map((r) => ({
                agentId: r.agentId,
                decision: 'reject',
                reason: 'Simulated fixture review; no live model invoked.',
                prerequisites: [],
                learningRounds: 0,
                mechanicId: null,
              })),
            },
          };
    return Promise.resolve({
      decision: {
        text: JSON.stringify(answer),
        responseId: `fixture-${role}-${String(input.tick)}-${String(id)}`,
        responseFormat: 'json',
      },
      http: { status: 200, contentType: 'application/json', requestId: null },
      usage: { inputTokens: 10, outputTokens: 10 },
    });
  };
}
describe('coevolution runner, feasibility and disclosure', () => {
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
  it('counts every failed attempt and freezes the whole world on the 120th ordinary call', async () => {
    let calls = 0,
      saves = 0;
    const provider: CoevolutionProvider = () => {
      calls++;
      return Promise.reject(new Error('Fixture transport failure.'));
    };
    const state = await continueCoevolutionExecution(
      newCoevolutionExecution('fixture', 'simulated-test'),
      provider,
      () => {
        saves++;
        return Promise.resolve();
      },
    );
    expect(calls).toBe(120);
    expect(state.phase).toBe('paused');
    expect(state.rounds).toHaveLength(39);
    expect(
      state.attempts.every(
        (a) =>
          a.status === 'failed' && a.usage === null && a.elapsedMs !== null,
      ),
    ).toBe(true);
    expect(saves).toBeGreaterThan(120);
    expect(
      auditCoevolution(readCoevolutionExecution(state)).rounds,
    ).toHaveLength(39);
    const resumed = await continueCoevolutionExecution(state, provider, () =>
      Promise.resolve(),
    );
    expect(resumed).toBe(state);
    expect(calls).toBe(120);
    expect(state.checkpoints.map((c) => c.tick)).toEqual([30]);
  });
  it('batches same-round requests and pauses at the shared world budget without starvation waits', async () => {
    const state = await continueCoevolutionExecution(
      newCoevolutionExecution('fixture', 'simulated-test'),
      fixtureProvider(`learn(${JSON.stringify(request)});`),
      () => Promise.resolve(),
    );
    expect(state.phase).toBe('paused');
    expect(state.attempts.filter((a) => a.role === 'world')).toHaveLength(20);
    expect(state.rounds).toHaveLength(20);
    const run = auditCoevolution(state);
    expect(
      Object.values(coevolutionData(lastCoevolutionFrame(run)).vitals).every(
        (v) => v.health === 100,
      ),
    ).toBe(true);
  });
  it('returns development to the conversation and resumes the exact barrier with a real validated declaration', async () => {
    const state = await continueCoevolutionExecution(
      newCoevolutionExecution('fixture', 'simulated-test'),
      fixtureProvider(`learn(${JSON.stringify(request)});`, true),
      () => Promise.resolve(),
    );
    expect(state.phase).toBe('development');
    expect(state.rounds).toHaveLength(0);
    expect(state.attempts).toHaveLength(4);
    let failed = state;
    for (let i = 0; i < 10; i++) {
      const result = recordCDevelopmentAttempt(failed, {
        barrierId: 'invalid',
      });
      expect(result.error).not.toBeNull();
      failed = result.state;
    }
    expect(failed.phase).toBe('paused');
    expect(failed.developmentAttempts).toHaveLength(10);
    expect(failed.rounds).toHaveLength(0);
    expect(() => recordCDevelopmentAttempt(failed, {})).toThrow(/remains/);
    expect(
      auditCoevolution(readCoevolutionExecution(failed)).rounds,
    ).toHaveLength(0);

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
    const accepted = recordCDevelopmentAttempt(state, {
      barrierId: state.barrier?.id,
      tick: 0,
      proposal,
      notes:
        'Inspected the simulated request, finite construction costs and shared effect. No host code or source changes; game time remains at zero.',
    });
    expect(accepted.state.rounds).toHaveLength(0);
    let n = 0;
    const resumed = await continueCoevolutionExecution(
      accepted.state,
      fixtureProvider('rest(12);'),
      () => {
        n++;
        return Promise.resolve();
      },
    );
    expect(n).toBeGreaterThan(0);
    expect(resumed.phase).toBe('completed');
    expect(resumed.rounds).toHaveLength(60);
    expect(resumed.developments).toHaveLength(1);
    expect(auditCoevolution(resumed).rounds).toHaveLength(60);
    expect(resumed.attempts.slice(0, 4)).toEqual(state.attempts);
    expect(() =>
      acceptCDevelopment(state, {
        barrierId: 'wrong',
        tick: 0,
        proposal,
        notes: 'A deliberately wrong barrier must be rejected.',
      }),
    ).toThrow();
  });
  it('blocks uncertain call recovery and rejects altered checkpoints', async () => {
    const state = await continueCoevolutionExecution(
      newCoevolutionExecution('fixture', 'simulated-test'),
      fixtureProvider('rest(12);'),
      () => Promise.resolve(),
    );
    const first = state.attempts[0];
    if (!first) throw new Error('Missing fixture attempt.');
    await expect(
      continueCoevolutionExecution(
        {
          ...state,
          phase: 'running',
          attempts: [{ ...first, status: 'started' }],
        },
        fixtureProvider('rest(12);'),
        () => Promise.resolve(),
      ),
    ).rejects.toThrow(/uncertain/);
    expect(() => auditCoevolution({ ...state, checkpoints: [] })).toThrow(
      /checkpoint/,
    );
  });
});
