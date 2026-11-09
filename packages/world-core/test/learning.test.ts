import { describe, expect, it } from 'vitest';
import {
  compileSkill,
  createLearningWorld,
  learningData,
  resource,
  reviewedSkills,
  stepLearningRound,
  replayLearning,
} from '../src/index.js';
import type {
  CapabilityRequest,
  LearningAction,
  LearningEnvironment,
  SkillDraft,
  WorldReview,
  WorldState,
} from '../src/index.js';

const request: CapabilityRequest = {
  name: 'Nourish',
  purpose: 'Recover satiety by consuming owned food',
  target: 'Owned edible resource',
  conditions: 'Food in inventory',
  expectedEffect: 'Consume one unit and apply its nutrition and toxicity',
};
const draft: SkillDraft = {
  name: 'Nourish',
  description: 'Consume one owned food unit.',
  parameters: ['food'],
  code: 'consume("food", 1);',
};
function initial(kind: 'fruit' | 'poison-fruit' = 'fruit'): WorldState {
  return createLearningWorld(
    {
      settings: { width: 8, height: 6 },
      agents: [
        { id: 'a', name: 'A', position: { x: 1, y: 1 } },
        { id: 'b', name: 'B', position: { x: 3, y: 1 } },
      ],
      items: [{ id: 'food', name: 'Food', position: { x: 1, y: 1 } }],
    },
    {
      era: 'primitive',
      river: [
        { x: 4, y: 1 },
        { x: 4, y: 2 },
      ],
      shallows: [{ x: 4, y: 2 }],
      resources: [resource('food', kind, 2)],
      objects: [
        {
          id: 'tree',
          kind: 'tree',
          position: { x: 2, y: 1 },
          stock: { branch: 3, fruit: 3, timber: 1 },
        },
      ],
    } satisfies LearningEnvironment,
  );
}
const wait = (agentId: string): LearningAction => ({ type: 'wait', agentId });
const learn = (agentId: string): LearningAction => ({
  type: 'learn',
  agentId,
  request,
});
function review(
  agentId: string,
  rounds = 1,
  specification = draft,
): WorldReview {
  return {
    agentId,
    decision: 'create',
    reason: 'Direct consumption is feasible with owned food.',
    prerequisites: ['Owned edible resource'],
    learningRounds: rounds,
    skillId: null,
    specification,
  };
}
function step(
  w: WorldState,
  a: LearningAction = wait('a'),
  b: LearningAction = wait('b'),
  reviews: readonly WorldReview[] = [],
): WorldState {
  return stepLearningRound(w, { actions: [a, b], reviews });
}

