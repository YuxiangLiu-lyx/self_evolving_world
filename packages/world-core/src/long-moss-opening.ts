import type { V7Package } from './continuous-types.js';
import { v7Record, v7Signature } from './continuous-data.js';
import { LONG_NUT_OPENING } from './long-nut-opening.js';
import { installNutContact } from './long-nut-contact.js';
import type { NutBinding } from './long-nut-contact.js';
import { nutExecute, nutDeath } from './long-nut-work.js';
const ID = 'moss-source-bound-hazelnut-interior-access-trial';
export const MOSS_NUT_BINDING: NutBinding = {
  id: ID,
  actor: 'moss',
  item: 'item-140-moss-811',
  origin: 'forest-hazelnut-1',
  harvestedAt: 140,
  modelKey: 'long:forest-nut:contact',
  exteriorKey: 'long:forest-nut:exterior',
  groundTool: true,
};
const binding = MOSS_NUT_BINDING;
const original = LONG_NUT_OPENING.abilities[0];
if (!original) throw Error('Missing shared contact interface');
export const LONG_MOSS_OPENING: V7Package = {
  ...LONG_NUT_OPENING,
  id: ID,
  dependencies: [
    'source-bound-hazelnut-opening-trial@1',
    'moss-source-bound-hazelnut-physical-examination@1',
  ],
  description:
    'New forest-source applicability of the shared non-detaching stone-contact method; separate source response and personal study.',
  reuse: {
    experiment: 'ex13',
    source:
      'source-bound-hazelnut-opening-trial@1; moss-source-bound-hazelnut-physical-examination@1; collective-work.ts; forest-references.ts; long-food-evidence.ts',
    description:
      'Parameterizes the existing validated contact/quote/inspection/lock/paid-work mechanics without widening Lin applicability. Independent forest source model and contact ledger, actual source geometry, individual study and tool acquisition. Reuse is recorded; this adapter is not a second physical invention. No Lin fracture outcome, anatomy, material allocation or mastery copied.',
  },
  migrate: (w) => {
    const s = w.stacks.find((s) => s.id === binding.item),
      a = w.actors.find((a) => a.id === 'moss'),
      e = v7Record(w.state[binding.exteriorKey]);
    if (
      !s ||
      s.owner !== 'moss' ||
      s.reservedFor ||
      s.quantity !== 1 ||
      s.origin !== binding.origin ||
      s.harvestedAt !== 140 ||
      s.processing ||
      e.sourceRevision !==
        v7Signature({
          id: s.id,
          origin: s.origin,
          harvestedAt: s.harvestedAt,
          resource: s.resource,
          quantity: s.quantity,
          processing: null,
        }) ||
      !a?.memory.knowledge?.['forest-exterior:forest-examination-159-moss-918']
        ?.verified
    )
      throw Error(
        'The actual personally examined whole forest specimen and unchanged exterior representation are required.',
      );
    return installNutContact(w, binding);
  },
  abilities: [
    {
      ...original,
      id: ID,
      name: 'Forest specimen controlled opening trial',
      function:
        'Assess an actual forest specimen and independently acquired stone/support, perform at most two bounded contacts, then inspect only real exposed surfaces.',
      equivalence: 'specimen:forest-hazelnut:bounded-stone-opening:1',
      parameters: {
        ...original.parameters,
        properties: {
          ...original.parameters.properties,
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
      },
      costs:
        'Study2 active rounds/0.2 energy each. Assess(specimenId=item-140-moss-811,optional toolId/supportId,evidenceRefs=[] up to8 complete personal keys):1 round/0.5 energy, no positioning/reservation/material use. Carried source is local. Executable quote requires actual owned whole stone and reachable free solid rock; no auto acquisition. Begin(assessmentId,specimenId,toolId,supportId) separately selects exact quoted inputs:at most2 lifetime contacts/1 energy each, abstract effort1, wear0.002/contact, no material loss. Resume/cancel(processId) preserve paid work. Inspect(processId):1 round/0.2 energy. Exact live identity/access/energy checked before pay; ordinary ageing within quoted domain is evaluated by the response model, unsupported change requires reassessment.',
      effects:
        'New seed/provenance forest-source response uses existing exterior geometry and actual stone condition; explicit modeling assumptions, not prior measurements or Lin outcome. Contact can produce deformation/discontinuity/exposure; never guaranteed opening or detachable contents. Source quantity1 remains intact as one assembly: no invented shell/kernel fractions, yield, debris loss, ingestion or safety/nutrition fact. Actual source and stone are positioned on support and locked; support cannot be reused concurrently. Lost reach/inputs/energy pauses before payment; exact resume never resets contact allowance. Cancel/death releases once at actual locations, no remote return/repair/refund. Existing ageing continues. Inspection observes only reachable actually exposed regions, reports privately with0.02 geometry resolution/0.01 uncertainty; interior rendering requires performed inspection. Only a new verified relevant physical state may use existing grounded-understanding0.8/cap1/duration8/cooldown12/maintained0.035/decay0.0015; repeat/request/study/quote/missing rule yield0. No passive work, comfort, practice or maintenance benefit.',
      handler: 'long.forest-nut-opening',
      revision: ID + '@1',
    },
  ],
  handlers: { 'long.forest-nut-opening': (c) => nutExecute(c, binding) },
  onDeath: (w, a) => {
    nutDeath(w, a, binding);
  },
};
