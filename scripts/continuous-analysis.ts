import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { v7Signature } from '@self-evolving-world/world-core';
import type { V7World, WorldState } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
import {
  continuousHash,
  continuousRead,
  readContinuousExecution,
  reconstructContinuousSegment,
} from './continuous-store.js';
import type { V7ReplayIndex, V7ReplaySegment } from './continuous-store.js';
import { continuousHistory } from './continuous-source.js';
export const CONTINUOUS_OBJECTIVE =
  'Observe one continuous world with three initially autonomous actors pursuing health, survival and happiness across a first 1000-round window, allowing reviewed executable world and harness development without prescribed activities or causal attribution to individual mechanisms.';
export const EXPERIENCE_OBJECTIVE =
  'Observe three real actors for 1200 target rounds under consistent execution semantics, seasonal pressure, diet experience and sustained mental state; capability requests and emergent activities are optional observations, not success criteria.';
export const CONTINUOUS_ASSERTIONS = [
  'segment-integrity-and-deterministic-reconstruction',
  'initial-midpoint-final-state',
  'private-observation-and-global-view',
  'camera-and-playback-do-not-change-state',
  'continuous-geometry-and-object-inspection',
  'runtime-and-layout-health',
];
export function measureContinuous(
  state: V7Execution,
  frames: V7World[],
  records: V7ReplaySegment['rounds'],
) {
  const events = records.flatMap((r) => r.events),
    final = state.world;
  const historicalObjects = new Map(
    frames.flatMap((frame) =>
      frame.objects.map((object) => [object.id, object] as const),
    ),
  );
  const totalActions = records.reduce(
    (n, r) => n + Object.keys(r.actions).length,
    0,
  );
  const actions: Record<
    string,
    { attempted: number; successful: number; failed: number }
  > = {};
  for (const round of records)
    for (const [actor, action] of Object.entries(round.actions)) {
      const value = (actions[action.interface] ??= {
        attempted: 0,
        successful: 0,
        failed: 0,
      });
      value.attempted++;
      if (round.events.some((e) => e.actor === actor && e.type === 'failed'))
        value.failed++;
      else value.successful++;
    }
  const roles = (['ordinary', 'world'] as const).map((role) => {
    const attempts = state.attempts.filter((a) => a.role === role);
    return {
      role,
      attempts: attempts.length,
      accepted: attempts.filter((a) => a.status === 'accepted').length,
      failedOrRejected: attempts.filter((a) =>
        ['failed', 'rejected'].includes(a.status),
      ).length,
      inputTokens: attempts.reduce(
        (n, a) => n + (a.usage?.inputTokens ?? 0),
        0,
      ),
      outputTokens: attempts.reduce(
        (n, a) => n + (a.usage?.outputTokens ?? 0),
        0,
      ),
      unknownUsageAttempts: attempts.filter((a) => !a.usage).length,
      elapsedMs: attempts.reduce((n, a) => n + (a.elapsedMs ?? 0), 0),
    };
  });
  return {
    version: 7,
    observedRounds: final.tick,
    targetWindow: state.windowTarget,
    phase: state.phase,
    reason: state.reason,
    totalActions,
    framesChecked: frames.length,
    invariantFailures: 0,
    ...(final.config.forest
      ? {
          forest: {
            model: state.model,
            seed: final.config.seed,
            deaths: events.filter((e) => e.type === 'died'),
            respawns: events.filter((e) => e.type === 'respawned'),
            seasons: [...new Set(frames.map((f) => f.state.season))],
            lives: final.actors.map((a) => ({ id: a.id, life: a.life })),
            zeroRecoveryRest: events.filter(
              (e) => e.type === 'rested' && e.data.recovered === 0,
            ).length,
            monetaryCost: null,
            monetaryCostNote:
              'Plan-funded transport; per-call monetary charges and internal development usage are not metered.',
          },
        }
      : {}),
    ...(final.config.experience
      ? {
          experience: {
            counting:
              'Action counts measure executed rounds, including progress rounds. Initial non-authored interfaces may be learned but are not newly developed. Completed operation events and measured physical effects are separate evidence. Pre-action reference invalidations can trigger a decision without a failed execution event.',
            referenceDecisionInvalidations: state.attempts
              .filter(
                (a) =>
                  a.role === 'ordinary' &&
                  /Reference (?:unavailable|ambiguous|insufficient|wrong-kind|reserved|invalid)/.test(
                    a.reason,
                  ),
              )
              .map((a) => ({
                call: a.id,
                tick: a.tick,
                actor: a.actor,
                reason: a.reason,
                status: a.status,
              })),
            learnedBaselineInterfaces: final.actors.map((a) => ({
              actor: a.id,
              abilities: a.mastered.filter((id) =>
                frames[0]?.abilities.some(
                  (old) => old.id === id && !old.authored,
                ),
              ),
            })),
            developedInterfaceExecution: final.abilities
              .filter(
                (a) => !frames[0]?.abilities.some((old) => old.id === a.id),
              )
              .map((a) => ({
                id: a.id,
                personallyMasteredBy: final.actors
                  .filter((actor) => actor.mastered.includes(a.id))
                  .map((actor) => actor.id),
                executionRounds: records.flatMap((r) =>
                  Object.entries(r.actions)
                    .filter(([, action]) => action.interface === a.id)
                    .map(([actor]) => ({
                      tick: r.tick,
                      actor,
                      failed: r.events.some(
                        (e) => e.actor === actor && e.type === 'failed',
                      ),
                    })),
                ),
                completedOperations: events.filter(
                  (e) =>
                    e.interface === a.id &&
                    e.actor !== null &&
                    e.success &&
                    (e.type.endsWith('-completed') ||
                      [
                        'insulation-equipped',
                        'insulation-unequipped',
                        'fire-fed',
                        'fire-extinguished',
                      ].includes(e.type)),
                ),
              })),
            referenceFailures: events.filter(
              (e) =>
                e.type === 'failed' &&
                typeof e.data.reasonCode === 'string' &&
                e.data.reasonCode.startsWith('reference-'),
            ),
            completedOperationEvents: events.filter((e) =>
              e.type.endsWith('-completed'),
            ),
            messageDecisionReasons: state.attempts
              .filter((a) => a.role === 'ordinary' && /message/.test(a.reason))
              .map((a) => ({
                id: a.id,
                actor: a.actor,
                tick: a.tick,
                reason: a.reason,
              })),
            decisionRate:
              state.attempts.filter((a) => a.role === 'ordinary').length /
              Math.max(1, final.tick * final.actors.length),
            meals: events.filter((e) => e.type === 'meal-experience'),
            recovery: events
              .filter((e) => e.type === 'rested')
              .map((e) => ({ tick: e.tick, actor: e.actor, ...e.data })),
            trajectories: frames
              .filter((f) => f.tick % 20 === 0 || f.tick === final.tick)
              .map((f) => ({
                tick: f.tick,
                actors: f.actors.map((a) => ({
                  id: a.id,
                  vitals: a.vitals,
                  mental: a.experience?.mental,
                  pleasure: a.experience?.pleasure,
                  monotony: a.experience?.monotony,
                })),
              })),
            baselineInterfaces: frames[0]?.abilities.map((a) => a.id) ?? [],
            newlyImplemented: final.abilities
              .filter(
                (a) => !frames[0]?.abilities.some((old) => old.id === a.id),
              )
              .map((a) => ({ id: a.id, equivalence: a.equivalence })),
            failedActions: events.filter((e) => e.type === 'failed'),
            benefits: events.filter((e) =>
              /benefit|qualified|exposure|relief/.test(e.type),
            ),
          },
        }
      : {}),
    actors: final.actors.map((actor) => {
      const history = frames.flatMap((f) =>
          f.actors.filter((a) => a.id === actor.id),
        ),
        happiness = history.map((a) => a.wellbeing.total),
        named = events.filter((e) => e.actor === actor.id);
      return {
        id: actor.id,
        alive: actor.vitals.health > 0,
        finalVitals: actor.vitals,
        minimumHealth: Math.min(...history.map((a) => a.vitals.health)),
        minimumSatiety: Math.min(...history.map((a) => a.vitals.satiety)),
        finalWellbeing: actor.wellbeing,
        meanWellbeing:
          happiness.reduce((a, b) => a + b, 0) / Math.max(1, happiness.length),
        peakWellbeing: Math.max(...happiness),
        roundsAtLeast50: happiness.filter((v) => v >= 50).length,
        requests: named.filter((e) => e.type === 'requested').length,
        studyRounds: named.filter((e) =>
          ['learning', 'mastered'].includes(e.type),
        ).length,
        newlyMastered: actor.mastered.filter(
          (key) => !final.abilities.find((a) => a.id === key)?.authored,
        ),
        successfulNewAbilityUses: records.filter((round) => {
          const action = round.actions[actor.id];
          return (
            action &&
            final.abilities.some(
              (ability) => ability.id === action.interface && !ability.authored,
            ) &&
            !round.events.some(
              (event) => event.actor === actor.id && event.type === 'failed',
            )
          );
        }).length,
        successfulNewAbilityEvents: named.filter(
          (e) =>
            e.success &&
            e.interface &&
            !final.abilities.find((a) => a.id === e.interface)?.authored &&
            !['mastered', 'learning', 'satisfaction'].includes(e.type),
        ).length,
        movementDistance: named
          .filter((e) => ['moved', 'arrived'].includes(e.type))
          .reduce((n, e) => n + Number(e.data.distance ?? 0), 0),
        finalNotes: actor.memory.notes,
        finalPreferences: actor.memory.preferences,
      };
    }),
    calls: roles,
    development: {
      handoffs: state.developments.length,
      accepted: state.developments.filter((d) => d.status === 'accepted')
        .length,
      failed: state.developments.filter((d) => d.status === 'failed').length,
      internalModelCalls: null,
      inputTokens: null,
      outputTokens: null,
      limitation:
        'Current-conversation development handoffs are counted before work. Internal coding/reasoning calls, tokens and preparation/review costs are not directly metered; these unknown costs are not zero.',
    },
    actions,
    implementedAbilities: final.abilities
      .filter((a) => !a.authored)
      .map((a) => ({
        id: a.id,
        name: a.name,
        revision: a.revision,
        learning: a.learning,
        masteredBy: final.actors
          .filter((p) => p.mastered.includes(a.id))
          .map((p) => p.id),
        successfulEvents: events.filter(
          (e) => e.success && e.interface === a.id,
        ).length,
      })),
    requests: state.attempts
      .filter((a) => a.role === 'world')
      .map((a) => ({ call: a.id, tick: a.tick, status: a.status })),
    persistentObjects: final.objects.filter((o) => o.createdBy),
    sources: final.satisfaction,
    processes: final.processes,
    revisions: final.revisions,
    objectLifecycle: {
      created: [...historicalObjects.values()].filter(
        (o) => o.createdBy !== null,
      ).length,
      removed: [...historicalObjects.values()].filter(
        (o) => !final.objects.some((current) => current.id === o.id),
      ).length,
    },
    crossActorObjectEvents: events
      .filter(
        (e) =>
          e.success &&
          e.actor !== null &&
          e.target &&
          [...historicalObjects.values()].some(
            (o) => o.id === e.target && o.createdBy && o.createdBy !== e.actor,
          ),
      )
      .map((e) => ({
        tick: e.tick,
        actor: e.actor,
        type: e.type,
        interface: e.interface,
        target: e.target,
        data: e.data,
      })),
    socialEvents: events.filter((e) =>
      ['message', 'given', 'consented', 'born'].includes(e.type),
    ),
    satisfactionEvents: events
      .filter((e) => e.type === 'satisfaction')
      .map((e) => ({ tick: e.tick, actor: e.actor, data: e.data })),
    stages: state.stages,
  };
}
export function continuousChart(state: V7Execution, frames: V7World[]): string {
  const width = 1120,
    height = 620,
    x = (tick: number) => 70 + (tick / Math.max(1, state.world.tick)) * 980,
    y = (value: number) => 470 - value * 3.5;
  const colors = ['#bb8a4c', '#557e5c', '#568d9e'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Measured wellbeing over recorded rounds"><rect width="1120" height="620" fill="#f4f5ec"/><text x="64" y="55" font-family="Georgia,serif" font-size="30" fill="#214838">Life in a continuous world</text><text x="64" y="85" font-family="sans-serif" font-size="13" fill="#687a64">${String(state.world.tick)} observed rounds · ${state.phase} · wellbeing 0–100 · individual mechanisms are not causal treatments</text>${[0, 25, 50, 75, 100].map((v) => `<path d="M70 ${String(y(v))}H1050" stroke="#d7dece"/><text x="38" y="${String(y(v) + 4)}" font-family="sans-serif" font-size="12" fill="#7b8a73">${String(v)}</text>`).join('')}${state.world.actors
    .map(
      (a, i) =>
        `<polyline points="${frames
          .flatMap((f) => {
            const p = f.actors.find((p) => p.id === a.id);
            return p
              ? [`${x(f.tick).toFixed(2)},${y(p.wellbeing.total).toFixed(2)}`]
              : [];
          })
          .join(
            ' ',
          )}" fill="none" stroke="${String(colors[i % colors.length])}" stroke-width="2.4"/><circle cx="${String(80 + i * 230)}" cy="540" r="5" fill="${String(colors[i % colors.length])}"/><text x="${String(94 + i * 230)}" y="545" font-family="sans-serif" font-size="14" fill="#31513e">${a.id} · final ${a.wellbeing.total.toFixed(1)}</text>`,
    )
    .join(
      '',
    )}<text x="70" y="495" font-family="sans-serif" font-size="12" fill="#71816b">0</text><text x="1010" y="495" font-family="sans-serif" font-size="12" fill="#71816b">${String(state.world.tick)}</text><text x="70" y="585" font-family="sans-serif" font-size="12" fill="#71816b">Physical comfort contributes at most 10. Other sources require implemented, successful world events.</text></svg>`;
}
export function continuousReport(
  id: string,
  state: V7Execution,
  results: ReturnType<typeof measureContinuous>,
): string {
  const forestSummary = state.world.config.forest
    ? `## Forest lifecycle and environment\n\nModel: ${state.model}. Seed: ${String(state.world.config.seed)}. Observed seasons: ${results.forest?.seasons.map((s) => (typeof s === 'string' ? s : 'unknown')).join(', ') ?? 'unknown'}. Deaths and respawns are retained with exact evidence and prior plans in results.json. Full-state replay remains independent of rendering. Monetary cost and internal developer usage are unknown; recorded role-specific tokens below are measured. These formal events are distinct from isolated forest-lab fixtures.\n\n${state.world.actors.map((a) => `${a.name}: ${String(a.life?.deaths ?? 0)} deaths, ${String((a.life?.total ?? 0) - (a.life?.deaths ?? 0))} remaining lives.`).join('\n\n')}\n\n`
    : '';
  return `# ${id}: Continuous World and Persistent Wellbeing\n\n## Scope and observation window\n\n${state.world.config.experience ? EXPERIENCE_OBJECTIVE : CONTINUOUS_OBJECTIVE}\n\nObserved ${String(state.world.tick)} of ${String(state.windowTarget)} target rounds. State: ${state.phase}. ${state.reason ?? ''} This is one exploratory combined experiment; no individual mechanism has a causal estimate. No model-weight training occurred.\n\n## Measured outcome\n\n| Actor | Alive | Health | Satiety | Mean happiness | Final happiness | Newly mastered | ${state.world.config.experience ? 'Learned-interface successful rounds' : 'New-ability successful rounds'} |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${results.actors.map((a) => `| ${a.id} | ${String(a.alive)} | ${String(a.finalVitals.health)} | ${String(a.finalVitals.satiety)} | ${a.meanWellbeing.toFixed(2)} | ${a.finalWellbeing.total.toFixed(2)} | ${String(a.newlyMastered.length)} | ${String(a.successfulNewAbilityUses)} |`).join('\n')}\n\nRequests, reviews, implementation, individual study, successful execution and lasting satisfaction are separate records in calls, source-history, replay events and results.json. Event counts are not unique skills or demonstrated lasting benefits.${state.world.config.experience ? ' In this policy the table includes personally learned baseline interfaces; results.experience separately lists newly developed interfaces, personal mastery, completed operations and pre-action reference invalidations. The initial ex8 catalogue is not new ex9 discovery.' : ''} Initial survival interfaces and established perennial food are authored baseline, not autonomous discoveries.\n\n## Action distribution\n\n| Interface | Attempted | Successful rounds | Failed rounds |\n| --- | --- | --- | --- |\n${Object.entries(
    results.actions,
  )
    .map(
      ([key, a]) =>
        `| ${key} | ${String(a.attempted)} | ${String(a.successful)} | ${String(a.failed)} |`,
    )
    .join(
      '\n',
    )}\n\n## Cost and limitations\n\n${results.calls.map((c) => `${c.role}: ${String(c.attempts)} attempted calls, ${String(c.failedOrRejected)} failed/rejected; ${String(c.inputTokens)} recorded input tokens and ${String(c.outputTokens)} recorded output tokens; ${String(c.unknownUsageAttempts)} attempts with unknown token usage; ${(c.elapsedMs / 1000).toFixed(1)} elapsed seconds.`).join('\n\n')}\n\n${String(results.development.handoffs)} pre-counted conversation development handoffs, ${String(results.development.failed)} failed validation attempts. ${results.development.limitation}\n\n## Evidence and reproduction\n\nConfiguration and isolated survival feasibility are in configuration.json and preflight.json. The feasibility oracle and isolated extension fixtures never enter ordinary decision context. Every actual inference has an immutable calls/ record, including transport failures. replay.json indexes checksummed segments; source-history.json binds retained source, packages, tests and activation boundaries. The observatory reconstructs saved rounds; playback cannot advance the world.\n\nRun \`pnpm experiment:check\` and \`pnpm test\` to validate saved evidence. Open \`/observatory.html?experiment=${id}\` for the game view. Use the current task's development handoff to continue a pending barrier; do not allocate a replacement run or repeat an uncertain call.\n\n${forestSummary}## Interpretation\n\nThe current-conversation behavioral analysis accompanies this archive and traces actual problems, proposed functions, review, implementation, use and consequences. Shared object use is distinguished from explicit communication or consent. Novel names, proposals, installations and offspring counts are not happiness rewards. The observation window is resumable; completed capture is not world termination.\n`;
}
export function continuousArtifactFiles(
  manifest: Record<string, unknown>,
): string[] {
  const list = manifest.files;
  if (
    !Array.isArray(list) ||
    list.some(
      (p) =>
        typeof p !== 'string' ||
        p.startsWith('/') ||
        p.includes('..') ||
        p.includes('\\'),
    ) ||
    new Set(list).size !== list.length
  )
    throw new Error('Invalid continuous artifact index.');
  return list as string[];
}
export function readContinuousExperiment(
  root: string,
  id: string,
  manifest: Record<string, unknown>,
  pending: boolean,
) {
  const directory = resolve(root, 'experiment', id),
    state = readContinuousExecution(root, id),
    index = continuousRead<V7ReplayIndex>(resolve(directory, 'replay.json'));
  if (
    manifest.version !== 7 ||
    manifest.controller !== 'chatgpt-plan' ||
    manifest.id !== id ||
    index.observed !== state.world.tick ||
    (index as { version: unknown }).version !== 7 ||
    state.controller !== 'chatgpt-plan' ||
    !['paused', 'window-complete'].includes(state.phase) ||
    (!pending && manifest.status !== 'completed')
  )
    throw new Error('Invalid or unfinished continuous archive.');
  const frames: V7World[] = [],
    rounds: V7ReplaySegment['rounds'] = [];
  for (const part of index.segments) {
    const path = resolve(directory, part.path);
    if (
      !/^replay\/(?:part|execution)-\d+(?:-\d+)?\.json$/.test(part.path) ||
      continuousHash(readFileSync(path, 'utf8')) !== part.sha256
    )
      throw new Error('Invalid continuous replay segment.');
    const segment = continuousRead<V7ReplaySegment>(path),
      values = reconstructContinuousSegment(segment);
    if (frames.length && v7Signature(frames.at(-1)) !== v7Signature(values[0]))
      throw new Error('Segment boundaries do not join exactly.');
    frames.push(...(frames.length ? values.slice(1) : values));
    rounds.push(...segment.rounds);
  }
  if (
    continuousHash(frames.at(-1)) !== continuousHash(state.world) ||
    frames.length !== state.world.tick + 1
  )
    throw new Error(
      'Reconstructed final state differs from the durable checkpoint.',
    );
  for (const attempt of state.attempts) {
    if (
      !existsSync(resolve(directory, 'calls', `${attempt.id}.json`)) &&
      attempt.status === 'started' &&
      state.pendingCall?.id === attempt.id &&
      state.phase === 'paused'
    )
      continue;
    const call = continuousRead<V7CallRecord>(
      resolve(directory, 'calls', `${attempt.id}.json`),
    );
    if (continuousHash(call.attempt) !== continuousHash(attempt))
      throw new Error('Call ledger disagrees with durable raw record.');
  }
  for (const revision of continuousHistory(root, id)) {
    const files = continuousRead<Record<string, string>>(
      resolve(directory, 'sources', `revision-${String(revision.id)}.json`),
    );
    if (
      continuousHash(files) !== revision.sourceHash ||
      Object.entries(files).some(
        ([p, s]) => continuousHash(s) !== revision.files[p],
      )
    )
      throw new Error('Retained source revision failed integrity validation.');
  }
  const results = measureContinuous(state, frames, rounds);
  if (
    continuousHash(continuousRead(resolve(directory, 'results.json'))) !==
    continuousHash(results)
  )
    throw new Error('Continuous measurements disagree with saved events.');
  if (!pending) {
    const artifacts = manifest.artifacts as Record<string, unknown> | undefined;
    if (!artifacts) throw new Error('Missing continuous artifact hashes.');
    for (const file of continuousArtifactFiles(manifest)) {
      const path = resolve(directory, file);
      if (
        !lstatSync(path).isFile() ||
        artifacts[file] !== continuousHash(readFileSync(path))
      )
        throw new Error(`Continuous artifact hash mismatch: ${file}`);
    }
    const browser = continuousRead<{
      status: string;
      replayHash: string;
      assertions: string[];
      frameTicks: number[];
      errors: unknown[];
    }>(resolve(directory, 'browser.json'));
    if (
      browser.status !== 'passed' ||
      browser.replayHash !==
        continuousHash(readFileSync(resolve(directory, 'replay.json'))) ||
      v7Signature(browser.assertions) !== v7Signature(CONTINUOUS_ASSERTIONS) ||
      v7Signature(browser.frameTicks) !==
        v7Signature([0, Math.floor(state.world.tick / 2), state.world.tick]) ||
      browser.errors.length
    )
      throw new Error('Missing current continuous browser evidence.');
  }
  return {
    directory,
    manifest,
    config: {
      id,
      objective: CONTINUOUS_OBJECTIVE,
      steps: state.world.tick,
      schedule: 'continuous-v1' as const,
      totalActions: results.totalActions,
    },
    run: { frames: [] as WorldState[] },
    continuous: {
      initial: frames[0],
      final: state.world,
      frames: Object.fromEntries(
        [0, Math.floor(state.world.tick / 2), state.world.tick].map((tick) => [
          tick,
          frames[tick],
        ]),
      ),
    },
    results,
  };
}
