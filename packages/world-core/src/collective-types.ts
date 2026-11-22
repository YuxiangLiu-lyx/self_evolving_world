import type { V7Point, V7Knowledge } from './continuous-types.js';

export type {
  CollectivePolicy,
  CollectiveMember,
  CollectiveIntent,
} from './collective-policy.js';
export interface CollectiveGroup {
  id: string;
  name: string;
  meeting: V7Point;
  members: string[];
}
export interface CollectiveReport {
  actor: string;
  tick: number;
  position: V7Point;
  text: string;
  facts: V7Knowledge[];
  knownAbilities: string[];
  inventory: { resource: string; quantity: number }[];
}
export interface CollectiveProposal {
  id: string;
  member: string;
  goal: string;
  reason: string;
  next: string;
  pause: string;
}
export interface CollectiveCoordination {
  group: string;
  tick: number;
  summary: string;
  proposals: CollectiveProposal[];
}
export interface CollectiveShared {
  group: CollectiveGroup;
  reports: CollectiveReport[];
  board: CollectiveCoordination | null;
}
