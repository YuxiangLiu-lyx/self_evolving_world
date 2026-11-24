/** Offline projection of culture v2 ordinary-input size from a retained long archive (ex15 by
 * default). It rebuilds every retained ordinary input with the current builder, once with the
 * archive's own configuration (checking the recorded estimate) and once switched to the v2
 * context settings, then fits linear growth and extrapolates. It never calls a model.
 * Run: `npx tsx scripts/long-context-projection.ts [experiment/ex15]`. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
} from '@self-evolving-world/world-core';
import type {
  V7Cursor,
  V7Plan,
  V7World,
} from '@self-evolving-world/world-core';
import type {
  V7CallRecord,
  V7Execution,
} from '../apps/simulator/src/continuous-run.js';
import type { LongCompaction } from '../apps/simulator/src/long-compaction.js';
import { compactLongInput } from '../apps/simulator/src/long-compaction.js';
import type {
  LongInput,
  LongRetrieval,
} from '../apps/simulator/src/long-context.js';
import {
  longOrdinaryInput,
  parseLongDecision,
} from '../apps/simulator/src/long-context.js';
import { LONG_CULTURE_V2 } from '../apps/simulator/src/long-culture.js';
import { longRequest } from '../apps/simulator/src/long-request.js';
import { longRequestMeasure } from '../apps/simulator/src/long-tokens.js';
import type { V7ReplayIndex, V7ReplaySegment } from './continuous-store.js';
import {
  continuousRead,
  reconstructContinuousSegment,
} from './continuous-store.js';

const TARGET = 250;
const WIDTH_SCALE = LONG_CULTURE_V2.exactRecordWidth / 4000;

/** Every per-round world of the archive and its replay rounds (`readContinuousExperiment`
 * without its artifact checks; each segment is still verified hash by hash). */
function replayWorlds(archive: string) {
  const index = continuousRead<V7ReplayIndex>(join(archive, 'replay.json'));
  const frames: V7World[] = [],
    rounds: V7ReplaySegment['rounds'] = [];
  for (const part of index.segments) {
    const segment = continuousRead<V7ReplaySegment>(join(archive, part.path));
    const values = reconstructContinuousSegment(segment);
    frames.push(...(frames.length ? values.slice(1) : values));
    rounds.push(...segment.rounds);
  }
  return { frames, rounds };
}
/** The archive configuration switched to the culture v2 context settings. */
function v2World(world: V7World): V7World {
  const copy = v7Clone(world),
    policy = copy.config.longDevelopment;
  if (!policy?.culture) throw new Error('Expected a culture long archive.');
  policy.compaction = {
    version: 1,
    recentAbilityRounds: LONG_CULTURE_V2.recentAbilityRounds,
  };
  policy.exactRecordWidth = LONG_CULTURE_V2.exactRecordWidth;
  policy.culture = { ...policy.culture, goal: 'open' };
  return copy;
}
/** The builder reads only these cursor fields, all retained in the input packet. */
function cursorFrom(packet: Record<string, unknown>, tick: number) {
  const execution = packet.execution as {
    cursor: {
      intention: string;
      step: number;
      repetition: number;
      cycle: number;
      steps: V7Plan['steps'];
      reason: string | null;
      operation: V7Cursor['operation'];
    } | null;
  };
  const c = execution.cursor;
  if (!c) return undefined;
  const plan: V7Plan = {
    intention: c.intention,
    steps: c.steps,
    repeat: 1,
    until: null,
    interrupts: [],
    notes: [],
    preferences: [],
  };
  return {
    plan,
    step: c.step,
    repetition: c.repetition,
    cycle: c.cycle,
    startedAt: tick,
    navigation: null,
    reason: c.reason,
    operation: c.operation ?? null,
  } satisfies V7Cursor;
}
const measure = (world: V7World, model: string, input: LongInput) =>
  longRequestMeasure(
    longRequest(model, input),
    world.config.longDevelopment?.outputTokens ?? 0,
  );
