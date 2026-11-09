import type {
  CapabilityRequest,
  ResourceKind,
  SkillDraft,
  SkillInstruction,
  SkillSpec,
  WorldReview,
} from './learning-types.js';

export function dataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('Expected a data object.');
  return value as Record<string, unknown>;
}
export function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
    throw new RangeError(`Expected only fields: ${keys.join(', ')}.`);
}
export function boundedText(value: unknown, limit = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new RangeError('Invalid bounded text.');
  return value.trim();
}
export function count(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new RangeError('Invalid bounded integer.');
  return value;
}
export function list(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new RangeError('Invalid bounded list.');
  return value as unknown[];
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'fruit',
  'poison-fruit',
  'branch',
  'stone',
  'timber',
  'fish',
  'rod',
  'axe',
];
export function resourceKind(value: unknown): ResourceKind {
  if (!RESOURCE_KINDS.some((kind) => kind === value))
    throw new RangeError('Unknown resource kind.');
  return value as ResourceKind;
}
export function parseCapability(input: unknown): CapabilityRequest {
  const p = dataObject(input);
  exactKeys(p, ['name', 'purpose', 'target', 'conditions', 'expectedEffect']);
  return freeze({
    name: boundedText(p.name, 80),
    purpose: boundedText(p.purpose),
    target: boundedText(p.target),
    conditions: boundedText(p.conditions),
    expectedEffect: boundedText(p.expectedEffect),
  });
}
export function parseSkillDraft(input: unknown): SkillDraft {
  const s = dataObject(input);
  exactKeys(s, ['name', 'description', 'parameters', 'code']);
  const parameters = list(s.parameters, 4).map((p) => boundedText(p, 24));
  if (
    new Set(parameters).size !== parameters.length ||
    parameters.some((p) => !/^[a-z][a-z0-9_]*$/.test(p))
  )
    throw new RangeError('Invalid skill parameter names.');
  return freeze({
    name: boundedText(s.name, 80),
    description: boundedText(s.description),
    parameters,
    code: boundedText(s.code, 2000),
  });
}
/** Fixed resource primitives, not a catalogue of learned skills. No host code is evaluated. */
export function compileSkill(
  input: unknown,
  id: string,
  learningRounds: number,
): SkillSpec {
  const draft = parseSkillDraft(input);
  count(learningRounds, 1, 8);
  if (!/^skill-[1-9]\d*$/.test(id))
    throw new RangeError('Invalid registered skill ID.');
  const instructions: SkillInstruction[] = [];
  const statement = /\s*(consume|harvest|craft)\(([^()]*)\)\s*;/gy;
  let offset = 0;
  while (offset < draft.code.length) {
    statement.lastIndex = offset;
    const match = statement.exec(draft.code);
    if (!match || instructions.length === 4)
      throw new RangeError(
        'Skill code permits 1-4 consume, harvest or craft calls only.',
      );
    const args = list(JSON.parse(`[${match[2] ?? ''}]`) as unknown, 3);
    const op = match[1];
    if (op === 'craft') {
      if (args.length !== 1 || (args[0] !== 'rod' && args[0] !== 'axe'))
        throw new RangeError('Craft requires one supported recipe.');
      instructions.push({ op, kind: args[0] });
    } else {
      const parameter = boundedText(args[0], 24);
      if (!draft.parameters.includes(parameter))
        throw new RangeError(
          'Instruction must use a declared target parameter.',
        );
      if (op === 'consume' && args.length === 2)
        instructions.push({ op, parameter, quantity: count(args[1], 1, 3) });
      else if (op === 'harvest' && args.length === 3) {
        const kind = resourceKind(args[1]);
        if (!['fruit', 'branch', 'stone', 'timber', 'fish'].includes(kind))
          throw new RangeError('Unsupported harvest output.');
        instructions.push({
          op,
          parameter,
          kind,
          quantity: count(args[2], 1, 3),
        });
      } else throw new RangeError('Invalid instruction arguments.');
    }
    offset = statement.lastIndex;
  }
  if (
    !instructions.length ||
    draft.parameters.some(
      (p) => !instructions.some((i) => i.op !== 'craft' && i.parameter === p),
    )
  )
    throw new RangeError('Empty code or unused parameters.');
  const normalized = instructions.map((i) =>
    i.op === 'craft'
      ? i
      : { ...i, parameter: draft.parameters.indexOf(i.parameter) },
  );
  // Alpha-equivalent parameters and names cannot create duplicate implementations.
  const signature = JSON.stringify(normalized);
  const conditions = instructions.map((i) =>
    i.op === 'consume'
      ? 'Target must be an owned edible resource with sufficient quantity.'
      : i.op === 'harvest'
        ? `Target must be an adjacent matching environment object with ${i.kind} stock; timber needs an axe and fish needs a rod and fishery.`
        : `Owned recipe materials for ${i.kind} are required.`,
  );
  const costs = instructions.map((i) =>
    i.op === 'consume'
      ? `Consume ${String(i.quantity)} target units.`
      : i.op === 'harvest'
        ? `Remove ${String(i.quantity)} ${i.kind} stock; timber/fish consume one tool durability per unit.`
        : i.kind === 'rod'
          ? 'Consume two branch units and one stone unit.'
          : 'Consume one branch unit and two stone units.',
  );
  const effects = instructions.map((i) =>
    i.op === 'consume'
      ? 'Apply resource-defined nutrition and toxicity, capped at 100; no revival.'
      : i.op === 'harvest'
        ? `Transfer ${i.kind} from finite environment stock into inventory.`
        : `Create one ${i.kind} with three durability from consumed materials.`,
  );
  return freeze({
    ...draft,
    id,
    version: 1,
    instructions,
    signature,
    conditions,
    costs,
    effects,
    learningRounds,
  });
}
export function parseWorldReview(input: unknown): WorldReview {
  const r = dataObject(input);
  exactKeys(r, [
    'agentId',
    'decision',
    'reason',
    'prerequisites',
    'learningRounds',
    'skillId',
    'specification',
  ]);
  if (
    r.decision !== 'create' &&
    r.decision !== 'reuse' &&
    r.decision !== 'reject'
  )
    throw new RangeError('Unknown World Agent decision.');
  const decision = r.decision;
  const skillId = r.skillId === null ? null : boundedText(r.skillId, 80);
  const specification =
    r.specification === null ? null : parseSkillDraft(r.specification);
  if (
    (decision === 'create' && (specification === null || skillId !== null)) ||
    (decision === 'reuse' && (skillId === null || specification !== null)) ||
    (decision === 'reject' && (skillId !== null || specification !== null))
  )
    throw new RangeError('Inconsistent World Agent decision.');
  return freeze({
    agentId: boundedText(r.agentId, 80),
    decision,
    reason: boundedText(r.reason, 1600),
    prerequisites: list(r.prerequisites, 12).map((p) => boundedText(p)),
    learningRounds: count(
      r.learningRounds,
      decision === 'reject' ? 0 : 1,
      decision === 'reject' ? 0 : 8,
    ),
    skillId,
    specification,
  });
}
