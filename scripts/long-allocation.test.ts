import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { newContinuousExecution } from '../apps/simulator/src/continuous-run.js';
import {
  longOrdinaryInput,
  longWorldInput,
} from '../apps/simulator/src/long-context.js';
import {
  initialLongWorld,
  LONG_SCENARIOS,
  LONG_SEED,
  longCultureScenario,
} from '../apps/simulator/src/long-scenario.js';
import {
  longAllocationNote,
  manifestLongAllocation,
  parseLongAllocation,
} from './long-allocation.js';
import {
  continuousAtomic,
  readContinuousExecution,
} from './continuous-store.js';

const ALLOCATION = { seed: 20261124, development: 12, tokens: 5_000_000 };
const PAIR = ['long-culture-v2', 'long-culture-v2-oldgoal'] as const;
const policy = (world: V7World) => {
  const p = world.config.longDevelopment;
  if (!p) throw new Error('Missing long policy');
  return p;
};
/** The world with the three allocation fields set back to those of `base`. */
function reset(world: V7World, base: V7World): string {
  const copy = v7Clone(world);
  copy.config.seed = base.config.seed;
  copy.config.budgets.development = base.config.budgets.development;
  policy(copy).tokens = policy(base).tokens;
  return JSON.stringify(copy);
}

describe('allocation options of new', () => {
  it('parses --seed, --development and --tokens in any order, each once, as positive integers', () => {
    expect(parseLongAllocation([])).toEqual({});
    expect(parseLongAllocation(['--seed', '7'])).toEqual({ seed: 7 });
    expect(parseLongAllocation(['--development', '12'])).toEqual({
      development: 12,
    });
    expect(
      parseLongAllocation([
        '--tokens',
        '5000000',
        '--seed',
        '20261124',
        '--development',
        '12',
      ]),
    ).toEqual(ALLOCATION);
    for (const [args, message] of [
      [['--seed'], '--seed needs a positive integer'],
      [['--seed', '0'], '--seed needs a positive integer'],
      [['--seed', '-3'], '--seed needs a positive integer'],
      [['--tokens', '1.5'], '--tokens needs a positive integer'],
      [['--tokens', '5e6'], '--tokens needs a positive integer'],
      [['--development', '012'], '--development needs a positive integer'],
      [['--development', ' 12'], '--development needs a positive integer'],
      [['--seed', '9007199254740993'], '--seed is too large'],
      [['--seed', '1', '--seed', '2'], 'Repeated allocation option: --seed'],
      [['--budget', '1'], 'Unknown allocation option: --budget'],
      [['12'], 'Unknown allocation option: 12'],
    ] as const)
      expect(() => parseLongAllocation(args)).toThrow(message);
  });

  it('reads and validates the allocation recorded in a manifest', () => {
    expect(manifestLongAllocation({ id: 'ex1' })).toEqual({});
    expect(manifestLongAllocation({ allocation: ALLOCATION })).toEqual(
      ALLOCATION,
    );
    for (const bad of [
      null,
      [],
      'seed',
      { seed: 0 },
      { seed: 1.5 },
      { seed: '7' },
      { rounds: 80 },
    ])
      expect(() => manifestLongAllocation({ allocation: bad })).toThrow(
        'long allocation',
      );
    expect(longAllocationNote({})).toBe('');
    expect(longAllocationNote(ALLOCATION)).toBe(
      'Allocation set at genesis: seed 20261124, development handoff budget 12, token budget 5000000.',
    );
    expect(longAllocationNote({ tokens: 3 })).toBe(
      'Allocation set at genesis: token budget 3.',
    );
  });
});

