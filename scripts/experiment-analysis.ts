import { isDeepStrictEqual } from 'node:util';
import type { WorldState } from '@self-evolving-world/world-core';
import type { RandomRun } from '../apps/simulator/src/random-run.js';

function requireInvariant(
  condition: boolean,
  name: string,
  tick: number,
): void {
  if (!condition)
    throw new Error(`Invariant failed at tick ${String(tick)}: ${name}`);
}

function deepFrozen(value: unknown): boolean {
  return (
    value === null ||
    typeof value !== 'object' ||
    (Object.isFrozen(value) && Object.values(value).every(deepFrozen))
  );
}

/** Shared snapshot checks do not replay or trust transition outcomes. */
export function checkSnapshot(
  state: WorldState,
  initial: WorldState,
  tick: number,
): void {
  const check = (condition: boolean, name: string): void => {
    requireInvariant(condition, name, tick);
  };
  const catalogue = initial.items
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  check(state.tick === tick, 'sequential ticks');
  check(deepFrozen(state), 'deeply immutable snapshots');
  check(
    isDeepStrictEqual(state.rules, initial.rules) &&
      isDeepStrictEqual(state.settings, initial.settings),
    'fixed rules and settings',
  );
  check(
    isDeepStrictEqual(
      state.agents.map(({ id, name }) => ({ id, name })),
      initial.agents.map(({ id, name }) => ({ id, name })),
    ),
    'stable population',
  );
  check(
    new Set(
      state.agents.map(
        ({ position }) => `${String(position.x)},${String(position.y)}`,
      ),
    ).size === state.agents.length,
    'unique occupancy',
  );
  for (const entity of [...state.agents, ...state.items]) {
    const { x, y } = entity.position;
    check(
      Number.isInteger(x) &&
        Number.isInteger(y) &&
        x >= 0 &&
        x < state.settings.width &&
        y >= 0 &&
        y < state.settings.height,
      'bounded positions',
    );
  }
  const owned = [
    ...state.items,
    ...state.agents.flatMap((agent) => agent.inventory),
  ]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  check(
    isDeepStrictEqual(owned, catalogue),
    'item conservation and unique ownership',
  );
  const observations = state.agents.map((self) => {
    const visible = (entity: { position: { x: number; y: number } }): boolean =>
      (entity.position.x - self.position.x) ** 2 +
        (entity.position.y - self.position.y) ** 2 <=
      state.settings.visionRadius ** 2;
    return {
      tick,
      self,
      agents: state.agents
        .filter((agent) => agent.id !== self.id && visible(agent))
        .map(({ id, name, position }) => ({ id, name, position })),
      items: state.items.filter(visible),
    };
  });
  check(
    isDeepStrictEqual(state.observations, observations),
    'accurate private observations',
  );
}

