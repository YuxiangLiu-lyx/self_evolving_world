import type { V7World } from './continuous-types.js';

/** Fixed phase schedule, independent of agents' outcomes. Recovery does not create resources. */
export function longPressure(world: V7World) {
  const p = world.config.longDevelopment;
  if (!p) return null;
  const phase = world.tick % p.cycle;
  const amount =
    phase < p.pressureStart || phase >= p.recoveryEnd
      ? 0
      : phase < p.difficultyStart
        ? (phase - p.pressureStart) / (p.difficultyStart - p.pressureStart)
        : phase < p.recoveryStart
          ? 1
          : (p.recoveryEnd - phase) / (p.recoveryEnd - p.recoveryStart);
  return {
    phase:
      phase < p.pressureStart
        ? 'mild'
        : phase < p.difficultyStart
          ? 'pressure accumulating'
          : phase < p.recoveryStart
            ? 'difficult'
            : 'recovering',
    intensity: amount,
    cold: p.cold * amount,
    rain: p.rain * amount,
    growth: 1 - (1 - p.growthFloor) * amount,
  };
}
