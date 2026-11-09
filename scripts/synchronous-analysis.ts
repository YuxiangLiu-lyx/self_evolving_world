import { isDeepStrictEqual } from 'node:util';
import type { SynchronousRun } from '../apps/simulator/src/synchronous-run.js';
import {
  checkSnapshot,
  experimentChart,
  experimentReport,
} from './experiment-analysis.js';

/** Validate each actor against the round-start snapshot, independently of the core reducer. */
export function analyzeSynchronousRun(run: SynchronousRun) {
  const initial = run.frames[0];
  const final = run.frames.at(-1);
  if (!initial || !final || run.frames.length !== run.replay.rounds.length + 1)
    throw new Error('Incomplete synchronous frames.');
  const outcomes: Record<string, number> = {};
  const actions = { move: 0, pickup: 0, try: 0 };
  const deltas = {
    north: [0, -1],
    east: [1, 0],
    south: [0, 1],
    west: [-1, 0],
  } as const;
  for (const [tick, state] of run.frames.entries()) {
    checkSnapshot(state, initial, tick);
    if (tick === 0) continue;
    const previous = run.frames[tick - 1];
    const batch = run.replay.rounds[tick - 1];
    const events = state.events;
    const check = (condition: boolean, name: string): void => {
      if (!condition)
        throw new Error(`Round ${String(tick)} invariant failed: ${name}`);
    };
    if (!previous || !batch || !events) throw new Error('Missing round data.');
    check(
      state.event === null &&
        events.length === initial.agents.length &&
        batch.length === events.length,
      'one event per actor in one frame',
    );
    check(
      new Set(batch.map((action) => action.agentId)).size ===
        initial.agents.length,
      'exactly one action per actor',
    );
    const targets = batch.map((action) => {
      const actor = previous.agents.find(({ id }) => id === action.agentId);
      if (!actor || action.type !== 'move') return undefined;
      const [dx, dy] = deltas[action.direction];
      return { x: actor.position.x + dx, y: actor.position.y + dy };
    });
    const collected = new Set<string>();
    for (const [index, actor] of previous.agents.entries()) {
      const event = events[index];
      const next = state.agents[index];
      const actionIndex = batch.findIndex(
        (action) => action.agentId === actor.id,
      );
      const action = batch[actionIndex];
      if (!event || !next || !action)
        throw new Error('Missing actor action or event.');
      check(
        event.tick === tick && isDeepStrictEqual(event.action, action),
        'matching round event',
      );
      check(action.type !== 'try', 'no learning attempts');
      actions[action.type]++;
      outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      if (action.type === 'move') {
        const target = targets[actionIndex];
        if (!target) throw new Error('Missing movement target.');
        const bounded =
          target.x >= 0 &&
          target.x < state.settings.width &&
          target.y >= 0 &&
          target.y < state.settings.height;
        const occupied =
          previous.agents.some((agent) =>
            isDeepStrictEqual(agent.position, target),
          ) ||
          targets.filter((entry) => isDeepStrictEqual(entry, target)).length >
            1;
        const expected = !bounded
          ? 'out-of-bounds'
          : occupied
            ? 'occupied'
            : 'moved';
        check(event.outcome === expected, 'simultaneous movement outcome');
        check(
          isDeepStrictEqual(
            next.position,
            expected === 'moved' ? target : actor.position,
          ),
          'simultaneous destination',
        );
        check(
          isDeepStrictEqual(next.inventory, actor.inventory),
          'movement preserves inventory',
        );
      } else if (action.type === 'pickup') {
        const item = previous.items.find(({ id }) => id === action.itemId);
        if (!item)
          throw new Error('Collection policy requested a missing item.');
        check(
          isDeepStrictEqual(item.position, actor.position),
          'policy only picks up same-cell items',
        );
        check(event.outcome === 'picked-up', 'valid pickup succeeds');
        check(
          isDeepStrictEqual(next.position, actor.position),
          'pickup preserves position',
        );
        check(
          isDeepStrictEqual(next.inventory, [
            ...actor.inventory,
            { id: item.id, name: item.name },
          ]),
          'pickup transfers exactly one item',
        );
        collected.add(item.id);
      }
    }
    check(
      isDeepStrictEqual(
        state.items,
        previous.items.filter(({ id }) => !collected.has(id)),
      ),
      'exact ground item transfers',
    );
  }
  const totalActions = run.replay.rounds.flat().length;
  const successfulActions =
    (outcomes.moved ?? 0) + (outcomes['picked-up'] ?? 0);
  if (actions.pickup === 0 || (outcomes['picked-up'] ?? 0) === 0)
    throw new Error(
      'Collection experiment must demonstrate a successful pickup.',
    );
  return {
    status: 'completed',
    steps: final.tick,
    rounds: final.tick,
    totalActions,
    framesChecked: run.frames.length,
    invariantFailures: 0,
    externalModelCalls: 0,
    actions,
    outcomes,
    successfulActions,
    expectedRejections: totalActions - successfulActions,
    groundItems: final.items.length,
    collectedItems: initial.items.length - final.items.length,
    agents: final.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      turns: run.replay.rounds.length,
      finalPosition: agent.position,
      inventory: agent.inventory,
      visitedCells: new Set(
        run.frames.map((frame) => {
          const position = frame.agents.find(
            ({ id }) => id === agent.id,
          )?.position;
          return JSON.stringify(position);
        }),
      ).size,
    })),
    events: run.frames.slice(1).flatMap((frame) => frame.events ?? []),
    finalState: final,
  };
}
export type SynchronousResults = ReturnType<typeof analyzeSynchronousRun>;

