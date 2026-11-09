import { isVisible } from '@self-evolving-world/world-core';
import type {
  AgentState,
  Cell,
  WorldState,
} from '@self-evolving-world/world-core';
import type { Timeline } from './timeline.js';
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw Error(`Missing ${id}.`);
  return e;
}
function text(
  tag: 'p' | 'strong' | 'pre' | 'summary' | 'span',
  value: string,
  className = '',
): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = value;
  e.className = className;
  return e;
}
export function decorateLearningCell(
  cell: HTMLElement,
  frame: WorldState,
  position: Cell,
): void {
  const env = frame.learning?.environment;
  if (!env) return;
  const at = (p: Cell) => p.x === position.x && p.y === position.y;
  if (env.river.some(at)) {
    const shallow = env.shallows.some(at);
    cell.classList.add(shallow ? 'terrain-shallow' : 'terrain-river');
    cell.dataset.terrain = shallow ? 'shallow' : 'river';
    cell.title = shallow
      ? 'Shallow crossing: passable'
      : 'Deep river: impassable';
  }
  const object = env.objects.find((o) => at(o.position));
  if (object) {
    const token = document.createElement('span');
    token.className = `environment-token object-${object.kind}`;
    token.dataset.mapObject = object.id;
    token.title = `${object.id}: ${Object.entries(object.stock)
      .map(([kind, n]) => `${kind} ${String(n)}`)
      .join(', ')}`;
    token.setAttribute('aria-label', token.title);
    // Fixed authored SVG only; model output never becomes markup.
    token.innerHTML =
      object.kind === 'tree'
        ? '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#b58b5b" d="M14 16h5v15h-5z"/><path fill="#6f9d68" d="M16 1 4 19h24z"/><path fill="#8ab879" d="M16 7 3 25h26z"/></svg>'
        : object.kind === 'rock'
          ? '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#abbdb6" stroke="#d5e1da" d="m3 23 4-14 12-5 10 13-5 12H9z"/><path fill="#809b92" d="m7 9 10 8 12 0-5 12H9z"/></svg>'
          : '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#badbd9" d="M5 15q12-14 21 0-9 15-21 0L0 7v16z"/><circle cx="21" cy="13" r="2" fill="#224b51"/></svg>';
    cell.append(token);
  }
}
export function learningEventText(frame: WorldState): string {
  const events = frame.learning?.events ?? [];
  return events.length
    ? events
        .map(
          (e) =>
            `${frame.agents.find((a) => a.id === e.action.agentId)?.name ?? e.action.agentId} · ${e.action.type} · ${e.outcome}: ${e.detail}`,
        )
        .join('\n')
    : 'Primitive world created. Skills require individual learning; resources are finite.';
}
export function renderLearningPanel(
  frame: WorldState,
  actor: AgentState,
  timeline: Timeline,
  cursor: number,
): void {
  const data = frame.learning;
  if (!data) return;
  el('survival-environment').textContent =
    'Primitive era · At zero satiety: −10 health, then −3 satiety each round. Food effects require actual consumption.';
  el('learning-policy').textContent =
    'World Agent review and code validation finish before the round advances. Individual learning still consumes game rounds.';
  const programs =
      timeline.learningPrograms?.filter(
        (p) => p.agentId === actor.id && p.tick <= frame.tick,
      ) ?? [],
    active = programs.at(-1);
  el('program-status').textContent =
    `${String(programs.length)} / 12 calls · Short plans re-evaluate after learning, failure or worsening vitals`;
  el('program-code').textContent =
    active?.code ?? 'No accepted program; explicit wait fallback.';
  el('program-summary').textContent =
    active?.summary ?? 'No decision recorded at this frame.';
  const feedback = timeline.frames
    .slice(1, cursor + 1)
    .flatMap((f) => f.learning?.events ?? [])
    .filter(
      (e) =>
        e.action.agentId === actor.id &&
        ['learn', 'study', 'use'].includes(e.action.type),
    );
  el('learning-history').replaceChildren(
    ...(feedback.length
      ? feedback
          .slice(-6)
          .map((e) =>
            text(
              'p',
              `Round ${String(e.tick)} · ${e.outcome} · ${e.detail}`,
              'learning-record',
            ),
          )
      : [text('p', 'No requests yet.', 'muted')]),
  );
  const knowledge = data.knowledge[actor.id];
  el('world-skill-count').textContent =
    `${String(data.skills.length)} world implementations`;
  el('learning-progress').textContent = knowledge?.pending
    ? `Learning ${knowledge.pending.skillId}: ${String(knowledge.pending.completed)} / ${String(knowledge.pending.total)} rounds completed`
    : 'No learning in progress.';
  const skills = data.skills.filter((s) => knowledge?.learned.includes(s.id));
  el('learned-skills').replaceChildren(
    ...(skills.length
      ? skills.map((s) => {
          const d = document.createElement('details');
          d.className = 'learned-skill';
          d.dataset.learnedSkill = s.id;
          d.append(
            text(
              'summary',
              `${s.name} · ${s.id} v${String(s.version)} · Learned`,
            ),
            text('p', s.description),
            text('p', `Parameters: ${s.parameters.join(', ') || 'none'}`),
            text('p', `Conditions: ${s.conditions.join(' ')}`),
            text('p', `Costs: ${s.costs.join(' ')}`),
            text('p', `Effects: ${s.effects.join(' ')}`),
            text('pre', s.code, 'program-code'),
          );
          return d;
        })
      : [text('p', 'No learned extension skills.', 'muted')]),
  );
  const own = new Set(actor.inventory.map((i) => i.id));
  const visibleItems = frame.items.filter((i) =>
    isVisible(actor.position, i.position, frame.settings.visionRadius),
  );
  const ids = new Set([...own, ...visibleItems.map((i) => i.id)]);
  const rows = data.environment.resources
    .filter((r) => ids.has(r.id))
    .map((r) =>
      text(
        'p',
        `${r.id} · ${own.has(r.id) ? 'Carried' : 'Ground'} · ${String(r.quantity)} units · nutrition ${String(r.nutrition)} · toxicity ${String(r.toxicity)}${r.durability ? ` · tool durability ${String(r.durability)}` : ''}`,
        r.toxicity ? 'resource-detail toxic-detail' : 'resource-detail',
      ),
    );
  for (const o of data.environment.objects.filter((o) =>
    isVisible(actor.position, o.position, frame.settings.visionRadius),
  ))
    rows.push(
      text(
        'p',
        `${o.id} (${String(o.position.x)}, ${String(o.position.y)}) · Environment object · ${Object.entries(
          o.stock,
        )
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(', ')}`,
        'resource-detail',
      ),
    );
  el('resource-details').replaceChildren(
    ...(rows.length
      ? rows
      : [text('p', 'No resources in view or inventory.', 'muted')]),
  );
}
