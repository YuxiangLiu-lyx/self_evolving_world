import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
} from './skill-code.js';
import { parseLearningAction } from './learning.js';
import {
  BIOMES,
  choice,
  eId,
  parseResourceType,
  parseEReview,
  parseMechanic,
  seededUnit,
} from './evolution-schema.js';
import type {
  CEcologyRule,
  CoevolutionAction,
  CoevolutionProposal,
  CMechanic,
  COperation,
  ObjectBlueprint,
  PersonalProject,
} from './coevolution-types.js';
export {
  BIOMES as C_BIOMES,
  eId as cId,
  parseResourceType as parseCResourceType,
  seededUnit as cSeededUnit,
};
export const COEVOLUTION_CONFIG = freeze({
  version: 'coevolution-v1',
  seed: 20261119,
  width: 24,
  height: 24,
  visionRadius: 5,
  rounds: 180,
  initialHealth: 100,
  initialSatiety: 80,
  satietyLoss: 2,
  starvationDamage: 10,
  initialEnergy: 40,
  energyCap: 40,
  restRecovery: 4,
  ordinaryAttempts: 120,
  worldAttempts: 20,
  developmentInterventions: 10,
  attemptsPerBatch: 2,
  planRounds: 12,
  stages: [30, 60, 120, 180],
  earlyStop:
    'At round 60 only: no measured benefit and no noninitial successful use, construction, processing or learning progress during rounds 31-60.',
});
export function parseCoevolutionAction(input: unknown): CoevolutionAction {
  const a = dataObject(input),
    agentId = eId(a.agentId);
  if (a.type === 'use') {
    exactKeys(a, ['type', 'agentId', 'skillId', 'args']);
    const args = dataObject(a.args);
    if (Object.keys(args).length > 4)
      throw new RangeError('At most four declared target bindings.');
    return freeze({
      type: 'use',
      agentId,
      skillId: eId(a.skillId),
      args: Object.fromEntries(
        Object.entries(args).map(([k, v]) => [eId(k), boundedText(v, 80)]),
      ),
    });
  }
  if (a.type === 'rest') {
    exactKeys(a, ['type', 'agentId']);
    return freeze({ type: 'rest', agentId });
  }
  if (a.type === 'drop' || a.type === 'give') {
    exactKeys(
      a,
      a.type === 'give'
        ? ['type', 'agentId', 'itemId', 'recipient']
        : ['type', 'agentId', 'itemId'],
    );
    return freeze(
      a.type === 'give'
        ? {
            type: 'give',
            agentId,
            itemId: eId(a.itemId),
            recipient: eId(a.recipient),
          }
        : { type: 'drop', agentId, itemId: eId(a.itemId) },
    );
  }
  if (a.type === 'message') {
    exactKeys(a, ['type', 'agentId', 'recipient', 'text']);
    return freeze({
      type: 'message',
      agentId,
      recipient: eId(a.recipient),
      text: boundedText(a.text, 240),
    });
  }
  return parseLearningAction(input);
}
export function parseProject(input: unknown): PersonalProject {
  const p = dataObject(input);
  exactKeys(p, ['problem', 'reason', 'progress', 'missing', 'observedEffects']);
  return freeze({
    problem: boundedText(p.problem, 240),
    reason: boundedText(p.reason, 240),
    progress: boundedText(p.progress, 240),
    missing: boundedText(p.missing, 240),
    observedEffects: boundedText(p.observedEffects, 240),
  });
}
const costs = (input: unknown) =>
  list(input, 4).map((v) => {
    const c = dataObject(v);
    exactKeys(c, ['resource', 'quantity']);
    return { resource: eId(c.resource), quantity: count(c.quantity, 1, 8) };
  });
