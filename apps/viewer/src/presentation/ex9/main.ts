import './style.css';
import type { V7World } from '@self-evolving-world/world-core';
import { forestClimate } from '@self-evolving-world/world-core';
import type { SceneIndex } from '../../continuous-history.js';
import { ReplayClient } from '../../replay-client.js';
import { svgText as escape } from '../../continuous-visuals.js';
import { loadArt } from './assets.js';
import { BOOKMARKS } from './bookmarks.js';
import { FrameBuffer, PlaybackClock } from './playback.js';
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
root.innerHTML = `<main class="game" aria-label="EX9 enhanced replay"><canvas id="forest" aria-label="Enhanced recorded forest" tabindex="0"></canvas>
<header class="masthead glass"><a class="wordmark" href="./">SELF / EVOLVING WORLD</a><span class="preview-label" lang="zh">Ashen 风格回放（预览）</span><span class="provenance" lang="zh">EX9 · 真实实验回放 · 视觉增强</span><a id="original" href="./?experiment=ex9">Original replay ↗</a><button id="fullscreen">Fullscreen</button></header>
<section class="character-hud glass" aria-label="Character HUD"><div class="people" role="group" aria-label="Follow a character">${Object.entries(
  PEOPLE,
)
  .map(
    ([id, color]) =>
      `<button data-person="${id}" style="--person:${color}" aria-pressed="${String(id === 'lin')}">${String(id[0]?.toUpperCase())}${id.slice(1)}</button>`,
  )
  .join(
    '',
  )}</div><div class="brief"><strong id="person-name">Lin</strong><span id="brief-vitals"></span></div><h3 id="action">—</h3><div id="progress"></div><div id="equipment"></div><button id="evidence-toggle" aria-expanded="false" aria-controls="evidence">State & evidence</button></section>
<div class="camera-tools glass"><button id="follow" aria-pressed="true">Follow</button><button id="overview">Full map</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button></div>
<div class="map-hud"><span id="weather"></span><canvas id="minimap" width="192" height="144" aria-label="Click to position the camera" tabindex="0"></canvas></div>
<section class="playback-hud glass" aria-label="Playback controls"><div class="transport"><button id="previous" aria-label="Previous round">‹</button><button id="play">Play</button><button id="next" aria-label="Next round">›</button><span id="round">— / 1200</span><select id="speed" aria-label="Playback speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><button id="bookmarks-toggle" aria-expanded="false" aria-controls="bookmarks-panel">Milestones</button></div><input id="timeline" type="range" min="0" max="1200" value="79" aria-label="Replay round"/><div class="timeline-labels"><span id="phase">Saved boundary</span><span class="gesture-note">Drag to pan · Scroll to zoom · Click a person</span></div></section>
<section id="bookmarks-panel" class="drawer glass" hidden aria-label="Event bookmarks"><button class="close" data-close="bookmarks-panel" aria-label="Close milestones">×</button><div class="chapter"><span class="eyebrow" id="chapter-number">FIELD NOTES</span><h2 id="chapter-title">A shared shelter</h2><p id="chapter-copy"></p></div><div class="bookmarks">${BOOKMARKS.map((b) => `<button data-tick="${String(b.tick)}"><span>${String(b.tick).padStart(3, '0')}</span>${escape(b.title)}</button>`).join('')}</div></section>
<aside id="evidence" class="drawer glass" hidden aria-label="Recorded evidence"><button class="close" data-close="evidence" aria-label="Close evidence">×</button><p class="eyebrow">LAST VERIFIED BOUNDARY</p><p id="location"></p><span id="space"></span><div id="vitals"></div><p id="action-copy"></p><section class="event-card"><p class="eyebrow">EVIDENCE AT THIS ROUND</p><div id="events"></div></section><details class="record-details"><summary>Inventory, learning & source</summary><div id="details"></div></details><p class="footnote">Illustrated appearance; authoritative positions, quantities and results. Fire and rain canopy were never built or used in ex9. Animation never runs the world.</p><footer>Art adapted from <a href="https://github.com/YuxiangLiu-lyx/Ashen">Ashen</a> · <a href="./presentation/ex9/assets/provenance.json">Asset provenance</a> · <a href="./experiments/ex9/replay.json">Replay index</a></footer></aside><div id="loading" role="status">Opening verified ex9 records…</div><div id="cut" aria-hidden="true"></div></main>`;
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
  clock: PlaybackClock | undefined,
  buffer: FrameBuffer | undefined,
  sequence = 0,
  busy = false,
  animation = 0,
  lastFrame = 0,
  redrawUntil = 0;
