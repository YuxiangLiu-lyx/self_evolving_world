import { isDeepStrictEqual } from 'node:util';
import {
  acceptLearningProgram,
  advanceLearningRound,
  createLearningRun,
  lastLearningFrame,
  learningActions,
  learningData,
  pendingLearningPrograms,
  reviewedSkills,
  LEARNING_LIMITS,
  stepLearningRound,
} from '@self-evolving-world/world-core';
import type { LearningRun, WorldReview } from '@self-evolving-world/world-core';
import { initialLearningWorld } from '../apps/simulator/src/learning-scenario.js';
import {
  ordinaryLearningInput,
  worldLearningInput,
} from '../apps/simulator/src/learning-input.js';
import { learningRequest } from '../apps/simulator/src/learning-provider.js';
import {
  acceptDevelopment,
  budgetReviews,
  learningExecutionRun,
  parseOrdinaryLearning,
  parseWorldLearning,
} from '../apps/simulator/src/learning-run.js';
import type { LearningExecution } from '../apps/simulator/src/learning-run.js';
import { serializeReplay } from '../apps/viewer/src/timeline.js';
import { record } from '../apps/simulator/src/remote-data.js';

export const LEARNING_POLICY = 'survival-driven-skills-v1';
function assert(value: boolean, detail: string): asserts value {
  if (!value) throw new Error(`Learning archive: ${detail}`);
}
export function learningCallArchive(state: LearningExecution) {
  const run = createLearningRun(initialLearningWorld());
  // The world template has no actor-dependent input and does not execute a decision.
  return {
    format: 'self-evolving-world/learning-calls',
    version: 1,
    funding:
      state.controller === 'chatgpt-plan'
        ? 'chatgpt-plan-oauth'
        : 'simulated-test',
    endpoint: 'https://api.openai.com/v1/responses',
    model: state.model,
    templates: {
      ordinary: {
        ...learningRequest(
          state.model,
          'ordinary',
          ordinaryLearningInput(run, 'lin'),
        ),
        input: [],
      },
      world: {
        ...learningRequest(
          state.model,
          'world',
          ordinaryLearningInput(run, 'lin'),
        ),
        input: [],
      },
    },
    attempts: state.attempts,
  };
}
/** Parses durable state; full ledger audit below binds every call to its reconstructed input. */
export function readLearningExecution(value: unknown): LearningExecution {
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
      s.attempts.length <= 48 &&
      Array.isArray(s.developments),
    'invalid execution envelope',
  );
  const state = s as unknown as LearningExecution;
  const run = learningExecutionRun(state);
  assert(
    state.phase !== 'completed' || run.rounds.length === LEARNING_LIMITS.rounds,
    'premature completion',
  );
  assert(
    (state.phase === 'development') === (state.barrier !== null),
    'inconsistent development barrier',
  );
  if (state.barrier)
    assert(
      state.barrier.tick === run.rounds.length &&
        isDeepStrictEqual(state.barrier.input, worldLearningInput(run)),
      'stale development snapshot',
    );
  return state;
}
export function auditLearning(state: LearningExecution): LearningRun {
  let run = createLearningRun(initialLearningWorld()),
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
      a.tick === lastLearningFrame(run).tick &&
        ['accepted', 'failed', 'rejected', 'development'].includes(a.status),
      'attempt ordering/status mismatch',
    );
    if (a.response) {
      const d = a.response.decision,
        h = a.response.http;
      assert(
        typeof d.text === 'string' &&
          d.text.length <= 30_000 &&
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
    for (const actor of pendingLearningPrograms(run)) {
      const a = consume(),
        program = state.programs.find(
          (p) => p.agentId === actor && p.tick === tick,
        );
      assert(
        a.role === 'ordinary' &&
          a.actor === actor &&
          a.call === (run.cursors[actor]?.calls ?? 0) + 1 &&
          isDeepStrictEqual(a.input, ordinaryLearningInput(run, actor)) &&
          program !== undefined &&
          program.call === a.call,
        'ordinary identity/private input mismatch',
      );
      let parsed: { code: string; summary: string } | undefined;
      try {
        if (a.response)
          parsed = parseOrdinaryLearning(a.response.decision.text, actor, tick);
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
      run = acceptLearningProgram(run, program);
    }
    const requests = learningActions(run).filter(
      (a) =>
        a.type === 'learn' &&
        learningData(lastLearningFrame(run)).vitals[a.agentId]?.health !== 0,
    );
    let reviews: readonly WorldReview[] = [];
    if (requests.length) {
      const errors: string[] = [];
      let resolved = false,
        proposed: string | null = null,
        attempts = 0;
      while (
        !resolved &&
        attempts < LEARNING_LIMITS.attemptsPerBatch &&
        worldCount < LEARNING_LIMITS.worldAttempts
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
              worldLearningInput(run, errors.at(-1) ?? null),
            ),
          'world identity/input/budget mismatch',
        );
        let parsed: ReturnType<typeof parseWorldLearning> | undefined;
        proposed = a.response?.decision.text ?? proposed;
        try {
          if (a.response) {
            parsed = parseWorldLearning(a.response.decision.text);
            if (!parsed.needsDevelopment)
              reviewedSkills(
                lastLearningFrame(run),
                learningActions(run),
                parsed.reviews,
              );
          }
        } catch {
          parsed = undefined;
        }
        if (parsed && !parsed.needsDevelopment) {
          assert(a.status === 'accepted', 'valid review was misclassified');
          reviews = parsed.reviews;
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
            worldCount === LEARNING_LIMITS.worldAttempts &&
              attempts < LEARNING_LIMITS.attemptsPerBatch,
            'unresolved development before advance',
          );
          reviews = budgetReviews(run);
        } else {
          const barrier = {
            id: `round-${String(tick)}-world-${String(worldCount)}`,
            tick,
            input: worldLearningInput(run),
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
            { barrierId: barrier.id, tick, reviews: d.reviews, notes: d.notes },
          );
          reviews = d.reviews;
          developmentCount++;
        }
      }
    }
    assert(
      isDeepStrictEqual(state.rounds[tick], {
        actions: learningActions(run),
        reviews,
      }),
      'round bypassed decisions or world review',
    );
    run = advanceLearningRound(run, reviews);
  }
  assert(
    offset === state.attempts.length &&
      developmentCount === state.developments.length &&
      isDeepStrictEqual(run.programs, state.programs),
    'unconsumed ledger entries',
  );
  return run;
}
function checkFrames(run: LearningRun): void {
  for (const frame of run.frames) {
    const data = learningData(frame),
      owned = [...frame.items, ...frame.agents.flatMap((a) => a.inventory)].map(
        (i) => i.id,
      );
    assert(
      new Set(owned).size === owned.length &&
        owned.every(
          (id) =>
            (data.environment.resources.find((r) => r.id === id)?.quantity ??
              0) > 0,
        ),
      'duplicate or empty owned resources',
    );
    assert(
      data.environment.resources.every(
        (r) =>
          Number.isInteger(r.quantity) &&
          r.quantity >= 0 &&
          (r.quantity === 0 || owned.includes(r.id)) &&
          r.durability >= 0 &&
          r.durability <= 3,
      ),
      'resource ownership/quantity/tool wear mismatch',
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
      if (!frame.tick) continue;
      const before = run.frames[frame.tick - 1];
      assert(before !== undefined, 'missing prior frame');
      const prior = learningData(before),
        old = prior.vitals[actor.id],
        event = data.events.find((e) => e.action.agentId === actor.id);
      assert(
        old !== undefined && event !== undefined,
        'missing transition evidence',
      );
      let health = old.health,
        satiety = old.satiety;
      if (health > 0) {
        if (event.action.type === 'use' && event.outcome === 'used') {
          const action = event.action,
            spec = prior.skills.find((s) => s.id === action.skillId);
          assert(spec !== undefined, 'unregistered executed skill');
          for (const instruction of spec.instructions)
            if (instruction.op === 'consume') {
              const resource = prior.environment.resources.find(
                (r) => r.id === action.args[instruction.parameter],
              );
              assert(resource !== undefined, 'missing consumed resource');
              satiety = Math.min(
                100,
                satiety + resource.nutrition * instruction.quantity,
              );
              health = Math.max(
                0,
                health - resource.toxicity * instruction.quantity,
              );
            }
        }
        if (health > 0) {
          if (satiety === 0) health = Math.max(0, health - 10);
          satiety = Math.max(0, satiety - 3);
        }
      }
      assert(
        vital.health === health && vital.satiety === satiety,
        'independent survival accounting mismatch',
      );
    }
  }
}
export function measureLearning(
  id: string,
  objective: string,
  executionInput: unknown,
  callsInput: unknown,
) {
  const state = readLearningExecution(executionInput);
  assert(
    state.phase === 'completed' && state.controller === 'chatgpt-plan',
    'archive requires a finished real-model run',
  );
  assert(
    isDeepStrictEqual(callsInput, learningCallArchive(state)),
    'model archive/template mismatch',
  );
  const run = auditLearning(state);
  checkFrames(run);
  const final = lastLearningFrame(run),
    data = learningData(final);
  let control = initialLearningWorld();
  const controlFrames = [control];
  for (let tick = 0; tick < 18; tick++) {
    control = stepLearningRound(control, {
      actions: control.agents.map((a) => ({ type: 'wait', agentId: a.id })),
      reviews: [],
    });
    controlFrames.push(control);
  }
  const actors = final.agents.map((a) => {
    const events = run.frames.flatMap(
      (f) => f.learning?.events.filter((e) => e.action.agentId === a.id) ?? [],
    );
    return {
      id: a.id,
      ...data.vitals[a.id],
      calls: state.attempts.filter((c) => c.actor === a.id).length,
      learned: data.knowledge[a.id]?.learned ?? [],
      requests: events.filter((e) => e.action.type === 'learn').length,
      successfulUses: events.filter((e) => e.outcome === 'used').length,
      waits: events.filter(
        (e) => e.action.type === 'wait' && e.outcome !== 'dead',
      ).length,
      deathRound:
        run.frames.find((f) => f.learning?.vitals[a.id]?.health === 0)?.tick ??
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
    goals: {
      realWorldReview: state.attempts.some(
        (a) => a.role === 'world' && a.status === 'accepted',
      ),
      generatedSkillExecuted: actors.some((a) => a.successfulUses > 0),
      survivedBeyondIdle: actors.some(
        (a) => a.deathRound === null || a.deathRound > 15,
      ),
    },
    control: {
      kind: 'deterministic-all-wait-no-model',
      survivors: 0,
      deathRound: 15,
      healthRound5: controlFrames[5]?.learning?.vitals.lin?.health,
      healthRound6: controlFrames[6]?.learning?.vitals.lin?.health,
    },
    interpretation:
      'The idle control demonstrates the starvation baseline, not a causal estimate of learning benefit. Model decisions and additional actions differ together. See the required conversation analysis for hypotheses and proposed improvements.',
  };
  const report = `# ${id}: Survival-driven Skill Learning\n\n## Goal\n\n${objective}\n\n## Protocol\n\nThree actors, 18 synchronous rounds, at most 12 ordinary calls per actor and 12 World Agent attempts total; two attempts per review batch. ChatGPT-plan OAuth, no API-key fallback. World review and constrained-code development complete before the round barrier. The deterministic all-wait control makes no model calls.\n\n## Results\n\n${String(results.externalModelCalls)} model attempts (${String(results.worldCalls)} World Agent); ${String(results.acceptedCalls)} accepted, ${String(results.failedCalls)} failed/rejected. ${String(results.registeredSkills)} registered implementations; ${String(results.survivors)}/3 survivors; ${String(results.developmentBarriers)} conversation development barriers. ${String(results.framesChecked)} reconstructed snapshots and zero invariant failures.\n\n| Actor | Health | Satiety | Learned | Successful uses | Death round |\n| --- | --- | --- | --- | --- | --- |\n${actors.map((a) => `| ${a.id} | ${String(a.health)} | ${String(a.satiety)} | ${a.learned.join(', ') || 'None'} | ${String(a.successfulUses)} | ${String(a.deathRound ?? 'Alive')} |`).join('\n')}\n\nGoal checks: ${Object.entries(
    results.goals,
  )
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(
      '; ',
    )}. A completed execution does not imply every scientific objective was achieved.\n\nAll-wait offline control: health100 at round5, health90 at round6, death at round15. ${results.interpretation}\n\n## Evidence\n\n[Replay](replay.json), [model inputs and outputs](model-calls.json), [durable decisions and development](execution.json), [executable registry](skills.json), [measurements](results.json), [chart](overview.svg). The replay retains detailed requests, review reasons, individual progress and actual use outcomes. Prompts and model response identifiers are retained; credentials and hidden reasoning are not.\n`;
  const colors = ['#4fbcaa', '#e7ad58', '#a795ec'];
  const lines = actors
    .map(
      (a, i) =>
        `<polyline fill="none" stroke="${colors[i] ?? '#fff'}" stroke-width="3" points="${run.frames.map((f) => `${String(80 + f.tick * 52)},${String(390 - (f.learning?.vitals[a.id]?.health ?? 0) * 3)}`).join(' ')}"/><text x="${String(120 + i * 290)}" y="450" fill="${colors[i] ?? '#fff'}">${a.id}: HP ${String(a.health)}, satiety ${String(a.satiety)}, skills ${String(a.learned.length)}</text>`,
    )
    .join('');
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="540" role="img" aria-label="${id} survival results"><rect width="1160" height="540" fill="#10272b"/><g font-family="sans-serif" fill="#ecf4ee"><text x="40" y="40" font-size="25">${id} — Survival-driven skill learning</text><text x="40" y="70">Health by round · ${String(results.registeredSkills)} generated skills · ${String(results.survivors)}/3 survivors</text><path d="M80 90V390H1016" fill="none" stroke="#678"/><text x="35" y="100">100</text><text x="50" y="395">0</text><text x="80" y="420">0</text><text x="1000" y="420">18 rounds</text><polyline fill="none" stroke="#9ba7a8" stroke-dasharray="7 5" points="${controlFrames.map((f) => `${String(80 + f.tick * 52)},${String(390 - (f.learning?.vitals.lin?.health ?? 0) * 3)}`).join(' ')}"/>${lines}<text x="40" y="495">Dashed: offline all-wait control, death at round15. Comparison is descriptive, not causal.</text></g></svg>\n`;
  const replay: unknown = JSON.parse(
    serializeReplay({
      schedule: 'learning-v1',
      frames: run.frames,
      learningPrograms: run.programs,
      learningRounds: run.rounds,
    }),
  );
  return { run: { ...run, replay }, results, report, chart };
}
