import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import { longTokenBudget } from '../apps/simulator/src/long-tokens.js';
import { collectiveSettle } from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../apps/simulator/src/collective-scenario.js';
import { OPEN_CONFIG } from '../apps/simulator/src/open-scenario.js';
import { FOREST_EXPERIENCE_CONFIG } from '../apps/simulator/src/forest-experience-scenario.js';
import { FOREST_CONFIG } from '../apps/simulator/src/forest-scenario.js';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  v7AssertWorld,
  v7CanonicalNumbers,
  v7Signature,
  v7Clone,
  V7_CONFIG,
  v7Install,
  v7Step,
  continuousRegistry,
  openSaveProjects,
  v7PrepareReplayCursors,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import type { V7World, V7Cursor } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7Sink,
  V7CallRecord,
  V7RoundRecord,
} from '../apps/simulator/src/continuous-run.js';

export const continuousHash = (value: unknown): string =>
  createHash('sha256')
    .update(
      typeof value === 'string' || value instanceof Uint8Array
        ? value
        : v7Signature(value),
    )
    .digest('hex');
export function continuousAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value) + '\n');
  renameSync(`${path}.tmp`, path);
}
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Checkpoint and replay validators narrow this private JSON boundary.
export function continuousRead<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
function immutable(path: string, value: unknown): void {
  if (existsSync(path)) {
    if (continuousHash(continuousRead<unknown>(path)) !== continuousHash(value))
      throw new Error(`Immutable journal mismatch: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx' });
}
export interface V7StoredRound extends V7RoundRecord {
  /** Additional canonical-precision proof for a retained pre-round shape migration; raw before remains authoritative. */
  registrationPrecisionHash?: string;
  before: string;
  after: string;
}
export interface V7ReplaySegment {
  version: 7;
  start: number;
  initial: V7World;
  rounds: V7StoredRound[];
  /** Experience operations bind exact identities and progress across segment boundaries. */
  initialCursors?: Record<string, V7Cursor>;
}
export interface V7ReplayIndex {
  format: 'self-evolving-world/replay';
  version: 7;
  protocol: 'continuous-v1';
  observed: number;
  target: number;
  phase: V7Execution['phase'];
  segments: { path: string; start: number; end: number; sha256: string }[];
}
export function continuousWorking(root: string, id: string): string {
  return resolve(root, 'validation-results/continuous', id);
}
export function readContinuousExecution(root: string, id: string): V7Execution {
  const path = resolve(root, 'experiment', id, 'execution.json');
  let state = continuousRead<V7Execution>(path);
  const header = continuousRead<{
    version?: unknown;
    world: { protocol?: unknown };
  }>(path);
  if (
    header.version !== 7 ||
    header.world.protocol !== 'continuous-v1' ||
    !Array.isArray(state.attempts) ||
    !Array.isArray(state.developments) ||
    v7Signature(state.world.config) !==
      v7Signature(
        state.world.config.longDevelopment
          ? initialLongWorld(`long-${id}`).config
          : state.world.config.collective
            ? initialCollectiveWorld(
                `collective-${id}`,
                state.world.config.collective.arm,
              ).config
            : state.world.config.development
              ? {
                  ...OPEN_CONFIG,
                  development: {
                    ...OPEN_CONFIG.development,
                    scope: `open-${id}`,
                  },
                }
              : state.world.config.experience
                ? FOREST_EXPERIENCE_CONFIG
                : state.world.config.forest
                  ? FOREST_CONFIG
                  : V7_CONFIG,
      )
  )
    throw new Error(
      'Invalid continuous checkpoint or modified protected run configuration.',
    );
  // A round commit may be durable even if the following state replacement was interrupted.
  const next = resolve(
    continuousWorking(root, id),
    'rounds',
    `${String(state.world.tick + 1).padStart(6, '0')}.json`,
  );
  if (existsSync(next)) {
    const commit = continuousRead<{
      record: V7StoredRound;
      state: V7Execution;
    }>(next);
    if (
      commit.record.before !== continuousHash(state.world) ||
      commit.record.after !== continuousHash(commit.state.world)
    )
      throw new Error(
        'Interrupted round commit does not match its checkpoint.',
      );
    state = commit.state;
    continuousAtomic(path, state);
  }
  v7AssertWorld(state.world);
  for (const role of ['ordinary', 'world'] as const)
    if (
      state.attempts.filter((a) => a.role === role).length >
      state.world.config.budgets[role]
    )
      throw new Error(
        'Recorded model attempts exceed the fixed shared budget.',
      );
  if (state.developments.length > state.world.config.budgets.development)
    throw new Error(
      'Recorded development handoffs exceed their fixed shared budget.',
    );
  const policy = state.world.config.collective;
  const boundary = state.collectiveContinuation;
  if (
    boundary &&
    (!policy ||
      policy.arm !== 'B' ||
      state.windowTarget !== 1600 ||
      !Number.isSafeInteger(boundary.round) ||
      boundary.round < 0 ||
      boundary.round > policy.shortRounds ||
      boundary.round > state.world.tick ||
      !Number.isSafeInteger(boundary.attempts) ||
      boundary.attempts < 0 ||
      boundary.attempts > state.attempts.length ||
      !Number.isSafeInteger(boundary.developments) ||
      boundary.developments < 0 ||
      boundary.developments > state.developments.length)
  )
    throw new Error('Invalid retained collective continuation boundary.');
  if (policy && !boundary && state.world.tick > policy.shortRounds)
    throw new Error(
      'Short collective observation advanced without its preserved continuation boundary.',
    );
  if (boundary && policy) {
    const preserved = continuousRead<V7Execution>(
      resolve(
        root,
        'experiment',
        id,
        'windows',
        `through-${String(policy.shortRounds)}`,
        'execution.json',
      ),
    );
    if (
      preserved.collectiveContinuation ||
      preserved.world.tick !== boundary.round ||
      preserved.attempts.length !== boundary.attempts ||
      preserved.developments.length !== boundary.developments ||
      continuousHash(preserved.attempts) !==
        continuousHash(state.attempts.slice(0, boundary.attempts)) ||
      continuousHash(preserved.developments) !==
        continuousHash(state.developments.slice(0, boundary.developments))
    )
      throw new Error(
        'Continuation counters do not match the preserved short checkpoint.',
      );
  }
  if (policy)
    for (const short of [true, false]) {
      const split = boundary?.attempts ?? state.attempts.length;
      const attempts = short
        ? state.attempts.slice(0, split)
        : state.attempts.slice(split);
      for (const role of ['ordinary', 'world', 'development'] as const) {
        const count =
          role === 'development'
            ? short
              ? (boundary?.developments ?? state.developments.length)
              : state.developments.length -
                (boundary?.developments ?? state.developments.length)
            : attempts.filter((a) => a.role === role).length;
        const limit = short
          ? policy.shortBudgets[role]
          : state.world.config.budgets[role] - policy.shortBudgets[role];
        if (count > limit)
          throw new Error(
            'A collective phase exceeded its frozen call allocation.',
          );
      }
      let charged = 0;
      for (const attempt of attempts) {
        if (
          !Number.isSafeInteger(attempt.reservedTokens) ||
          (attempt.reservedTokens ?? 0) <= 0
        )
          throw new Error(
            'Every collective attempt requires a positive durable token reservation.',
          );
        if (
          attempt.usage &&
          [attempt.usage.inputTokens, attempt.usage.outputTokens].some(
            (n) => !Number.isSafeInteger(n) || n < 0,
          )
        )
          throw new Error('Invalid measured token usage.');
        charged += attempt.usage
          ? attempt.usage.inputTokens + attempt.usage.outputTokens
          : (attempt.reservedTokens ?? 0);
      }
      if (
        charged >
        (short
          ? policy.tokens.short
          : policy.tokens.total - policy.tokens.short)
      )
        throw new Error(
          'A collective phase exceeded its measured/reserved token allocation.',
        );
    }
  if (state.world.config.longDevelopment) {
    for (const attempt of state.attempts) {
      if (
        !Number.isSafeInteger(attempt.reservedTokens) ||
        (attempt.reservedTokens ?? 0) <= 0 ||
        !attempt.requestMeasure
      )
        throw new Error('Missing complete-request measurement/reservation.');
      if (
        attempt.usage &&
        ([attempt.usage.inputTokens, attempt.usage.outputTokens].some(
          (n) => !Number.isSafeInteger(n) || n < 0,
        ) ||
          attempt.usage.outputTokens >
            state.world.config.longDevelopment.outputTokens)
      )
        throw new Error('Invalid long-run usage.');
    }
    const budget = longTokenBudget(state);
    if (budget && budget.used > budget.limit)
      throw new Error(
        'Long-run shared measured/reserved token ceiling exceeded.',
      );
  }
  return state;
}
export function continuousSink(root: string, id: string): V7Sink {
  const directory = resolve(root, 'experiment', id),
    working = continuousWorking(root, id);
  return {
    save: (state) => {
      continuousAtomic(resolve(directory, 'execution.json'), state);
      return Promise.resolve();
    },
    call: (record) => {
      immutable(
        resolve(directory, 'calls', `${record.attempt.id}.json`),
        record,
      );
      return Promise.resolve();
    },
    findCall: (callId) => {
      const path = resolve(directory, 'calls', `${callId}.json`);
      return Promise.resolve(
        existsSync(path) ? continuousRead<V7CallRecord>(path) : null,
      );
    },
    round: (record, state) => {
      const normalized: V7StoredRound = {
        ...record,
        before: continuousHash(record.before),
        after: continuousHash(record.after),
      };
      immutable(
        resolve(
          working,
          'rounds',
          `${String(record.tick).padStart(6, '0')}.json`,
        ),
        { record: normalized, state },
      );
      if (record.tick % 20 === 0)
        console.log(
          `${id}: ${String(record.tick)}/${String(state.windowTarget)} rounds; ${String(state.attempts.length)} model attempts; ${String(state.developments.length)} development handoffs; ${state.phase}`,
        );
      return Promise.resolve();
    },
    checkpoint: (state, reason) => {
      if (
        state.world.config.forest &&
        state.world.tick === 200 &&
        reason.startsWith('Scheduled')
      ) {
        v7AssertWorld(state.world, continuousRegistry(state.world));
        if (
          state.pendingCall ||
          state.barrier ||
          state.attempts.some((a) => a.status === 'started')
        )
          throw new Error(
            'Technical checkpoint has an unsettled call or round barrier.',
          );
        immutable(resolve(directory, 'checkpoints', 'technical-000200.json'), {
          kind: 'technical-checkpoint',
          tick: 200,
          worldHash: continuousHash(state.world),
          assertions: [
            'world-invariants-checked',
            'no-unsettled-round-or-call',
            'durable-round-prefix',
            'automatic-continuation-without-actor-guidance',
          ],
          attempts: state.attempts.length,
          developmentHandoffs: state.developments.length,
          season: state.world.state.season,
          lives: state.world.actors.map((a) => ({ id: a.id, life: a.life })),
          decision: 'continue',
        });
      }
      const key = reason.startsWith('Scheduled')
        ? `stage-${String(state.world.tick).padStart(6, '0')}`
        : `${state.phase}-${String(state.world.tick).padStart(6, '0')}-${String(state.attempts.length)}-${String(state.developments.length)}`;
      immutable(resolve(directory, 'checkpoints', `${key}.json`), {
        reason,
        state,
      });
      if (reason.startsWith('Scheduled')) {
        const report = continuousStage(state);
        immutable(
          resolve(
            directory,
            'stages',
            `${String(state.world.tick).padStart(6, '0')}.json`,
          ),
          report,
        );
        writeFileSync(
          resolve(
            directory,
            'stages',
            `${String(state.world.tick).padStart(6, '0')}.md`,
          ),
          `# Observation at Round ${String(state.world.tick)}\n\nThis report is generated from saved state and is not sent to actors.\n\n${JSON.stringify(
            report,
            null,
            2,
          )
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n')}\n`,
        );
      }
      return Promise.resolve();
    },
  };
}
export function continuousStage(state: V7Execution) {
  return {
    tick: state.world.tick,
    phase: state.phase,
    survivors: state.world.actors.filter((a) => a.vitals.health > 0).length,
    actors: state.world.actors.map((a) => ({
      id: a.id,
      position: a.position,
      vitals: a.vitals,
      wellbeing: a.wellbeing,
      mastered: a.mastered,
      learning: a.learning,
      intention: state.cursors[a.id]?.plan.intention ?? '',
      notes: a.memory.notes,
      preferences: a.memory.preferences,
    })),
    objects: state.world.objects.length,
    processes: state.world.processes.length,
    resources: state.world.resources.length,
    calls: {
      ordinary: state.attempts.filter((a) => a.role === 'ordinary').length,
      world: state.attempts.filter((a) => a.role === 'world').length,
      developmentHandoffs: state.developments.length,
      developmentInternalModelCalls: null,
    },
    revisions: state.world.revisions,
  };
}
export function buildContinuousReplay(
  root: string,
  id: string,
  initial: V7World,
  state: V7Execution,
): V7ReplayIndex {
  const directory = resolve(root, 'experiment', id),
    index: V7ReplayIndex = {
      format: 'self-evolving-world/replay',
      version: 7,
      protocol: 'continuous-v1',
      observed: state.world.tick,
      target: state.windowTarget,
      phase: state.phase,
      segments: [],
    };
  const oldIndexPath = resolve(directory, 'replay.json');
  const oldIndex = existsSync(oldIndexPath)
    ? continuousRead<V7ReplayIndex>(oldIndexPath)
    : null;
  const restored = new Map<number, { record: V7StoredRound; world: V7World }>();
  let start = initial;
  let initialCursors: Record<string, V7Cursor> = {};
  // Segment size is a storage/cache choice, not a world or observation-window limit.
  for (let first = 1; first <= state.world.tick; first += 100) {
    const rounds: V7StoredRound[] = [];
    let last = start;
    for (
      let tick = first;
      tick <= Math.min(state.world.tick, first + 99);
      tick++
    ) {
      const journal = resolve(
        continuousWorking(root, id),
        'rounds',
        `${String(tick).padStart(6, '0')}.json`,
      );
      if (!existsSync(journal) && !restored.has(tick)) {
        const part = oldIndex?.segments.find(
          (p) => p.start < tick && p.end >= tick,
        );
        if (!part)
          throw new Error('Missing durable round and retained replay prefix.');
        const source = readFileSync(resolve(directory, part.path), 'utf8');
        if (continuousHash(source) !== part.sha256)
          throw new Error(
            'Retained segment integrity failed during continuation.',
          );
        const segment = JSON.parse(source) as V7ReplaySegment,
          frames = reconstructContinuousSegment(segment);
        segment.rounds.forEach((record, index) => {
          const world = frames[index + 1];
          if (!world) throw new Error('Missing reconstructed prefix state.');
          restored.set(record.tick, { record, world });
        });
      }
      const cached = restored.get(tick);
      const commit = existsSync(journal)
        ? continuousRead<{ record: V7StoredRound; state: V7Execution }>(journal)
        : cached
          ? { record: cached.record, state: { world: cached.world } }
          : null;
      if (!commit) throw new Error('No authoritative record for this round.');
      rounds.push(bindRegistrationPrecision(last, commit.record));
      last = commit.state.world;
    }
    const segment: V7ReplaySegment = {
      version: 7,
      start: first - 1,
      initial: start,
      rounds,
      ...(initial.config.experience
        ? { initialCursors: v7Clone(initialCursors) }
        : {}),
    };
    const path = `replay/${rounds.some((r) => r.registrationPrecisionHash) ? 'precision' : initial.config.experience ? 'execution' : 'part'}-${String(first - 1).padStart(6, '0')}-${String(rounds.at(-1)?.tick ?? first - 1).padStart(6, '0')}.json`;
    immutable(resolve(directory, path), segment);
    index.segments.push({
      path,
      start: first - 1,
      end: rounds.at(-1)?.tick ?? first - 1,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(directory, path)))
        .digest('hex'),
    });
    start = last;
    initialCursors = rounds.at(-1)?.tasks ?? {};
  }
  if (!index.segments.length) {
    const path = 'replay/part-000000.json';
    immutable(resolve(directory, path), {
      version: 7,
      start: 0,
      initial,
      rounds: [],
    });
    index.segments.push({
      path,
      start: 0,
      end: 0,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(directory, path)))
        .digest('hex'),
    });
  }
  continuousAtomic(resolve(directory, 'replay.json'), index);
  return index;
}
/** Add portable model-precision evidence only after verifying the complete original raw migration hash. */
export function bindRegistrationPrecision(
  before: V7World,
  record: V7StoredRound,
): V7StoredRound {
  if (!record.registrations.includes('material-geometry@1')) return record;
  let registered = before;
  for (const key of record.registrations)
    registered = v7Install(registered, continuousRegistry(registered), key);
  if (continuousHash(registered) !== record.before)
    throw new Error(
      'Cannot bind registration precision evidence to a different original prefix.',
    );
  return {
    ...record,
    registrationPrecisionHash: continuousHash(v7CanonicalNumbers(registered)),
  };
}
export function reconstructContinuousSegment(
  segment: V7ReplaySegment,
): V7World[] {
  let world = segment.initial;
  const frames = [world],
    registry = continuousRegistry(segment.initial);
  const cursors = v7Clone(segment.initialCursors ?? {});
  v7AssertWorld(world);
  for (const round of segment.rounds) {
    if (round.tick !== world.tick + 1)
      throw new Error('Nonsequential continuous segment.');
    for (const key of round.registrations)
      world = v7Install(world, registry, key);
    if (continuousHash(world) !== round.before)
      throw new Error(
        `Continuous prefix mismatch before round ${String(round.tick)}.`,
      );
    if (
      round.registrationPrecisionHash !== undefined &&
      (!round.registrations.includes('material-geometry@1') ||
        continuousHash(v7CanonicalNumbers(world)) !==
          round.registrationPrecisionHash)
    )
      throw new Error('Invalid supplementary registration precision evidence.');
    const input = v7Clone(world);
    for (const actor of input.actors) {
      const memory = round.memory[actor.id];
      if (memory) {
        if (memory.collectiveIntent) {
          if (!actor.collective)
            throw new Error(
              'Personal collective intention requires an actual member.',
            );
          actor.collective.intent = v7Clone(memory.collectiveIntent);
        }
        if (memory.projects)
          openSaveProjects(actor, memory.projects, world.tick);
        actor.memory.notes = memory.notes;
        actor.memory.preferences = memory.preferences;
        if (memory.intention !== undefined)
          actor.memory.intention = memory.intention;
      }
    }
    if (segment.initialCursors)
      v7PrepareReplayCursors(world, round.tasks, cursors);
    const result = v7Step(
      input,
      round.actions,
      registry,
      cursors,
      round.reviews,
    );
    if (segment.initialCursors) v7FinishTasks(world, result, cursors);
    result.world = collectiveSettle(result.world, round.coordination ?? []);
    if (
      result.paused ||
      continuousHash(result.world) !== round.after ||
      v7Signature(result.world.events) !== v7Signature(round.events) ||
      (segment.initialCursors &&
        v7Signature(cursors) !== v7Signature(round.tasks))
    )
      throw new Error(
        `Continuous reconstruction disagrees at round ${String(round.tick)}.`,
      );
    world = result.world;
    frames.push(world);
  }
  return frames;
}
export function continuousArchivePaths(directory: string): string[] {
  const visit = (path: string, prefix: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? visit(resolve(path, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    );
  return visit(directory, '')
    .filter((p) => p !== 'manifest.json' && !p.endsWith('.tmp'))
    .sort();
}
