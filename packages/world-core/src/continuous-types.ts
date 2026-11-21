/** Serializable contracts for continuous-v1. Historical protocols do not use these types. */
export type V7Json =
  null | boolean | number | string | V7Json[] | { [key: string]: V7Json };
export type V7Data = { [key: string]: V7Json };
export interface V7Point {
  x: number;
  y: number;
}
export type V7Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rectangle'; width: number; height: number };
export interface V7Spatial extends V7Point {
  angle: number;
  shape: V7Shape;
  solid: boolean;
  /** Excludes overlapping construction without blocking walking. */
  reserved?: boolean;
  interaction: number;
  entrances: V7Point[];
  /** Forest extension: rectangle walls with a south-facing doorway in local coordinates. */
  enclosure?: { wall: number; doorway: number; roof: string };
}
export interface V7Visual {
  component: string;
  color: string;
  accent: string;
  label: string;
  state: string;
}
export interface V7Object {
  id: string;
  kind: string;
  name: string;
  spatial: V7Spatial;
  visual: V7Visual;
  data: V7Data;
  createdBy: string | null;
  createdAt: number;
  revision: string;
}
export interface V7Resource {
  id: string;
  name: string;
  mass: number;
  nutrition: number;
  toxicity: number;
  color: string;
  properties?: {
    hardness: number;
    flexibility: number;
    fuel: number;
    decay: number;
    minGrowth: number;
    optimalGrowth: number;
    moisture: number;
  };
}
export interface V7Stack {
  id: string;
  resource: string;
  quantity: number;
  position: V7Point;
  owner: string | null;
  origin: string;
  /** Canonical fixed-point accounting after food-assessment installation; quantity remains public resource units. */
  quantityTenths?: number;
  /** Owned material reserved by a real ongoing operation, still counted as carried mass. */
  reservedFor?: string;
  harvestedAt?: number;
  decay?: number;
}
export interface V7Vital {
  health: number;
  satiety: number;
  energy: number;
  temperature: number;
}
export interface V7Satisfaction {
  source: string;
  value: number;
  lastEvent: string;
  lastTick: number;
  expires: number;
  exposures: number;
  layers?: { value: number; expires: number }[];
}
export interface V7Wellbeing {
  physical: number;
  mental: number;
  total: number;
  sources: V7Satisfaction[];
}
export interface V7Memory {
  cells: string[];
  objects: { object: V7Object; seenAt: number }[];
  stacks: { stack: V7Stack; seenAt: number }[];
  experiences: { tick: number; event: string; summary: string }[];
  notes: string[];
  preferences: string[];
  intention?: string;
  important?: { tick: number; event: string; type: string; summary: string }[];
  discoveries?: Record<string, V7Data>;
}
export interface V7Actor {
  id: string;
  name: string;
  position: V7Point;
  angle: number;
  radius: number;
  vitals: V7Vital;
  wellbeing: V7Wellbeing;
  mastered: string[];
  learning: { ability: string; remaining: number; startedAt: number } | null;
  memory: V7Memory;
  relationships: V7Data;
  extensionState: V7Data;
  bornAt: number;
  parents: string[];
  life?: {
    total: number;
    deaths: number;
    spawn: V7Point;
    lastDeath: V7Data | null;
  };
}
export interface V7Condition {
  path: string;
  comparison: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
  value: number | string | boolean;
}
export interface V7Action {
  interface: string;
  args: V7Data;
}
export interface V7TaskStep {
  action: V7Action;
  repeat: number;
  until: V7Condition | null;
  guard: V7Condition | null;
}
export interface V7Plan {
  intention: string;
  steps: V7TaskStep[];
  repeat: number;
  until: V7Condition | null;
  interrupts: string[];
  notes: string[];
  preferences: string[];
}
export interface V7Cursor {
  plan: V7Plan;
  step: number;
  repetition: number;
  cycle: number;
  startedAt: number;
  navigation: { goal: V7Point; path: V7Point[]; obstacleKey: string } | null;
  reason: string | null;
}
export interface V7Event {
  id: string;
  tick: number;
  actor: string | null;
  type: string;
  interface: string | null;
  success: boolean;
  description: string;
  position: V7Point | null;
  target: string | null;
  data: V7Data;
}
export interface V7Process {
  id: string;
  handler: string;
  owner: string | null;
  object: string | null;
  next: number;
  data: V7Data;
  revision: string;
}
export interface V7Schema {
  type:
    'object' | 'array' | 'number' | 'integer' | 'string' | 'boolean' | 'null';
  properties?: Record<string, V7Schema>;
  items?: V7Schema;
  required?: string[];
  enum?: V7Json[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  additionalProperties?: boolean;
}
export interface V7Ability {
  id: string;
  name: string;
  function: string;
  equivalence: string;
  parameters: V7Schema;
  prerequisites: string[];
  learning: number;
  costs: string;
  effects: string;
  handler: string;
  revision: string;
  authored: boolean;
}
export interface V7SatisfactionRule {
  id: string;
  name: string;
  equivalence: string;
  event: string;
  interface: string;
  conditions: V7Condition[];
  /** Reviewed alternative evidence routes share this exact source and reward history. */
  alternativeTriggers?: { event: string; interface: string }[];
  amount: number;
  cap: number;
  duration: number;
  mode: 'hold' | 'linear' | 'maintained';
  repetition: 'refresh' | 'add' | 'diminish';
  cooldown: number;
  rationale: string;
  revision: string;
  participants?: 'actor' | 'participants';
  /** Keep overlapping rewards as their maximum; repetition uses a smaller amount within this window. */
  repeatWindow?: { rounds: number; amount: number };
}
export interface V7Configuration {
  protocol: 'continuous-v1';
  seed: number;
  width: number;
  height: number;
  dt: number;
  speed: number;
  vision: number;
  interaction: number;
  hunger: number;
  starvation: number;
  energyCap: number;
  restRecovery: number;
  physicalCap: number;
  mentalCap: number;
  budgets: { ordinary: number; world: number; development: number };
  computation: { workPerRound: number; inputBytes: number; stateBytes: number };
  forest?: {
    version: 1;
    day: number;
    year: number;
    respawnSatiety: number;
    lives: number;
  };
}
export interface V7World {
  protocol: 'continuous-v1';
  tick: number;
  time: number;
  config: V7Configuration;
  terrain: string[];
  actors: V7Actor[];
  objects: V7Object[];
  stacks: V7Stack[];
  resources: V7Resource[];
  processes: V7Process[];
  abilities: V7Ability[];
  satisfaction: V7SatisfactionRule[];
  revisions: string[];
  state: V7Data;
  events: V7Event[];
  nextIdentity: number;
  identityScope: string;
  eventTypes?: string[];
}
export interface V7Observation {
  tick: number;
  time: number;
  self: V7Actor;
  actors: { id: string; name: string; position: V7Point; alive: boolean }[];
  objects: V7Object[];
  stacks: V7Stack[];
  terrain: { x: number; y: number; kind: string }[];
  events: V7Event[];
}
export interface V7Work {
  remaining: number;
  spend(amount?: number): void;
}
export interface V7ActionContext {
  world: V7World;
  actor: V7Actor;
  action: V7Action;
  work: V7Work;
  emit: (
    type: string,
    description: string,
    data?: V7Data,
    target?: string | null,
  ) => void;
}
export interface V7HandlerResult {
  complete: boolean;
  writes: string[];
}
export interface V7Package {
  id: string;
  version: number;
  description: string;
  dependencies: string[];
  abilities: V7Ability[];
  satisfaction: V7SatisfactionRule[];
  resources: V7Resource[];
  handlers: Record<string, (context: V7ActionContext) => V7HandlerResult>;
  processes: Record<
    string,
    (world: V7World, process: V7Process, work: V7Work) => void
  >;
  visualComponents: string[];
  events?: string[];
  /** Release pending work/escrow at the death position before respawn, without refunding effort. */
  onDeath?: (world: V7World, actor: V7Actor) => void;
  stateSchemas?: Record<string, V7Schema>;
  /** Only private observations enter a learned actor-selected memory adapter. */
  harness?: Record<
    string,
    (observation: V7Observation, work: V7Work) => V7Data
  >;
  migrate?: (world: V7World) => V7World;
}
export interface V7Registry {
  packages: V7Package[];
  handlers: V7Package['handlers'];
  processes: V7Package['processes'];
}
export interface V7RoundResult {
  world: V7World;
  outcomes: Record<
    string,
    { complete: boolean; success: boolean; reason: string }
  >;
  paused: string | null;
}
