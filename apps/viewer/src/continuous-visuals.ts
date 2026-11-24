import { joiningVisual } from './long-joining-visual.js';
import { canopyVisual, canopyPostVisual } from './forest-canopy-visual.js';
import { fireVisual } from './forest-fire-visual.js';
import type { V7Object, V7Event } from '@self-evolving-world/world-core';
export const svgText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export type ContinuousVisual = (
  object: V7Object,
  events: readonly V7Event[],
) => string;
const color = (value: string) =>
  /^#[a-f\d]{3,8}$/i.test(value) ? value : '#b4caba';
const foliage: ContinuousVisual = (o) =>
  `<ellipse cy=".32" rx=".74" ry=".35" fill="#12342b" opacity=".22"/><path d="M-.07 .37L-.12-.42H.12L.07 .37" fill="#80654b"/><path d="M-.58-.05Q-.95-.55-.3-.64Q-.15-1.1.29-.69Q.9-.61.6-.11Q.49.37-.02.19Q-.48.43-.58-.05" fill="${color(o.visual.color)}" stroke="#244b38" stroke-width=".035"/><path d="M-.46-.48Q-.2-.78.13-.64" fill="none" stroke="#b8ca82" stroke-opacity=".4" stroke-width=".08"/>`;
const rock: ContinuousVisual = (o) =>
  '<ellipse cy=".24" rx=".59" ry=".23" fill="#18352d" opacity=".25"/>' +
  `<path d="M-.5 .15L-.4-.25L-.04-.47L.41-.26L.51.12L.21.32L-.27.28Z" fill="${color(o.visual.color)}" stroke="#687b76" stroke-width=".03"/><path d="M-.4-.25L-.04-.47L.41-.26L.13-.13L-.15-.13Z" fill="#d4d6bd" opacity=".65"/>`;
const source: ContinuousVisual = (o) =>
  `<ellipse cy=".16" rx=".5" ry=".26" fill="#274e34" opacity=".3"/><path d="M-.38 .05Q-.53-.35-.2-.32Q0-.59.18-.31Q.5-.37.36.08Z" fill="${color(o.visual.color)}" stroke="#365c3d" stroke-width=".035"/>${Array.from({ length: Math.min(6, Number(o.data.stock ?? 0)) }, (_, i) => `<circle cx="${String(Math.cos(i * 2.4) * 0.25)}" cy="${String(-0.1 + Math.sin(i * 2.4) * 0.17)}" r=".06" fill="${color(o.visual.accent)}"/>`).join('')}`;
