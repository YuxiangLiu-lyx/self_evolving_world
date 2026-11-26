import type { V7Json, V7Object } from '@self-evolving-world/world-core';

const FOOD: Record<string, string> = {
  unheated: '#cfaf79',
  'food-heating': '#d9a35f',
  'partly-heated': '#c98d4c',
  cooked: '#9a6334',
  charred: '#4a3527',
  destroyed: '#1f1a17',
};
const record = (v: V7Json | undefined) =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : null;

/** Reusable open-hearth projection of actual state: a cleared bed (dashed while cleared), loaded
 * fuel, a drill only during friction work, glow only for embers, flame only while burning and
 * smoke only with actual combustion, and each food portion colored by its modeled state. */
export function hearthVisual(o: V7Object): string {
  const v = record(o.data.view);
  if (!v) return '<circle r=".45" fill="#6f6350" fill-opacity=".4"/>';
  const state = typeof v.state === 'string' ? v.state : '';
  const fuel = Number(v.fuelMass ?? 0);
  const drill = record(v.friction);
  const food = Array.isArray(v.food) ? v.food.map(record) : [];
  const bed = `<circle r=".45" fill="${Number(v.ash ?? 0) > 0 ? '#8d8a80' : '#7a6a52'}" fill-opacity=".75" stroke="#a89470" stroke-width=".025" ${state === 'unprepared' ? 'stroke-dasharray=".06 .05"' : ''}/>`;
  const sticks =
    fuel > 0
      ? `<path d="M-.24 .1L.22-.1M-.2-.12L.24.12${fuel > 2 ? 'M-.05-.22L.05.22' : ''}" stroke="#8d704e" stroke-width=".07" stroke-linecap="round"/>`
      : '';
  const glow =
    v.ember === true
      ? '<ellipse rx=".2" ry=".1" fill="#c4562f" fill-opacity=".85"/>'
      : '';
  const flame =
    v.flame === true
      ? '<path d="M-.14.06Q-.26-.14-.08-.38Q-.1-.16.02-.22Q.09-.48.11-.55Q.31-.15.14.07Z" fill="#e39c3c"/><path d="M-.07.06Q-.11-.09.05-.25Q.17-.05.07.07Z" fill="#ffe49a"/>'
      : '';
  const smoke =
    v.smoke === true
      ? '<path d="M.06-.6Q-.12-.84.1-.98M.15-.68Q.32-.88.18-1.06" fill="none" stroke="#b9bcb2" stroke-opacity=".6" stroke-width=".05"/>'
      : '';
  const spindle = drill
    ? `<path d="M.3 .05L.42-.42" stroke="#c8bba0" stroke-width=".04"/>${drill.smoke === true ? '<circle cx=".3" cy=".05" r=".04" fill="#5b4a3a"/>' : ''}`
    : '';
  const portions = food
    .map((f, i) => {
      if (!f) return '';
      const color =
        FOOD[typeof f.state === 'string' ? f.state : ''] ?? '#cfaf79';
      const x = f.onBed === true ? -0.08 + i * 0.12 : 0.5;
      return `<ellipse cx="${String(x)}" cy=".12" rx=".11" ry=".06" fill="${color}" stroke="#3a2d22" stroke-width=".015"/>`;
    })
    .join('');
  return `${bed}${sticks}${glow}${portions}${flame}${smoke}${spindle}<text y=".72" text-anchor="middle" fill="#f5ead2" font-size=".14">${o.visual.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text>`;
}
