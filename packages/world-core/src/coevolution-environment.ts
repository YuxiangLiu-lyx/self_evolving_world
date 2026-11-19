import { createWorld, snapshot, isVisible } from './world.js';
import type { WorldSetup, WorldState } from './world.js';
import type { Cell } from './learning-types.js';
import type {
  CoevolutionAction,
  ResourceAllocation,
} from './coevolution-types.js';
import type {
  CMemory,
  CSite,
  EStack,
  CoevolutionData,
  CoevolutionEnvironment,
  CoevolutionProposal,
  CMechanic,
} from './coevolution-types.js';
import {
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
  boundedText,
} from './skill-code.js';
import {
  C_BIOMES,
  compileCMechanic,
  cId,
  COEVOLUTION_CONFIG,
  parseCResourceType,
  cSeededUnit,
} from './coevolution-schema.js';

export function coevolutionData(world: WorldState): CoevolutionData {
  if (!world.coevolution) throw new RangeError('Missing coevolution-v1 state.');
  return world.coevolution;
}
export function cCellKey(p: Cell): string {
  return `${String(p.x)},${String(p.y)}`;
}
export function cBiomeAt(data: CoevolutionEnvironment, p: Cell) {
  const code = data.terrain[p.y]?.[p.x],
    biome = code === undefined ? undefined : C_BIOMES[code];
  if (!biome) throw new RangeError('Invalid terrain cell.');
  return biome;
}
export function cWalkable(data: CoevolutionEnvironment, p: Cell): boolean {
  return (
    p.x >= 0 &&
    p.y >= 0 &&
    p.y < data.terrain.length &&
    p.x < (data.terrain[0]?.length ?? 0) &&
    cBiomeAt(data, p) !== 'river' &&
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
export function createCoevolutionWorld(
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
  const types = list(e.types, 32).map(parseCResourceType),
    typcIds = new Set(types.map((t) => t.id));
  if (types.length !== typcIds.size)
    throw new RangeError('Duplicate initial resource types.');
  const stacks: EStack[] = list(e.stacks, 256).map((v) => {
    const s = dataObject(v);
    exactKeys(s, ['id', 'type', 'quantity', 'durability', 'owner', 'position']);
    const type = cId(s.type);
    if (!typcIds.has(type)) throw new RangeError('Unknown stack type.');
    const owner = s.owner === null ? null : cId(s.owner),
      position = s.position === null ? null : point(s.position, width, height);
    if (
      (owner === null) === (position === null) ||
      (owner && !initial.agents.some((a) => a.id === owner))
    )
      throw new RangeError('Stack needs exactly one owner or ground position.');
    const definition = types.find((t) => t.id === type);
    return {
      id: cId(s.id),
      type,
      quantity: count(s.quantity, 1, 12),
      durability: count(s.durability, 0, definition?.durability ?? 0),
      owner,
      position,
    };
  });
  const sites: CSite[] = list(e.sites, 256).map((v) => {
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
        if (!typcIds.has(k)) throw new RangeError('Unknown initial stock.');
        return [k, count(v, 0, 6)];
      }),
    );
    return {
      id: cId(s.id),
      kind: cId(s.kind),
      appearance: boundedText(s.appearance, 160),
      position: point(s.position, width, height),
      capacity: count(s.capacity, 0, 6),
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
  if (initial.agents.some((a) => !cWalkable(environment, a.position)))
    throw new RangeError('An actor starts on impassable terrain.');
  const data: CoevolutionData = {
    ...environment,
    version: 'coevolution-v1',
    mechanics: [
      compileCMechanic({
        id: 'basic-eating',
        name: 'Basic eating',
        description:
          'Consume one owned food unit, applying its real nutrition and toxicity.',
        parameters: ['item'],
        code: JSON.stringify([
          {
            op: 'consume',
            target: 'item',
            resource: null,
            quantity: 1,
            costs: [],
            tool: null,
            chance: 100,
          },
        ]),
      }),
    ],
    skills: [
      {
        id: 'ability-1',
        mechanicId: 'basic-eating',
        name: 'Basic eating',
        description: 'Consume one owned food unit.',
        learningRounds: 1,
        version: 1,
      },
    ],
    knowledge: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        { learned: ['ability-1'], pending: null },
      ]),
    ),
    vitals: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        {
          health: 100,
          satiety: COEVOLUTION_CONFIG.initialSatiety,
          cold: 0,
          heat: 0,
        },
      ]),
    ),
    memory: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        {
          knownTypes: types
            .filter((t) => t.toxicity === 0 && t.nutrition > 0)
            .map((t) => t.id),
          visited: [],
          discovered: [],
          inspected: [],
        },
      ]),
    ),
    events: [],
    blueprints: [],
    objects: [],
    jobs: [],
    allocations: [],
    messages: [],
    benefits: [],
    energy: Object.fromEntries(
      initial.agents.map((a) => [a.id, COEVOLUTION_CONFIG.initialEnergy]),
    ),
  };
  return coevolutionSnapshot(initial, data, 0);
}
export function coevolutionSnapshot(
  world: WorldState,
  data: CoevolutionData,
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
  const memory: Record<string, CMemory> = { ...data.memory };
  for (const actor of agents) {
    const m = memory[actor.id];
    if (!m) throw new RangeError('Missing actor memory.');
    const visible = (p: Cell) =>
      isVisible(actor.position, p, world.settings.visionRadius);
    memory[actor.id] = {
      ...m,
      visited: [...new Set([...m.visited, cCellKey(actor.position)])],
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
  return freeze({ ...next, coevolution: { ...data, memory } });
}
export function registerCoevolution(
  world: WorldState,
  actions: readonly CoevolutionAction[],
  proposal: CoevolutionProposal,
): CoevolutionData {
  const data = coevolutionData(world),
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
      proposal.mechanics.length ||
      proposal.objects.length)
  )
    throw new RangeError('World extensions require an actual request.');
  const types = [...data.types],
    ecology = [...data.ecology],
    mechanics: CMechanic[] = [...data.mechanics],
    sites = [...data.sites],
    blueprints = [...data.blueprints],
    allocations: ResourceAllocation[] = [...data.allocations];
  const aliases = new Map<string, string>();
  for (const t of proposal.resources) {
    const existing = types.find((x) => x.id === t.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(t))
      throw new RangeError('Resource properties are immutable.');
    if (!existing) types.push(t);
  }
  for (const object of proposal.objects) {
    const existing = blueprints.find((b) => b.id === object.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(object))
      throw new RangeError('Object definitions are immutable.');
    if (object.growth && !types.some((t) => t.id === object.growth?.output))
      throw new RangeError(
        'Growth requires an existing resource type and a bounded environmental contribution.',
      );
    if (object.recipe) {
      const recipe = object.recipe,
        output = types.find((t) => t.id === recipe.output);
      let energy = 0;
      for (const cost of recipe.inputs) {
        const t = types.find((t) => t.id === cost.resource);
        if (!t) throw new RangeError('Undefined processing input.');
        energy += t.nutrition * cost.quantity;
      }
      if (recipe.quantity > recipe.inputs.reduce((n, c) => n + c.quantity, 0))
        throw new RangeError('Processing cannot amplify material units.');
      if (!output || output.nutrition * recipe.quantity > energy)
        throw new RangeError('Processing cannot create nutritional energy.');
    }
    if (!existing) blueprints.push(object);
  }
  for (const rule of proposal.ecology) {
    const existing = ecology.find((r) => r.id === rule.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(rule))
        throw new RangeError('Ecology is immutable.');
      continue;
    }
    const type = types.find((t) => t.id === rule.resource);
    if (!type) throw new RangeError('Undefined ecological type.');
    const matches = sites.filter(
      (s) =>
        s.kind === rule.siteKind &&
        rule.biomes.includes(cBiomeAt(data, s.position)),
    );
    if (!matches.length) throw new RangeError('No compatible habitat exists.');
    for (const site of matches) {
      // The niche, not request/rule/resource naming, owns one permanent draw, including zero.
      if (allocations.some((a) => a.site === site.id && a.niche === rule.niche))
        continue;
      if (type.nutrition > site.energyLimit)
        throw new RangeError('Habitat energy envelope exceeded.');
      const draw =
        rule.distribution[
          Math.floor(
            cSeededUnit(data.seed, `ecology:${site.id}:${rule.niche}`) *
              rule.distribution.length,
          )
        ] ?? 0;
      const ceiling = Math.min(site.capacity, draw),
        stock = ceiling;
      const index = sites.findIndex((s) => s.id === site.id),
        current = sites[index];
      if (!current) throw new RangeError('Missing habitat.');
      sites[index] = {
        ...current,
        stock: {
          ...current.stock,
          [type.id]: (current.stock[type.id] ?? 0) + stock,
        },
      };
      allocations.push({
        site: site.id,
        niche: rule.niche,
        rule: rule.id,
        resource: type.id,
        draw,
        ceiling,
        remaining: ceiling === 0 ? 0 : rule.lifetime,
        renewEvery: rule.renewEvery,
        next: world.tick + Math.max(1, rule.renewEvery),
      });
    }
    ecology.push(rule);
  }
  for (const draft of proposal.mechanics) {
    const candidate = compileCMechanic(draft),
      samcId = mechanics.find((m) => m.id === candidate.id);
    if (samcId) {
      if (samcId.signature !== candidate.signature)
        throw new RangeError('An existing mechanic cannot change.');
      aliases.set(draft.id, samcId.id);
      continue;
    }
    for (const op of candidate.operations) {
      if (
        [
          op.op === 'place' ? null : op.resource,
          op.tool,
          ...op.costs.map((c) => c.resource),
        ].some((id) => id !== null && !types.some((t) => t.id === id))
      )
        throw new RangeError('CMechanic refers to an undefined resource.');
      if (op.op === 'place' && !blueprints.some((b) => b.id === op.resource))
        throw new RangeError('Undefined persistent object blueprint.');
      const growth =
        op.op === 'place'
          ? blueprints.find((b) => b.id === op.resource)?.growth
          : undefined;
      if (
        growth &&
        !op.costs.some((c) => c.resource === growth.output && c.quantity >= 1)
      )
        throw new RangeError(
          'Planting consumes matching propagation material in addition to its construction costs.',
        );
      if (op.tool && !types.some((t) => t.id === op.tool && t.durability > 0))
        throw new RangeError('Tool prerequisites require a durable resource.');
    }
    const existing = mechanics.find((m) => m.signature === candidate.signature);
    aliases.set(draft.id, existing?.id ?? candidate.id);
    if (!existing) mechanics.push(candidate);
  }
  if (
    types.length > 32 ||
    ecology.length > 24 ||
    mechanics.length > 48 ||
    blueprints.length > 24
  )
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
  return freeze({
    ...data,
    types,
    ecology,
    mechanics,
    sites,
    skills,
    blueprints,
    allocations,
  });
}
