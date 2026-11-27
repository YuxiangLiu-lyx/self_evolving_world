import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LONG_ALLOCATION_FIELDS,
  longAllocation,
} from '../apps/simulator/src/long-scenario.js';
import type { LongAllocation } from '../apps/simulator/src/long-scenario.js';

/** Command-line flag of each allocation field of `new <long-culture tag>`. */
export const LONG_ALLOCATION_FLAGS: Record<
  (typeof LONG_ALLOCATION_FIELDS)[number],
  string
> = { seed: '--seed', development: '--development', tokens: '--tokens' };

/** Parse `[--seed N] [--development N] [--tokens N]`, each at most once and each a positive
 * integer written in decimal digits. No flag gives the empty allocation. */
export function parseLongAllocation(args: readonly string[]): LongAllocation {
  const chosen: Record<string, number> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i],
      value = args[i + 1];
    const field = LONG_ALLOCATION_FIELDS.find(
      (f) => LONG_ALLOCATION_FLAGS[f] === flag,
    );
    if (!field) throw new Error(`Unknown allocation option: ${String(flag)}.`);
    if (field in chosen)
      throw new Error(`Repeated allocation option: ${String(flag)}.`);
    if (value === undefined || !/^[1-9]\d*$/.test(value))
      throw new Error(`${String(flag)} needs a positive integer.`);
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error(`${String(flag)} is too large.`);
    chosen[field] = number;
  }
  return longAllocation(chosen);
}

/** The allocation as one sentence, appended to the manifest objective. */
export function longAllocationNote(allocation: LongAllocation): string {
  const parts = [
    ...(allocation.seed === undefined
      ? []
      : [`seed ${String(allocation.seed)}`]),
    ...(allocation.development === undefined
      ? []
      : [`development handoff budget ${String(allocation.development)}`]),
    ...(allocation.tokens === undefined
      ? []
      : [`token budget ${String(allocation.tokens)}`]),
  ];
  return parts.length ? `Allocation set at genesis: ${parts.join(', ')}.` : '';
}

/** The allocation recorded in an archive's manifest; absent means none. */
export function manifestLongAllocation(
  manifest: Record<string, unknown>,
): LongAllocation {
  return manifest.allocation === undefined
    ? {}
    : longAllocation(manifest.allocation);
}

/** The allocation of a retained run, read from its manifest when one exists. */
export function readLongAllocation(root: string, id: string): LongAllocation {
  const path = resolve(root, 'experiment', id, 'manifest.json');
  return existsSync(path)
    ? manifestLongAllocation(
        JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>,
      )
    : {};
}
