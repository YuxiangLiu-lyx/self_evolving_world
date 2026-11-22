import type {
  V7World,
  V7Project,
  V7Cursor,
  V7Action,
  V7Review,
  CollectiveCoordination,
  CollectiveIntent,
} from '@self-evolving-world/world-core';
import type { WorldContinuousInput } from './continuous-input.js';
import type {
  V7ProviderResult,
  ContinuousModelInput,
} from './continuous-provider.js';
export interface CollectiveAttention {
  intents: Record<string, CollectiveIntent>;
  lastSlot: Record<string, number>;
  needsSince: Record<string, number>;
  lastDecision: Record<string, number>;
  lastCoordination: Record<string, number>;
  lastPublicAttempt: Record<string, number>;
  pending: CollectiveCoordination[];
  queuedRounds: Record<string, number>;
  maximumWait: number;
}
export interface V7Attempt {
  id: string;
  role: 'ordinary' | 'world';
  actor: string;
  tick: number;
  reason: string;
  status: 'started' | 'accepted' | 'rejected' | 'failed';
  startedAt: string;
  elapsedMs: number | null;
  contextBytes?: number;
  contextCodeUnits?: number;
  reservedTokens?: number;
  usage: V7ProviderResult['usage'];
  error: string | null;
}
export interface V7CallRecord {
  attempt: V7Attempt;
  input: ContinuousModelInput;
  response: V7ProviderResult | null;
  failureEvidence: string;
}
export interface V7DevelopmentAttempt {
  id: string;
  tick: number;
  status: 'started' | 'accepted' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  reason: string | null;
  internalModelCalls: null;
  inputTokens: null;
  outputTokens: null;
}
export interface V7Barrier {
  technicalReason?: string;
  id: string;
  tick: number;
  actions: Record<string, V7Action>;
  requests: Record<string, V7Action>;
  reviews: V7Review[];
  worldAttempts: number;
  errors: string[];
  input: WorldContinuousInput;
  developmentAttempt: string | null;
}
export interface V7Execution {
  version: 7;
  controller: 'chatgpt-plan' | 'isolated-fixture';
  model: string;
  world: V7World;
  cursors: Record<string, V7Cursor>;
  attempts: V7Attempt[];
  developments: V7DevelopmentAttempt[];
  phase: 'running' | 'development' | 'paused' | 'window-complete';
  reason: string | null;
  windowTarget: number;
  barrier: V7Barrier | null;
  pendingCall: {
    id: string;
    input: ContinuousModelInput;
  } | null;
  registrations: string[];
  stages: number[];
  attention?: CollectiveAttention;
  collectiveContinuation?: {
    round: number;
    attempts: number;
    developments: number;
  };
}
export interface V7RoundRecord {
  coordination?: CollectiveCoordination[];
  tick: number;
  before: string;
  after: string;
  actions: Record<string, V7Action>;
  reviews: V7Review[];
  registrations: string[];
  memory: Record<
    string,
    {
      notes: string[];
      preferences: string[];
      intention?: string;
      collectiveIntent?: CollectiveIntent;
      projects?: V7Project[];
    }
  >;
  events: V7World['events'];
  tasks: Record<string, V7Cursor>;
}
export interface V7Sink {
  save(state: V7Execution): Promise<void>;
  call(record: V7CallRecord): Promise<void>;
  findCall(id: string): Promise<V7CallRecord | null>;
  round(record: V7RoundRecord, state: V7Execution): Promise<void>;
  checkpoint(state: V7Execution, reason: string): Promise<void>;
}
