import { openRoutine } from './open-experience.js';
import type {
  V7Actor,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestEvent } from './forest-environment.js';

export function forestInitialExperience(): NonNullable<V7Actor['experience']> {
  return {
    mental: 0,
    meals: [],
    pendingMeal: null,
    monotony: 0,
    pleasure: 0,
    pleasureUntil: -1,
    lastMealReward: -100,
    recent: [],
  };
}
export function forestRestFactor(world: V7World, actor: V7Actor): number {
  const p = world.config.experience;
  if (!p) return 1;
  const mental = actor.experience?.mental ?? 0;
  return Math.max(
    p.restMin,
    Math.min(
      p.restMax,
      1 + mental * (mental < 0 ? 1 - p.restMin : p.restMax - 1),
    ),
  );
}

/** Called only by actual material ingestion. Nutrition remains independent of mood and pleasure. */
export function forestMeal(
  world: V7World,
  actor: V7Actor,
  resource: V7Resource,
  quantity: number,
  realized: number,
  stack?: V7Stack,
): void {
  const p = world.config.experience,
    state = actor.experience;
  if (!p || !state || realized <= 0) return;
  const lifetime = resource.properties?.decay ?? 0;
  const quality = Math.max(
    0,
    Math.min(
      1,
      (resource.food?.quality ?? 0.8) *
        (lifetime ? 1 - (stack?.decay ?? 0) / lifetime : 1),
    ),
  );
  const ingredients = resource.food?.ingredients ?? [
    { resource: resource.id, share: 1 },
  ];
  const method = resource.food?.method ?? 'unprocessed';
  // Nearby intakes are one episode; fractional portions accumulate real nutrition, never extra awards.
  const last = state.meals.at(-1);
  const active = last && world.tick - last.tick < 8 ? last : state.pendingMeal;
  const meal = active ?? {
    tick: world.tick,
    nutrition: 0,
    composition: {},
    methods: [],
    quality: 0,
  };
  const previous = meal.nutrition;
  meal.nutrition += realized;
  meal.quality =
    (meal.quality * previous + quality * realized) / meal.nutrition;
  const total = ingredients.reduce((sum, x) => sum + x.share, 0);
  for (const ingredient of ingredients)
    meal.composition[ingredient.resource] =
      (meal.composition[ingredient.resource] ?? 0) +
      (realized * ingredient.share) / total;
  if (!meal.methods.includes(method)) meal.methods.push(method);
  if (meal === last) return;
  state.pendingMeal = meal;
  if (meal.nutrition < p.substantialNutrition) return;
  state.pendingMeal = null;
  state.meals.push(meal);
  state.meals = state.meals.slice(-p.mealWindow);
  const composition: Record<string, number> = {};
  for (const entry of state.meals)
    for (const [id, amount] of Object.entries(entry.composition))
      composition[id] = (composition[id] ?? 0) + amount / entry.nutrition;
  const dominance =
    Math.max(0, ...Object.values(composition)) / state.meals.length;
  const methodDominance =
    Math.max(
      0,
      ...state.meals.map(
        (entry) =>
          state.meals.filter(
            (other) => other.methods.join(',') === entry.methods.join(','),
          ).length,
      ),
    ) / state.meals.length;
  state.monotony =
    state.meals.length < 6
      ? 0
      : Math.max(0, (dominance - 0.65) / 0.35) * (0.8 + 0.2 * methodDominance);
  const reward = world.tick - state.lastMealReward >= 12;
  if (reward) {
    state.pleasure = Math.min(1, meal.quality * (1 - 0.7 * state.monotony));
    state.pleasureUntil = world.tick + 6;
    state.lastMealReward = world.tick;
  }
  forestEvent(
    world,
    'meal-experience',
    'Actual substantial intake updated dietary experience.',
    actor.position,
    actor.id,
    {
      resource: resource.id,
      quantity,
      realized,
      quality: meal.quality,
      monotony: state.monotony,
      pleasure: reward ? state.pleasure : 0,
      rewarded: reward,
      substantialMeals: state.meals.length,
    },
  );
}

/** Absence/expiration of pleasure tends to neutral, never supplies a negative experience. */
export function forestExperienceAfterRound(
  before: V7World,
  world: V7World,
): void {
  const p = world.config.experience;
  if (!p) return;
  for (const actor of world.actors) {
    const state = actor.experience,
      old = before.actors.find((a) => a.id === actor.id);
    if (!state || !old) continue;
    const events = world.events.filter((e) => e.actor === actor.id);
    const rewards = events.filter((e) => e.type === 'satisfaction');
    const meal = events.find((e) => e.type === 'meal-experience');
    const positive = Math.min(
      1,
      rewards.reduce((n, e) => n + Number(e.data.value ?? 0) / 5, 0) +
        (meal?.data.rewarded ? Number(meal.data.pleasure) * 0.2 : 0),
    );
    const negative = Math.min(
      1,
      openRoutine(world, actor) +
        events.filter((e) => e.type === 'injured').length * 0.3 +
        (meal ? Number(meal.data.monotony ?? 0) * 0.15 : 0),
    );
    const previous = state.mental;
    state.mental = v7RoundNumber(
      Math.max(
        -1,
        Math.min(
          1,
          previous * (1 - p.mentalDecay) + p.mentalRate * (positive - negative),
        ),
      ),
    );
    if (world.tick > state.pleasureUntil) state.pleasure = 0;
    const recovered = events.reduce(
      (n, e) =>
        n +
        (e.type === 'rested'
          ? Number(e.data.recovered ?? 0)
          : e.type === 'recuperation-progress'
            ? Number(e.data.recoveredEnergy ?? 0)
            : 0),
      0,
    );
    const effort = Math.max(
      0,
      old.vitals.energy + recovered - actor.vitals.energy,
    );
    state.recent.push({
      tick: world.tick,
      ...actor.vitals,
      effort,
      recovery: recovered,
      action:
        events.find((e) => e.interface)?.interface ??
        (old.learning ? 'learning' : 'none'),
      failed: events.find((e) => !e.success)?.description ?? null,
      benefit: rewards.reduce((n, e) => n + Number(e.data.value ?? 0), 0),
    });
    state.recent = state.recent.slice(-40);
    if (positive || negative || world.tick % 20 === 0)
      forestEvent(
        world,
        'mental-state',
        'Slow mental state settled from actual experiences.',
        actor.position,
        actor.id,
        {
          before: previous,
          after: state.mental,
          positive,
          negative,
          restFactor: forestRestFactor(world, actor),
        },
      );
  }
}
