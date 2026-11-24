import { describe, expect, it } from 'vitest';
import { programDecision } from '../src/survival-run.js';

describe('survival program decisions', () => {
  it('accepts only bounded exact decision fields', () => {
    expect(() =>
      programDecision(
        '{"code":"wait(2);","summary":"Wait.","agentId":"sol"}',
        'lin',
        60,
      ),
    ).toThrow();
    expect(() =>
      programDecision('{"code":"wait(2);","summary":"Wait."}', 'lin', 1),
    ).toThrow();
    expect(
      programDecision('{"code":"wait(2);","summary":"Wait."}', 'lin', 60),
    ).toEqual({ code: 'wait(2);', summary: 'Wait.' });
  });
});
