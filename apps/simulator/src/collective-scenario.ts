import {
  OPEN_BASELINE,
  continuousRegistry,
  v7Clone,
  v7Freeze,
  v7Install,
  v7Remember,
  v7AssertWorld,
  v7Json,
  v7Obstacles,
  v7SegmentClear,
  v7Distance,
  v7Signature,
} from '@self-evolving-world/world-core';
import type { CollectiveGroup, V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from './open-scenario.js';

export const COLLECTIVE_BASELINE = [...OPEN_BASELINE, 'council', 'teach'];
export const COLLECTIVE_CAMPAIGN = 'collective-life-v1';
export const COLLECTIVE_GOAL =
  'Maintain health with tolerable risk, improve personal and shared life, understand unknowns, develop reusable abilities and honor freely accepted commitments. Choose, revise, pause or abandon your own projects using actual evidence. No specific invention or social arrangement is required.';
export const COLLECTIVE_OBJECTIVE =
  'Compare three groups of six independent members under shared observed information and unified control (A) versus private knowledge, mild personal preferences and persistent intentions (B), for up to 200 rounds each; then continue the same B checkpoint toward 1600 cumulative rounds under fixed campaign budgets. No prescribed activity, invention or causal attribution to one component.';
export function collectivePhysicalGenesis(saved: V7World): string {
  const world = v7Clone(saved);
  delete world.config.collective;
  world.config.budgets = { ordinary: 0, world: 0, development: 0 };
  if (world.config.development)
    world.config.development.scope = 'physical-comparison';
  if (world.config.experience) world.config.experience.targetRounds = 1600;
  for (const actor of world.actors) delete actor.collective;
  return v7Signature(world);
}
/** Identical physical genesis in both arms. Only the declared information/agency treatment differs. */
export function initialCollectiveWorld(scope: string, arm: 'A' | 'B'): V7World {
  const base = initialOpenWorld('collective-genesis-foundation'),
    world = v7Clone(base);
  world.config.seed = 20261123;
  world.config.width = 96;
  world.config.height = 72;
  world.config.budgets =
    arm === 'A'
      ? { ordinary: 120, world: 10, development: 4 }
      : { ordinary: 530, world: 50, development: 16 };
  world.config.collective = {
    version: 1,
    campaign: COLLECTIVE_CAMPAIGN,
    arm,
    shortRounds: 200,
    shortBudgets: { ordinary: 120, world: 10, development: 4 },
    tokens: {
      short: 1_300_000,
      total: arm === 'A' ? 1_300_000 : 5_200_000,
      output: 8192,
    },
    contextCharacters: 56000,
    maxDecisionWait: 8,
    reconsiderAfter: 100,
    coordinationInterval: 24,
  };
  if (!world.config.development || !world.config.experience)
    throw new Error('Fresh development and experience policy required.');
  world.config.development.scope = scope;
  world.config.development.baseline = [...COLLECTIVE_BASELINE];
  world.config.experience.targetRounds = arm === 'A' ? 200 : 1600;
  world.terrain = Array.from({ length: 72 }, (_, y) => {
    const row = base.terrain[y % 36];
    if (!row) throw new Error('Missing base terrain.');
    return row + row;
  });
  world.objects = [0, 1, 2, 3].flatMap((tile) =>
    base.objects.map((object) => {
      const o = v7Clone(object),
        x = (tile % 2) * 48,
        y = Math.floor(tile / 2) * 36;
      o.id = `region-${String(tile)}-${object.id}`;
      o.spatial.x += x;
      o.spatial.y += y;
      if (typeof o.data.homeX === 'number') o.data.homeX += x;
      if (typeof o.data.homeY === 'number') o.data.homeY += y;
      if (typeof o.data.group === 'string')
        o.data.group = `region-${String(tile)}-${o.data.group}`;
      return o;
    }),
  );
  world.actors = [];
  world.stacks = [];
  const groups: CollectiveGroup[] = [
    { id: 'ash', name: 'Ash', meeting: { x: 9, y: 10 }, members: [] },
    { id: 'birch', name: 'Birch', meeting: { x: 57, y: 10 }, members: [] },
    { id: 'cedar', name: 'Cedar', meeting: { x: 9, y: 46 }, members: [] },
  ];
  for (const [g, group] of groups.entries()) {
    for (let n = 0; n < 6; n++) {
      const template = base.actors[n % 3];
      if (!template) throw new Error('Missing baseline identity.');
      const actor = v7Clone(template);
      actor.id = `${group.id}-${String(n + 1)}`;
      actor.name = `${group.name} ${String(n + 1)}`;
      const desired = {
        x: group.meeting.x + ((n % 3) - 1) * 2,
        y: group.meeting.y + (Math.floor(n / 3) - 0.5) * 3,
      };
      const positions = Array.from({ length: 121 }, (_, i) => ({
        x: desired.x + ((i % 11) - 5) * 0.25,
        y: desired.y + (Math.floor(i / 11) - 5) * 0.25,
      })).sort((a, b) => v7Distance(a, desired) - v7Distance(b, desired));
      const position = positions.find(
        (p) =>
          v7SegmentClear(p, p, actor.radius, v7Obstacles(world)) &&
          world.actors.every(
            (a) => v7Distance(a.position, p) > a.radius + actor.radius + 0.2,
          ),
      );
      if (!position) throw new Error('No collision-free member spawn.');
      actor.position = position;
      if (actor.life) actor.life.spawn = v7Clone(position);
      actor.memory = {
        cells: [],
        objects: [],
        stacks: [],
        experiences: [],
        notes: [],
        preferences: [],
        important: [],
        discoveries: {
          berry: { nutrition: 8, toxicity: 0 },
          root: { nutrition: 14, toxicity: 0 },
        },
        knowledge: {},
        projects: {},
        abilityDetails: [],
      };
      const variation = (slot: number) =>
        arm === 'A'
          ? 0.5
          : 0.4 +
            (((g * 6 + n + 1) * (37 + slot * 16) + world.config.seed) % 201) /
              1000;
      actor.collective = {
        intent: null,
        group: group.id,
        species: 'human',
        tendencies: {
          curiosity: variation(0),
          risk: variation(1),
          social: variation(2),
          comfort: variation(3),
        },
        trust: {},
        knownAbilities: [...COLLECTIVE_BASELINE],
        commitments: {},
        received: [],
        lastSocial: 0,
        lastProgress: 0,
        updates: [],
      };
      world.actors.push(actor);
      group.members.push(actor.id);
      // Authored population capacity, fixed before inference. Harvest and regrowth remain physical and finite.
      for (const [food, dx, dy, suffix] of [
        ['berry', -0.7, -0.8, ''],
        ['root', 0.7, 0.8, ''],
        ['berry', 0.7, -0.8, '-secondary'],
        ['root', -0.7, 0.8, '-secondary'],
      ] as const) {
        const source = base.objects.find((o) => o.data.resource === food);
        if (!source) throw new Error('Missing initial food ecology.');
        const object = v7Clone(source);
        object.id = `collective-${actor.id}-${food}${suffix}`;
        object.spatial.x = position.x + dx;
        object.spatial.y = position.y + dy;
        object.data.stock = 6;
        object.data.capacity = 6;
        object.data.interval = food === 'berry' ? 6 : 9;
        world.objects.push(object);
      }
    }
  }
  world.state['collective:groups'] = v7Json(groups);
  let installed = v7Clone(
    v7Install(world, continuousRegistry(world), 'foundation-collective@1'),
  );
  for (const actor of installed.actors)
    actor.mastered = [...COLLECTIVE_BASELINE];
  installed.state['collective:baselineEvents'] = v7Json(
    installed.eventTypes ?? [],
  );
  v7Remember(installed);
  v7AssertWorld(installed, continuousRegistry(installed));
  installed = v7Freeze(installed);
  return installed;
}
