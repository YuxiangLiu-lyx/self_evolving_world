import { appendToolAssessment } from './collective-tool-assessment-view.js';
import { appendTrayClearance } from './collective-tray-clearance-view.js';
import { appendSmallDrying } from './collective-small-drying-view.js';
import { appendSurfaceDiagnostics } from './collective-surface-diagnostics-view.js';
import { appendInventoryInspection } from './collective-inventory-view.js';
import { appendMaterialLots } from './collective-material-view.js';
import { collectiveMemberText } from './collective-view.js';
import { renderExtraction } from './open-extraction-view.js';
import { forestClimate } from '@self-evolving-world/world-core';
import { drawForestCanvas } from './forest-canvas.js';
import {
  cameraRect,
  fitCamera,
  minimapPoint,
  wideMap,
  zoomLimit,
} from './observatory-camera.js';
import type { V7Cursor } from '@self-evolving-world/world-core';
import {
  continuousScene,
  historicalScene,
  sceneSvg,
  sceneHitSvg,
  sceneMinimapSvg,
} from './continuous-scene.js';
import type { SceneFrame } from './continuous-scene.js';
import { svgText } from './continuous-visuals.js';
import type { SceneIndex } from './continuous-history.js';
import { ReplayClient } from './replay-client.js';
import { replayPlayback } from './replay-playback.js';
import { parseReplay } from './timeline.js';
import type { Timeline } from './timeline.js';
import './observatory.css';

