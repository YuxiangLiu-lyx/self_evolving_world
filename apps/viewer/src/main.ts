import {
  isVisible,
  parseWorldAction,
  parseBehaviorCode,
} from '@self-evolving-world/world-core';
import type {
  AgentState,
  Outcome,
  WorldAction,
  WorldState,
  WorldEvent,
  SurvivalEvent,
} from '@self-evolving-world/world-core';
import { createDemoTimeline, DEMO_SETUP } from './scenario.js';
import { ExperimentBrowser } from './experiments.js';
import {
  appendAction,
  createTimeline,
  frameAt,
  MAX_ACTIONS,
  MAX_REPLAY_BYTES,
  parseReplay,
  serializeReplay,
} from './timeline.js';
import type { Timeline } from './timeline.js';
import { characterIllustration, itemIllustration } from './illustrations.js';
import {
  decorateLearningCell,
  renderLearningPanel,
  learningEventText,
} from './learning-view.js';
import './style.css';

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing interface element: ${id}`);
  return found;
}
function control<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const found = element(id);
  if (found.tagName.toLowerCase() !== tag)
    throw new Error(`Unexpected element type: ${id}`);
  return found as HTMLElementTagNameMap[K];
}
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

let history = createDemoTimeline();
let cursor = history.frames.length - 1;
let selectedId = 'lin';
let view: 'global' | 'agent' = 'global';
let playback: number | undefined;
let noticeTimer: number | undefined;
let archivedExperiment: string | undefined;
let experimentLoading = false;

const outcomes: Record<Outcome | SurvivalEvent['outcome'], string> = {
  moved: 'Move succeeded',
  'picked-up': 'Added to inventory',
  'out-of-bounds': 'World boundary reached',
  occupied: 'Another agent occupies that cell',
  'item-not-found': 'Item is no longer on the ground',
  'item-out-of-reach': 'Move onto the item to pick it up',
  'skill-unavailable': 'Skill unavailable; request recorded only',
  'skill-already-exists': 'Skill already exists; use its action control',
  waited: 'Waited one round',
  'learning-denied': 'Learning denied; no World Agent',
  dead: 'Dead; no action executed',
};
const directionNames = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west',
} as const;

function countLabel(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? '' : 's'}`;
}

function eventText(frame: WorldState): string {
  if (frame.learning) return learningEventText(frame);
  const events =
    frame.survival?.events ??
    frame.events ??
    (frame.event === null ? [] : [frame.event]);
  return events.length === 0
    ? 'World created. Every agent has an initial observation.'
    : events.map((event) => actionText(frame, event)).join('\n');
}
function actionText(
  frame: WorldState,
  event: WorldEvent | SurvivalEvent,
): string {
  const action = event.action;
  const name =
    frame.agents.find((agent) => agent.id === action.agentId)?.name ??
    action.agentId;
  let verb: string;
  switch (action.type) {
    case 'move':
      verb = `moves ${directionNames[action.direction]}`;
      break;
    case 'pickup':
      verb = `picks up ${frame.agents.flatMap((agent) => agent.inventory).find((item) => item.id === action.itemId)?.name ?? frame.items.find((item) => item.id === action.itemId)?.name ?? action.itemId}`;
      break;
    case 'try':
      verb = `tries "${action.skill}"`;
      break;
    case 'wait':
      verb = 'waits';
      break;
    case 'learn':
      verb = `requests learning "${action.skill}"`;
      break;
  }
  return `${name} ${verb} · ${outcomes[event.outcome]}`;
}
function notify(message: string): void {
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  const notice = element('notice');
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = window.setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}
function stop(): void {
  if (playback !== undefined) window.clearInterval(playback);
  playback = undefined;
}
function canAct(): boolean {
  return (
    history.schedule === undefined &&
    archivedExperiment === undefined &&
    !experimentLoading &&
    playback === undefined &&
    cursor === history.frames.length - 1 &&
    history.frames.length <= MAX_ACTIONS
  );
}
function seek(index: number): void {
  stop();
  cursor = Math.max(0, Math.min(history.frames.length - 1, index));
  render();
}
function startPlayback(): void {
  if (history.frames.length < 2) return;
  if (cursor === history.frames.length - 1) cursor = 0;
  const speed = Number(control('speed', 'select').value);
  playback = window.setInterval(() => {
    cursor += 1;
    if (cursor >= history.frames.length - 1) {
      cursor = history.frames.length - 1;
      stop();
    }
    render();
  }, 1000 / speed);
  render();
}
function execute(action: WorldAction): void {
  if (!canAct()) return;
  try {
    history = appendAction(history, action);
    cursor = history.frames.length - 1;
    render();
    notify(eventText(frameAt(history, cursor)));
  } catch (error) {
    notify(
      error instanceof Error
        ? error.message
        : 'The action could not be completed.',
    );
  }
}
function replaceHistory(next: Timeline): void {
  stop();
  history = next;
  cursor = history.frames.length - 1;
  selectedId = frameAt(history, cursor).agents[0]?.id ?? '';
  render();
}

