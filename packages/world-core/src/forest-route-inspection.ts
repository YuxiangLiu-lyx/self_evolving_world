import type { V7Actor, V7Package, V7World } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7NavigationTarget } from './continuous-navigation-target.js';
import { forestRoute, forestRouteData } from './forest-routing.js';
import { forestEvent } from './forest-environment.js';

function cancel(world: V7World, actor: V7Actor) {
  if (!actor.extensionState['route:pending']) return;
  delete actor.extensionState['route:pending'];
  forestEvent(
    world,
    'route-inspection-failed',
    'Death cancelled pending route inspection; spent effort is not refunded.',
    actor.position,
    actor.id,
    { reasonCode: 'performer-died' },
  );
  const event = world.events.at(-1);
  if (event) event.interface = 'inspect-route';
}
export const FOREST_ROUTE_INSPECTION: V7Package = {
  id: 'route-inspection',
  version: 1,
  dependencies: ['shelter-construction@1', 'forest-perception@1'],
  description:
    'Paid observed route diagnosis and versioned continuous corner connections without changing movement costs or geometry.',
  resources: [],
  processes: {},
  visualComponents: [],
  satisfaction: [],
  events: ['route-inspection-completed', 'route-inspection-failed'],
  abilities: [
    {
      id: 'inspect-route',
      name: 'Inspect local route',
      function:
        'Inspect observed route clearance and dated obstruction evidence without moving.',
      equivalence: 'navigation:observed-route-diagnosis',
      parameters: v7ObjectSchema({
        target: { type: 'string', maxLength: 1000 },
        x: { type: 'number' },
        y: { type: 'number' },
      }),
      prerequisites: [],
      learning: 1,
      costs:
        'One round and 0.5 energy, with ordinary metabolism. Use the same target or coordinates as navigate; no movement is performed.',
      effects:
        'Reports verified reachable, proven blocked, or unknown. Observed blocker IDs, signed collision margins, doorway and bounded continuous paths are dated evidence, not a promise about future occupancy. No enjoyment reward, teleportation or movement of others.',
      handler: 'route.inspect@1',
      revision: 'route-inspection@1',
      authored: false,
    },
  ],
  handlers: {
    'route.inspect@1': ({ world, actor, action, work }) => {
      const { goal } = v7NavigationTarget(world, actor, action);
      if (
        !Number.isFinite(goal.x) ||
        !Number.isFinite(goal.y) ||
        goal.x < 0 ||
        goal.y < 0 ||
        goal.x > world.config.width ||
        goal.y > world.config.height
      )
        throw new Error(
          'Inspection coordinates must be finite and within actual world bounds.',
        );
      v7Spend(actor, 0.5);
      actor.extensionState['route:pending'] = forestRouteData(
        forestRoute(world, actor, goal, work),
      );
      return { complete: true, writes: [] };
    },
  },
  migrate: (world) => {
    world.state.forestRouting = 1;
    for (const actor of world.actors)
      actor.extensionState['harness:inspect-route'] = true;
    // The marker makes every subsequent navigation recompute its observation revision; no physical instance is changed.
    return world;
  },
  harness: {
    'inspect-route': (o) => ({
      pending: o.self.extensionState['route:pending'] ?? null,
      lastInspection: o.self.extensionState['route:lastInspection'] ?? null,
      note: 'Dated personal route evidence; current occupancy must be checked again before movement. No diagnostic awards mental satisfaction.',
    }),
  },
  onDeath: cancel,
};
export function routeInspectionAfterRound(world: V7World): void {
  if (world.state.forestRouting !== 1) return;
  for (const actor of world.actors) {
    const raw = actor.extensionState['route:pending'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    delete actor.extensionState['route:pending'];
    actor.extensionState['route:lastInspection'] = raw;
    const code =
      typeof raw.reasonCode === 'string' ? raw.reasonCode : 'unknown';
    const status = typeof raw.status === 'string' ? raw.status : 'unknown';
    forestEvent(
      world,
      'route-inspection-completed',
      `Route inspection: ${status} (${code}). Evidence is local and dated; no reward.`,
      actor.position,
      actor.id,
      raw,
    );
    const event = world.events.at(-1);
    if (event) event.interface = 'inspect-route';
  }
}
