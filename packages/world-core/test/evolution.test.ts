import { describe, it, expect } from 'vitest';
import {
  createEvolutionWorld,
  evolutionData,
  stepEvolutionRound,
  EMPTY_PROPOSAL,
  seededUnit,
  compileMechanic,
  createEvolutionRun,
  acceptEvolutionProgram,
  advanceEvolutionRound,
} from '../src/index.js';
import type {
  EvolutionProposal,
  LearningAction,
  EOperation,
  WorldState,
} from '../src/index.js';
const request = {
  name: 'Gather provision',
  purpose: 'Obtain nourishment',
  target: 'Nearby natural object',
  conditions: 'Adjacent object and finite stock',
  expectedEffect: 'Move one finite unit into inventory',
};
const resource = {
  id: 'reed-seed',
  name: 'Small reed seed',
  appearance: 'Dark oval grain',
  nutrition: 20,
  toxicity: 0,
  durability: 0,
};
const op = (value: Partial<EOperation>): EOperation => ({
  op: 'consume',
  target: 'item',
  resource: null,
  quantity: 1,
  costs: [],
  tool: null,
  chance: 100,
  ...value,
});
function initial(two = false) {
  return createEvolutionWorld(
    {
      settings: { width: 6, height: 6, visionRadius: 3 },
      agents: [
        { id: 'lin', name: 'Lin', position: { x: 1, y: 1 } },
        ...(two
          ? [{ id: 'moss', name: 'Moss', position: { x: 3, y: 1 } }]
          : []),
      ],
    },
    {
      seed: 20261109,
      terrain: ['GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG', 'GGGGGG'],
      types: [
        {
          id: 'raw-cap',
          name: 'Ivory cap',
          appearance: 'Pale cap with dark ring',
          nutrition: 18,
          toxicity: 18,
          durability: 0,
        },
        {
          id: 'branch',
          name: 'Branch',
          appearance: 'Dry wood',
          nutrition: 0,
          toxicity: 0,
          durability: 0,
        },
      ],
      stacks: [
        {
          id: 'cap-one',
          type: 'raw-cap',
          quantity: 2,
          durability: 0,
          owner: 'lin',
          position: null,
        },
        {
          id: 'wood-one',
          type: 'branch',
          quantity: 3,
          durability: 0,
          owner: 'lin',
          position: null,
        },
      ],
      sites: [
        {
          id: 'reeds',
          kind: 'growth',
          appearance: 'Unexamined seed heads',
          position: { x: 2, y: 1 },
          capacity: 2,
          energyLimit: 30,
          allocation: null,
          stock: {},
        },
      ],
      ecology: [],
    },
  );
}
const actions = (w: WorldState, a: LearningAction) =>
  w.agents.map((x) =>
    x.id === a.agentId ? a : { type: 'wait' as const, agentId: x.id },
  );
function learn(
  w: WorldState,
  code: readonly EOperation[],
  rounds = 1,
): WorldState {
  const proposal: EvolutionProposal = {
    ...EMPTY_PROPOSAL,
    mechanics: [
      {
        id: 'new-ability',
        name: 'Requested function',
        description: 'A generated operation composition',
        parameters: [
          ...new Set(code.flatMap((o) => (o.target ? [o.target] : []))),
        ],
        code: JSON.stringify(code),
      },
    ],
    reviews: [
      {
        agentId: 'lin',
        decision: 'create',
        reason: 'Feasible with actual material costs.',
        prerequisites: [],
        learningRounds: rounds,
        mechanicId: 'new-ability',
      },
    ],
  };
  return stepEvolutionRound(w, {
    actions: actions(w, { type: 'learn', agentId: 'lin', request }),
    proposal,
  });
}
const use = (w: WorldState, args: Record<string, string>) =>
  stepEvolutionRound(w, {
    actions: actions(w, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-1',
      args,
    }),
    proposal: EMPTY_PROPOSAL,
  });
