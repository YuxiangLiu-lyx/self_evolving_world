import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RANDOM_POLICY,
  runRandomWorld,
} from '../apps/simulator/src/random-run.js';
import {
  analyzeRun,
  experimentChart,
  experimentReport,
} from './experiment-analysis.js';
import {
  allocateExperiment,
  measureSynchronous,
  BROWSER_ASSERTIONS,
  checkExperiments,
  digest,
  EXPERIMENT_FILES,
  EXPERIMENT_OBJECTIVE,
  EXPERIMENT_SCENES,
  experimentIds,
  validateExperiment,
  readExperiment,
  reconstructionMetrics,
  writeExperimentJson,
} from './experiments.js';
import { requiredScenes } from './validation.js';
import { experimentAssets } from './experiment-assets.js';

describe('numbered experiment artifacts', () => {
  let root: string;
  let directory: string;
  let manifest: Record<string, unknown>;
  const write = (file: string, value: unknown): void => {
    writeExperimentJson(resolve(directory, file), value);
  };
  const seal = (): void => {
    write('manifest.json', {
      ...manifest,
      artifacts: Object.fromEntries(
        EXPERIMENT_FILES.map((file) => [
          file,
          digest(resolve(directory, file)),
        ]),
      ),
    });
  };
  beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), 'world-experiment-'));
    expect(allocateExperiment(root)).toBe('ex1');
    directory = resolve(root, 'experiment/ex1');
    const run = runRandomWorld(1, 12);
    const results = analyzeRun(run);
    manifest = {
      format: 'self-evolving-world/experiment',
      version: 1,
      id: 'ex1',
      objective: EXPERIMENT_OBJECTIVE,
      seed: 1,
      steps: 12,
      policy: RANDOM_POLICY,
      controller: 'seeded-random',
      externalModelCalls: 0,
      status: 'completed',
      createdAt: '2026-11-07T12:00:00Z',
      provenance: {
        revision: 'a'.repeat(40),
        dirty: true,
        node: 'v24.22.2',
        platform: 'fixture',
      },
    };
    write('replay.json', run.replay);
    write('results.json', results);
    writeFileSync(
      resolve(directory, 'report.md'),
      experimentReport('ex1', EXPERIMENT_OBJECTIVE, 1, results),
    );
    writeFileSync(
      resolve(directory, 'overview.svg'),
      experimentChart('ex1', run, results),
    );
    // Header-only fixtures exercise structural validation. Real PNG decoding is tested in Chromium.
    const png = Buffer.alloc(1200);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.writeUInt32BE(1440, 16);
    png.writeUInt32BE(1100, 20);
    for (const scene of EXPERIMENT_SCENES)
      writeFileSync(resolve(directory, `${scene}.png`), png);
    write('browser.json', {
      id: 'ex1',
      status: 'passed',
      replayHash: digest(resolve(directory, 'replay.json')),
      frameTicks: [0, 6, 12],
      assertions: BROWSER_ASSERTIONS,
      errors: [],
    });
    seal();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads metadata without replay and rebuilds identical dependency inputs only once', () => {
    const before = reconstructionMetrics().length;
    expect(readExperiment(root, 'ex1').manifest.id).toBe('ex1');
    expect(reconstructionMetrics().length).toBe(before);
    validateExperiment(root, 'ex1');
    validateExperiment(root, 'ex1');
    writeFileSync(resolve(root, 'README.md'), 'Only documentation changed.');
    validateExperiment(root, 'ex1');
    expect(
      reconstructionMetrics()
        .slice(before)
        .map((m) => m.deepRebuilds),
    ).toEqual([1, 0, 0]);
    for (const path of [
      'packages/world-core/src/world.ts',
      'scripts/experiment-analysis.ts',
      'apps/viewer/src/timeline.ts',
    ]) {
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(resolve(root, path), 'Changed relevant dependency fixture');
      validateExperiment(root, 'ex1');
      expect(reconstructionMetrics().at(-1)?.deepRebuilds).toBe(1);
    }
    write('results.json', { changed: true });
    expect(() => validateExperiment(root, 'ex1')).toThrow();
  });
  it('reuses capture reconstruction without promoting it to final archive acceptance', () => {
    const before = reconstructionMetrics().length;
    validateExperiment(root, 'ex1', true);
    validateExperiment(root, 'ex1', true);
    validateExperiment(root, 'ex1');
    expect(
      reconstructionMetrics()
        .slice(before)
        .map((m) => m.deepRebuilds),
    ).toEqual([1, 0, 1]);
    write('browser.json', { status: 'failed' });
    validateExperiment(root, 'ex1', true);
    expect(() => validateExperiment(root, 'ex1')).toThrow();
    write('results.json', { invalid: true });
    expect(() => validateExperiment(root, 'ex1', true)).toThrow();
  });
  it('validates reconstructed data and binds numbered visuals to their recorded hashes', () => {
    expect(checkExperiments(root)).toEqual(['ex1']);
    expect(requiredScenes(root)).toContain('ex1-final');
    writeFileSync(resolve(directory, 'final.png'), 'altered');
    expect(() => validateExperiment(root, 'ex1')).toThrow('hash mismatch');
  });
  it('reconstructs version-2 rounds and rejects schedule or batch corruption even with resealed hashes', () => {
    const measured = measureSynchronous(
      'ex1',
      EXPERIMENT_OBJECTIVE,
      20261107,
      160,
    );
    manifest = {
      ...manifest,
      version: 2,
      policy: 'xorshift32-collection-v2',
      schedule: 'simultaneous-v1',
      seed: 20261107,
      steps: 160,
    };
    write('replay.json', measured.run.replay);
    write('results.json', measured.results);
    writeFileSync(resolve(directory, 'report.md'), measured.report);
    writeFileSync(resolve(directory, 'overview.svg'), measured.chart);
    write('browser.json', {
      id: 'ex1',
      status: 'passed',
      replayHash: digest(resolve(directory, 'replay.json')),
      frameTicks: [0, 80, 160],
      assertions: BROWSER_ASSERTIONS,
      errors: [],
    });
    seal();
    expect(validateExperiment(root, 'ex1').results).toMatchObject({
      rounds: 160,
      totalActions: 480,
      collectedItems: 6,
    });
    expect(
      JSON.parse(experimentAssets(root).get('experiments/index.json') ?? ''),
    ).toMatchObject({
      experiments: [{ schedule: 'simultaneous-v1', totalActions: 480 }],
    });
    write('replay.json', {
      ...measured.run.replay,
      rounds: measured.run.replay.rounds.slice(1),
    });
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow(
      'seeded reconstruction',
    );
    manifest.schedule = 'sequential';
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow('identity or policy');
  });
  it('publishes only validated replay and chart data with a numbered catalogue', () => {
    const assets = experimentAssets(root);
    expect([...assets.keys()].sort()).toEqual([
      'experiments/ex1/overview.svg',
      'experiments/ex1/replay.json',
      'experiments/index.json',
    ]);
    expect(assets.get('experiments/ex1/replay.json')).toBe(
      readFileSync(resolve(directory, 'replay.json'), 'utf8'),
    );
    expect(
      JSON.parse(assets.get('experiments/index.json') ?? ''),
    ).toMatchObject({
      version: 1,
      experiments: [
        { id: 'ex1', seed: 1, steps: 12, objective: EXPERIMENT_OBJECTIVE },
      ],
    });
    write('replay.json', {});
    expect(() => experimentAssets(root)).toThrow('hash mismatch');
    seal();
    // Integrity-only publication never claims semantic acceptance; the explicit gate still rejects forgery.
    expect(() => experimentAssets(root)).not.toThrow();
    expect(() => validateExperiment(root, 'ex1')).toThrow(
      'seeded reconstruction',
    );
  });
  it.each(['running', 'failed'])(
    'does not publish a %s record or prevent capture builds',
    (status) => {
      manifest.status = status;
      seal();
      expect([...experimentAssets(root).entries()]).toEqual([
        [
          'experiments/index.json',
          JSON.stringify({ version: 1, experiments: [] }),
        ],
      ]);
    },
  );
  it('publishes an empty catalogue when the archive has no runs', () => {
    rmSync(directory, { recursive: true });
    expect([...experimentAssets(root).keys()]).toEqual([
      'experiments/index.json',
    ]);
  });
  it('allocates increasing IDs and preserves all previous content', () => {
    const before = readFileSync(resolve(directory, 'results.json'), 'utf8');
    expect(allocateExperiment(root)).toBe('ex2');
    mkdirSync(resolve(root, 'experiment/ex9'));
    expect(allocateExperiment(root)).toBe('ex10');
    expect(readFileSync(resolve(directory, 'results.json'), 'utf8')).toBe(
      before,
    );
  });
  it.each(['../ex1', 'ex0', 'ex01', 'ex-1'])(
    'rejects invalid directory identity %s',
    (id) => {
      expect(() => validateExperiment(root, id)).toThrow('IDs');
    },
  );
  it('rejects incomplete runs and missing objectives even when file hashes agree', () => {
    manifest.status = 'failed';
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow('did not complete');
    manifest.status = 'completed';
    manifest.objective = '';
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow('objective');
  });
  it.each(['replay.json', 'results.json'])(
    'rejects fabricated %s even with an updated hash',
    (file) => {
      write(file, {});
      seal();
      expect(() => validateExperiment(root, 'ex1')).toThrow(
        'seeded reconstruction',
      );
    },
  );
  it.each(['report.md', 'overview.svg'])(
    'rejects inconsistent %s even with an updated hash',
    (file) => {
      writeFileSync(resolve(directory, file), 'Fabricated results');
      seal();
      expect(() => validateExperiment(root, 'ex1')).toThrow('disagrees');
    },
  );
  it('rejects missing visuals, invalid PNGs, failed browser checks and extra executable content', () => {
    writeFileSync(resolve(directory, 'final.png'), 'Not a PNG');
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow('Invalid PNG');
    rmSync(resolve(directory, 'final.png'));
    expect(() => validateExperiment(root, 'ex1')).toThrow();
    writeFileSync(
      resolve(directory, 'final.png'),
      readFileSync(resolve(directory, 'initial.png')),
    );
    write('browser.json', { status: 'failed' });
    seal();
    expect(() => validateExperiment(root, 'ex1')).toThrow('browser checks');
    writeFileSync(resolve(directory, 'injected.ts'), 'throw new Error();');
    expect(() => validateExperiment(root, 'ex1')).toThrow('Unexpected');
  });
  it('rejects symlink artifacts and unknown run directories', () => {
    rmSync(resolve(directory, 'final.png'));
    symlinkSync(
      resolve(directory, 'initial.png'),
      resolve(directory, 'final.png'),
    );
    expect(() => validateExperiment(root, 'ex1')).toThrow('non-file');
    mkdirSync(resolve(root, 'experiment/wrong-name'));
    expect(() => experimentIds(root)).toThrow('IDs');
  });
});
