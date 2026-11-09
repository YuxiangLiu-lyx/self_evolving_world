import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const markdown = new MarkdownIt();
export const ATTESTATIONS = [
  'All requirements are satisfied.',
  'Every changed file was reviewed against the requirements.',
  'No unrelated changes or unresolved requirement mismatches remain.',
  'The full test suite passed without skipped or focused tests.',
  'Current visual, behavior, and requirement reviews passed.',
  'The local review gate passed after the final edit.',
] as const;

function sections(text: string): Map<string, Token[]> {
  const tokens = markdown.parse(text, {});
  const result = new Map<string, Token[]>();
  let current: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (
      token.type === 'heading_open' &&
      token.tag === 'h2' &&
      token.level === 0
    ) {
      const title = tokens[i + 1]?.content ?? '';
      if (result.has(title)) throw new Error(`Duplicate section: ${title}`);
      current = [];
      result.set(title, current);
      i += 2;
    } else current.push(token);
  }
  return result;
}
function inline(tokens: readonly Token[]): string[] {
  return tokens
    .filter((token) => token.type === 'inline')
    .map((token) => token.content);
}
function meaningful(text: string, minimumLength = 12): boolean {
  return (
    text.trim().length >= minimumLength &&
    !/\b(?:REPLACE_ME|TODO|TBD)\b|<[^>]+>/i.test(text)
  );
}
function field(tokens: readonly Token[], name: string): string {
  const values = inline(tokens).filter((line) => line.startsWith(`${name}: `));
  if (values.length !== 1) throw new Error(`Expected one ${name} field.`);
  return (values[0] ?? '')
    .slice(name.length + 2)
    .replace(/`/g, '')
    .trim();
}
function requirements(tokens: readonly Token[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of inline(tokens)) {
    const match = /^(R[1-9]\d*): (.+)$/.exec(line);
    const id = match?.[1],
      text = match?.[2];
    if (id === undefined || text === undefined || !meaningful(text))
      throw new Error(
        'Requirements must use R1: concrete acceptance text, without placeholders.',
      );
    if (result.has(id)) throw new Error(`Duplicate requirement: ${id}`);
    result.set(id, text);
  }
  if (result.size === 0)
    throw new Error('At least one numbered requirement is required.');
  return result;
}
function rows(tokens: readonly Token[]): Token[][] {
  const result: Token[][] = [];
  let inBody = false;
  let row: Token[] = [];
  for (const token of tokens) {
    if (token.type === 'tbody_open') inBody = true;
    if (token.type === 'tbody_close') inBody = false;
    if (!inBody) continue;
    if (token.type === 'tr_open') row = [];
    if (token.type === 'inline') row.push(token);
    if (token.type === 'tr_close') result.push(row);
  }
  return result;
}
function requireSection(all: Map<string, Token[]>, name: string): Token[] {
  const tokens = all.get(name);
  if (tokens === undefined || tokens.length === 0)
    throw new Error(`Missing section: ${name}`);
  return tokens;
}
export function planPath(body: string): string {
  const value = field(requireSection(sections(body), 'Scope'), 'Plan');
  if (
    !/^docs\/exec-plans\/(active|completed)\/pr-\d{2,}-[a-z0-9-]+\.md$/.test(
      value,
    )
  )
    throw new Error('Plan must reference a repository execution plan.');
  return value;
}
export function validationFields(body: string): {
  task: string;
  runId: string;
} {
  const section = requireSection(sections(body), 'Validation');
  return { task: field(section, 'Task'), runId: field(section, 'Run ID') };
}
export interface PullRequestInput {
  readonly body: string;
  readonly plan: string;
  readonly head: string;
  readonly files: readonly string[];
}

/** Checks traceability and attestations, never the truth of a semantic review. */
export function pullRequestErrors(input: PullRequestInput): string[] {
  try {
    const all = sections(input.body),
      plan = sections(input.plan),
      errors: string[] = [];
    const path = planPath(input.body);
    if (!input.files.includes(path))
      errors.push('The task plan must be part of this PR.');
    for (const name of [
      'Requirement summary',
      'Scope and exclusions',
      'Acceptance criteria',
    ]) {
      if (!meaningful(inline(requireSection(plan, name)).join(' ')))
        errors.push(`Plan needs concrete ${name}.`);
    }
    const expected = requirements(requireSection(plan, 'Requirements'));
    const actual = requirements(requireSection(all, 'Requirements'));
    if (
      expected.size !== actual.size ||
      [...expected].some(([id, text]) => actual.get(id) !== text)
    )
      errors.push(
        'PR requirements must exactly match the task plan requirements.',
      );
    const scope = requireSection(all, 'Scope');
    for (const name of ['In scope', 'Out of scope'])
      if (!meaningful(field(scope, name))) errors.push(`Describe ${name}.`);
    const matrix = rows(requireSection(all, 'Requirement review'));
    const coveredRequirements = new Set<string>(),
      coveredFiles = new Set<string>();
    for (const row of matrix) {
      const [requirement, implementation, evidence, result] = row;
      const id = requirement?.content ?? '';
      if (row.length !== 4 || !actual.has(id)) {
        errors.push(`Invalid review row: ${id}`);
        continue;
      }
      coveredRequirements.add(id);
      if (result?.content !== 'PASS')
        errors.push(`Requirement ${id} has not passed review.`);
      const files =
        implementation?.children
          ?.filter((t) => t.type === 'code_inline')
          .map((t) => t.content) ?? [];
      if (files.length === 0)
        errors.push(
          `Requirement ${id} needs explicit changed file paths in code spans.`,
        );
      for (const file of files) {
        if (!input.files.includes(file))
          errors.push(
            `Review references an unchanged or unknown file: ${file}`,
          );
        coveredFiles.add(file);
      }
      if (
        !meaningful(
          implementation?.children
            ?.filter((token) => token.type === 'text')
            .map((token) => token.content)
            .join(' ') ?? '',
        ) ||
        !meaningful(evidence?.content ?? '')
      )
        errors.push(
          `Requirement ${id} needs implementation and verification findings.`,
        );
    }
    for (const id of actual.keys())
      if (!coveredRequirements.has(id))
        errors.push(`Requirement is not reviewed: ${id}`);
    for (const file of input.files)
      if (!coveredFiles.has(file))
        errors.push(`Changed file is not reviewed: ${file}`);
    if (input.files.length === 0)
      errors.push('No changed files were supplied.');
    const validation = requireSection(all, 'Validation');
    if (
      !/^[a-f0-9]{40}$/.test(input.head) ||
      field(validation, 'Reviewed head') !== input.head
    )
      errors.push(
        'Review is stale: Reviewed head must equal the latest PR head SHA.',
      );
    if (field(validation, 'Full suite') !== 'PASS')
      errors.push('Full automated suite must pass.');
    const { task, runId } = validationFields(input.body);
    if (
      !meaningful(task) ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(runId)
    )
      errors.push('Provide the actual validation task and run ID.');
    for (const name of ['Results', 'Visual and behavior review'])
      if (!meaningful(field(validation, name)))
        errors.push(`Provide concrete ${name}.`);
    const review = requireSection(all, 'Code review');
    if (
      !meaningful(field(review, 'Findings')) ||
      !meaningful(field(review, 'Reviewer'), 2)
    )
      errors.push(
        'Record the actual diff reviewer and requirement comparison findings.',
      );
    const attestations = inline(requireSection(all, 'Completion checklist'));
    for (const item of ATTESTATIONS)
      if (!attestations.includes(`[x] ${item}`))
        errors.push(`Missing attestation: ${item}`);
    if (
      !meaningful(
        inline(requireSection(all, 'Documentation synchronization')).join(' '),
      )
    )
      errors.push(
        'Explain documentation synchronization or justified exclusions.',
      );
    return errors;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
