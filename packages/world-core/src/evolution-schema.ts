import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
} from './skill-code.js';
import type {
  Biome,
  EOperation,
  EResourceType,
  EcologyRule,
  EReview,
  EvolutionProposal,
  Mechanic,
  MechanicDraft,
} from './evolution-types.js';
export const BIOMES: Readonly<Record<string, Biome>> = freeze({
  F: 'forest',
  G: 'grassland',
  W: 'river',
  B: 'bank',
  R: 'rocky',
  M: 'damp',
  S: 'shallow',
});
export const EVOLUTION_CONFIG = freeze({
  version: 'evolution-v1',
  seed: 20261109,
  width: 48,
  height: 48,
  visionRadius: 5,
  rounds: 120,
  initialHealth: 100,
  initialSatiety: 60,
  satietyLoss: 2,
  starvationDamage: 10,
  callsPerAgent: 60,
  worldAttempts: 48,
  attemptsPerBatch: 2,
  planRounds: 12,
});
export function eId(value: unknown): string {
  const id = boundedText(value, 64);
  if (
    !/^[a-z][a-z0-9-]*$/.test(id) ||
    ['constructor', 'prototype', '__proto__'].includes(id)
  )
    throw new RangeError('Invalid evolution identifier.');
  return id;
}
export function choice<T extends string>(
  input: unknown,
  values: readonly T[],
): T {
  if (!values.includes(input as T))
    throw new RangeError(`Expected ${values.join(', ')}.`);
  return input as T;
}
export function parseResourceType(input: unknown): EResourceType {
  const r = dataObject(input);
  exactKeys(r, [
    'id',
    'name',
    'appearance',
    'nutrition',
    'toxicity',
    'durability',
  ]);
  return freeze({
    id: eId(r.id),
    name: boundedText(r.name, 80),
    appearance: boundedText(r.appearance, 160),
    nutrition: count(r.nutrition, 0, 30),
    toxicity: count(r.toxicity, 0, 40),
    durability: count(r.durability, 0, 12),
  });
}
export function parseEcology(input: unknown): EcologyRule {
  const r = dataObject(input);
  exactKeys(r, [
    'id',
    'resource',
    'siteKind',
    'biomes',
    'distribution',
    'reason',
  ]);
  const biomes = list(r.biomes, 7).map((v) => choice(v, Object.values(BIOMES))),
    distribution = list(r.distribution, 12).map((v) => count(v, 0, 4));
  if (!biomes.length || !distribution.length || !distribution.includes(0))
    throw new RangeError(
      'Ecological distributions must include zero stock and suitable biomes.',
    );
  return freeze({
    id: eId(r.id),
    resource: eId(r.resource),
    siteKind: eId(r.siteKind),
    biomes,
    distribution,
    reason: boundedText(r.reason),
  });
}
export function parseMechanic(input: unknown): MechanicDraft {
  const m = dataObject(input);
  exactKeys(m, ['id', 'name', 'description', 'parameters', 'code']);
  const parameters = list(m.parameters, 4).map((p) => eId(p));
  if (new Set(parameters).size !== parameters.length)
    throw new RangeError('Duplicate mechanic parameters.');
  return freeze({
    id: eId(m.id),
    name: boundedText(m.name, 80),
    description: boundedText(m.description),
    parameters,
    code: boundedText(m.code, 6000),
  });
}
export function compileMechanic(input: unknown): Mechanic {
  const m = parseMechanic(input),
    raw = list(JSON.parse(m.code) as unknown, 6);
  if (!raw.length)
    throw new RangeError('Mechanic must contain executable operations.');
  const operations: EOperation[] = raw.map((v) => {
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
    const op = choice(o.op, ['extract', 'consume', 'convert', 'identify']),
      target = o.target === null ? null : eId(o.target),
      resource = o.resource === null ? null : eId(o.resource),
      tool = o.tool === null ? null : eId(o.tool);
    const costs = list(o.costs, 4).map((c) => {
      const r = dataObject(c);
      exactKeys(r, ['resource', 'quantity']);
      return { resource: eId(r.resource), quantity: count(r.quantity, 1, 4) };
    });
    const quantity = count(o.quantity, 1, 3),
      chance = count(o.chance, 1, 100);
    if (target !== null && !m.parameters.includes(target))
      throw new RangeError('Use a declared target parameter.');
    if (
      (op !== 'convert' && target === null) ||
      ((op === 'extract' || op === 'convert') && resource === null) ||
      ((op === 'consume' || op === 'identify') && resource !== null) ||
      (op === 'convert' && !costs.length) ||
      (op !== 'extract' && chance !== 100) ||
      (op === 'identify' && (quantity !== 1 || costs.length || tool))
    )
      throw new RangeError('Inconsistent constrained operation.');
    return { op, target, resource, quantity, costs, tool, chance };
  });
  if (m.parameters.some((p) => !operations.some((o) => o.target === p)))
    throw new RangeError('Unused mechanic parameter.');
  const normalized = operations.map((o) => ({
    ...o,
    target: o.target === null ? null : m.parameters.indexOf(o.target),
    costs: [...o.costs].sort((a, b) => a.resource.localeCompare(b.resource)),
  }));
  return freeze({
    ...m,
    version: 1,
    operations,
    signature: JSON.stringify(normalized),
  });
}
export function parseEReview(input: unknown): EReview {
  const r = dataObject(input);
  exactKeys(r, [
    'agentId',
    'decision',
    'reason',
    'prerequisites',
    'learningRounds',
    'mechanicId',
  ]);
  const decision = choice(r.decision, ['create', 'reuse', 'reject']);
  const mechanicId = r.mechanicId === null ? null : eId(r.mechanicId);
  if ((decision === 'reject') !== (mechanicId === null))
    throw new RangeError('Review decision and mechanic do not agree.');
  return freeze({
    agentId: eId(r.agentId),
    decision,
    reason: boundedText(r.reason, 1600),
    prerequisites: list(r.prerequisites, 12).map((p) => boundedText(p)),
    learningRounds: count(
      r.learningRounds,
      decision === 'reject' ? 0 : 1,
      decision === 'reject' ? 0 : 12,
    ),
    mechanicId,
  });
}
export function parseEvolutionProposal(input: unknown): EvolutionProposal {
  const p = dataObject(input);
  exactKeys(p, ['resources', 'ecology', 'mechanics', 'reviews']);
  return freeze({
    resources: list(p.resources, 8).map(parseResourceType),
    ecology: list(p.ecology, 8).map(parseEcology),
    mechanics: list(p.mechanics, 8).map(parseMechanic),
    reviews: list(p.reviews, 32).map(parseEReview),
  });
}
export const EMPTY_PROPOSAL: EvolutionProposal = freeze({
  resources: [],
  ecology: [],
  mechanics: [],
  reviews: [],
});
/** Stable counter-based sampling: unrelated calls cannot change a site's assignment. */
export function seededUnit(seed: number, key: string): number {
  let n = seed >>> 0;
  for (let i = 0; i < key.length; i++) {
    n = Math.imul(n ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  n ^= n >>> 16;
  n = Math.imul(n, 2246822507) >>> 0;
  n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}
