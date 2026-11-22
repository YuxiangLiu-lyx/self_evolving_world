import { appendToolAssessment } from './collective-tool-assessment-view.js';
import { appendTrayClearance } from './collective-tray-clearance-view.js';
import { appendSmallDrying } from './collective-small-drying-view.js';
import { appendSurfaceDiagnostics } from './collective-surface-diagnostics-view.js';
import { appendInventoryInspection } from './collective-inventory-view.js';
import { appendMaterialLots } from './collective-material-view.js';
import { renderExtraction } from './open-extraction-view.js';
import { collectiveMemberText } from './collective-view.js';
import { v7AssertWorld, forestClimate } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { continuousScene } from './continuous-scene.js';
import { drawForestCanvas } from './forest-canvas.js';
import './observatory.css';
import { renderTrialDiagnostic } from './open-trial-diagnostic-view.js';

const root = document.getElementById('forest-lab');
if (!root) throw new Error('Missing isolated inspection surface.');
root.innerHTML =
  '<header class="obs-header"><div><div class="eyebrow">Isolated validation · no model behavior</div><h1>Forest mechanism inspection</h1></div><a href="/">Experiment observatory ↗</a></header><main class="obs-layout"><section><p>Load an isolated fixture recording. These scenes are authored tests, never autonomous discoveries.</p><input type="file" id="fixture-file" accept="application/json" aria-label="Isolated fixture file"/><div class="world-stage"><canvas id="fixture-canvas" class="world-canvas" aria-label="Isolated forest scene"></canvas><div class="stage-tag">ISOLATED TEST · NO MODEL CALLS</div></div><div class="timeline-card"><label>Frame <input id="fixture-time" type="range" min="0" max="0" value="0"/></label><button id="fixture-zoom-in">Zoom in</button><button id="fixture-zoom-out">Zoom out</button><button id="fixture-geometry">Geometry</button></div></section><aside class="observer-card"><h2 id="fixture-title">No fixture loaded</h2><label>Actor <select id="fixture-actor"></select></label><p id="fixture-environment"></p><p id="fixture-state"></p><p id="fixture-happiness"></p><p id="fixture-diagnostic" hidden></p><div id="fixture-events"></div></aside></main>';
const canvas = document.getElementById('fixture-canvas') as HTMLCanvasElement,
  slider = document.getElementById('fixture-time') as HTMLInputElement,
  actors = document.getElementById('fixture-actor') as HTMLSelectElement;
let frames: V7World[] = [],
  selected = '',
  geometry = false,
  size = 12;
