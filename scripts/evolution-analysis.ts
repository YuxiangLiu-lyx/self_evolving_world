import { isDeepStrictEqual } from 'node:util';
import {
  acceptEvolutionProgram,
  advanceEvolutionRound,
  createEvolutionRun,
  lastEvolutionFrame,
  evolutionActions,
  evolutionData,
  pendingEvolutionPrograms,
  registerEvolution,
  EVOLUTION_LIMITS,
  stepEvolutionRound,
  EMPTY_PROPOSAL,
} from '@self-evolving-world/world-core';
import type {
  EvolutionRun,
  EvolutionProposal,
} from '@self-evolving-world/world-core';
import {
  initialEvolutionWorld,
  STARTING_REGIONS,
} from '../apps/simulator/src/evolution-scenario.js';
import {
  ordinaryEvolutionInput,
  worldEvolutionInput,
} from '../apps/simulator/src/evolution-input.js';
import { evolutionRequest } from '../apps/simulator/src/evolution-provider.js';
import {
  acceptDevelopment,
  budgetReviews,
  evolutionExecutionRun,
  parseOrdinaryEvolution,
  parseWorldEvolution,
} from '../apps/simulator/src/evolution-run.js';
import type { EvolutionExecution } from '../apps/simulator/src/evolution-run.js';
import { serializeReplay } from '../apps/viewer/src/timeline.js';
import { record } from '../apps/simulator/src/remote-data.js';

