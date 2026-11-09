import { isDeepStrictEqual } from 'node:util';
import {
  acceptProgram,
  advanceProgramRound,
  createProgramRun,
  MILD_SURVIVAL,
  parseBehaviorCode,
} from '@self-evolving-world/world-core';
import { parseReplay, serializeReplay } from '../apps/viewer/src/timeline.js';
import type { Timeline } from '../apps/viewer/src/timeline.js';
import {
  initialSurvivalWorld,
  programDecision,
  programInput,
} from '../apps/simulator/src/survival-run.js';
import type { ModelAttempt } from '../apps/simulator/src/survival-run.js';
import { programRequest } from '../apps/simulator/src/program-provider.js';
import { record, string } from '../apps/simulator/src/remote-data.js';
import { checkSnapshot } from './experiment-analysis.js';

export const SURVIVAL_POLICY = 'bounded-survival-programs-v1';
export function modelCallArchive(
  model: string,
  attempts: readonly ModelAttempt[],
) {
  const first = createProgramRun(initialSurvivalWorld());
  return {
    format: 'self-evolving-world/model-calls',
    version: 1,
    funding: 'chatgpt-plan-oauth',
    endpoint: 'https://api.openai.com/v1/responses',
    model,
    requestTemplate: {
      ...programRequest(model, programInput(first, 'lin')),
      input: [],
    },
    attempts,
  };
}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Survival archive: ${message}`);
}
function auditCalls(timeline: Timeline, input: unknown) {
  const ledger = record(input),
    initial = timeline.frames[0];
  const model = string(ledger.model, 'recorded model');
  if (!initial || !timeline.programs || !Array.isArray(ledger.attempts))
    throw new Error('Missing model ledger or program replay.');
  assert(
    isDeepStrictEqual({ ...ledger, attempts: [] }, modelCallArchive(model, [])),
    'model transport or request template mismatch',
  );
  const attempts: unknown[] = ledger.attempts;
  assert(
    attempts.length === timeline.programs.length && attempts.length <= 15,
    'attempt budget or count mismatch',
  );
  let audit = createProgramRun(initial);
  let completed = 0,
    accepted = 0;
  const responseIds = new Set<string>();
  for (const [index, program] of timeline.programs.entries()) {
    while (audit.frames.length - 1 < program.tick)
      audit = advanceProgramRound(audit);
    const call = record(attempts[index]);
    assert(
      call.agentId === program.agentId &&
        call.tick === program.tick &&
        call.call === program.call &&
        isDeepStrictEqual(call.input, programInput(audit, program.agentId)),
      'call identity or private observation mismatch',
    );
    if (call.response !== undefined) {
      const response = record(call.response),
        decision = record(response.decision),
        http = record(response.http);
      const responseId = string(decision.responseId, 'response id');
      assert(
        responseId.length <= 200 &&
          !responseIds.has(responseId) &&
          (decision.responseFormat === 'sse' ||
            decision.responseFormat === 'json'),
        'missing or reused completed response',
      );
      responseIds.add(responseId);
      assert(
        typeof http.status === 'number' &&
          http.status >= 200 &&
          http.status < 300 &&
          (http.requestId === null || typeof http.requestId === 'string') &&
          (http.contentType === null || typeof http.contentType === 'string'),
        'invalid HTTP completion evidence',
      );
      completed++;
      const text = string(decision.text, 'completed program text');
      let parsed: { code: string; summary: string } | undefined;
      try {
        parsed = programDecision(text, program.agentId, 60 - program.tick);
      } catch {
        /* Rejected completed output is retained, never silently repaired. */
      }
      if (parsed) {
        assert(
          call.status === 'accepted' &&
            call.error === undefined &&
            parsed.code === program.code &&
            parsed.summary === program.summary,
          'accepted program differs from model output',
        );
        accepted++;
      } else
        assert(
          call.status === 'rejected' &&
            program.code === null &&
            typeof call.error === 'string',
          'invalid rejection record',
        );
    } else
      assert(
        call.status === 'failed' &&
          program.code === null &&
          typeof call.error === 'string' &&
          call.error.length > 0,
        'unfinished or fabricated model attempt',
      );
    audit = acceptProgram(audit, program);
  }
  while (audit.frames.length <= 60) audit = advanceProgramRound(audit);
  assert(
    isDeepStrictEqual(audit.frames, timeline.frames),
    'program execution mismatch',
  );
  return {
    model,
    attempted: attempts.length,
    completed,
    accepted,
    failed: attempts.length - completed,
    rejected: completed - accepted,
  };
}

export function measureSurvival(
  id: string,
  objective: string,
  replay: unknown,
  ledger: unknown,
) {
  const timeline = parseReplay(JSON.stringify(replay));
  const initial = timeline.frames[0],
    final = timeline.frames.at(-1);
  assert(
    timeline.schedule === 'survival-v1' &&
      timeline.frames.length === 61 &&
      isDeepStrictEqual(initial, initialSurvivalWorld()),
    'expected the founding mild 60-round protocol',
  );
  if (!initial || !final?.survival || !timeline.programs)
    throw new Error('Missing survival frames.');
  assert(
    isDeepStrictEqual(replay, JSON.parse(serializeReplay(timeline)) as unknown),
    'noncanonical replay',
  );
  const calls = auditCalls(timeline, ledger);
  const outcomes: Record<string, number> = {};
  for (const [tick, frame] of timeline.frames.entries()) {
    checkSnapshot(frame, initial, tick);
    assert(
      isDeepStrictEqual(frame.survival?.config, MILD_SURVIVAL),
      'mutable environment',
    );
    for (const agent of frame.agents) {
      const v = frame.survival?.vitals[agent.id];
      // Independent expected trajectory for this fixed mild protocol, not a second reducer call.
      assert(
        isDeepStrictEqual(v, {
          satiety: 100 - tick * 0.5,
          cold: 0,
          heat: 0,
          health: 100,
        }),
        'mild vital trajectory mismatch',
      );
    }
    const events = frame.survival?.events ?? [];
    assert(
      events.length === (tick === 0 ? 0 : 3),
      'missing simultaneous outcomes',
    );
    for (const event of events) {
      outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      if (event.action.type === 'learn')
        assert(event.outcome === 'learning-denied', 'learning must be denied');
    }
  }
  const agents = final.agents.map((agent) => {
    const programs =
      timeline.programs?.filter((p) => p.agentId === agent.id) ?? [];
    const accepted = programs.filter((p) => p.code !== null);
    const modelRounds = accepted.reduce(
      (sum, p) =>
        sum +
        (p.code === null
          ? 0
          : parseBehaviorCode(p.code, agent.id, 60 - p.tick).length),
      0,
    );
    assert(
      programs.length <= 5 && accepted.length > 0,
      'each actor must demonstrate a real accepted program within budget',
    );
    return {
      id: agent.id,
      name: agent.name,
      rounds: 60,
      calls: programs.length,
      acceptedPrograms: accepted.length,
      modelRounds,
      fallbackRounds: 60 - modelRounds,
      alive: (final.survival?.vitals[agent.id]?.health ?? 0) > 0,
      vitals: final.survival?.vitals[agent.id],
      finalPosition: agent.position,
      inventory: agent.inventory,
    };
  });
  const results = {
    status:
      calls.failed + calls.rejected === 0
        ? 'completed'
        : 'completed-with-errors',
    rounds: 60,
    totalActions: 180,
    framesChecked: 61,
    invariantFailures: 0,
    externalModelCalls: calls.attempted,
    calls,
    survivors: agents.filter((a) => a.alive).length,
    deaths: agents.filter((a) => !a.alive).length,
    learningRequests: outcomes['learning-denied'] ?? 0,
    unlockedSkills: 0,
    worldModelCalls: 0,
    collectedItems: initial.items.length - final.items.length,
    outcomes,
    agents,
    events: timeline.frames.slice(1).flatMap((f) => f.survival?.events ?? []),
    finalState: final,
  };
  const rows = agents
    .map(
      (a) =>
        `| ${a.name} | ${String(a.calls)} | ${String(a.modelRounds)} | ${String(a.fallbackRounds)} | ${String(a.vitals?.health)} | ${String(a.vitals?.satiety)} | ${String(a.vitals?.cold)} / ${String(a.vitals?.heat)} |`,
    )
    .join('\n');
  const report = `# ${id}: ChatGPT Survival Programs

