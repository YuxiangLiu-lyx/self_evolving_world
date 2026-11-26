import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  FIBER_CORD as F,
  FIBER_CORD_SECTIONING as M,
} from './long-fiber-cord.js';
import { SECTIONED_CORD_WORK as S } from './long-sectioned-fiber-cord.js';
import type { SectionedCordProfile } from './long-sectioned-fiber-cord.js';

const ID = 'hand-twist-long-sectioned-cord';
const REVISION = `${ID}@1`;
const SECTIONAL = 'hand-twist-sectioned-cord';
/** Event names of this operation; the reused sample and trial modes are announced under them too. */
const PREFIX = 'long-sectioned-cord-';
/** hand-twist-sectioned-cord@1 under this operation's identity, without its 0.60 m requested-length
 * ceiling. Only the existing physical rules bound the length: the unspliced strand length, conserved
 * volume and 1-12 mm plies, condition, dry footing and the work circle. */
const LONG: SectionedCordProfile = {
  id: ID,
  revision: REVISION,
  state: `long:work:${ID}`,
  prefix: PREFIX,
  length: { min: M.LENGTH.min, max: Infinity },
};
/** Derived upper limit, not a chosen range: no strand is spliced, so each ply is at most one stem,
 * and length x take-up + both loose ends must fit in it. Reed (1.8 m stems): (1.8 - 0.04) / 1.1547
 * = 1.5242 m. */
const STEM = Math.max(
  0,
  ...Object.values(F.STRANDS).map((law) => law?.length ?? 0),
);
const REACH = (STEM - 2 * F.END) / M.TAKEUP;
/** Consequences of that limit: sections of at most 0.30 m, 3 rounds each plus the release check, and
 * the work circle of radius plus half the aligned ply. */
const SECTIONS = S.sectionCount(REACH);
const metres = (x: number) => String(Math.floor(x * 1000) / 1000);
const rounds = (length: number) => String(S.roundsOf(S.sectionCount(length)));

