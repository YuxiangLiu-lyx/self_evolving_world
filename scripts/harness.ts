import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface TaskRoute {
  readonly kind: 'code' | 'experiment' | 'mixed';
  readonly files: readonly string[];
  readonly experiments: readonly string[];
}

/** Run artifacts, companion analyses and their plans qualify as experiment-only changes. */
export function classifyChanges(paths: readonly string[]): TaskRoute {
  const files = [...new Set(paths)].sort();
  const experiments = [
    ...new Set(
      files.flatMap(
        (path) =>
          /^experiment\/(?:analyses\/)?(ex[1-9]\d*)\//.exec(path)?.[1] ?? [],
      ),
    ),
  ].sort();
  const code = files.some(
    (path) =>
      !/^experiment\/(?:analyses\/)?ex[1-9]\d*\//.test(path) &&
      !/^docs\/exec-plans\/(active|completed)\/pr-\d+-.+\.md$/.test(path),
  );
  return {
    kind: experiments.length ? (code ? 'mixed' : 'experiment') : 'code',
    files,
    experiments,
  };
}

export function taskRoute(root: string, base = 'origin/main'): TaskRoute {
  const git = (...args: string[]): string[] =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10_000_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
  return classifyChanges([
    ...git('diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`),
    ...git('diff', '--name-only', '--no-renames', '-z', 'HEAD'),
    ...git('ls-files', '--others', '--exclude-standard', '-z'),
  ]);
}

/** Reuse is exceptional and must be visible in the current requirement-reviewed plan. */
export function checkArchivePreservation(
  root: string,
  base = 'origin/main',
): void {
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    }).trimEnd();
  const route = taskRoute(root, base);
  const exceptions = new Set<string>();
  for (const path of route.files.filter((file) =>
    /^docs\/exec-plans\/(active|completed)\/pr-\d+-.+\.md$/.test(file),
  )) {
    if (!existsSync(resolve(root, path))) continue;
    const plan = readFileSync(resolve(root, path), 'utf8');
    for (const match of plan.matchAll(
      /^- Experiment reuse: (ex[1-9]\d*) — (.{20,})$/gm,
    )) {
      if (match[1]) exceptions.add(match[1]);
    }
  }
  // One tree query covers every blob, including calls, snapshots and nested replay parts.
  const entries = git('ls-tree', '-r', '-z', base, '--', 'experiment')
    .split('\0')
    .filter(Boolean);
  const files = new Set<string>();
  const existing = new Set<string>();
  for (const entry of entries) {
    const match = /^([0-9]+) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match) throw new Error('Unsupported archive tree entry.');
    const [, mode, expected, file] = match;
    if (!file) throw new Error('Missing archive path.');
    const id = /^experiment\/(ex[1-9]\d*)\//.exec(file)?.[1];
    if (!id) continue;
    existing.add(id);
    files.add(file);
    if (exceptions.has(id)) continue;
    const path = resolve(root, file);
    if (mode !== '100644' || !existsSync(path) || !lstatSync(path).isFile())
      throw new Error(
        `Archived experiment cannot be removed or replaced: ${file}`,
      );
    const data = readFileSync(path);
    const actual = createHash(expected?.length === 64 ? 'sha256' : 'sha1')
      .update(`blob ${String(data.length)}\0`)
      .update(data)
      .digest('hex');
    if (actual !== expected)
      throw new Error(
        `Archived experiment changed: ${file}. Allocate a new exN, or record the user's explicit reuse instruction in the current plan.`,
      );
  }
  // Walk actual directories: ignored/untracked additions must not evade Git's diff.
  const visit = (directory: string): void => {
    for (const entry of readdirSync(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (!entry.isFile() || !files.has(file))
        throw new Error(`Cannot add files to an existing experiment: ${file}`);
    }
  };
  for (const id of existing) if (!exceptions.has(id)) visit(`experiment/${id}`);
}