interface Point {
  actor: string;
  tick: number;
  source: string;
  recorded: number | null;
  old: number;
  v2: number;
  v2Packet: number;
  oldRetrieval: number;
  v2Retrieval: number;
}
function project(
  world: V7World,
  model: string,
  actor: string,
  cursor: V7Cursor | undefined,
  retrieval: LongRetrieval | undefined,
): Omit<Point, 'actor' | 'tick' | 'source' | 'recorded'> {
  const v2 = v2World(world);
  const old = measure(
      world,
      model,
      longOrdinaryInput(world, actor, cursor, retrieval),
    ),
    next = measure(v2, model, longOrdinaryInput(v2, actor, cursor, retrieval));
  return {
    old: old.inputEstimate,
    v2: next.inputEstimate,
    v2Packet: measure(v2, model, longOrdinaryInput(v2, actor, cursor))
      .inputEstimate,
    oldRetrieval: old.modules.retrieval ?? 0,
    v2Retrieval: next.modules.retrieval ?? 0,
  };
}
function fit(points: { x: number; y: number }[]) {
  const n = points.length,
    mx = points.reduce((s, p) => s + p.x, 0) / n,
    my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const slope = sxx
    ? points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx
    : 0;
  return { slope, at: (x: number) => my + slope * (x - mx) };
}
const roundMax = (points: Point[], key: 'v2' | 'v2Packet' | 'old') =>
  [...new Set(points.map((p) => p.tick))].map((tick) => ({
    x: tick,
    y: Math.max(...points.filter((p) => p.tick === tick).map((p) => p[key])),
  }));
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toFixed(1);

