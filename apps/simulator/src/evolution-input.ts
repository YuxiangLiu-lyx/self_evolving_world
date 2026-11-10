import {
  biomeAt,
  evolutionActions,
  evolutionData,
  EVOLUTION_CONFIG,
  isVisible,
  lastEvolutionFrame,
} from '@self-evolving-world/world-core';
import type { Cell, EvolutionRun } from '@self-evolving-world/world-core';
export function ordinaryEvolutionInput(run: EvolutionRun, agentId: string) {
  const world = lastEvolutionFrame(run),
    data = evolutionData(world),
    actor = world.agents.find((a) => a.id === agentId),
    cursor = run.cursors[agentId],
    memory = data.memory[agentId];
  if (!actor || !cursor || !memory)
    throw new Error('Missing private evolution input.');
  const visible = (p: Cell) =>
    isVisible(actor.position, p, world.settings.visionRadius);
  const known = new Set(memory.knownTypes);
  const resources = data.stacks
    .filter(
      (s) =>
        s.quantity > 0 &&
        (s.owner === agentId || (s.position && visible(s.position))),
    )
    .map((s) => {
      const type = data.types.find((t) => t.id === s.type);
      if (!type) throw new Error('Unknown observed resource.');
      return {
        id: s.id,
        type: s.type,
        appearance: type.appearance,
        quantity: s.quantity,
        position: s.position,
        owned: s.owner === agentId,
        durability: s.durability,
        ...(known.has(type.id)
          ? {
              knownProperties: {
                nutrition: type.nutrition,
                toxicity: type.toxicity,
              },
            }
          : { knownProperties: null }),
      };
    });
  const terrain = [];
  for (
    let y = Math.max(0, actor.position.y - 5);
    y <= Math.min(world.settings.height - 1, actor.position.y + 5);
    y++
  )
    for (
      let x = Math.max(0, actor.position.x - 5);
      x <= Math.min(world.settings.width - 1, actor.position.x + 5);
      x++
    )
      if (visible({ x, y }))
        terrain.push({ x, y, biome: biomeAt(data, { x, y }) });
  const sites = data.sites
    .filter((s) => visible(s.position))
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      appearance: s.appearance,
      position: s.position,
      knownStock: memory.inspected.includes(s.id) ? s.stock : null,
    }));
  const publicSkills = data.skills.map((s) => {
    const m = data.mechanics.find((m) => m.id === s.mechanicId);
    return { ...s, parameters: m?.parameters, code: m?.code };
  });
  return {
    tick: world.tick,
    self: { id: actor.id, name: actor.name, position: actor.position },
    settings: world.settings,
    goal: 'Remain healthy and survive through changing resource conditions.',
    vitals: data.vitals[agentId],
    knowledge: data.knowledge[agentId],
    resources,
    sites,
    terrain,
    visibleAgents: world.agents
      .filter((a) => a.id !== agentId && visible(a.position))
      .map((a) => ({ id: a.id, name: a.name, position: a.position })),
    publicSkills,
    experience: {
      knownTypes: data.types.filter((t) => known.has(t.id)),
      visited: memory.visited,
      discovered: memory.discovered,
    },
    recentFeedback: run.frames
      .slice(-8)
      .flatMap(
        (f) =>
          f.evolution?.events.filter((e) => e.action.agentId === agentId) ?? [],
      ),
    previousProgram: cursor.active,
    interruption: cursor.interruption,
    remainingRounds: 120 - world.tick,
    remainingCalls: 60 - cursor.calls,
    maxPlanRounds: Math.min(12, 120 - world.tick),
  };
}
export function worldEvolutionInput(
  run: EvolutionRun,
  previousFailure: string | null = null,
) {
  const world = lastEvolutionFrame(run),
    data = evolutionData(world);
  return {
    tick: world.tick,
    era: 'primitive',
    rules: EVOLUTION_CONFIG,
    terrainLegend:
      'F forest; G grassland; W river; B bank; R rocky; M damp; S shallow',
    environment: {
      seed: data.seed,
      terrain: data.terrain,
      types: data.types,
      sites: data.sites,
      stacks: data.stacks,
      ecology: data.ecology,
    },
    mechanics: data.mechanics,
    skills: data.skills,
    requests: evolutionActions(run)
      .filter(
        (a) => a.type === 'learn' && (data.vitals[a.agentId]?.health ?? 0) > 0,
      )
      .map((a) => ({
        agentId: a.agentId,
        request: a.type === 'learn' ? a.request : null,
        applicant: ordinaryEvolutionInput(run, a.agentId),
      })),
    previousFailure,
  };
}
export type OrdinaryEvolutionInput = ReturnType<typeof ordinaryEvolutionInput>;
export type WorldEvolutionInput = ReturnType<typeof worldEvolutionInput>;
