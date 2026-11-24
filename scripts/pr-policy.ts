import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const markdown = new MarkdownIt();

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
function content(tokens: readonly Token[] | undefined): string {
  return (tokens ?? [])
    .filter((token) => token.type === 'inline')
    .map((token) => token.content)
    .join(' ')
    .trim();
}
function meaningful(text: string, minimumLength = 12): boolean {
  return (
    text.length >= minimumLength &&
    !/\b(?:REPLACE_ME|TODO|TBD)\b|<[^>]+>/i.test(text)
  );
}

const PLAN = /^docs\/exec-plans\/(active|completed)\/pr-\d{2,}-[a-z0-9-]+\.md$/;
const ARCHIVE = /^experiment\/(ex[1-9]\d*)\//;
const ANALYSIS = /^experiment\/analyses\/(ex[1-9]\d*)\/[^/]+\.json$/;

/** Returns the referenced plan path, or null when the PR declares `none`. */
export function planPath(body: string): string | null {
  const line = content(sections(body).get('Plan'));
  const value = /(?:^|\s)Plan:\s*`?([^`\s]+)`?/.exec(line)?.[1];
  if (value === 'none') return null;
  if (!value || !PLAN.test(value))
    throw new Error(
      'Plan must be `none` or a docs/exec-plans/{active,completed}/pr-NN-name.md path.',
    );
  return value;
}

export interface PullRequestInput {
  readonly body: string;
  /** Plan text at the PR head, when a plan is referenced. */
  readonly plan: string | null;
  /** Every file changed by the PR relative to its base. */
  readonly files: readonly string[];
  /** Archive IDs that already existed on the base branch. */
  readonly baseArchives: readonly string[];
}

/** Lightweight PR contract: focused description, plan link and experiment analyses. */
export function pullRequestErrors(input: PullRequestInput): string[] {
  try {
    const all = sections(input.body),
      errors: string[] = [];
    for (const name of ['Summary', 'Validation'])
      if (!meaningful(content(all.get(name))))
        errors.push(`Describe ${name} concretely (no placeholders).`);
    const added = [
      ...new Set(input.files.flatMap((file) => ARCHIVE.exec(file)?.[1] ?? [])),
    ].filter((id) => !input.baseArchives.includes(id));
    const path = planPath(input.body);
    if (path === null) {
      if (added.length)
        errors.push('A PR with a new experiment needs an execution plan.');
    } else {
      if (!input.files.includes(path))
        errors.push('The referenced plan must be part of this PR.');
      if (!input.plan || !/^- R[1-9]\d*: .{12,}$/m.test(input.plan))
        errors.push('The plan needs numbered requirements (- R1: ...).');
    }
    if (added.length && !meaningful(content(all.get('Experiments'))))
      errors.push('Describe the new experiments in the Experiments section.');
    for (const id of added)
      if (!input.files.some((file) => ANALYSIS.exec(file)?.[1] === id))
        errors.push(
          `New experiment ${id} needs a companion behavioral analysis in experiment/analyses/${id}/.`,
        );
    if (input.files.length === 0)
      errors.push('No changed files were supplied.');
    return errors;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