function renderMap(frame: WorldState, actor: AgentState | undefined): void {
  const { width, height, visionRadius } = frame.settings;
  const grid = element('world-grid');
  grid.style.setProperty('--columns', String(width));
  grid.style.setProperty('--rows', String(height));
  grid.setAttribute('aria-rowcount', String(height));
  grid.setAttribute('aria-colcount', String(width));
  const observation = frame.observations.find(
    (entry) => entry.self.id === actor?.id,
  );
  const agents =
    view === 'global'
      ? frame.agents
      : observation === undefined
        ? []
        : [observation.self, ...observation.agents];
  const items = view === 'global' ? frame.items : (observation?.items ?? []);
  const cells = document.createDocumentFragment();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const visible =
        actor !== undefined &&
        isVisible(actor.position, { x, y }, visionRadius);
      const fog = view === 'agent' && !visible;
      const cell = node(
        'div',
        `cell${visible ? ' visible' : ''}${fog ? ' fog' : ''}${(x * 7 + y * 11) % 17 === 0 ? ' textured' : ''}`,
      );
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute(
        'aria-label',
        fog ? 'Unobserved area' : `Cell ${String(x)}, ${String(y)}`,
      );
      if (!fog) decorateLearningCell(cell, frame, { x, y });
      const agent = agents.find(
        (candidate) => candidate.position.x === x && candidate.position.y === y,
      );
      const ground = items.filter(
        (item) => item.position.x === x && item.position.y === y,
      );
      if (ground.length > 0) {
        const token = node('span', 'item-token');
        const material = frame.learning?.environment.resources.find(
          (r) => r.id === ground[0]?.id,
        );
        const icon = material
          ? (
              {
                fruit: 'berry',
                'poison-fruit': 'berry',
                branch: 'wood',
                timber: 'wood',
                stone: 'stone',
                fish: 'water',
                rod: 'wood',
                axe: 'stone',
              } as const
            )[material.kind]
          : (ground[0]?.id ?? '');
        token.append(itemIllustration(icon));
        if (material) {
          token.append(node('b', 'item-count', String(material.quantity)));
          if (material.toxicity > 0) token.classList.add('toxic-resource');
        }
        if (ground.length > 1)
          token.append(node('b', 'item-count', String(ground.length)));
        token.title = ground
          .map((item) => {
            const r = frame.learning?.environment.resources.find(
              (r) => r.id === item.id,
            );
            return r
              ? `${item.name}: ${String(r.quantity)} units, nutrition ${String(r.nutrition)}, toxicity ${String(r.toxicity)}`
              : item.name;
          })
          .join(', ');
        token.setAttribute('aria-label', token.title);
        token.dataset.mapItem = ground.map((item) => item.id).join(',');
        cell.append(token);
      }
      if (agent !== undefined) {
        const color =
          frame.agents.findIndex((candidate) => candidate.id === agent.id) % 6;
        const token = node(
          'button',
          `agent-token color-${String(color)}${agent.id === selectedId ? ' selected' : ''}`,
        );
        token.append(characterIllustration(color));
        token.title = `${agent.name} (${String(x)}, ${String(y)})`;
        token.setAttribute('aria-label', `Observe ${agent.name}`);
        token.dataset.mapAgent = agent.id;
        if (
          (frame.learning?.vitals[agent.id] ?? frame.survival?.vitals[agent.id])
            ?.health === 0
        )
          token.classList.add('dead-agent');
        token.addEventListener('click', () => {
          selectedId = agent.id;
          render();
        });
        cell.append(token);
      }
      cells.append(cell);
    }
  }
  grid.replaceChildren(cells);
  const xAxis = element('x-axis');
  xAxis.style.gridTemplateColumns = `repeat(${String(width)}, 1fr)`;
  xAxis.replaceChildren(
    ...Array.from({ length: width }, (_, x) => node('span', '', String(x))),
  );
  const yAxis = element('y-axis');
  yAxis.style.gridTemplateRows = `repeat(${String(height)}, 1fr)`;
  yAxis.replaceChildren(
    ...Array.from({ length: height }, (_, y) => node('span', '', String(y))),
  );
  element('vision-caption').textContent =
    actor === undefined
      ? 'No agents in this world'
      : `${actor.name}'s vision · radius ${countLabel(visionRadius, 'cell')}`;
}