## Objective

${objective}

## Method

Three founding actors execute 60 synchronous rounds under survival-v1. The environment is fixed at 22 C, initial health/satiety 100, cold/heat 0, and satiety loss 0.5 per round. Low satiety below 20 or cold/heat at least 70 causes 2 health loss per hazard per round after exposure updates. Death remains enabled; this mild protocol deliberately avoids the thresholds. Items retain their founding pickup-only semantics.

Model: ${calls.model}. Authentication uses the user's direct ChatGPT plan grant at the public Responses endpoint, with store=false and streaming completion. No API key or paid fallback is used. Subscription limits still apply; this record does not establish unlimited access or a billing balance. The exact request template, private-per-actor inputs, attempt statuses, HTTP metadata and completed ordinary outputs are retained in [model-calls.json](model-calls.json); credentials and reasoning traces are excluded.

The model writes bounded move, pickup, wait and learn statements. Move/wait durations are chosen by the model; pickup/learn each take one round. The interpreter never executes host code. Requests occur only when a program ends, with five attempted calls per actor maximum, including failures. Missing/invalid programs consume their attempt and use explicitly counted wait fallback. The first prompt asks for one diagnostic learning request. All such requests are denied because no World Agent exists; no skills are activated.

## Results

- Status: ${results.status}; 60 rounds, 180 intents, 61 independently checked snapshots, 0 invariant failures.
- Model attempts: ${String(calls.attempted)}; completed responses: ${String(calls.completed)}; accepted programs: ${String(calls.accepted)}; transport failures: ${String(calls.failed)}; rejected outputs: ${String(calls.rejected)}.
- Survivors: ${String(results.survivors)} / 3; deaths: ${String(results.deaths)}; successful pickups: ${String(results.collectedItems)}.
- Learning requests denied: ${String(results.learningRequests)}; learned skills: 0; World Agent calls: 0.

