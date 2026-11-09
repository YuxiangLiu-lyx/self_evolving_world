/** All base-world rules live here. No I/O, model calls or mutable skill registry. */
export const CORE_RULES = Object.freeze({
  version: '1' as const,
  skills: Object.freeze(['move', 'pickup', 'try'] as const),
  movement: 'one-cardinal-cell' as const,
  pickup: 'same-cell' as const,
  vision: 'euclidean-without-occlusion' as const,
});

export interface Position {
  readonly x: number;
  readonly y: number;
}
export interface WorldSettings {
  readonly width: number;
  readonly height: number;
  readonly visionRadius: number;
}
export const DEFAULT_SETTINGS: WorldSettings = Object.freeze({
  width: 16,
  height: 12,
  visionRadius: 4,
});
export interface Item {
  readonly id: string;
  readonly name: string;
}
export interface GroundItem extends Item {
  readonly position: Position;
}
export interface AgentSeed {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
}
export interface AgentState extends AgentSeed {
  readonly inventory: readonly Item[];
}
export interface WorldSetup {
  readonly settings?: Partial<WorldSettings>;
  readonly agents?: readonly AgentSeed[];
  readonly items?: readonly GroundItem[];
}
export type Direction = 'north' | 'east' | 'south' | 'west';
export type WorldAction =
  | {
      readonly type: 'move';
      readonly agentId: string;
      readonly direction: Direction;
    }
  | {
      readonly type: 'pickup';
      readonly agentId: string;
      readonly itemId: string;
    }
  | { readonly type: 'try'; readonly agentId: string; readonly skill: string };
export type Outcome =
  | 'moved'
  | 'picked-up'
  | 'out-of-bounds'
  | 'occupied'
  | 'item-not-found'
  | 'item-out-of-reach'
  | 'skill-unavailable'
  | 'skill-already-exists';
export interface WorldEvent {
  readonly tick: number;
  readonly action: WorldAction;
  readonly outcome: Outcome;
}
/** Other agents' inventories are private. Perception exposes only their public appearance. */
export interface Observation {
  readonly tick: number;
  readonly self: AgentState;
  readonly agents: readonly AgentSeed[];
  readonly items: readonly GroundItem[];
}
/** Opt-in extension data; version-1 worlds never contain this field. */
export interface VitalSigns {
  readonly satiety: number;
  readonly cold: number;
  readonly heat: number;
  readonly health: number;
}
export interface SurvivalConfig {
  readonly version: 'survival-v1';
  readonly temperature: number;
  readonly satietyLoss: number;
  readonly exposureRate: number;
  readonly recoveryRate: number;
  readonly damage: number;
  readonly initial: VitalSigns;
}
export type SurvivalAction =
  | WorldAction
  | { readonly type: 'wait'; readonly agentId: string }
  | {
      readonly type: 'learn';
      readonly agentId: string;
      readonly skill: string;
    };
export interface SurvivalEvent {
  readonly tick: number;
  readonly action: SurvivalAction;
  readonly outcome: Outcome | 'waited' | 'learning-denied' | 'dead';
}
export interface SurvivalData {
  readonly config: SurvivalConfig;
  readonly vitals: Readonly<Record<string, VitalSigns>>;
  readonly events: readonly SurvivalEvent[];
}
export interface WorldState {
  readonly tick: number;
  readonly rules: typeof CORE_RULES;
  readonly settings: WorldSettings;
  readonly agents: readonly AgentState[];
  readonly items: readonly GroundItem[];
  readonly observations: readonly Observation[];
  readonly event: WorldEvent | null;
  /** Present only for the separately versioned simultaneous-round extension. */
  readonly events?: readonly WorldEvent[];
  readonly survival?: SurvivalData;
}

