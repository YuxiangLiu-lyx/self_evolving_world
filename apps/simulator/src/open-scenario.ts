import {
  continuousRegistry,
  v7Clone,
  v7Freeze,
  v7Install,
  v7Remember,
  v7AssertWorld,
  forestInitialExperience,
  FOREST_REFERENCE_SCOPES,
  OPEN_BASELINE,
} from '@self-evolving-world/world-core';
import type { V7Configuration, V7World } from '@self-evolving-world/world-core';
import { initialForestWorld, FOREST_CONFIG } from './forest-scenario.js';

export const OPEN_CONFIG: V7Configuration = {
  ...FOREST_CONFIG,
  seed: 20261122,
  hunger: 0.9,
  budgets: { ordinary: 650, world: 60, development: 20 },
  experience: {
    version: 1,
    targetRounds: 1600,
    mealWindow: 10,
    substantialNutrition: 8,
    mentalRate: 0.025,
    mentalDecay: 0.003,
    restMin: 0.85,
    restMax: 1.1,
    remoteStockScale: 3,
    growthScale: 0.85,
    exposure: 0.6,
    carryingScale: 1.2,
  },
  development: {
    version: 1,
    inheritSkills: false,
    scope: 'open-ex10',
    baseline: [...OPEN_BASELINE],
    detailLimit: 4,
    projectLimit: 4,
    knowledgeLimit: 8,
    climateOffset: 5,
    hazards: [
      {
        id: 'west-drought-1',
        kind: 'drought',
        x: 9,
        y: 10,
        radius: 6,
        start: 260,
        duration: 100,
        recovery: 80,
        severity: 0.65,
      },
      {
        id: 'river-waterlogging-1',
        kind: 'waterlogging',
        x: 22,
        y: 22,
        radius: 5,
        start: 520,
        duration: 80,
        recovery: 60,
        severity: 0.8,
      },
      {
        id: 'west-drought-2',
        kind: 'drought',
        x: 9,
        y: 10,
        radius: 6,
        start: 1060,
        duration: 100,
        recovery: 80,
        severity: 0.65,
      },
      {
        id: 'river-waterlogging-2',
        kind: 'waterlogging',
        x: 22,
        y: 22,
        radius: 5,
        start: 1320,
        duration: 80,
        recovery: 60,
        severity: 0.8,
      },
    ],
  },
};
/** Fresh authored genesis. Historical generated packages are neither installed nor searchable. */
export function initialOpenWorld(scope = 'open-ex10'): V7World {
  const world = v7Clone(initialForestWorld());
  world.config = v7Clone(OPEN_CONFIG);
  if (!world.config.development) throw new Error('Missing fresh policy.');
  world.config.development.scope = scope;
  world.state = {
    environment: 'open-development-v1',
    season: 'spring',
    forestRouting: 1,
    forestPerception: 1,
    operationContinuity: 1,
  };
  for (const object of world.objects) {
    const resource = world.resources.find((r) => r.id === object.data.resource);
    if (object.id.startsWith('forest-') && resource && resource.nutrition > 0) {
      object.data.stock = Number(object.data.stock ?? 0) * 3;
      object.data.capacity = Number(object.data.capacity ?? 0) * 3;
    }
  }
  for (const ability of world.abilities) {
    ability.references = FOREST_REFERENCE_SCOPES[ability.id] ?? {};
    ability.execution = {
      duration: ability.id === 'navigate' ? null : 1,
      interruption: 'cancel',
      progress:
        'repeat counts complete executions. Continuing work retains resolved identity and progress; cancellation releases surviving unconsumed escrow once. Global pauses preserve all work and costs.',
    };
    if (ability.id === 'request') {
      ability.function =
        'Describe an encountered problem, desired effect and known conditions for functional review.';
      ability.effects +=
        ' Unknown methods and costs are allowed; the reviewer supplies a minimal feasible specification.';
    }
    if (ability.id === 'message') {
      Object.assign(ability.parameters.properties ?? {}, {
        urgency: { type: 'string', enum: ['ordinary', 'urgent'] },
        subject: { type: 'string' },
      });
      ability.parameters.required = [
        ...(ability.parameters.required ?? []),
        'urgency',
        'subject',
      ];
    }
  }
  world.eventTypes = [
    ...new Set([
      ...(world.eventTypes ?? []),
      'meal-experience',
      'mental-state',
      'satisfaction-maintained',
    ]),
  ];
  for (const actor of world.actors) {
    actor.mastered = world.abilities.map((a) => a.id);
    actor.learning = null;
    actor.extensionState = {};
    actor.relationships = {};
    actor.experience = forestInitialExperience();
    actor.memory.projects = {};
    actor.memory.knowledge = {};
    actor.memory.abilityDetails = [];
  }
  const registry = continuousRegistry(world),
    next = v7Clone(v7Install(world, registry, 'foundation-open@1'));
  for (const actor of next.actors) actor.mastered = [...OPEN_BASELINE];
  if (
    next.abilities
      .map((a) => a.id)
      .sort()
      .join() !== [...OPEN_BASELINE].sort().join()
  )
    throw new Error('Genesis does not match the reviewed baseline allowlist.');
  v7Remember(next);
  v7AssertWorld(next, registry);
  return v7Freeze(next);
}
