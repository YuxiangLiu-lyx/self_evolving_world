import { createWorld } from '@self-evolving-world/world-core';
import type {
  WorldAction,
  WorldSettings,
  WorldState,
} from '@self-evolving-world/world-core';

/** A separate application fixture matching the fixed version-1 foundation. */
export function experimentWorld(): WorldState {
  return createWorld({
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
  });
}

export interface ModelDecision {
  readonly text: string;
  readonly responseId: string;
  readonly responseFormat?: 'sse' | 'json';
}
/** The version-1 founding replay format produced by the seeded random run. */
export interface ExperimentReplay {
  readonly format: 'self-evolving-world/replay';
  readonly version: 1;
  readonly coreVersion: '1';
  readonly initial: {
    readonly settings: WorldSettings;
    readonly agents: readonly {
      readonly id: string;
      readonly name: string;
      readonly position: { readonly x: number; readonly y: number };
    }[];
    readonly items: WorldState['items'];
  };
  readonly actions: readonly WorldAction[];
}
