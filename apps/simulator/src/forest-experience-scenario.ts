import {
  continuousRegistry,
  v7Clone,
  v7Freeze,
  v7Install,
  v7Remember,
  v7AssertWorld,
  forestInitialExperience,
  FOREST_REFERENCE_SCOPES,
} from '@self-evolving-world/world-core';
import type { V7World, V7Configuration } from '@self-evolving-world/world-core';
import { initialForestWorld, FOREST_CONFIG } from './forest-scenario.js';

export const FOREST_EXPERIENCE_CONFIG: V7Configuration = {
  ...FOREST_CONFIG,
  seed: 20261121,
  hunger: 0.9,
  budgets: { ordinary: 650, world: 60, development: 20 },
  experience: {
    version: 1,
    targetRounds: 1200,
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
};

/** Ex9 genesis: existing implemented capabilities are public, but none grants personal mastery. */
export function initialForestExperienceWorld(): V7World {
  const registry = continuousRegistry();
  let world = initialForestWorld();
  for (const key of [
    'forest-wildlife@1',
    'forest-perception@1',
    'food-assessment@1',
    'shelter-construction@1',
    'active-warming@1',
    'route-inspection@1',
  ])
    world = v7Install(world, registry, key);
  const next = v7Clone(world);
  next.config = v7Clone(FOREST_EXPERIENCE_CONFIG);
  for (const object of next.objects) {
    const resource = next.resources.find((r) => r.id === object.data.resource);
    if (object.id.startsWith('forest-') && resource && resource.nutrition > 0) {
      object.data.stock =
        Number(object.data.stock ?? 0) *
        (next.config.experience?.remoteStockScale ?? 1);
      object.data.capacity =
        Number(object.data.capacity ?? 0) *
        (next.config.experience?.remoteStockScale ?? 1);
    }
  }
  next.state.environment = 'forest-experience-v1';
  next.eventTypes = [
    ...new Set([...(next.eventTypes ?? []), 'meal-experience', 'mental-state']),
  ];
  const durations: Record<string, number | null> = {
    navigate: null,
    'observe-wildlife': 2,
    'assess-food': null,
    'build-shelter': 6,
    'shelter-maintain': 2,
    'active-warming': null,
  };
  for (const ability of next.abilities) {
    ability.references = FOREST_REFERENCE_SCOPES[ability.id] ?? {};
    ability.execution = {
      duration:
        durations[ability.id] === undefined
          ? 1
          : (durations[ability.id] ?? null),
      interruption: 'cancel',
      progress:
        'repeat counts complete operations. Ongoing operations continue with the same resolved identities. Changing action cancels unfinished work and releases surviving unconsumed escrow once; effort stays spent. Global inference/development/budget pauses preserve exact progress without advancing time.',
    };
    if (ability.id === 'request') {
      ability.function =
        'Describe an encountered problem, intended effect and known conditions for functional review.';
      ability.effects +=
        ' Unknown methods, inputs or costs may be recorded as unknown; the reviewer supplies a feasible specification.';
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
      ability.effects +=
        ' Ordinary messages update memory without interruption. Only an urgent received message about the recipient or current work target can interrupt; outgoing success continues the plan.';
    }
    if (ability.references.target)
      ability.effects +=
        ' References: item:ID for an instance, object:ID for a scene object, resource:ID for a category. Bare exact IDs and bare resource IDs are compatibility aliases. Ambiguous categories return observable candidates; choose an exact instance.';
  }
  for (const actor of next.actors) actor.experience = forestInitialExperience();
  v7Remember(next);
  v7AssertWorld(next, registry);
  return v7Freeze(next);
}
