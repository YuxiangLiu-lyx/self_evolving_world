export {
  CORE_RULES,
  DEFAULT_SETTINGS,
  createWorld,
  stepWorld,
  stepWorldRound,
  isVisible,
  parseWorldAction,
} from './world.js';
export type {
  Position,
  WorldSettings,
  WorldSetup,
  Item,
  GroundItem,
  AgentSeed,
  AgentState,
  Direction,
  WorldAction,
  Outcome,
  WorldEvent,
  Observation,
  WorldState,
  VitalSigns,
  SurvivalConfig,
  SurvivalAction,
  SurvivalEvent,
  SurvivalData,
} from './world.js';
export {
  MILD_SURVIVAL,
  createSurvivalWorld,
  parseSurvivalConfig,
  parseSurvivalAction,
  stepSurvivalRound,
} from './survival.js';
export {
  PROGRAM_LIMITS,
  parseBehaviorCode,
  parseProgramRecords,
  createProgramRun,
  pendingPrograms,
  acceptProgram,
  advanceProgramRound,
  replayPrograms,
} from './program.js';
export type { ProgramRecord, ProgramRun, ProgramCursor } from './program.js';
export type {
  Cell,
  ResourceKind,
  Resource,
  EnvironmentObject,
  LearningEnvironment,
  CapabilityRequest,
  SkillInstruction,
  SkillDraft,
  SkillSpec,
  WorldReview,
  LearningAction,
  LearningProgress,
  Knowledge,
  LearningVital,
  LearningEvent,
  LearningData,
  LearningRound,
} from './learning-types.js';
export {
  RESOURCE_PROPERTIES,
  resource,
  sameCell,
  walkable,
  visibleEnvironment,
} from './learning-environment.js';
export {
  parseCapability,
  parseSkillDraft,
  compileSkill,
  parseWorldReview,
} from './skill-code.js';
export {
  LEARNING_RULES,
  createLearningWorld,
  learningData,
  parseLearningAction,
  parseLearningRound,
  reviewedSkills,
  stepLearningRound,
  replayLearning,
} from './learning.js';
export {
  LEARNING_LIMITS,
  parseLearningCode,
  parseLearningProgram,
  createLearningRun,
  lastLearningFrame,
  pendingLearningPrograms,
  acceptLearningProgram,
  learningActions,
  advanceLearningRound,
  reconstructLearningRun,
} from './learning-program.js';
export type {
  LearningProgram,
  LearningCursor,
  LearningRun,
} from './learning-program.js';

export * from './evolution-types.js';
export {
  EVOLUTION_CONFIG,
  EMPTY_PROPOSAL,
  parseEvolutionProposal,
  compileMechanic,
  seededUnit,
  BIOMES,
} from './evolution-schema.js';
export {
  createEvolutionWorld,
  evolutionData,
  biomeAt,
  eWalkable,
  registerEvolution,
} from './evolution-environment.js';
export { stepEvolutionRound, parseEvolutionRound } from './evolution.js';

export * from './evolution-program.js';

export type {
  CoevolutionData,
  CoevolutionEnvironment,
  CoevolutionProposal,
  CoevolutionRound,
  CoevolutionAction,
  CoevolutionEvent,
  CMechanic,
  CMechanicDraft,
  CReview,
  CSkill,
  CSite,
  CEcologyRule,
  ObjectBlueprint,
  PersistentObject,
  ResourceJob,
  ResourceAllocation,
  PersonalProject,
  BenefitEvent,
} from './coevolution-types.js';
export {
  COEVOLUTION_CONFIG,
  EMPTY_COEVOLUTION_PROPOSAL,
  parseCoevolutionProposal,
  compileCMechanic,
  parseCoevolutionAction,
  parseProject,
} from './coevolution-schema.js';
export {
  createCoevolutionWorld,
  coevolutionData,
  cBiomeAt,
  cWalkable,
  registerCoevolution,
} from './coevolution-environment.js';
export { actionEffort, carryingLoad, recovery } from './coevolution-effects.js';
export { stepCoevolutionRound, parseCoevolutionRound } from './coevolution.js';
export * from './coevolution-program.js';
export * from './continuous-types.js';
export * from './continuous-policy.js';
export * from './continuous-data.js';
export * from './continuous-geometry.js';
export * from './continuous-observation.js';
export * from './continuous-base.js';
export * from './continuous-registry.js';
export * from './continuous-wellbeing.js';
export * from './continuous-kernel.js';
export * from './continuous-tasks.js';
export * from './continuous.js';
