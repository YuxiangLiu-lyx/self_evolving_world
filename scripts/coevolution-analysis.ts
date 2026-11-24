import { isDevelopmentReviewer } from '../apps/simulator/src/development-identity.js';
import { isDeepStrictEqual } from 'node:util';
import {
  acceptCoevolutionProgram,
  advanceCoevolutionRound,
  coevolutionActions,
  coevolutionData,
  createCoevolutionRun,
  lastCoevolutionFrame,
  pendingCoevolutionPrograms,
  registerCoevolution,
  EMPTY_COEVOLUTION_PROPOSAL,
  COEVOLUTION_CONFIG,
} from '@self-evolving-world/world-core';
import type { CoevolutionProposal } from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../apps/simulator/src/coevolution-scenario.js';
import {
  ordinaryCoevolutionInput,
  worldCoevolutionInput,
} from '../apps/simulator/src/coevolution-input.js';
import { coevolutionRequest } from '../apps/simulator/src/coevolution-provider.js';
import {
  coevolutionExecutionRun,
  parseOrdinaryCoevolution,
  parseWorldCoevolution,
  acceptCDevelopment,
  coevolutionProgress,
  makeCoevolutionCheckpoint,
} from '../apps/simulator/src/coevolution-run.js';
import type { CoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import { record } from '../apps/simulator/src/remote-data.js';
import { serializeReplay } from '../apps/viewer/src/timeline.js';
export const COEVOLUTION_POLICY = 'development-coevolution-v1';
function assert(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(`Coevolution archive: ${detail}`);
}
export function coevolutionCallArchive(state: CoevolutionExecution) {
  const run = createCoevolutionRun(initialCoevolutionWorld());
  return {
    format: 'self-evolving-world/coevolution-calls',
    version: 1,
    funding:
      state.controller === 'chatgpt-plan'
        ? 'chatgpt-plan-oauth'
        : 'simulated-test',
    endpoint: 'https://api.openai.com/v1/responses',
    model: state.model,
    templates: {
      ordinary: {
        ...coevolutionRequest(
          state.model,
          'ordinary',
          ordinaryCoevolutionInput(run, 'lin'),
        ),
        input: [],
      },
      world: {
        ...coevolutionRequest(
          state.model,
          'world',
          ordinaryCoevolutionInput(run, 'lin'),
        ),
        input: [],
      },
    },
    attempts: state.attempts,
    developmentMetering: state.developmentMetering,
    developmentAttempts: state.developmentAttempts,
  };
}
export function readCoevolutionExecution(value: unknown): CoevolutionExecution {
  const s = record(value);
  assert(
    s.version === 1 &&
      ['chatgpt-plan', 'simulated-test'].includes(String(s.controller)) &&
      ['running', 'development', 'paused', 'completed'].includes(
        String(s.phase),
      ) &&
      typeof s.model === 'string' &&
      s.model.length &&
      Array.isArray(s.programs) &&
      Array.isArray(s.rounds) &&
      Array.isArray(s.attempts) &&
      s.attempts.length <= 140 &&
      Array.isArray(s.developments) &&
      s.developments.length <= 10 &&
      Array.isArray(s.checkpoints) &&
      Array.isArray(s.developmentAttempts) &&
      s.developmentAttempts.length <= 10,
    'invalid execution envelope',
  );
  const state = s as unknown as CoevolutionExecution,
    run = coevolutionExecutionRun(state);
  assert(
    state.attempts.filter((a) => a.role === 'ordinary').length <= 120 &&
      state.attempts.filter((a) => a.role === 'world').length <= 20,
    'attempt budget exceeded',
  );
  assert(
    state.phase === 'paused' ||
      (state.phase === 'development') === (state.barrier !== null),
    'inconsistent barrier',
  );
  if (state.barrier)
    assert(
      state.barrier.tick === run.rounds.length &&
        isDeepStrictEqual(state.barrier.input, worldCoevolutionInput(run)),
      'stale barrier',
    );
  if (state.phase === 'completed')
    assert(
      run.rounds.length === 180 ||
        (run.rounds.length === 60 && !coevolutionProgress(run)),
      'premature completion',
    );
  if (state.phase === 'paused')
    assert(
      state.attempts.filter((a) => a.role === 'ordinary').length === 120 ||
        state.attempts.filter((a) => a.role === 'world').length === 20 ||
        state.developmentAttempts.length === 10,
      'pause without exhausted budget',
    );
  assert(
    record(state).developmentMetering ===
      'Conversation interventions capped at 10; internal model calls and tokens unavailable, not zero.',
    'missing cost limitation',
  );
  return state;
}
/** Reconstruct every input, accepted decision and completed barrier; no inference in validation. */
export function auditCoevolution(state: CoevolutionExecution) {
  let run = createCoevolutionRun(initialCoevolutionWorld()),
    offset = 0,
    programIndex = 0,
    worldCount = 0,
    developmentCount = 0;
  const ids = new Set<string>();
  const consume = () => {
    const a = state.attempts[offset++];
    assert(
      a && a.status !== 'started' && a.tick === run.rounds.length,
      'missing, uncertain or out-of-order attempt',
    );
    assert(
      typeof a.reason === 'string' &&
        a.reason.length &&
        Number.isFinite(Date.parse(a.startedAt)) &&
        typeof a.elapsedMs === 'number' &&
        a.elapsedMs >= 0,
      'missing call telemetry',
    );
    assert(
      a.usage === null ||
        (Number.isSafeInteger(a.usage.inputTokens) &&
          a.usage.inputTokens >= 0 &&
          Number.isSafeInteger(a.usage.outputTokens) &&
          a.usage.outputTokens >= 0),
      'invalid token telemetry',
    );
    if (a.response) {
      assert(
        a.response.http.status >= 200 &&
          a.response.http.status < 300 &&
          a.response.decision.text.length <= 60000 &&
          a.response.decision.responseId &&
          !ids.has(a.response.decision.responseId) &&
          a.status !== 'failed',
        'invalid response evidence',
      );
      ids.add(a.response.decision.responseId);
    } else assert(a.status === 'failed', 'missing provider response');
    if (a.status !== 'accepted') assert(a.error, 'missing attempt error');
    return a;
  };
  for (let tick = 0; tick <= state.rounds.length; tick++) {
    for (const actor of pendingCoevolutionPrograms(run)) {
      if (
        tick === state.rounds.length &&
        state.attempts[offset]?.role !== 'ordinary'
      )
        break;
      const a = consume(),
        p = state.programs[programIndex++];
      assert(
        a.role === 'ordinary' &&
          a.actor === actor &&
          p &&
          a.call === p.call &&
          isDeepStrictEqual(a.input, ordinaryCoevolutionInput(run, actor)),
        'ordinary input mismatch',
      );
      let parsed: ReturnType<typeof parseOrdinaryCoevolution> | undefined;
      try {
        if (a.response)
          parsed = parseOrdinaryCoevolution(
            a.response.decision.text,
            actor,
            tick,
          );
      } catch {
        /* Rejected outputs remain in the ledger. */
      }
      assert(
        parsed
          ? a.status === 'accepted' &&
              isDeepStrictEqual(p, {
                agentId: actor,
                tick,
                call: a.call,
                ...parsed,
              })
          : ['failed', 'rejected'].includes(a.status) &&
              p.code === null &&
              p.project === null,
        'ordinary decision mismatch',
      );
      run = acceptCoevolutionProgram(run, p);
    }
    let proposal: CoevolutionProposal = EMPTY_COEVOLUTION_PROPOSAL;
    const errors: string[] = [];
    let proposed: string | null = null,
      resolved = false,
      attempts = 0,
      needsDevelopment = false;
    while (
      state.attempts[offset]?.role === 'world' &&
      state.attempts[offset]?.tick === tick
    ) {
      const a = consume();
      worldCount++;
      attempts++;
      assert(
        attempts <= 2 &&
          a.call === worldCount &&
          a.actor === 'world' &&
          isDeepStrictEqual(
            a.input,
            worldCoevolutionInput(run, errors.at(-1) ?? null),
          ),
        'world batch mismatch',
      );
      let parsed: ReturnType<typeof parseWorldCoevolution> | undefined;
      try {
        if (a.response) {
          proposed = a.response.decision.text;
          parsed = parseWorldCoevolution(proposed);
          if (!parsed.needsDevelopment)
            registerCoevolution(
              lastCoevolutionFrame(run),
              coevolutionActions(run),
              parsed.proposal,
            );
        }
      } catch {
        parsed = undefined;
      }
      if (parsed && !parsed.needsDevelopment) {
        assert(a.status === 'accepted', 'valid world proposal rejected');
        proposal = parsed.proposal;
        resolved = true;
      } else {
        assert(
          a.status ===
            (parsed?.needsDevelopment
              ? 'development'
              : a.response
                ? 'rejected'
                : 'failed'),
          'world status mismatch',
        );
        errors.push(a.error ?? '');
        needsDevelopment = !!parsed?.needsDevelopment;
      }
    }
    const barrierForAttempts = {
      id: `round-${String(tick)}-world-${String(worldCount)}`,
      tick,
      input: pendingCoevolutionPrograms(run).length
        ? null
        : worldCoevolutionInput(run),
      errors,
      proposed,
    };
    for (const [index, attempt] of state.developmentAttempts.entries()) {
      if (attempt.tick !== tick) continue;
      assert(
        (attempts === 2 || needsDevelopment) &&
          attempt.barrierId === barrierForAttempts.id &&
          Number.isFinite(Date.parse(attempt.submittedAt)) &&
          attempt.elapsedMs >= 0 &&
          record(attempt).modelCalls === null &&
          record(attempt).inputTokens === null &&
          record(attempt).outputTokens === null,
        'invalid development attempt telemetry',
      );
      let accepted = false;
      try {
        acceptCDevelopment(
          {
            ...state,
            programs: run.programs,
            rounds: run.rounds,
            developments: state.developments.slice(0, developmentCount),
            developmentAttempts: state.developmentAttempts.slice(0, index),
            phase: 'development',
            barrier: {
              ...barrierForAttempts,
              input: worldCoevolutionInput(run),
            },
          },
          attempt.input,
        );
        accepted = true;
      } catch {
        /* Failed submissions are retained and charged. */
      }
      assert(
        accepted === (attempt.status === 'accepted') &&
          (accepted
            ? attempt.error === null
            : typeof attempt.error === 'string'),
        'development outcome mismatch',
      );
    }
    const development = state.developments.find((d) => d.barrier.tick === tick);
    if (development) {
      const barrier = {
        id: `round-${String(tick)}-world-${String(worldCount)}`,
        tick,
        input: worldCoevolutionInput(run),
        errors,
        proposed,
      };
      assert(
        (attempts === 2 || needsDevelopment) &&
          !resolved &&
          isDeepStrictEqual(development.barrier, barrier) &&
          isDevelopmentReviewer(record(development).reviewer),
        'development provenance mismatch',
      );
      assert(
        state.developmentAttempts.some(
          (a) =>
            a.tick === tick &&
            a.status === 'accepted' &&
            isDeepStrictEqual(a.input, {
              barrierId: barrier.id,
              tick,
              proposal: development.proposal,
              notes: development.notes,
            }),
        ),
        'missing accepted development submission',
      );
      acceptCDevelopment(
        {
          ...state,
          programs: run.programs,
          rounds: run.rounds,
          developments: state.developments.slice(0, developmentCount),
          developmentAttempts: state.developmentAttempts.slice(
            0,
            state.developmentAttempts.findIndex(
              (a) => a.tick === tick && a.status === 'accepted',
            ),
          ),
          phase: 'development',
          barrier,
        },
        {
          barrierId: barrier.id,
          tick,
          proposal: development.proposal,
          notes: development.notes,
        },
      );
      proposal = development.proposal;
      developmentCount++;
    }
    if (tick === state.rounds.length) break;
    assert(
      isDeepStrictEqual(state.rounds[tick], {
        actions: coevolutionActions(run),
        proposal,
      }),
      'round bypassed saved decision or review',
    );
    run = advanceCoevolutionRound(run, proposal);
    if (COEVOLUTION_CONFIG.stages.includes(tick + 1)) {
      const saved = state.checkpoints.find((c) => c.tick === tick + 1);
      assert(
        saved &&
          isDeepStrictEqual(
            saved,
            makeCoevolutionCheckpoint(run, {
              ...state,
              attempts: state.attempts.slice(0, offset),
              developments: state.developments.slice(0, developmentCount),
              developmentAttempts: state.developmentAttempts.filter(
                (a) => a.tick <= tick,
              ),
            }),
          ),
        'checkpoint differs from its actual stage state',
      );
    }
  }
  assert(
    offset === state.attempts.length &&
      programIndex === state.programs.length &&
      developmentCount === state.developments.length &&
      isDeepStrictEqual(run.programs, state.programs) &&
      state.developmentAttempts.filter((a) => a.status === 'accepted')
        .length === developmentCount &&
      state.developmentAttempts.every((a) => a.tick <= run.rounds.length),
    'unused ledger entries',
  );
  assert(
    state.checkpoints.length ===
      COEVOLUTION_CONFIG.stages.filter((t) => t <= run.rounds.length).length,
    'missing/extra stage checkpoints',
  );
  for (const f of run.frames) {
    const d = coevolutionData(f),
      owned = [...f.items, ...f.agents.flatMap((a) => a.inventory)].map(
        (s) => s.id,
      );
    assert(new Set(owned).size === owned.length, 'duplicate ownership');
    assert(
      d.stacks.every(
        (s) =>
          Number.isInteger(s.quantity) &&
          s.quantity >= 0 &&
          s.quantity > 0 === owned.includes(s.id),
      ),
      'invalid stack accounting',
    );
    assert(
      d.sites.every((s) =>
        Object.values(s.stock).every((n) => Number.isInteger(n) && n >= 0),
      ),
      'negative habitat stock',
    );
    assert(
      Object.values(d.vitals).every(
        (v) =>
          v.health >= 0 &&
          v.health <= 100 &&
          v.satiety >= 0 &&
          v.satiety <= 100,
      ) && Object.values(d.energy).every((e) => e >= 0 && e <= 40),
      'invalid body bounds',
    );
    assert(
      new Set(d.allocations.map((a) => `${a.site}:${a.niche}`)).size ===
        d.allocations.length &&
        d.allocations.every((a) => a.remaining >= 0 && a.remaining <= 24),
      'rerolled or unbounded ecology',
    );
  }
  return run;
}
export function coevolutionRegistry(state: CoevolutionExecution) {
  const d = coevolutionData(
    lastCoevolutionFrame(coevolutionExecutionRun(state)),
  );
  return {
    resources: d.types,
    ecology: d.ecology,
    allocations: d.allocations,
    mechanics: d.mechanics,
    skills: d.skills,
    blueprints: d.blueprints,
    objects: d.objects,
    jobs: d.jobs,
  };
}
export function measureCoevolution(
  id: string,
  objective: string,
  executionInput: unknown,
  callsInput: unknown,
) {
  const state = readCoevolutionExecution(executionInput);
  assert(
    ['completed', 'paused'].includes(state.phase) &&
      state.controller === 'chatgpt-plan',
    'archive needs a terminal real observation, including a disclosed budget pause',
  );
  assert(
    isDeepStrictEqual(callsInput, coevolutionCallArchive(state)),
    'call archive mismatch',
  );
  const run = auditCoevolution(state),
    final = lastCoevolutionFrame(run),
    data = coevolutionData(final),
    events = run.frames.flatMap((f) => f.coevolution?.events ?? []);
  const actors = final.agents.map((a) => {
    const personal = events.filter((e) => e.action.agentId === a.id),
      v = data.vitals[a.id],
      cultivatedMeals = personal.filter(
        (e) =>
          e.outcome === 'used' &&
          e.skillId === 'ability-1' &&
          e.action.type === 'use' &&
          e.action.args.item?.startsWith('yield-'),
      ),
      actualRestBonus = data.benefits.filter(
        (b) => b.actor === a.id && b.kind === 'rest',
      );
    return {
      id: a.id,
      ...v,
      energy: data.energy[a.id],
      calls: state.attempts.filter((c) => c.actor === a.id).length,
      requests: personal.filter((e) => e.action.type === 'learn').length,
      learned: data.knowledge[a.id]?.learned ?? [],
      successfulUses: personal.filter((e) => e.outcome === 'used').length,
      newCapabilityUses: personal.filter(
        (e) => e.outcome === 'used' && e.skillId !== 'ability-1',
      ).length,
      cultivatedMeals: cultivatedMeals.map((e) => ({
        tick: e.tick,
        action: e.action,
        nutritionRealized: e.satietyDelta + COEVOLUTION_CONFIG.satietyLoss,
        sourceObject:
          data.objects.find(
            (o) =>
              e.action.type === 'use' &&
              e.action.args.item?.startsWith(`yield-${o.id}-`),
          )?.id ?? null,
        sourceCreator:
          data.objects.find(
            (o) =>
              e.action.type === 'use' &&
              e.action.args.item?.startsWith(`yield-${o.id}-`),
          )?.creator ?? null,
      })),
      extraRestEnergy: actualRestBonus.reduce((n, b) => n + b.amount, 0),
      crossActorRest: actualRestBonus.filter(
        (b) => data.objects.find((o) => o.id === b.object)?.creator !== a.id,
      ),
      carryingEnergySaved: data.benefits
        .filter((b) => b.actor === a.id && b.kind === 'carrying')
        .reduce((n, b) => n + b.amount, 0),
      actionWindows: [30, 60, 90, 120, 150, 180]
        .filter((t) => t <= final.tick)
        .map((end) => ({
          start: end - 29,
          end,
          actions: Object.fromEntries(
            [
              'move',
              'pickup',
              'use',
              'rest',
              'learn',
              'study',
              'wait',
              'give',
              'drop',
              'message',
            ].map((type) => [
              type,
              personal.filter(
                (e) =>
                  e.tick > end - 30 && e.tick <= end && e.action.type === type,
              ).length,
            ]),
          ),
          cultivatedMeals: cultivatedMeals.filter(
            (e) => e.tick > end - 30 && e.tick <= end,
          ).length,
        })),
      actionDistribution: Object.fromEntries(
        [...new Set(personal.map((e) => e.action.type))].map((type) => [
          type,
          personal.filter((e) => e.action.type === type && e.outcome !== 'dead')
            .length,
        ]),
      ),
      deathRound:
        run.frames.find((f) => f.coevolution?.vitals[a.id]?.health === 0)
          ?.tick ?? null,
      position: a.position,
      inventory: data.stacks.filter((s) => s.owner === a.id && s.quantity > 0),
      project: run.cursors[a.id]?.project,
      benefits: data.benefits.filter((b) => b.actor === a.id),
      minimumSatiety: Math.min(
        ...run.frames.map((f) => f.coevolution?.vitals[a.id]?.satiety ?? 0),
      ),
      visitedCells: data.memory[a.id]?.visited.length ?? 0,
    };
  });
  const lifecycle = data.skills.map((s) => ({
    id: s.id,
    name: s.name,
    authored: s.id === 'ability-1',
    implementedRound:
      s.id === 'ability-1'
        ? 0
        : run.frames.find((f) =>
            f.coevolution?.mechanics.some((m) => m.id === s.mechanicId),
          )?.tick,
    publicSkillRound: run.frames.find((f) =>
      f.coevolution?.skills.some((k) => k.id === s.id),
    )?.tick,
    mastery: actors
      .filter((a) => a.learned.includes(s.id))
      .map((a) => ({
        actor: a.id,
        tick: run.frames.find((f) =>
          f.coevolution?.knowledge[a.id]?.learned.includes(s.id),
        )?.tick,
      })),
    masteredBy: actors.filter((a) => a.learned.includes(s.id)).map((a) => a.id),
    successfulUses: events
      .filter((e) => e.skillId === s.id && e.outcome === 'used')
      .map((e) => ({
        tick: e.tick,
        actor: e.action.agentId,
        detail: e.detail,
      })),
    approvals: run.rounds.flatMap((r, i) =>
      r.proposal.reviews
        .filter((v) => v.mechanicId === s.mechanicId && v.decision !== 'reject')
        .map((v) => ({ tick: i + 1, ...v })),
    ),
  }));
  const results = {
    rounds: run.rounds.length,
    targetRounds: 180,
    phase: state.phase,
    stopReason: state.stopReason,
    framesChecked: run.frames.length,
    totalActions: run.rounds.length * 3,
    invariantFailures: 0,
    externalModelCalls: state.attempts.length,
    ordinaryCalls: state.attempts.filter((a) => a.role === 'ordinary').length,
    worldCalls: state.attempts.filter((a) => a.role === 'world').length,
    failedCalls: state.attempts.filter((a) =>
      ['rejected', 'failed'].includes(a.status),
    ).length,
    developmentInterventions: state.developmentAttempts.length,
    acceptedDevelopmentInterventions: state.developments.length,
    developmentModelCalls: null,
    developmentTokens: null,
    developmentMetering: state.developmentMetering,
    developmentAttempts: state.developmentAttempts,
    tokenUsage: {
      input: state.attempts.reduce(
        (n, a) => n + (a.usage?.inputTokens ?? 0),
        0,
      ),
      output: state.attempts.reduce(
        (n, a) => n + (a.usage?.outputTokens ?? 0),
        0,
      ),
      missing: state.attempts.filter((a) => a.usage === null).length,
    },
    elapsedCallMs: state.attempts.reduce((n, a) => n + (a.elapsedMs ?? 0), 0),
    survivors: actors.filter((a) => (a.health ?? 0) > 0).length,
    actors,
    lifecycle,
    objects: data.objects,
    jobs: data.jobs,
    allocations: data.allocations,
    benefits: data.benefits,
    messages: data.messages,
    productionByResource: Object.fromEntries(
      data.types.map((t) => [
        t.id,
        data.objects
          .filter(
            (o) =>
              data.blueprints.find((b) => b.id === o.blueprint)?.growth
                ?.output === t.id,
          )
          .reduce((n, o) => n + (o.growth?.produced ?? 0), 0),
      ]),
    ),
    materialReinvestment: run.frames.flatMap((frame, index) => {
      const previous = run.frames[index - 1];
      if (!previous) return [];
      const before = coevolutionData(previous),
        after = coevolutionData(frame);
      return frame.agents.flatMap((actor) => {
        const created = after.objects.filter(
          (o) => o.creator === actor.id && o.created === frame.tick,
        );
        if (!created.length) return [];
        return before.stacks
          .filter((s) => s.owner === actor.id && s.id.startsWith('yield-'))
          .flatMap((stack) => {
            const quantity =
                stack.quantity -
                (after.stacks.find((s) => s.id === stack.id)?.quantity ?? 0),
              source = data.objects.find((o) =>
                stack.id.startsWith(`yield-${o.id}-`),
              );
            return quantity > 0
              ? [
                  {
                    tick: frame.tick,
                    actor: actor.id,
                    stack: stack.id,
                    resource: stack.type,
                    quantity,
                    sourceObject: source?.id ?? null,
                    sourceCreator: source?.creator ?? null,
                    createdObjects: created.map((o) => ({
                      id: o.id,
                      blueprint: o.blueprint,
                    })),
                  },
                ]
              : [];
          });
      });
    }),
    events,
    interruptions: run.interruptions,
    stages: state.checkpoints.map((c) => ({
      tick: c.tick,
      ...c.report,
      projects: c.projects,
    })),
    curves: run.frames.map((f) => ({
      tick: f.tick,
      vitals: f.coevolution?.vitals,
      energy: f.coevolution?.energy,
      objects: f.coevolution?.objects.length,
      benefitEvents: f.coevolution?.benefits.length,
    })),
  };
  const report = `# ${id}: Development Motivation and World Coevolution\n\n## Goal\n\n${objective}\n\n## Protocol and outcome\n\nThree unassigned actors share a 24 by 24 primitive world, radius-five vision, starts eight steps apart, health100, satiety80 and prelearned basic eating. Action-first starvation10 and satiety loss2 remain unchanged. Carrying consumes actual energy; base rest recovers4. New abilities, finite ecology, costed objects and delayed processing require reviewed versioned declarations. No supplies or parameters change outside that protocol.\n\nObserved ${String(results.rounds)} of 180 target rounds. Execution phase: ${state.phase}. ${state.stopReason ?? ''} Archive completion means the saved observation and visuals are complete; a budget pause is not completion of 180 rounds. ${String(results.survivors)}/3 actors alive.\n\n## Measured results\n\n| Actor | Health | Satiety | Energy | Ordinary calls | Requests | New capability uses |\n| --- | --- | --- | --- | --- | --- | --- |\n${actors.map((a) => `| ${a.id} | ${String(a.health)} | ${String(a.satiety)} | ${String(a.energy)} | ${String(a.calls)} | ${String(a.requests)} | ${String(a.newCapabilityUses)} |`).join('\n')}\n\n${String(results.ordinaryCalls)}/120 ordinary attempts, ${String(results.worldCalls)}/20 world attempts, ${String(results.failedCalls)} failed/rejected calls; ${String(results.developmentInterventions)}/10 current-conversation development interventions. ${results.developmentMetering} Reported tokens: ${String(results.tokenUsage.input)} input / ${String(results.tokenUsage.output)} output, with ${String(results.tokenUsage.missing)} attempts missing usage. Missing telemetry is not zero and these totals do not cover conversation implementation. Total recorded call time ${String(Math.round(results.elapsedCallMs))}ms.\n\n${String(data.skills.length - 1)} new implementations, ${String(data.objects.length)} persistent objects, ${String(data.jobs.filter((j) => j.completed).length)} completed processing jobs, ${String(data.benefits.length)} physical effect events (including production, which is not consumption). Implemented, individually mastered, successfully used and persistently beneficial are separate fields in results.json. Basic eating is authored and excluded from discovery counts. Project text is self-reported; actual effects require event evidence.\n\n## Realized effects\n\n| Actor | Cultivated meals | Extra rest energy | Shared-platform rest events | Carrying energy saved |\n| --- | --- | --- | --- | --- |\n${actors.map((a) => `| ${a.id} | ${String(a.cultivatedMeals.length)} | ${String(a.extraRestEnergy)} | ${String(a.crossActorRest.length)} | ${String(a.carryingEnergySaved)} |`).join('\n')}\n\nCultivated meals are successful basic-eating uses of actual generated food stacks. Extra rest energy counts only realized recovery above the four-energy baseline after applying the cap. Production and unused ground stock are separate from eating. Thirty-round action windows remain descriptive: building, travel, harvesting and discretionary rest have different purposes, so these observations alone do not identify a causal labor reduction.\n\n## Stage reports\n\n${state.checkpoints.map((c) => `- Round ${String(c.tick)}: ${String(c.report.survivors)} survivors; minimum current satiety ${String(c.report.minimumSatiety)}; ${String(c.report.objects)} objects; ${String(c.report.benefitEvents)} physical effects; sustained project progress ${String(c.report.sustainedProjectProgress)}.`).join('\n') || 'No scheduled milestone reached.'}\n\n## Evidence and interpretation\n\n[Configuration](configuration.json), [offline preflight](preflight.json), [calls](model-calls.json), [execution](execution.json), [checkpoints](checkpoints.json), [stages](stages.json), [registry](skills.json), [versioned source and extension validation](source-history.json), [events and measurements](results.json), [replay](replay.json), [chart](overview.svg). Original failed calls and paused plans are retained. Fixtures and preflight are simulated and were never ordinary context. The retained behavioral analysis examines problem-to-benefit chains and alternative explanations. This joint exploratory run neither requires building/cooperation nor isolates a causal mechanism, and no model weights are trained.\n`;
  const colors = ['#55c7aa', '#f0b963', '#bca7ff'];
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="620" role="img" aria-label="${id} health and energy"><rect width="1160" height="620" fill="#10272b"/><g font-family="sans-serif" fill="#ecf4ee"><text x="40" y="40" font-size="25">${id} — Development and coevolution</text><text x="40" y="70">${String(run.rounds.length)}/180 rounds · ${String(results.survivors)}/3 survivors · ${String(data.objects.length)} objects · ${String(data.benefits.length)} physical effect events</text><text x="40" y="100">Health (solid, 0–100) and energy (dashed, 0–40)</text><path d="M70 120V450H1070" fill="none" stroke="#789"/>${actors.map((a, i) => `<polyline fill="none" stroke="${colors[i] ?? '#fff'}" stroke-width="3" points="${run.frames.map((f) => `${String(70 + (f.tick * 1000) / 180)},${String(450 - (f.coevolution?.vitals[a.id]?.health ?? 0) * 3)}`).join(' ')}"/><polyline fill="none" stroke="${colors[i] ?? '#fff'}" stroke-dasharray="4 4" points="${run.frames.map((f) => `${String(70 + (f.tick * 1000) / 180)},${String(450 - (f.coevolution?.energy[a.id] ?? 0) * 7.5)}`).join(' ')}"/><text x="${String(70 + i * 340)}" y="525" fill="${colors[i] ?? '#fff'}">${a.id}: HP${String(a.health)} · calls ${String(a.calls)}</text>`).join('')}<text x="70" y="480">0</text><text x="1010" y="480">180 rounds</text><text x="40" y="575">${String(results.ordinaryCalls)} ordinary / ${String(results.worldCalls)} world attempts. Joint exploratory observation; no causal isolation.</text></g></svg>\n`;
  const replay: unknown = JSON.parse(
    serializeReplay({
      schedule: 'coevolution-v1',
      frames: run.frames,
      coevolutionPrograms: run.programs,
      coevolutionRounds: run.rounds,
    }),
  );
  return { run: { ...run, replay }, results, report, chart };
}