export function synchronousReport(
  id: string,
  objective: string,
  seed: number,
  results: SynchronousResults,
): string {
  // Reuse the measured tables and artifact links; the method and interpretation are version-specific.
  const legacy = experimentReport(id, objective, seed, results);
  const tables = legacy.slice(
    legacy.indexOf('### Action counts'),
    legacy.indexOf('## Interpretation and limitations'),
  );
  return `# ${id}: Synchronous Collection Experiment

## Objective

${objective}

## Method

- Foundation: version 1, 16 x 12 cells, vision radius 4, Lin/Moss/Sol and six original items.
- Seed: ${String(seed)}; generator: xorshift32; policy: xorshift32-collection-v2.
- Schedule: simultaneous-v1. Each agent chooses from its own round-start observation; all outcomes commit together. No intermediate agent turns appear in the replay.
- Select a same-cell item uniformly and always pick it up. Otherwise, with a visible item, use 65% attraction toward a nearest visible item (random ties and reducing directions) and 35% uniform cardinal exploration. Without visible items, explore uniformly.
- Initially occupied destinations are blocked, even if that occupant also moves. All agents competing for the same destination stay put. No swaps, priority advantage or retry.
- No try actions, learning attempts, external agents, models or inference services.
- Replay version 2 preserves rounds explicitly. The ex1 archive and version-1 sequential replay semantics remain unchanged.

## Results

- Run status: ${results.status}.
- Rounds: ${String(results.rounds)}; total actions: ${String(results.totalActions)}; snapshots checked: ${String(results.framesChecked)}.
- Invariant failures: ${String(results.invariantFailures)}; external model calls: 0.
- State-changing actions: ${String(results.successfulActions)}; expected rejected outcomes: ${String(results.expectedRejections)}.
- Successful pickups: ${String(results.outcomes['picked-up'] ?? 0)}; learning attempts: 0.
- Ground items: ${String(results.groundItems)}; collected items: ${String(results.collectedItems)}; conserved total: 6.

${tables}## Interpretation and limitations

Every snapshot passed bounds, occupancy, immutable settings/rules, population, item conservation and private-observation checks. Independent round checks verify all actor actions, destinations, collisions and inventory transfers against the same starting snapshot. Saved artifacts must match a complete seeded reconstruction, browser checks and content hashes.

This run demonstrates simultaneous scheduling and successful collection, not intelligent planning or learning. Attraction is a fixed local heuristic; action probabilities do not guarantee realized proportions or full collection for every seed. Boundary and collision rejections are normal rule outcomes. Conservative collision handling may cause temporary congestion. ex1 used 480 sequential actions including unavailable-skill attempts; compare total actions, not its tick count, with this run. Browser evidence records the current viewer; actual visual review remains a separate required gate.
`;
}

export function synchronousChart(
  id: string,
  run: SynchronousRun,
  results: SynchronousResults,
): string {
  return experimentChart(id, run, { ...results, steps: results.totalActions })
    .replace('Random world run', 'Synchronous collection')
    .replace(
      `${String(results.totalActions)} actions ·`,
      `${String(results.rounds)} rounds / ${String(results.totalActions)} actions ·`,
    );
}