const trace = new URL(location.href).searchParams.get('trace') === '1';
function wake(): void {
  redrawUntil = performance.now() + 1800;
}
function cut(): void {
  el('cut')
    .getAnimations()
    .forEach((a) => {
      a.cancel();
    });
  el('cut').animate([{ opacity: 0.65 }, { opacity: 0 }], { duration: 180 });
  wake();
}
const client = new ReplayClient(
  new Worker(new URL('../../replay-worker.ts', import.meta.url), {
    type: 'module',
  }),
);
function stop(): void {
  if (clock) clock.playing = false;
  el('play').textContent = 'Play';
  wake();
}
function follow(value: boolean): void {
  if (renderer) renderer.follow = value;
  el('follow').setAttribute('aria-pressed', String(value));
  wake();
}
function selectPerson(id: Person): void {
  person = id;
  if (renderer?.select(id)) cut();
  follow(true);
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
  el('brief-vitals').textContent =
    `Health ${actor.vitals.health.toFixed(0)} · Energy ${actor.vitals.energy.toFixed(0)}`;
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
async function seek(tick: number): Promise<void> {
  if (!index || !renderer || !buffer || !clock) return;
  const token = ++sequence;
  busy = true;
  tick = Math.max(0, Math.min(index.observed, Math.trunc(tick)));
  el('loading').hidden = false;
  el('loading').textContent = `Verifying saved round ${String(tick)}…`;
  try {
    const loaded = await buffer.seek(tick);
    if (!loaded || token !== sequence) return;
    world = loaded;
    clock.seek(tick);
    renderer.setWorld(world, buffer.frames.get(tick + 1), true);
    update();
    cut();
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
function frame(now: number): void {
  const gap = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  // A suspended tab does not accumulate presentation debt or skip visible motion.
  const dt = document.hidden || gap > 250 ? 0 : gap;
  if (clock && buffer && renderer && world && !busy) {
    if (buffer.error) {
      stop();
      el('loading').hidden = false;
      el('loading').textContent =
        `Replay verification stopped: ${buffer.error.message}`;
    } else {
      clock.advance(dt, (tick) => buffer?.frames.has(tick) ?? false);
      const saved = buffer.frames.get(clock.tick);
      if (saved && saved !== world) {
        world = saved;
        update();
        wake();
      }
      buffer.prefetch(clock.tick);
      el('loading').hidden = !clock.buffering;
      if (clock.buffering)
        el('loading').textContent =
          'Buffering verified records — presentation time paused';
    }
    el('play').textContent = clock.playing ? 'Pause' : 'Play';
    el('phase').textContent =
      clock.fraction > 0
        ? `${clock.playing ? 'Playing' : 'Paused'} ${String(clock.tick)} → ${String(clock.tick + 1)} · ${String(Math.floor(clock.fraction * 100))}%`
        : 'Exact saved boundary';
    renderer.setWorld(world, buffer.frames.get(clock.tick + 1));
    if (clock.playing || now < redrawUntil) {
      renderer.render(
        clock.fraction,
        clock.time,
        clock.buffering ? 0 : (dt / 1000) * (clock.playing ? clock.speed : 1),
        clock.playing || clock.fraction > 0,
      );
      if (trace)
        window.dispatchEvent(
          new CustomEvent('ashen-frame', {
            detail: {
              now,
              tick: clock.tick,
              fraction: clock.fraction,
              speed: clock.speed,
              playing: clock.playing,
              buffering: clock.buffering,
              ...renderer.snapshot(),
            },
          }),
        );
    }
  }
  animation = requestAnimationFrame(frame);
}
el('play').addEventListener('click', () => {
  if (!clock || busy || buffer?.error) return;
  if (clock.playing) stop();
  else {
    clock.playing = true;
    wake();
  }
});
el('speed').addEventListener('change', () => {
  if (clock) clock.speed = Number((el('speed') as HTMLSelectElement).value);
});
for (const [id, delta] of [
  ['previous', -1],
  ['next', 1],
] as const)
  el(id).addEventListener('click', () => {
    stop();
    void seek((world?.tick ?? 0) + delta);
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
      if (renderer) renderer.rig.span = 18;
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
  Object.assign(renderer.camera, {
    x: world.config.width / 2,
    y: world.config.height / 2,
    span: Math.max(
      world.config.width + 3,
      ((world.config.height * canvas.clientWidth) / canvas.clientHeight) *
        0.78 +
        3,
    ),
  });
  renderer.rig.span = renderer.camera.span;
  cut();
});
function zoom(factor: number): void {
  if (!renderer) return;
  renderer.rig.span = Math.max(7, Math.min(64, renderer.rig.span * factor));
  wake();
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
  Object.assign(renderer.camera, {
    x: ((e.clientX - r.left) / r.width) * world.config.width,
    y: ((e.clientY - r.top) / r.height) * world.config.height,
    span: 18,
  });
  renderer.rig.span = renderer.camera.span;
  follow(false);
  cut();
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
for (const [button, panel] of [
  ['evidence-toggle', 'evidence'],
  ['bookmarks-toggle', 'bookmarks-panel'],
] as const) {
  const toggle = () => {
    el(panel).hidden = !el(panel).hidden;
    el(button).setAttribute('aria-expanded', String(!el(panel).hidden));
  };
  el(button).addEventListener('click', toggle);
  document
    .querySelector(`[data-close="${panel}"]`)
    ?.addEventListener('click', toggle);
}
el('fullscreen').addEventListener('click', () => {
  const action = document.fullscreenElement
    ? document.exitFullscreen()
    : root.requestFullscreen();
  void action.catch(() => {
    el('fullscreen').textContent = 'Fullscreen unavailable';
  });
});
document.addEventListener('fullscreenchange', () => {
  el('fullscreen').textContent = document.fullscreenElement
    ? 'Exit fullscreen'
    : 'Fullscreen';
  wake();
});
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  wake();
});
const resize = new ResizeObserver(wake);
resize.observe(canvas);
window.addEventListener('pagehide', () => {
  stop();
  cancelAnimationFrame(animation);
  buffer?.dispose();
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
  clock = new PlaybackClock(index.observed);
  buffer = new FrameBuffer(index.observed, async (tick) => {
    const part = index?.segments.find((s) => tick >= s.start && tick <= s.end);
    if (!part) throw new Error('Round is outside the retained index.');
    return (
      (
        await client.seek(
          {
            url: new URL(`./experiments/ex9/${part.path}`, location.href).href,
            part,
            tick,
          },
          () => undefined,
        )
      )?.world ?? null
    );
  });
  animation = requestAnimationFrame(frame);
  const query = new URL(location.href).searchParams,
    requested = query.get('actor');
  if (requested && Object.hasOwn(PEOPLE, requested)) {
    person = requested as Person;
    renderer.selected = person;
  }
  const round = Number(query.get('round') ?? 79);
  await seek(Number.isFinite(round) ? round : 79);
} catch (error) {
  el('loading').textContent =
    error instanceof Error ? error.message : 'Presentation failed.';
}