describe('evolution-v1 physical envelope', () => {
  it('preserves action-first hunger timing with the calibrated initial window', () => {
    let w = initial();
    for (let i = 1; i <= 41; i++) {
      w = stepEvolutionRound(w, {
        actions: actions(w, { type: 'wait', agentId: 'lin' }),
        proposal: EMPTY_PROPOSAL,
      });
      if (i === 30)
        expect(evolutionData(w).vitals.lin).toMatchObject({
          health: 100,
          satiety: 0,
        });
      if (i === 31) expect(evolutionData(w).vitals.lin?.health).toBe(90);
      if (i >= 40) expect(evolutionData(w).vitals.lin?.health).toBe(0);
    }
  });
  it('requires individual learning time and real consumption; poison teaches stable properties', () => {
    let w = learn(initial(), [op({})], 3);
    expect(evolutionData(w).knowledge.lin?.pending?.completed).toBe(1);
    const tooEarly = use(w, { item: 'cap-one' });
    expect(evolutionData(tooEarly).events[0]?.outcome).toBe('use-failed');
    for (let i = 0; i < 2; i++)
      w = stepEvolutionRound(w, {
        actions: actions(w, { type: 'study', agentId: 'lin' }),
        proposal: EMPTY_PROPOSAL,
      });
    w = use(w, { item: 'cap-one' });
    expect(evolutionData(w).vitals.lin).toMatchObject({
      health: 82,
      satiety: 70,
    });
    expect(
      evolutionData(w).stacks.find((s) => s.id === 'cap-one')?.quantity,
    ).toBe(1);
    expect(evolutionData(w).memory.lin?.knownTypes).toEqual(['raw-cap']);
  });
  it('creates a previously undefined type and executable extraction, deduplicates requests and never rerolls a site', () => {
    let w = initial(true);
    const distribution =
      seededUnit(20261109, 'ecology:reeds') < 0.5 ? [2, 0] : [0, 2];
    const mechanic = {
      id: 'seed-release',
      name: 'Release seeds',
      description: 'Extract available finite seed stock',
      parameters: ['site'],
      code: JSON.stringify([
        op({ op: 'extract', target: 'site', resource: 'reed-seed' }),
      ]),
    };
    const proposal: EvolutionProposal = {
      resources: [resource],
      ecology: [
        {
          id: 'seed-season',
          resource: 'reed-seed',
          siteKind: 'growth',
          biomes: ['grassland'],
          distribution,
          reason: 'Some mature growth bears finite seed.',
        },
      ],
      mechanics: [
        mechanic,
        {
          ...mechanic,
          id: 'other-name',
          name: 'Gather grains',
          parameters: ['plant'],
          code: JSON.stringify([
            op({ op: 'extract', target: 'plant', resource: 'reed-seed' }),
          ]),
        },
      ],
      reviews: ['lin', 'moss'].map((agentId, i) => ({
        agentId,
        decision: 'create',
        reason: 'Equivalent request, individual practice.',
        prerequisites: [],
        learningRounds: i + 1,
        mechanicId: i ? 'other-name' : 'seed-release',
      })),
    };
    w = stepEvolutionRound(w, {
      actions: w.agents.map((a) => ({ type: 'learn', agentId: a.id, request })),
      proposal,
    });
    expect(evolutionData(w).mechanics).toHaveLength(1);
    expect(evolutionData(w).skills).toHaveLength(1);
    expect(evolutionData(w).knowledge.moss?.pending).not.toBeNull();
    w = use(w, { site: 'reeds' });
    expect(
      evolutionData(w).events.find((e) => e.action.agentId === 'lin')?.outcome,
    ).toBe('used');
    expect(evolutionData(w).sites[0]?.stock['reed-seed']).toBe(1);
    w = use(w, { site: 'reeds' });
    expect(evolutionData(w).sites[0]?.stock['reed-seed']).toBe(0);
    const repeated = {
      ...proposal,
      mechanics: [],
      ecology: [{ ...proposal.ecology[0], id: 'another-season' }],
      reviews: [
        {
          ...proposal.reviews[0],
          decision: 'reuse',
          mechanicId: 'seed-release',
        },
      ],
    };
    w = stepEvolutionRound(w, {
      actions: actions(w, { type: 'learn', agentId: 'lin', request }),
      proposal: repeated,
    });
    expect(evolutionData(w).sites[0]?.stock['reed-seed']).toBe(0);
    expect(evolutionData(w).sites[0]?.allocation).toBe('seed-season');
  });
  it('rejects free nutritional conversion and rolls back material costs', () => {
    const w = initial();
    const proposal = {
      ...EMPTY_PROPOSAL,
      resources: [resource],
      mechanics: [
        {
          id: 'free-food',
          name: 'Unreasonable food',
          description: 'Must fail physical accounting',
          parameters: [],
          code: JSON.stringify([
            op({
              op: 'convert',
              target: null,
              resource: 'reed-seed',
              costs: [{ resource: 'branch', quantity: 1 }],
            }),
          ]),
        },
      ],
      reviews: [
        {
          agentId: 'lin',
          decision: 'create',
          reason: 'Review cannot waive physical invariants.',
          prerequisites: [],
          learningRounds: 1,
          mechanicId: 'free-food',
        },
      ],
    };
    const learned = stepEvolutionRound(w, {
        actions: actions(w, { type: 'learn', agentId: 'lin', request }),
        proposal,
      }),
      next = use(learned, {});
    expect(evolutionData(next).events[0]?.outcome).toBe('use-failed');
    expect(
      evolutionData(next).stacks.find((s) => s.id === 'wood-one')?.quantity,
    ).toBe(3);
  });
  it('rejects arbitrary host code, inconsistent ecology and incomplete review before ticking', () => {
    expect(() =>
      compileMechanic({
        id: 'bad',
        name: 'Bad',
        description: 'Host code is forbidden',
        parameters: [],
        code: 'process.exit()',
      }),
    ).toThrow();
    const w = initial();
    expect(() =>
      stepEvolutionRound(w, {
        actions: actions(w, { type: 'learn', agentId: 'lin', request }),
        proposal: EMPTY_PROPOSAL,
      }),
    ).toThrow();
    expect(w.tick).toBe(0);
    expect(() =>
      stepEvolutionRound(w, {
        actions: actions(w, { type: 'wait', agentId: 'lin' }),
        proposal: { ...EMPTY_PROPOSAL, resources: [resource] },
      }),
    ).toThrow();
  });
  it('does not interrupt a safe wait for harmless satiety changes', () => {
    let run = createEvolutionRun(initial());
    run = acceptEvolutionProgram(run, {
      agentId: 'lin',
      tick: 0,
      call: 1,
      code: 'wait(12);',
      summary: 'Observe while reserves are sufficient.',
    });
    for (let i = 0; i < 6; i++)
      run = advanceEvolutionRound(run, EMPTY_PROPOSAL);
    expect(run.cursors.lin?.remaining).toHaveLength(6);
    expect(run.interruptions).toHaveLength(0);
  });
});