const rootSurface: ContinuousVisual = (o) => {
  const f = o.data.food,
    food = f && typeof f === 'object' && !Array.isArray(f) ? f : null;
  const present = Array.isArray(f) ? f.length > 0 : !!food;
  const scale = food
    ? Math.sqrt(Math.max(0, Math.min(1, Number(food.massRatio ?? 1))))
    : 1;
  const fill =
    food && Number(food.waterFraction) <= 0.1200001 ? '#b79b61' : '#d0b77d';
  return `<ellipse rx=".38" ry=".28" fill="#b99e73" stroke="#ddd0aa" stroke-width=".025" ${o.visual.state === 'ready' ? '' : 'stroke-dasharray=".05 .04"'}/><ellipse cx="-.28" rx=".09" ry=".12" fill="#8c9790"/>${o.kind === 'root-drying-tray' ? '<ellipse cx=".28" rx=".09" ry=".12" fill="#8c9790"/>' : ''}${present ? `<path transform="scale(${String(scale)})" d="M-.16-.08L.14-.1L.18.09L-.12.12Z" fill="${fill}"/>` : ''}`;
};
/** A small post with a kind-colored glyph and its short text; signs have no physical body. */
const sign: ContinuousVisual = (o) => {
  const glyph =
    o.kind === 'name'
      ? '<path d="M-.09-.34H.09M0-.34V-.2" stroke="#2f3b35" stroke-width=".03"/>'
      : o.kind === 'mark'
        ? '<path d="M-.07-.34L.07-.2M.07-.34L-.07-.2" stroke="#2f3b35" stroke-width=".03"/>'
        : '<circle cy="-.27" r=".06" fill="none" stroke="#2f3b35" stroke-width=".03"/>';
  return `<path d="M0 .16V-.12" stroke="#7a6449" stroke-width=".04"/><rect x="-.14" y="-.41" width=".28" height=".28" rx=".04" fill="${color(o.visual.color)}" stroke="${color(o.visual.accent)}" stroke-width=".04"/>${glyph}<text y="-.5" text-anchor="middle" fill="#fff0cf" stroke="#253c34" stroke-width=".02" paint-order="stroke" font-size=".16">${svgText(o.visual.label.slice(0, 24))}</text>`;
};
export const CONTINUOUS_VISUALS: Record<string, ContinuousVisual> = {
  sign,
  'surface-residue': (o) =>
    `<circle r=".1" fill="none" stroke="#b8a17b" stroke-width=".01"/>${Number(o.data.mass ?? 0) > 0 ? '<circle r=".03" fill="#574f39"/>' : ''}`,
  'loose-material': (o) =>
    `<circle r="${String(o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0)}" fill="none" stroke="#88a377" stroke-width=".015" stroke-dasharray=".03 .03"/>`,
  'loose-wrap': joiningVisual,
  'surface-work': (o) =>
    `<circle r=".2" fill="${Number(o.data.exposedArea ?? 0) > 0 ? '#92795b' : 'none'}" stroke="#b8a17b" stroke-width=".012"/>${(Array.isArray(o.data.residues) ? o.data.residues : []).map((r) => (r && typeof r === 'object' && !Array.isArray(r) && Number(r.mass ?? 0) > 0 ? `<circle cx="${String(Number(r.x) - o.spatial.x)}" cy="${String(Number(r.y) - o.spatial.y)}" r="${String(Number(r.radius))}" fill="#574f39"/>` : '')).join('')}`,
  'root-work-surface': rootSurface,
  'small-root-drying': (o) => {
    const shape = o.spatial.shape;
    if (shape.kind !== 'rectangle') return '';
    const w = shape.width,
      h = shape.height;
    return `<rect x="${String(-w / 2)}" y="${String(-h / 2)}" width="${String(w)}" height="${String(h)}" fill="${o.kind === 'small-drying-ballast' ? '#728079' : '#c9af80'}" stroke="#5e4931" stroke-width=".012" ${o.visual.state === 'partial' ? 'stroke-dasharray=".02 .02"' : ''}/>`;
  },
  'weather-lean-to': (o) => {
    const built = o.kind === 'weather-lean-to',
      integrity = Number(o.data.integrity ?? 0);
    return `<rect x="-1" y="-1" width="2" height="2" fill="#c5ad7a" fill-opacity="${built ? String(0.15 + 0.5 * integrity) : '.08'}" stroke="#d4be90" stroke-width=".035" ${built ? '' : 'stroke-dasharray=".08 .06"'}/>${built ? '<path d="M-1-.7L1-.7M-1-.3L1-.3M-1 .1L1 .1M-1 .5L1 .5" stroke="#766349" stroke-width=".06"/>' : ''}<path d="M-.4 1.02H.4M0 1.32V1.08" stroke="#d5e4c2" stroke-width=".04"/><text y="-1.2" text-anchor="middle" fill="#fff0cf" font-size=".2">${built ? `Cover ${String(Math.round(integrity * 100))}%` : `Work ${String(Number(o.data.completedWork ?? 0))} / 8`}</text>`;
  },
  'lean-to-post': () =>
    '<circle r=".1" fill="#8d704e" stroke="#d6bd88" stroke-width=".02"/>',
  'stone-hearth': fireVisual,
  'rain-canopy': canopyVisual,
  'canopy-post': canopyPostVisual,
  'stone-mosaic': (o) => {
    const offsets = Array.isArray(o.data.offsets) ? o.data.offsets : [];
    const stones = offsets
      .flatMap((raw) => {
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          typeof raw.dx !== 'number' ||
          typeof raw.dy !== 'number'
        )
          return [];
        return [
          `<g transform="translate(${String(raw.dx)} ${String(raw.dy)})"><ellipse cy=".025" rx=".092" ry=".055" fill="#3b4a3e" opacity=".25"/><path d="M-.075 .025L-.06-.045L.025-.065L.08-.02L.055.045L-.035.055Z" fill="#a5aaa0" stroke="#626f64" stroke-width=".018"/><path d="M-.06-.045L.025-.065L.08-.02L-.01-.005Z" fill="#d9d6c1"/></g>`,
        ];
      })
      .join('');
    return `<circle r=".5" fill="#cec5a0" fill-opacity=".12" stroke="#b0b68c" stroke-opacity=".5" stroke-width=".022" ${o.kind === 'stone-mosaic-work' ? 'stroke-dasharray=".06 .06"' : ''}/><g opacity="${o.kind === 'stone-mosaic-work' ? '.5' : '1'}">${stones}</g>${o.kind === 'stone-mosaic-work' ? `<text y="-.62" text-anchor="middle" fill="#f3dfb4" font-size=".19">${typeof o.data.elapsed === 'number' ? String(o.data.elapsed) : '?'} / 3</text>` : ''}`;
  },
  plant: source,
  animal: (o) =>
    `<ellipse rx=".4" ry=".2" fill="${color(o.visual.color)}"/><circle cx=".35" cy="-.06" r=".14" fill="${color(o.visual.color)}"/><path d="M-.25-.15L-.3-.3M-.25.15L-.3.3M.2-.15L.25-.3M.2.15L.25.3" stroke="${color(o.visual.color)}" stroke-width=".07"/>`,
  cave: (o) =>
    o.spatial.shape.kind === 'rectangle'
      ? `<rect x="${String(-o.spatial.shape.width / 2)}" y="${String(-o.spatial.shape.height / 2)}" width="${String(o.spatial.shape.width)}" height="${String(o.spatial.shape.height)}" fill="${color(o.visual.color)}"/><path d="M-.7 2V1.2Q0 .3.7 1.2V2" fill="#263c35"/>`
      : '',
  enclosure: (o) =>
    o.spatial.shape.kind === 'rectangle'
      ? `<rect x="${String(-o.spatial.shape.width / 2)}" y="${String(-o.spatial.shape.height / 2)}" width="${String(o.spatial.shape.width)}" height="${String(o.spatial.shape.height)}" fill="${color(o.visual.color)}"/>`
      : '',
  tree: foliage,
  rock,
  'berry-shrub': source,
  'root-patch': source,
  berry: source,
  roots: source,
  'food-source': source,
};
export function continuousObjectVisual(
  o: V7Object,
  events: readonly V7Event[],
): string {
  const render = CONTINUOUS_VISUALS[o.visual.component];
  if (render) {
    const attention = events.find(
      (e) => e.target === o.id && e.type === 'nature_observed' && e.success,
    );
    return (
      render(o, events) +
      (attention
        ? '<circle r=".72" fill="none" stroke="#f5d58b" stroke-width=".055" stroke-dasharray=".1 .07"/><text y="-.92" text-anchor="middle" fill="#fff2c5" font-size=".2">Observation complete</text>'
        : '')
    );
  }
  const shape = o.spatial.shape;
  return `<ellipse cy=".2" rx=".55" ry=".25" fill="#18352d" opacity=".22"/>${shape.kind === 'circle' ? `<circle r="${String(shape.radius)}"` : `<rect x="${String(-shape.width / 2)}" y="${String(-shape.height / 2)}" width="${String(shape.width)}" height="${String(shape.height)}" rx=".08"`} fill="${color(o.visual.color)}" stroke="${color(o.visual.accent)}" stroke-width=".06"/><path d="M-.2 .1L.2-.1M-.2-.1L.2.1" stroke="#f3e7c7" stroke-width=".035"/>`;
}
