import {
  continueLearningExecution,
  newLearningExecution,
} from '../apps/simulator/src/learning-run.js';
import { learningCheckpoint, learningEngineHash } from './learning-files.js';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git } from './delivery-git.js';
import { digest, newContext, parseIntent } from './task-context.js';
import {
  LocalTaskEffects,
  requestCaptureRecovery,
  type CommandRunner,
} from './task-runtime.js';
import { hashFile, REVIEW_SCENES, sourceFingerprint } from './validation.js';
import {
  analysisMaterial,
  analysisPaths,
  checkAnalysis,
  checkAnalyses,
  parseAnalysis,
  writeAnalysis,
  type ExperimentAnalysis,
} from './experiment-review.js';
import { allocateExperiment, experimentIds } from './experiments.js';
import { reviewBody } from './task-review.js';
import { classifyChanges } from './harness.js';

const repository = process.cwd(),
  plan = 'docs/exec-plans/active/pr-99-fixture.md';
const basis = {
  source: 'task-instruction',
  reference: 'Fixture task only',
  quote: 'The user requests a local-only fixture and forbids external writes.',
};
let root: string;
const makeContext = () =>
  newContext(
    parseIntent({
      id: 'fixture-task',
      task: 'Fixture task',
      request: 'Test the existing gates through the coordinator.',
      plan,
      requirementsVersion: 1,
      requestedType: 'code',
      experiment: { mode: 'none' },
      analyze: [],
      delivery: { mode: 'local-only', basis },
      merge: { status: 'forbidden', basis },
    }),
  );
