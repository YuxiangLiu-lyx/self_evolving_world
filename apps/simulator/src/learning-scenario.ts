import { createLearningWorld, resource } from '@self-evolving-world/world-core';
import type {
  EnvironmentObject,
  GroundItem,
  LearningEnvironment,
  Resource,
  WorldSetup,
  WorldState,
} from '@self-evolving-world/world-core';

export const LEARNING_OBJECTIVE =
  'Observe whether primitive-era actors request, learn and use generated resource-backed skills to improve health and survival under sustained hunger over 18 synchronous rounds; preserve real model evidence and a separate deterministic no-action control.';
export function learningScenario(): {
  setup: WorldSetup;
  environment: LearningEnvironment;
} {
  const agents = [
    { id: 'lin', name: 'Lin', position: { x: 2, y: 3 } },
    { id: 'moss', name: 'Moss', position: { x: 6, y: 11 } },
    { id: 'sol', name: 'Sol', position: { x: 17, y: 5 } },
  ];
  const items: GroundItem[] = [],
    resources: Resource[] = [],
    objects: EnvironmentObject[] = [];
  const ground = (
    id: string,
    kind: Resource['kind'],
    x: number,
    y: number,
    quantity = 1,
  ) => {
    items.push({ id, name: kind, position: { x, y } });
    resources.push(resource(id, kind, quantity));
  };
  for (const a of agents) {
    const { x, y } = a.position;
    ground(`${a.id}-fruit`, 'fruit', x + 1, y);
    ground(`${a.id}-branches`, 'branch', x, y + 1, 3);
    ground(`${a.id}-stones`, 'stone', x - 1, y + 1, 3);
    ground(`${a.id}-bitter-fruit`, 'poison-fruit', x + 1, y + 2, 2);
    objects.push({
      id: `${a.id}-tree`,
      kind: 'tree',
      position: { x: x + 3, y },
      stock: { fruit: 4, branch: 3, timber: 2 },
    });
    objects.push({
      id: `${a.id}-rock`,
      kind: 'rock',
      position: { x: x - 2, y: y + 3 },
      stock: { stone: 5 },
    });
  }
  ground('far-east-fruit', 'fruit', 22, 15, 4);
  ground('far-west-fruit', 'fruit', 2, 16, 4);
  objects.push(
    {
      id: 'far-tree',
      kind: 'tree',
      position: { x: 20, y: 14 },
      stock: { fruit: 6, branch: 6, timber: 3 },
    },
    {
      id: 'north-fishery',
      kind: 'fishery',
      position: { x: 12, y: 4 },
      stock: { fish: 6 },
    },
    {
      id: 'south-fishery',
      kind: 'fishery',
      position: { x: 12, y: 13 },
      stock: { fish: 6 },
    },
  );
  return {
    setup: {
      settings: { width: 24, height: 18, visionRadius: 5 },
      agents,
      items,
    },
    environment: {
      era: 'primitive',
      river: Array.from({ length: 18 }, (_, y) => ({ x: 12, y })),
      shallows: [
        { x: 12, y: 3 },
        { x: 12, y: 12 },
      ],
      objects,
      resources,
    },
  };
}
export function initialLearningWorld(): WorldState {
  const s = learningScenario();
  return createLearningWorld(s.setup, s.environment);
}
