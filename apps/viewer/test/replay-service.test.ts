import { expect, it, vi } from 'vitest';
import {
  browserDigest,
  incrementalSceneReplay,
  ReplaySuperseded,
} from '../src/continuous-history.js';
import { replayService } from '../src/replay-service.js';
import type { ReplayRequest, ReplayResponse } from '../src/replay-service.js';
import { ReplayClient } from '../src/replay-client.js';
import { recordedSegment } from './fixtures/continuous-history.js';

async function recording() {
  const { segment, frames } = await recordedSegment();
  const text = JSON.stringify(segment);
  const request: ReplayRequest = {
    id: 1,
    url: 'https://fixture.invalid/ex99/part.json',
    tick: 7,
    part: {
      path: 'part.json',
      start: 0,
      end: 7,
      sha256: await browserDigest(text),
    },
  };
  return { segment, frames, text, request };
}
it('cancels only after a verified round and resumes without repeating paid work', async () => {
  const { segment, frames } = await recording();
  const replay = incrementalSceneReplay(segment);
  let current = true;
  await expect(
    replay.frame(7, {
      current: () => current,
      advanced: (tick) => {
        if (tick === 2) current = false;
        return Promise.resolve();
      },
    }),
  ).rejects.toBeInstanceOf(ReplaySuperseded);
  expect(replay.reconstructedRounds).toBe(2);
  expect(await replay.frame(1)).toEqual(frames[1]);
  expect(await replay.frame(7)).toEqual(frames[7]);
  expect(replay.reconstructedRounds).toBe(7);
});
it('replaces a long target at a verified boundary and shares its loaded prefix', async () => {
  const { text, request, frames } = await recording();
  const load = vi.fn(() => Promise.resolve(text)),
    output: ReplayResponse[] = [];
  let replacement: Promise<void> | undefined;
  const service = replayService(
    load,
    (message) => {
      output.push(message);
      if (message.kind === 'progress' && message.id === 1 && message.tick === 2)
        replacement = service.seek({ ...request, id: 2, tick: 3 });
    },
    async () => {},
  );
  await service.seek(request);
  await replacement;
  expect(load).toHaveBeenCalledTimes(1);
  expect(
    output.filter((v) => v.kind === 'progress').map((v) => v.tick),
  ).toEqual([1, 2, 3]);
  expect(output.filter((v) => v.kind === 'frame')).toEqual([
    { id: 2, kind: 'frame', world: frames[3], tasks: {} },
  ]);
  await service.seek({ ...request, id: 3, tick: 1 });
  expect(output.at(-1)).toEqual({
    id: 3,
    kind: 'frame',
    world: frames[1],
    tasks: {},
  });
  expect(load).toHaveBeenCalledTimes(1);
});
it('shares overlapping loads and binds cached data to URL, hash and boundaries', async () => {
  const { text, request } = await recording();
  let release: (value: string) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  const output: ReplayResponse[] = [];
  const service = replayService(
    load,
    (v) => output.push(v),
    async () => {},
  );
  const first = service.seek(request),
    second = service.seek({ ...request, id: 2, tick: 1 });
  release(text);
  await Promise.all([first, second]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(output.filter((v) => v.kind === 'frame').map((v) => v.id)).toEqual([
    2,
  ]);
  load.mockResolvedValue(text);
  await service.seek({
    ...request,
    id: 3,
    part: { ...request.part, sha256: 'corrupt' },
  });
  expect(output.at(-1)).toMatchObject({
    id: 3,
    kind: 'error',
    message: 'Segment integrity check failed.',
  });
  await service.seek({ ...request, id: 4, part: { ...request.part, end: 8 } });
  expect(output.at(-1)).toMatchObject({
    id: 4,
    kind: 'error',
    message: 'Replay segment bounds differ from its index.',
  });
  expect(load).toHaveBeenCalledTimes(3);
});
it('does not turn a corrupt world or a rejected download into a cached success', async () => {
  const { segment, request } = await recording();
  const round = segment.rounds[1];
  if (!round) throw Error('Missing round');
  round.after = 'corrupt';
  const text = JSON.stringify(segment);
  request.part.sha256 = await browserDigest(text);
  const output: ReplayResponse[] = [];
  const service = replayService(
    () => Promise.resolve(text),
    (v) => output.push(v),
    async () => {},
  );
  await service.seek(request);
  await service.seek({ ...request, id: 2, tick: 0 });
  expect(output.filter((v) => v.kind === 'frame')).toEqual([]);
  expect(output.filter((v) => v.kind === 'error')).toHaveLength(2);
  const failed = replayService(
    () => Promise.reject(new Error('Network unavailable')),
    (v) => output.push(v),
    async () => {},
  );
  await failed.seek(request);
  expect(output.at(-1)).toMatchObject({
    kind: 'error',
    message: 'Network unavailable',
  });
});
it('bounds segment retention and never shares a prefix with another archive URL', async () => {
  const { text, request } = await recording();
  const load = vi.fn(() => Promise.resolve(text)),
    output: ReplayResponse[] = [];
  const service = replayService(
    load,
    (v) => output.push(v),
    async () => {},
  );
  for (let id = 1; id <= 4; id++)
    await service.seek({
      ...request,
      id,
      tick: 0,
      url: `https://fixture.invalid/ex${String(id)}/part.json`,
    });
  await service.seek({
    ...request,
    id: 5,
    tick: 0,
    url: 'https://fixture.invalid/ex1/part.json',
  });
  expect(load).toHaveBeenCalledTimes(5);
  expect(output.filter((v) => v.kind === 'frame')).toHaveLength(5);
});
it('settles superseded clients, discards obsolete messages and terminates disposed workers', async () => {
  const { request, frames } = await recording();
  const port = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  } as Pick<
    Worker,
    'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
  >;
  const client = new ReplayClient(port),
    progress = vi.fn();
  const first = client.seek(request, progress),
    second = client.seek(request, progress);
  expect(await first).toBeNull();
  const emit = (data: ReplayResponse): void => {
    port.onmessage?.call(
      port as Worker,
      { data } as MessageEvent<ReplayResponse>,
    );
  };
  emit({ id: 1, kind: 'error', message: 'obsolete' });
  emit({ id: 2, kind: 'progress', tick: 1 });
  const world = frames[1];
  if (!world) throw Error('Missing frame');
  emit({ id: 2, kind: 'frame', world, tasks: {} });
  expect(await second).toEqual({ id: 2, kind: 'frame', world, tasks: {} });
  expect(progress).toHaveBeenCalledWith(1);
  const third = client.seek(request, progress);
  client.dispose();
  expect(await third).toBeNull();
  expect(port.terminate).toHaveBeenCalledOnce();
  await expect(client.seek(request, progress)).rejects.toThrow('closed');
});
it('fails closed if worker communication fails', async () => {
  const { request } = await recording();
  const port = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  } as Pick<
    Worker,
    'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
  >;
  const client = new ReplayClient(port);
  const pending = client.seek(request, () => {});
  port.onerror?.call(port as Worker, {} as ErrorEvent);
  await expect(pending).rejects.toThrow('worker failed');
  await expect(client.seek(request, () => {})).rejects.toThrow('worker failed');
  expect(port.terminate).toHaveBeenCalledOnce();
});