const save = (path: string, value: unknown) => {
  writeFileSync(resolve(root, path), JSON.stringify(value));
};
function evidence(c: ReturnType<typeof makeContext>) {
  const fingerprint = sourceFingerprint(root);
  c.validation = {
    runId: 'fixture-run',
    sourceHash: fingerprint,
    intentHash: digest(c.intent),
    log: 'fixture',
  };
  save('validation-results/report.json', {
    version: 1,
    task: c.intent.task,
    runId: 'fixture-run',
    sourceHash: fingerprint,
    status: 'passed',
    browserTests: 1,
    evidence: REVIEW_SCENES.map((id) => ({
      id,
      path: `test-results/${id}.png`,
      sha256: hashFile(resolve(root, `test-results/${id}.png`)),
    })),
  });
  // Synthetic reviews exercise isolated gates only; they are never task acceptance evidence.
  save('validation-results/review.json', {
    runId: 'fixture-run',
    reviewer: 'Gate fixture',
    visual: REVIEW_SCENES.map((id) => ({
      id,
      verdict: 'pass',
      notes: 'Synthetic fixture image review.',
    })),
    behavior: { verdict: 'pass', notes: 'Synthetic behavior fixture.' },
    requirements: { verdict: 'pass', notes: 'Synthetic requirements fixture.' },
  });
}
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'world-task-runtime-'));
  for (const path of [
    'validation-results/tasks',
    'test-results',
    'docs/exec-plans/active',
  ])
    mkdirSync(resolve(root, path), { recursive: true });
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  writeFileSync(
    resolve(root, '.gitignore'),
    'validation-results/\ntest-results/\n',
  );
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Baseline');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-c', 'feat/fixture');
  writeFileSync(
    resolve(root, plan),
    '# Fixture\n\n## Delivery\n\n- Task: Fixture task\n- Mode: local-only\n- Reason: The user explicitly requests local-only fixture delivery.\n',
  );
  for (const id of REVIEW_SCENES)
    writeFileSync(
      resolve(root, `test-results/${id}.png`),
      Buffer.from('89504e470d0a1a0a0102', 'hex'),
    );
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('existing gates behind the task runtime', () => {
  it('rejects incomplete reviews and stale source, screenshot and run evidence using the real gate', () => {
    const c = makeContext(),
      runtime = new LocalTaskEffects(root, () => {});
    evidence(c);
    expect(runtime.validationState(c)).toBe('passed');
    save('validation-results/review.json', { runId: 'fixture-run' });
    expect(runtime.validationState(c)).toBe('review');
    evidence(c);
    writeFileSync(resolve(root, 'test-results/desktop.png'), 'altered');
    expect(runtime.validationState(c)).toBe('stale');
    evidence(c);
    if (!c.validation) throw new Error('Fixture validation missing.');
    c.validation = { ...c.validation, runId: 'other-run' };
    expect(runtime.validationState(c)).toBe('stale');
    evidence(c);
    writeFileSync(resolve(root, 'changed.txt'), 'New source');
    expect(runtime.validationState(c)).toBe('stale');
  });
  it('commits the exact reviewed files once and keeps generated journals outside fingerprints', () => {
    const c = makeContext(),
      runtime = new LocalTaskEffects(root, () => {});
    evidence(c);
    const snapshot = runtime.snapshot(c);
    c.derived = {
      ...snapshot,
      commitRequired: true,
      publishRequired: true,
      mergeRequested: false,
    };
    c.review = {
      runId: 'fixture-run',
      sourceHash: snapshot.sourceHash,
      files: [...snapshot.route.files],
      commitMessage: 'Reviewed fixture',
      evidenceHash: hashFile(resolve(root, 'validation-results/review.json')),
    };
    save('validation-results/tasks/fixture-task.json', {
      ignored: 'Generated journal',
    });
    expect(sourceFingerprint(root)).toBe(snapshot.sourceHash);
    const before = git(root, 'rev-parse', 'HEAD');
    runtime.commit('Reviewed fixture', c.review.files, c);
    const committed = git(root, 'rev-parse', 'HEAD');
    expect(committed).not.toBe(before);
    runtime.commit('Reviewed fixture', c.review.files, c);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(committed);
    expect(git(root, 'show', '--format=', '--name-only', 'HEAD')).toBe(plan);
  });
  it('binds actual self-review findings and screenshot hashes to the exact current commit', () => {
    const c = makeContext(),
      runtime = new LocalTaskEffects(root, () => {});
    evidence(c);
    const snapshot = runtime.snapshot(c);
    c.review = {
      runId: 'fixture-run',
      sourceHash: snapshot.sourceHash,
      files: [...snapshot.route.files],
      commitMessage: 'Fixture',
      evidenceHash: runtime.reviewEvidenceHash(),
    };
    c.body = {
      path: 'validation-results/body.md',
      title: 'Fixture',
      head: snapshot.head,
      runId: 'fixture-run',
    };
    const body = reviewBody(root, c);
    expect(body).toContain('not independent approval');
    expect(body).toContain(snapshot.head);
    expect(body).toContain('fixture-run');
    expect(body).toContain('Synthetic fixture image review.');
    expect(body).toContain(hashFile(resolve(root, 'test-results/desktop.png')));
    expect(body).toContain(plan);
    c.body.head = 'old-head';
    expect(() => reviewBody(root, c)).toThrow('current reviewed head');
    c.body.head = snapshot.head;
    writeFileSync(
      resolve(root, 'validation-results/review.json'),
      readFileSync(
        resolve(root, 'validation-results/review.json'),
        'utf8',
      ).replace('Gate fixture', 'Changed reviewer'),
    );
    expect(() => reviewBody(root, c)).toThrow('evidence changed');
  });
  it('uses prepare-only publication and verify-only completion, never the default merging command', () => {
    const calls: string[][] = [],
      c = makeContext();
    c.intent = {
      ...c.intent,
      delivery: { ...c.intent.delivery, mode: 'pr-only' },
    };
    evidence(c);
    c.body = {
      path: 'validation-results/body.md',
      title: 'Fixture title',
      head: git(root, 'rev-parse', 'HEAD'),
      runId: 'fixture-run',
    };
    const runner: CommandRunner = (args) => {
      calls.push(args);
      save('validation-results/publication.json', { status: 'ready' });
      save('validation-results/completion.json', {
        status: 'completed-with-exception',
        task: c.intent.task,
        runId: c.validation?.runId,
        sourceHash: sourceFingerprint(root),
      });
      return { status: 0 };
    };
    const runtime = new LocalTaskEffects(root, () => {}, runner);
    runtime.publish(c);
    runtime.finish(c);
    expect(calls).toEqual([
      ['task:publish', '--', c.body.path, c.body.title, '--prepare-only'],
      ['task:publish', '--', c.body.path, c.body.title, '--verify-only'],
    ]);
    c.intent = {
      ...c.intent,
      delivery: { ...c.intent.delivery, mode: 'merge' },
      merge: { status: 'missing' },
    };
    expect(() => runtime.finish(c)).toThrow('authorization');
    expect(calls).toHaveLength(2);
  });
  it('journals allocation before the command and never repeats inference after interruption', async () => {
    const c = makeContext();
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'survival',
        allocation: 'new',
        basis: c.intent.delivery.basis,
      },
    };
    const calls: string[][] = [];
    const runner: CommandRunner = (args) => {
      expect(c.experiment?.phase).toBe('started');
      calls.push(args);
      cpSync(
        resolve(repository, 'experiment/ex3'),
        resolve(root, 'experiment/ex3'),
        { recursive: true },
      );
      return { status: 0 };
    };
    const runtime = new LocalTaskEffects(root, () => {}, runner);
    await runtime.experiment(c, () => {});
    expect(c.experiment?.id).toBe('ex3');
    expect(c.experiment?.phase).toBe('recorded');
    await runtime.experiment(c, () => {});
    expect(calls).toEqual([['experiment:survival']]);
    delete c.experiment?.id;
    if (c.experiment) c.experiment.phase = 'started';
    await runtime.experiment(c, () => {});
    expect(c.experiment?.id).toBe('ex3');
    expect(calls).toHaveLength(1);
  });
  it('retries a known failure before allocation only on continuation and reports uncertain interruption', async () => {
    const c = makeContext();
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'random',
        allocation: 'new',
        basis: c.intent.delivery.basis,
      },
    };
    let attempts = 0;
    const runtime = new LocalTaskEffects(
      root,
      () => {},
      () => {
        attempts++;
        return { status: 1 };
      },
    );
    await expect(runtime.experiment(c, () => {})).rejects.toThrow('failed');
    expect(attempts).toBe(1);
    expect(experimentIds(root)).toEqual([]);
    await expect(runtime.experiment(c, () => {})).rejects.toThrow('failed');
    expect(attempts).toBe(2);
    delete c.experiment?.error;
    await expect(runtime.experiment(c, () => {})).rejects.toThrow(
      'allocation is unresolved',
    );
    expect(attempts).toBe(2);
  });
  it('uses only capture resume for incomplete saved experiments and rejects parameter substitution', async () => {
    cpSync(
      resolve(repository, 'experiment/ex3'),
      resolve(root, 'experiment/ex3'),
      { recursive: true },
    );
    const c = makeContext();
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'survival',
        allocation: 'new',
        basis: c.intent.delivery.basis,
      },
    };
    c.experiment = {
      before: [],
      phase: 'started',
      id: 'ex3',
      error: 'Known capture failure after inference.',
    };
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'experiment/ex3/manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    save('experiment/ex3/manifest.json', { ...manifest, status: 'failed' });
    delete c.experiment.error;
    requestCaptureRecovery(root, c, 'ex3');
    expect(c.experiment.error).toContain('capture-only');
    const calls: string[][] = [];
    const runtime = new LocalTaskEffects(
      root,
      () => {},
      (args) => {
        calls.push(args);
        save('experiment/ex3/manifest.json', manifest);
        return { status: 0 };
      },
    );
    await runtime.experiment(c, () => {});
    expect(calls).toEqual([['experiment:resume', '--', 'ex3']]);
    expect(() => {
      requestCaptureRecovery(root, c, 'ex3');
    }).toThrow('already allocated incomplete');
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'random',
        allocation: 'new',
        basis: c.intent.delivery.basis,
      },
    };
    await expect(runtime.experiment(c, () => {})).rejects.toThrow(
      'protocol/parameters',
    );
    expect(calls).toHaveLength(1);
  });
});

