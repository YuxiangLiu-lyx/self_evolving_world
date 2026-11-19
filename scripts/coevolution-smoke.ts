import {
  acceptCoevolutionProgram,
  advanceCoevolutionRound,
  createCoevolutionRun,
  coevolutionActions,
  EMPTY_COEVOLUTION_PROPOSAL,
  lastCoevolutionFrame,
  pendingCoevolutionPrograms,
} from '@self-evolving-world/world-core';
import type { CoevolutionProposal } from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../apps/simulator/src/coevolution-scenario.js';
/** Browser-only authored demonstration. Never consumed by a real decision provider. */
export function coevolutionSmoke() {
  let run = createCoevolutionRun(initialCoevolutionWorld());
  const project = {
    problem: 'Recovery consumes time',
    reason: 'Reduce repeated maintenance',
    progress: 'Testing a local material-backed object',
    missing: 'Two branches',
    observedEffects: 'No benefit observed yet',
  };
  const request = {
    name: 'Improve local rest',
    purpose: 'Reduce recovery rounds',
    target: 'Owned woody material',
    conditions: 'Two branches and a usable location',
    expectedEffect: 'Shared persistent recovery efficiency',
  };
  for (const actor of pendingCoevolutionPrograms(run))
    run = acceptCoevolutionProgram(run, {
      agentId: actor,
      tick: 0,
      call: 1,
      code:
        actor === 'lin'
          ? `move("south",1);move("west",1);pickup("material-1");learn(${JSON.stringify(request)});`
          : 'rest(12);',
      summary: 'Offline mechanism fixture, not autonomous discovery.',
      project,
    });
  while (lastCoevolutionFrame(run).tick < 12) {
    for (const actor of pendingCoevolutionPrograms(run))
      run = acceptCoevolutionProgram(run, {
        agentId: actor,
        tick: run.rounds.length,
        call: (run.cursors[actor]?.calls ?? 0) + 1,
        code: 'use("ability-2",{});rest(6);',
        summary: 'Offline costed construction and recovery.',
        project,
      });
    const actions = coevolutionActions(run);
    let proposal: CoevolutionProposal = EMPTY_COEVOLUTION_PROPOSAL;
    if (actions.some((a) => a.type === 'learn'))
      proposal = {
        ...proposal,
        objects: [
          {
            id: 'rest-surface',
            name: 'Rest surface',
            description: 'Shared local recovery bonus from consumed branches.',
            portable: false,
            restBonus: 4,
            carryBonus: 0,
            recipe: null,
          },
        ],
        mechanics: [
          {
            id: 'assemble-surface',
            name: 'Assemble surface',
            description:
              'Consume two branches to create a persistent shared rest surface.',
            parameters: [],
            code: JSON.stringify([
              {
                op: 'place',
                target: null,
                resource: 'rest-surface',
                quantity: 1,
                costs: [{ resource: 'branch', quantity: 2 }],
                tool: null,
                chance: 100,
              },
            ]),
          },
        ],
        reviews: [
          {
            agentId: 'lin',
            decision: 'create',
            reason: 'Offline fixture of costed persistent construction.',
            prerequisites: ['Two branches'],
            learningRounds: 2,
            mechanicId: 'assemble-surface',
          },
        ],
      };
    run = advanceCoevolutionRound(run, proposal);
  }
  return run;
}
