import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { experimentFiles, readExperiment } from './experiments.js';
import { hashFile, object, readJson } from './validation.js';
import { experimentId, text } from './task-context.js';

export interface ExperimentAnalysis {
  readonly version: 1;
  readonly experiment: string;
  readonly taskId: string;
  readonly reviewer: string;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly summary: string;
  readonly agents: readonly {
    id: string;
    observations: string;
    assessment: string;
    evidence: readonly string[];
  }[];
  readonly findings: {
    isolation: string;
    individuality: string;
    behavior: string;
    causes: string;
    limitations: string;
  };
  readonly recommendations: readonly {
    proposal: string;
    rationale: string;
    verification: string;
  }[];
}
const substantive = (value: unknown, name: string): string => {
  const result = text(value, name);
  if (result.trim().length < 20)
    throw new Error(`Analysis needs substantive ${name}.`);
  return result;
};
export function analysisMaterial(root: string, id: string) {
  const record = readExperiment(root, experimentId(id));
  return {
    experiment: id,
    actors: record.run.frames[0]?.agents.map((a) => a.id) ?? [],
    artifacts: Object.fromEntries(
      ['manifest.json', ...experimentFiles(record.manifest)].map((file) => [
        `experiment/${id}/${file}`,
        hashFile(resolve(root, 'experiment', id, file)),
      ]),
    ),
  };
}
export function parseAnalysis(
  root: string,
  value: unknown,
): ExperimentAnalysis {
  const a = object(value),
    id = experimentId(a.experiment),
    material = analysisMaterial(root, id);
  const taskId = text(a.taskId, 'analysis task ID');
  if (a.version !== 1 || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(taskId))
    throw new Error('Invalid analysis identity.');
  if (!isDeepStrictEqual(a.artifacts, material.artifacts))
    throw new Error(
      'Analysis artifacts changed; inspect the actual record again.',
    );
  if (
    !Array.isArray(a.agents) ||
    !Array.isArray(a.recommendations) ||
    !a.recommendations.length
  )
    throw new Error('Analysis needs all actors and proposed improvements.');
  const agents = a.agents.map((value: unknown) => {
    const actor = object(value);
    if (!Array.isArray(actor.evidence) || !actor.evidence.length)
      throw new Error('Each actor needs artifact references.');
    const evidence = actor.evidence.map((v: unknown) =>
      text(v, 'evidence reference'),
    );
    if (
      evidence.some(
        (p) => !Object.hasOwn(material.artifacts, p.split('#')[0] ?? ''),
      )
    )
      throw new Error(
        'Analysis must cite an actual bound experiment artifact.',
      );
    return {
      id: text(actor.id, 'actor ID'),
      observations: substantive(actor.observations, 'observations'),
      assessment: substantive(actor.assessment, 'assessment'),
      evidence,
    };
  });
  if (
    !isDeepStrictEqual(
      agents.map((a) => a.id).sort(),
      [...material.actors].sort(),
    )
  )
    throw new Error('Analysis must cover each actor exactly once.');
  const f = object(a.findings);
  const findings = {
    isolation: substantive(f.isolation, 'isolation'),
    individuality: substantive(f.individuality, 'individuality'),
    behavior: substantive(f.behavior, 'behavior'),
    causes: substantive(f.causes, 'causes'),
    limitations: substantive(f.limitations, 'limitations'),
  };
  const recommendations = a.recommendations.map((value: unknown) => {
    const r = object(value);
    return {
      proposal: substantive(r.proposal, 'proposal'),
      rationale: substantive(r.rationale, 'rationale'),
      verification: substantive(r.verification, 'verification'),
    };
  });
  return {
    version: 1,
    experiment: id,
    taskId,
    reviewer: text(a.reviewer, 'reviewer'),
    artifacts: material.artifacts,
    summary: substantive(a.summary, 'summary'),
    agents,
    findings,
    recommendations,
  };
}
export function analysisPaths(
  id: string,
  taskId: string,
): { json: string; markdown: string } {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(taskId))
    throw new Error('Invalid analysis task ID.');
  const base = `experiment/analyses/${experimentId(id)}/${taskId}`;
  return { json: `${base}.json`, markdown: `${base}.md` };
}
export function analysisMarkdown(a: ExperimentAnalysis): string {
  return `# ${a.experiment}: Behavioral Analysis\n\nReviewer: ${a.reviewer}. Task: ${a.taskId}. Recommendations are analysis only; no world, prompt or agent change is authorized by this report.\n\n## Summary\n\n${a.summary}\n\n## Per-agent findings\n\n${a.agents.map((actor) => `### ${actor.id}\n\n${actor.observations}\n\n${actor.assessment}\n\nEvidence: ${actor.evidence.map((ref) => `[${ref}](../../../${ref.split('#')[0] ?? ref})`).join(', ')}.`).join('\n\n')}\n\n${Object.entries(
    a.findings,
  )
    .map(
      ([name, content]) =>
        `## ${name.charAt(0).toUpperCase()}${name.slice(1)}\n\n${content}`,
    )
    .join(
      '\n\n',
    )}\n\n## Proposed improvements\n\n${a.recommendations.map((r, i) => `${String(i + 1)}. ${r.proposal} ${r.rationale} Verification: ${r.verification}`).join('\n')}\n\n## Evidence binding\n\nThe companion JSON records SHA-256 digests of every original archive artifact. Validation checks completeness and freshness, not the truth of the reviewer's causal judgment.\n`;
}
export function writeAnalysis(
  root: string,
  analysis: ExperimentAnalysis,
): void {
  const paths = analysisPaths(analysis.experiment, analysis.taskId);
  mkdirSync(resolve(root, 'experiment/analyses', analysis.experiment), {
    recursive: true,
  });
  writeFileSync(
    resolve(root, paths.json),
    JSON.stringify(analysis, null, 2) + '\n',
  );
  writeFileSync(resolve(root, paths.markdown), analysisMarkdown(analysis));
}
export function checkAnalysis(root: string, id: string, taskId: string): void {
  const paths = analysisPaths(id, taskId);
  const analysis = parseAnalysis(root, readJson(resolve(root, paths.json)));
  if (
    analysis.taskId !== taskId ||
    analysis.experiment !== id ||
    readFileSync(resolve(root, paths.markdown), 'utf8') !==
      analysisMarkdown(analysis)
  )
    throw new Error(
      'Analysis identity or readable report differs from its record.',
    );
}
export function checkAnalyses(root: string): void {
  const directory = resolve(root, 'experiment/analyses');
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory())
      throw new Error('Analysis archives must be experiment directories.');
    const id = experimentId(entry.name);
    for (const file of readdirSync(resolve(directory, id))) {
      if (!/\.(json|md)$/.test(file))
        throw new Error('Unexpected companion analysis artifact.');
      // Checking either half also rejects an orphan Markdown report or JSON record.
      checkAnalysis(root, id, file.replace(/\.(json|md)$/, ''));
    }
  }
}
