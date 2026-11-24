import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { EvidenceCache } from './validation-cache.js';
import { experimentId, type ReconstructionMetric } from './experiments.js';

/** Two isolated readers reconstruct selected archives, newest first.
 * A failed worker stops scheduling and drains active work; no model is invoked. */
export async function reconstructSelected(
  ids: readonly string[],
  run: (id: string) => Promise<void>,
): Promise<void> {
  const queue = [...ids];
  for (const id of queue) experimentId(id);
  if (new Set(queue).size !== queue.length)
    throw new Error('Duplicate archive in reconstruction selection.');
  queue.sort((a, b) => Number(b.slice(2)) - Number(a.slice(2)));
  let failure: Error | undefined;
  const worker = async () => {
    while (queue.length && failure === undefined) {
      const id = queue.shift();
      if (!id) return;
      try {
        await run(id);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (failure !== undefined) throw failure;
}

function workerMetric(id: string, output: string): ReconstructionMetric {
  const metric = JSON.parse(output) as ReconstructionMetric | null;
  if (
    !metric ||
    metric.id !== id ||
    !['passed', 'reused'].includes(metric.status)
  )
    throw new Error(`Invalid reconstruction worker result: ${id}`);
  return metric;
}

export function reconstructionWorker(
  root: string,
  id: string,
  cache: EvidenceCache,
): Promise<ReconstructionMetric> {
  return new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        resolve(root, 'scripts/validation-reconstruction-worker.ts'),
        id,
      ],
      { cwd: root, env: { ...process.env, WORLD_VALIDATION_RUN: cache.runId } },
    );
    let output = '',
      error = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 4096) child.kill();
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      error = (error + chunk).slice(-16000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        if (code !== 0 || output.length > 4096)
          throw new Error(
            `Reconstruction failed for ${id}: ${error || String(code)}`,
          );
        accept(workerMetric(id, output));
      } catch (failure) {
        reject(failure instanceof Error ? failure : new Error(String(failure)));
      }
    });
  });
}
