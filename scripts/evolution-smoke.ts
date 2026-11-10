import {
  acceptEvolutionProgram,
  advanceEvolutionRound,
  createEvolutionRun,
  EMPTY_PROPOSAL,
  evolutionData,
  lastEvolutionFrame,
  pendingEvolutionPrograms,
  reconstructEvolutionRun,
} from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from '../apps/simulator/src/evolution-scenario.js';
/** Offline integration fixture, never an ordinary agent policy or live inference fallback. */
export function evolutionSmoke() {
  let run = createEvolutionRun(initialEvolutionWorld());
  const request = {
    name: 'Direct nourishment',
    purpose: 'Consume an owned resource',
    target: 'Owned food',
    conditions: 'Positive available quantity',
    expectedEffect: 'Consume finite food and apply its true properties',
  };
  for (const id of pendingEvolutionPrograms(run))
    run = acceptEvolutionProgram(run, {
      agentId: id,
      tick: 0,
      call: 1,
      code: `learn(${JSON.stringify(request)});`,
      summary: 'Simulated smoke fixture: request direct consumption.',
    });
  run = advanceEvolutionRound(run, {
    ...EMPTY_PROPOSAL,
    mechanics: [
      {
        id: 'direct-consumption',
        name: 'Direct consumption',
        description: 'Consume one owned food unit',
        parameters: ['food'],
        code: JSON.stringify([
          {
            op: 'consume',
            target: 'food',
            resource: null,
            quantity: 1,
            costs: [],
            tool: null,
            chance: 100,
          },
        ]),
      },
    ],
    reviews:
      run.frames[0]?.agents.map((a) => ({
        agentId: a.id,
        decision: 'create' as const,
        reason: 'One round of practice in direct consumption.',
        prerequisites: ['Owned food'],
        learningRounds: 1,
        mechanicId: 'direct-consumption',
      })) ?? [],
  });
  for (const id of pendingEvolutionPrograms(run))
    run = acceptEvolutionProgram(run, {
      agentId: id,
      tick: 1,
      call: 2,
      code:
        id === 'lin'
          ? 'move("east",1); pickup("forest-fallen"); use("ability-1",{"food":"forest-fallen"}); wait(8);'
          : 'wait(11);',
      summary: 'Simulated smoke fixture: test consumption and safe batching.',
    });
  while (run.rounds.length < 12)
    run = advanceEvolutionRound(run, EMPTY_PROPOSAL);
  const rebuilt = reconstructEvolutionRun(
      initialEvolutionWorld(),
      run.programs,
      run.rounds,
    ),
    final = lastEvolutionFrame(run),
    data = evolutionData(final);
  if (
    JSON.stringify(rebuilt) !== JSON.stringify(run) ||
    data.stacks.find((s) => s.id === 'forest-fallen')?.quantity !== 1 ||
    data.skills.length !== 1 ||
    data.vitals.lin?.satiety !== 52 ||
    run.interruptions.length !== 0
  )
    throw new Error('Offline evolution smoke failed.');
  return {
    format: 'self-evolving-world/evolution-smoke',
    version: 1,
    controller: 'simulated-test',
    externalModelCalls: 0,
    rounds: 12,
    checks: [
      'functional-deduplication',
      'individual-learning',
      'finite-pickup-and-consumption',
      'action-first-metabolism',
      'safe-batch-completion',
      'deterministic-reconstruction',
    ],
    programs: run.programs,
    roundsEvidence: run.rounds,
    finalVitals: data.vitals,
  };
}