export const LONG_EXTENDED_SECTIONED_CORD: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: [
    'foundation-open@1',
    'hand-twist-fiber-cord@1',
    `${SECTIONAL}@1`,
  ],
  description: `hand-twist-sectioned-cord@1 without its 0.60 m requested-length ceiling: one continuous two-ply cord in successive sections of at most 0.30 m, bounded only by the unchanged fiber-cord@1 strand, volume, ply, condition, footing and room rules (reed: at most ${metres(REACH)} m). Its cords are ordinary fiber-cord@1 cords. No splice, strength rating, reward or shelter effect.`,
  reuse: {
    experiment:
      'ex16 hand-twist-sectioned-cord@1 (revision hand-twist-sectioned-cord@1: section plan, round-1 measurement, shortfall, regrip, twist, counter-ply, release check, inspection, pause, resume by workId, cancel and death, run unchanged under this identity through a new SECTIONED_CORD_WORK export); ex16 hand-twist-fiber-cord@1 (law fiber-cord@1: strand law, conserved-volume geometry, sample records and coverage, exact allocations, sample and trial modes, wear and visual metadata, through FIBER_CORD and FIBER_CORD_SECTIONING)',
    source:
      'long-sectioned-fiber-cord.ts SECTIONED_CORD_WORK (appended; that module now takes the operation identity and requested-length range as a parameter, hand-twist-sectioned-cord@1 passing its own, so its behavior is unchanged); long-fiber-cord.ts FIBER_CORD and FIBER_CORD_SECTIONING',
    description:
      'Code reuse, not reinvention: the same functions run both operations. Only the identity (ability, work records, events, personal record keys) and the requested-length range differ; the 0.60 m ceiling is replaced by no ceiling, so the existing strand-length, volume and ply checks decide. hand-twist-sectioned-cord@1 behavior, ability text and saved work are unchanged and its mastery is a prerequisite. No ability, item or reward is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-twist long sectioned cord',
      function:
        'Sample owned fiber, hand-twist one continuous two-ply cord as long as its strands and fiber allow, section by section; inspect, hand-trial or cancel; actual material and geometry decide results.',
      equivalence: 'cordage:hand-twisted-two-ply-fiber-cord:sectioned-long:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['sample', 'make', 'inspect', 'trial', 'cancel'],
          },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              stackId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          targetId: { type: 'string' },
          workId: { type: 'string' },
          requestedLength: { type: 'number', minimum: M.LENGTH.min },
          trialForce: { type: 'number', minimum: 1 },
          trialDuration: {
            type: 'number',
            minimum: 1,
            maximum: F.ROUND_SECONDS,
          },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [SECTIONAL],
      learning: 1,
      learningEnergy: 0.2,
      costs: `Study: 1 round, 0.2 energy, after mastering ${SECTIONAL}. materials: [{stackId: exact owned unreserved item id, quantity in 0.1 steps}]. sample: one non-food item, 0.1; 1 round, 0.5. make (materials: 0.2-1 unit of one fiber and source, each covered by your passing cord sample of its source and processing at most 0.05 above its condition; requestedLength m >= ${String(M.LENGTH.min)}): reserves it, then 3 paid rounds of 1 energy (separate-align, twist, counter-ply) per 0.30 m section and a release-check: ${rounds(0.6)} rounds to 0.60 m, ${rounds(1)} to 1.0 m; continues each round; resume: make + workId only. inspect (targetId: your cord-work item, or workId): 1 round, 0.2. trial (targetId: your cord or fragment, 0.2+ unit, 0.12+ m; trialForce N; trialDuration s): 1 round, 0.5. cancel: none. Needs dry footing and nobody within your radius plus half the aligned ply (up to ${String(STEM / 2)} m). Unworked rounds or low energy pause uncharged; refusals spend nothing; no refunds.`,
      effects: `${SECTIONAL} with no 0.60 m ceiling; fiber-cord@1 law unchanged: only reed has a strand law (1.8 m stems, 500 kg/m3, water share 0.9); two plies share the conserved solid volume over length x 1.155 + 0.02 m loose ends, so longer cord of the same fiber has thinner plies. Unspliced, each ply fits in one stem: reed length at most (1.8 - 0.04) / 1.155 = ${metres(REACH)} m (${String(SECTIONS)} sections, ${String(S.roundsOf(SECTIONS))} rounds). Too-short strands, or plies under 1 mm with every strand intact, are refused before any cost. Round 1 sets broken strands aside as scrap and measures; plies outside 1-12 mm or too little intact fiber: a measured shortfall returning all fiber. A counter-plied section of at most 0.30 m holds its form while the hands regrip onto the next; regrip, twist and release need condition 0.5. Result: an ordinary owned untested fiber-cord@1 cord; knot, join, binding, lashing and frapping measure their own need. Sample and trial: hand-twist-fiber-cord's; a break leaves two fragments. Worked fiber loses 0.0005 condition per round. Cancel or death releases unworked fiber once and leaves the workpiece. No reward or strength rating.`,
      handler: 'long.hand-twist-long-sectioned-cord',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: a finished cord earns no milestone.
      practiceEvidence: `${PREFIX}completed`,
      dependencies: { abilities: [], resources: ['reed'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid rounds persist; resuming by workId pays only the next round.',
      },
    },
  ],
  handlers: {
    'long.hand-twist-long-sectioned-cord': (c) => S.execute(LONG, c),
  },
  processes: {},
  visualComponents: [],
  events: [
    'sampled',
    'started',
    'progress',
    'shortfall',
    'paused',
    'resumed',
    'failed',
    'completed',
    'check-failed',
    'cancelled',
    'inspected',
    'trial',
    'broken',
  ].map((e) => `${PREFIX}${e}`),
  resources: [],
  satisfaction: [],
  afterEnvironment: (w) => {
    S.environment(LONG, w);
  },
  onDeath(w, a) {
    S.death(LONG, w, a);
  },
};
