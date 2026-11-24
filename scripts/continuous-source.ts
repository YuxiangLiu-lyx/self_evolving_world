import { parseContinuousReviews } from '../apps/simulator/src/continuous-run.js';
import type { V7Review } from '@self-evolving-world/world-core';
import { isDevelopmentReviewer } from '../apps/simulator/src/development-identity.js';
import type { DevelopmentReviewer } from '../apps/simulator/src/development-identity.js';
import { CONTINUOUS_VISUALS } from '../apps/viewer/src/continuous-visuals.js';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  continuousRegistry,
  v7Install,
  v7Record,
  v7Signature,
} from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import {
  continuousAtomic,
  continuousHash,
  continuousRead,
  continuousWorking,
  reconstructContinuousSegment,
  buildContinuousReplay,
} from './continuous-store.js';
import type { V7ReplaySegment } from './continuous-store.js';

export interface ContinuousSourceRevision {
  id: number;
  tick: number;
  sourceHash: string;
  files: Record<string, string>;
  packages: string[];
  reason: string;
  previousWorldHash: string;
  attemptsHash: string;
  validation: { path: string; sha256: string } | null;
}
export function continuousSources(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const full = resolve(path, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          'Versioned source and assets cannot escape through symlinks.',
        );
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name !== '.DS_Store')
        files[relative(root, full)] = /\.(ts|css|svg|json|html|md|txt)$/.test(
          entry.name,
        )
          ? readFileSync(full, 'utf8')
          : `base64:${readFileSync(full).toString('base64')}`;
    }
  };
  for (const path of [
    'packages/world-core/src',
    'apps/simulator/src',
    'apps/viewer/src',
    'packages/world-core/test',
    'apps/simulator/test',
    'apps/viewer/test',
    'apps/viewer/e2e',
  ])
    visit(resolve(root, path));
  if (existsSync(resolve(root, 'apps/viewer/public')))
    visit(resolve(root, 'apps/viewer/public'));
  for (const file of readdirSync(resolve(root, 'scripts')).filter(
    (p) =>
      (p.startsWith('continuous-') ||
        p.startsWith('forest-') ||
        p.startsWith('open-') ||
        p.startsWith('long-') ||
        p.startsWith('collective-')) &&
      p.endsWith('.ts'),
  ))
    files[`scripts/${file}`] = readFileSync(
      resolve(root, 'scripts', file),
      'utf8',
    );
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'apps/viewer/index.html',
    'apps/viewer/classic.html',
    'apps/viewer/observatory.html',
    'apps/viewer/forest-lab.html',
    'apps/viewer/vite.config.ts',
    'packages/world-core/package.json',
    'apps/simulator/package.json',
    'apps/viewer/package.json',
  ])
    files[path] = readFileSync(resolve(root, path), 'utf8');
  return files;
}
/** Runtime identity excludes acceptance tooling/tests while retained snapshots keep their original full hashes. */
export function continuousRuntimeSources(
  files: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).flatMap(([path, value]) => {
      if (
        path.startsWith('packages/world-core/src/') ||
        path.startsWith('apps/simulator/src/') ||
        path.startsWith('apps/viewer/src/') ||
        path.startsWith('apps/viewer/public/') ||
        /^scripts\/continuous-(cli|store|window)\.ts$/.test(path)
      )
        return [[path, value]];
      if (path.endsWith('package.json')) {
        const p = JSON.parse(value) as {
          dependencies?: unknown;
          optionalDependencies?: unknown;
          engines?: unknown;
        };
        return [
          [
            path,
            JSON.stringify({
              dependencies: p.dependencies,
              optionalDependencies: p.optionalDependencies,
              engines: p.engines,
            }),
          ],
        ];
      }
      return [];
    }),
  );
}
export function continuousRuntimeHash(files: Record<string, string>): string {
  return continuousHash(continuousRuntimeSources(files));
}
export function currentContinuousRuntimeMatches(
  root: string,
  id: string,
): boolean {
  const revision = continuousHistory(root, id).at(-1);
  if (!revision) return false;
  const retained = continuousRead<Record<string, string>>(
    resolve(
      root,
      'experiment',
      id,
      'sources',
      `revision-${String(revision.id)}.json`,
    ),
  );
  if (continuousHash(retained) !== revision.sourceHash)
    throw new Error('Retained runtime source integrity failed.');
  return (
    continuousRuntimeHash(retained) ===
    continuousRuntimeHash(continuousSources(root))
  );
}
export function continuousHistory(
  root: string,
  id: string,
): ContinuousSourceRevision[] {
  return continuousRead<ContinuousSourceRevision[]>(
    resolve(root, 'experiment', id, 'source-history.json'),
  );
}
export function saveContinuousSource(
  root: string,
  id: string,
  state: V7Execution,
  reason: string,
  validation: ContinuousSourceRevision['validation'] = null,
): void {
  const directory = resolve(root, 'experiment', id),
    path = resolve(directory, 'source-history.json');
  const history = existsSync(path) ? continuousHistory(root, id) : [],
    files = continuousSources(root),
    number = history.length + 1;
  const snapshot = `sources/revision-${String(number)}.json`;
  mkdirSync(dirname(resolve(directory, snapshot)), { recursive: true });
  writeFileSync(resolve(directory, snapshot), JSON.stringify(files) + '\n', {
    flag: 'wx',
  });
  history.push({
    id: number,
    tick: state.world.tick,
    sourceHash: continuousHash(files),
    files: Object.fromEntries(
      Object.entries(files).map(([p, s]) => [p, continuousHash(s)]),
    ),
    packages: state.world.revisions,
    reason,
    previousWorldHash: continuousHash(state.world),
    attemptsHash: continuousHash(state.attempts),
    validation,
  });
  continuousAtomic(path, history);
}
export function captureContinuousBaseline(
  root: string,
  id: string,
  state: V7Execution,
): void {
  if (
    state.phase !== 'development' ||
    !state.barrier ||
    !currentContinuousRuntimeMatches(root, id)
  )
    return;
  const path = resolve(
      continuousWorking(root, id),
      `${state.barrier.id}-baseline.json`,
    ),
    baseline = {
      world: continuousHash(state.world),
      attempts: continuousHash(state.attempts),
      barrier: continuousHash({ ...state.barrier, developmentAttempt: null }),
      history: continuousHash(continuousHistory(root, id)),
      source: continuousHash(continuousSources(root)),
    };
  if (existsSync(path)) {
    if (!sameDevelopmentBaseline(continuousRead(path), baseline))
      throw new Error('Development baseline changed.');
  } else continuousAtomic(path, baseline);
}
/** Called only after currentContinuousRuntimeMatches: test/tool edits cannot invalidate paid world/call identity. */
export function sameDevelopmentBaseline(
  recorded: unknown,
  current: {
    world: string;
    attempts: string;
    barrier: string;
    history: string;
    source: string;
  },
): boolean {
  const saved = v7Record(recorded);
  return (
    typeof saved.source === 'string' &&
    /^[a-f0-9]{64}$/.test(saved.source) &&
    v7Signature(saved) === v7Signature({ ...current, source: saved.source })
  );
}
/** The coding conversation a declaration names. Named long scenarios must record it;
 * ex13 and earlier declarations never did, and remain valid without it. */
