import './style.css';
import type { V7World } from '@self-evolving-world/world-core';
import { forestClimate } from '@self-evolving-world/world-core';
import type { SceneIndex } from '../../continuous-history.js';
import { ReplayClient } from '../../replay-client.js';
import { svgText as escape } from '../../continuous-visuals.js';
import { loadArt } from './assets.js';
import { BOOKMARKS } from './bookmarks.js';
import { ForestRenderer } from './renderer.js';
import {
  actionEvents,
  currentAction,
  interior,
  ownedMantle,
  PEOPLE,
  progress,
} from './model.js';
import type { Person } from './model.js';

const root = document.querySelector<HTMLDivElement>('#presentation');
if (!root) throw new Error('Missing presentation root.');
root.innerHTML = `<header class="masthead"><a class="wordmark" href="./">SELF / EVOLVING WORLD</a><span class="preview-label" lang="zh">Ashen 风格回放（预览）</span><a id="original" href="./?experiment=ex9">Original replay ↗</a></header>
<main><div class="intro"><div><p class="eyebrow" lang="zh">EX9 · 真实实验回放 · 视觉增强</p><h1>Three lives in a changing forest.</h1></div><p class="intro-note">A real experiment, seen closer.<br>Saved actions. No new simulation.</p></div>
<div class="layout"><section class="theater" aria-label="Presentation replay"><div class="stage-head"><div class="people" role="group" aria-label="Follow a character">${Object.entries(
  PEOPLE,
)
  .map(
    ([id, color]) =>
      `<button data-person="${id}" style="--person:${color}" aria-pressed="${String(id === 'lin')}">${String(id[0]?.toUpperCase())}${id.slice(1)}</button>`,
  )
  .join('')}</div><span id="weather"></span></div>
<div class="stage"><canvas id="forest" aria-label="Enhanced recorded forest" tabindex="0"></canvas><div class="stage-legend"><span class="live-dot"></span> RECORDED WORLD <span id="space"></span></div><div class="camera-tools"><button id="follow" aria-pressed="true">Follow</button><button id="overview">Full map</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button></div><canvas id="minimap" width="192" height="144" aria-label="Click to position the camera" tabindex="0"></canvas><span class="gesture-note">Drag to pan · Scroll to zoom · Click a person</span><div id="loading" role="status">Opening verified ex9 records…</div></div>
<div class="transport"><button id="previous" aria-label="Previous round">‹</button><button id="play">Play</button><button id="next" aria-label="Next round">›</button><span id="round">— / 1200</span><select id="speed" aria-label="Playback speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></div><input id="timeline" type="range" min="0" max="1200" value="79" aria-label="Replay round"/><div class="timeline-labels"><span>0</span><span>One recorded round at a time</span><span>1200</span></div>
<div class="chapter"><span class="eyebrow" id="chapter-number">FIELD NOTES</span><h2 id="chapter-title">A shared shelter</h2><p id="chapter-copy"></p></div><div class="bookmarks" aria-label="Event bookmarks">${BOOKMARKS.map((b) => `<button data-tick="${String(b.tick)}"><span>${String(b.tick).padStart(3, '0')}</span>${escape(b.title)}</button>`).join('')}</div></section>
<aside><section class="person-card"><p class="eyebrow">INDIVIDUAL PERSPECTIVE</p><h2 id="person-name">Lin</h2><p id="location"></p><div id="vitals"></div><p class="eyebrow activity-heading">RECORDED ACTION</p><h3 id="action">—</h3><p id="action-copy"></p><div id="progress"></div><div id="equipment"></div></section><section class="event-card"><p class="eyebrow">EVIDENCE AT THIS ROUND</p><div id="events"></div></section><details class="record-details"><summary>Inventory, learning & source</summary><div id="details"></div></details><p class="footnote">Illustrated appearance; authoritative positions, quantities and results. Fire and rain canopy were never built or used in ex9.</p></aside></div>
<footer>Visual assets adapted from <a href="https://github.com/YuxiangLiu-lyx/Ashen">Ashen</a> · <a href="./presentation/ex9/assets/provenance.json">Asset provenance</a> · <a href="./experiments/ex9/replay.json">Original replay index</a><span>Presentation lighting keeps recorded night scenes readable.</span></footer></main>`;
function el(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}.`);
  return element;
}
const slider = el('timeline') as HTMLInputElement,
  canvas = el('forest') as HTMLCanvasElement,
  mini = el('minimap') as HTMLCanvasElement;
let renderer: ForestRenderer | undefined,
  index: SceneIndex | undefined,
  world: V7World | undefined,
  person: Person = 'lin',
  playing = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  sequence = 0,
  busy = false;
const client = new ReplayClient(
  new Worker(new URL('../../replay-worker.ts', import.meta.url), {
    type: 'module',
  }),
);
function stop(): void {
  playing = false;
  clearTimeout(timer);
  el('play').textContent = 'Play';
}
function follow(value: boolean): void {
  if (renderer) {
    renderer.follow = value;
    renderer.draw();
  }
  el('follow').setAttribute('aria-pressed', String(value));
}
function selectPerson(id: Person): void {
  person = id;
  if (renderer) {
    renderer.selected = id;
    follow(true);
  }
  update();
}
function update(): void {
  if (!world) return;
  const actor = world.actors.find((a) => a.id === person);
  if (!actor) return;
  const action = currentAction(world, actor),
    work = progress(world, actor),
    inside = interior(world, actor),
    mantle = ownedMantle(world, actor.id),
    climate = forestClimate(world, actor.position);
  document.querySelectorAll<HTMLButtonElement>('[data-person]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.person === person));
  });
  el('round').textContent =
    `${String(world.tick)} / ${String(index?.observed ?? 1200)}`;
  slider.value = String(world.tick);
  (el('original') as HTMLAnchorElement).href =
    `./?experiment=ex9&round=${String(world.tick)}&actor=${person}`;
  el('person-name').textContent = actor.name;
  el('location').textContent =
    `${inside ? `Inside ${inside.name}` : 'Outdoors'} · (${actor.position.x.toFixed(2)}, ${actor.position.y.toFixed(2)})`;
  el('weather').textContent =
    `${climate.temperature.toFixed(1)}°C · ${climate.season} · ${climate.rain && climate.rain > 0.3 ? 'Rain' : 'Dry'}`;
  el('space').textContent = inside ? ' / interior cutaway' : '';
  el('vitals').innerHTML = [
    ['Health', actor.vitals.health],
    ['Satiety', actor.vitals.satiety],
    ['Energy', actor.vitals.energy],
    ['Wellbeing', actor.wellbeing.total],
  ]
    .map(
      ([name, value]) =>
        `<div class="vital"><span>${String(name)}</span><strong>${Number(value).toFixed(1)}</strong><meter min="0" max="100" value="${String(value)}">${String(value)}</meter></div>`,
    )
    .join('');
  el('action').textContent = action.label;
  el('action').classList.toggle('failure', action.failed);
  el('action-copy').textContent =
    action.event?.description ?? 'No action event in this saved boundary.';
  el('progress').innerHTML = work
    ? `<div class="work"><progress max="${String(work.total || 1)}" value="${String(work.paid)}"></progress><span>${escape(work.label)} · ${String(work.paid)}/${String(work.total)}</span></div>`
    : '';
  el('equipment').innerHTML = mantle?.mantle
    ? `<div class="equipment"><strong>${mantle.mantle.equipped ? 'Mantle worn' : 'Mantle in inventory'}</strong><span>Condition ${mantle.mantle.condition.toFixed(1)} · Moisture ${mantle.mantle.moisture.toFixed(2)}</span></div>`
    : '';
  const events = actionEvents(world, actor.id).slice(-3);
  el('events').innerHTML = events.length
    ? events
        .map(
          (e) =>
            `<article data-event="${escape(e.id)}"><span class="event-type ${e.success ? '' : 'failure'}">${escape(e.type.replaceAll('-', ' '))}</span><p>${escape(e.description)}</p></article>`,
        )
        .join('')
    : '<p class="muted">No action event for this character.</p>';
  const items = world.stacks.filter(
    (s) => s.owner === actor.id && s.quantity > 0,
  );
  el('details').innerHTML =
    `<h4>Actual inventory</h4><ul>${items.map((s) => `<li>${escape(s.resource)} × ${String(s.quantity)}${s.reservedFor ? ' · reserved' : ''}<small>${escape(s.id)}</small></li>`).join('') || '<li>Empty</li>'}</ul><h4>Individual mastery</h4><p>${actor.mastered.map(escape).join(', ')}</p><p>${actor.learning ? `${escape(actor.learning.ability)} · ${String(actor.learning.remaining)} study rounds remaining` : 'No study in progress.'}</p><h4>Source boundary</h4><p>ex9 · round ${String(world.tick)} · actor ${escape(actor.id)}</p><p>Bookmarks cite original events. Approval and study do not create items. Pending work is drawn only when retained operation state exists.</p>`;
  const bookmark = BOOKMARKS.find((b) => b.tick === world?.tick);
  el('chapter-number').textContent = bookmark
    ? `RECORDED MILESTONE / ${String(bookmark.tick)}`
    : 'FIELD NOTES';
  el('chapter-title').textContent =
    bookmark?.title ?? `Round ${String(world.tick)} · ${actor.name}`;
  el('chapter-copy').textContent =
    bookmark?.text ??
    'Explore this exact saved state, or choose a milestone below. Playback never executes a new world action.';
  document.querySelectorAll<HTMLButtonElement>('[data-tick]').forEach((b) => {
    b.setAttribute(
      'aria-current',
      String(Number(b.dataset.tick) === world?.tick),
    );
  });
  const url = new URL(location.href);
  url.searchParams.set('round', String(world.tick));
  url.searchParams.set('actor', person);
  history.replaceState(null, '', url);
  root?.setAttribute('data-tick', String(world.tick));
  root?.setAttribute('data-actor', person);
}
async function seek(tick: number, animate = false): Promise<void> {
  if (!index || !renderer) return;
  const token = ++sequence;
  busy = true;
  tick = Math.max(0, Math.min(index.observed, Math.trunc(tick)));
  const part = index.segments.find((s) => tick >= s.start && tick <= s.end);
  if (!part) throw new Error('Round is outside the retained index.');
  el('loading').hidden = false;
  el('loading').textContent = `Reading round ${String(tick)}…`;
  try {
    const response = await client.seek(
      {
        url: new URL(`./experiments/ex9/${part.path}`, location.href).href,
        part,
        tick,
      },
      (n) => {
        el('loading').textContent =
          `Verifying saved round ${String(n)} → ${String(tick)}…`;
      },
    );
    if (!response || token !== sequence) return;
    world = response.world;
    renderer.setWorld(world, animate);
    update();
    el('loading').hidden = true;
  } catch (error) {
    if (token === sequence) {
      stop();
      el('loading').textContent =
        error instanceof Error ? error.message : 'Replay failed.';
    }
  } finally {
    if (token === sequence) busy = false;
  }
}
function schedule(): void {
  clearTimeout(timer);
  if (!playing) return;
  timer = setTimeout(
    () => {
      void advance();
    },
    900 / Number((el('speed') as HTMLSelectElement).value),
  );
}
async function advance(): Promise<void> {
  if (!playing || !world || !index) return;
  if (busy) {
    schedule();
    return;
  }
  if (world.tick >= index.observed) {
    stop();
    return;
  }
  await seek(world.tick + 1, true);
  schedule();
}
el('play').addEventListener('click', () => {
  if (playing) stop();
  else {
    playing = true;
    el('play').textContent = 'Pause';
    schedule();
  }
});
el('speed').addEventListener('change', schedule);
for (const [id, delta] of [
  ['previous', -1],
  ['next', 1],
] as const)
  el(id).addEventListener('click', () => {
    stop();
    void seek((world?.tick ?? 0) + delta, true);
  });
slider.addEventListener('input', () => {
  stop();
  void seek(Number(slider.value));
});
document.querySelectorAll<HTMLButtonElement>('[data-tick]').forEach((b) => {
  b.addEventListener('click', () => {
    stop();
    const bookmark = BOOKMARKS.find((v) => v.tick === Number(b.dataset.tick));
    if (bookmark) {
      selectPerson(bookmark.actor);
      if (renderer) renderer.camera.span = 16;
      void seek(bookmark.tick);
    }
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-person]').forEach((b) => {
  b.addEventListener('click', () => {
    selectPerson(b.dataset.person as Person);
  });
});
el('follow').addEventListener('click', () => {
  follow(!renderer?.follow);
});
el('overview').addEventListener('click', () => {
  if (!renderer || !world) return;
  follow(false);
  renderer.camera = {
    x: world.config.width / 2,
    y: world.config.height / 2,
    span: Math.max(
      world.config.width + 3,
      ((world.config.height * canvas.clientWidth) / canvas.clientHeight) *
        0.78 +
        3,
    ),
  };
  renderer.draw();
});
function zoom(factor: number): void {
  if (!renderer) return;
  renderer.camera.span = Math.max(
    7,
    Math.min(64, renderer.camera.span * factor),
  );
  renderer.draw();
}
el('zoom-in').addEventListener('click', () => {
  zoom(0.8);
});
el('zoom-out').addEventListener('click', () => {
  zoom(1.25);
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.12 : 0.89);
  },
  { passive: false },
);
let drag:
  | { x: number; y: number; cameraX: number; cameraY: number; moved: boolean }
  | undefined;
canvas.addEventListener('pointerdown', (e) => {
  if (!renderer) return;
  drag = {
    x: e.clientX,
    y: e.clientY,
    cameraX: renderer.camera.x,
    cameraY: renderer.camera.y,
    moved: false,
  };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || !renderer) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) < 4 && !drag.moved) return;
  drag.moved = true;
  renderer.follow = false;
  renderer.camera.x =
    drag.cameraX - (dx / canvas.clientWidth) * renderer.camera.span;
  renderer.camera.y =
    drag.cameraY - ((dy / canvas.clientWidth) * renderer.camera.span) / 0.78;
  follow(false);
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag || !renderer) return;
  if (!drag.moved) {
    const r = canvas.getBoundingClientRect();
    const picked = renderer.pick(e.clientX - r.left, e.clientY - r.top);
    if (picked) selectPerson(picked);
  }
  drag = undefined;
});
canvas.addEventListener('pointercancel', () => {
  drag = undefined;
});
mini.addEventListener('click', (e) => {
  if (!renderer || !world) return;
  const r = mini.getBoundingClientRect();
  renderer.camera = {
    x: ((e.clientX - r.left) / r.width) * world.config.width,
    y: ((e.clientY - r.top) / r.height) * world.config.height,
    span: 16,
  };
  follow(false);
});
canvas.addEventListener('keydown', (e) => {
  if (!renderer) return;
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const step = steps[e.key];
  if (step) {
    e.preventDefault();
    renderer.camera.x += step[0];
    renderer.camera.y += step[1];
    follow(false);
  } else if (e.key === '+' || e.key === '=') zoom(0.8);
  else if (e.key === '-') zoom(1.25);
});
const resize = new ResizeObserver(() => renderer?.draw());
resize.observe(canvas);
window.addEventListener('pagehide', () => {
  stop();
  renderer?.dispose();
  client.dispose();
  resize.disconnect();
});
try {
  const [art, loaded] = await Promise.all([
    loadArt(),
    fetch('./experiments/ex9/replay.json').then(async (r) => {
      if (!r.ok) throw new Error('EX9 index unavailable.');
      return (await r.json()) as SceneIndex & { version: number };
    }),
  ]);
  if (
    (loaded as { version: number }).version !== 7 ||
    !Array.isArray(loaded.segments)
  )
    throw new Error('Unsupported replay index.');
  index = loaded;
  slider.max = String(index.observed);
  renderer = new ForestRenderer(canvas, mini, art);
  const query = new URL(location.href).searchParams,
    requested = query.get('actor');
  if (requested && requested in PEOPLE) {
    person = requested as Person;
    renderer.selected = person;
  }
  const round = Number(query.get('round') ?? 79);
  await seek(Number.isFinite(round) ? round : 79);
} catch (error) {
  el('loading').textContent =
    error instanceof Error ? error.message : 'Presentation failed.';
}
