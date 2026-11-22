import type { V7Actor, V7World } from '@self-evolving-world/world-core';
import { collectiveShared } from '@self-evolving-world/world-core';
export const COLLECTIVE_COLORS: Record<string, string> = {
  ash: '#e5b466',
  birch: '#86b9d4',
  cedar: '#b7a0d6',
};
export function collectiveMemberText(
  actor: V7Actor,
  world: V7World,
  privateView: boolean,
): string {
  const m = actor.collective;
  if (!m) return '';
  const values = Object.entries(m.tendencies)
    .map(([key, value]) => `${key} ${value.toFixed(2)}`)
    .join(' · ');
  const reports = privateView
    ? 'Shared reports are visible only after an actual local read; received records appear below.'
    : `${String(collectiveShared(world, m.group).reports.length)} dated reports at this group meeting location. Global inspection is not model knowledge.`;
  return `${m.group.toUpperCase()} · ${m.species}\n${values}\n${reports}\nPersonal intention: ${m.intent ? `${m.intent.goal} · Reason: ${m.intent.reason} · Claimed progress: ${m.intent.progress} · Next: ${m.intent.next} · Pause: ${m.intent.pause}` : actor.memory.intention || 'No intention recorded yet.'}\nKnown abilities: ${m.knownAbilities.join(', ')}\nResponses: ${JSON.stringify(m.commitments)}\nTrust from actual evidence: ${JSON.stringify(m.trust)}\nReceived information:\n${m.received
    .slice(-4)
    .map((r) => `Round ${String(r.tick)} · ${r.source} · ${r.text}`)
    .join('\n')}\nExperience updates:\n${m.updates
    .slice(-4)
    .map((r) => `Round ${String(r.tick)} · ${r.reason} · ${r.evidence}`)
    .join('\n')}`;
}