describe('learning-v1 world rules', () => {
  it('caps nutrition at 100 before settlement while charging all consumed food', () => {
    let w = createLearningWorld(
      {
        settings: { width: 4, height: 4 },
        agents: [{ id: 'a', name: 'A', position: { x: 1, y: 1 } }],
        items: [{ id: 'food', name: 'Fruit', position: { x: 1, y: 1 } }],
      },
      {
        era: 'primitive',
        river: [],
        shallows: [],
        objects: [],
        resources: [resource('food', 'fruit', 6)],
      },
    );
    const act = (a: LearningAction, reviews: WorldReview[] = []) => {
      w = stepLearningRound(w, { actions: [a], reviews });
    };
    act({ type: 'pickup', agentId: 'a', itemId: 'food' });
    act(learn('a'), [
      review('a', 1, {
        ...draft,
        code: 'consume("food",3); consume("food",3);',
      }),
    ]);
    act({
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.learning?.vitals.a?.satiety).toBe(97);
    expect(w.agents[0]?.inventory).toEqual([]);
    expect(w.learning?.environment.resources[0]?.quantity).toBe(0);
  });

  it('crafts a generated tool using actual materials, then enforces fishery prerequisites and tool wear', () => {
    let w = createLearningWorld(
      {
        settings: { width: 8, height: 6 },
        agents: [{ id: 'a', name: 'A', position: { x: 3, y: 1 } }],
        items: [
          { id: 'branches', name: 'Branches', position: { x: 3, y: 1 } },
          { id: 'stones', name: 'Stones', position: { x: 3, y: 1 } },
        ],
      },
      {
        era: 'primitive',
        river: [{ x: 4, y: 1 }],
        shallows: [],
        resources: [
          resource('branches', 'branch', 2),
          resource('stones', 'stone', 1),
        ],
        objects: [
          {
            id: 'water',
            kind: 'fishery',
            position: { x: 4, y: 1 },
            stock: { fish: 6 },
          },
        ],
      },
    );
    const act = (a: LearningAction, reviews: WorldReview[] = []) => {
      w = stepLearningRound(w, { actions: [a], reviews });
    };
    act(learn('a'), [
      review('a', 1, {
        name: 'Rod making',
        description: 'Construct a basic rod from materials.',
        parameters: [],
        code: 'craft("rod");',
      }),
    ]);
    act({ type: 'use', agentId: 'a', skillId: 'skill-1', args: {} });
    expect(w.learning?.events[0]?.outcome).toBe('use-failed');
    act({ type: 'pickup', agentId: 'a', itemId: 'branches' });
    act({ type: 'pickup', agentId: 'a', itemId: 'stones' });
    act({ type: 'use', agentId: 'a', skillId: 'skill-1', args: {} });
    expect(
      w.learning?.environment.resources.find((r) => r.kind === 'branch')
        ?.quantity,
    ).toBe(0);
    expect(
      w.learning?.environment.resources.find((r) => r.kind === 'stone')
        ?.quantity,
    ).toBe(0);
    expect(
      w.learning?.environment.resources.find((r) => r.kind === 'rod')
        ?.durability,
    ).toBe(3);
    act(learn('a'), [
      review('a', 3, {
        name: 'Fishing',
        description: 'Take a fish using an owned rod.',
        parameters: ['water'],
        code: 'harvest("water","fish",1);',
      }),
    ]);
    act({ type: 'study', agentId: 'a' });
    act({ type: 'study', agentId: 'a' });
    for (let n = 0; n < 3; n++)
      act({
        type: 'use',
        agentId: 'a',
        skillId: 'skill-2',
        args: { water: 'water' },
      });
    expect(w.learning?.environment.objects[0]?.stock.fish).toBe(3);
    expect(
      w.learning?.environment.resources.find((r) => r.kind === 'rod')
        ?.durability,
    ).toBe(0);
    act({
      type: 'use',
      agentId: 'a',
      skillId: 'skill-2',
      args: { water: 'water' },
    });
    expect(w.learning?.events[0]?.outcome).toBe('use-failed');
    expect(w.learning?.environment.objects[0]?.stock.fish).toBe(3);
  });

  it('settles starvation after actions and before loss, with exact death at round 15', () => {
    let world = initial();
    const frames = [world];
    for (let round = 1; round <= 18; round++) {
      world = step(world);
      frames.push(world);
    }
    expect(frames[5]?.learning?.vitals.a).toMatchObject({
      health: 100,
      satiety: 0,
    });
    expect(frames[6]?.learning?.vitals.a).toMatchObject({
      health: 90,
      satiety: 0,
    });
    expect(frames[14]?.learning?.vitals.a?.health).toBe(10);
    expect(frames[15]?.learning?.vitals.a?.health).toBe(0);
    expect(
      frames[18]?.learning?.events.every((e) => e.outcome === 'dead'),
    ).toBe(true);
    expect(frames[0]?.learning?.vitals.a?.satiety).toBe(15);
    expect(Object.isFrozen(world.learning?.environment.resources)).toBe(true);
  });
  it.each([1, 2, 3, 4])(
    'requires %i real advances before individual proficiency becomes usable',
    (duration) => {
      let world = initial();
      world = step(world, { type: 'pickup', agentId: 'a', itemId: 'food' });
      world = step(world, learn('a'), wait('b'), [review('a', duration)]);
      const skill = world.learning?.skills[0];
      expect(skill?.id).toBe('skill-1');
      expect(world.learning?.knowledge.b?.learned).toEqual([]);
      for (let n = 1; n < duration; n++) {
        expect(world.learning?.knowledge.a?.learned).toEqual([]);
        world = step(world, { type: 'study', agentId: 'a' });
      }
      expect(world.learning?.knowledge.a?.learned).toEqual(['skill-1']);
      const before = world.learning?.vitals.a?.satiety ?? -1;
      world = step(world, {
        type: 'use',
        agentId: 'a',
        skillId: 'skill-1',
        args: { food: 'food' },
      });
      expect(world.learning?.events[0]?.outcome).toBe('used');
      expect(world.learning?.vitals.a?.satiety).toBe(before + 21);
      expect(world.learning?.environment.resources[0]?.quantity).toBe(1);
    },
  );
  it('deduplicates alpha-equivalent same-round requests regardless of skill names while keeping separate progress', () => {
    const alias = {
      ...draft,
      name: 'Ingest',
      parameters: ['ration'],
      code: 'consume("ration", 1);',
    };
    const world = step(initial(), learn('a'), learn('b'), [
      review('a', 1),
      review('b', 2, alias),
    ]);
    expect(world.learning?.skills).toHaveLength(1);
    expect(world.learning?.events[1]?.detail).toContain('Reused skill-1');
    expect(world.learning?.knowledge.a?.learned).toEqual(['skill-1']);
    expect(world.learning?.knowledge.b?.pending).toMatchObject({
      completed: 1,
      total: 2,
      skillId: 'skill-1',
    });
    expect(
      compileSkill({ ...draft, code: 'consume("food", 2);' }, 'skill-2', 1)
        .signature,
    ).not.toBe(world.learning?.skills[0]?.signature);
  });
  it('reuses an existing implementation but never grants another actor proficiency automatically', () => {
    let w = step(initial(), learn('a'), wait('b'), [review('a')]);
    w = step(w, wait('a'), {
      type: 'use',
      agentId: 'b',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.learning?.events[1]?.outcome).toBe('use-failed');
    w = step(w, wait('a'), learn('b'), [
      {
        ...review('b', 2),
        decision: 'reuse',
        skillId: 'skill-1',
        specification: null,
      },
    ]);
    expect(w.learning?.skills).toHaveLength(1);
    expect(w.learning?.knowledge.b?.pending?.completed).toBe(1);
  });
  it('does not tick while review/development is missing or generated code fails validation', () => {
    const world = initial(),
      bytes = JSON.stringify(world);
    expect(() => step(world, learn('a'))).toThrow('before advancing');
    expect(() =>
      step(world, learn('a'), wait('b'), [
        review('a', 1, { ...draft, code: 'health = 100;' }),
      ]),
    ).toThrow('calls only');
    expect(world.tick).toBe(0);
    expect(JSON.stringify(world)).toBe(bytes);
    expect(() => reviewedSkills(world, [learn('a')], [])).toThrow();
  });
  it('executes a generated compound capability absent from the initial empty registry', () => {
    const novel = {
      name: 'Collect varied tree provisions',
      description: 'Detach fruit and a small branch together.',
      parameters: ['tree'],
      code: 'harvest("tree", "fruit", 1); harvest("tree", "branch", 1);',
    };
    expect(learningData(initial()).skills).toEqual([]);
    let w = step(initial(), learn('a'), wait('b'), [review('a', 1, novel)]);
    w = step(w, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { tree: 'tree' },
    });
    expect(w.agents[0]?.inventory.map((i) => i.name)).toEqual([
      'fruit',
      'branch',
    ]);
    expect(w.learning?.environment.objects[0]?.stock).toEqual({
      fruit: 2,
      branch: 2,
      timber: 1,
    });
  });
  it('consumes finite food, applies poison and prevents free effects or partial failed transactions', () => {
    let w = step(initial('poison-fruit'), {
      type: 'pickup',
      agentId: 'a',
      itemId: 'food',
    });
    w = step(w, learn('a'), wait('b'), [review('a')]);
    w = step(w, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.learning?.vitals.a).toMatchObject({ health: 65, satiety: 18 });
    w = step(w, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.agents[0]?.inventory).toEqual([]);
    const before = w.learning?.environment;
    w = step(w, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.learning?.events[0]?.outcome).toBe('use-failed');
    expect(w.learning?.environment).toEqual(before);
    const invalidCost = {
      ...draft,
      code: 'harvest("food", "fruit", 1); craft("rod");',
    };
    let tx = step(initial(), learn('a'), wait('b'), [
      review('a', 1, invalidCost),
    ]);
    tx = step(tx, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'tree' },
    });
    expect(tx.agents[0]?.inventory).toEqual([]);
    expect(tx.learning?.environment.objects[0]?.stock.fruit).toBe(3);
  });
  it('allows a meal at zero satiety to avoid that round starvation damage', () => {
    let w = step(initial(), { type: 'pickup', agentId: 'a', itemId: 'food' });
    w = step(w, learn('a'), wait('b'), [review('a')]);
    while (w.tick < 5) w = step(w);
    w = step(w, {
      type: 'use',
      agentId: 'a',
      skillId: 'skill-1',
      args: { food: 'food' },
    });
    expect(w.learning?.vitals.a).toMatchObject({ health: 100, satiety: 21 });
  });
  it('blocks deep water/trees, permits shallow crossings and rejects shared harvest conflicts', () => {
    let w = step(initial(), wait('a'), {
      type: 'move',
      agentId: 'b',
      direction: 'east',
    });
    expect(w.learning?.events[1]?.outcome).toBe('terrain-blocked');
    w = step(
      w,
      { type: 'move', agentId: 'a', direction: 'east' },
      { type: 'move', agentId: 'b', direction: 'south' },
    );
    expect(w.learning?.events[0]?.outcome).toBe('terrain-blocked');
    w = step(w, wait('a'), { type: 'move', agentId: 'b', direction: 'east' });
    expect(w.agents[1]?.position).toEqual({ x: 4, y: 2 });
    const harvest = { ...draft, code: 'harvest("food", "fruit", 1);' };
    w = step(initial(), learn('a'), learn('b'), [
      review('a', 1, harvest),
      review('b', 1, harvest),
    ]);
    w = step(
      w,
      { type: 'use', agentId: 'a', skillId: 'skill-1', args: { food: 'tree' } },
      { type: 'use', agentId: 'b', skillId: 'skill-1', args: { food: 'tree' } },
    );
    expect(w.learning?.events.map((e) => e.outcome)).toEqual([
      'resource-conflict',
      'resource-conflict',
    ]);
    expect(w.learning?.environment.objects[0]?.stock.fruit).toBe(3);
  });
  it.each([
    'eval("x");',
    'consume("food", -1);',
    'consume("food", 999);',
    'while(true){}',
    'harvest("food", "axe", 1);',
    'craft("spaceship");',
    'consume("food",1); health(100);',
  ])('rejects unsafe or unsupported code: %s', (code) => {
    expect(() => compileSkill({ ...draft, code }, 'skill-1', 1)).toThrow();
  });
  it('reconstructs the exact learning and resource history without a model', () => {
    const records = [
      { actions: [learn('a'), wait('b')], reviews: [review('a')] },
      { actions: [wait('a'), wait('b')], reviews: [] },
    ];
    const frames = replayLearning(initial(), records);
    expect(frames[2]).toEqual(
      step(step(initial(), learn('a'), wait('b'), [review('a')])),
    );
  });
});