export function parseObjectBlueprint(input: unknown): ObjectBlueprint {
  const b = dataObject(input);
  exactKeys(b, [
    'id',
    'name',
    'description',
    'portable',
    'restBonus',
    'carryBonus',
    'recipe',
    ...(b.growth === undefined ? [] : ['growth']),
  ]);
  if (typeof b.portable !== 'boolean')
    throw new RangeError('Object portability must be boolean.');
  let recipe: ObjectBlueprint['recipe'] = null;
  if (b.recipe !== null) {
    const p = dataObject(b.recipe);
    exactKeys(p, ['inputs', 'output', 'quantity', 'delay']);
    recipe = {
      inputs: costs(p.inputs),
      output: eId(p.output),
      quantity: count(p.quantity, 1, 6),
      delay: count(p.delay, 2, 12),
    };
    if (!recipe.inputs.length || b.portable)
      throw new RangeError(
        'Processing needs inputs and a stationary facility.',
      );
  }
  const restBonus = count(b.restBonus, 0, 8),
    carryBonus = count(b.carryBonus, 0, 8);
  let growth: ObjectBlueprint['growth'];
  if (b.growth !== undefined) {
    const g = dataObject(b.growth);
    exactKeys(g, [
      'version',
      'output',
      'biomes',
      'establishment',
      'interval',
      'ceiling',
      'lifetime',
    ]);
    const biomes = list(g.biomes, 3).map((v) =>
      choice(v, ['forest', 'grassland', 'damp'] as const),
    );
    if (
      g.version !== 'photosynthesis-v1' ||
      b.portable ||
      recipe ||
      !biomes.length
    )
      throw new RangeError(
        'Growth needs a stationary planting, suitable habitat and a versioned environmental energy source.',
      );
    growth = {
      version: 'photosynthesis-v1',
      output: eId(g.output),
      biomes,
      establishment: count(g.establishment, 2, 120),
      interval: count(g.interval, 2, 120),
      ceiling: count(g.ceiling, 1, 3),
      lifetime: count(g.lifetime, 1, 12),
    };
  }
  if (
    (carryBonus > 0 && !b.portable) ||
    (!restBonus && !carryBonus && !recipe && !growth)
  )
    throw new RangeError(
      'Object must supply a bounded physical effect; carrying requires portability.',
    );
  return freeze({
    id: eId(b.id),
    name: boundedText(b.name, 80),
    description: boundedText(b.description, 800),
    portable: b.portable,
    restBonus,
    carryBonus,
    recipe,
    ...(growth ? { growth } : {}),
  });
}
export function parseCEcology(input: unknown): CEcologyRule {
  const r = dataObject(input);
  exactKeys(r, [
    'id',
    'resource',
    'siteKind',
    'biomes',
    'distribution',
    'reason',
    'niche',
    'renewEvery',
    'lifetime',
  ]);
  const biomes = list(r.biomes, 7).map((v) => choice(v, Object.values(BIOMES))),
    distribution = list(r.distribution, 12).map((v) => count(v, 0, 4));
  if (!biomes.length || !distribution.length || !distribution.includes(0))
    throw new RangeError(
      'Ecology requires habitat and a distribution including zero.',
    );
  return freeze({
    id: eId(r.id),
    resource: eId(r.resource),
    siteKind: eId(r.siteKind),
    biomes,
    distribution,
    reason: boundedText(r.reason, 800),
    niche: choice(r.niche, ['surface', 'canopy', 'substrate']),
    renewEvery: count(r.renewEvery, 0, 24),
    lifetime: count(r.lifetime, 0, 24),
  });
}
export function compileCMechanic(input: unknown): CMechanic {
  const m = parseMechanic(input),
    raw = list(JSON.parse(m.code) as unknown, 6);
  if (!raw.length)
    throw new RangeError('A mechanic needs executable operations.');
  const operations: COperation[] = raw.map((v, index) => {
    const o = dataObject(v);
    exactKeys(o, [
      'op',
      'target',
      'resource',
      'quantity',
      'costs',
      'tool',
      'chance',
    ]);
    const op = choice(o.op, [
        'extract',
        'consume',
        'convert',
        'identify',
        'place',
        'process',
      ]),
      target = o.target === null ? null : eId(o.target),
      resource = o.resource === null ? null : eId(o.resource),
      tool = o.tool === null ? null : eId(o.tool),
      quantity = count(o.quantity, 1, 3),
      chance = count(o.chance, 1, 100),
      material = costs(o.costs);
    const intermediate = target?.match(/^result-([0-5])$/),
      prior = intermediate ? Number(intermediate[1]) : -1;
    if (
      target !== null &&
      !m.parameters.includes(target) &&
      !(prior >= 0 && prior < index)
    )
      throw new RangeError('Target must be a parameter or earlier result-N.');
    if (
      (['extract', 'consume', 'identify', 'process'].includes(op) &&
        target === null) ||
      (['extract', 'convert', 'place'].includes(op) && resource === null) ||
      (['consume', 'identify', 'process'].includes(op) && resource !== null) ||
      (op === 'convert' && !material.length) ||
      (op === 'place' &&
        (target !== null ||
          material.reduce((n, c) => n + c.quantity, 0) < 2 ||
          quantity !== 1)) ||
      (op !== 'extract' && chance !== 100) ||
      (op === 'identify' && (quantity !== 1 || material.length || tool)) ||
      (op === 'process' && (quantity !== 1 || material.length || tool))
    )
      throw new RangeError('Inconsistent costed operation.');
    return { op, target, resource, quantity, costs: material, tool, chance };
  });
  if (m.parameters.some((p) => !operations.some((o) => o.target === p)))
    throw new RangeError('Unused mechanic parameter.');
  const normalized = operations.map((o) => ({
    ...o,
    target:
      o.target === null
        ? null
        : m.parameters.includes(o.target)
          ? m.parameters.indexOf(o.target)
          : o.target,
    costs: [...o.costs].sort((a, b) => a.resource.localeCompare(b.resource)),
  }));
  return freeze({
    ...m,
    version: 1,
    operations,
    signature: JSON.stringify(normalized),
  });
}
export function parseCoevolutionProposal(input: unknown): CoevolutionProposal {
  const p = dataObject(input);
  exactKeys(p, ['resources', 'ecology', 'mechanics', 'reviews', 'objects']);
  return freeze({
    resources: list(p.resources, 8).map(parseResourceType),
    ecology: list(p.ecology, 8).map(parseCEcology),
    mechanics: list(p.mechanics, 8).map(parseMechanic),
    reviews: list(p.reviews, 3).map(parseEReview),
    objects: list(p.objects, 8).map(parseObjectBlueprint),
  });
}
export const EMPTY_COEVOLUTION_PROPOSAL: CoevolutionProposal = freeze({
  resources: [],
  ecology: [],
  mechanics: [],
  reviews: [],
  objects: [],
});
