import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.pnpm-store',
  'test-results',
  'playwright-report',
  'validation-results',
  'experiment-results',
]);
export function inputFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry) => {
      if (
        ignored.has(entry.name) ||
        entry.name === '.DS_Store' ||
        entry.name.endsWith('.tsbuildinfo') ||
        (entry.name.startsWith('.env') && entry.name !== '.env.example')
      )
        return [];
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Validation input cannot be a non-file symlink: ${path}`,
        );
      return entry.isDirectory()
        ? inputFiles(root, path)
        : [relative(root, path).replaceAll('\\', '/')];
    });
}
export function contentHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function fingerprint(
  root: string,
  select: (file: string) => boolean,
): string {
  const hash = createHash('sha256');
  for (const file of inputFiles(root).filter(select))
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(resolve(root, file)))
      .update('\0');
  hash.update(process.version).update(process.platform).update(process.arch);
  return hash.digest('hex');
}
export const toolchainInput = (p: string): boolean =>
  /(^|\/)(package\.json|tsconfig[^/]*\.json)$/.test(p) ||
  ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', '.npmrc'].includes(
    p,
  );
/** Conservative protocol ownership. Shared files and unknown names affect every version. */
export function protocolVersions(path: string): readonly number[] {
  const name = path.split('/').at(-1) ?? '';
  // The continuous family never imports the grid-family modules below.
  if (
    /^(continuous|forest|open|collective|long|material)-|^continuous\.ts$/.test(
      name,
    )
  )
    return [7];
  if (name === 'world.ts') return [1, 2, 3, 4, 5, 6];
  if (/^coevolution[-.]/.test(name)) return [6];
  if (/^evolution[-.]/.test(name)) return [5, 6];
  if (/^(learning[-.]|skill-)/.test(name)) return [4, 5, 6];
  if (/^(survival[-.]|program[.-])/.test(name)) return [3, 4, 5, 6];
  if (/^synchronous-/.test(name)) return [2];
  if (/^random-/.test(name)) return [1, 2];
  return [1, 2, 3, 4, 5, 6, 7];
}
export function runtimeInput(path: string, version: number): boolean {
  return (
    (path.startsWith('packages/world-core/src/') ||
      path.startsWith('apps/simulator/src/')) &&
    protocolVersions(path).includes(version)
  );
}
export function experimentInput(
  path: string,
  id: string,
  version: number,
): boolean {
  return (
    path.startsWith(`experiment/${id}/`) ||
    runtimeInput(path, version) ||
    toolchainInput(path) ||
    // Archive validators also consume these viewer-side replay/visual registries.
    (version <= 6 && path === 'apps/viewer/src/timeline.ts') ||
    (version === 7 && path === 'apps/viewer/src/continuous-visuals.ts') ||
    (path.startsWith('scripts/') &&
      !path.endsWith('.test.ts') &&
      /(?:experiments|analysis|source|store|preflight|smoke|validation-(?:cache|inputs))\.ts$/.test(
        path,
      ) &&
      protocolVersions(path).includes(version))
  );
}
export function archiveVersion(root: string, id: string): number {
  const path = resolve(root, 'experiment', id, 'manifest.json');
  if (!existsSync(path)) throw new Error(`Missing archive manifest: ${id}`);
  const value = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
  if (
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.version > 7
  )
    throw new Error(`Unknown archive version: ${id}`);
  return value.version;
}