function renderInspector(
  frame: WorldState,
  actor: AgentState | undefined,
): void {
  const select = control('agent-select', 'select');
  select.replaceChildren(
    ...frame.agents.map((agent, index) => {
      const option = node(
        'option',
        '',
        `${String(index + 1).padStart(2, '0')}  /  ${agent.name} · ${agent.id}`,
      );
      option.value = agent.id;
      return option;
    }),
  );
  select.value = actor?.id ?? '';
  select.disabled = frame.agents.length === 0;
  element('agent-position').textContent =
    actor === undefined
      ? '—'
      : `${actor.position.x.toString().padStart(2, '0')} , ${actor.position.y.toString().padStart(2, '0')}`;
  element('agent-radius').textContent = countLabel(
    frame.settings.visionRadius,
    'cell',
  );
  element('inventory-count').textContent = String(
    actor?.inventory.length ?? 0,
  ).padStart(2, '0');
  element('inventory').replaceChildren(
    ...(actor?.inventory.length
      ? actor.inventory.map((item) => {
          const chip = node('span', 'inventory-item');
          chip.append(
            itemIllustration(item.id),
            document.createTextNode(item.name),
          );
          return chip;
        })
      : [node('span', 'empty-note', 'Inventory is empty')]),
  );
  const observation = frame.observations.find(
    (entry) => entry.self.id === actor?.id,
  );
  element('visible-summary').textContent =
    `${countLabel(observation?.agents.length ?? 0, 'other agent')} · ${countLabel(observation?.items.length ?? 0, 'ground item')}`;
  element('visible-entities').replaceChildren(
    ...(observation?.agents.map((agent) =>
      node(
        'span',
        'seen-agent',
        `● ${agent.name} (${String(agent.position.x)}, ${String(agent.position.y)})`,
      ),
    ) ?? []),
    ...(observation?.items.map((item) =>
      node(
        'span',
        'seen-item',
        `◆ ${item.name} (${String(item.position.x)}, ${String(item.position.y)})`,
      ),
    ) ?? []),
  );
  const available = frame.items.filter(
    (item) =>
      actor !== undefined &&
      item.position.x === actor.position.x &&
      item.position.y === actor.position.y,
  );
  element('pickup-options').replaceChildren(
    ...(available.length > 0
      ? available.map((item) => {
          const button = node(
            'button',
            'pickup-button',
            `Pick up ${item.name} ↗`,
          );
          button.dataset.pickup = item.id;
          button.addEventListener('click', () => {
            execute({ type: 'pickup', agentId: selectedId, itemId: item.id });
          });
          return button;
        })
      : [
          node(
            'p',
            'empty-pickup',
            'Nothing here. Move onto an item to collect it.',
          ),
        ]),
  );
  control('action-controls', 'fieldset').disabled =
    !canAct() || actor === undefined;
  element('action-hint').textContent =
    archivedExperiment !== undefined
      ? 'Archived experiment. Replay and inspect; actions are read-only.'
      : experimentLoading
        ? 'Loading experiment. The current history is preserved.'
        : history.schedule !== undefined
          ? 'Round histories are read-only. Start a new world to act.'
          : history.frames.length > MAX_ACTIONS
            ? '500-step limit reached. Export, then start a new world.'
            : !canAct()
              ? 'Viewing history. Return to the latest frame to act.'
              : actor === undefined
                ? 'Import a world with agents to start interacting.'
                : 'Control the selected agent. Each action records one step.';
}

