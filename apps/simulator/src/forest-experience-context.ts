import type { V7Actor } from '@self-evolving-world/world-core';

/** Bounded summaries of the actor's own measured history, without suggested activities. */
export function forestExperienceSummary(actor: V7Actor) {
  const state = actor.experience;
  if (!state) return null;
  const recent = state.recent,
    first = recent[0];
  const failures: Record<string, number> = {},
    actions: Record<string, number> = {};
  for (const entry of recent) {
    actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    if (entry.failed)
      failures[entry.failed] = (failures[entry.failed] ?? 0) + 1;
  }
  return {
    window: recent.length,
    mentalState: state.mental,
    ...(actor.extensionState['open:routineBurden'] !== undefined
      ? {
          sustainedRoutineBurden: actor.extensionState['open:routineBurden'],
          routineWindow: 160,
        }
      : {}),
    temporaryMealPleasure: state.pleasure,
    monotony: state.monotony,
    substantialMeals: state.meals.map((meal) => ({
      tick: meal.tick,
      realizedNutrition: meal.nutrition,
      experiencedQuality: meal.quality,
      knownIngredients: Object.keys(meal.composition).filter(
        (id) => actor.memory.discoveries?.[id],
      ),
      compositionUncertainty:
        'Unidentified composition is not revealed by this summary.',
    })),
    trend: first
      ? {
          health: actor.vitals.health - first.health,
          satiety: actor.vitals.satiety - first.satiety,
          energy: actor.vitals.energy - first.energy,
        }
      : null,
    timeByAction: actions,
    totalEffort: recent.reduce((n, r) => n + r.effort, 0),
    recoveredEnergy: recent.reduce((n, r) => n + r.recovery, 0),
    repeatedFailures: failures,
    observedExperienceAwards: recent.reduce((n, r) => n + r.benefit, 0),
  };
}