export const EVOLUTION_POLICY = 'heterogeneous-evolution-v1';
function assert(value: boolean, detail: string): asserts value {
  if (!value) throw new Error(`Evolution archive: ${detail}`);
}
export function evolutionCallArchive(state: EvolutionExecution) {
  const run = createEvolutionRun(initialEvolutionWorld());
  // The world template has no actor-dependent input and does not execute a decision.
  return {
    format: 'self-evolving-world/evolution-calls',
    version: 1,
    funding:
      state.controller === 'chatgpt-plan'
        ? 'chatgpt-plan-oauth'
        : 'simulated-test',
    endpoint: 'https://api.openai.com/v1/responses',
    model: state.model,
    templates: {
      ordinary: {
        ...evolutionRequest(
          state.model,
          'ordinary',
          ordinaryEvolutionInput(run, 'lin'),
        ),
        input: [],
      },
      world: {
        ...evolutionRequest(
          state.model,
          'world',
          ordinaryEvolutionInput(run, 'lin'),
        ),
        input: [],
      },
    },
    attempts: state.attempts,
  };
}
/** Parses durable state; full ledger audit below binds every call to its reconstructed input. */
export function readEvolutionExecution(value: unknown): EvolutionExecution {
  const s = record(value);
  assert(
    s.version === 1 &&
      ['chatgpt-plan', 'simulated-test'].includes(String(s.controller)) &&
      ['running', 'development', 'completed'].includes(String(s.phase)) &&
      typeof s.model === 'string' &&
      s.model.length > 0 &&
      Array.isArray(s.programs) &&
      Array.isArray(s.rounds) &&
      Array.isArray(s.attempts) &&
      s.attempts.length <= 288 &&
      Array.isArray(s.developments),
    'invalid execution envelope',
  );
  const state = s as unknown as EvolutionExecution;
  const run = evolutionExecutionRun(state);
  assert(
    state.phase !== 'completed' ||
      run.rounds.length === EVOLUTION_LIMITS.rounds,
    'premature completion',
  );
  assert(
    (state.phase === 'development') === (state.barrier !== null),
    'inconsistent development barrier',
  );
  if (state.barrier)
    assert(
      state.barrier.tick === run.rounds.length &&
        isDeepStrictEqual(state.barrier.input, worldEvolutionInput(run)),
      'stale development snapshot',
    );
  return state;
}
export function auditEvolution(state: EvolutionExecution): EvolutionRun {
  let run = createEvolutionRun(initialEvolutionWorld()),
    offset = 0,
    worldCount = 0,
    developmentCount = 0;
  const responseIds = new Set<string>();
  const consume = () => {
    const a = state.attempts[offset++];
    assert(
      a !== undefined && a.status !== 'started',
      'missing or uncertain model attempt',
    );
    assert(
      a.tick === lastEvolutionFrame(run).tick &&
        ['accepted', 'failed', 'rejected', 'development'].includes(a.status),
      'attempt ordering/status mismatch',
    );
    if (a.response) {
      const d = a.response.decision,
        h = a.response.http;
      assert(
        typeof d.text === 'string' &&
          d.text.length <= 60_000 &&
          typeof d.responseId === 'string' &&
          d.responseId.length > 0 &&
          !responseIds.has(d.responseId) &&
          ['sse', 'json'].includes(d.responseFormat ?? '') &&
          h.status >= 200 &&
          h.status < 300,
        'invalid or duplicate HTTP completion',
      );
      responseIds.add(d.responseId);
      assert(
        a.status !== 'failed',
        'completed response cannot be a transport failure',
      );
    } else assert(a.status === 'failed', 'missing response evidence');
    if (a.status !== 'accepted')
      assert(
        typeof a.error === 'string' && a.error.length > 0,
        'missing failure reason',
      );
    return a;
  };
  for (let tick = 0; tick < state.rounds.length; tick++) {
    for (const actor of pendingEvolutionPrograms(run)) {
      const a = consume(),
        program = state.programs.find(
          (p) => p.agentId === actor && p.tick === tick,
        );
      assert(
        a.role === 'ordinary' &&
          a.actor === actor &&
          a.call === (run.cursors[actor]?.calls ?? 0) + 1 &&
          isDeepStrictEqual(a.input, ordinaryEvolutionInput(run, actor)) &&
          program !== undefined &&
          program.call === a.call,
        'ordinary identity/private input mismatch',
      );
      let parsed: { code: string; summary: string } | undefined;
      try {
        if (a.response)
          parsed = parseOrdinaryEvolution(
            a.response.decision.text,
            actor,
            tick,
          );
      } catch {
        /* Invalid outputs remain visible and consume budget. */
      }
      assert(
        parsed
          ? a.status === 'accepted' &&
              program.code === parsed.code &&
              program.summary === parsed.summary
          : ['failed', 'rejected'].includes(a.status) && program.code === null,
        'ordinary response/program mismatch',
      );
      run = acceptEvolutionProgram(run, program);
    }
    const requests = evolutionActions(run).filter(
      (a) =>
        a.type === 'learn' &&
        evolutionData(lastEvolutionFrame(run)).vitals[a.agentId]?.health !== 0,
    );
    let proposal: EvolutionProposal = EMPTY_PROPOSAL;
    if (requests.length) {
      const errors: string[] = [];
      let resolved = false,
        proposed: string | null = null,
        attempts = 0;
      while (
        !resolved &&
        attempts < EVOLUTION_LIMITS.attemptsPerBatch &&
        worldCount < EVOLUTION_LIMITS.worldAttempts
      ) {
        const a = consume();
        attempts++;
        worldCount++;
        assert(
          a.role === 'world' &&
            a.actor === 'world' &&
            a.call === worldCount &&
            isDeepStrictEqual(
              a.input,
              worldEvolutionInput(run, errors.at(-1) ?? null),
            ),
          'world identity/input/budget mismatch',
        );
        let parsed: ReturnType<typeof parseWorldEvolution> | undefined;
        proposed = a.response?.decision.text ?? proposed;
        try {
          if (a.response) {
            parsed = parseWorldEvolution(a.response.decision.text);
            if (!parsed.needsDevelopment)
              registerEvolution(
                lastEvolutionFrame(run),
                evolutionActions(run),
                parsed.proposal,
              );
          }
        } catch {
          parsed = undefined;
        }
        if (parsed && !parsed.needsDevelopment) {
          assert(a.status === 'accepted', 'valid review was misclassified');
          proposal = parsed.proposal;
          resolved = true;
        } else {
          assert(
            parsed?.needsDevelopment
              ? a.status === 'development'
              : ['failed', 'rejected'].includes(a.status),
            'invalid world response classification',
          );
          errors.push(a.error ?? '');
        }
        if (a.status === 'development') break;
      }
      if (!resolved) {
        const d = state.developments[developmentCount];
        // An exhausted global budget rejects only when no development barrier was saved.
        if (!d || d.barrier.tick !== tick) {
          assert(
            worldCount === EVOLUTION_LIMITS.worldAttempts &&
              attempts < EVOLUTION_LIMITS.attemptsPerBatch,
            'unresolved development before advance',
          );
          proposal = budgetReviews(run);
        } else {
          const barrier = {
            id: `round-${String(tick)}-world-${String(worldCount)}`,
            tick,
            input: worldEvolutionInput(run),
            errors,
            proposed,
          };
          assert(
            isDeepStrictEqual(d.barrier, barrier) &&
              record(d).reviewer === 'current-codex-conversation',
            'development provenance mismatch',
          );
          acceptDevelopment(
            {
              ...state,
              programs: run.programs,
              rounds: run.rounds,
              phase: 'development',
              barrier,
              developments: [],
            },
            {
              barrierId: barrier.id,
              tick,
              proposal: d.proposal,
              notes: d.notes,
            },
          );
          proposal = d.proposal;
          developmentCount++;
        }
      }
    }
    assert(
      isDeepStrictEqual(state.rounds[tick], {
        actions: evolutionActions(run),
        proposal,
      }),
      'round bypassed decisions or world review',
    );
    run = advanceEvolutionRound(run, proposal);
  }
  assert(
    offset === state.attempts.length &&
      developmentCount === state.developments.length &&
      isDeepStrictEqual(run.programs, state.programs),
    'unconsumed ledger entries',
  );
  return run;
}
/** Independent conservation/bounds and action-first metabolism accounting. */
function checkFrames(run: EvolutionRun): void {
  for (const frame of run.frames) {
    const data = evolutionData(frame),
      owned = [...frame.items, ...frame.agents.flatMap((a) => a.inventory)].map(
        (s) => s.id,
      );
    assert(new Set(owned).size === owned.length, 'duplicate ownership');
    assert(
      data.stacks.every(
        (s) =>
          Number.isInteger(s.quantity) &&
          s.quantity >= 0 &&
          s.durability >= 0 &&
          s.durability <= 12 &&
          s.quantity > 0 === owned.includes(s.id),
      ),
      'invalid resource accounting',
    );
    assert(
      data.sites.every((s) =>
        Object.values(s.stock).every((n) => Number.isInteger(n) && n >= 0),
      ),
      'invalid finite stock',
    );
    for (const actor of frame.agents) {
      const vital = data.vitals[actor.id];
      assert(
        vital !== undefined &&
          vital.health >= 0 &&
          vital.health <= 100 &&
          vital.satiety >= 0 &&
          vital.satiety <= 100,
        'invalid vital bounds',
      );
      const before = run.frames[frame.tick - 1];
      if (!before) continue;
      const prior = evolutionData(before),
        old = prior.vitals[actor.id],
        event = data.events.find((e) => e.action.agentId === actor.id);
      assert(old !== undefined && event !== undefined, 'missing transition');
      let health = old.health,
        satiety = old.satiety;
      if (health > 0) {
        if (event.action.type === 'use' && event.outcome === 'used') {
          const action = event.action,
            skill = prior.skills.find((s) => s.id === action.skillId),
            mechanic = prior.mechanics.find((m) => m.id === skill?.mechanicId);
          assert(mechanic !== undefined, 'unregistered execution');
          // Resolve generated intermediates as well as original stacks; effects remain transactional.
          const kinds = new Map(prior.stacks.map((s) => [s.id, s.type]));
          for (const [i, op] of mechanic.operations.entries()) {
            if (op.op === 'consume') {
              const type = prior.types.find(
                (t) => t.id === kinds.get(action.args[op.target ?? ''] ?? ''),
              );
              assert(type !== undefined, 'missing consumed type');
              satiety = Math.min(100, satiety + type.nutrition * op.quantity);
              health = Math.max(0, health - type.toxicity * op.quantity);
            }
            if (op.op === 'extract' || op.op === 'convert')
              kinds.set(
                `produced-${String(frame.tick)}-${actor.id}-${String(i)}`,
                op.resource ?? '',
              );
          }
        }
        if (satiety === 0) health = Math.max(0, health - 10);
        satiety = Math.max(0, satiety - 2);
      }
      assert(
        vital.health === health && vital.satiety === satiety,
        'survival accounting mismatch',
      );
      for (const site of prior.sites)
        if (site.allocation !== null)
          assert(
            data.sites.find((s) => s.id === site.id)?.allocation ===
              site.allocation,
            'reassigned ecological stock',
          );
    }
  }
}
export function measureEvolution(
  id: string,
  objective: string,
  executionInput: unknown,
  callsInput: unknown,
) {
  const state = readEvolutionExecution(executionInput);
  assert(
    state.phase === 'completed' && state.controller === 'chatgpt-plan',
    'archive requires a completed real-model run',
  );
  assert(
    isDeepStrictEqual(callsInput, evolutionCallArchive(state)),
    'model archive/template mismatch',
  );
  const run = auditEvolution(state);
  checkFrames(run);
  const final = lastEvolutionFrame(run),
    data = evolutionData(final);
  let control = initialEvolutionWorld();
  const controlFrames = [control];
  for (let t = 0; t < EVOLUTION_LIMITS.rounds; t++) {
    control = stepEvolutionRound(control, {
      actions: control.agents.map((a) => ({ type: 'wait', agentId: a.id })),
      proposal: EMPTY_PROPOSAL,
    });
    controlFrames.push(control);
  }
  const actors = final.agents.map((a) => {
    const events = run.frames.flatMap(
        (f) =>
          f.evolution?.events.filter((e) => e.action.agentId === a.id) ?? [],
      ),
      memory = data.memory[a.id];
    return {
      id: a.id,
      startingEnvironment:
        STARTING_REGIONS[a.id as keyof typeof STARTING_REGIONS],
      executedActions: events.filter((e) => e.outcome !== 'dead').length,
      movement: run.frames.map((f) => ({
        tick: f.tick,
        position: f.agents.find((x) => x.id === a.id)?.position,
      })),
      actionHistory: events.filter((e) => e.outcome !== 'dead'),
      encounters: final.agents
        .filter((other) => other.id !== a.id)
        .flatMap((other) => {
          const first = run.frames.find((f) =>
            f.observations
              .find((o) => o.self.id === a.id)
              ?.agents.some((x) => x.id === other.id),
          );
          return first ? [{ actor: other.id, firstSeenRound: first.tick }] : [];
        }),
      ...data.vitals[a.id],
      position: a.position,
      calls: state.attempts.filter((c) => c.actor === a.id).length,
      learned: data.knowledge[a.id]?.learned ?? [],
      requests: events.filter((e) => e.action.type === 'learn').length,
      successfulUses: events.filter((e) => e.outcome === 'used').length,
      failedActions: events.filter((e) =>
        /failed|blocked|conflict|rejected/.test(e.outcome),
      ).length,
      waits: events.filter(
        (e) => e.action.type === 'wait' && e.outcome !== 'dead',
      ).length,
      visitedCells: memory?.visited.length ?? 0,
      discoveredObjects: memory?.discovered.length ?? 0,
      knownTypes: memory?.knownTypes ?? [],
      interruptions: run.interruptions.filter((i) => i.actor === a.id),
      deathRound:
        run.frames.find((f) => f.evolution?.vitals[a.id]?.health === 0)?.tick ??
        null,
    };
  });
  const results = {
    rounds: run.rounds.length,
    framesChecked: run.frames.length,
    totalActions: run.rounds.length * final.agents.length,
    invariantFailures: 0,
    externalModelCalls: state.attempts.length,
    acceptedCalls: state.attempts.filter((a) => a.status === 'accepted').length,
    failedCalls: state.attempts.filter((a) =>
      ['failed', 'rejected'].includes(a.status),
    ).length,
    worldCalls: state.attempts.filter((a) => a.role === 'world').length,
    developmentBarriers: state.developments.length,
    registeredSkills: data.skills.length,
    survivors: actors.filter((a) => (a.health ?? 0) > 0).length,
    actors,
    growth: {
      initialTypes: evolutionData(run.frames[0] ?? final).types.length,
      finalTypes: data.types.length,
      ecologyRules: data.ecology.length,
      mechanics: data.mechanics.length,
      assignedSites: data.sites.filter((s) => s.allocation !== null).length,
      emptyAssignedSites: data.sites.filter(
        (s) =>
          s.allocation !== null && Object.values(s.stock).every((n) => n === 0),
      ).length,
    },
    curves: run.frames.map((f) => ({
      tick: f.tick,
      vitals: evolutionData(f).vitals,
      types: evolutionData(f).types.length,
      mechanics: evolutionData(f).mechanics.length,
    })),
    goals: {
      realWorldReview: state.attempts.some(
        (a) => a.role === 'world' && a.status === 'accepted',
      ),
      generatedSkillExecuted: actors.some((a) => a.successfulUses > 0),
      resourceVocabularyExpanded: data.types.length > 6,
      survivedBeyondIdle: actors.some(
        (a) => a.deathRound === null || a.deathRound > 40,
      ),
    },
    control: {
      kind: 'deterministic-all-wait-no-model',
      deathRound: 40,
      healthRound30: controlFrames[30]?.evolution?.vitals.lin?.health,
      healthRound31: controlFrames[31]?.evolution?.vitals.lin?.health,
    },
    interpretation:
      'An unsuccessful survival outcome remains a valid experiment. The all-wait control is descriptive, not a causal estimate of learning benefit. New mechanics use a constrained executable operation language; unrestricted new physics is outside this prototype.',
  };
  const report = `# ${id}: Heterogeneous Survival and World Evolution\n\n## Goal\n\n${objective}\n\n## Fixed protocol\n\nFour ordinary actors share one prompt and autonomy on a seeded 48 by 48 map. 120 synchronous rounds; 60 ordinary attempts per actor; 48 World Agent attempts, two per batch. Initial health 100, satiety 60; action first, zero-satiety damage 10, then satiety loss 2. No refill, rescue, forced destination or required skill. ChatGPT-plan OAuth; no paid API-key fallback. Each model decision, ecological assignment and executable implementation is retained. World development finishes before advancing time.\n\n## Results\n\n${String(results.externalModelCalls)} model attempts (${String(results.worldCalls)} world); ${String(results.acceptedCalls)} accepted, ${String(results.failedCalls)} failed/rejected. ${String(results.registeredSkills)} shared skills, ${String(data.types.length - 6)} new resource types, ${String(data.ecology.length)} ecological rules. ${String(results.survivors)}/4 survivors. ${String(results.framesChecked)} reconstructed snapshots; zero invariant failures.\n\n| Actor | Health | Satiety | Learned | Uses | Cells visited | Death round |\n| --- | --- | --- | --- | --- | --- | --- |\n${actors.map((a) => `| ${a.id} | ${String(a.health)} | ${String(a.satiety)} | ${a.learned.join(', ') || 'None'} | ${String(a.successfulUses)} | ${String(a.visitedCells)} | ${String(a.deathRound ?? 'Alive')} |`).join('\n')}\n\nGoal observations: ${Object.entries(
    results.goals,
  )
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(
      '; ',
    )}. ${results.interpretation}\n\n## Evidence\n\n[Replay](replay.json), [full model ledger](model-calls.json), [durable execution](execution.json), [world registry](skills.json), [measurements and curves](results.json), [chart](overview.svg). The required behavioral analysis is indexed under ../analyses. The offline all-wait control dies at round 40; the integration smoke is a simulated test, never real-model evidence.\n`;
  const colors = ['#4fbcaa', '#e7ad58', '#a795ec', '#ec8fa0'];
  const lines = actors
    .map(
      (a, i) =>
        `<polyline fill="none" stroke="${colors[i] ?? '#fff'}" stroke-width="3" points="${run.frames.map((f) => `${String(70 + f.tick * 8)},${String(390 - (f.evolution?.vitals[a.id]?.health ?? 0) * 3)}`).join(' ')}"/><text x="${String(70 + i * 275)}" y="455" fill="${colors[i] ?? '#fff'}">${a.id}: HP ${String(a.health)} / S ${String(a.satiety)}</text>`,
    )
    .join('');
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="540" role="img" aria-label="${id} survival curves"><rect width="1160" height="540" fill="#10272b"/><g font-family="sans-serif" fill="#ecf4ee"><text x="40" y="40" font-size="25">${id} — Heterogeneous survival and world evolution</text><text x="40" y="70">Health by round · ${String(results.registeredSkills)} skills · ${String(results.survivors)}/4 survivors</text><path d="M70 90V390H1030" fill="none" stroke="#678"/><text x="25" y="100">100</text><text x="40" y="395">0</text><text x="70" y="420">0</text><text x="980" y="420">120 rounds</text><polyline fill="none" stroke="#9ba7a8" stroke-dasharray="7 5" points="${controlFrames.map((f) => `${String(70 + f.tick * 8)},${String(390 - (f.evolution?.vitals.lin?.health ?? 0) * 3)}`).join(' ')}"/>${lines}<text x="40" y="505">Dashed: offline all-wait control, death at round 40. Descriptive comparison only.</text></g></svg>\n`;
  const replay: unknown = JSON.parse(
    serializeReplay({
      schedule: 'evolution-v1',
      frames: run.frames,
      evolutionPrograms: run.programs,
      evolutionRounds: run.rounds,
    }),
  );
  return { run: { ...run, replay }, results, report, chart };
}
