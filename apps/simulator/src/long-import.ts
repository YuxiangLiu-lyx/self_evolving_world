import {
  continuousRegistry,
  expressionSign,
  forestInitialExperience,
  openConditions,
  v7AssertWorld,
  v7Clone,
  v7Distance,
  v7Freeze,
  v7Inside,
  v7Obstacles,
  v7Observe,
  v7SegmentClear,
  v7ShapeDistance,
  v7Signature,
} from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Configuration,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { CULTURE_CENTER } from './long-culture.js';
import { initialLongWorld, LONG_IMPORT_SCENARIO } from './long-scenario.js';

/** Frozen limits of an imported culture v2 run (experiment C): 100 more rounds, 12
 * development handoffs and a 2,500,000-token ledger, counted from the import. */
export const LONG_IMPORT = {
  developments: 12,
  tokens: 2_500_000,
  rounds: 100,
};
/** Words that no new agent-visible text of an import may contain, in any case: the culture
 * scope's excluded vocabulary plus words that would frame what newcomers find. */
export const IMPORT_EXCLUDED_WORDS =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition/i;
/** Temperament dimensions of `long:tendencies`; newcomers take the residents' medians. */
export const TEMPERAMENT_KEYS = [
  'curiosity',
  'riskTolerance',
  'closeness',
  'comfortPreference',
] as const;
/** Newcomer starts at the edge of the shared clearing: distances from CULTURE_CENTER tried
 * in order, the number of evenly spaced directions searched from east, the clearance from
 * every object and ground item, and the dry ordinary ground kinds. */
export const NEWCOMER_PLACEMENT = {
  radii: [6.5, 6.25, 6.75, 6, 7],
  directions: 24,
  clearance: 0.5,
  ground: ['.', 'f'],
};

export interface LongNewcomer {
  id: string;
  name: string;
  leaning: string;
}
/** The retained world an import starts from. */
export interface LongImportSource {
  experiment: string;
  scope: string;
  round: number;
}
/** One machine-readable genesis change of an import. `from` is absent for an added path. */
export interface LongImportChange {
  path: string;
  from?: unknown;
  to: unknown;
  reason: string;
}
export interface LongNewcomerPlacement {
  id: string;
  position: V7Point;
  distanceFromCenter: number;
  /** Residents and signs that the newcomer's own observation shows at the import round. */
  residentsInSight: { id: string; distance: number }[];
  signsInSight: { id: string; distance: number; text: unknown }[];
  /** Residents and signs within the vision radius regardless of line of sight. */
  residentsWithinVision: string[];
  signsWithinVision: string[];
}
export interface LongImport {
  world: V7World;
  changes: LongImportChange[];
  temperament: Record<(typeof TEMPERAMENT_KEYS)[number], number>;
  newcomers: LongNewcomerPlacement[];
}

/** Configuration changes an import may make, with their reasons; anything else is refused. */
const CHANGE_REASONS: [RegExp, string][] = [
  [/^longDevelopment\.scenario$/, 'Scenario label of an imported world.'],
  [/^longDevelopment\.tokens$/, 'Token budget of the import.'],
  [
    /^longDevelopment\./,
    'longDevelopment and culture take the long-culture-v2 values: incentives off, goal open.',
  ],
  [/^budgets\.development$/, 'Development handoff budget of the import.'],
  [/^experience\.targetRounds$/, 'Window target of the import.'],
  [/^development\.scope$/, 'Development scope of the new experiment.'],
  [
    /^development\.inherited$/,
    'Installed packages of the source scope stay in the registry.',
  ],
];

/** The frozen configuration of an import, derived from code alone: the long-culture-v2
 * genesis configuration under the new scope with the import's limits and inherited scope. */