function renderEvents(): void {
  const rows = history.frames
    .slice(1, cursor + 1)
    .slice(-6)
    .reverse()
    .map((frame) => {
      const row = node(
        'button',
        `event-row${frame.event?.outcome === 'skill-unavailable' ? ' unsupported' : ''}`,
      );
      row.append(
        node('span', 'event-tick mono', String(frame.tick).padStart(3, '0')),
        node('span', 'event-description', eventText(frame)),
        node('span', 'event-arrow', '↗'),
      );
      row.addEventListener('click', () => {
        seek(frame.tick);
      });
      return row;
    });
  element('event-list').replaceChildren(
    ...(rows.length > 0
      ? rows
      : [
          node(
            'p',
            'empty-events',
            'No actions yet. Start by moving one cell.',
          ),
        ]),
  );
}
function renderSurvival(
  frame: WorldState,
  actor: AgentState | undefined,
): void {
  const vital = actor
    ? (frame.learning?.vitals[actor.id] ?? frame.survival?.vitals[actor.id])
    : undefined;
  element('capability-panel').hidden = !frame.learning;
  element('survival-panel').hidden = vital === undefined;
  if (!actor || !vital) return;
  element('life-status').textContent = vital.health > 0 ? 'Alive' : 'Dead';
  element('vital-signs').replaceChildren(
    ...(['health', 'satiety', 'cold', 'heat'] as const).map((key) => {
      const row = node('div', `vital vital-${key}`);
      const label = node(
        'span',
        'vital-label',
        key.charAt(0).toUpperCase() + key.slice(1),
      );
      const value = node('strong', 'mono', `${String(vital[key])} / 100`);
      value.dataset.vital = key;
      const meter = node('meter', 'vital-meter');
      meter.min = 0;
      meter.max = 100;
      meter.value = vital[key];
      meter.setAttribute('aria-label', key);
      row.append(label, value, meter);
      return row;
    }),
  );
  if (frame.learning) {
    renderLearningPanel(frame, actor, history, cursor);
    return;
  }
  if (!frame.survival) return;
  element('learning-policy').textContent =
    'All requests are denied. No World Agent is present.';
  element('survival-environment').textContent =
    `${String(frame.survival.config.temperature)} °C · Health and satiety: higher is better. Cold and heat: lower is better.`;
  const programs =
    history.programs?.filter(
      (p) => p.agentId === actor.id && p.tick <= frame.tick,
    ) ?? [];
  const active = programs.at(-1);
  const duration = active?.code
    ? parseBehaviorCode(active.code, actor.id, 60 - active.tick).length
    : 0;
  const elapsed = active ? Math.max(0, frame.tick - active.tick) : 0;
  element('program-status').textContent =
    `${String(programs.length)} / 5 calls · ${active?.code ? `${String(Math.min(elapsed, duration))} / ${String(duration)} rounds executed${elapsed > duration ? ' · Budget fallback: wait' : ''}` : 'No accepted program · Fallback: wait'}`;
  element('program-code').textContent = active?.code ?? 'wait(1);';
  element('program-summary').textContent =
    active?.summary ?? 'No model program recorded at this frame.';
  const learning = history.frames
    .slice(1, cursor + 1)
    .flatMap((f) => f.survival?.events ?? [])
    .filter((e) => e.action.agentId === actor.id && e.action.type === 'learn');
  element('learning-history').replaceChildren(
    ...(learning.length
      ? learning.map((event) =>
          node(
            'p',
            'learning-record',
            `Round ${String(event.tick)} · ${event.action.type === 'learn' ? event.action.skill : ''} · ${outcomes[event.outcome]}`,
          ),
        )
      : [node('p', 'muted', 'No requests yet.')]),
  );
}
function render(): void {
  const frame = frameAt(history, cursor);
  const actor =
    frame.agents.find((agent) => agent.id === selectedId) ?? frame.agents[0];
  selectedId = actor?.id ?? '';
  element('world-size').textContent =
    `${String(frame.settings.width)} × ${String(frame.settings.height)}`;
  element('tick-unit').textContent = history.schedule ? 'ROUND' : 'TICK';
  element('tick-value').textContent = String(frame.tick).padStart(3, '0');
  const observation = frame.observations.find(
    (entry) => entry.self.id === actor?.id,
  );
  element('entity-count').textContent =
    view === 'global'
      ? `${countLabel(frame.agents.length, 'agent')} / ${countLabel(frame.items.length, 'ground item')}`
      : `Visible: ${countLabel(observation === undefined ? 0 : observation.agents.length + 1, 'agent')} / ${countLabel(observation?.items.length ?? 0, 'item')}`;
  element('frame-status').textContent =
    playback !== undefined
      ? 'Replaying'
      : cursor === history.frames.length - 1
        ? 'Latest state'
        : 'History frame';
  element('history-storage-note').textContent =
    archivedExperiment === undefined
      ? 'History lives in this page. Export it before leaving or starting over.'
      : `Saved in ${archivedExperiment}. This URL reopens the full archive; playback never changes it.`;
  element('history-count').textContent =
    `${String(cursor).padStart(3, '0')} / ${String(history.frames.length - 1).padStart(3, '0')}`;
  const slider = control('timeline', 'input');
  slider.max = String(history.frames.length - 1);
  slider.value = String(cursor);
  slider.style.setProperty(
    '--progress',
    `${String((cursor / Math.max(1, history.frames.length - 1)) * 100)}%`,
  );
  element('current-event').textContent = eventText(frame);
  control('play-button', 'button').textContent =
    playback !== undefined ? 'Ⅱ Pause' : '▶ Play';
  control('play-button', 'button').disabled = history.frames.length < 2;
  control('first-frame', 'button').disabled = cursor === 0;
  control('previous-frame', 'button').disabled = cursor === 0;
  control('next-frame', 'button').disabled =
    cursor === history.frames.length - 1;
  element('global-view').setAttribute(
    'aria-pressed',
    String(view === 'global'),
  );
  element('agent-view').setAttribute('aria-pressed', String(view === 'agent'));
  renderMap(frame, actor);
  renderInspector(frame, actor);
  renderSurvival(frame, actor);
  renderEvents();
}