it('returns the saved development barrier without starting a worker and rejects stale source or forged responses', async () => {
  for (const path of [
    'apps/simulator/src',
    'packages/world-core/src',
    'experiment/ex4',
  ])
    mkdirSync(resolve(root, path), { recursive: true });
  const state = await continueLearningExecution(
    newLearningExecution('offline-fixture', 'simulated-test'),
    (role) =>
      Promise.resolve({
        decision: {
          text: JSON.stringify(
            role === 'ordinary'
              ? {
                  code: 'learn({"name":"Nourishment","purpose":"Consume owned food for satiety","target":"Owned edible resource","conditions":"Inventory food is available","expectedEffect":"Finite consumption applies nutrition"});',
                  summary: 'Offline fixture requests a capability.',
                }
              : { needsDevelopment: true, reviews: [] },
          ),
          responseId: 'fixture',
          responseFormat: 'sse',
        },
        http: {
          status: 200,
          requestId: null,
          contentType: 'text/event-stream',
        },
      }),
    () => Promise.resolve(),
  );
  save('experiment/ex4/manifest.json', {
    version: 4,
    status: 'running',
    provenance: { engineHash: learningEngineHash(root) },
  });
  save('experiment/ex4/execution.json', state);
  const c = makeContext();
  c.intent = {
    ...c.intent,
    experiment: {
      mode: 'learning',
      allocation: 'new',
      basis: c.intent.delivery.basis,
    },
  };
  c.experiment = { before: [], phase: 'started', id: 'ex4' };
  const calls: string[][] = [];
  const runtime = new LocalTaskEffects(
    root,
    () => {},
    (args) => {
      calls.push(args);
      return { status: 0 };
    },
  );
  expect(await runtime.experiment(c, () => {})).toMatchObject({
    experiment: 'ex4',
    barrier: { tick: 0 },
  });
  expect(await runtime.experiment(c, () => {})).toMatchObject({
    experiment: 'ex4',
  });
  expect(calls).toEqual([]);
  save('validation-results/development.json', {
    barrierId: 'wrong',
    tick: 0,
    reviews: [],
    notes: 'This deliberately invalid fixture must not advance anything.',
  });
  expect(() => {
    runtime.submitDevelopment('validation-results/development.json', c);
  }).toThrow('saved barrier');
  expect(learningCheckpoint(root, 'ex4').rounds).toHaveLength(0);
  const b = state.barrier;
  if (!b) throw Error('Missing barrier.');
  save('validation-results/development.json', {
    barrierId: b.id,
    tick: 0,
    reviews: ['lin', 'moss', 'sol'].map((agentId) => ({
      agentId,
      decision: 'reject',
      reason: 'Offline fixture rejects development without changing the world.',
      prerequisites: [],
      learningRounds: 0,
      skillId: null,
      specification: null,
    })),
    notes:
      'Reviewed all three pending requests and explicitly rejected this fixture batch; no implementation was registered.',
  });
  runtime.submitDevelopment('validation-results/development.json', c);
  expect(learningCheckpoint(root, 'ex4')).toMatchObject({
    phase: 'running',
    rounds: [],
    barrier: null,
  });
  writeFileSync(
    resolve(root, 'packages/world-core/src/change.ts'),
    'export const changed = true;',
  );
  await expect(runtime.experiment(c, () => {})).rejects.toThrow(
    'source changed',
  );
  expect(calls).toEqual([]);
});

