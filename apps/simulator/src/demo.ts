import { createWorld, stepWorld } from '@self-evolving-world/world-core';
import type { WorldState } from '@self-evolving-world/world-core';

/** Scripted actions, not an autonomous decision maker. */
export function runDemo(): readonly WorldState[] {
  let state = createWorld({
    agents: [{ id: 'explorer', name: 'Explorer', position: { x: 2, y: 3 } }],
    items: [{ id: 'wood', name: 'Wood', position: { x: 3, y: 3 } }],
  });
  const history = [state];
  const actions = [
    { type: 'move', agentId: 'explorer', direction: 'east' },
    { type: 'pickup', agentId: 'explorer', itemId: 'wood' },
    { type: 'try', agentId: 'explorer', skill: 'fly' },
  ] as const;
  for (const action of actions) {
    state = stepWorld(state, action);
    history.push(state);
  }
  return Object.freeze(history);
}
