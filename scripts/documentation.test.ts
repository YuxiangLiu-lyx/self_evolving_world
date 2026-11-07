import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDocumentation, REQUIRED_DOCUMENTS } from './documentation.js';

describe('documentation structural checks', () => {
  let root: string;
  const write = (path: string, content: string): void => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sew-docs-'));
    for (const path of REQUIRED_DOCUMENTS) write(path, '# Fixture\n');
    write('docs/decisions/0001-fixture.md', '# Decision\n');
    write('docs/exec-plans/completed/pr-00-fixture.md', '# Plan\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts valid navigation, reference links, images and Unicode/duplicate headings', () => {
    write(
      'docs/target.md',
      '# \u6982\u89c8\n\n## API `tick`\n\n## Repeat\n\n## Repeat\n',
    );
    write('docs/image.svg', '<svg/>');
    write(
      'README.md',
      [
        '# Read me',
        '[\u6982\u89c8](docs/target.md#\u6982\u89c8)',
        '[inline](docs/target.md#api-tick)',
        '[duplicate](docs/target.md#repeat-1)',
        '[reference][target]',
        '[target]: docs/target.md#repeat',
        '![diagram](docs/image.svg)',
        '[docs](docs/)',
        '[self](#read-me)',
        '[external](https://example.invalid/never-fetched)',
      ].join('\n\n'),
    );
    expect(checkDocumentation(root)).toEqual([]);
  });

  it('supports encoded filenames and query strings', () => {
    write('docs/my guide.md', '# Guide\n');
    write('README.md', '# Read\n[guide](docs/my%20guide.md?view=1#guide)\n');
    expect(checkDocumentation(root)).toEqual([]);
  });

  it('ignores links inside code and generated directories', () => {
    write(
      'README.md',
      '# Read\n\n```md\n[example](missing.md)\n```\n\n`[example](missing.md)`\n',
    );
    write('node_modules/example/README.md', '[broken](missing.md)');
    write('apps/simulator/dist/example.md', '[broken](missing.md)');
    expect(checkDocumentation(root)).toEqual([]);
  });

  it('reports missing and empty required documents', () => {
    rmSync(join(root, 'AGENTS.md'));
    write('ARCHITECTURE.md', ' \n');
    expect(checkDocumentation(root)).toEqual(
      expect.arrayContaining([
        'AGENTS.md: required document is missing.',
        'ARCHITECTURE.md: required document is empty.',
      ]),
    );
  });

  it('requires plan directories, a numbered ADR and an execution plan', () => {
    rmSync(join(root, 'docs/exec-plans/completed'), { recursive: true });
    rmSync(join(root, 'docs/decisions/0001-fixture.md'));
    const errors = checkDocumentation(root).join('\n');
    expect(errors).toContain('required plan directory is missing');
    expect(errors).toContain('at least one numbered ADR');
    expect(errors).toContain('at least one PR execution plan');
  });

  it.each([
    ['[broken](docs/missing.md)', 'missing local target'],
    ['[broken](AGENTS.md#missing)', 'no matching heading anchor'],
    ['![broken](missing.png)', 'missing local target'],
    ['[broken][ref]\n\n[ref]: missing.md', 'missing local target'],
    ['[escape](../outside.md)', 'escapes the repository'],
    ['[absolute](/tmp/example.md)', 'repository-relative'],
    ['[bad](docs/%FF.md)', 'invalid URL encoding'],
    ['[file](file:///tmp/example.md)', 'repository-relative'],
    ['[script](javascript:alert)', 'repository-relative'],
  ])('rejects %s with a readable diagnosis', (link, message) => {
    write('README.md', `# Read\n\n${link}\n`);
    expect(checkDocumentation(root).join('\n')).toContain(message);
  });

  it('rejects symlinks that leave the repository', () => {
    symlinkSync(tmpdir(), join(root, 'outside'));
    write('README.md', '# Read\n\n[escape](outside/)\n');
    expect(checkDocumentation(root).join('\n')).toContain('symlink outside');
  });
});