const root = document.getElementById('observatory');
if (!root) throw new Error('Missing observatory root.');
root.innerHTML = `<header class="obs-header"><div class="brand"><div class="brand-mark" aria-hidden="true">♧</div><div><div class="eyebrow">Self-evolving world</div><h1>World Observatory</h1><p>A living record of choices and consequences</p></div></div><div class="header-controls"><a id="ashen-link" href="./ashen.html">Ashen-style replay (preview) ↗</a><a id="classic-link" href="./classic.html">Classic inspector ↗</a><select id="archive" aria-label="Saved experiment"></select></div></header><main class="obs-layout"><section class="world-column"><div class="world-toolbar"><div><div class="eyebrow" id="world-label">Loading archive</div><h2 id="world-title">Life, at its own pace</h2></div><div class="mode-controls"><button id="global" aria-pressed="true">Whole world</button><button id="private" aria-pressed="false">Personal view</button></div></div><div class="world-stage"><canvas id="forest-scene" aria-label="Recorded forest canvas" hidden></canvas><svg class="world-canvas" id="scene" role="img" aria-label="Recorded world scene" viewBox="0 0 24 24"></svg><div class="stage-tag" id="stage-tag">READ-ONLY OBSERVATION</div><div class="camera-tools"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit</button><button id="follow" aria-pressed="false">Follow</button><button id="geometry" aria-pressed="false">Geometry</button></div><svg id="minimap" class="minimap" role="img" aria-label="World minimap"></svg><div class="stage-caption" id="spatial-caption">Drag to pan · Scroll to zoom · Select a character</div></div><div class="timeline-card"><div class="playback"><button id="previous" aria-label="Previous round">‹</button><button id="play">Play</button><button id="next" aria-label="Next round">›</button><input id="time" type="range" min="0" max="0" value="0" aria-label="Observation round"/><span class="round-value" id="round">0 / 0</span><button id="compare" aria-pressed="false">Before</button></div><p class="timeline-note" id="timeline-note">Playback reads saved state; it never advances the experiment.</p></div><div class="events-head"><h3>What happened here</h3><span class="badge" id="event-count">0 events</span></div><div class="event-list" id="events"></div></section><aside class="obs-aside"><section class="observer-card"><div class="eyebrow">Individual perspective</div><div class="actor-heading"><h3 id="actor-name">—</h3><select id="actor" aria-label="Observed actor"></select></div><div class="coordinates" id="coordinates"></div><div class="vitals" id="vitals"></div><div class="eyebrow inventory-heading">Carried items</div><div id="carried" class="carried-items"></div></section><section class="observer-card"><div class="eyebrow">Experienced wellbeing</div><h3>How life feels</h3><div class="wellbeing-number" id="happiness">—</div><div class="wellbeing-split"><div id="body-bar" class="wellbeing-body"></div><div id="mind-bar" class="wellbeing-mind"></div></div><div class="small-label" id="happiness-split">Physical comfort + other satisfaction</div><div id="sources"></div></section><section class="observer-card"><div class="eyebrow">Personal continuity</div><h3>Intent & memory</h3><p id="task">No saved task.</p><ul class="memory-list" id="memory"></ul><p id="learning"></p><details><summary>Questions, projects & knowledge</summary><ul class="memory-list" id="projects"></ul><ul class="memory-list" id="knowledge"></ul></details><details><summary>Important experience</summary><ul class="memory-list" id="important"></ul></details><details><summary>Past wildlife sightings</summary><ul class="memory-list" id="sightings"></ul></details><details><summary>Route inspection evidence</summary><p id="route-evidence"></p></details><details><summary>Food assessment evidence</summary><ul class="memory-list" id="assessments"></ul></details><details><summary>Recent experience</summary><ul class="memory-list" id="experiences"></ul></details></section><section class="observer-card"><div class="eyebrow">World state</div><h3 id="object-title">A closer look</h3><p id="object-description">Select a visible object to inspect its actual geometry, state and provenance.</p><pre class="object-state" id="object-state"></pre></section></aside></main><div id="status" class="obs-status" role="status">Loading recorded evidence…</div>`;
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing observatory element: ${id}`);
  return e;
}
const collectivePanel = document.createElement('pre');
collectivePanel.id = 'collective-member';
collectivePanel.className = 'object-state';
collectivePanel.hidden = true;
el('learning').after(collectivePanel);
const trialPanel = document.createElement('div');
trialPanel.id = 'trial-diagnostic';
el('object-state').before(trialPanel);
function select(id: string): HTMLSelectElement {
  return el(id) as HTMLSelectElement;
}
const scene = document.getElementById('scene') as unknown as SVGSVGElement;
const forestCanvas = document.getElementById(
  'forest-scene',
) as HTMLCanvasElement;
let priorFrame: SceneFrame | undefined,
  animation = 0;
const mini = document.getElementById('minimap') as unknown as SVGSVGElement;
const slider = el('time') as HTMLInputElement;
let id = '',
  index: SceneIndex | null = null,
  legacy: Timeline | null = null,
  tick = 0,
  maximum = 0,
  actor = 'lin',
  privateView = false,
  frame: SceneFrame | null = null,
  tasks: Record<string, V7Cursor> = {},
  sequence = 0,
  follow = false,
  geometry = false,
  compare = false;
let camera = { x: 0, y: 0, size: 24 };
let replay: ReplayClient | undefined;
const playback = replayPlayback(
  async () => {
    if (tick >= maximum) return false;
    await seek(tick + 1);
    return tick < maximum;
  },
  (playing) => {
    el('play').textContent = playing ? 'Pause' : 'Play';
  },
);
function status(text: string, error = false): void {
  el('status').textContent = text;
  el('status').classList.toggle('error', error);
}
async function asset(path: string): Promise<string> {
  const response = await fetch(`./experiments/${id}/${path}`, {
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(`Archive unavailable (${String(response.status)}).`);
  return response.text();
}
const mapExtent = () => ({
  width: frame?.width ?? 24,
  height: frame?.height ?? 24,
});
const stageExtent = () => ({
  width: scene.clientWidth,
  height: scene.clientHeight,
});
function updateCamera(): void {
  if (frame?.continuous?.config.forest)
    drawForestCanvas(forestCanvas, frame, actor, camera, geometry);
  scene.setAttribute(
    'viewBox',
    `${String(camera.x)} ${String(camera.y)} ${String(camera.size)} ${String(camera.size)}`,
  );
  const rect = cameraRect(camera, mapExtent(), stageExtent());
  mini.querySelector('[data-camera]')?.setAttribute('x', String(rect.x));
  mini.querySelector('[data-camera]')?.setAttribute('y', String(rect.y));
  mini.querySelector('[data-camera]')?.setAttribute('width', String(rect.size));
  mini
    .querySelector('[data-camera]')
    ?.setAttribute('height', String(rect.height));
}
function focus(x: number, y: number): void {
  camera.x = x - camera.size / 2;
  camera.y = y - camera.size / 2;
  updateCamera();
}
function render(): void {
  renderTrialDiagnostic(trialPanel);
  if (!frame) return;
  const current = frame,
    self = frame.actors.find((a) => a.id === actor);
  const isForest = !!current.continuous?.config.forest;
  forestCanvas.hidden = !isForest;
  scene.classList.toggle('forest-hit-regions', isForest);
  scene.innerHTML = isForest
    ? sceneHitSvg(current)
    : sceneSvg(current, actor, geometry);
  if (isForest) {
    cancelAnimationFrame(animation);
    const started = performance.now();
    const animate = (now: number): void => {
      // A queued frame timestamp can precede synchronous replay reconstruction.
      const progress = Math.max(0, Math.min(1, (now - started) / 300));
      drawForestCanvas(
        forestCanvas,
        current,
        actor,
        camera,
        geometry,
        progress,
        priorFrame,
      );
      if (progress < 1) animation = requestAnimationFrame(animate);
    };
    animation = requestAnimationFrame(animate);
  }
  mini.innerHTML =
    (isForest ? sceneMinimapSvg(current) : sceneSvg(current, '', false)) +
    `<rect data-camera x="${String(camera.x)}" y="${String(camera.y)}" width="${String(camera.size)}" height="${String(camera.size)}" fill="none" stroke="#fff5cc" stroke-width=".3"/>`;
  mini.setAttribute(
    'viewBox',
    `0 0 ${String(frame.width)} ${String(frame.height)}`,
  );
  // A wide map gets a minimap of its own proportions; every other map keeps the square.
  mini.classList.toggle('wide', wideMap(frame));
  mini.style.setProperty(
    '--map-aspect',
    `${String(frame.width)} / ${String(frame.height)}`,
  );
  if (follow && self) focus(self.position.x, self.position.y);
  else updateCamera();
  el('round').textContent = `${String(frame.tick)} / ${String(maximum)}`;
  slider.value = String(tick);
  el('stage-tag').textContent =
    `${id.toUpperCase()} · ROUND ${frame.tick.toString().padStart(4, '0')} · ${privateView ? 'PERSONAL OBSERVATION' : 'GLOBAL VIEW'}`;
  el('spatial-caption').textContent = frame.legacy
    ? 'Historical grid simulation · Exact recorded positions · New presentation only'
    : 'Continuous coordinates · Fixed simulation time · Drag to pan';
  el('world-label').textContent =
    `${id} / ${frame.legacy ? 'Historical archive' : 'Continuous world'}`;
  if (current.continuous?.config.forest && self) {
    const climate = forestClimate(current.continuous, self.position);
    el('world-label').textContent =
      `${id} / ${climate.season} · ${climate.temperature.toFixed(1)}° · ${climate.trend}${climate.local ? ` · ${climate.local.regime}` : ''}`;
  }
  const allActors =
    current.continuous?.actors ??
    legacy?.frames[frame.tick]?.agents ??
    current.actors;
  select('actor').innerHTML = allActors
    .map((a) => `<option value="${svgText(a.id)}">${svgText(a.name)}</option>`)
    .join('');
  select('actor').value = actor;
  if (self) {
    el('actor-name').textContent = self.name;
    collectivePanel.hidden = !self.collective;
    collectivePanel.textContent = current.continuous
      ? collectiveMemberText(self, current.continuous, privateView)
      : '';

    el('coordinates').textContent =
      `Position ${self.position.x.toFixed(3)} · ${self.position.y.toFixed(3)}${self.vitals.health <= 0 ? ' · Deceased' : ''}${self.life ? ` · Lives ${String(self.life.total - self.life.deaths)} / ${String(self.life.total)}` : ''}`;
    el('vitals').innerHTML = [
      ['Health', self.vitals.health, 100],
      ['Satiety', self.vitals.satiety, 100],
      ['Energy', self.vitals.energy, 40],
      ['Temperature', self.vitals.temperature, 40],
    ]
      .map(([label, value, cap]) => {
        const historical = legacy?.frames[current.tick];
        const measured =
          !current.legacy ||
          (label !== 'Temperature' &&
            (label === 'Energy'
              ? !!historical?.coevolution
              : !!(
                  historical?.coevolution ??
                  historical?.evolution ??
                  historical?.learning ??
                  historical?.survival
                )));
        return `<div><div class="vital-label"><span>${String(label)}</span><strong>${measured ? Number(value).toFixed(1) + (label === 'Temperature' ? '°' : '') : '—'}</strong></div><div class="vital-track"><div class="vital-fill" style="width:${String(measured ? Math.max(0, Math.min(100, (Number(value) / Number(cap)) * 100)) : 0)}%"></div></div></div>`;
      })
      .join('');
    const inventory = current.continuous
      ? current.continuous.stacks
          .filter((s) => s.owner === actor)
          .map(
            (s) =>
              `${String(s.quantity)} ${current.continuous?.resources.find((r) => r.id === s.resource)?.name ?? s.resource}${s.processing ? ` · ${s.id} · source ${s.origin} · moisture ${(100 * (s.fuelMoisture ?? 0)).toFixed(0)}%` : ''}${s.processing?.foodExamination ? ' · opened sample; food safety remains unknown' : ''}${s.mantle ? ` · ${s.id} · ${s.mantle.equipped ? 'worn' : 'unequipped'} · condition ${String(s.mantle.condition)}/160 · moisture ${(100 * s.mantle.moisture).toFixed(0)}%` : ''}`,
          )
      : (legacy?.frames[frame.tick]?.agents
          .find((a) => a.id === actor)
          ?.inventory.map((i) => i.name) ?? []);
    el('carried').textContent = inventory.length
      ? inventory.join(' · ')
      : 'Nothing carried';
    if (current.continuous)
      appendMaterialLots(
        el('carried'),
        current.continuous.stacks.filter((s) => s.owner === actor),
      );
    if (current.continuous) {
      const member = current.continuous.actors.find((a) => a.id === actor);
      if (member) {
        appendInventoryInspection(el('carried'), current.continuous, member);
        appendSurfaceDiagnostics(el('carried'), member);
        appendTrayClearance(el('carried'), member);
        appendToolAssessment(el('carried'), member);
        appendSmallDrying(el('carried'), current.continuous, member);
      }
    }
    el('projects').innerHTML = Object.values(self.memory.projects ?? {})
      .map(
        (p) =>
          `<li><strong>${svgText(p.id)} · ${svgText(p.status)}</strong> ${svgText(p.question)}<br/>Goal: ${svgText(p.goal)}<br/>Evidence: ${svgText(p.evidence.join(', '))}<br/>Progress: ${svgText(p.completedSteps.join('; '))}<br/>Outputs: ${svgText(p.outputs.join('; '))}<br/>Uncertain: ${svgText(p.uncertainty)}<br/>Missing: ${svgText(p.missing)}<br/>Next: ${svgText(p.next)}<br/>Pause: ${svgText(p.pauseReason)}<br/>Claimed benefit: ${svgText(p.benefit)}</li>`,
      )
      .join('');
    el('knowledge').innerHTML = Object.values(self.memory.knowledge ?? {})
      .map(
        (k) =>
          `<li>${svgText(k.subject)} · ${svgText(k.property)} · ${k.verified ? 'Personally tested' : 'Observed or received claim'}<br/>${svgText(JSON.stringify(k.value))}<br/>Evidence: ${svgText(k.evidence)}</li>`,
      )
      .join('');
    el('important').innerHTML = (self.memory.important ?? [])
      .slice(-8)
      .map((e) => `<li>Round ${String(e.tick)} · ${svgText(e.summary)}</li>`)
      .join('');
    const sightings = self.extensionState['wildlife:sightings'];
    el('sightings').innerHTML = Array.isArray(sightings)
      ? sightings
          .slice(-4)
          .map((s) => `<li>Past sighting · ${svgText(JSON.stringify(s))}</li>`)
          .join('')
      : '';
    const evidenceText = (value: unknown): string =>
      svgText(
        typeof value === 'string'
          ? value
          : typeof value === 'number'
            ? String(value)
            : 'Unknown',
      );
    const assessments = self.extensionState['food-assessment:records'];
    el('assessments').innerHTML = Array.isArray(assessments)
      ? assessments
          .slice(-4)
          .map((record) => {
            if (!record || typeof record !== 'object' || Array.isArray(record))
              return '';
            const sensory = record.sensory;
            const details =
              sensory && typeof sensory === 'object' && !Array.isArray(sensory)
                ? [
                    sensory.appearance,
                    sensory.texture,
                    sensory.odor,
                    sensory.deterioration,
                  ]
                    .filter((value) => typeof value === 'string')
                    .join(' ')
                : '';
            return `<li>Rounds ${evidenceText(record.startTick)}–${evidenceText(record.endTick)} · ${evidenceText(record.resource)} · ${evidenceText(record.status)}. ${svgText(details)} Intake: ${record.ingested ? evidenceText(record.fraction) : '0'} units; observed nourishment ${evidenceText(record.nourishment)}. ${record.adverse ? 'Adverse evidence recorded.' : 'No adverse evidence recorded in this window.'} ${record.confounding ? 'Other food intake confounds this record.' : ''} ${evidenceText(record.uncertainty)}</li>`;
          })
          .join('')
      : '';
    const routeEvidence = self.extensionState['route:lastInspection'];
    el('route-evidence').textContent =
      routeEvidence &&
      typeof routeEvidence === 'object' &&
      !Array.isArray(routeEvidence)
        ? `Round ${String(Number(routeEvidence.tick))}: ${typeof routeEvidence.status === 'string' ? routeEvidence.status : 'unknown'} / ${typeof routeEvidence.reasonCode === 'string' ? routeEvidence.reasonCode : 'unknown'}. Observed blockers: ${Array.isArray(routeEvidence.observedBlockers) ? routeEvidence.observedBlockers.filter((x) => typeof x === 'string').join(', ') || 'none established' : 'unknown'}. Dated evidence; current occupancy must be checked again.`
        : 'No personal route inspection recorded.';
    el('experiences').innerHTML = self.memory.experiences
      .slice(-5)
      .map((e) => `<li>Round ${String(e.tick)} · ${svgText(e.summary)}</li>`)
      .join('');
    el('happiness').innerHTML = frame.legacy
      ? '— <small>not measured</small>'
      : `${self.wellbeing.total.toFixed(1)} <small>/ 100</small>`;
    el('body-bar').style.width = `${String(self.wellbeing.physical)}%`;
    el('mind-bar').style.width = `${String(self.wellbeing.mental)}%`;
    el('happiness-split').textContent = frame.legacy
      ? 'This historical protocol did not measure happiness.'
      : `${self.wellbeing.physical.toFixed(1)} physical / 10 · ${self.wellbeing.mental.toFixed(1)} other / 90`;
    if (self.experience)
      el('happiness-split').textContent +=
        ` · Sustained mood ${self.experience.mental.toFixed(2)} · Meal pleasure ${self.experience.pleasure.toFixed(2)} · Diet monotony ${(100 * self.experience.monotony).toFixed(0)}%`;
    el('sources').innerHTML =
      self.wellbeing.sources
        .filter((s) => s.value > 0)
        .map(
          (s) =>
            `<div class="source-row"><span>${svgText(current.continuous?.satisfaction.find((r) => r.id === s.source)?.name ?? s.source)}</span><strong>${s.value.toFixed(1)}</strong></div>`,
        )
        .join('') +
        (self.experience && self.experience.pleasure > 0
          ? `<div class="source-row"><span>Meal pleasure</span><strong>${self.experience.pleasure.toFixed(1)}</strong></div>`
          : '') ||
      (frame.legacy ? '' : '<p>No active nonphysical satisfaction source.</p>');
    const task = tasks[actor];
    el('task').textContent = task
      ? `${task.plan.intention || 'Self-selected sequence'} · Step ${String(task.step + 1)}, cycle ${String(task.cycle + 1)}${task.reason ? ` · ${task.reason}` : ''}`
      : frame.legacy
        ? 'Historical decisions remain available in the classic inspector.'
        : 'No active saved task at this boundary.';
    if (task?.operation)
      el('task').textContent +=
        ` · Operation ${String(task.operation.elapsed)} rounds performed, ${task.operation.remaining === null ? 'remaining work unknown' : `${String(task.operation.remaining)} remaining`}`;
    el('memory').innerHTML = [...self.memory.notes, ...self.memory.preferences]
      .map((s) => `<li>${svgText(s)}</li>`)
      .join('');
    el('learning').textContent = self.learning
      ? `Studying ${self.learning.ability} · ${String(self.learning.remaining)} rounds remain.`
      : frame.legacy
        ? 'No continuous-world state has been inferred for this archive.'
        : `${String(self.mastered.length)} mastered interfaces · ${String(self.memory.objects.length)} dated object memories`;
  }
  const events = frame.events
    .filter(
      (e) =>
        (e.type !== 'satisfaction' || e.actor === actor) &&
        !(
          frame?.continuous?.config.forest &&
          (e.type === 'waited' ||
            (e.type === 'rested' && e.data.recovered === 0))
        ),
    )
    .sort((a, b) => {
      const important = (type: string) =>
        ['died', 'respawned', 'injured', 'satisfaction', 'mastered'].includes(
          type,
        );
      return Number(important(b.type)) - Number(important(a.type));
    });
  el('event-count').textContent = `${String(events.length)} events`;
  el('events').innerHTML =
    events
      .slice(0, 18)
      .map(
        (e, i) =>
          `<button class="event-entry ${e.success ? '' : 'failed'}" data-event="${String(i)}"><small>${svgText(e.actor ?? 'WORLD')} · ${svgText(e.type)}</small>${svgText(e.description)}</button>`,
      )
      .join('') ||
    '<p class="timeline-note">The saved world has no events at this boundary.</p>';
  el('events')
    .querySelectorAll<HTMLButtonElement>('[data-event]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const event = events[Number(button.dataset.event)];
        if (event?.position) {
          camera.size = Math.min(camera.size, 10);
          focus(event.position.x, event.position.y);
        }
        if (event?.type.startsWith('extraction-')) {
          el('object-title').textContent = 'Extraction evidence';
          el('object-description').textContent = event.description;
          el('object-state').textContent = JSON.stringify(event.data, null, 2);
          renderExtraction(trialPanel, event.data);
        } else if (
          event &&
          [
            'shelter-reference-diagnostic',
            'shelter-inspected',
            'short-refuge-trial-diagnosed',
          ].includes(event.type)
        ) {
          el('object-title').textContent = 'Material inspection evidence';
          el('object-description').textContent = event.description;
          el('object-state').textContent = JSON.stringify(event.data, null, 2);
          renderTrialDiagnostic(
            trialPanel,
            event.type === 'short-refuge-trial-diagnosed'
              ? event.data
              : undefined,
          );
        } else if (event?.target) inspect(event.target);
      });
    });
  scene.querySelectorAll<SVGGElement>('[data-scene-actor]').forEach((g) => {
    g.addEventListener('click', () => {
      if (privateView) return;
      actor = g.dataset.sceneActor ?? actor;
      perspective();
    });
  });
  scene.querySelectorAll<SVGGElement>('[data-scene-object]').forEach((g) => {
    const run = () => {
      inspect(g.dataset.sceneObject ?? '');
    };
    g.addEventListener('click', run);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run();
    });
  });
}
/** Perspective is a projection of the displayed, already verified world. It
 * must not wait behind a seek or briefly show a different visibility mode. */
function perspective(): void {
  if (!frame) return;
  if (frame.continuous)
    frame = continuousScene(frame.continuous, privateView ? actor : null);
  else {
    const world = legacy?.frames[frame.tick];
    if (!world) return;
    frame = historicalScene(world, privateView ? actor : null);
  }
  priorFrame = undefined;
  render();
}
function inspect(objectId: string): void {
  renderTrialDiagnostic(trialPanel);
  const object = frame?.objects.find((o) => o.id === objectId);
  if (!object) return;
  el('object-title').textContent = object.name;
  el('object-description').textContent =
    `${object.id} · ${object.visual.state} · ${object.createdBy ? `Created by ${object.createdBy} at round ${String(object.createdAt)}` : 'Initial world object'}`;
  el('object-state').textContent = JSON.stringify(
    { geometry: object.spatial, state: object.data, revision: object.revision },
    null,
    2,
  );
}
async function seek(requested: number): Promise<void> {
  const token = ++sequence;
  tick = Math.max(0, Math.min(maximum, requested));
  const at = compare ? Math.max(0, tick - 1) : tick;
  try {
    if (legacy) {
      const world = legacy.frames[at];
      if (!world) throw new Error('Missing historical frame.');
      if (!world.agents.some((a) => a.id === actor))
        actor = world.agents[0]?.id ?? '';
      frame = historicalScene(world, privateView ? actor : null);
      tasks = {};
    } else if (index) {
      const part = index.segments.find((p) => p.start <= at && p.end >= at);
      if (!part) throw new Error('Missing indexed segment.');
      if (!replay) throw new Error('Replay worker is unavailable.');
      status(`Verifying saved state through round ${String(at)}…`);
      const value = await replay.seek(
        {
          url: new URL(`./experiments/${id}/${part.path}`, location.href).href,
          part,
          tick: at,
        },
        (verified) => {
          if (token === sequence)
            status(
              `Verifying saved state: ${String(verified)} / ${String(at)} rounds…`,
            );
        },
      );
      if (token !== sequence || !value) return;
      priorFrame = frame ?? undefined;
      if (!value.world.actors.some((a) => a.id === actor))
        actor = value.world.actors[0]?.id ?? '';
      frame = continuousScene(value.world, privateView ? actor : null);
      tasks = value.tasks;
    }
    if (token !== sequence) return;
    render();
    status(
      `${id} · Verified recorded state · ${index ? `${String(index.observed)} observed / ${String(index.target)} target rounds · ${index.phase}` : 'Historical simulation rules preserved'}`,
    );
  } catch (error) {
    if (token !== sequence) return;
    stop();
    status(error instanceof Error ? error.message : 'Replay failed.', true);
  }
}
function stop(): void {
  playback.stop();
}
async function open(
  experiment: string,
  initialRound = 0,
  initialActor = 'lin',
): Promise<void> {
  stop();
  const token = ++sequence;
  id = experiment;
  replay?.dispose();
  replay = undefined;
  cancelAnimationFrame(animation);
  priorFrame = undefined;
  legacy = null;
  index = null;
  actor = initialActor;
  compare = false;
  el('compare').setAttribute('aria-pressed', 'false');
  el('compare').textContent = 'Before';
  try {
    const source = await asset('replay.json'),
      data = JSON.parse(source) as { version: number };
    if (token !== sequence) return;
    if (data.version === 7) {
      index = data as SceneIndex;
      replay = new ReplayClient(
        new Worker(new URL('./replay-worker.ts', import.meta.url), {
          type: 'module',
        }),
      );
      maximum = index.observed;
      camera = { x: 0, y: 0, size: 24 };
    } else {
      legacy = parseReplay(source);
      maximum = legacy.frames.length - 1;
      camera = {
        x: 0,
        y: 0,
        size: Math.max(
          legacy.frames[0]?.settings.width ?? 24,
          legacy.frames[0]?.settings.height ?? 24,
        ),
      };
    }
    slider.max = String(maximum);
    select('archive').value = id;
    (el('classic-link') as HTMLAnchorElement).href = legacy
      ? `./classic.html?experiment=${encodeURIComponent(id)}`
      : './classic.html';
    const url = new URL(location.href);
    url.searchParams.set('experiment', id);
    if (url.searchParams.has('round'))
      url.searchParams.set(
        'round',
        String(Math.max(0, Math.min(maximum, Math.trunc(initialRound)))),
      );
    if (url.searchParams.has('actor'))
      url.searchParams.set('actor', initialActor);
    history.replaceState(null, '', url);
    await seek(Math.max(0, Math.min(maximum, Math.trunc(initialRound))));
  } catch (error) {
    if (token !== sequence) return;
    status(error instanceof Error ? error.message : 'Archive failed.', true);
  }
}
select('archive').addEventListener('change', () => {
  void open(select('archive').value);
});
select('actor').addEventListener('change', () => {
  actor = select('actor').value;
  perspective();
});
slider.addEventListener('input', () => {
  stop();
  void seek(Number(slider.value));
});
el('previous').addEventListener('click', () => {
  stop();
  void seek(tick - 1);
});
el('next').addEventListener('click', () => {
  stop();
  void seek(tick + 1);
});
el('play').addEventListener('click', () => {
  if (playback.playing) stop();
  else playback.start();
});
for (const [key, value] of [
  ['global', false],
  ['private', true],
] as const)
  el(key).addEventListener('click', () => {
    privateView = value;
    el('private').setAttribute('aria-pressed', String(value));
    el('global').setAttribute('aria-pressed', String(!value));
    perspective();
  });
el('follow').addEventListener('click', () => {
  follow = !follow;
  el('follow').setAttribute('aria-pressed', String(follow));
  render();
});
el('geometry').addEventListener('click', () => {
  geometry = !geometry;
  el('geometry').setAttribute('aria-pressed', String(geometry));
  render();
});
el('compare').addEventListener('click', () => {
  compare = !compare;
  el('compare').setAttribute('aria-pressed', String(compare));
  el('compare').textContent = compare ? 'After' : 'Before';
  void seek(tick);
});
function zoom(scale: number): void {
  const center = {
    x: camera.x + camera.size / 2,
    y: camera.y + camera.size / 2,
  };
  camera.size = Math.max(
    3,
    Math.min(zoomLimit(mapExtent()), camera.size * scale),
  );
  focus(center.x, center.y);
}
el('zoom-in').addEventListener('click', () => {
  zoom(0.75);
});
el('zoom-out').addEventListener('click', () => {
  zoom(1.33);
});
el('fit').addEventListener('click', () => {
  camera = fitCamera(mapExtent(), stageExtent());
  follow = false;
  el('follow').setAttribute('aria-pressed', 'false');
  updateCamera();
});
scene.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.1 : 0.9);
  },
  { passive: false },
);
let drag: { x: number; y: number; cameraX: number; cameraY: number } | null =
  null;
scene.addEventListener('pointerdown', (e) => {
  if ((e.target as Element).closest('[data-scene-actor],[data-scene-object]'))
    return;
  drag = { x: e.clientX, y: e.clientY, cameraX: camera.x, cameraY: camera.y };
  scene.setPointerCapture(e.pointerId);
});
scene.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const size = Math.min(scene.clientWidth, scene.clientHeight);
  camera.x = drag.cameraX - ((e.clientX - drag.x) / size) * camera.size;
  camera.y = drag.cameraY - ((e.clientY - drag.y) / size) * camera.size;
  follow = false;
  updateCamera();
});
scene.addEventListener('pointerup', () => {
  drag = null;
});
mini.addEventListener('click', (e) => {
  camera.size = Math.min(camera.size, 12);
  const point = minimapPoint(
    { x: e.clientX, y: e.clientY },
    mini.getBoundingClientRect(),
    mapExtent(),
  );
  focus(point.x, point.y);
});
try {
  const response = await fetch('./experiments/index.json', {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Experiment catalogue unavailable.');
  const catalogue = (await response.json()) as {
    experiments: { id: string; steps: number }[];
  };
  select('archive').innerHTML = [...catalogue.experiments]
    .reverse()
    .map(
      (e) =>
        `<option value="${svgText(e.id)}">${svgText(e.id.toUpperCase())} · ${String(e.steps)} rounds</option>`,
    )
    .join('');
  const requested =
    new URL(location.href).searchParams.get('experiment') ??
    catalogue.experiments.at(-1)?.id;
  if (requested) {
    const query = new URL(location.href).searchParams;
    const round = Number(query.get('round') ?? 0);
    await open(
      requested,
      Number.isFinite(round) ? round : 0,
      query.get('actor') ?? 'lin',
    );
  } else status('No saved experiment is available.');
} catch (error) {
  status(error instanceof Error ? error.message : 'Catalogue failed.', true);
}

window.addEventListener('resize', updateCamera);

window.addEventListener('forest-visual-ready', updateCamera);
import { renderTrialDiagnostic } from './open-trial-diagnostic-view.js';
