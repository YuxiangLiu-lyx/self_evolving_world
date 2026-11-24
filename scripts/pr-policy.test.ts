import { describe, expect, it } from 'vitest';
import { planPath, pullRequestErrors } from './pr-policy.js';

const PLAN_PATH = 'docs/exec-plans/active/pr-40-focused-change.md';
const PLAN = `# Focused change\n\n## Requirements\n\n- R1: The viewer shows the selected actor's inventory.\n`;
const body = (plan = `\`${PLAN_PATH}\``, extra = ''): string =>
  `# PR\n\n## Summary\n\nShow the selected actor's inventory in the inspector.\n\n## Plan\n\n- Plan: ${plan}\n\n## Validation\n\npnpm validate passed; inspected the desktop and mobile screenshots.\n${extra}`;

describe('lightweight PR contract', () => {
  it('accepts a complete description with a changed plan', () => {
    expect(
      pullRequestErrors({
        body: body(),
        plan: PLAN,
        files: [PLAN_PATH, 'apps/viewer/src/main.ts'],
        baseArchives: ['ex1'],
      }),
    ).toEqual([]);
  });
  it('accepts `none` for small changes without new experiments', () => {
    expect(planPath(body('none'))).toBeNull();
    expect(
      pullRequestErrors({
        body: body('none'),
        plan: null,
        files: ['README.md'],
        baseArchives: [],
      }),
    ).toEqual([]);
  });
  it('rejects placeholders, missing sections and unchanged or unnumbered plans', () => {
    const errors = pullRequestErrors({
      body: body().replace(
        "Show the selected actor's inventory in the inspector.",
        'REPLACE_ME',
      ),
      plan: '# Plan without requirements',
      files: ['apps/viewer/src/main.ts'],
      baseArchives: [],
    });
    expect(errors.join('\n')).toContain('Summary');
    expect(errors.join('\n')).toContain('part of this PR');
    expect(errors.join('\n')).toContain('numbered requirements');
    expect(
      pullRequestErrors({
        body: body('`docs/elsewhere.md`'),
        plan: null,
        files: ['x'],
        baseArchives: [],
      }).join(),
    ).toContain('Plan must be');
  });
  it('requires a plan, description and companion analysis for each new experiment', () => {
    const files = [PLAN_PATH, 'experiment/ex14/manifest.json'];
    const missing = pullRequestErrors({
      body: body(),
      plan: PLAN,
      files,
      baseArchives: ['ex13'],
    }).join('\n');
    expect(missing).toContain('Experiments section');
    expect(missing).toContain('ex14 needs a companion');
    expect(
      pullRequestErrors({
        body: body('none'),
        plan: null,
        files,
        baseArchives: ['ex13'],
      }).join(),
    ).toContain('needs an execution plan');
    expect(
      pullRequestErrors({
        body: body(
          `\`${PLAN_PATH}\``,
          '\n## Experiments\n\nNew ex14 open-development window with its analysis.\n',
        ),
        plan: PLAN,
        files: [...files, 'experiment/analyses/ex14/pr-40-focused-change.json'],
        baseArchives: ['ex13'],
      }),
    ).toEqual([]);
  });
});