| Actor | Calls | Model rounds | Fallback rounds | Health | Satiety | Cold / heat |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Visualizations and history

Open the viewer and select ${id}, or use its ?experiment=${id} URL. Seek any round and select an actor to inspect position, inventory, vital signs, code, progress and learning denials. [Replay](replay.json) reconstructs all transitions without inference. [Measured overview](overview.svg), [initial](initial.png), [midpoint](midpoint.png), [final](final.png) and [overview capture](overview.png) retain actual browser evidence; [browser checks](browser.json) bind it to this replay.

## Interpretation and limitations

This is a bounded invocation and execution test under deliberately mild conditions, not evidence of long-term survival intelligence. Items cannot be consumed, learning cannot succeed, and the environment is uniform. Saved model outputs make reconstruction deterministic; another live inference can choose different code. The validator checks attempt budgets, private observations, response-to-program correspondence, scheduling, all vital trajectories, occupancy, inventory conservation and artifact hashes. Local records establish what this client observed; they are not cryptographic attestation from the provider. Adverse environments and irreversible death are covered separately by tests.
`;
  const colors = ['#277c91', '#ba6445', '#7357a7'];
  const plots = agents
    .map((agent, index) => {
      const y = 160 + index * 145,
        color = colors[index] ?? '#277c91';
      const points = timeline.frames
        .map(
          (f) =>
            `${String(260 + f.tick * 12)},${String(y + 85 - (f.survival?.vitals[agent.id]?.satiety ?? 0) * 0.7)}`,
        )
        .join(' ');
      return `<text x="55" y="${String(y + 20)}" font-size="22">${agent.name}</text><text x="55" y="${String(y + 48)}" font-size="15">${String(agent.calls)} calls / 5</text><text x="55" y="${String(y + 71)}" font-size="15">${String(agent.fallbackRounds)} fallback rounds</text><line x1="260" y1="${String(y + 15)}" x2="980" y2="${String(y + 15)}" stroke="#3d7654" stroke-width="3"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"/><text x="1000" y="${String(y + 20)}" font-size="15">HP 100</text><text x="1000" y="${String(y + 43)}" font-size="15">Satiety 70</text><text x="1000" y="${String(y + 66)}" font-size="15">Cold / heat 0</text>`;
    })
    .join('');
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="680" role="img" aria-label="${id} measured survival results"><rect width="1160" height="680" fill="#f7f5ef"/><g font-family="Arial,sans-serif" fill="#24333a"><text x="55" y="55" font-size="30" font-weight="bold">${id.toUpperCase()} / Survival programs</text><text x="55" y="90" font-size="18">60 rounds · ${String(calls.attempted)} model attempts · ${String(calls.accepted)} accepted programs · ${String(results.survivors)} survivors</text><text x="55" y="120" font-size="16">${String(results.learningRequests)} learning requests denied · 0 unlocked skills · 0 invariant failures</text>${plots}<text x="260" y="610" font-size="14">Round 0</text><text x="925" y="610" font-size="14">Round 60</text><text x="55" y="650" font-size="15">Green: health · Actor color: satiety · Mild 22 C environment · Code and vital history available in the viewer</text></g></svg>\n`;
  return { run: { frames: timeline.frames, replay }, results, report, chart };
}
