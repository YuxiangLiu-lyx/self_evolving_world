import { biomeAt, isVisible } from '@self-evolving-world/world-core';
import type {
  AgentState,
  Cell,
  WorldState,
} from '@self-evolving-world/world-core';
import type { Timeline } from './timeline.js';
import { itemIllustration } from './illustrations.js';
function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw Error(`Missing ${id}.`);
  return node;
}
function text(tag: string, value: string, className = '') {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = className;
  return node;
}
export function evolutionIcon(appearance: string): string {
  return /cap|mushroom|fung/i.test(appearance)
    ? 'mushroom'
    : /branch|wood|reed|rod/i.test(appearance)
      ? 'wood'
      : /rock|stone/i.test(appearance)
        ? 'stone'
        : /berry|fruit/i.test(appearance)
          ? 'berry'
          : /fish|water/i.test(appearance)
            ? 'water'
            : 'seed';
}
export function decorateEvolutionCell(
  cell: HTMLElement,
  frame: WorldState,
  p: Cell,
): void {
  const data = frame.evolution;
  if (!data) return;
  const biome = biomeAt(data, p);
  cell.classList.add(`biome-${biome}`);
  cell.dataset.terrain = biome;
  cell.title = `${biome} (${String(p.x)}, ${String(p.y)})${biome === 'river' ? ' · Impassable' : biome === 'shallow' ? ' · Passable crossing' : ''}`;
  const site = data.sites.find(
    (s) => s.position.x === p.x && s.position.y === p.y,
  );
  if (site) {
    const token = text('span', '', `environment-token site-${site.kind}`);
    token.dataset.mapObject = site.id;
    token.title = `${site.id} · ${site.appearance}`;
    token.setAttribute('aria-label', token.title);
    if (site.kind === 'tree')
      token.innerHTML =
        '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#c1a477" d="M14 15h5v17h-5z"/><path fill="#a0bf83" d="M16 0 3 21h26z"/><path fill="#6d9c71" d="m16 7-13 21h26z"/></svg>';
    else
      token.append(
        itemIllustration(
          site.kind === 'rock'
            ? 'stone'
            : site.kind === 'fungus'
              ? 'mushroom'
              : 'water',
        ),
      );
    cell.append(token);
  }
}
export function evolutionEventText(frame: WorldState): string {
  return (
    frame.evolution?.events
      .map(
        (e) =>
          `${frame.agents.find((a) => a.id === e.action.agentId)?.name ?? e.action.agentId} · ${e.action.type} · ${e.outcome}: ${e.detail}`,
      )
      .join('\n') ||
    'Heterogeneous world created. Resource safety is unknown until personally learned.'
  );
}
export function renderEvolutionPanel(
  frame: WorldState,
  actor: AgentState,
  timeline: Timeline,
  cursor: number,
): void {
  const data = frame.evolution;
  if (!data) return;
  el('survival-environment').textContent =
    'Primitive era · At zero satiety: −10 health, then −2 satiety. Initial satiety 60. Deep river blocks movement; shallows connect regions.';
  el('learning-policy').textContent =
    'World review and development complete at the round barrier. Shared implementations require individual learning; no resource replenishment.';
  const programs =
      timeline.evolutionPrograms?.filter(
        (p) => p.agentId === actor.id && p.tick <= frame.tick,
      ) ?? [],
    active = programs.at(-1);
  el('program-status').textContent =
    `${String(programs.length)} / 60 calls · Up to 12 rounds per plan · Failure, danger or encounters can interrupt`;
  el('program-code').textContent =
    active?.code ?? 'No accepted program; wait fallback.';
  el('program-summary').textContent =
    active?.summary ?? 'No decision recorded at this frame.';
  const feedback = timeline.frames
    .slice(1, cursor + 1)
    .flatMap((f) => f.evolution?.events ?? [])
    .filter(
      (e) =>
        e.action.agentId === actor.id &&
        ['learn', 'study', 'use'].includes(e.action.type),
    );
  el('learning-history').replaceChildren(
    ...(feedback.length
      ? feedback
          .slice(-8)
          .map((e) =>
            text(
              'p',
              `Round ${String(e.tick)} · ${e.outcome} · ${e.detail}`,
              'learning-record',
            ),
          )
      : [text('p', 'No requests yet.', 'muted')]),
  );
  const knowledge = data.knowledge[actor.id],
    memory = data.memory[actor.id];
  el('world-skill-count').textContent =
    `${String(data.skills.length)} world implementations · ${String(data.types.length)} resource types · ${String(data.ecology.length)} ecological rules`;
  el('learning-progress').textContent = knowledge?.pending
    ? `Learning ${knowledge.pending.skillId}: ${String(knowledge.pending.completed)} / ${String(knowledge.pending.total)} rounds completed`
    : 'No learning in progress.';
  const skills = data.skills.filter((s) => knowledge?.learned.includes(s.id));
  el('learned-skills').replaceChildren(
    ...(skills.length
      ? skills.map((s) => {
          const m = data.mechanics.find((m) => m.id === s.mechanicId),
            d = document.createElement('details');
          d.className = 'learned-skill';
          d.dataset.learnedSkill = s.id;
          d.append(
            text(
              'summary',
              `${s.name} · ${s.id} v${String(s.version)} · Learned`,
            ),
            text('p', s.description),
            text('p', `Parameters: ${m?.parameters.join(', ') ?? ''}`),
            text('pre', m?.code ?? '', 'program-code'),
          );
          return d;
        })
      : [text('p', 'No learned extension skills.', 'muted')]),
  );
  const rows = data.stacks
    .filter(
      (s) =>
        s.quantity > 0 &&
        (s.owner === actor.id ||
          (s.position &&
            isVisible(
              actor.position,
              s.position,
              frame.settings.visionRadius,
            ))),
    )
    .map((s) => {
      const type = data.types.find((t) => t.id === s.type),
        known = memory?.knownTypes.includes(s.type);
      return text(
        'p',
        `${s.id} · ${s.owner === actor.id ? 'Carried' : 'Ground'} · ${String(s.quantity)} units · ${type?.appearance ?? s.type} · ${known ? `nutrition ${String(type?.nutrition)}, toxicity ${String(type?.toxicity)}` : 'Properties unknown'}${s.durability ? ` · durability ${String(s.durability)}` : ''}`,
        'resource-detail',
      );
    });
  for (const site of data.sites.filter((s) =>
    isVisible(actor.position, s.position, frame.settings.visionRadius),
  ))
    rows.push(
      text(
        'p',
        `${site.id} · ${site.appearance} · ${
          memory?.inspected.includes(site.id)
            ? `Observed stock: ${
                Object.entries(site.stock)
                  .map(([k, n]) => `${k} ${String(n)}`)
                  .join(', ') || 'empty'
              }`
            : 'Contents unexamined'
        }`,
        'resource-detail',
      ),
    );
  rows.unshift(
    text(
      'p',
      `Personal experience: ${String(memory?.visited.length ?? 0)} visited cells · ${String(memory?.discovered.length ?? 0)} discovered objects · ${String(memory?.knownTypes.length ?? 0)} identified types`,
      'resource-detail',
    ),
  );
  el('resource-details').replaceChildren(...rows);
}