export function declaredDeveloper(
  declaration: Record<string, unknown>,
  world: V7Execution['world'],
): DevelopmentReviewer | undefined {
  const developer = declaration.developer;
  if (developer !== undefined && !isDevelopmentReviewer(developer))
    throw new Error(
      'The developer must name the coding conversation that performed the work.',
    );
  if (developer === undefined && world.config.longDevelopment?.scenario)
    throw new Error(
      'Development in a named long scenario must record its developer.',
    );
  return developer;
}

/** Manifest-declared source changes, full tests and exact old-prefix replay replace the old five-file allowlist. */
export function validateContinuousDevelopment(
  root: string,
  id: string,
  state: V7Execution,
  input: unknown,
): {
  world: V7Execution['world'];
  packages: string[];
  assignments: Record<string, string>;
  reviews: V7Review[];
  review: string;
  validation: ContinuousSourceRevision['validation'];
  developer?: DevelopmentReviewer;
} {
  const declaration = v7Record(input),
    packages = declaration.packages,
    paths = declaration.paths,
    assignments = v7Record(declaration.assignments);
  if (
    !state.barrier ||
    !Array.isArray(packages) ||
    packages.some((p) => typeof p !== 'string') ||
    !Array.isArray(paths) ||
    paths.some((p) => typeof p !== 'string') ||
    typeof declaration.review !== 'string' ||
    declaration.review.length < 40
  )
    throw new Error(
      'Development requires versioned packages, all changed source paths, requester assignments and a substantive implementation review.',
    );
  const developer = declaredDeveloper(declaration, state.world);
  const baseline = continuousRead<{
    world: string;
    attempts: string;
    barrier: string;
    history: string;
  }>(resolve(continuousWorking(root, id), `${state.barrier.id}-baseline.json`));
  if (
    baseline.world !== continuousHash(state.world) ||
    baseline.attempts !== continuousHash(state.attempts) ||
    baseline.barrier !==
      continuousHash({ ...state.barrier, developmentAttempt: null }) ||
    baseline.history !== continuousHash(continuousHistory(root, id))
  )
    throw new Error(
      'Saved world, calls or development barrier changed during development.',
    );
  const reviews = state.barrier.reviews.length
    ? state.barrier.reviews
    : parseContinuousReviews(
        JSON.stringify({ reviews: declaration.reviews }),
        state.barrier,
        state.world,
      );
  const previous = continuousHistory(root, id).at(-1);
  if (!previous) throw new Error('Missing retained source baseline.');
  const current = continuousSources(root);
  const beforeRuntime = continuousRuntimeSources(
    continuousRead<Record<string, string>>(
      resolve(
        root,
        'experiment',
        id,
        'sources',
        `revision-${String(previous.id)}.json`,
      ),
    ),
  );
  const afterRuntime = continuousRuntimeSources(current);
  const changed = [
    ...new Set([...Object.keys(beforeRuntime), ...Object.keys(afterRuntime)]),
  ]
    .filter((p) => beforeRuntime[p] !== afterRuntime[p])
    .sort();
  const declaredRuntime = (paths as string[])
    .filter((p) => p in beforeRuntime || p in afterRuntime)
    .sort();
  if (v7Signature(changed) !== v7Signature(declaredRuntime))
    throw new Error(
      `Declared runtime source paths must match actual changes: ${changed.join(', ')}`,
    );
  // These enforce experiment identity, authorization and exactly-once budgets rather than world design.
  const protectedPaths =
    /(^scripts\/continuous-|continuous-policy\.ts$|(continuous-(run|provider|input)|long-(context|request|tokens|scenario|pressure))\.ts$|packages\/world-core\/src\/world\.ts$|chatgpt-auth\.ts$|responses\.ts$|package\.json$|pnpm-lock\.yaml$)/;
  if (changed.some((p) => !current[p] || protectedPaths.test(p)))
    throw new Error(
      'The run policy, controller, transport, source verifier and historical foundation require a separate run version. Source versions cannot be deleted.',
    );
  const directory = resolve(root, 'experiment', id),
    attempt = state.barrier.developmentAttempt;
  const log = `development/${String(attempt)}-validation.txt`;
  mkdirSync(dirname(resolve(directory, log)), { recursive: true });
  const commands = [['typecheck'], ['architecture:check'], ['test'], ['build']];
  let output = '';
  for (const args of commands) {
    const run = spawnSync('pnpm', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32_000_000,
    });
    output += `$ pnpm ${args.join(' ')}\n${run.stdout}${run.stderr}\n`;
    writeFileSync(resolve(directory, log), output);
    if (run.status !== 0)
      throw new Error(
        `Versioned development validation failed: pnpm ${args.join(' ')}`,
      );
  }
  const initial = continuousRead<V7Execution['world']>(
      resolve(directory, 'initial.json'),
    ),
    index = buildContinuousReplay(root, id, initial, state);
  for (const part of index.segments)
    reconstructContinuousSegment(
      continuousRead<V7ReplaySegment>(resolve(directory, part.path)),
    );
  output +=
    'Every saved round reconstructed with identical world and event hashes.\n';
  writeFileSync(resolve(directory, log), output);
  let world = state.world;
  const registry = continuousRegistry(state.world);
  for (const key of packages as string[]) {
    const pkg = registry.packages.find(
      (p) => `${p.id}@${String(p.version)}` === key,
    );
    if (
      !pkg ||
      !pkg.visualComponents.every(
        (component) => typeof CONTINUOUS_VISUALS[component] === 'function',
      )
    )
      throw new Error('Package visual implementation is absent.');
    world = v7Install(world, registry, key);
  }
  const assigned: Record<string, string> = {};
  for (const review of reviews.filter((r) => r.decision === 'develop')) {
    const ability = assignments[review.actor];
    if (
      typeof ability !== 'string' ||
      !world.abilities.some(
        (a) =>
          a.id === ability &&
          (a.learning === review.learning ||
            (state.world.actors
              .find((actor) => actor.id === review.actor)
              ?.mastered.includes(a.id) &&
              state.world.abilities.some(
                (old) => old.id === a.id && old.learning === a.learning,
              ))),
      )
    )
      throw new Error(
        'Every development requester needs an implemented interface with the reviewed learning duration.',
      );
    assigned[review.actor] = ability;
  }
  return {
    world,
    packages: packages as string[],
    assignments: assigned,
    reviews,
    review: declaration.review,
    validation: {
      path: log,
      sha256: continuousHash(readFileSync(resolve(directory, log), 'utf8')),
    },
    ...(developer === undefined ? {} : { developer }),
  };
}
