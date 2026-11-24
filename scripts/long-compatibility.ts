import { createHash } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContinuousModelInput } from '../apps/simulator/src/continuous-provider.js';
import { continuousRequest } from '../apps/simulator/src/continuous-provider.js';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { longOrdinaryInput } from '../apps/simulator/src/long-context.js';
import { continuousRead } from './continuous-store.js';

/** Fingerprint of what the current code would send for a retained long-development archive. */
export interface CompatibilityDigest {
  archive: string;
  requests: Record<string, string>;
  pauseInputs: Record<string, string>;
}

const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Rebuild every retained call's request and every paused actor's ordinary input with the current code. */
export function compatibilityDigest(archive: string): CompatibilityDigest {
  const execution = continuousRead<V7Execution>(
    join(archive, 'execution.json'),
  );
  const requests: Record<string, string> = {};
  const calls = join(archive, 'calls');
  for (const file of readdirSync(calls).sort()) {
    const call = continuousRead<{
      attempt: { id: string; role: 'ordinary' | 'world' };
      input: ContinuousModelInput;
    }>(join(calls, file));
    requests[call.attempt.id] = sha(
      continuousRequest(execution.model, call.attempt.role, call.input),
    );
  }
  const pauseInputs: Record<string, string> = {};
  const pauses = join(archive, 'technical-pauses');
  for (const round of existsSync(pauses) ? readdirSync(pauses).sort() : []) {
    const paused = continuousRead<V7Execution>(
      join(pauses, round, 'execution.json'),
    );
    if (!paused.world.config.longDevelopment) continue;
    for (const actor of paused.world.actors)
      pauseInputs[`${round}/${actor.id}`] = sha(
        longOrdinaryInput(
          paused.world,
          actor.id,
          paused.cursors[actor.id],
          paused.longRetrieval?.[actor.id],
        ),
      );
  }
  return { archive, requests, pauseInputs };
}

/** Names of entries that are missing or differ between two digests. */
export function compatibilityDifferences(
  before: CompatibilityDigest,
  after: CompatibilityDigest,
): string[] {
  const differ = (a: Record<string, string>, b: Record<string, string>) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (key) => a[key] !== b[key],
    );
  return [
    ...differ(before.requests, after.requests).map((id) => `request ${id}`),
    ...differ(before.pauseInputs, after.pauseInputs).map(
      (id) => `pause input ${id}`,
    ),
  ];
}

function main(args: string[]) {
  const [archive = 'experiment/ex13', flag, path] = args.filter(
    (arg) => arg !== '--',
  );
  const digest = compatibilityDigest(archive);
  const summary = `${String(Object.keys(digest.requests).length)} requests, ${String(Object.keys(digest.pauseInputs).length)} paused ordinary inputs`;
  if (flag === '--write' && path) {
    writeFileSync(path, `${JSON.stringify(digest, null, 2)}\n`);
    console.log(`Wrote ${summary} for ${archive} to ${path}.`);
    return;
  }
  if (flag === '--compare' && path) {
    const differences = compatibilityDifferences(
      continuousRead<CompatibilityDigest>(path),
      digest,
    );
    if (differences.length) {
      console.error(differences.join('\n'));
      throw new Error(
        `${String(differences.length)} entries changed for ${archive}.`,
      );
    }
    console.log(`Identical: ${summary} for ${archive}.`);
    return;
  }
  throw new Error(
    'Usage: pnpm compat:long -- [archive] --write digest.json | --compare digest.json',
  );
}

if (process.argv[1]?.endsWith('long-compatibility.ts'))
  main(process.argv.slice(2));
