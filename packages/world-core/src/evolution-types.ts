import type {
  Cell,
  Knowledge,
  LearningAction,
  LearningEvent,
  LearningVital,
} from './learning-types.js';

export type Biome =
  'forest' | 'grassland' | 'river' | 'bank' | 'rocky' | 'damp' | 'shallow';
export interface EResourceType {
  readonly id: string;
  readonly name: string;
  readonly appearance: string;
  readonly nutrition: number;
  readonly toxicity: number;
  readonly durability: number;
}
export interface EStack {
  readonly id: string;
  readonly type: string;
  readonly quantity: number;
  readonly durability: number;
  readonly owner: string | null;
  readonly position: Cell | null;
}
export interface ESite {
  readonly id: string;
  readonly kind: string;
  readonly appearance: string;
  readonly position: Cell;
  readonly capacity: number;
  readonly energyLimit: number;
  readonly allocation: string | null;
  readonly stock: Readonly<Record<string, number>>;
}
export interface EcologyRule {
  readonly id: string;
  readonly resource: string;
  readonly siteKind: string;
  readonly biomes: readonly Biome[];
  readonly distribution: readonly number[];
  readonly reason: string;
}
export interface ECost {
  readonly resource: string;
  readonly quantity: number;
}
export interface EOperation {
  readonly op: 'extract' | 'consume' | 'convert' | 'identify';
  readonly target: string | null;
  readonly resource: string | null;
  readonly quantity: number;
  readonly costs: readonly ECost[];
  readonly tool: string | null;
  readonly chance: number;
}
export interface MechanicDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
  readonly code: string;
}
export interface Mechanic extends MechanicDraft {
  readonly version: 1;
  readonly operations: readonly EOperation[];
  readonly signature: string;
}
export interface EvolutionProposal {
  readonly resources: readonly EResourceType[];
  readonly ecology: readonly EcologyRule[];
  readonly mechanics: readonly MechanicDraft[];
  readonly reviews: readonly EReview[];
}
export interface EReview {
  readonly agentId: string;
  readonly decision: 'create' | 'reuse' | 'reject';
  readonly reason: string;
  readonly prerequisites: readonly string[];
  readonly learningRounds: number;
  readonly mechanicId: string | null;
}
export interface ESkill {
  readonly id: string;
  readonly mechanicId: string;
  readonly name: string;
  readonly description: string;
  readonly learningRounds: number;
  readonly version: 1;
}
export interface EMemory {
  readonly knownTypes: readonly string[];
  readonly visited: readonly string[];
  readonly discovered: readonly string[];
  readonly inspected: readonly string[];
}
export interface EvolutionEnvironment {
  readonly seed: number;
  readonly terrain: readonly string[];
  readonly types: readonly EResourceType[];
  readonly stacks: readonly EStack[];
  readonly sites: readonly ESite[];
  readonly ecology: readonly EcologyRule[];
}
export interface EvolutionData extends EvolutionEnvironment {
  readonly version: 'evolution-v1';
  readonly mechanics: readonly Mechanic[];
  readonly skills: readonly ESkill[];
  readonly knowledge: Readonly<Record<string, Knowledge>>;
  readonly memory: Readonly<Record<string, EMemory>>;
  readonly vitals: Readonly<Record<string, LearningVital>>;
  readonly events: readonly LearningEvent[];
}
export interface EvolutionRound {
  readonly actions: readonly LearningAction[];
  readonly proposal: EvolutionProposal;
}