function main(archive: string) {
  const execution = continuousRead<V7Execution>(
    join(archive, 'execution.json'),
  );
  const policy = execution.world.config.longDevelopment;
  if (!policy) throw new Error('Expected a long-development archive.');
  const { frames, rounds } = replayWorlds(archive);
  const points: Point[] = [];
  const installs: string[] = [],
    mismatches: string[] = [];
  const order = new Map(execution.attempts.map((a, i) => [a.id, i]));
  const files = readdirSync(join(archive, 'calls'))
    .filter((f) => f.startsWith('ordinary-'))
    .map((f) => continuousRead<V7CallRecord>(join(archive, 'calls', f)))
    .sort(
      (a, b) => (order.get(a.attempt.id) ?? 0) - (order.get(b.attempt.id) ?? 0),
    );
  for (const call of files) {
    const input = call.input as LongInput,
      tick = input.tick,
      actor = call.attempt.actor;
    const cursor = cursorFrom(input.packet, tick);
    const retrieval: LongRetrieval = {
      tick,
      batches:
        policy.queriesPerDecision - input.longContext.remainingQueryBatches,
      results: input.retrieval,
    };
    const recorded = call.attempt.requestMeasure?.inputEstimate ?? null;
    // A call may follow installs made at its tick boundary (the next round's registrations).
    const base = frames[tick];
    if (!base)
      throw new Error(`No reconstructed world at tick ${String(tick)}.`);
    const candidates = [base];
    for (const key of rounds[tick]?.registrations ?? []) {
      const last = candidates.at(-1) ?? base;
      candidates.push(v7Install(last, continuousRegistry(last), key));
    }
    let chosen = 0,
      row = project(base, execution.model, actor, cursor, retrieval);
    for (const [i, world] of candidates.entries()) {
      const r =
        i === 0
          ? row
          : project(world, execution.model, actor, cursor, retrieval);
      if (r.old === recorded) {
        chosen = i;
        row = r;
        break;
      }
    }
    if (row.old !== recorded)
      mismatches.push(
        `${call.attempt.id} (tick ${String(tick)}): rebuilt ${String(row.old)}, recorded ${String(recorded)}`,
      );
    else if (chosen > 0)
      installs.push(
        `${call.attempt.id} (tick ${String(tick)}) after ${(rounds[tick]?.registrations ?? []).slice(0, chosen).join(', ')}`,
      );
    points.push({ actor, tick, source: call.attempt.id, recorded, ...row });
  }
  const pause = continuousRead<V7Execution>(
    join(
      archive,
      'technical-pauses',
      `round-${String(execution.world.tick)}`,
      'execution.json',
    ),
  );
  for (const a of pause.world.actors)
    points.push({
      actor: a.id,
      tick: pause.world.tick,
      source: 'pause',
      recorded: null,
      ...project(
        pause.world,
        pause.model,
        a.id,
        pause.cursors[a.id],
        pause.longRetrieval?.[a.id],
      ),
    });

  const calls = points.filter((p) => p.source !== 'pause');
  const matched = calls.filter((p) => p.old === p.recorded).length;
  const out: string[] = [];
  out.push(
    `### Culture v2 context projection from ${archive}`,
    '',
    `Rebuilt ${String(calls.length)} retained ordinary calls (ticks 0-${String(execution.world.tick)}) and ${String(pause.world.actors.length)} round-${String(pause.world.tick)} paused inputs with the current builder. Estimates are o200k tokens of the whole wire request.`,
    '',
    `- Archive configuration reproduces the recorded estimate for ${String(matched)}/${String(calls.length)} calls (${n1((100 * matched) / calls.length)}%).` +
      (installs.length
        ? ` ${String(installs.length)} match only after the installs made at their tick boundary: ${installs.join('; ')}.`
        : ' Every call matches the reconstructed world of its own tick; none needed the installs made at a tick boundary.') +
      (mismatches.length ? ` Mismatches: ${mismatches.join('; ')}.` : ''),
    `- v2 settings: compaction (recent window ${String(LONG_CULTURE_V2.recentAbilityRounds)} rounds), exactRecordWidth ${String(LONG_CULTURE_V2.exactRecordWidth)}, open goal; the archived queries and retrieval are replayed unchanged.`,
    '',
    '| Person | Inputs | ex15 max | v2 max | Mean reduction | v2 slope/round | v2 at round 250 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const actor of pause.world.actors.map((a) => a.id)) {
    const mine = points.filter((p) => p.actor === actor);
    const line = fit(mine.map((p) => ({ x: p.tick, y: p.v2 })));
    const reduction =
      mine.reduce((s, p) => s + (p.old - p.v2) / p.old, 0) / mine.length;
    out.push(
      `| ${actor} | ${String(mine.length)} | ${n0(Math.max(...mine.map((p) => p.old)))} | ${n0(Math.max(...mine.map((p) => p.v2)))} | ${n1(100 * reduction)}% | ${n1(line.slope)} | ${n0(line.at(TARGET))} |`,
    );
  }
  const reduction =
    points.reduce((s, p) => s + (p.old - p.v2) / p.old, 0) / points.length;
  const maxV2 = fit(roundMax(points, 'v2')),
    maxOld = fit(roundMax(points, 'old')),
    maxPacket = fit(roundMax(points, 'v2Packet'));
  const oldRetrieval = Math.max(...points.map((p) => p.oldRetrieval)),
    v2Retrieval = Math.max(...points.map((p) => p.v2Retrieval)),
    retrievalMax = Math.max(oldRetrieval, v2Retrieval);
  const conservative = maxPacket.at(TARGET) + retrievalMax * WIDTH_SCALE;
  out.push(
    `| all | ${String(points.length)} | ${n0(Math.max(...points.map((p) => p.old)))} | ${n0(Math.max(...points.map((p) => p.v2)))} | ${n1(100 * reduction)}% | | |`,
    '',
    `- Per-round maximum: ex15 builder ${n1(maxOld.slope)}/round (round 250: ${n0(maxOld.at(TARGET))}); v2 ${n1(maxV2.slope)}/round, round 250: **${n0(maxV2.at(TARGET))}** vs the ${n0(LONG_CULTURE_V2.inputEstimateLimit)} limit.`,
    `- Retrieval component: observed maximum ${n0(oldRetrieval)} (ex15 width 4000) and ${n0(v2Retrieval)} (rebuilt at width ${String(LONG_CULTURE_V2.exactRecordWidth)}).`,
    `- Conservative case: packet-only per-round maximum ${n1(maxPacket.slope)}/round reaches ${n0(maxPacket.at(TARGET))} at round 250; plus the largest retrieval ${n0(retrievalMax)} x ${String(WIDTH_SCALE)} = **${n0(conservative)}** vs ${n0(LONG_CULTURE_V2.inputEstimateLimit)} (${conservative <= LONG_CULTURE_V2.inputEstimateLimit ? 'within' : 'above'} the limit).`,
    '',
    ...attribution(pause),
    '',
    ...windowStatistics(archive, rounds),
  );
  console.log(out.join('\n'));
}

/** Per-person savings at the paused state: each transform applied cumulatively to the
 * uncompacted v2 input, then the recent-use window (the builder difference that remains). */