/** Independently inspect every snapshot, including observation contents and rejected transitions. */
export function analyzeRun(run: RandomRun) {
  const initial = run.frames[0];
  const final = run.frames.at(-1);
  if (!initial || !final || run.frames.length !== run.replay.actions.length + 1)
    throw new Error('Incomplete simulation frames.');
  const catalogue = initial.items
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const outcomes: Record<string, number> = {};
  const actions = { move: 0, pickup: 0, try: 0 };
  for (const [tick, state] of run.frames.entries()) {
    const check = (condition: boolean, name: string): void => {
      requireInvariant(condition, name, tick);
    };
    checkSnapshot(state, initial, tick);
    const previous = run.frames[tick - 1];
    if (previous) {
      const event = state.event;
      if (!event) throw new Error(`Missing event at tick ${String(tick)}.`);
      check(
        event.tick === tick &&
          isDeepStrictEqual(event.action, run.replay.actions[tick - 1]),
        'matching action events',
      );
      outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      actions[event.action.type]++;
      if (event.outcome !== 'moved' && event.outcome !== 'picked-up')
        check(
          isDeepStrictEqual(state.agents, previous.agents) &&
            isDeepStrictEqual(state.items, previous.items),
          'rejections preserve positions and ownership',
        );
      if (event.outcome === 'moved') {
        for (const [index, agent] of state.agents.entries()) {
          const before = previous.agents[index];
          if (!before) throw new Error('Agent disappeared.');
          const distance =
            Math.abs(before.position.x - agent.position.x) +
            Math.abs(before.position.y - agent.position.y);
          check(
            distance === (agent.id === event.action.agentId ? 1 : 0),
            'one-cell movement for the actor only',
          );
          check(
            isDeepStrictEqual(before.inventory, agent.inventory),
            'movement preserves inventory',
          );
        }
        check(
          isDeepStrictEqual(state.items, previous.items),
          'movement preserves ground items',
        );
      }
      if (event.outcome === 'picked-up') {
        const action = event.action;
        if (action.type !== 'pickup')
          throw new Error('Pickup result has the wrong action.');
        const item = previous.items.find((entry) => entry.id === action.itemId);
        const actor = previous.agents.find(
          (entry) => entry.id === action.agentId,
        );
        check(
          item !== undefined &&
            actor !== undefined &&
            isDeepStrictEqual(item.position, actor.position),
          'same-cell pickup',
        );
        check(
          state.items.length === previous.items.length - 1,
          'one ground item transferred',
        );
        check(
          isDeepStrictEqual(
            state.agents.map((agent) => agent.position),
            previous.agents.map((agent) => agent.position),
          ),
          'pickup preserves positions',
        );
        check(
          state.agents
            .find((agent) => agent.id === action.agentId)
            ?.inventory.some((entry) => entry.id === action.itemId) === true,
          'pickup reaches the acting inventory',
        );
      }
    }
  }
  const successfulActions =
    (outcomes.moved ?? 0) + (outcomes['picked-up'] ?? 0);
  return {
    status: 'completed',
    steps: final.tick,
    framesChecked: run.frames.length,
    invariantFailures: 0,
    externalModelCalls: 0,
    actions,
    outcomes,
    successfulActions,
    expectedRejections: final.tick - successfulActions,
    groundItems: final.items.length,
    collectedItems: catalogue.length - final.items.length,
    agents: final.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      turns: run.replay.actions.filter((action) => action.agentId === agent.id)
        .length,
      finalPosition: agent.position,
      inventory: agent.inventory,
      visitedCells: new Set(
        run.frames.flatMap((frame) =>
          frame.agents
            .filter((entry) => entry.id === agent.id)
            .map(
              ({ position }) => `${String(position.x)},${String(position.y)}`,
            ),
        ),
      ).size,
    })),
    events: run.frames.slice(1).map((frame) => frame.event),
    finalState: final,
  };
}

export type RunResults = ReturnType<typeof analyzeRun>;

export function experimentReport(
  id: string,
  objective: string,
  seed: number,
  results: RunResults,
): string {
  return `# ${id}: Offline Random World Experiment\n\n## Objective\n\n${objective}\n\n## Method\n\n- Foundation: version 1, 16 x 12 cells, vision radius 4, Lin/Moss/Sol and six original items.\n- Seed: ${String(seed)}; generator: xorshift32; policy: xorshift32-observation-v1.\n- Schedule: Lin, Moss, Sol in round-robin order for ${String(results.steps)} total actions.\n- Selection: 80% move (uniform cardinal direction), 10% pickup, 10% try.\n- Pickup: choose uniformly among same-cell observed items, otherwise visible items; use unseen-item when none are visible.\n- Try: choose uniformly among fly, plant and trade. Rejections are recorded without retries.\n- No external agent, model, credentials or inference service is connected.\n\n## Results\n\n- Run status: ${results.status}.\n- Actions completed: ${String(results.steps)}; snapshots checked: ${String(results.framesChecked)}.\n- Invariant failures: ${String(results.invariantFailures)}; external model calls: 0.\n- State-changing actions: ${String(results.successfulActions)}; expected rejected outcomes: ${String(results.expectedRejections)}.\n- Ground items: ${String(results.groundItems)}; collected items: ${String(results.collectedItems)}; conserved total: 6.\n\n### Action counts\n\n${Object.entries(
    results.actions,
  )
    .map(([name, count]) => `- ${name}: ${String(count)}.`)
    .join('\n')}\n\n### Outcome counts\n\n${Object.entries(results.outcomes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `- ${name}: ${String(count)}.`)
    .join(
      '\n',
    )}\n\n### Agent results\n\n${results.agents.map((agent) => `- ${agent.name}: ${String(agent.turns)} turns; ${String(agent.visitedCells)} visited cells; final position (${String(agent.finalPosition.x)}, ${String(agent.finalPosition.y)}); inventory: ${agent.inventory.map((item) => item.name).join(', ') || 'empty'}.`).join('\n')}\n\n## Visual results\n\n![Trajectories and measured outcomes](overview.png)\n\n![Initial state in the real viewer](initial.png)\n\n![Intermediate replay state in the real viewer](midpoint.png)\n\n![Final state in the real viewer](final.png)\n\n[Vector chart](overview.svg), [replay](replay.json), [full results](results.json), [browser checks](browser.json), [configuration and artifact hashes](manifest.json). Import replay.json into the observatory to play or seek all frames.\n\n## Interpretation and limitations\n\nThe bounded run completed with no detected invariant failures. Boundary collisions, occupied cells, unavailable skills and rejected pickups are normal rule outcomes, not runtime crashes. Checks cover all snapshots, fixed settings and rules, occupancy, item conservation, observation privacy, and transition effects. The artifact validator also recomputes the seeded policy and compares results with replay.\n\nThis is one seeded random walk, not intelligent planning or evidence of autonomous skill evolution. Action probabilities are configured weights, not guaranteed realized proportions. Missing outcome categories were not exercised in this run; regression tests cover additional rule cases. Browser capture checks import, positions, inventories, seeking, playback, export invariance, rendering and resource health. Human or Codex visual review remains required by the task gate.\n`;
}

