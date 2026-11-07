import type { WorldAction, WorldSetup } from '@self-evolving-world/world-core';
import { appendAction, createTimeline } from './timeline.js';
import type { Timeline } from './timeline.js';

export const DEMO_SETUP: WorldSetup = {
  agents: [
    { id: 'lin', name: 'Lin', position: { x: 2, y: 3 } },
    { id: 'moss', name: 'Moss', position: { x: 8, y: 5 } },
    { id: 'sol', name: 'Sol', position: { x: 12, y: 8 } },
  ],
  items: [
    { id: 'wood', name: 'Wood', position: { x: 3, y: 3 } },
    { id: 'stone', name: 'Stone', position: { x: 5, y: 2 } },
    { id: 'berry', name: 'Berry', position: { x: 8, y: 4 } },
    { id: 'crystal', name: 'Crystal', position: { x: 11, y: 8 } },
    { id: 'seed', name: 'Seed', position: { x: 13, y: 3 } },
    { id: 'water', name: 'Water', position: { x: 3, y: 8 } },
  ],
};

export function createDemoTimeline(): Timeline {
  const actions: readonly WorldAction[] = [
    { type: 'move', agentId: 'lin', direction: 'east' },
    { type: 'pickup', agentId: 'lin', itemId: 'wood' },
    { type: 'try', agentId: 'lin', skill: 'fly' },
    { type: 'move', agentId: 'lin', direction: 'south' },
    { type: 'move', agentId: 'lin', direction: 'east' },
    { type: 'move', agentId: 'moss', direction: 'north' },
    { type: 'pickup', agentId: 'moss', itemId: 'berry' },
    { type: 'move', agentId: 'moss', direction: 'west' },
    { type: 'try', agentId: 'moss', skill: 'plant' },
    { type: 'move', agentId: 'sol', direction: 'west' },
    { type: 'pickup', agentId: 'sol', itemId: 'crystal' },
    { type: 'move', agentId: 'sol', direction: 'north' },
  ];
  return actions.reduce(appendAction, createTimeline(DEMO_SETUP));
}
