import { createWorld, snapshot, isVisible } from './world.js';
import type { WorldSetup, WorldState } from './world.js';
import type { Cell, LearningAction } from './learning-types.js';
import type {
  EMemory,
  ESite,
  EStack,
  EvolutionData,
  EvolutionEnvironment,
  EvolutionProposal,
  Mechanic,
} from './evolution-types.js';
import {
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
  boundedText,
} from './skill-code.js';
import {
  BIOMES,
  compileMechanic,
  eId,
  EVOLUTION_CONFIG,
  parseResourceType,
  seededUnit,
} from './evolution-schema.js';

export function evolutionData(world: WorldState): EvolutionData {
  if (!world.evolution) throw new RangeError('Missing evolution-v1 state.');
  return world.evolution;
}
export function cellKey(p: Cell): string {
  return `${String(p.x)},${String(p.y)}`;
}
export function biomeAt(data: EvolutionEnvironment, p: Cell) {
  const code = data.terrain[p.y]?.[p.x],
    biome = code === undefined ? undefined : BIOMES[code];
  if (!biome) throw new RangeError('Invalid terrain cell.');
  return biome;
}
export function eWalkable(data: EvolutionEnvironment, p: Cell): boolean {
  return (
    p.x >= 0 &&
    p.y >= 0 &&
    p.y < data.terrain.length &&
    p.x < (data.terrain[0]?.length ?? 0) &&
    biomeAt(data, p) !== 'river' &&
    !data.sites.some(
      (s) => s.position.x === p.x && s.position.y === p.y && s.kind !== 'water',
    )
  );
}
function point(input: unknown, width: number, height: number): Cell {
  const p = dataObject(input);
  exactKeys(p, ['x', 'y']);
  return { x: count(p.x, 0, width - 1), y: count(p.y, 0, height - 1) };
}
export function createEvolutionWorld(
  setup: WorldSetup,
  input: unknown,
): WorldState {
  const initial = createWorld(setup),
    e = dataObject(input);
  exactKeys(e, ['seed', 'terrain', 'types', 'stacks', 'sites', 'ecology']);
  const { width, height } = initial.settings;
  const terrain = list(e.terrain, 64).map((row) => boundedText(row, 64));
  if (
    terrain.length !== height ||
    terrain.some((row) => row.length !== width || !/^[FGWBRMS]+$/u.test(row))
  )
    throw new RangeError('Terrain dimensions/biomes mismatch.');
  const types = list(e.types, 32).map(parseResourceType),
    typeIds = new Set(types.map((t) => t.id));
  if (types.length !== typeIds.size)
    throw new RangeError('Duplicate initial resource types.');
  const stacks: EStack[] = list(e.stacks, 256).map((v) => {
    const s = dataObject(v);
    exactKeys(s, ['id', 'type', 'quantity', 'durability', 'owner', 'position']);
    const type = eId(s.type);
    if (!typeIds.has(type)) throw new RangeError('Unknown stack type.');
    const owner = s.owner === null ? null : eId(s.owner),
      position = s.position === null ? null : point(s.position, width, height);
    if (
      (owner === null) === (position === null) ||
      (owner && !initial.agents.some((a) => a.id === owner))
    )
      throw new RangeError('Stack needs exactly one owner or ground position.');
    const definition = types.find((t) => t.id === type);
    return {
      id: eId(s.id),
      type,
      quantity: count(s.quantity, 1, 12),
      durability: count(s.durability, 0, definition?.durability ?? 0),
      owner,
      position,
    };
  });
  const sites: ESite[] = list(e.sites, 256).map((v) => {
    const s = dataObject(v);
    exactKeys(s, [
      'id',
      'kind',
      'appearance',
      'position',
      'capacity',
      'energyLimit',
      'allocation',
      'stock',
    ]);
    if (s.allocation !== null)
      throw new RangeError('Initial ecology assignments must be absent.');
    const stock = Object.fromEntries(
      Object.entries(dataObject(s.stock)).map(([k, v]) => {
        if (!typeIds.has(k)) throw new RangeError('Unknown initial stock.');
        return [k, count(v, 0, 6)];
      }),
    );
    return {
      id: eId(s.id),
      kind: eId(s.kind),
      appearance: boundedText(s.appearance, 160),
      position: point(s.position, width, height),
      capacity: count(s.capacity, 0, 3),
      energyLimit: count(s.energyLimit, 0, 30),
      allocation: null,
      stock,
    };
  });
  const ids = [...sites.map((s) => s.id), ...stacks.map((s) => s.id)];
  if (
    new Set(ids).size !== ids.length ||
    list(e.ecology, 0).length ||
    !initial.agents.length
  )
    throw new RangeError('Invalid initial ecology identities.');
  const environment = {
    seed: count(e.seed, 1, 4294967295),
    terrain,
    types,
    stacks,
    sites,
    ecology: [],
  };
  if (initial.agents.some((a) => !eWalkable(environment, a.position)))
    throw new RangeError('An actor starts on impassable terrain.');
  const data: EvolutionData = {
    ...environment,
    version: 'evolution-v1',
    mechanics: [],
    skills: [],
    knowledge: Object.fromEntries(
      initial.agents.map((a) => [a.id, { learned: [], pending: null }]),
    ),
    vitals: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        {
          health: 100,
          satiety: EVOLUTION_CONFIG.initialSatiety,
          cold: 0,
          heat: 0,
        },
      ]),
    ),
    memory: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        { knownTypes: [], visited: [], discovered: [], inspected: [] },
      ]),
    ),
    events: [],
  };
  return evolutionSnapshot(initial, data, 0);
}
export function evolutionSnapshot(
  world: WorldState,
  data: EvolutionData,
  tick: number,
): WorldState {
  const item = (s: EStack) => ({
    id: s.id,
    name: data.types.find((t) => t.id === s.type)?.name ?? s.type,
  });
  const agents = world.agents.map((a) => ({
    ...a,
    inventory: data.stacks
      .filter((s) => s.owner === a.id && s.quantity > 0)
      .map(item),
  }));
  const items = data.stacks.flatMap((s) =>
    s.position && s.quantity > 0 ? [{ ...item(s), position: s.position }] : [],
  );
  const next = snapshot(tick, world.settings, agents, items, null);
  const memory: Record<string, EMemory> = { ...data.memory };
  for (const actor of agents) {
    const m = memory[actor.id];
    if (!m) throw new RangeError('Missing actor memory.');
    const visible = (p: Cell) =>
      isVisible(actor.position, p, world.settings.visionRadius);
    memory[actor.id] = {
      ...m,
      visited: [...new Set([...m.visited, cellKey(actor.position)])],
      discovered: [
        ...new Set([
          ...m.discovered,
          ...data.sites.filter((s) => visible(s.position)).map((s) => s.id),
          ...data.stacks
            .filter((s) => s.position && visible(s.position))
            .map((s) => s.id),
        ]),
      ],
    };
  }
  return freeze({ ...next, evolution: { ...data, memory } });
}
export function registerEvolution(
  world: WorldState,
  actions: readonly LearningAction[],
  proposal: EvolutionProposal,
): EvolutionData {
  const data = evolutionData(world),
    requests = actions.filter(
      (a) =>
        a.type === 'learn' &&
        (data.vitals[a.agentId]?.health ?? 0) > 0 &&
        !data.knowledge[a.agentId]?.pending,
    );
  if (
    proposal.reviews.length !== requests.length ||
    new Set(proposal.reviews.map((r) => r.agentId)).size !== requests.length ||
    proposal.reviews.some((r) => !requests.some((a) => a.agentId === r.agentId))
  )
    throw new RangeError(
      'Resolve every pending living request exactly once before the round.',
    );
  if (
    !requests.length &&
    (proposal.resources.length ||
      proposal.ecology.length ||
      proposal.mechanics.length)
  )
    throw new RangeError('World extensions require an actual request.');
  const types = [...data.types],
    ecology = [...data.ecology],
    mechanics: Mechanic[] = [...data.mechanics],
    sites = [...data.sites];
  const aliases = new Map<string, string>();
  for (const t of proposal.resources) {
    const existing = types.find((x) => x.id === t.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(t))
      throw new RangeError('Resource properties are immutable.');
    if (!existing) types.push(t);
  }
  for (const rule of proposal.ecology) {
    const existing = ecology.find((r) => r.id === rule.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(rule))
        throw new RangeError('An ecological rule cannot be rewritten.');
      continue;
    }
    const type = types.find((t) => t.id === rule.resource);
    if (!type) throw new RangeError('Ecology references an unknown type.');
    if (
      !sites.some(
        (s) =>
          s.kind === rule.siteKind &&
          rule.biomes.includes(biomeAt(data, s.position)),
      )
    )
      throw new RangeError('No suitable ecological habitat exists.');
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      if (
        !site ||
        site.allocation !== null ||
        site.kind !== rule.siteKind ||
        !rule.biomes.includes(biomeAt(data, site.position))
      )
        continue;
      if (type.nutrition > site.energyLimit)
        throw new RangeError('Ecology exceeds the habitat energy envelope.');
      const draw =
        rule.distribution[
          Math.floor(
            seededUnit(data.seed, `ecology:${site.id}`) *
              rule.distribution.length,
          )
        ] ?? 0;
      sites[i] = {
        ...site,
        allocation: rule.id,
        stock: {
          ...site.stock,
          [type.id]: (site.stock[type.id] ?? 0) + Math.min(site.capacity, draw),
        },
      };
    }
    ecology.push(rule);
  }
  for (const draft of proposal.mechanics) {
    const candidate = compileMechanic(draft),
      sameId = mechanics.find((m) => m.id === candidate.id);
    if (sameId) {
      if (sameId.signature !== candidate.signature)
        throw new RangeError('An existing mechanic cannot change.');
      aliases.set(draft.id, sameId.id);
      continue;
    }
    for (const op of candidate.operations) {
      if (
        [op.resource, op.tool, ...op.costs.map((c) => c.resource)].some(
          (id) => id !== null && !types.some((t) => t.id === id),
        )
      )
        throw new RangeError('Mechanic refers to an undefined resource.');
      if (op.tool && !types.some((t) => t.id === op.tool && t.durability > 0))
        throw new RangeError('Tool prerequisites require a durable resource.');
    }
    const existing = mechanics.find((m) => m.signature === candidate.signature);
    aliases.set(draft.id, existing?.id ?? candidate.id);
    if (!existing) mechanics.push(candidate);
  }
  if (types.length > 32 || ecology.length > 24 || mechanics.length > 48)
    throw new RangeError('Finite world registry budget exceeded.');
  const skills = [...data.skills];
  for (const r of proposal.reviews) {
    if (r.decision === 'reject') continue;
    const id = aliases.get(r.mechanicId ?? '') ?? r.mechanicId,
      mechanic = mechanics.find((m) => m.id === id);
    if (
      !mechanic ||
      (r.decision === 'reuse' && !data.mechanics.some((m) => m.id === id))
    )
      throw new RangeError(
        'Reuse requires an existing mechanic; creation requires a validated implementation.',
      );
    if (!skills.some((s) => s.mechanicId === id))
      skills.push({
        id: `ability-${String(skills.length + 1)}`,
        mechanicId: mechanic.id,
        name: mechanic.name,
        description: mechanic.description,
        learningRounds: r.learningRounds,
        version: 1,
      });
  }
  return freeze({ ...data, types, ecology, mechanics, sites, skills });
}
