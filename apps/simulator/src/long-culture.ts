import {
  EXPRESSION_INTERFACES,
  EXPRESSION_REVISION,
  continuousRegistry,
  forestInitialExperience,
  v7Clone,
  v7Distance,
  v7Install,
  v7Obstacles,
  v7Remember,
  v7SegmentClear,
} from '@self-evolving-world/world-core';
import type {
  V7CultureOptions,
  V7Object,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';

/** Vocabulary that must never appear in anything ordinary agents can see in the culture
 * scope: instructions, packets, interfaces, events and satisfaction names. The design gives
 * possibilities, not goals. Agents' own words are their own and are not filtered. */
export const CULTURE_EXCLUDED_WORDS =
  /cultur|belie(f|v)|religio|ritual|social/i;
/** Default switches of the culture scenario; incentives are on only in its incentive variant. */
export const CULTURE_OPTIONS: V7CultureOptions = {
  version: 1,
  voice: true,
  differentiation: true,
  symbols: true,
  slack: true,
  density: 6,
  incentives: false,
  foodWater: true,
};
/** Culture v2 switches: the culture switches plus the open-goal ordinary prompt. */
export const CULTURE_V2_OPTIONS: V7CultureOptions = {
  ...CULTURE_OPTIONS,
  goal: 'open',
};
/** Culture v3 switches: culture v2 with the one G2-failure adjustment of part A's wording
 * (see docs/CULTURE_SCENARIO.md, Culture v3). */
export const CULTURE_V3_OPTIONS: V7CultureOptions = {
  ...CULTURE_V2_OPTIONS,
  goal: 'open-2',
};
/** Frozen context and handoff mechanics of the culture v2 run, which otherwise keeps the
 * culture budgets, checkpoints and ceilings. `inputBytes` is raised with the estimate limit
 * because ex15 inputs held up to 3.31 code units per estimated token, so the historical
 * 120,000-byte guard (60,000 code units) would bind near 18,000 tokens instead. */
export const LONG_CULTURE_V2 = {
  inputEstimateLimit: 24_000,
  exactRecordWidth: 6_000,
  inputBytes: 200_000,
  /** Window for full mastered-interface contracts; see docs/CULTURE_SCENARIO.md. */
  recentAbilityRounds: 25,
  rejectionStop: 3,
  abilityTextLimit: 3_500,
};
/** Frozen budget mechanics of E2/E3: never changed after the first call. The first window
 * ends at round 80 under an additional 3,200,000-token ceiling; `extend exN 250` then
 * continues under the 10,000,000-token ledger. */
export const LONG_CULTURE = {
  exactRecordWidth: 4000,
  guidance: ['plan-horizon', 'general-capabilities'] as const,
  /** Cumulative development handoffs; transport recoveries are not counted (`transportRecovery`). */
  developments: 40,
  /** World Agent call ceiling; ordinary calls keep the long-scenario ceiling of 1,800. */
  worldCalls: 300,
  tokens: 10_000_000,
  gate: 80,
  checkpoints: [80, 150, 250],
  tokenCeilings: [{ through: 80, tokens: 3_200_000 }],
};
/** The incentive control (E4): the culture world, seed and switches with incentives on, run
 * for one 120-round window under smaller frozen limits so it can be compared with the first
 * 120 rounds of the culture run. */
export const LONG_CULTURE_INCENTIVES = {
  developments: 16,
  tokens: 4_000_000,
  rounds: 120,
  checkpoints: [80, 120],
};
/** Survival slack: later pressure, a higher growth floor and renewable food near the starts. */
export const CULTURE_SLACK = {
  pressureStart: 300,
  difficultyStart: 440,
  growthFloor: 0.6,
  food: {
    berry: { capacity: 20, interval: 5 },
    root: { capacity: 20, interval: 8 },
  },
  /** Two rings of one berry bush and one root patch per person. */
  foodRadius: [3.8, 5.4] as const,
  /** Angular offset (radians) of each person's berry bush and root patch from their start. */
  foodSpread: 0.3,
};
/** People in order; the first three are the ex13 actors. */
export const CULTURE_PEOPLE = [
  { id: 'lin', name: 'Lin' },
  { id: 'moss', name: 'Moss' },
  { id: 'sol', name: 'Sol' },
  { id: 'kai', name: 'Kai' },
  { id: 'wren', name: 'Wren' },
  { id: 'ivo', name: 'Ivo' },
];
/** Starts on a ring around a shared clearing between the three ex13 starts. */
export const CULTURE_CENTER: V7Point = { x: 14, y: 15 };
export const CULTURE_START_RADIUS = 2.2;
/** Spread tendencies (ex13 values all lie in 0.47-0.56) and one-word value leanings. A
 * leaning is a tendency only; no rule reads it and no content is attached to it. */
export const CULTURE_TENDENCIES = [
  {
    curiosity: 0.8,
    riskTolerance: 0.3,
    closeness: 0.4,
    comfortPreference: 0.55,
    leaning: 'freedom',
  },
  {
    curiosity: 0.25,
    riskTolerance: 0.75,
    closeness: 0.65,
    comfortPreference: 0.3,
    leaning: 'belonging',
  },
  {
    curiosity: 0.6,
    riskTolerance: 0.45,
    closeness: 0.2,
    comfortPreference: 0.75,
    leaning: 'beauty',
  },
  {
    curiosity: 0.35,
    riskTolerance: 0.65,
    closeness: 0.8,
    comfortPreference: 0.45,
    leaning: 'fairness',
  },
  {
    curiosity: 0.7,
    riskTolerance: 0.2,
    closeness: 0.55,
    comfortPreference: 0.25,
    leaning: 'mastery',
  },
  {
    curiosity: 0.45,
    riskTolerance: 0.55,
    closeness: 0.3,
    comfortPreference: 0.7,
    leaning: 'calm',
  },
];
/** Authored starting food knowledge: everyone knows at least one safe food that grows nearby. */
export const CULTURE_KNOWLEDGE: ('berry' | 'root')[][] = [
  ['berry'],
  ['root'],
  ['berry', 'root'],
  ['berry'],
  ['root'],
  ['berry', 'root'],
];
/** Slightly different authored mastery: one person each starts without one record or
 * evidence interface, which `learn` restores in one round. */
export const CULTURE_UNMASTERED: (string | null)[] = [
  null,
  'probe',
  null,
  'exchange',
  'consult',
  null,
];
const FOOD = {
  berry: { nutrition: 8, toxicity: 0 },
  root: { nutrition: 14, toxicity: 0 },
};

const round2 = (value: number) => Math.round(value * 100) / 100;
function clearSpot(
  world: V7World,
  desired: V7Point,
  radius: number,
  gap: number,
) {
  return Array.from({ length: 121 }, (_, i) => ({
    x: round2(desired.x + ((i % 11) - 5) * 0.25),
    y: round2(desired.y + (Math.floor(i / 11) - 5) * 0.25),
  }))
    .sort((a, b) => v7Distance(a, desired) - v7Distance(b, desired))
    .find(
      (p) =>
        v7SegmentClear(p, p, radius, v7Obstacles(world)) &&
        world.actors.every((a) => v7Distance(a.position, p) > a.radius + gap),
    );
}
/** Six people on collision-free nearby starts; the first three keep their ex13 identities. */
function populate(world: V7World, count: number): void {
  const template = world.actors[0];
  if (!template) throw new Error('Missing baseline identity.');
  const people = CULTURE_PEOPLE.slice(0, count).map((person) => {
    const old = world.actors.find((a) => a.id === person.id);
    const actor = v7Clone(old ?? template);
    actor.id = person.id;
    actor.name = person.name;
    if (!old) {
      actor.extensionState = {};
      actor.relationships = {};
      actor.experience = forestInitialExperience();
    }
    return actor;
  });
  world.actors = [];
  people.forEach((actor, i) => {
    const angle = (i * 2 * Math.PI) / people.length;
    const position = clearSpot(
      world,
      {
        x: round2(CULTURE_CENTER.x + Math.cos(angle) * CULTURE_START_RADIUS),
        y: round2(CULTURE_CENTER.y + Math.sin(angle) * CULTURE_START_RADIUS),
      },
      actor.radius,
      actor.radius + 0.2,
    );
    if (!position) throw new Error('No collision-free start.');
    actor.position = { x: position.x, y: position.y };
    actor.life = {
      total: actor.life?.total ?? 3,
      deaths: 0,
      spawn: { ...actor.position },
      lastDeath: null,
    };
    actor.memory = {
      ...actor.memory,
      cells: [],
      objects: [],
      stacks: [],
      experiences: [],
      important: [],
    };
    world.actors.push(actor);
  });
}
/** Renewable basic food: one berry bush and one root patch just outside each start,
 * placed clear of bodies and solids, so that each person has nearby food of both kinds. */
function plantFood(world: V7World): void {
  const templates = {
    berry: world.objects.find((o) => o.id === 'start-0-berries'),
    root: world.objects.find((o) => o.id === 'start-0-roots'),
  };
  world.actors.forEach((_, i) => {
    for (const [n, resource, radius, offset] of [
      [0, 'berry', CULTURE_SLACK.foodRadius[0], -CULTURE_SLACK.foodSpread],
      [0, 'root', CULTURE_SLACK.foodRadius[0], CULTURE_SLACK.foodSpread],
      [1, 'root', CULTURE_SLACK.foodRadius[1], -CULTURE_SLACK.foodSpread / 2],
      [1, 'berry', CULTURE_SLACK.foodRadius[1], CULTURE_SLACK.foodSpread / 2],
    ] as const) {
      const template = templates[resource];
      if (!template) throw new Error('Missing authored food template.');
      const angle = (i * 2 * Math.PI) / world.actors.length + offset;
      const desired = {
        x: round2(CULTURE_CENTER.x + Math.cos(angle) * radius),
        y: round2(CULTURE_CENTER.y + Math.sin(angle) * radius),
      };
      const spot = clearSpot(world, desired, 0.65, 1);
      if (!spot) throw new Error('No clear renewable food site.');
      const object: V7Object = v7Clone(template);
      object.id = `commons-${resource}-${String(i)}-${String(n)}`;
      object.spatial.x = spot.x;
      object.spatial.y = spot.y;
      object.data = {
        ...object.data,
        stock: CULTURE_SLACK.food[resource].capacity,
        capacity: CULTURE_SLACK.food[resource].capacity,
        interval: CULTURE_SLACK.food[resource].interval,
        growth: 0,
        produced: 0,
      };
      world.objects.push(object);
    }
  });
}
/** Apply the selected culture switches to a long-fixes-shaped genesis (not frozen). */
export function applyCulture(
  world: V7World,
  options: V7CultureOptions,
): V7World {
  const policy = world.config.longDevelopment,
    development = world.config.development;
  if (!policy || !development) throw new Error('Missing long policy.');
  policy.culture = v7Clone(options);
  // A representation only: food gains a water composition when a later interface uses it.
  if (options.foodWater) world.state.foodWater = 1;
  if (options.slack) {
    policy.pressureStart = CULTURE_SLACK.pressureStart;
    policy.difficultyStart = CULTURE_SLACK.difficultyStart;
    policy.growthFloor = CULTURE_SLACK.growthFloor;
  }
  if (options.density !== world.actors.length) populate(world, options.density);
  if (options.slack) plantFood(world);
  world.actors.forEach((actor, i) => {
    if (options.differentiation) {
      const t = CULTURE_TENDENCIES[i % CULTURE_TENDENCIES.length];
      if (t) actor.extensionState['long:tendencies'] = { ...t };
      actor.memory.discoveries = Object.fromEntries(
        (CULTURE_KNOWLEDGE[i % CULTURE_KNOWLEDGE.length] ?? ['berry']).map(
          (food) => [food, { ...FOOD[food] }],
        ),
      );
    } else if (!actor.extensionState['long:tendencies'])
      actor.extensionState['long:tendencies'] = {
        curiosity: 0.5,
        riskTolerance: 0.5,
        closeness: 0.5,
        comfortPreference: 0.5,
      };
    else {
      // The visible key is renamed in this scope; the value is unchanged.
      const t = actor.extensionState['long:tendencies'];
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        const { socialNeed, ...rest } = t;
        actor.extensionState['long:tendencies'] = {
          curiosity: rest.curiosity ?? 0.5,
          riskTolerance: rest.riskTolerance ?? 0.5,
          closeness: socialNeed ?? 0.5,
          comfortPreference: rest.comfortPreference ?? 0.5,
        };
      }
    }
  });
  let next = world;
  if (options.symbols || options.incentives) {
    if (options.symbols)
      development.baseline = [
        ...development.baseline,
        ...EXPRESSION_INTERFACES,
      ];
    next = v7Clone(
      v7Install(world, continuousRegistry(world), EXPRESSION_REVISION),
    );
  }
  next.actors.forEach((actor, i) => {
    const missing = options.differentiation ? CULTURE_UNMASTERED[i] : null;
    actor.mastered = [
      ...actor.mastered.filter((id) => id !== missing),
      ...(options.symbols ? EXPRESSION_INTERFACES : []),
    ];
  });
  v7Remember(next);
  return next;
}
