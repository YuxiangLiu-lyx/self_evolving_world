import type { V7Actor, V7Project } from './continuous-types.js';
import { v7Record, v7Clone } from './continuous-data.js';

export function openProjects(value: unknown): V7Project[] {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error('Provide at most eight project updates.');
  const text = (v: unknown) => {
    if (typeof v !== 'string') throw new Error('Project fields must be text.');
    const s = v;
    if (s.length > 360) throw new Error('Project fields must be concise.');
    return s;
  };
  const list = (v: unknown) => {
    if (!Array.isArray(v) || v.length > 8)
      throw new Error('Project lists contain at most eight entries.');
    return v.map(text);
  };
  return value.map((v: unknown) => {
    const p = v7Record(v),
      id = text(p.id),
      status = text(p.status);
    if (
      !/^[a-z][a-z0-9-]{0,47}$/.test(id) ||
      !['active', 'paused', 'completed', 'abandoned'].includes(status)
    )
      throw new Error('Invalid project identity or status.');
    return {
      id,
      status: status as V7Project['status'],
      question: text(p.question),
      evidence: list(p.evidence),
      uncertainty: text(p.uncertainty),
      goal: text(p.goal),
      completedSteps: list(p.completedSteps),
      outputs: list(p.outputs),
      missing: text(p.missing),
      next: text(p.next),
      pauseReason: text(p.pauseReason),
      benefit: text(p.benefit),
    };
  });
}
/** Preserve omitted projects. Claimed progress never changes world facts or reward accounts. */
export function openSaveProjects(
  actor: V7Actor,
  updates: V7Project[],
  tick: number,
): void {
  actor.memory.projects ??= {};
  for (const update of updates)
    actor.memory.projects[update.id] = { ...v7Clone(update), updatedAt: tick };
}