const DIRECTIONS: Readonly<Record<Direction, Position>> = Object.freeze({
  north: Object.freeze({ x: 0, y: -1 }),
  east: Object.freeze({ x: 1, y: 0 }),
  south: Object.freeze({ x: 0, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
});

function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 80
  ) {
    throw new RangeError(
      `${label} must be a non-empty string of at most 80 characters.`,
    );
  }
  return value.trim();
}
function integer(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${label} must be an integer from ${String(min)} to ${String(max)}.`,
    );
  }
  return value === 0 ? 0 : value;
}
function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
function withinBounds(position: Position, settings: WorldSettings): boolean {
  return (
    position.x >= 0 &&
    position.x < settings.width &&
    position.y >= 0 &&
    position.y < settings.height
  );
}
function copyPosition(position: Position, settings: WorldSettings): Position {
  return Object.freeze({
    x: integer(position.x, 0, settings.width - 1, 'position.x'),
    y: integer(position.y, 0, settings.height - 1, 'position.y'),
  });
}
/** Visibility needs no skill invocation. There are currently no walls or occlusion. */
export function isVisible(
  origin: Position,
  target: Position,
  radius: number,
): boolean {
  return (origin.x - target.x) ** 2 + (origin.y - target.y) ** 2 <= radius ** 2;
}
function snapshot(
  tick: number,
  settings: WorldSettings,
  agents: readonly AgentState[],
  items: readonly GroundItem[],
  event: WorldEvent | null,
): WorldState {
  const observations = agents.map((self): Observation =>
    Object.freeze({
      tick,
      self,
      agents: Object.freeze(
        agents
          .filter(
            (agent) =>
              agent.id !== self.id &&
              isVisible(self.position, agent.position, settings.visionRadius),
          )
          .map((agent) =>
            Object.freeze({
              id: agent.id,
              name: agent.name,
              position: agent.position,
            }),
          ),
      ),
      items: Object.freeze(
        items.filter((item) =>
          isVisible(self.position, item.position, settings.visionRadius),
        ),
      ),
    }),
  );
  return Object.freeze({
    tick,
    rules: CORE_RULES,
    settings,
    agents: Object.freeze([...agents]),
    items: Object.freeze([...items]),
    observations: Object.freeze(observations),
    event,
  });
}
/** Copy initial inputs; subsequent caller mutations cannot change this world. */
export function createWorld(setup: WorldSetup = {}): WorldState {
  const settings = Object.freeze({
    width: integer(
      setup.settings?.width ?? DEFAULT_SETTINGS.width,
      1,
      64,
      'width',
    ),
    height: integer(
      setup.settings?.height ?? DEFAULT_SETTINGS.height,
      1,
      64,
      'height',
    ),
    visionRadius: integer(
      setup.settings?.visionRadius ?? DEFAULT_SETTINGS.visionRadius,
      0,
      64,
      'visionRadius',
    ),
  });
  const seeds = setup.agents ?? [];
  const itemSeeds = setup.items ?? [];
  if (seeds.length > 32 || itemSeeds.length > 256)
    throw new RangeError('A world supports at most 32 agents and 256 items.');
  const ids = new Set<string>();
  const uniqueId = (value: string): string => {
    const id = text(value, 'id');
    if (ids.has(id)) throw new RangeError(`Duplicate entity id: ${id}`);
    ids.add(id);
    return id;
  };
  const agents = seeds.map((seed): AgentState =>
    Object.freeze({
      id: uniqueId(seed.id),
      name: text(seed.name, 'agent.name'),
      position: copyPosition(seed.position, settings),
      inventory: Object.freeze([]),
    }),
  );
  const occupied = new Set(
    agents.map(
      (agent) => `${String(agent.position.x)},${String(agent.position.y)}`,
    ),
  );
  if (occupied.size !== agents.length)
    throw new RangeError('Agents cannot start in the same cell.');
  const items = itemSeeds.map((seed): GroundItem =>
    Object.freeze({
      id: uniqueId(seed.id),
      name: text(seed.name, 'item.name'),
      position: copyPosition(seed.position, settings),
    }),
  );
  return snapshot(0, settings, agents, items, null);
}
/** Validate external commands without trusting TypeScript assertions or imported JSON. */
export function parseWorldAction(input: unknown): WorldAction {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new RangeError('Action must be an object.');
  const value = input as Record<string, unknown>;
  const agentId = text(value.agentId, 'action.agentId');
  switch (value.type) {
    case 'move': {
      const direction = value.direction;
      if (
        direction !== 'north' &&
        direction !== 'east' &&
        direction !== 'south' &&
        direction !== 'west'
      )
        throw new RangeError(
          'Move direction must be north, east, south or west.',
        );
      return Object.freeze({ type: 'move', agentId, direction });
    }
    case 'pickup':
      return Object.freeze({
        type: 'pickup',
        agentId,
        itemId: text(value.itemId, 'action.itemId'),
      });
    case 'try':
      return Object.freeze({
        type: 'try',
        agentId,
        skill: text(value.skill, 'action.skill'),
      });
    default:
      throw new RangeError('Action type must be move, pickup or try.');
  }
}
/** One well-formed command is one tick, even if its outcome is rejected or unavailable. */
export function stepWorld(state: WorldState, input: WorldAction): WorldState {
  integer(state.tick, 0, Number.MAX_SAFE_INTEGER - 1, 'tick');
  const action = parseWorldAction(input);
  const actor = state.agents.find((agent) => agent.id === action.agentId);
  if (actor === undefined)
    throw new RangeError(`Unknown agent: ${action.agentId}`);
  let agents = state.agents;
  let items = state.items;
  let outcome: Outcome;
  switch (action.type) {
    case 'move': {
      const delta = DIRECTIONS[action.direction];
      const target = Object.freeze({
        x: actor.position.x + delta.x,
        y: actor.position.y + delta.y,
      });
      if (!withinBounds(target, state.settings)) outcome = 'out-of-bounds';
      else if (agents.some((agent) => samePosition(agent.position, target)))
        outcome = 'occupied';
      else {
        agents = agents.map((agent) =>
          agent.id === actor.id
            ? Object.freeze({ ...agent, position: target })
            : agent,
        );
        outcome = 'moved';
      }
      break;
    }
    case 'pickup': {
      const item = items.find((candidate) => candidate.id === action.itemId);
      if (item === undefined) outcome = 'item-not-found';
      else if (!samePosition(actor.position, item.position))
        outcome = 'item-out-of-reach';
      else {
        const carried = Object.freeze({ id: item.id, name: item.name });
        agents = agents.map((agent) =>
          agent.id === actor.id
            ? Object.freeze({
                ...agent,
                inventory: Object.freeze([...agent.inventory, carried]),
              })
            : agent,
        );
        items = items.filter((candidate) => candidate.id !== item.id);
        outcome = 'picked-up';
      }
      break;
    }
    case 'try': {
      const known = [
        'move',
        'pickup',
        'try',
        // Legacy aliases remain accepted for replay compatibility.
        '\u79fb\u52a8',
        '\u62fe\u53d6',
        '\u5c1d\u8bd5',
      ].includes(action.skill.toLowerCase());
      outcome = known ? 'skill-already-exists' : 'skill-unavailable';
      break;
    }
  }
  const tick = state.tick + 1;
  return snapshot(
    tick,
    state.settings,
    agents,
    items,
    Object.freeze({ tick, action, outcome }),
  );
}

/** All intents see the same starting state; no intermediate transition is committed. */
export function stepWorldRound(
  state: WorldState,
  inputs: readonly WorldAction[],
): WorldState {
  if (
    !Array.isArray(inputs) ||
    state.agents.length === 0 ||
    inputs.length !== state.agents.length
  )
    throw new RangeError('A round requires exactly one action per agent.');
  return resolveRound(state, inputs);
}

/** Internal extension primitive: omitted actors stay still and retain occupancy. */
export function resolveRound(
  state: WorldState,
  inputs: readonly WorldAction[],
): WorldState {
  integer(state.tick, 0, Number.MAX_SAFE_INTEGER - 1, 'tick');
  const actions = inputs.map((input: unknown) => parseWorldAction(input));
  const byActor = new Map(actions.map((action) => [action.agentId, action]));
  if (
    byActor.size !== actions.length ||
    actions.some(
      (action) => !state.agents.some((agent) => agent.id === action.agentId),
    )
  )
    throw new RangeError('A round requires each known agent exactly once.');
  const candidates = state.agents.map((actor) => {
    const action = byActor.get(actor.id);
    if (action === undefined) return { actor, agent: actor, event: null };
    const candidate = stepWorld(state, action);
    const agent = candidate.agents.find((entry) => entry.id === actor.id);
    if (agent === undefined || candidate.event === null)
      throw new Error('Incomplete round candidate.');
    return { actor, agent, event: candidate.event };
  });
  const targets = new Map<string, number>();
  for (const { agent, event } of candidates) {
    if (event?.outcome === 'moved') {
      const key = `${String(agent.position.x)},${String(agent.position.y)}`;
      targets.set(key, (targets.get(key) ?? 0) + 1);
    }
  }
  const events: WorldEvent[] = [];
  const collected = new Set<string>();
  const agents = candidates.map(({ actor, agent, event }) => {
    if (event === null) return actor;
    const key = `${String(agent.position.x)},${String(agent.position.y)}`;
    if (event.outcome === 'moved' && (targets.get(key) ?? 0) > 1) {
      events.push(Object.freeze({ ...event, outcome: 'occupied' }));
      return actor;
    }
    events.push(event);
    if (event.outcome === 'picked-up' && event.action.type === 'pickup')
      collected.add(event.action.itemId);
    return agent;
  });
  return Object.freeze({
    ...snapshot(
      state.tick + 1,
      state.settings,
      agents,
      state.items.filter((item) => !collected.has(item.id)),
      null,
    ),
    events: Object.freeze(events),
  });
}
