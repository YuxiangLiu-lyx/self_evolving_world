import { expect, it } from 'vitest';
import { reconstructSelected } from './validation-reconstruction.js';

it('schedules each selected archive once with at most two active readers', async () => {
  let active = 0,
    maximum = 0;
  const starts: string[] = [],
    releases: (() => void)[] = [];
  const running = reconstructSelected(['ex1', 'ex9', 'ex8'], async (id) => {
    starts.push(id);
    maximum = Math.max(maximum, ++active);
    await new Promise<void>((done) => releases.push(done));
    active--;
  });
  expect(starts).toEqual(['ex9', 'ex8']);
  releases.shift()?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(starts).toEqual(['ex9', 'ex8', 'ex1']);
  for (const done of releases) done();
  await running;
  expect(maximum).toBe(2);
  expect(active).toBe(0);
});

it('rejects duplicate selection before starting any worker', async () => {
  const starts: string[] = [];
  await expect(
    reconstructSelected(['ex1', 'ex1'], (id) => {
      starts.push(id);
      return Promise.resolve();
    }),
  ).rejects.toThrow('Duplicate');
  expect(starts).toEqual([]);
});

it('drains active work and fails after a selected failure', async () => {
  const starts: string[] = [];
  let release = () => {},
    settled = false;
  const running = reconstructSelected(['ex1', 'ex2', 'ex3'], async (id) => {
    starts.push(id);
    if (id === 'ex3') throw new Error('Archive corruption');
    await new Promise<void>((done) => {
      release = done;
    });
  });
  const result = running.catch((error: unknown) => {
    settled = true;
    return error as Error;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  expect((await result)?.message).toBe('Archive corruption');
  expect(starts).toEqual(['ex3', 'ex2']);
});