describe('genesis with an allocation', () => {
  it('is byte-identical to the historical genesis without flags, for every tag', () => {
    for (const tag of LONG_SCENARIOS)
      expect(JSON.stringify(initialLongWorld('long-ex19', tag, {}))).toBe(
        JSON.stringify(initialLongWorld('long-ex19', tag)),
      );
    expect(initialLongWorld('long-ex19', 'long-culture-v2').config.seed).toBe(
      LONG_SEED,
    );
    expect(LONG_SEED).toBe(20261123);
  });

  it('accepts an allocation only for the long culture tags', () => {
    expect(LONG_SCENARIOS.filter(longCultureScenario)).toEqual([
      'long-culture',
      'long-culture-incentives',
      'long-culture-v2',
      'long-culture-v2-incentives',
      'long-culture-v2-oldgoal',
      'long-culture-v3',
      'long-culture-v3-incentives',
      'long-culture-v2-villages',
    ]);
    for (const tag of LONG_SCENARIOS)
      if (longCultureScenario(tag))
        expect(
          initialLongWorld('long-ex19', tag, { seed: 7 }).config.seed,
        ).toBe(7);
      else
        expect(() => initialLongWorld('long-ex19', tag, { seed: 7 })).toThrow(
          'only to the long culture tags',
        );
    expect(() =>
      initialLongWorld('long-ex19', 'long-culture-v2', { tokens: 0 }),
    ).toThrow('Invalid long allocation tokens');
  });

  it('changes only the seed, the development budget and the token budget', () => {
    for (const tag of LONG_SCENARIOS.filter(longCultureScenario)) {
      const plain = initialLongWorld('long-ex19', tag),
        flagged = initialLongWorld('long-ex19', tag, ALLOCATION);
      expect(flagged.config.seed).toBe(ALLOCATION.seed);
      expect(flagged.config.budgets.development).toBe(ALLOCATION.development);
      expect(policy(flagged).tokens).toBe(ALLOCATION.tokens);
      expect(JSON.stringify(flagged)).not.toBe(JSON.stringify(plain));
      expect(reset(flagged, plain)).toBe(JSON.stringify(plain));
      // Each flag alone changes only its own field.
      for (const [field, value] of Object.entries(ALLOCATION)) {
        const one = initialLongWorld('long-ex19', tag, {
          [field]: value,
        });
        expect(reset(one, plain)).toBe(JSON.stringify(plain));
      }
    }
  });

  it('gives both tags of a pair the same seed and budgets', () => {
    const [v2, old] = PAIR.map((tag) =>
      initialLongWorld('long-ex19', tag, ALLOCATION),
    );
    if (!v2 || !old) throw new Error('Missing pair');
    expect(old.config.seed).toBe(v2.config.seed);
    expect(old.config.budgets).toEqual(v2.config.budgets);
    expect(policy(old).tokens).toBe(policy(v2).tokens);
    expect(policy(old).tokenCeilings).toEqual(policy(v2).tokenCeilings);
    const strip = (w: V7World) => {
      const c = v7Clone(w);
      delete policy(c).scenario;
      delete policy(c).culture?.goal;
      return JSON.stringify(c);
    };
    expect(strip(old)).toBe(strip(v2));
  });

  it('a different seed changes the climate at round 0, not the map or the people', () => {
    for (const tag of PAIR) {
      const plain = initialLongWorld('long-ex19', tag),
        seeded = initialLongWorld('long-ex19', tag, { seed: ALLOCATION.seed });
      expect(seeded.terrain).toEqual(plain.terrain);
      expect(seeded.objects).toEqual(plain.objects);
      expect(seeded.actors).toEqual(plain.actors);
      for (const actor of plain.actors) {
        const a = longOrdinaryInput(plain, actor.id),
          b = longOrdinaryInput(seeded, actor.id);
        expect(b.packet.environment).not.toEqual(a.packet.environment);
        delete a.packet.environment;
        delete b.packet.environment;
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }
      const requests = {
        lin: { interface: 'wait', args: {} },
      };
      expect(JSON.stringify(longWorldInput(seeded, requests))).toBe(
        JSON.stringify(longWorldInput(plain, requests)),
      );
    }
  });
});

describe('checkpoint verification with an allocation', () => {
  it('rebuilds the genesis of a culture run with the allocation recorded in its manifest', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'long-allocation-'));
    try {
      const state = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialLongWorld('long-ex1', 'long-culture-v2-oldgoal', ALLOCATION),
      );
      const path = resolve(root, 'experiment/ex1/execution.json'),
        manifest = resolve(root, 'experiment/ex1/manifest.json');
      continuousAtomic(path, state);
      // Without the recorded allocation the configuration does not match its tag.
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
      continuousAtomic(manifest, { id: 'ex1', allocation: ALLOCATION });
      expect(readContinuousExecution(root, 'ex1')).toEqual(state);
      // A recorded allocation that differs from the configuration is rejected.
      continuousAtomic(manifest, {
        id: 'ex1',
        allocation: { ...ALLOCATION, seed: 3 },
      });
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
      // A later change to an allocated field is still rejected.
      continuousAtomic(manifest, { id: 'ex1', allocation: ALLOCATION });
      const altered = v7Clone(state);
      altered.world.config.budgets.development += 1;
      continuousAtomic(path, altered);
      expect(() => readContinuousExecution(root, 'ex1')).toThrow(
        'protected run configuration',
      );
      // A run without flags keeps verifying against the frozen tag genesis.
      const plain = newContinuousExecution(
        'fixture',
        'isolated-fixture',
        initialLongWorld('long-ex1', 'long-culture-v2'),
      );
      continuousAtomic(path, plain);
      continuousAtomic(manifest, { id: 'ex1' });
      expect(readContinuousExecution(root, 'ex1')).toEqual(plain);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
