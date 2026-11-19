import { describe, expect, it } from 'vitest';
import {
  createCoevolutionWorld,
  stepCoevolutionRound,
  coevolutionData,
  EMPTY_COEVOLUTION_PROPOSAL,
  compileCMechanic,
  createCoevolutionRun,
  acceptCoevolutionProgram,
  advanceCoevolutionRound,
  reconstructCoevolutionRun,
  actionEffort,
} from '../src/index.js';
import type {
  CoevolutionAction,
  CoevolutionProposal,
  ObjectBlueprint,
  WorldState,
} from '../src/index.js';
const empty = EMPTY_COEVOLUTION_PROPOSAL;
const object: ObjectBlueprint = {
  id: 'woven-support',
  name: 'Woven support',
  description: 'Material-backed rest improvement.',
  portable: false,
  restBonus: 4,
  carryBonus: 0,
  recipe: null,
};
const operation = (
  op: string,
  target: string | null,
  resource: string | null,
  quantity = 1,
  costs: readonly { resource: string; quantity: number }[] = [],
) => ({ op, target, resource, quantity, costs, tool: null, chance: 100 });
function initial(mossPosition = { x: 2, y: 1 }) {
  return createCoevolutionWorld(
    {
      settings: { width: 6, height: 6, visionRadius: 5 },
      agents: [
        { id: 'lin', name: 'Lin', position: { x: 1, y: 1 } },
        { id: 'moss', name: 'Moss', position: mossPosition },
      ],
    },
    {
      seed: 19,
      terrain: Array.from({ length: 6 }, () => 'FFFFFF'),
      types: [
        {
          id: 'branch',
          name: 'Branch',
          appearance: 'Woody length',
          nutrition: 0,
          toxicity: 0,
          durability: 0,
        },
        {
          id: 'food',
          name: 'Food',
          appearance: 'Ripe fruit',
          nutrition: 18,
          toxicity: 0,
          durability: 0,
        },
      ],
      stacks: [
        {
          id: 'wood',
          type: 'branch',
          quantity: 6,
          durability: 0,
          owner: 'lin',
          position: null,
        },
        {
          id: 'meal',
          type: 'food',
          quantity: 3,
          durability: 0,
          owner: 'moss',
          position: null,
        },
      ],
      sites: [
        {
          id: 'tree',
          kind: 'tree',
          appearance: 'Woody growth',
          position: { x: 1, y: 2 },
          capacity: 3,
          energyLimit: 24,
          allocation: null,
          stock: { branch: 6, food: 3 },
        },
      ],
      ecology: [],
    },
  );
}
const request = {
  name: 'Improve recovery',
  purpose: 'Reduce recovery time',
  target: 'local material',
  conditions: 'Owned material and safe place',
  expectedEffect: 'Persistent shared recovery',
};
const learn = (agentId = 'lin'): CoevolutionAction => ({
  type: 'learn',
  agentId,
  request,
});
function round(
  w: WorldState,
  a: CoevolutionAction,
  proposal: CoevolutionProposal = empty,
  other: CoevolutionAction = {
    type: 'wait',
    agentId: a.agentId === 'lin' ? 'moss' : 'lin',
  },
) {
  return stepCoevolutionRound(w, {
    actions: [a, other].sort((a, b) => a.agentId.localeCompare(b.agentId)),
    proposal,
  });
}
function buildProposal(blueprint = object): CoevolutionProposal {
  return {
    ...empty,
    objects: [blueprint],
    mechanics: [
      {
        id: 'make-support',
        name: 'Make support',
        description: 'Spend two branches to establish the reviewed object.',
        parameters: [],
        code: JSON.stringify([
          operation('place', null, blueprint.id, 1, [
            { resource: 'branch', quantity: 2 },
          ]),
        ]),
      },
    ],
    reviews: [
      {
        agentId: 'lin',
        decision: 'create',
        reason: 'Costed local material assembly.',
        prerequisites: ['Two branches'],
        learningRounds: 2,
        mechanicId: 'make-support',
      },
    ],
  };
}
function built(blueprint = object) {
  let w = round(initial(), learn(), buildProposal(blueprint));
  w = round(w, { type: 'study', agentId: 'lin' });
  w = round(w, { type: 'use', agentId: 'lin', skillId: 'ability-2', args: {} });
  return w;
}
describe('coevolution-v1 actual state transitions', () => {
  it('bounds nonfood biomass separately from edible energy without refilling a natural site', () => {
    const blueprint: ObjectBlueprint = {
      ...object,
      id: 'biomass-fixture',
      restBonus: 0,
      growth: {
        version: 'photosynthesis-v1',
        output: 'branch',
        biomes: ['forest'],
        establishment: 2,
        interval: 2,
        ceiling: 2,
        lifetime: 2,
      },
    };
    let w = built(blueprint);
    for (let i = 0; i < 8; i++) w = round(w, { type: 'wait', agentId: 'lin' });
    const data = coevolutionData(w);
    expect(data.objects[0]?.growth).toMatchObject({
      produced: 2,
      environmentalEnergy: 0,
    });
    expect(
      data.stacks.filter((s) => s.id.startsWith('yield-')).map((s) => s.type),
    ).toEqual(['branch', 'branch']);
    expect(data.sites[0]?.stock.branch).toBe(6);
    expect(data.stacks.find((s) => s.id === 'wood')?.quantity).toBe(4);
  });
  it('spends propagation material, delays bounded growth and lets another actor harvest', () => {
    const blueprint: ObjectBlueprint = {
      ...object,
      id: 'planting',
      restBonus: 0,
      growth: {
        version: 'photosynthesis-v1',
        output: 'food',
        biomes: ['forest'],
        establishment: 2,
        interval: 2,
        ceiling: 2,
        lifetime: 3,
      },
    };
    const base = buildProposal(blueprint),
      proposal: CoevolutionProposal = {
        ...base,
        mechanics: base.mechanics.map((m) => ({
          ...m,
          code: JSON.stringify([
            operation('place', null, blueprint.id, 1, [
              { resource: 'branch', quantity: 1 },
              { resource: 'food', quantity: 1 },
            ]),
          ]),
        })),
      };
    let w = round(initial(), {
      type: 'give',
      agentId: 'moss',
      itemId: 'meal',
      recipient: 'lin',
    });
    w = round(w, learn(), proposal);
    w = round(w, { type: 'study', agentId: 'lin' });
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    });
    expect(
      coevolutionData(w).stacks.find((s) => s.id === 'meal')?.quantity,
    ).toBe(2);
    expect(coevolutionData(w).objects[0]?.growth?.produced).toBe(0);
    w = round(w, { type: 'move', agentId: 'lin', direction: 'north' });
    w = round(w, { type: 'move', agentId: 'moss', direction: 'west' });
    const output = coevolutionData(w).stacks.find((s) =>
      s.id.startsWith('yield-'),
    );
    expect(output?.quantity).toBe(1);
    w = round(w, { type: 'pickup', agentId: 'moss', itemId: output?.id ?? '' });
    expect(
      coevolutionData(w).stacks.find((s) => s.id === output?.id)?.owner,
    ).toBe('moss');
    for (let i = 0; i < 10; i++) w = round(w, { type: 'wait', agentId: 'lin' });
    expect(coevolutionData(w).objects[0]?.growth).toMatchObject({
      produced: 3,
      environmentalEnergy: 54,
    });
    expect(
      coevolutionData(w).stacks.filter(
        (s) => s.id.startsWith('yield-') && s.owner === null,
      ),
    ).toHaveLength(2);
    const before = coevolutionData(w).objects;
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    });
    // A second cell can be planted only by spending fresh materials; the original lifetime never resets.
    expect(coevolutionData(w).objects[0]).toEqual(before[0]);
    expect(() => round(initial(), learn(), buildProposal(blueprint))).toThrow(
      /propagation material/,
    );
  });
  it('keeps implementation, personal mastery, costed construction and shared rest distinct', () => {
    const original = initial();
    let w = round(original, learn(), buildProposal());
    expect(coevolutionData(w).mechanics).toHaveLength(2);
    expect(coevolutionData(w).knowledge.lin?.learned).toEqual(['ability-1']);
    expect(coevolutionData(w).objects).toHaveLength(0);
    w = round(w, { type: 'study', agentId: 'lin' });
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    });
    const d = coevolutionData(w);
    expect(d.objects).toHaveLength(1);
    expect(d.stacks.find((s) => s.id === 'wood')?.quantity).toBe(4);
    expect(coevolutionData(original).stacks[0]?.quantity).toBe(6);
    for (let i = 0; i < 4; i++)
      w = round(w, { type: 'wait', agentId: 'lin' }, empty, {
        type: 'use',
        agentId: 'moss',
        skillId: 'ability-1',
        args: { item: 'meal' },
      });
    const before = coevolutionData(w).energy.moss ?? 0;
    w = round(w, { type: 'rest', agentId: 'moss' });
    expect(coevolutionData(w).energy.moss).toBe(before + 8);
    expect(coevolutionData(w).benefits.at(-1)).toMatchObject({
      actor: 'moss',
      kind: 'rest',
      amount: 4,
    });
    expect(coevolutionData(w).objects[0]?.creator).toBe('lin');
  });
  it('makes carrying aid reduce actual effort and permits one-owner handoff', () => {
    let w = built({
      ...object,
      id: 'portable-support',
      portable: true,
      restBonus: 0,
      carryBonus: 6,
    });
    const actor = w.agents[0];
    if (!actor) throw new Error('Missing actor');
    const move = { type: 'move', agentId: 'lin', direction: 'north' } as const;
    expect(actionEffort(coevolutionData(w), actor, move)).toBeLessThan(
      actionEffort(coevolutionData(w), actor, move, false),
    );
    const objectId = coevolutionData(w).objects[0]?.id ?? '';
    w = round(w, {
      type: 'give',
      agentId: 'lin',
      itemId: objectId,
      recipient: 'moss',
    });
    expect(coevolutionData(w).objects[0]?.owner).toBe('moss');
    expect(coevolutionData(w).objects).toHaveLength(1);
  });
  it('spends processing inputs now and persists a job to shared ground output later', () => {
    let w = built({
      ...object,
      id: 'press',
      restBonus: 0,
      recipe: {
        inputs: [{ resource: 'food', quantity: 2 }],
        output: 'food',
        quantity: 2,
        delay: 3,
      },
    });
    const proposal: CoevolutionProposal = {
      ...empty,
      mechanics: [
        {
          id: 'process-food',
          name: 'Process material',
          description:
            'Spend two food inputs and wait three rounds for shared output.',
          parameters: ['facility'],
          code: JSON.stringify([operation('process', 'facility', null)]),
        },
      ],
      reviews: [
        {
          agentId: 'moss',
          decision: 'create',
          reason: 'Simple costed process.',
          prerequisites: ['Adjacent facility and food'],
          learningRounds: 1,
          mechanicId: 'process-food',
        },
      ],
    };
    w = round(w, learn('moss'), proposal);
    const id = coevolutionData(w).objects[0]?.id ?? '';
    w = round(w, {
      type: 'use',
      agentId: 'moss',
      skillId: 'ability-3',
      args: { facility: id },
    });
    const started = coevolutionData(w);
    expect(started.stacks.find((s) => s.id === 'meal')?.quantity).toBe(1);
    expect(started.jobs[0]?.completed).toBe(false);
    for (let i = 0; i < 3; i++) w = round(w, { type: 'wait', agentId: 'lin' });
    const output = coevolutionData(w).stacks.find((s) =>
      s.id.startsWith('output-'),
    );
    expect(output).toMatchObject({
      quantity: 2,
      owner: null,
      position: { x: 1, y: 1 },
    });
    w = round(w, { type: 'pickup', agentId: 'lin', itemId: output?.id ?? '' });
    expect(
      coevolutionData(w).stacks.find((s) => s.id === output?.id)?.owner,
    ).toBe('lin');
  });
  it('allows extract then consume through an explicit intermediate and rejects duplicate writes atomically', () => {
    const mechanic = {
      id: 'direct-food',
      name: 'Direct food',
      description: 'Remove finite adjacent stock then consume.',
      parameters: ['site'],
      code: JSON.stringify([
        operation('extract', 'site', 'food'),
        operation('consume', 'result-0', null),
      ]),
    };
    expect(compileCMechanic(mechanic).operations).toHaveLength(2);
    const reviews = ['lin', 'moss'].map((agentId) => ({
      agentId,
      decision: 'create' as const,
      reason: 'Equivalent requests share one implementation.',
      prerequisites: [],
      learningRounds: 1,
      mechanicId: mechanic.id,
    }));
    let w = round(
      initial(),
      learn(),
      { ...empty, mechanics: [mechanic], reviews },
      learn('moss'),
    );
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: { site: 'tree' },
    });
    expect(coevolutionData(w).sites[0]?.stock.food).toBe(2);
    expect(coevolutionData(w).vitals.lin?.satiety).toBe(94);
    let conflict = round(
      initial({ x: 2, y: 2 }),
      learn(),
      { ...empty, mechanics: [mechanic], reviews },
      learn('moss'),
    );
    conflict = round(
      conflict,
      {
        type: 'use',
        agentId: 'lin',
        skillId: 'ability-2',
        args: { site: 'tree' },
      },
      empty,
      {
        type: 'use',
        agentId: 'moss',
        skillId: 'ability-2',
        args: { site: 'tree' },
      },
    );
    expect(coevolutionData(conflict).events.map((e) => e.outcome)).toEqual([
      'resource-conflict',
      'resource-conflict',
    ]);
    expect(coevolutionData(conflict).sites[0]?.stock.food).toBe(3);
    expect(
      coevolutionData(conflict).stacks.some((s) =>
        s.id.startsWith('produced-'),
      ),
    ).toBe(false);

    expect(() =>
      compileCMechanic({
        ...mechanic,
        code: JSON.stringify([operation('consume', 'result-1', null)]),
      }),
    ).toThrow();
  });
  it('coexists by stable niche, retains zero and never rerolls or renews without a finite budget', () => {
    const base = {
      siteKind: 'tree',
      biomes: ['forest'] as const,
      distribution: [0, 3],
      reason: 'Habitat-compatible finite stock.',
      renewEvery: 2,
      lifetime: 2,
    };
    const proposal: CoevolutionProposal = {
      ...empty,
      ecology: [
        { ...base, id: 'fruit-rule', resource: 'food', niche: 'canopy' },
        { ...base, id: 'wood-rule', resource: 'branch', niche: 'surface' },
      ],
      reviews: [
        {
          agentId: 'lin',
          decision: 'reject',
          reason:
            'Ecology can be inspected before requesting an implementation.',
          prerequisites: [],
          learningRounds: 0,
          mechanicId: null,
        },
      ],
    };
    let w = round(initial(), learn(), proposal);
    const before = coevolutionData(w);
    expect(before.allocations).toHaveLength(2);
    w = round(w, learn(), {
      ...proposal,
      ecology: proposal.ecology.map((e) => ({ ...e, id: `renamed-${e.id}` })),
    });
    expect(
      coevolutionData(w).allocations.map((a) => ({ ...a, next: 0 })),
    ).toEqual(before.allocations.map((a) => ({ ...a, next: 0 })));
    expect(coevolutionData(w).sites).toEqual(before.sites);
    for (let i = 0; i < 20; i++) w = round(w, { type: 'wait', agentId: 'lin' });
    expect(coevolutionData(w).allocations.every((a) => a.remaining <= 2)).toBe(
      true,
    );
    expect(
      coevolutionData(w)
        .allocations.filter((a) => a.draw === 0)
        .every((a) => a.ceiling === 0 && a.remaining === 0),
    ).toBe(true);
  });
  it('rejects energy creation and keeps failed compound material costs unchanged', () => {
    expect(() =>
      round(
        initial(),
        learn(),
        buildProposal({
          ...object,
          recipe: {
            inputs: [{ resource: 'branch', quantity: 2 }],
            output: 'food',
            quantity: 2,
            delay: 2,
          },
        }),
      ),
    ).toThrow(/nutritional/);
    const proposal = buildProposal();
    let w = round(initial(), learn(), {
      ...proposal,
      mechanics: proposal.mechanics.map((m) => ({
        ...m,
        code: JSON.stringify([
          operation('place', null, object.id, 1, [
            { resource: 'branch', quantity: 8 },
          ]),
        ]),
      })),
    });
    w = round(w, { type: 'study', agentId: 'lin' });
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    });
    expect(coevolutionData(w).events[0]?.outcome).toBe('use-failed');
    expect(coevolutionData(w).objects).toHaveLength(0);
    expect(coevolutionData(w).stacks[0]?.quantity).toBe(6);
  });
  it('rejects nonfood amplification loops in conversion and delayed recipes', () => {
    expect(() =>
      round(
        initial(),
        learn(),
        buildProposal({
          ...object,
          recipe: {
            inputs: [{ resource: 'branch', quantity: 1 }],
            output: 'branch',
            quantity: 3,
            delay: 2,
          },
        }),
      ),
    ).toThrow(/amplify material/);
    let w = round(initial(), learn(), {
      ...empty,
      mechanics: [
        {
          id: 'amplifier',
          name: 'Invalid amplifier',
          description: 'Attempt to duplicate finite matter.',
          parameters: [],
          code: JSON.stringify([
            operation('convert', null, 'branch', 3, [
              { resource: 'branch', quantity: 1 },
            ]),
          ]),
        },
      ],
      reviews: [
        {
          agentId: 'lin',
          decision: 'create',
          reason:
            'Fixture tests runtime conservation despite a typed declaration.',
          prerequisites: [],
          learningRounds: 1,
          mechanicId: 'amplifier',
        },
      ],
    });
    w = round(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    });
    expect(coevolutionData(w).events[0]?.outcome).toBe('use-failed');
    expect(coevolutionData(w).stacks[0]?.quantity).toBe(6);
  });
  it('retains projects and bounded plans across harmless hunger and deterministic replay', () => {
    let run = createCoevolutionRun(initial());
    const project = {
      problem: 'Repeated exertion',
      reason: 'Keep reserves',
      progress: 'Observing costs',
      missing: 'More observations',
      observedEffects: 'None',
    };
    for (const a of initial().agents)
      run = acceptCoevolutionProgram(run, {
        agentId: a.id,
        tick: 0,
        call: 1,
        code: 'rest(12);',
        summary: 'Observe recovery.',
        project,
      });
    for (let i = 0; i < 5; i++) run = advanceCoevolutionRound(run, empty);
    expect(run.cursors.lin?.remaining).toHaveLength(7);
    expect(run.cursors.lin?.project).toEqual(project);
    expect(
      reconstructCoevolutionRun(initial(), run.programs, run.rounds),
    ).toEqual(run);
  });
  it('delivers messages after the barrier and transfers unique material ownership', () => {
    let w = round(initial(), {
      type: 'message',
      agentId: 'lin',
      recipient: 'moss',
      text: 'Observed a cost.',
    });
    expect(coevolutionData(w).messages).toEqual([
      { tick: 1, sender: 'lin', recipient: 'moss', text: 'Observed a cost.' },
    ]);
    w = round(w, {
      type: 'give',
      agentId: 'moss',
      recipient: 'lin',
      itemId: 'meal',
    });
    expect(coevolutionData(w).stacks.find((s) => s.id === 'meal')?.owner).toBe(
      'lin',
    );
  });
});
