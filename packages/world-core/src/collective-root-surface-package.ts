import type { V7Package, V7Schema } from './continuous-types.js';
import { v7Clone } from './continuous-data.js';
import { v7ObjectSchema } from './continuous-base.js';
import { collectiveJobs } from './collective-work.js';
import {
  ROOT_SURFACE,
  surfaceExecute,
  surfaceStop,
} from './collective-root-surface.js';
const parameters: V7Schema = {
  ...v7ObjectSchema({
    operation: {
      type: 'string',
      enum: ['assess-surface', 'prepare-small', 'continue', 'status', 'cancel'],
    },
    barkId: { type: 'string' },
    toolId: { type: 'string' },
    rootId: { type: 'string' },
    quantity: { type: 'number', minimum: 0.1, maximum: 1 },
    site: v7ObjectSchema({ x: { type: 'number' }, y: { type: 'number' } }),
    processId: { type: 'string' },
  }),
  required: ['operation'],
};
export const ROOT_SURFACE_PACKAGE: V7Package = {
  id: 'root-preparation',
  version: 2,
  scope: 'collective-ex12',
  dependencies: ['root-preparation@1'],
  description:
    'Paid assessment and physically sufficient single-sheet fractional preparation; preserves legacy operations and requires separate personal study.',
  reuse: {
    experiment: 'ex12 root-preparation@1 and ex11 escrow',
    source:
      'collective-root-work.ts; collective-root-food.ts; collective-work.ts',
    description:
      'Reuses actual crushing composition, geometry, paid escrow, cancellation and canonical feedback. Surface assessment and fractional setup are newly reviewed; no recipes, materials or mastery are inherited.',
  },
  abilities: [
    {
      id: ROOT_SURFACE,
      name: 'Assess and use a fractional root-preparation surface',
      function:
        'Assess the actual connected bark rectangle and hard tool on firm support, then prepare at most one root using that physically sufficient sheet.',
      equivalence: 'roots:physical-surface-assessment:fractional-setup:1',
      parameters,
      prerequisites: ['root-preparation'],
      learning: 1,
      costs:
        'Separately learn this extension after root-preparation. assess-surface: barkId, toolId and optional site{x,y}, one round and 0.2 energy. prepare-small: assessed barkId, toolId, rootId, quantity in exact tenths from 0.1 to 1, and optional site. Reserve only that root portion, the whole selected sheet and one reusable stone. Two work equivalents and two energy per original root; a fractional final increment costs only remaining work. Continue/status/cancel name processId.',
      effects:
        'One connected rectangle at least 0.16 by 0.16 m contains food on firm support; a single unfragmented extracted bark lot may use explicitly uncertain mass-conserving model geometry at density 500 and thickness 0.003, unless represented geometry exists. Separate combined lots and fines are not joined sheets. Actual stone hardness >=3, flexible intact sheet, clear reachable site and energy are required. Processing conserves nutrition, toxins, mass and age; crushed food ages at 1.25 baseline. Lost access pauses without work while food ages. Cancel/death releases actual partial food and implements once. No nutrition, preservation or safety benefit is inferred.',
      handler: 'collective.root-preparation.v2',
      revision: 'root-preparation@2',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Actual processId, selected root quantity, sheet geometry basis, paid fractional work/energy, remaining work and pause reason. No second reservation while continuing.',
      },
      dependencies: {
        abilities: ['root-preparation'],
        resources: ['root', 'stone', 'bark'],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.root-preparation.v2': surfaceExecute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['root-work-surface'],
  events: [
    'root-surface-assessed',
    'root-preparation-stopped',
    'food-preparation-started',
    'food-preparation-completed',
    'process-progress',
    'process-inspected',
    'information-confirmed',
  ],
  migrate(w) {
    const base = w.abilities.find((a) => a.id === 'root-preparation');
    if (!base)
      throw new Error('Missing current-world original preparation interface.');
    base.handler = 'collective.root-preparation.v2';
    base.parameters.properties = {
      ...base.parameters.properties,
      ...v7Clone(parameters.properties ?? {}),
      operation: {
        type: 'string',
        enum: [
          'prepare',
          'continue',
          'cancel',
          'inspect',
          'assess-surface',
          'prepare-small',
          'status',
        ],
      },
      quantity: { type: 'number', minimum: 0.1, maximum: 4 },
    };
    base.costs +=
      ' New assess-surface/prepare-small operations require separate root-preparation-surface mastery; legacy prepare retains its whole-unit inputs and existing costs.';
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing canonical understanding source.');
    for (const id of ['root-preparation', ROOT_SURFACE]) {
      const trigger = { event: 'information-confirmed', interface: id };
      if (
        !rule.alternativeTriggers?.some(
          (t) => t.event === trigger.event && t.interface === id,
        )
      )
        rule.alternativeTriggers = [
          ...(rule.alternativeTriggers ?? []),
          trigger,
        ];
      if (
        !rule.maintenance.alternativeTriggers?.some(
          (t) => t.event === trigger.event && t.interface === id,
        )
      )
        rule.maintenance.alternativeTriggers = [
          ...(rule.maintenance.alternativeTriggers ?? []),
          trigger,
        ];
    }
    return w;
  },
  beforeAction(w, a, action) {
    if (![ROOT_SURFACE, 'root-preparation'].includes(action.interface))
      for (const j of collectiveJobs(w, ROOT_SURFACE).filter(
        (j) => j.owner === a.id && j.status === 'active',
      ))
        j.status = 'paused';
  },
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, ROOT_SURFACE).filter((j) =>
      ['active', 'paused'].includes(j.status),
    )) {
      const actor = w.actors.find((a) => a.id === j.owner);
      if (
        actor &&
        j.escrow.some(
          (id) => !w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
        )
      )
        surfaceStop(
          w,
          actor,
          j,
          'Perishable input expired; actual surviving food and implements released once.',
        );
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ROOT_SURFACE).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      surfaceStop(
        w,
        a,
        j,
        'Performer died; actual partial roots and implements remain at the worksite.',
      );
  },
};
