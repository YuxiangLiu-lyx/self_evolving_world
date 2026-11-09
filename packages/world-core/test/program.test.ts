import { describe, expect, it } from 'vitest';
import {
  acceptProgram,
  advanceProgramRound,
  createProgramRun,
  createSurvivalWorld,
  parseBehaviorCode,
  pendingPrograms,
  replayPrograms,
} from '../src/index.js';
import type { ProgramRecord } from '../src/index.js';

const initial = () =>
  createSurvivalWorld({
    agents: [{ id: 'a', name: 'A', position: { x: 2, y: 2 } }],
  });
const plan = (
  tick = 0,
  call = 1,
  code: string | null = 'wait(12);',
): ProgramRecord => ({
  agentId: 'a',
  tick,
  call,
  code,
  summary: 'Wait in the mild environment.',
});
describe('bounded behavior programs', () => {
  it('expands duration commands and binds every action to the selected actor', () => {
    const actions = parseBehaviorCode(
      'move("east", 2); pickup("wood"); learn("shelter"); wait(3);',
      'a',
    );
    expect(actions.map((a) => a.type)).toEqual([
      'move',
      'move',
      'pickup',
      'learn',
      'wait',
      'wait',
      'wait',
    ]);
    expect(actions.every((a) => a.agentId === 'a')).toBe(true);
    expect(Object.isFrozen(actions)).toBe(true);
  });
  it.each([
    'process.exit();',
    'while(true){}',
    'wait(0);',
    'wait(-1);',
    'wait(61);',
    'wait(1.5);',
    'move("up",2);',
    'pickup("wood",2);',
    'wait(1); fetch("url");',
    'wait(1)',
    'wait(1);/* x */',
    'wait(1);'.repeat(600),
  ])('rejects unsupported or unbounded code: %s', (code) => {
    expect(() => parseBehaviorCode(code, 'a')).toThrow();
  });
  it('replans only when a program ends and stops at sixty rounds', () => {
    const world = initial();
    let run = acceptProgram(createProgramRun(world), plan());
    expect(pendingPrograms(run)).toEqual([]);
    expect(() => acceptProgram(run, plan(0, 2))).toThrow();
    for (let i = 0; i < 12; i++) run = advanceProgramRound(run);
    expect(pendingPrograms(run)).toEqual(['a']);
    expect(() => advanceProgramRound(run)).toThrow();
    const replay = replayPrograms(
      world,
      Array.from({ length: 5 }, (_, i) => plan(i * 12, i + 1)),
    );
    expect(replay.frames).toHaveLength(61);
    expect(replay.cursors.a?.calls).toBe(5);
    expect(() => advanceProgramRound(replay)).toThrow();
    expect(world.tick).toBe(0);
  });
  it('counts failed attempts, waits for that round and stops requesting at five', () => {
    const records = Array.from({ length: 5 }, (_, i) => plan(i, i + 1, null));
    const run = replayPrograms(initial(), records);
    expect(run.cursors.a?.calls).toBe(5);
    expect(run.frames[60]?.survival?.events[0]?.outcome).toBe('waited');
    expect(run.frames[60]?.agents[0]?.position).toEqual({ x: 2, y: 2 });
    expect(() => replayPrograms(initial(), [...records, plan(5, 6)])).toThrow();
  });
  it('rejects missing, duplicate, foreign, overhorizon and out-of-order records', () => {
    expect(() => replayPrograms(initial(), [])).toThrow();
    expect(() => replayPrograms(initial(), [plan(), plan(0, 2)])).toThrow();
    expect(() =>
      replayPrograms(initial(), [{ ...plan(), agentId: 'b' }]),
    ).toThrow();
    expect(() => replayPrograms(initial(), [plan(1)])).toThrow();
    expect(() =>
      replayPrograms(initial(), [
        plan(0, 1, 'wait(59);'),
        plan(59, 2, 'wait(2);'),
      ]),
    ).toThrow();
  });
});
