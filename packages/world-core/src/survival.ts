import { createWorld, parseWorldAction, resolveRound } from './world.js';
import type {
  SurvivalAction,
  SurvivalConfig,
  SurvivalEvent,
  VitalSigns,
  WorldAction,
  WorldSetup,
  WorldState,
} from './world.js';

export const MILD_SURVIVAL: SurvivalConfig = Object.freeze({
  version: 'survival-v1',
  temperature: 22,
  satietyLoss: 0.5,
  exposureRate: 2,
  recoveryRate: 1,
  damage: 2,
  initial: Object.freeze({ satiety: 100, cold: 0, heat: 0, health: 100 }),
});

function bounded(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new RangeError('Invalid survival parameter.');
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('Expected survival object.');
  return value as Record<string, unknown>;
}
export function parseSurvivalConfig(input: unknown): SurvivalConfig {
  const value = object(input),
    initial = object(value.initial);
  if (value.version !== 'survival-v1')
    throw new RangeError('Unsupported survival version.');
  return Object.freeze({
    version: 'survival-v1',
    temperature: bounded(value.temperature, -50, 60),
    satietyLoss: bounded(value.satietyLoss, 0, 10),
    exposureRate: bounded(value.exposureRate, 0, 10),
    recoveryRate: bounded(value.recoveryRate, 0, 10),
    damage: bounded(value.damage, 1, 100),
    initial: Object.freeze({
      satiety: bounded(initial.satiety, 0, 100),
      cold: bounded(initial.cold, 0, 100),
      heat: bounded(initial.heat, 0, 100),
      health: bounded(initial.health, 0, 100),
    }),
  });
}
export function createSurvivalWorld(
  setup: WorldSetup,
  input: SurvivalConfig = MILD_SURVIVAL,
): WorldState {
  const world = createWorld(setup),
    config = parseSurvivalConfig(input);
  if (world.agents.length === 0)
    throw new RangeError('Survival requires at least one actor.');
  return Object.freeze({
    ...world,
    survival: Object.freeze({
      config,
      vitals: Object.freeze(
        Object.fromEntries(world.agents.map(({ id }) => [id, config.initial])),
      ),
      events: Object.freeze([]),
    }),
  });
}
export function parseSurvivalAction(input: unknown): SurvivalAction {
  const action = object(input);
  if (action.type !== 'wait' && action.type !== 'learn')
    return parseWorldAction(input);
  if (
    typeof action.agentId !== 'string' ||
    !action.agentId.trim() ||
    action.agentId.length > 80
  )
    throw new RangeError('Invalid survival actor.');
  if (action.type === 'wait')
    return Object.freeze({ type: 'wait', agentId: action.agentId.trim() });
  if (
    typeof action.skill !== 'string' ||
    !action.skill.trim() ||
    action.skill.length > 80
  )
    throw new RangeError('Invalid learning request.');
  return Object.freeze({
    type: 'learn',
    agentId: action.agentId.trim(),
    skill: action.skill.trim(),
  });
}
const clamp = (value: number) =>
  Math.round(Math.max(0, Math.min(100, value)) * 1000) / 1000;
/** Exposure updates precede damage. Health zero is absorbing; death has no recovery. */
function decay(v: VitalSigns, c: SurvivalConfig): VitalSigns {
  if (v.health === 0) return v;
  const satiety = clamp(v.satiety - c.satietyLoss);
  const cold = clamp(
    v.cold + (c.temperature < 10 ? c.exposureRate : -c.recoveryRate),
  );
  const heat = clamp(
    v.heat + (c.temperature > 30 ? c.exposureRate : -c.recoveryRate),
  );
  const hazards =
    Number(satiety < 20) + Number(cold >= 70) + Number(heat >= 70);
  return Object.freeze({
    satiety,
    cold,
    heat,
    health: clamp(v.health - hazards * c.damage),
  });
}
/** All living actors act from round-start state; dead bodies retain cells and inventory. */
export function stepSurvivalRound(
  state: WorldState,
  inputs: readonly SurvivalAction[],
): WorldState {
  const survival = state.survival;
  if (!survival) throw new RangeError('This world has no survival extension.');
  const actions = inputs.map(parseSurvivalAction);
  if (
    actions.length !== state.agents.length ||
    new Set(actions.map((a) => a.agentId)).size !== state.agents.length ||
    actions.some((a) => !state.agents.some((actor) => actor.id === a.agentId))
  )
    throw new RangeError('Survival needs one intent per known actor.');
  const base = actions.filter(
    (action): action is WorldAction =>
      survival.vitals[action.agentId]?.health !== 0 &&
      action.type !== 'wait' &&
      action.type !== 'learn',
  );
  const next = resolveRound(state, base);
  const events = state.agents.map(({ id }): SurvivalEvent => {
    const action = actions.find((a) => a.agentId === id);
    if (!action) throw new RangeError('Missing survival intent.');
    const outcome =
      survival.vitals[id]?.health === 0
        ? 'dead'
        : action.type === 'wait'
          ? 'waited'
          : action.type === 'learn'
            ? 'learning-denied'
            : next.events?.find((e) => e.action.agentId === id)?.outcome;
    if (!outcome) throw new RangeError('Missing survival outcome.');
    return Object.freeze({ tick: next.tick, action, outcome });
  });
  return Object.freeze({
    ...next,
    survival: Object.freeze({
      config: survival.config,
      vitals: Object.freeze(
        Object.fromEntries(
          state.agents.map(({ id }) => {
            const vital = survival.vitals[id];
            if (!vital) throw new RangeError('Missing vital signs.');
            return [id, decay(vital, survival.config)];
          }),
        ),
      ),
      events: Object.freeze(events),
    }),
  });
}
