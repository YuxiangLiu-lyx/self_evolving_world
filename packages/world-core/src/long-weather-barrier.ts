import type {
  V7ActionContext,
  V7HandlerResult,
  V7Package,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Number } from './continuous-data.js';
import { v7Distance, v7Inside, v7Interior } from './continuous-geometry.js';
import { openConditions } from './open-physical.js';

const ID = 'weather-barrier';
const REVISION = `${ID}@1`;
/** Recipe from the reviewed design: four stakes and eight interwoven members. */
const BRANCH_UNITS = 12;
export const WEATHER_BARRIER_UNSUPPORTED =
  'Unsupported in this world: branch records carry no length or diameter, so the 12-unit stake-and-weave recipe (length at least 1.2 m, diameter 1-3 cm) cannot be qualified; and wind has strength but no direction, so lee-side protection cannot be computed. No structure was built, nothing was reserved and nothing was spent.';

/** Real checks of the reviewed 2 m x 1 m footprint and its 1 m x 1 m lee-side space. */
function siteReport(c: V7ActionContext): string {
  const x = v7Number(c.action.args.x, 'site x'),
    y = v7Number(c.action.args.y, 'site y'),
    angle =
      (v7Number(c.action.args.orientation, 'orientation', 0, 360) * Math.PI) /
      180;
  const along = { x: Math.cos(angle), y: Math.sin(angle) },
    across = { x: -Math.sin(angle), y: Math.cos(angle) };
  const points: { x: number; y: number }[] = [];
  // Screen footprint: 2 m along the screen, 1 m across; lee space: the next 1 m x 1 m behind its middle.
  for (let u = -1; u <= 1; u += 0.5)
    for (let v = -0.5; v <= 0.5; v += 0.5)
      points.push({
        x: x + along.x * u + across.x * v,
        y: y + along.y * u + across.y * v,
      });
  for (let u = -0.5; u <= 0.5; u += 0.5)
    for (let v = 0.5; v <= 1.5; v += 0.5)
      points.push({
        x: x + along.x * u + across.x * v,
        y: y + along.y * u + across.y * v,
      });
  const reach =
    v7Distance(c.actor.position, { x, y }) <= c.actor.radius + 0.65 + 1;
  const outside = points.some((p) => !v7Inside(c.world, p, 0.05));
  const ground = points.some(
    (p) =>
      v7Inside(c.world, p, 0.05) && openConditions(c.world, p).ground !== '.',
  );
  const blocked = points.some(
    (p) =>
      c.world.objects.some(
        (o) => o.spatial.solid && v7Interior(p, o.spatial),
      ) ||
      c.world.actors.some(
        (a) => a.id !== c.actor.id && v7Distance(a.position, p) < a.radius,
      ),
  );
  const problems = [
    ...(reach ? [] : ['the site is out of reach']),
    ...(outside ? ['part of the footprint is outside the world'] : []),
    ...(ground ? ['part of the footprint is not ordinary soil'] : []),
    ...(blocked ? ['the footprint or lee space is occupied'] : []),
  ];
  const owned = c.world.stacks
    .filter(
      (s) =>
        s.owner === c.actor.id && s.resource === 'branch' && !s.reservedFor,
    )
    .reduce((n, s) => n + s.quantity, 0);
  return `Site check: ${problems.length ? problems.join('; ') : 'reachable, inside the world, ordinary soil and clear'}. Owned unreserved branch units: ${String(owned)} of ${String(BRANCH_UNITS)} required.`;
}

function execute(c: V7ActionContext): V7HandlerResult {
  if (c.action.args.mode === 'build')
    throw new Error(`${siteReport(c)} ${WEATHER_BARRIER_UNSUPPORTED}`);
  throw new Error(
    `No weather barrier exists to resume, inspect, repair, cancel or dismantle. ${WEATHER_BARRIER_UNSUPPORTED}`,
  );
}

export const LONG_WEATHER_BARRIER: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'First release of a general weather barrier: real site and material checks that report the two unsupported physical conditions; no construction or protection exists yet.',
  reuse: {
    experiment: 'ex13 first-release precedent (recorded unresolved geometry)',
    source:
      'continuous-geometry.ts (bounds and interiors); open-physical.ts (ground conditions)',
    description:
      'Reuses existing bounds, collision and ground checks only. No shelter, exposure or material model is added or inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Construct and maintain a weather barrier',
      function:
        'Check a site and owned branches for a freestanding branch wind screen and report what the world cannot yet support; no screen can currently be built.',
      equivalence: 'shelter:branch-wind-screen:first-release:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'build',
              'resume',
              'inspect',
              'repair',
              'cancel',
              'dismantle',
            ],
          },
          x: { type: 'number' },
          y: { type: 'number' },
          orientation: { type: 'number', minimum: 0, maximum: 360 },
          target: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 4,
      costs:
        'Build with x/y and orientation (degrees) checks the 2 m x 1 m footprint and 1 m x 1 m lee space for reach, bounds, ordinary soil and occupancy, and counts owned branch units against the 12 required, then fails without spending anything. Other modes fail at no cost because no barrier can exist.',
      effects:
        'Currently unsupported: branch records carry no length or diameter, so stakes and woven members cannot be qualified, and world wind has strength but no direction, so lee-side protection cannot be computed. No structure, reservation, protection, comfort or reward is produced. A working screen needs a separately decided branch geometry and wind direction model; none is invented here.',
      handler: 'long.weather-barrier',
      revision: REVISION,
      authored: false,
      dependencies: { abilities: [], resources: ['branch'], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'Atomic check; no work, escrow or structure persists.',
      },
    },
  ],
  handlers: { 'long.weather-barrier': execute },
  processes: {},
  visualComponents: [],
  events: [],
  resources: [],
  satisfaction: [],
};