export function longImportConfig(
  scope: string,
  source: LongImportSource,
): V7Configuration {
  const config = v7Clone(initialLongWorld(scope, 'long-culture-v2').config);
  const policy = config.longDevelopment,
    development = config.development,
    experience = config.experience;
  if (!policy || !development || !experience)
    throw new Error('Missing culture v2 policy.');
  if (source.scope === scope)
    throw new Error('An import needs its own development scope.');
  policy.scenario = LONG_IMPORT_SCENARIO;
  policy.tokens = LONG_IMPORT.tokens;
  config.budgets.development = LONG_IMPORT.developments;
  experience.targetRounds = source.round + LONG_IMPORT.rounds;
  development.inherited = [source.scope];
  return config;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const primitiveArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.every((v) => !v || typeof v !== 'object');
/** Leaf differences between two JSON values. Objects and arrays of objects are compared by
 * key and index; arrays of primitives are one value. Key order is ignored. */
export function longWorldDiff(
  before: unknown,
  after: unknown,
  path = '',
): { path: string; from?: unknown; to?: unknown }[] {
  const at = (key: string) => (path ? `${path}.${key}` : key);
  if (isRecord(before) && isRecord(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        !(key in after)
          ? [{ path: at(key), from: before[key] }]
          : !(key in before)
            ? [{ path: at(key), to: after[key] }]
            : longWorldDiff(before[key], after[key], at(key)),
      );
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    !(primitiveArray(before) && primitiveArray(after))
  )
    return Array.from(
      { length: Math.max(before.length, after.length) },
      (_, i) => i,
    ).flatMap((i) =>
      i >= after.length
        ? [{ path: at(String(i)), from: before[i] as unknown }]
        : i >= before.length
          ? [{ path: at(String(i)), to: after[i] as unknown }]
          : longWorldDiff(before[i], after[i], at(String(i))),
    );
  return v7Signature(before) === v7Signature(after)
    ? []
    : [{ path, from: before, to: after }];
}
function assign(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.'),
    last = keys.pop();
  let node: unknown = target;
  for (const key of keys) {
    if (!isRecord(node)) throw new Error(`Cannot set ${path}.`);
    node = node[key];
  }
  if (!isRecord(node) || last === undefined)
    throw new Error(`Cannot set ${path}.`);
  node[last] = v7Clone(value);
}

/** Strict newcomer list: `{ "newcomers": [{ "id", "name", "leaning" }] }`. */
export function parseLongNewcomers(
  input: unknown,
  world: V7World,
): LongNewcomer[] {
  if (
    !isRecord(input) ||
    Object.keys(input).join() !== 'newcomers' ||
    !Array.isArray(input.newcomers) ||
    !input.newcomers.length ||
    input.newcomers.length > 6
  )
    throw new Error(
      'Expected { "newcomers": [{ "id", "name", "leaning" }] } with one to six people.',
    );
  const taken = new Set(
    world.actors.flatMap((a) => [a.id.toLowerCase(), a.name.toLowerCase()]),
  );
  return input.newcomers.map((raw: unknown) => {
    if (
      !isRecord(raw) ||
      Object.keys(raw).sort().join() !== 'id,leaning,name' ||
      typeof raw.id !== 'string' ||
      typeof raw.name !== 'string' ||
      typeof raw.leaning !== 'string' ||
      !/^[a-z]{2,16}$/.test(raw.id) ||
      !/^[A-Z][a-z]{1,15}$/.test(raw.name) ||
      raw.name.toLowerCase() !== raw.id ||
      !/^[a-z]{2,24}$/.test(raw.leaning) ||
      IMPORT_EXCLUDED_WORDS.test(`${raw.name} ${raw.leaning}`)
    )
      throw new Error(
        'Each newcomer needs a lowercase id, the same name capitalized and a one-word leaning outside the excluded vocabulary.',
      );
    if (taken.has(raw.id))
      throw new Error(`The newcomer ${raw.name} is already taken.`);
    taken.add(raw.id);
    return { id: raw.id, name: raw.name, leaning: raw.leaning };
  });
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2
      ? sorted[middle]
      : ((sorted[middle - 1] ?? NaN) + (sorted[middle] ?? NaN)) / 2;
  if (value === undefined || !Number.isFinite(value))
    throw new Error('Missing resident temperament.');
  return round3(value);
}
/** The median of the residents' values for each temperament dimension. */
export function residentTemperament(
  world: V7World,
): Record<(typeof TEMPERAMENT_KEYS)[number], number> {
  const values = world.actors.map((a) => {
    const t = a.extensionState['long:tendencies'];
    if (!isRecord(t)) throw new Error(`${a.id} has no temperament.`);
    return t;
  });
  return Object.fromEntries(
    TEMPERAMENT_KEYS.map((key) => [
      key,
      median(
        values.map((t) => {
          const value = t[key];
          if (typeof value !== 'number')
            throw new Error(`Missing temperament ${key}.`);
          return value;
        }),
      ),
    ]),
  ) as Record<(typeof TEMPERAMENT_KEYS)[number], number>;
}
/** Dry, walkable, unoccupied ordinary ground clear of every body, object and ground item. */
export function newcomerGround(
  world: V7World,
  point: V7Point,
  radius: number,
): boolean {
  const ground = world.terrain[Math.floor(point.y)]?.[Math.floor(point.x)];
  return (
    v7Inside(world, point, radius) &&
    ground !== undefined &&
    NEWCOMER_PLACEMENT.ground.includes(ground) &&
    openConditions(world, point).regime === 'ordinary soil' &&
    v7SegmentClear(point, point, radius, v7Obstacles(world)) &&
    world.actors.every(
      (a) => v7Distance(a.position, point) > a.radius + radius + 0.2,
    ) &&
    world.objects.every(
      (o) =>
        v7ShapeDistance(point, o.spatial) >
        radius + NEWCOMER_PLACEMENT.clearance,
    ) &&
    world.stacks.every(
      (s) =>
        s.owner !== null ||
        v7Distance(s.position, point) > radius + NEWCOMER_PLACEMENT.clearance,
    )
  );
}
/** Evenly spaced starts around the clearing (opposite sides for two people). Each person
 * takes the first radius whose ground qualifies; of the directions where everyone has a
 * start, the one farthest from the nearest resident wins (ties: the first from east). */
function placeNewcomers(world: V7World, people: V7Actor[]): V7Point[] {
  const { directions, radii } = NEWCOMER_PLACEMENT;
  let best: { spots: V7Point[]; distance: number } | null = null;
  for (let k = 0; k < directions; k++) {
    const trial = v7Clone(world),
      spots: V7Point[] = [];
    for (const [j, person] of people.entries()) {
      const angle =
        (k * 2 * Math.PI) / directions + (j * 2 * Math.PI) / people.length;
      const spot = radii
        .map((r) => ({
          x: round2(CULTURE_CENTER.x + Math.cos(angle) * r),
          y: round2(CULTURE_CENTER.y + Math.sin(angle) * r),
        }))
        .find((p) => newcomerGround(trial, p, person.radius));
      if (!spot) break;
      spots.push(spot);
      trial.actors.push({ ...v7Clone(person), position: spot });
    }
    if (spots.length !== people.length) continue;
    const distance = Math.min(
      ...spots.flatMap((p) =>
        world.actors.map((a) => v7Distance(a.position, p)),
      ),
    );
    if (!best || distance > best.distance) best = { spots, distance };
  }
  if (!best)
    throw new Error('No dry ordinary ground at the edge of the clearing.');
  return best.spots;
}
/** A newcomer made as the culture scenario makes a new person, without any prior memory,
 * knowledge, relationships or developed abilities. */
function newcomer(
  template: V7Actor,
  person: LongNewcomer,
  temperament: Record<string, number>,
  baseline: string[],
  tick: number,
): V7Actor {
  const actor = v7Clone(template);
  actor.id = person.id;
  actor.name = person.name;
  actor.angle = 0;
  actor.mastered = [...baseline];
  actor.learning = null;
  actor.memory = {
    ...actor.memory,
    cells: [],
    objects: [],
    stacks: [],
    experiences: [],
    important: [],
    discoveries: {},
    notes: [],
    preferences: [],
    projects: {},
    knowledge: {},
    abilityDetails: [],
  };
  delete actor.memory.cares;
  delete actor.memory.views;
  delete actor.memory.intention;
  actor.relationships = {};
  actor.extensionState = {
    'long:tendencies': { ...temperament, leaning: person.leaning },
  };
  actor.bornAt = tick;
  actor.parents = [];
  actor.experience = forestInitialExperience();
  return actor;
}

/** Build the genesis of an imported run: the source world with only the listed
 * configuration changes and the newcomers appended. Residents, objects, signs, items,
 * plants, terrain, time and world state are unchanged. */
export function importLongWorld(
  source: V7World,
  options: { experiment: string; scope: string; newcomers: LongNewcomer[] },
): LongImport {
  const development = source.config.development;
  if (
    !source.config.longDevelopment?.culture ||
    !development ||
    !source.config.experience ||
    source.tick < 1
  )
    throw new Error('Only a retained culture-scope world can be imported.');
  const target = longImportConfig(options.scope, {
    experiment: options.experiment,
    scope: development.scope,
    round: source.tick,
  });
  const world = v7Clone(source),
    changes: LongImportChange[] = [];
  for (const change of longWorldDiff(source.config, target)) {
    const reason = CHANGE_REASONS.find(([pattern]) =>
      pattern.test(change.path),
    )?.[1];
    if (!reason || !('to' in change))
      throw new Error(
        `The source configuration differs from culture v2 at ${change.path}, outside the listed import changes.`,
      );
    assign(
      world.config as unknown as Record<string, unknown>,
      change.path,
      change.to,
    );
    changes.push({
      path: `config.${change.path}`,
      ...('from' in change ? { from: v7Clone(change.from) } : {}),
      to: v7Clone(change.to),
      reason,
    });
  }
  if (v7Signature(world.config) !== v7Signature(target))
    throw new Error('Imported configuration differs from culture v2.');
  // People are made as the culture genesis makes them, from its own template person.
  const genesis = initialLongWorld(options.scope, 'long-culture-v2'),
    template = genesis.actors[0];
  if (!template) throw new Error('Missing culture genesis person.');
  if (genesis.stacks.some((s) => s.owner !== null))
    throw new Error('Culture genesis inventories are not empty.');
  const temperament = residentTemperament(source),
    baseline = target.development?.baseline ?? [];
  const people = options.newcomers.map((person) =>
    newcomer(template, person, temperament, baseline, source.tick),
  );
  const spots = placeNewcomers(world, people);
  people.forEach((actor, i) => {
    const spot = spots[i];
    if (!spot) throw new Error('Missing newcomer start.');
    actor.position = { ...spot };
    actor.life = {
      total: template.life?.total ?? 3,
      deaths: 0,
      spawn: { ...spot },
      lastDeath: null,
    };
    world.actors.push(actor);
    changes.push({
      path: `actors.${String(world.actors.length - 1)}`,
      to: v7Clone(actor),
      reason: `Newcomer ${actor.name} added at the import.`,
    });
  });
  v7AssertWorld(world, continuousRegistry(world));
  const residents = new Set(source.actors.map((a) => a.id));
  const newcomers = people.map((actor): LongNewcomerPlacement => {
    const seen = v7Observe(world, actor.id),
      distance = (p: V7Point) => round2(v7Distance(actor.position, p));
    return {
      id: actor.id,
      position: actor.position,
      distanceFromCenter: distance(CULTURE_CENTER),
      residentsInSight: seen.actors
        .filter((a) => residents.has(a.id))
        .map((a) => ({ id: a.id, distance: distance(a.position) })),
      signsInSight: seen.objects.filter(expressionSign).map((o) => ({
        id: o.id,
        distance: distance(o.spatial),
        text: o.data.text,
      })),
      residentsWithinVision: source.actors
        .filter(
          (a) => v7Distance(a.position, actor.position) <= world.config.vision,
        )
        .map((a) => a.id),
      signsWithinVision: source.objects
        .filter(
          (o) =>
            expressionSign(o) &&
            v7Distance(o.spatial, actor.position) <= world.config.vision,
        )
        .map((o) => o.id),
    };
  });
  return { world: v7Freeze(world), changes, temperament, newcomers };
}