const trialPanel = document.createElement('div');
const collectivePanel = document.createElement('pre');
collectivePanel.id = 'fixture-collective';
collectivePanel.className = 'object-state';
collectivePanel.hidden = true;
document.getElementById('fixture-events')?.before(collectivePanel);
trialPanel.id = 'fixture-trial-diagnostic';
document.getElementById('fixture-events')?.before(trialPanel);
const extractionPanel = document.createElement('div');
extractionPanel.id = 'fixture-extraction';
trialPanel.after(extractionPanel);
function text(id: string, value: string) {
  const e = document.getElementById(id);
  if (e) e.textContent = value;
}
function render() {
  const w = frames[Number(slider.value)];
  if (!w) return;
  const a = w.actors.find((a) => a.id === selected);
  if (!a) return;
  collectivePanel.hidden = !a.collective;
  collectivePanel.textContent = collectiveMemberText(a, w, false);
  drawForestCanvas(
    canvas,
    continuousScene(w, null),
    selected,
    { x: a.position.x - size / 2, y: a.position.y - size / 2, size },
    geometry,
  );
  const climate = forestClimate(w, a.position);
  text(
    'fixture-title',
    `Isolated frame ${slider.value} · Round ${String(w.tick)}`,
  );
  text(
    'fixture-environment',
    `${climate.season} · ${climate.temperature.toFixed(1)}° · ${climate.indoor ? 'Inside' : 'Outside'}${climate.local ? ` · ${climate.local.regime} · moisture ${climate.local.moisture.toFixed(2)}` : ''}`,
  );
  text(
    'fixture-state',
    `${a.name} · Lives ${String((a.life?.total ?? 0) - (a.life?.deaths ?? 0))} / ${String(a.life?.total ?? 0)} · Health ${a.vitals.health.toFixed(1)} · Satiety ${a.vitals.satiety.toFixed(1)}${w.stacks
      .filter((s) => s.owner === a.id && s.mantle)
      .map(
        (s) =>
          ` · ${s.id}: ${s.mantle?.equipped ? 'worn' : 'unequipped'}, condition ${String(s.mantle?.condition)}, moisture ${((s.mantle?.moisture ?? 0) * 100).toFixed(0)}%`,
      )
      .join('')}${w.stacks
      .filter((s) => s.owner === a.id && s.processing)
      .map((s) => ` · ${String(s.quantity)} ${s.resource} from ${s.origin}`)
      .join('')}${w.objects
      .filter((o) => o.data.resource === 'willow')
      .map((o) => ` · ${o.id}: stock ${String(Number(o.data.stock))}`)
      .join('')}`,
  );
  const materialState = document.getElementById('fixture-state');
  if (materialState)
    appendMaterialLots(
      materialState,
      w.stacks.filter(
        (s) => s.owner === a.id || (s.componentLots && s.reservedFor),
      ),
    );
  if (materialState) appendInventoryInspection(materialState, w, a);
  if (materialState) appendSurfaceDiagnostics(materialState, a);
  if (materialState) appendTrayClearance(materialState, a);
  if (materialState) appendToolAssessment(materialState, a);
  if (materialState) appendSmallDrying(materialState, w, a);
  const samples = w.stacks.filter(
    (s) => s.owner === a.id && s.processing?.foodExamination,
  );
  if (samples.length) {
    const state = document.getElementById('fixture-state');
    if (state)
      state.textContent += samples
        .map((s) => {
          const e = s.processing?.foodExamination;
          if (!e || typeof e !== 'object' || Array.isArray(e)) return '';
          const obs = e.observations;
          return ` · Opened sample ${s.id}: ${String(s.quantity)} ${s.resource}, ${String(Number(e.paidEnergy))} energy paid. ${obs && typeof obs === 'object' && !Array.isArray(obs) ? `Tissue integrity ${String(Number(obs.integrity))}; ${typeof obs.condition === 'string' ? obs.condition : 'unknown condition'}. ` : 'One work stage remains. '}${typeof e.limitations === 'string' ? e.limitations : 'no safety conclusion'}`;
        })
        .join('');
  }
  const apparatus = w.objects.filter((o) =>
    ['comparison-balance', 'drying-tray', 'assay-site', 'woven-site'].includes(
      o.kind,
    ),
  );
  if (apparatus.length) {
    const state = document.getElementById('fixture-state');
    if (state)
      state.textContent += apparatus
        .map(
          (o) =>
            ` · ${o.name}: ${o.data.calibrated === true ? 'calibrated' : o.kind === 'drying-tray' ? 'actual tray' : 'incomplete'}, progress ${String(Number(o.data.progress))}, assembly energy ${String(Number(o.data.paidEnergy ?? 0))}, service ${Number(o.data.service).toFixed(2)}${o.data.lastReading ? `, relative reading ${JSON.stringify(o.data.lastReading)}` : ''}`,
        )
        .join('');
  }
  const metrology = w.objects.find(
    (o) => o.kind === 'metrology-layout' && o.createdBy === a.id,
  );
  if (metrology) {
    const state = document.getElementById('fixture-state');
    if (state)
      state.textContent += ` · Specimen ${JSON.stringify(metrology.data.specimen)}: physical-model addition, ${metrology.data.measured === true ? 'paid measurement available' : 'not yet measured'}; stage ${String(Number(metrology.data.stage))}/2; paid ${String(Number(metrology.data.paidEnergy))} energy. ${metrology.data.measurement ? JSON.stringify(metrology.data.measurement) : ''}${metrology.data.loadForce ? ` Actual load ${String(Number(metrology.data.loadForce))}, deflection ${String(Number(metrology.data.deflection))}, broken ${String(metrology.data.broken === true)}.` : ''}`;
  }
  const recovery = a.extensionState['recuperation:lastRound'];
  if (recovery && typeof recovery === 'object' && !Array.isArray(recovery)) {
    const state = document.getElementById('fixture-state');
    if (state)
      state.textContent += ` · Recovery: paid ${String(Number(recovery.energyCost))} energy + ${String(Number(recovery.satietyCost))} satiety; restored ${String(Number(recovery.recoveredEnergy))} energy; healed ${String(Number(recovery.healing))} health; ${String(Number(recovery.remaining))} work rounds left`;
  }
  text(
    'fixture-happiness',
    `Happiness ${a.wellbeing.total.toFixed(1)} · Physical ${a.wellbeing.physical.toFixed(1)} / 10 · Experience ${a.wellbeing.mental.toFixed(1)}${a.experience ? ` · Sustained mood ${a.experience.mental.toFixed(2)} · Meal pleasure ${a.experience.pleasure.toFixed(2)} · Diet monotony ${(100 * a.experience.monotony).toFixed(0)}%` : ''}`,
  );
  const diagnostic = w.events.findLast(
    (e) => e.actor === a.id && e.type === 'shelter-reference-diagnostic',
  );
  renderTrialDiagnostic(
    trialPanel,
    w.events.findLast(
      (e) => e.actor === a.id && e.type === 'short-refuge-trial-diagnosed',
    )?.data,
  );
  renderExtraction(
    extractionPanel,
    w.events.findLast(
      (e) => e.actor === a.id && e.type.startsWith('extraction-'),
    )?.data,
  );
  const panel = document.getElementById('fixture-diagnostic');
  if (panel) {
    panel.hidden = !diagnostic;
    if (diagnostic)
      panel.textContent = `Inspection reference: ${typeof diagnostic.data.resolvedId === 'string' ? diagnostic.data.resolvedId : 'unresolved'} · ${typeof diagnostic.data.reasonCode === 'string' ? diagnostic.data.reasonCode : 'unknown'} · paid ${Number(diagnostic.data.paidEnergy ?? 0).toFixed(1)} energy · suitability not certified`;
  }
  text(
    'fixture-events',
    w.events
      .filter((e) => !['wellbeing', 'waited'].includes(e.type))
      .map((e) => `${e.type}: ${e.description}`)
      .join('\n'),
  );
}
document.getElementById('fixture-file')?.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  void file
    .text()
    .then((source) => {
      const data = JSON.parse(source) as { frames: V7World[] };
      if (
        !Array.isArray(data.frames) ||
        !data.frames.length ||
        data.frames.some((w) => !w.config.forest)
      )
        throw new Error('Expected isolated forest frames.');
      data.frames.forEach((w) => {
        v7AssertWorld(w);
      });
      frames = data.frames;
      selected = frames[0]?.actors[0]?.id ?? '';
      actors.replaceChildren(
        ...(frames[0]?.actors ?? []).map((a) => new Option(a.name, a.id)),
      );
      actors.value = selected;
      slider.max = String(frames.length - 1);
      slider.value = '0';
      render();
    })
    .catch((error: unknown) => {
      text(
        'fixture-title',
        error instanceof Error ? error.message : 'Invalid isolated fixture.',
      );
    });
});
slider.addEventListener('input', render);
actors.addEventListener('change', () => {
  selected = actors.value;
  render();
});
document.getElementById('fixture-zoom-in')?.addEventListener('click', () => {
  size = Math.max(5, size / 1.3);
  render();
});
document.getElementById('fixture-zoom-out')?.addEventListener('click', () => {
  size = Math.min(48, size * 1.3);
  render();
});
document.getElementById('fixture-geometry')?.addEventListener('click', () => {
  geometry = !geometry;
  render();
});
window.addEventListener('resize', render);

window.addEventListener('forest-visual-ready', render);