element('global-view').addEventListener('click', () => {
  view = 'global';
  render();
});
element('agent-view').addEventListener('click', () => {
  view = 'agent';
  render();
});
control('agent-select', 'select').addEventListener('change', (event) => {
  if (event.currentTarget instanceof HTMLSelectElement) {
    selectedId = event.currentTarget.value;
    render();
  }
});
element('first-frame').addEventListener('click', () => {
  seek(0);
});
element('previous-frame').addEventListener('click', () => {
  seek(cursor - 1);
});
element('next-frame').addEventListener('click', () => {
  seek(cursor + 1);
});
element('latest-frame').addEventListener('click', () => {
  seek(history.frames.length - 1);
});
element('timeline').addEventListener('input', (event) => {
  if (event.currentTarget instanceof HTMLInputElement)
    seek(Number(event.currentTarget.value));
});
element('play-button').addEventListener('click', () => {
  if (playback === undefined) startPlayback();
  else {
    stop();
    render();
  }
});
element('speed').addEventListener('change', () => {
  if (playback !== undefined) {
    stop();
    startPlayback();
  }
});
element('reset-button').addEventListener('click', () => {
  experimentBrowser.localSession();
  archivedExperiment = undefined;
  replaceHistory(createTimeline(DEMO_SETUP));
  notify('New world ready. You can import previously exported history.');
});
element('demo-button').addEventListener('click', () => {
  experimentBrowser.localSession();
  archivedExperiment = undefined;
  replaceHistory(createDemoTimeline());
  notify('Loaded the 12-step scripted demo. Replay it or continue manually.');
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-direction]',
)) {
  button.addEventListener('click', () => {
    execute(
      parseWorldAction({
        type: 'move',
        agentId: selectedId,
        direction: button.dataset.direction,
      }),
    );
  });
}
document.addEventListener('keydown', (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat
  )
    return;
  const keys: Record<string, string> = {
    w: 'north',
    d: 'east',
    s: 'south',
    a: 'west',
  };
  const direction = keys[event.key.toLowerCase()];
  if (direction !== undefined && canAct() && selectedId !== '') {
    event.preventDefault();
    execute(parseWorldAction({ type: 'move', agentId: selectedId, direction }));
  }
});
element('export-button').addEventListener('click', () => {
  const blob = new Blob([serializeReplay(history)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = node('a', '');
  link.href = url;
  link.download = `world-history-${String(history.frames.length - 1)}.json`;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  notify(
    'Exported the full history, including initial conditions and actions.',
  );
});
element('import-button').addEventListener('click', () => {
  control('import-file', 'input').click();
});
async function importFile(file: File): Promise<void> {
  try {
    if (file.size > MAX_REPLAY_BYTES)
      throw new RangeError('Replay files must not exceed 1 MB.');
    const next = parseReplay(await file.text());
    experimentBrowser.localSession();
    archivedExperiment = undefined;
    replaceHistory(next);
    notify(`Imported history with ${String(next.frames.length - 1)} steps.`);
  } catch (error) {
    notify(
      `Import failed. The current world is unchanged. ${error instanceof Error ? error.message : ''}`,
    );
  }
}
element('import-file').addEventListener('change', (event) => {
  if (event.currentTarget instanceof HTMLInputElement) {
    const file = event.currentTarget.files?.[0];
    if (file !== undefined) void importFile(file);
    event.currentTarget.value = '';
  }
});

const experimentBrowser = new ExperimentBrowser(
  (next, id) => {
    archivedExperiment = id;
    replaceHistory(next ?? createDemoTimeline());
  },
  (pending) => {
    experimentLoading = pending;
    if (pending) stop();
    render();
  },
);
render();
void experimentBrowser.start();