describe('retained behavioral analysis', () => {
  function analysis(): ExperimentAnalysis {
    cpSync(
      resolve(repository, 'experiment/ex3'),
      resolve(root, 'experiment/ex3'),
      { recursive: true },
    );
    const material = analysisMaterial(root, 'ex3');
    return {
      version: 1,
      experiment: 'ex3',
      taskId: 'fixture-task',
      reviewer: 'Fixture reviewer',
      artifacts: material.artifacts,
      summary: 'A synthetic analysis validates coverage and artifact binding.',
      agents: material.actors.map((id) => ({
        id,
        observations:
          'Observed fixture behavior with an actual archive reference.',
        assessment:
          'This fixture does not establish any causal behavioral claim.',
        evidence: ['experiment/ex3/results.json'],
      })),
      findings: {
        isolation: 'The fixture records the limits of isolation evidence.',
        individuality:
          'The fixture records differences between the observed actors.',
        behavior: 'The fixture identifies behavior relative to the objective.',
        causes: 'The fixture separates observations from causal hypotheses.',
        limitations:
          'The fixture cannot prove the reviewer made a correct judgment.',
      },
      recommendations: [
        {
          proposal: 'Propose a controlled follow-up without executing changes.',
          rationale:
            'A recommendation is not authorization to modify the world.',
          verification:
            'Compare actual archived observations in a future authorized task.',
        },
      ],
    };
  }
  it('stores readable analysis with exact original hashes without allocating or altering historical archives', () => {
    const a = analysis(),
      before = analysisMaterial(root, 'ex3');
    writeAnalysis(root, parseAnalysis(root, a));
    checkAnalysis(root, 'ex3', a.taskId);
    expect(analysisMaterial(root, 'ex3')).toEqual(before);
    expect(experimentIds(root)).toEqual(['ex3']);
    expect(
      classifyChanges(Object.values(analysisPaths('ex3', a.taskId))).kind,
    ).toBe('experiment');
    expect(allocateExperiment(root)).toBe('ex4');
  });
  it('rejects missing actors, outdated artifact hashes, invalid references and altered readable reports', () => {
    const a = analysis();
    expect(() =>
      parseAnalysis(root, { ...a, agents: a.agents.slice(1) }),
    ).toThrow('each actor');
    expect(() => parseAnalysis(root, { ...a, artifacts: {} })).toThrow(
      'artifacts changed',
    );
    expect(() =>
      parseAnalysis(root, {
        ...a,
        agents: a.agents.map((actor) => ({
          ...actor,
          evidence: ['invented.json'],
        })),
      }),
    ).toThrow('actual bound');
    writeAnalysis(root, a);
    writeFileSync(
      resolve(root, analysisPaths('ex3', a.taskId).markdown),
      'Unbound report',
    );
    expect(() => {
      checkAnalysis(root, 'ex3', a.taskId);
    }).toThrow('readable report');
    expect(() => analysisPaths('ex3', '../escape')).toThrow('task ID');
    writeAnalysis(root, a);
    rmSync(resolve(root, analysisPaths('ex3', a.taskId).json));
    expect(() => {
      checkAnalyses(root);
    }).toThrow();
  });
});
