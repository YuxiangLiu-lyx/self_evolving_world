import type {
  Cell,
  Knowledge,
  LearningAction,
  LearningEvent,
  LearningVital,
} from './learning-types.js';

import type { Biome, EResourceType, EStack, ECost } from './evolution-types.js';
export type { Biome, EResourceType, EStack, ECost };
export interface CSite {
  readonly id: string;
  readonly kind: string;
  readonly appearance: string;
  readonly position: Cell;
  readonly capacity: number;
  readonly energyLimit: number;
  readonly allocation: string | null;
  readonly stock: Readonly<Record<string, number>>;
}
export interface CEcologyRule {
  readonly id: string;
  readonly resource: string;
  readonly siteKind: string;
  readonly biomes: readonly Biome[];
  readonly distribution: readonly number[];
  readonly reason: string;
  readonly niche: 'surface' | 'canopy' | 'substrate';
  readonly renewEvery: number;
  readonly lifetime: number;
}
export interface COperation {
  readonly op:
    'extract' | 'consume' | 'convert' | 'identify' | 'place' | 'process';
  readonly target: string | null;
  readonly resource: string | null;
  readonly quantity: number;
  readonly costs: readonly ECost[];
  readonly tool: string | null;
  readonly chance: number;
}
export interface CMechanicDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
  readonly code: string;
}
export interface CMechanic extends CMechanicDraft {
  readonly version: 1;
  readonly operations: readonly COperation[];
  readonly signature: string;
}
export interface CoevolutionProposal {
  readonly resources: readonly EResourceType[];
  readonly ecology: readonly CEcologyRule[];
  readonly mechanics: readonly CMechanicDraft[];
  readonly reviews: readonly CReview[];
  readonly objects: readonly ObjectBlueprint[];
}
export interface CReview {
  readonly agentId: string;
  readonly decision: 'create' | 'reuse' | 'reject';
  readonly reason: string;
  readonly prerequisites: readonly string[];
  readonly learningRounds: number;
  readonly mechanicId: string | null;
}
export interface CSkill {
  readonly id: string;
  readonly mechanicId: string;
  readonly name: string;
  readonly description: string;
  readonly learningRounds: number;
  readonly version: 1;
}
export interface CMemory {
  readonly knownTypes: readonly string[];
  readonly visited: readonly string[];
  readonly discovered: readonly string[];
  readonly inspected: readonly string[];
}
export interface CoevolutionEnvironment {
  readonly seed: number;
  readonly terrain: readonly string[];
  readonly types: readonly EResourceType[];
  readonly stacks: readonly EStack[];
  readonly sites: readonly CSite[];
  readonly ecology: readonly CEcologyRule[];
}
export interface CoevolutionData extends CoevolutionEnvironment {
  readonly version: 'coevolution-v1';
  readonly mechanics: readonly CMechanic[];
  readonly skills: readonly CSkill[];
  readonly knowledge: Readonly<Record<string, Knowledge>>;
  readonly memory: Readonly<Record<string, CMemory>>;
  readonly vitals: Readonly<Record<string, LearningVital>>;
  readonly events: readonly CoevolutionEvent[];
  readonly blueprints: readonly ObjectBlueprint[];
  readonly objects: readonly PersistentObject[];
  readonly jobs: readonly ResourceJob[];
  readonly allocations: readonly ResourceAllocation[];
  readonly energy: Readonly<Record<string, number>>;
  readonly messages: readonly WorldMessage[];
  readonly benefits: readonly BenefitEvent[];
}
export interface CoevolutionRound {
  readonly actions: readonly CoevolutionAction[];
  readonly proposal: CoevolutionProposal;
}

export type CoevolutionAction =
  | LearningAction
  | { readonly type: 'rest'; readonly agentId: string }
  | { readonly type: 'drop'; readonly agentId: string; readonly itemId: string }
  | {
      readonly type: 'give';
      readonly agentId: string;
      readonly itemId: string;
      readonly recipient: string;
    }
  | {
      readonly type: 'message';
      readonly agentId: string;
      readonly recipient: string;
      readonly text: string;
    };
export interface CoevolutionEvent extends Omit<LearningEvent, 'action'> {
  readonly action: CoevolutionAction;
  readonly energyDelta: number;
}
export interface ObjectBlueprint {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly portable: boolean;
  readonly restBonus: number;
  readonly carryBonus: number;
  readonly growth?: {
    readonly version: 'photosynthesis-v1';
    readonly output: string;
    readonly biomes: readonly Biome[];
    readonly establishment: number;
    readonly interval: number;
    readonly ceiling: number;
    readonly lifetime: number;
  };
  readonly recipe: null | {
    readonly inputs: readonly ECost[];
    readonly output: string;
    readonly quantity: number;
    readonly delay: number;
  };
}
export interface PersistentObject {
  readonly id: string;
  readonly blueprint: string;
  readonly creator: string;
  readonly created: number;
  readonly owner: string | null;
  readonly position: Cell | null;
  readonly growth?: {
    readonly next: number;
    readonly produced: number;
    readonly environmentalEnergy: number;
  };
}
export interface ResourceJob {
  readonly id: string;
  readonly object: string;
  readonly actor: string;
  readonly output: string;
  readonly quantity: number;
  readonly due: number;
  readonly completed: boolean;
}
export interface ResourceAllocation {
  readonly site: string;
  readonly niche: CEcologyRule['niche'];
  readonly rule: string;
  readonly resource: string;
  readonly draw: number;
  readonly ceiling: number;
  readonly remaining: number;
  readonly renewEvery: number;
  readonly next: number;
}
export interface WorldMessage {
  readonly tick: number;
  readonly sender: string;
  readonly recipient: string;
  readonly text: string;
}
export interface BenefitEvent {
  readonly tick: number;
  readonly actor: string;
  readonly object: string;
  readonly kind: 'rest' | 'carrying' | 'process' | 'growth';
  readonly amount: number;
}
export interface PersonalProject {
  readonly problem: string;
  readonly reason: string;
  readonly progress: string;
  readonly missing: string;
  readonly observedEffects: string;
}
