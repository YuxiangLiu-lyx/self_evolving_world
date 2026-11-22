import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  contactInspect,
  contactSweep,
  contactAssess,
  contactContinue,
  contactSurfaces,
} from './open-contact-execution.js';
import {
  CONTACT_MODEL,
  contactActive,
  contactProject,
  contactRecord,
  contactRelease,
} from './open-contact-work.js';
import { forestEvent } from './forest-climate.js';
export const OPEN_CONTACT: V7Package = {
  id: 'contact-resistance-calibration',
  version: 1,
  scope: 'open-ex10',
  description:
    'Actual contact-response sweep with audited unanchored absolute-scale limitation; no reference stock or certified tool grant.',
  dependencies: ['foundation-open@1', 'hardness-assessment@1'],
  reuse: {
    experiment: 'ex10 development 5',
    source: 'packages/world-core/src/open-hardness-physics.ts',
    description:
      'Reuses the current-run resolver, actual scratch mechanics, specimen reservation, wear/debris conservation and inspection; the contact-response/identifiability function is distinct from relative comparison. Historical generated skills are not inherited.',
  },
  abilities: [
    {
      id: 'contact-resistance-calibration',
      name: 'Contact response and calibration limits',
      function:
        'Execute a four-contact, two-force-level response sweep using two existing inspected tips, retain actual alterations, and assess what absolute bounds the physically anchored evidence can support.',
      equivalence: 'open:contact-response-absolute-identifiability:1',
      parameters: v7ObjectSchema({
        mode: {
          type: 'string',
          enum: ['inspect', 'sweep', 'assess', 'resume', 'cancel'],
        },
        target: { type: 'string' },
        counterface: { type: 'string' },
        project: { type: 'string' },
      }),
      prerequisites: ['hardness-assessment'],
      dependencies: {
        abilities: ['hardness-assessment'],
        resources: [],
        knowledge: [],
      },
      learning: 5,
      costs:
        'Personal hardness-assessment mastery required. Inspect one or two explicit owned specimens (counterface may be empty), one round/0.2 energy; same personal project records current surfaces. Sweep requires two distinct actually inspected usable surfaces and distinct existing tip radii, 0.1 actual unit each; four performed directional contacts at 0.5 energy, then one surface-inspection round at 0.2. No prepared edge is supplied. Assess costs one additional round/0.2 energy. Target/counterface empty when unused; project is exact own persistent ID. Resume reacquires same surviving owned or within-0.65 ground portions and executes only remaining stages. Cancel releases surviving escrow once with no effort refund.',
      effects: `Observable model audit: ${JSON.stringify(CONTACT_MODEL)} Actual contact response uses two existing geometries and two bounded actuator levels, with achieved model quantities, surface marks and conserved dust. No independent dimensional standard or instrument exists, and inversion of index-dependent initial radius would be circular. Therefore this version returns null absolute bounds, never >=8 certification, and preserves intrinsic tool predicates. Results apply only to tested portions. Actual new interpretable response/limit evidence can use shared understanding; known or unsupported results and mastery cannot. Surface damage, contamination or unsupported transfer invalidates applicability.`,
      handler: 'open.contact',
      revision: 'contact-resistance-calibration@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: { target: 'optional-owned', counterface: 'optional-owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Four contact stages, one inspection and explicit assessment; exact effort retained. Missing energy/contact access pauses free. Action/position change or death cancels active work; explicit resume names original materials and remaining work.',
      },
    },
  ],
  handlers: {
    'open.contact': (c) => {
      if (
        ['assess', 'resume', 'cancel'].includes(
          typeof c.action.args.mode === 'string' ? c.action.args.mode : '',
        ) &&
        (c.action.args.target !== '' || c.action.args.counterface !== '')
      )
        throw new Error(
          'Unused specimen references must be empty; the exact personal project retains its own identities.',
        );
      switch (c.action.args.mode) {
        case 'inspect':
          return contactInspect(c);
        case 'sweep':
          return contactSweep(c);
        case 'assess':
          return contactAssess(c);
        case 'resume':
          return contactContinue(c);
        case 'cancel': {
          const j = contactProject(c);
          if (j.status === 'completed')
            throw new Error(
              'A completed observation cannot be cancelled into a new incomplete work record.',
            );
          contactRelease(c.world, c.actor, j, 'Explicit cancellation.');
          return { complete: true, remaining: 0, writes: [] };
        }
        default:
          throw new Error('Unknown contact mode.');
      }
    },
  },
  processes: {
    'open.contact-cleanup': (w, p) => {
      const a = w.actors.find((a) => a.id === p.owner),
        j = a
          ? contactRecord(
              w,
              a,
              typeof p.data.project === 'string' ? p.data.project : '',
            )
          : null;
      if (!a || !j) {
        w.processes = w.processes.filter((x) => x.id !== p.id);
        return;
      }
      if (
        j.status === 'active' &&
        j.specimens.some(
          (id) => !w.stacks.some((s) => s.id === id && s.owner === a.id),
        )
      )
        contactRelease(w, a, j, 'Actual held contact material was lost.');
      if (
        j.status === 'completed' &&
        j.applicable === true &&
        j.surfaceSignature !== contactSurfaces(w, j)
      ) {
        j.applicable = false;
        forestEvent(
          w,
          'contact-calibration-invalidated',
          'Later damage, contamination or unsupported transfer invalidated this surface-bound observation; absolute bounds remain unresolved.',
          a.position,
          a.id,
          { project: j.id, absoluteBounds: null, certificateValid: false },
          j.specimens[0] ?? null,
        );
      }
      if (j.status === 'cancelled' || j.applicable === false)
        w.processes = w.processes.filter((x) => x.id !== p.id);
      else p.next = w.tick + 1;
    },
  },
  resources: [],
  satisfaction: [],
  visualComponents: ['rock'],
  events: [
    'contact-calibration-progress',
    'contact-calibration-completed',
    'contact-calibration-stopped',
    'contact-calibration-invalidated',
    'information-confirmed',
  ],
  beforeAction(w, a, action, continuing) {
    const j = contactActive(w, a);
    if (
      j &&
      (action.interface !== 'contact-resistance-calibration' ||
        !continuing ||
        a.position.x !== j.x ||
        a.position.y !== j.y)
    )
      contactRelease(w, a, j, 'Action or physical contact position changed.');
  },
  onDeath(w, a) {
    const j = contactActive(w, a);
    if (j) contactRelease(w, a, j, 'Performer died.', true);
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing grounded-understanding source.');
    const t = {
      event: 'information-confirmed',
      interface: 'contact-resistance-calibration',
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), t];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      t,
    ];
    return w;
  },
};
