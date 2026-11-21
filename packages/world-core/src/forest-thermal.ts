import { v7RoundNumber } from './continuous-data.js';

/** Split only cooling below the existing 16-degree comfort boundary; unsheltered arithmetic stays exact. */
export function shelterTemperature(
  before: number,
  ambient: number,
  insulation: number,
  protectedInside: boolean,
) {
  const unsheltered = before + ((ambient - before) * 0.035) / (1 + insulation);
  const coldLoss = Math.max(0, Math.min(before, 16) - unsheltered);
  const avoided = protectedInside ? coldLoss * 0.5 : 0;
  return {
    temperature: v7RoundNumber(unsheltered + avoided),
    unshelteredTemperature: v7RoundNumber(unsheltered),
    unshelteredColdLoss: v7RoundNumber(coldLoss),
    shelteredColdLoss: v7RoundNumber(coldLoss - avoided),
    avoidedColdLoss: v7RoundNumber(avoided),
  };
}