export function experimentChart(
  id: string,
  run: Pick<RandomRun, 'frames'>,
  results: RunResults,
): string {
  const colors = ['#176b8a', '#ac4d32', '#6a50a7'];
  const grid =
    Array.from(
      { length: 17 },
      (_, x) => `<path d="M${String(70 + x * 32)} 150v384"/>`,
    ).join('') +
    Array.from(
      { length: 13 },
      (_, y) => `<path d="M70 ${String(150 + y * 32)}h512"/>`,
    ).join('');
  const lines = results.agents
    .map((agent, index) => {
      const color = colors[index] ?? '#333';
      const points = run.frames
        .map(
          (state) =>
            state.agents.find((entry) => entry.id === agent.id)?.position,
        )
        .filter((position) => position !== undefined);
      const last = points.at(-1);
      if (!last) throw new Error('No trajectory.');
      return `<polyline points="${points.map(({ x, y }) => `${String(86 + x * 32)},${String(166 + y * 32)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" opacity="0.65"/><circle cx="${String(86 + last.x * 32)}" cy="${String(166 + last.y * 32)}" r="10" fill="${color}"/><text x="${String(86 + last.x * 32)}" y="${String(170 + last.y * 32)}" text-anchor="middle" fill="white" font-size="12">${agent.name.slice(0, 1)}</text><text x="${String(70 + index * 180)}" y="575" fill="${color}" font-size="18">${agent.name}: ${String(agent.visitedCells)} cells</text>`;
    })
    .join('');
  const bars = Object.entries(results.outcomes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, count], index) =>
        `<text x="650" y="${String(175 + index * 56)}" font-size="16">${name}: ${String(count)}</text><rect x="650" y="${String(185 + index * 56)}" width="${String((430 * count) / results.steps)}" height="14" rx="3" fill="#176b8a"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="680" viewBox="0 0 1160 680" role="img" aria-label="${id} measured trajectories and action outcomes"><rect width="1160" height="680" fill="#f7f5ef"/><g font-family="Arial, sans-serif" fill="#202c35"><text x="55" y="55" font-size="30" font-weight="bold">${id.toUpperCase()} / Random world run</text><text x="55" y="88" font-size="18">${String(results.steps)} actions · ${String(results.framesChecked)} checked states · 0 invariant failures · 0 model calls</text><text x="70" y="130" font-size="18">Agent paths / final positions</text><text x="650" y="130" font-size="18">Measured action outcomes</text><g stroke="#d5d9d7" stroke-width="1">${grid}</g>${lines}${bars}<text x="55" y="628" font-size="16">World: 16 × 12 · Origin: top left · Item conservation: ${String(results.groundItems)} ground + ${String(results.collectedItems)} carried = 6</text><text x="55" y="653" font-size="14">Paths may overlap across time; simultaneous occupancy remains unique. Rejected actions are expected rule outcomes.</text></g></svg>\n`;
}
