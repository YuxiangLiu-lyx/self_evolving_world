import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATTESTATIONS, planPath, pullRequestErrors } from './pr-policy.js';

const head = 'a'.repeat(40);
const path = 'docs/exec-plans/completed/pr-99-fixture.md';
const plan = `# Test plan

## Requirement summary

Record requested behavior before implementation.

## Requirements

- R1: Reject imports without changing existing state.
- R2: Keep the task requirements and results reviewable.

## Scope and exclusions

Only import validation and related documentation are changed.

## Acceptance criteria

Malformed input leaves the previous world intact.
`;
const body = `# Pull Request

## Requirements

- R1: Reject imports without changing existing state.
- R2: Keep the task requirements and results reviewable.

## Scope

- Plan: \`${path}\`
- In scope: Import validation, regression coverage, and the task plan.
- Out of scope: World rules and unrelated interface changes.

## Requirement review

| Requirement | Changed files and implementation | Verification evidence and findings | Result |
| --- | --- | --- | --- |
| R1 | \`apps/viewer/src/timeline.ts\` preserves state on invalid imports. | Existing invalid-import checks pass with unchanged session state. | PASS |
| R2 | \`${path}\` records the requested behavior and evidence. | Compared both requirements with the entire changed-file list. | PASS |

## Validation

- Reviewed head: ${head}
- Task: Fixture requirement verification
- Run ID: 12345678-1234-1234-1234-123456789abc
- Full suite: PASS
- Results: Full local validation passed, including unit and browser tests.
- Visual and behavior review: Inspected all five current images and import behavior.

## Code review

- Reviewer: Fixture reviewer
- Findings: Read the complete diff and checked both requirements; invalid inputs preserve state and no unrelated behavior changed.

## Documentation synchronization

PRODUCT and the task plan capture the change; module boundaries remain unchanged.

## Completion checklist

${ATTESTATIONS.map((item) => `- [x] ${item}`).join('\n')}
`;
const files = ['apps/viewer/src/timeline.ts', path];
const check = (
  override: Partial<Parameters<typeof pullRequestErrors>[0]> = {},
): string[] => pullRequestErrors({ body, plan, head, files, ...override });

describe('pull request requirements contract', () => {
  it('accepts concrete requirements, complete file coverage and current review', () => {
    expect(check()).toEqual([]);
  });
  it('rejects an untouched PR template', () => {
    expect(
      check({ body: readFileSync('.github/pull_request_template.md', 'utf8') })
        .length,
    ).toBeGreaterThan(0);
  });
  it('rejects changed requirement wording, missing requirements and duplicate IDs', () => {
    expect(
      check({
        body: body.replace(
          'Reject imports without changing existing state.',
          'Reject all replay imports without exceptions.',
        ),
      }),
    ).toContain(
      'PR requirements must exactly match the task plan requirements.',
    );
    expect(
      check({
        body: body.replace(
          '- R2: Keep the task requirements and results reviewable.',
          '',
        ),
      }),
    ).toContain(
      'PR requirements must exactly match the task plan requirements.',
    );
    expect(
      check({
        body: body.replace(
          '## Scope',
          '- R1: A duplicate requirement must be rejected.\n\n## Scope',
        ),
      }).join(),
    ).toContain('Duplicate requirement');
  });
  it('rejects unreviewed requirements, unrelated paths and missing changed files', () => {
    const withoutR2 = body
      .split('\n')
      .filter((line) => !line.startsWith('| R2 |'))
      .join('\n');
    expect(check({ body: withoutR2 }).join()).toContain(
      'Requirement is not reviewed: R2',
    );
    expect(check({ files: [...files, 'unrelated.ts'] }).join()).toContain(
      'Changed file is not reviewed: unrelated.ts',
    );
    expect(
      check({
        body: body.replace('`apps/viewer/src/timeline.ts`', '`made-up.ts`'),
      }).join(),
    ).toContain('unchanged or unknown file');
  });
  it('rejects missing or failing requirement evidence and pending tests', () => {
    expect(
      check({ body: body.replace('| PASS |', '| FAIL |') }).join(),
    ).toContain('has not passed review');
    expect(
      check({
        body: body.replace(
          'Existing invalid-import checks pass with unchanged session state.',
          'TODO',
        ),
      }).join(),
    ).toContain('verification findings');
    expect(
      check({
        body: body.replace('Full suite: PASS', 'Full suite: PENDING'),
      }).join(),
    ).toContain('Full automated suite');
  });
  it('rejects outdated head references and unchecked completion claims', () => {
    expect(check({ head: 'b'.repeat(40) }).join()).toContain('Review is stale');
    expect(check({ body: body.replace('[x]', '[ ]') }).join()).toContain(
      'Missing attestation',
    );
  });
  it('does not accept requirements hidden in a code block or a duplicate section', () => {
    expect(
      check({
        body: body.replace(
          '- R1: Reject imports without changing existing state.',
          '```text\n- R1: Reject imports without changing existing state.\n```',
        ),
      }).join(),
    ).toContain('exactly match');
    expect(
      check({
        body:
          body +
          '\n## Requirements\n\n- R3: Duplicated section is not accepted.',
      }).join(),
    ).toContain('Duplicate section');
  });
  it('rejects absent summaries, acceptance criteria, and plans outside the PR', () => {
    expect(
      check({
        plan: plan.replace('## Requirement summary', '## Other heading'),
      }).join(),
    ).toContain('Requirement summary');
    expect(
      check({
        plan: plan.replace('## Acceptance criteria', '## Other heading'),
      }).join(),
    ).toContain('Acceptance criteria');
    expect(check({ files: [files[0] ?? ''] }).join()).toContain(
      'task plan must be part',
    );
  });
  it('blocks traversal and arbitrary plan paths', () => {
    expect(() => planPath(body.replace(path, '../../private.md'))).toThrow(
      'repository execution plan',
    );
  });
  it('rejects placeholder review findings and missing validation identity', () => {
    expect(
      check({
        body: body.replace(
          'Findings: Read the complete diff',
          'Findings: REPLACE_ME Read the complete diff',
        ),
      }).join(),
    ).toContain('actual diff reviewer');
    expect(
      check({
        body: body.replace('12345678-1234-1234-1234-123456789abc', 'unknown'),
      }).join(),
    ).toContain('actual validation task and run ID');
  });
  it.each([
    [
      'a placeholder reviewer',
      'Reviewer: Fixture reviewer',
      'Reviewer: REPLACE_ME',
      'actual diff reviewer',
    ],
    [
      'a malformed run ID',
      '12345678-1234-1234-1234-123456789abc',
      '-'.repeat(36),
      'actual validation task and run ID',
    ],
    [
      'filenames without implementation prose',
      '`apps/viewer/src/timeline.ts` preserves state on invalid imports.',
      '`apps/viewer/src/timeline.ts`',
      'implementation and verification findings',
    ],
  ])('rejects %s', (_name, original, replacement, message) => {
    expect(
      check({ body: body.replace(original, replacement) }).join(),
    ).toContain(message);
  });
});
