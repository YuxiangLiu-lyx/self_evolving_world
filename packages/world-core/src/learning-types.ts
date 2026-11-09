/** Versioned extension types; no imports keep the foundation dependency acyclic. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}
export type ResourceKind =
  | 'fruit'
  | 'poison-fruit'
  | 'branch'
  | 'stone'
  | 'timber'
  | 'fish'
  | 'rod'
  | 'axe';
export interface Resource {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly quantity: number;
  readonly nutrition: number;
  readonly toxicity: number;
  readonly durability: number;
}
export interface EnvironmentObject {
  readonly id: string;
  readonly kind: 'tree' | 'rock' | 'fishery';
  readonly position: Cell;
  readonly stock: Readonly<Partial<Record<ResourceKind, number>>>;
}
export interface LearningEnvironment {
  readonly era: 'primitive';
  readonly river: readonly Cell[];
  readonly shallows: readonly Cell[];
  readonly objects: readonly EnvironmentObject[];
  readonly resources: readonly Resource[];
}
export interface CapabilityRequest {
  readonly name: string;
  readonly purpose: string;
  readonly target: string;
  readonly conditions: string;
  readonly expectedEffect: string;
}
export type SkillInstruction =
  | {
      readonly op: 'consume';
      readonly parameter: string;
      readonly quantity: number;
    }
  | {
      readonly op: 'harvest';
      readonly parameter: string;
      readonly kind: ResourceKind;
      readonly quantity: number;
    }
  | { readonly op: 'craft'; readonly kind: 'rod' | 'axe' };
export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
  readonly code: string;
}
export interface SkillSpec extends SkillDraft {
  readonly id: string;
  readonly version: 1;
  readonly instructions: readonly SkillInstruction[];
  readonly signature: string;
  readonly conditions: readonly string[];
  readonly costs: readonly string[];
  readonly effects: readonly string[];
  readonly learningRounds: number;
}
export interface WorldReview {
  readonly agentId: string;
  readonly decision: 'create' | 'reuse' | 'reject';
  readonly reason: string;
  readonly prerequisites: readonly string[];
  readonly learningRounds: number;
  readonly skillId: string | null;
  readonly specification: SkillDraft | null;
}
export type LearningAction =
  | {
      readonly type: 'move';
      readonly agentId: string;
      readonly direction: 'north' | 'east' | 'south' | 'west';
    }
  | {
      readonly type: 'pickup';
      readonly agentId: string;
      readonly itemId: string;
    }
  | { readonly type: 'wait' | 'study'; readonly agentId: string }
  | {
      readonly type: 'learn';
      readonly agentId: string;
      readonly request: CapabilityRequest;
    }
  | {
      readonly type: 'use';
      readonly agentId: string;
      readonly skillId: string;
      readonly args: Readonly<Record<string, string>>;
    };
export interface LearningProgress {
  readonly skillId: string;
  readonly total: number;
  readonly completed: number;
}
export interface Knowledge {
  readonly learned: readonly string[];
  readonly pending: LearningProgress | null;
}
export interface LearningVital {
  readonly health: number;
  readonly satiety: number;
  readonly cold: 0;
  readonly heat: 0;
}
export interface LearningEvent {
  readonly tick: number;
  readonly action: LearningAction;
  readonly outcome: string;
  readonly detail: string;
  readonly healthDelta: number;
  readonly satietyDelta: number;
  readonly skillId: string | null;
}
export interface LearningData {
  readonly version: 'learning-v1';
  readonly environment: LearningEnvironment;
  readonly skills: readonly SkillSpec[];
  readonly knowledge: Readonly<Record<string, Knowledge>>;
  readonly vitals: Readonly<Record<string, LearningVital>>;
  readonly events: readonly LearningEvent[];
}
export interface LearningRound {
  readonly actions: readonly LearningAction[];
  readonly reviews: readonly WorldReview[];
}
