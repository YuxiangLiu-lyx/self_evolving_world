import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { V7CallRecord } from '../apps/simulator/src/continuous-run.js';
import {
  assertTransportRecoveryLimit,
  TRANSPORT_RECOVERY_LIMIT,
  TRANSPORT_RETRY_MARGIN_SECONDS,
  transportErrorCode,
  transportRecoveryTimes,
  transportRetryAfterMs,
  transportWait,
  waitForTransportResume,
} from './continuous-repair.js';
import type { RepairClock } from './continuous-repair.js';
import { continuousAtomic } from './continuous-store.js';

/** The retained ex16 round-2 overload: ordinary-19, retry-after 327 s. */
const ex16 = JSON.parse(
  readFileSync('experiment/ex16/calls/ordinary-19.json', 'utf8'),
) as V7CallRecord;

function clock(
  start: number,
): RepairClock & { slept: number[]; logs: string[] } {
  let now = start;
  const slept: number[] = [];
  const logs: string[] = [];
  return {
    now: () => now,
    sleep: (ms) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    },
    log: (message) => logs.push(message),
    slept,
    logs,
  };
}

it('reads the retry-after and the error code from the retained ex16 overload evidence', () => {
  expect(transportRetryAfterMs(ex16.failureEvidence)).toBe(327_000);
  expect(transportErrorCode(ex16.failureEvidence)).toBe('server_is_overloaded');
  expect(
    transportRetryAfterMs('event: error\ndata: {"retry-after":"12"}'),
  ).toBe(12_000);
  expect(transportRetryAfterMs('event: error\ndata: {"code":"x"}')).toBeNull();
  expect(transportRetryAfterMs(undefined)).toBeNull();
});

it('resumes no earlier than the failure plus the retry-after plus 60 seconds', () => {
  const wait = transportWait(ex16.attempt, ex16.failureEvidence);
  const failed = Math.ceil(
    Date.parse(ex16.attempt.startedAt) + (ex16.attempt.elapsedMs ?? 0),
  );
  expect(wait).toEqual({
    failedAt: new Date(failed).toISOString(),
    errorCode: 'server_is_overloaded',
    retryAfterSeconds: 327,
    marginSeconds: TRANSPORT_RETRY_MARGIN_SECONDS,
    resumeAfter: new Date(failed + 387_000).toISOString(),
  });
  // Without a retry-after the recovery may resume at once, as before.
  expect(
    transportWait(ex16.attempt, 'event: error\ndata: {"code":"x"}').resumeAfter,
  ).toBe(new Date(failed).toISOString());
});

it('waits the remaining time once and records it; a later repair does not wait again', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'transport-wait-'));
  try {
    const failed = Math.ceil(
      Date.parse(ex16.attempt.startedAt) + (ex16.attempt.elapsedMs ?? 0),
    );
    // The repair starts 33 s after the failure, as the first ex16 recovery did.
    const early = clock(failed + 33_000);
    const waited = await waitForTransportResume(
      directory,
      'ex16',
      ex16.attempt,
      ex16.failureEvidence,
      early,
    );
    expect(early.slept).toEqual([354_000]);
    expect(waited.waitedMs).toBe(354_000);
    expect(early.logs[0]).toContain('waiting 354 s for the retry-after (327 s');
    const late = clock(failed + 400_000);
    const none = await waitForTransportResume(
      directory,
      'ex16',
      ex16.attempt,
      ex16.failureEvidence,
      late,
    );
    expect(late.slept).toEqual([]);
    expect(none.waitedMs).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses a seventh dated transport recovery within 60 minutes and ignores undated ones', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'transport-limit-'));
  try {
    const now = Date.parse('2026-11-25T12:00:00.000Z');
    const write = (name: string, record: Record<string, unknown>) => {
      mkdirSync(resolve(directory, 'technical-pauses', name), {
        recursive: true,
      });
      continuousAtomic(
        resolve(directory, 'technical-pauses', name, 'recovery.json'),
        record,
      );
    };
    // Records written before this change carry no recovery time and are not counted.
    write('round-1', { transportRecovery: true });
    write('round-2', {
      rejectionRecovery: true,
      recoveredAt: new Date(now).toISOString(),
    });
    write('round-3', {
      transportRecovery: true,
      recoveredAt: new Date(
        now - TRANSPORT_RECOVERY_LIMIT.windowMs - 1,
      ).toISOString(),
    });
    for (let i = 0; i < TRANSPORT_RECOVERY_LIMIT.recoveries - 1; i++)
      write(`round-${String(10 + i)}`, {
        transportRecovery: true,
        recoveredAt: new Date(now - 60_000 * (i + 1)).toISOString(),
      });
    expect(transportRecoveryTimes(directory)).toHaveLength(
      TRANSPORT_RECOVERY_LIMIT.recoveries,
    );
    expect(() => {
      assertTransportRecoveryLimit(transportRecoveryTimes(directory), now);
    }).not.toThrow();
    write('round-20', {
      transportRecovery: true,
      recoveredAt: new Date(now - 1_000).toISOString(),
    });
    await expect(
      waitForTransportResume(
        directory,
        'ex16',
        ex16.attempt,
        ex16.failureEvidence,
        clock(now),
      ),
    ).rejects.toThrow('stop and wait for the user');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
