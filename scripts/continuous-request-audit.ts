import { posix } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ContinuousSourceRevision } from './continuous-source.js';
import type { V7Attempt } from '../apps/simulator/src/continuous-run.js';
import type { continuousRequest } from '../apps/simulator/src/continuous-provider.js';
import { continuousHash } from './continuous-store.js';

/** Bind calls to the exact retained attempt prefix, including same-round repairs. */
export function requestRevisionBoundaries(
  history: ContinuousSourceRevision[],
  attempts: V7Attempt[],
): number[] {
  const prefixes = new Map(
    Array.from({ length: attempts.length + 1 }, (_, i) => [
      continuousHash(attempts.slice(0, i)),
      i,
    ]),
  );
  let previous = 0;
  return history.map((revision, i) => {
    const boundary = prefixes.get(revision.attemptsHash);
    if (boundary === undefined || boundary < previous || (!i && boundary !== 0))
      throw new Error(
        'Source revision does not bind a retained attempt prefix.',
      );
    previous = boundary;
    return boundary;
  });
}

/** Evaluate reviewed, integrity-checked source without network or filesystem imports.
 * This is an archival request builder, never an inference or a security sandbox. */
export function retainedRequestBuilder(
  files: Record<string, string>,
): typeof continuousRequest {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const load = (path: string): Record<string, unknown> => {
    const existing = modules.get(path);
    if (existing) return existing.exports;
    const source = files[path];
    if (!source || !path.endsWith('.ts'))
      throw new Error(`Missing retained request dependency: ${path}`);
    const module = { exports: {} as Record<string, unknown> };
    modules.set(path, module);
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
      },
    }).outputText;
    runInNewContext(
      output,
      {
        module,
        exports: module.exports,
        require: (specifier: string) => {
          if (specifier === '@self-evolving-world/world-core')
            return load('packages/world-core/src/index.ts');
          if (!specifier.startsWith('.'))
            throw new Error(
              `External retained request import rejected: ${specifier}`,
            );
          return load(
            posix
              .normalize(posix.join(posix.dirname(path), specifier))
              .replace(/\.js$/, '.ts'),
          );
        },
      },
      { filename: path, timeout: 5000 },
    );
    return module.exports;
  };
  const builder = load(
    'apps/simulator/src/continuous-provider.ts',
  ).continuousRequest;
  if (typeof builder !== 'function')
    throw new Error('Missing retained request builder.');
  return builder as typeof continuousRequest;
}
