import {
  cBiomeAt,
  coevolutionActions,
  coevolutionData,
  COEVOLUTION_CONFIG,
  isVisible,
  carryingLoad,
  recovery,
  lastCoevolutionFrame,
} from '@self-evolving-world/world-core';
import type { Cell, CoevolutionRun } from '@self-evolving-world/world-core';
export function ordinaryCoevolutionInput(run: CoevolutionRun, agentId: string) {
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world),
    actor = world.agents.find((a) => a.id === agentId),
    cursor = run.cursors[agentId],
    memory = data.memory[agentId];
  if (!actor || !cursor || !memory)
    throw new Error('Missing private coevolution input.');
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
        terrain.push({ x, y, biome: cBiomeAt(data, { x, y }) });
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
    goal: 'Keep healthy, stabilize future supply, reduce repetitive maintenance work, and improve living conditions. Only actual consequences count.',
    energy: data.energy[agentId],
    load: carryingLoad(data, actor.id),
    restRecovery: recovery(data, actor).amount,
    project: cursor.project,
    objects: data.objects
      .filter((o) => o.owner === agentId || (o.position && visible(o.position)))
      .map((o) => ({
        ...o,
        definition: data.blueprints.find((b) => b.id === o.blueprint),
      })),
    jobs: data.jobs.filter((j) =>
      data.objects.some(
        (o) => o.id === j.object && o.position && visible(o.position),
      ),
    ),
    messages: data.messages
      .filter((m) => m.recipient === agentId || m.sender === agentId)
      .slice(-6),
    observedBenefits: data.benefits
      .filter((b) => b.actor === agentId)
      .slice(-8),
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
      visited: memory.visited.slice(-50),
      discovered: memory.discovered.slice(-40),
    },
    recentFeedback: run.frames
      .slice(-8)
      .flatMap(
        (f) =>
          f.coevolution?.events.filter((e) => e.action.agentId === agentId) ??
          [],
      ),
    previousProgram: cursor.active,
    interruption: cursor.interruption,
    remainingRounds: 180 - world.tick,
    remainingCalls: 120 - run.programs.length,
    maxPlanRounds: Math.min(12, 180 - world.tick),
  };
}
export function worldCoevolutionInput(
  run: CoevolutionRun,
  previousFailure: string | null = null,
) {
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world);
  return {
    tick: world.tick,
    era: 'primitive',
    rules: COEVOLUTION_CONFIG,
    terrainLegend:
      'F forest; G grassland; W river; B bank; R rocky; M damp; S shallow',
    environment: {
      seed: data.seed,
      terrain: data.terrain,
      types: data.types,
      sites: data.sites,
      stacks: data.stacks,
      ecology: data.ecology,
      allocations: data.allocations,
      blueprints: data.blueprints,
      objects: data.objects,
    },
    mechanics: data.mechanics,
    skills: data.skills,
    requests: coevolutionActions(run)
      .filter(
        (a) => a.type === 'learn' && (data.vitals[a.agentId]?.health ?? 0) > 0,
      )
      .map((a) => ({
        agentId: a.agentId,
        request: a.type === 'learn' ? a.request : null,
        applicant: ordinaryCoevolutionInput(run, a.agentId),
      })),
    previousFailure,
  };
}
export type OrdinaryCoevolutionInput = ReturnType<
  typeof ordinaryCoevolutionInput
>;
export type WorldCoevolutionInput = ReturnType<typeof worldCoevolutionInput>;
