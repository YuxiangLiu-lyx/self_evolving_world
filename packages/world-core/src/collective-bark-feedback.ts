import type { V7Package } from './continuous-types.js';
import { v7Clone } from './continuous-data.js';

/** Repair of the existing reviewed contract; installation never backfills experience. */
export const COLLECTIVE_BARK_FEEDBACK: V7Package = {
  id: 'bark-feedback',
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['bark-extraction@1'],
  description:
    'Versioned repair of already reviewed bark feedback and retention of actual personal inspection results.',
  abilities: [],
  handlers: {},
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [],
  migrate(w) {
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing canonical grounded-understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: 'bark-extraction',
    };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
  afterEnvironment(w) {
    for (const event of w.events.filter(
      (e) =>
        e.success &&
        e.type === 'bark-assessed' &&
        e.interface === 'bark-extraction',
    )) {
      const actor = w.actors.find((a) => a.id === event.actor);
      if (!actor || !event.target) continue;
      actor.memory.knowledge ??= {};
      const key = 'bark-inspection:' + event.target;
      actor.memory.knowledge[key] = {
        key,
        subject: event.target,
        property: 'personally observed bark-operation inspection',
        value: v7Clone(
          'layer' in event.data
            ? {
                layer: event.data.layer ?? null,
                contact: event.data.contact ?? null,
                usableEdge: event.data.usableEdge ?? false,
                requiredHardness: event.data.requiredHardness ?? null,
                recoverableMass: event.data.recoverableMass ?? null,
                uncertainty: event.data.uncertainty ?? '',
              }
            : {
                processId: event.target,
                status: event.data.status ?? null,
                completedWork: event.data.completedWork ?? null,
                remainingWork: event.data.remainingWork ?? null,
                paidEnergy: event.data.paidEnergy ?? null,
              },
        ),
        method: 'retained actual personal inspection event',
        condition:
          'Dated inspection only; no paid trial or hardness certificate is inferred.',
        evidence: event.id,
        tick: event.tick,
        verified: false,
      };
    }
  },
};
