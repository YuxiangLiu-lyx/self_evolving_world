import { materialReduce } from './material-lots.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import type { V7Stack, V7World } from './continuous-types.js';

/** Exact integer-tenths arithmetic; integer interfaces continue to express whole resource units. */
export function foodTenths(quantity: number): number {
  const amount = Math.round(quantity * 10);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    Math.abs(quantity * 10 - amount) > 1e-7
  )
    throw new Error('Food quantities require exact nonnegative tenths.');
  return amount;
}
export function foodSetQuantity(stack: V7Stack, tenths: number): void {
  if (!Number.isSafeInteger(tenths) || tenths < 0)
    throw new Error('Invalid fixed-point material quantity.');
  materialReduce(stack, tenths);
  stack.quantityTenths = tenths;
  stack.quantity = tenths / 10;
}
/** Lazy lossless encoding adds no material during installation and normalizes whole-unit legacy handlers. */
export function normalizeFoodAccounting(world: V7World): void {
  if (world.state.foodAssessment !== 1 && !world.config.development) return;
  for (const stack of world.stacks)
    foodSetQuantity(stack, foodTenths(stack.quantity));
}

/** Moisture removal changes burden, not the original food-unit nutrient/toxin totals. */
export function foodUnitMass(world: V7World, stack: V7Stack): number {
  return (
    stack.physical?.unitMass ?? collectiveFoodProfile(world, stack)?.mass ?? 1
  );
}