it('keeps a zero ecological assignment even when a different new type is requested', () => {
  let w = initial();
  const p: EvolutionProposal = {
    resources: [resource],
    ecology: [
      {
        id: 'empty-season',
        resource: resource.id,
        siteKind: 'growth',
        biomes: ['grassland'],
        distribution: [0],
        reason: 'This habitat has no mature seed this season.',
      },
    ],
    mechanics: [],
    reviews: [
      {
        agentId: 'lin',
        decision: 'reject',
        reason: 'No reachable productive seed stock remains.',
        prerequisites: [],
        learningRounds: 0,
        mechanicId: null,
      },
    ],
  };
  w = stepEvolutionRound(w, {
    actions: actions(w, { type: 'learn', agentId: 'lin', request }),
    proposal: p,
  });
  const next = stepEvolutionRound(w, {
    actions: actions(w, { type: 'learn', agentId: 'lin', request }),
    proposal: {
      ...p,
      resources: [{ ...resource, id: 'new-grain' }],
      ecology: [
        {
          ...p.ecology[0],
          id: 'another-population',
          resource: 'new-grain',
          distribution: [0, 3, 3, 3],
        },
      ],
    },
  });
  expect(evolutionData(next).sites[0]).toMatchObject({
    allocation: 'empty-season',
    stock: { 'reed-seed': 0 },
  });
  expect(evolutionData(next).sites[0]?.stock['new-grain']).toBeUndefined();
});
it('persists generated preparation and tool recipes with actual costs and stable identification', () => {
  const w = initial(),
    prepared = { ...resource, id: 'prepared-cap', nutrition: 18, toxicity: 0 },
    tool = { ...resource, id: 'wooden-probe', nutrition: 0, durability: 2 };
  const p: EvolutionProposal = {
    resources: [prepared, tool],
    ecology: [],
    mechanics: [
      {
        id: 'preparation',
        name: 'Prepare a cap',
        description: 'Use one branch and one raw cap to prepare a unit',
        parameters: ['food'],
        code: JSON.stringify([
          op({
            op: 'convert',
            target: 'food',
            resource: 'prepared-cap',
            costs: [{ resource: 'branch', quantity: 1 }],
          }),
        ]),
      },
    ],
    reviews: [
      {
        agentId: 'lin',
        decision: 'create',
        reason: 'One learning round for a tested preparation process.',
        prerequisites: ['A raw cap and a branch'],
        learningRounds: 1,
        mechanicId: 'preparation',
      },
    ],
  };
  let next = stepEvolutionRound(w, {
    actions: actions(w, { type: 'learn', agentId: 'lin', request }),
    proposal: p,
  });
  next = use(next, { food: 'cap-one' });
  expect(evolutionData(next).events[0]?.outcome).toBe('used');
  expect(
    evolutionData(next).stacks.find((s) => s.id === 'cap-one')?.quantity,
  ).toBe(1);
  expect(
    evolutionData(next).stacks.find((s) => s.id === 'wood-one')?.quantity,
  ).toBe(2);
  expect(
    evolutionData(next).stacks.find((s) => s.type === 'prepared-cap')?.quantity,
  ).toBe(1);
  const identify = learn(initial(), [op({ op: 'identify' })]);
  const identified = use(identify, { item: 'cap-one' });
  expect(evolutionData(identified).memory.lin?.knownTypes).toContain('raw-cap');
  expect(evolutionData(identified).vitals.lin?.health).toBe(100);
  expect(
    evolutionData(identified).stacks.find((s) => s.id === 'cap-one')?.quantity,
  ).toBe(2);
  next = stepEvolutionRound(next, {
    actions: actions(next, { type: 'learn', agentId: 'lin', request }),
    proposal: {
      ...EMPTY_PROPOSAL,
      mechanics: [
        {
          id: 'probe-making',
          name: 'Make a wooden probe',
          description: 'Consume one branch to make a durable tool',
          parameters: [],
          code: JSON.stringify([
            op({
              op: 'convert',
              target: null,
              resource: 'wooden-probe',
              costs: [{ resource: 'branch', quantity: 1 }],
            }),
          ]),
        },
      ],
      reviews: [{ ...p.reviews[0], mechanicId: 'probe-making' }],
    },
  });
  next = stepEvolutionRound(next, {
    actions: actions(next, {
      type: 'use',
      agentId: 'lin',
      skillId: 'ability-2',
      args: {},
    }),
    proposal: EMPTY_PROPOSAL,
  });
  expect(
    evolutionData(next).stacks.find((s) => s.type === 'wooden-probe'),
  ).toMatchObject({ quantity: 1, durability: 2 });
  expect(
    evolutionData(next).stacks.find((s) => s.id === 'wood-one')?.quantity,
  ).toBe(1);
});
it('rejects competing extractions atomically without spending either actor inventory', () => {
  let w = initial(true);
  const distribution =
    seededUnit(20261109, 'ecology:reeds') < 0.5 ? [2, 0] : [0, 2];
  w = stepEvolutionRound(w, {
    actions: w.agents.map((a) => ({ type: 'learn', agentId: a.id, request })),
    proposal: {
      resources: [resource],
      ecology: [
        {
          id: 'seeded',
          resource: resource.id,
          siteKind: 'growth',
          biomes: ['grassland'],
          distribution,
          reason: 'Finite seeded test stock.',
        },
      ],
      mechanics: [
        {
          id: 'shared-extract',
          name: 'Gather grains',
          description: 'Transfer a finite adjacent grain',
          parameters: ['site'],
          code: JSON.stringify([
            op({ op: 'extract', target: 'site', resource: resource.id }),
          ]),
        },
      ],
      reviews: w.agents.map((a) => ({
        agentId: a.id,
        decision: 'create',
        reason: 'Learn the same physical operation.',
        prerequisites: [],
        learningRounds: 1,
        mechanicId: 'shared-extract',
      })),
    },
  });
  const next = stepEvolutionRound(w, {
    actions: w.agents.map((a) => ({
      type: 'use',
      agentId: a.id,
      skillId: 'ability-1',
      args: { site: 'reeds' },
    })),
    proposal: EMPTY_PROPOSAL,
  });
  expect(
    evolutionData(next).events.every((e) => e.outcome === 'resource-conflict'),
  ).toBe(true);
  expect(evolutionData(next).sites[0]?.stock[resource.id]).toBe(2);
  expect(
    evolutionData(next).stacks.filter((s) => s.type === resource.id),
  ).toHaveLength(0);
});

