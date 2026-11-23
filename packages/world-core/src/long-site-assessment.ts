import type {
  V7ActionContext,
  V7Package,
  V7Spatial,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Number, v7Json, v7Id } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Visible,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { longPlantingSite } from './long-planting-site.js';
const ID = 'soil-worksite-assessment';
function execute(c: V7ActionContext) {
  const p: V7Spatial = {
    x: v7Number(c.action.args.x, 'x'),
    y: v7Number(c.action.args.y, 'y'),
    angle: 0,
    shape: { kind: 'circle', radius: 0.2 },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  if (
    !v7Inside(c.world, p, 0.2) ||
    v7Distance(c.actor.position, p) > c.actor.radius + 0.65 ||
    !v7Visible(c.world, c.actor.position, p)
  )
    throw new Error(
      'Reach a visible in-bounds patch before starting its local examination.',
    );
  v7Spend(c.actor, 0.5);
  const attempt = v7Id(c.world, 'site-examination');
  c.emit(
    'site-examination-started',
    'Started a paid non-destructive examination of the nominated footprint.',
    { attempt, x: p.x, y: p.y, radius: 0.2, paidEnergy: 0.5 },
    null,
  );
  const site = longPlantingSite(c.world, c.actor, p),
    seen = v7Observe(c.world, c.actor.id);
  const visibleObjects = seen.objects
    .filter(
      (o) => v7ShapesOverlap(p, o.spatial) || v7Distance(o.spatial, p) < 0.5,
    )
    .map((o) => o.id);
  const visiblePeople = [c.actor, ...seen.actors]
    .filter((a) => v7Distance(a.position, p) < c.actor.radius + 0.2)
    .map((a) => a.id);
  const obscured =
    (!site.placement.clearance || !site.empty) &&
    visibleObjects.length === 0 &&
    visiblePeople.length === 0;
  const report = {
    attempt,
    actor: c.actor.id,
    tick: c.world.tick,
    x: p.x,
    y: p.y,
    radius: 0.2,
    paidEnergy: 0.5,
    rounds: 1,
    reference: 'root-planting-trial@1',
    surface: site.cover
      ? 'represented partial surface and conserved residue'
      : site.surface.ground === '.'
        ? 'exposed ordinary soil'
        : site.surface.ground === 'f'
          ? 'vegetated forest floor'
          : 'other modeled surface',
    method:
      'local non-destructive surface contact and visible clearance examination',
    ...(site.cover
      ? {
          surfaceState: {
            coverMass: site.cover.data.coverMass ?? null,
            residueMass: site.cover.data.residueMass ?? null,
            outcome: site.cover.data.outcome ?? null,
          },
        }
      : {}),
    observedObjects: visibleObjects,
    observedPeople: visiblePeople,
    compatibility: obscured
      ? 'unknown'
      : site.error
        ? 'not currently eligible'
        : 'surface and geometry currently eligible',
    ruleInterpretation: obscured
      ? 'Complete clearance could not be established without inaccessible evidence.'
      : site.error === 'Hand preparation currently requires ordinary soil.'
        ? 'This first planting implementation accepts exposed bare soil only. The local ordinary-soil regime is a moisture/hazard label and does not establish bare ground at the nominated patch. Vegetated ground is not claimed universally infertile.'
        : (site.error ??
          'Current surface and geometry pass; root availability, freshness and future occupancy remain separate.'),
    unknowns: [
      'deeper substrate composition',
      'propagation viability',
      'future occupancy and conditions',
      'actual available unspoiled planting material',
    ],
    complete: true,
    qualified: false,
  };
  c.emit(
    'site-examination-completed',
    'Recorded dated surface findings and limited operation compatibility; no planting, clearing, sampling or suitability guarantee.',
    report,
    null,
  );
  const event = c.world.events.at(-1);
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[`planting-site:${String(p.x)}:${String(p.y)}`] = {
    key: `planting-site:${String(p.x)}:${String(p.y)}`,
    subject: 'proposed planting footprint',
    property: 'dated surface and implementation compatibility',
    value: v7Json({ ...report, evidence: event?.id ?? '' }),
    method: report.method,
    condition: 'current visible local state; no guarantee',
    verified: false,
    tick: c.world.tick,
    evidence: event?.id ?? '',
  };
  return { complete: true, writes: [] };
}
export const LONG_SITE_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['root-planting-trial@1'],
  description:
    'One paid non-destructive coordinate-specific surface and worksite examination; exact shared planting predicates, private dated findings and explicit uncertainty.',
  reuse: {
    experiment: 'ex13 planting; ex12 placement infrastructure',
    source:
      'long-planting-site.ts; collective-tray-placement.ts; continuous-observation.ts',
    description:
      'Shares the exact existing placement predicate without changing its order, result or prior failed attempts. Reuses geometry and personally visible facts; no historical capability or knowledge is activated.',
  },
  abilities: [
    {
      id: ID,
      name: 'Examine a proposed soil worksite',
      function:
        'Physically examine one reachable x/y footprint and report visible surface evidence plus provisional compatibility with the existing root-placement operation.',
      equivalence: 'root-site:local-nondestructive-assessment:1',
      parameters: v7ObjectSchema({
        mode: { type: 'string', enum: ['examine'] },
        x: { type: 'number' },
        y: { type: 'number' },
      }),
      references: {},
      prerequisites: [],
      learning: 1,
      costs:
        'One completed round and 0.5 energy after valid visible reach and bounds checks. No material, tools, plot or reservation. Invalid invocations do not begin or charge. A later new examination pays again.',
      effects:
        'Private dated surface/clearance findings identify operation limitations separately from unknown physical properties. Bare ground is distinct from the general ordinary-soil moisture regime. No deeper substrate, concealed occupant or hidden resource information. No clearing, excavation, sampling, planting, material change, skill grant, food or reward. The atomic attempt has no resumable work or maintenance; no unperformed completion is recorded. Results are not silently refreshed and sharing requires real communication.',
      handler: 'long.soil-worksite-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'site-assessment-qualified-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic paid examination; no escrow, ongoing labor or automatic retry. A cancelled pre-execution intention does not become a completed observation.',
      },
    },
  ],
  handlers: { 'long.soil-worksite-assessment': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'site-examination-started',
    'site-examination-completed',
    'site-assessment-qualified-practice',
  ],
};