function attribution(pause: V7Execution): string[] {
  const steps: [LongCompaction, string][] = [
    ['paging', 'Paging notes'],
    ['inRetrieval', 'In retrieval'],
    ['joined', 'Joined parts'],
    ['settled', 'Settled work'],
    ['terrain', 'Terrain rows'],
  ];
  const rows = [
    `Round-${String(pause.world.tick)} paused state (savings in tokens, applied in order):`,
    '',
    `| Person | ex15 | v2 uncompacted | ${steps.map(([, l]) => l).join(' | ')} | Ability window | v2 |`,
    `| --- | ---: | ---: | ${steps.map(() => '---:').join(' | ')} | ---: | ---: |`,
  ];
  const v2 = v2World(pause.world),
    plain = v7Clone(v2);
  delete plain.config.longDevelopment?.compaction;
  for (const actor of pause.world.actors.map((a) => a.id)) {
    const args = [pause.cursors[actor], pause.longRetrieval?.[actor]] as const;
    const size = (world: V7World, input: LongInput) =>
      measure(world, pause.model, input).inputEstimate;
    const old = size(
      pause.world,
      longOrdinaryInput(pause.world, actor, ...args),
    );
    let previous = size(plain, longOrdinaryInput(plain, actor, ...args));
    const uncompacted = previous,
      savings: number[] = [];
    for (let i = 1; i <= steps.length; i++) {
      const input = longOrdinaryInput(plain, actor, ...args);
      compactLongInput(
        input,
        LONG_CULTURE_V2.recentAbilityRounds,
        new Set(steps.slice(0, i).map(([k]) => k)),
      );
      const now = size(plain, input);
      savings.push(previous - now);
      previous = now;
    }
    const final = size(v2, longOrdinaryInput(v2, actor, ...args));
    rows.push(
      `| ${actor} | ${n0(old)} | ${n0(uncompacted)} | ${savings.map(n0).join(' | ')} | ${n0(previous - final)} | **${n0(final)}** |`,
    );
  }
  return rows;
}

/** How recently the interface of each plan step had been used, from replay actions. */
function windowStatistics(
  archive: string,
  rounds: V7ReplaySegment['rounds'],
): string[] {
  const plans: { actor: string; tick: number; steps: string[] }[] = [];
  for (const f of readdirSync(join(archive, 'calls')).filter((f) =>
    f.startsWith('ordinary-'),
  )) {
    const call = continuousRead<V7CallRecord>(join(archive, 'calls', f));
    if (call.attempt.status !== 'accepted' || !call.response) continue;
    const { decision } = parseLongDecision(call.response.text);
    if (!decision) continue;
    const plan = JSON.parse(decision) as {
      steps: { action: { interface: string } }[];
    };
    plans.push({
      actor: call.attempt.actor,
      tick: call.attempt.tick,
      steps: plan.steps.map((s) => s.action.interface),
    });
  }
  const gaps = (before: (round: number, tick: number) => boolean) => {
    const found: number[] = [];
    let steps = 0;
    for (const plan of plans)
      for (const step of plan.steps) {
        steps += 1;
        const last = rounds
          .filter(
            (r) =>
              before(r.tick, plan.tick) &&
              r.actions[plan.actor]?.interface === step,
          )
          .at(-1);
        if (last) found.push(plan.tick - last.tick);
      }
    return { found, steps };
  };
  const share = (found: number[], n: number) =>
    `${n1((100 * found.filter((g) => g <= n).length) / found.length)}%`;
  const strict = gaps((round, tick) => round < tick),
    window = gaps((round, tick) => round <= tick);
  const last = rounds.at(-1)?.tick ?? 0;
  return [
    `Recent-use window (${String(plans.length)} accepted plans; replay actions of the ${String(rounds.length)} rounds from tick 0 to ${String(last)}):`,
    '',
    `- ${String(strict.found.length)} of ${String(strict.steps)} plan steps use an interface the person had used in an earlier round; the last use was within 20 rounds for ${share(strict.found, 20)}, within 25 for ${share(strict.found, 25)} and within 40 for ${share(strict.found, 40)}.`,
    `- Counting the round that ended at the decision tick (as the window does): ${String(window.found.length)} steps; within 20: ${share(window.found, 20)}, 25: ${share(window.found, 25)}, 40: ${share(window.found, 40)}. experience.recent keeps 40 rounds.`,
  ];
}

if (process.argv[1]?.endsWith('long-context-projection.ts'))
  main(process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'experiment/ex15');