it('preserves same-barrier ecology while applying an existing-stock transaction from the round-start snapshot', () => {
  const initialWorld = initial(true),
    data = evolutionData(initialWorld);
  let w: WorldState = {
    ...initialWorld,
    evolution: {
      ...data,
      sites: data.sites.map((s) => ({ ...s, stock: { branch: 2 } })),
    },
  };
  w = learn(w, [op({ op: 'extract', resource: 'branch' })]);
  const distribution =
    seededUnit(20261109, 'ecology:reeds') < 0.5 ? [2, 0] : [0, 2];
  const next = stepEvolutionRound(w, {
    actions: [
      {
        type: 'use',
        agentId: 'lin',
        skillId: 'ability-1',
        args: { item: 'reeds' },
      },
      { type: 'learn', agentId: 'moss', request },
    ],
    proposal: {
      resources: [resource],
      ecology: [
        {
          id: 'new-season',
          resource: resource.id,
          siteKind: 'growth',
          biomes: ['grassland'],
          distribution,
          reason: 'Assign previously undefined finite seed stock once.',
        },
      ],
      mechanics: [],
      reviews: [
        {
          agentId: 'moss',
          decision: 'reject',
          mechanicId: null,
          learningRounds: 0,
          prerequisites: [],
          reason:
            'The habitat is defined; this requested implementation remains unsupported.',
        },
      ],
    },
  });
  expect(evolutionData(next).sites[0]).toMatchObject({
    allocation: 'new-season',
    stock: { branch: 1, 'reed-seed': 2 },
  });
  expect(evolutionData(next).events[0]?.outcome).toBe('used');
  expect(evolutionData(w).sites[0]?.stock).toEqual({ branch: 2 });
});
