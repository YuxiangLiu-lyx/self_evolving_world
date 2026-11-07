import {
  createWorld,
  parseWorldAction,
  stepWorld,
} from '@self-evolving-world/world-core';
import type {
  Observation,
  WorldAction,
  WorldSettings,
  WorldState,
} from '@self-evolving-world/world-core';
import { record, string } from './remote-data.js';

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

export interface DecisionInput {
  readonly observation: Observation;
  readonly settings: WorldSettings;
  readonly rules: WorldState['rules'];
}
export interface ModelDecision {
  readonly text: string;
  readonly responseId: string;
  readonly responseFormat?: 'sse' | 'json';
}
export type DecisionProvider = (input: DecisionInput) => Promise<ModelDecision>;

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    throw new Error('Decision has unexpected or missing fields.');
}

export function parseDecision(
  text: string,
  agentId: string,
): { action: WorldAction; summary: string } {
  const decision = record(JSON.parse(text) as unknown);
  exactKeys(decision, ['action', 'summary']);
  const action = record(decision.action);
  const fields =
    action.type === 'move'
      ? ['type', 'direction']
      : action.type === 'pickup'
        ? ['type', 'itemId']
        : ['type', 'skill'];
  exactKeys(action, fields);
  const summary = string(decision.summary, 'decision summary').trim();
  if (summary.length === 0 || summary.length > 240)
    throw new Error('Decision summary exceeds its limits.');
  return { action: parseWorldAction({ ...action, agentId }), summary };
}

export interface DecisionRecord {
  readonly agentId: string;
  readonly observedTick: number;
  readonly status: 'applied' | 'failed';
  readonly responseId?: string;
  readonly responseFormat?: 'sse' | 'json';
  readonly action?: WorldAction;
  readonly summary?: string;
  readonly outcome?: string;
  readonly error?: string;
}
export interface ExperimentResult {
  readonly decisions: readonly DecisionRecord[];
  readonly finalState: WorldState;
  readonly replay: {
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
  };
}

/** Exactly one provider invocation per agent; all see tick 0, then actions apply in fixed order. */
export async function runOneRound(
  provider: DecisionProvider,
): Promise<ExperimentResult> {
  const initial = experimentWorld();
  let state = initial;
  const decisions: DecisionRecord[] = [];
  const actions: WorldAction[] = [];
  for (const observation of initial.observations) {
    let responseId: string | undefined;
    try {
      const answer = await provider({
        observation,
        settings: initial.settings,
        rules: initial.rules,
      });
      responseId = answer.responseId;
      const decision = parseDecision(answer.text, observation.self.id);
      state = stepWorld(state, decision.action);
      actions.push(decision.action);
      decisions.push({
        agentId: observation.self.id,
        observedTick: observation.tick,
        status: 'applied',
        responseId,
        ...(answer.responseFormat
          ? { responseFormat: answer.responseFormat }
          : {}),
        ...decision,
        outcome: state.event?.outcome ?? 'unavailable',
      });
    } catch (error) {
      decisions.push({
        agentId: observation.self.id,
        observedTick: observation.tick,
        status: 'failed',
        ...(responseId ? { responseId } : {}),
        error: error instanceof Error ? error.message : 'Decision failed.',
      });
    }
  }
  return {
    decisions,
    finalState: state,
    replay: {
      format: 'self-evolving-world/replay',
      version: 1,
      coreVersion: '1',
      initial: {
        settings: initial.settings,
        agents: initial.agents.map(({ id, name, position }) => ({
          id,
          name,
          position,
        })),
        items: initial.items,
      },
      actions,
    },
  };
}
