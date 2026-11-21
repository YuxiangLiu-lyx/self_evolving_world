import type { V7Actor, V7Data } from '@self-evolving-world/world-core';

/** Decision projection only: the complete dated records remain unchanged in world/replay state. */
export function forestDecisionEvidence(
  actor: V7Actor,
  original: Record<string, V7Data>,
) {
  const harness: Record<string, V7Data> = { ...original };
  const food = harness['assess-food'];
  if (food && Array.isArray(food.records)) {
    const records = food.records.filter(
      (r): r is V7Data => !!r && typeof r === 'object' && !Array.isArray(r),
    );
    harness['assess-food'] = {
      ...food,
      records: records.map((r) =>
        Object.fromEntries(
          [
            'id',
            'target',
            'resource',
            'origin',
            'mode',
            'fraction',
            'startTick',
            'endTick',
            'status',
            'ingested',
            'nourishment',
            'adverse',
            'confounding',
            'reason',
          ].map((k) => [k, r[k] ?? null]),
        ),
      ),
      latestDetailedEvidence: records.at(-1) ?? null,
      projection:
        'All retained operation summaries and the latest detailed evidence are shown. Full sensory, baseline/follow-up and concurrent-event records remain in personal replay state. No uneventful sample establishes safety.',
    };
  }
  const duplicate = new Set([
    'food-assessment:records',
    'food-assessment:pending',
    'wildlife:sightings',
    'wildlife:pending',
    'shelter:pending',
    'shelter:lastWork',
    'shelter:exposure',
    'warming:pending',
    'warming:lastRound',
    'warming:lastStatus',
    'route:pending',
    'route:lastInspection',
  ]);
  const available = (key: string) =>
    key.startsWith('food-assessment:')
      ? !!harness['assess-food']
      : key.startsWith('wildlife:')
        ? !!harness['observe-wildlife']
        : key.startsWith('warming:')
          ? !!harness['active-warming']
          : key.startsWith('route:')
            ? !!harness['inspect-route']
            : !!harness['build-shelter'];
  const extensionState: V7Data = Object.fromEntries(
    Object.entries(actor.extensionState).filter(
      ([k]) => !duplicate.has(k) || !available(k),
    ),
  );
  return { harness, extensionState };
}
