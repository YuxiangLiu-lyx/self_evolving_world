import {
  continuousRegistry,
  v7Install,
  v7Clone,
  surfaceDiagnosticResult,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import {
  surfaceFixture,
  surfaceAction,
  surfaceMust,
} from './collective-root-surface.js';
export const diagnosticsId = 'root-surface-diagnostics';
export const diagnosticAction = (args: V7Action['args'] = {}): V7Action => ({
  interface: diagnosticsId,
  args: {
    operation: 'assess-surface',
    barkId: 'fixture-bark-0',
    toolId: 'fixture-stone',
    ...args,
  },
});
export function diagnosticFixture() {
  const initial = surfaceFixture(),
    a = initial.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  const old = surfaceMust(
    initial,
    surfaceAction('assess-surface', {
      barkId: 'fixture-bark-0',
      toolId: 'fixture-stone',
      site: { ...a.position },
    }),
  );
  const w = v7Clone(
    v7Install(old, continuousRegistry(old), 'root-preparation@3'),
  );
  const actor = w.actors[0];
  if (!actor) throw new Error('Missing fixture performer.');
  actor.mastered.push(diagnosticsId);
  actor.collective?.knownAbilities.push(diagnosticsId);
  // No food is needed for assessment, and fixture setup never enters formal inputs.
  w.stacks = w.stacks.filter((s) => s.resource !== 'root');
  return w;
}
export function diagnosticResult(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture performer.');
  const r = surfaceDiagnosticResult(a);
  if (!r) throw new Error('Missing recorded assessment.');
  return r;
}
export function diagnosticFrames() {
  const legacy = diagnosticFixture(),
    a = legacy.actors[0];
  if (!a) throw new Error('Missing fixture performer.');
  const blocked = surfaceMust(
    legacy,
    diagnosticAction({ site: { ...a.position } }),
  );
  const clear = surfaceMust(blocked, diagnosticAction());
  const changed = v7Clone(clear),
    other = changed.actors[1],
    site = diagnosticResult(clear).site;
  if (!other || !site || typeof site !== 'object' || Array.isArray(site))
    throw new Error('Missing recorded site.');
  other.position = { x: Number(site.x), y: Number(site.y) };
  const read = surfaceMust(
    changed,
    diagnosticAction({
      assessmentId: diagnosticResult(clear).assessmentId ?? null,
    }),
  );
  const unknownWorld = v7Clone(clear),
    sheet = unknownWorld.stacks.find((s) => s.id === 'fixture-bark-0');
  if (!sheet) throw new Error('Missing actual sheet.');
  sheet.processing = { separated: true, fragmented: true };
  const unknown = surfaceMust(unknownWorld, diagnosticAction());
  return { legacy, blocked, clear, read, unknown };
}
