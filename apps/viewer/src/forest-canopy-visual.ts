import type { V7Object } from '@self-evolving-world/world-core';
/** Geometry and rain are recorded; no synthetic warmth or completion cue. */
export function canopyVisual(o: V7Object): string {
  const work = o.kind === 'rain-canopy-work',
    condition = Number(o.data.condition),
    rain = Number(o.data.rain ?? 0),
    transmission = Number(o.data.transmission ?? 1);
  const panels = work
    ? Math.floor((Number(o.data.elapsed) / 6) * 6)
    : Math.ceil((condition / 120) * 6);
  const body = `<rect x="-1" y="-1" width="2" height="2" fill="#b4a47b22" stroke="#d4c49a" stroke-width=".035" ${work ? 'stroke-dasharray=".12 .12"' : ''}/>${Array.from({ length: panels }, (_, i) => `<rect x="${String(-0.98 + (i % 3) * 0.66)}" y="${String(-0.98 + Math.floor(i / 3))}" width=".62" height=".95" fill="#aa916a88" stroke="#5e594b" stroke-width=".025"/>`).join('')}${[-1, 1].flatMap((x) => [-1, 1].map((y) => `<circle cx="${String(x)}" cy="${String(y)}" r=".08" fill="#695641" stroke="#d2b681" stroke-width=".02"/>`)).join('')}`;
  const drops =
    rain > 0
      ? Array.from({ length: 12 }, (_, i) => {
          const outside = i < 6,
            x = outside ? -1.35 + (i % 2) * 2.7 : -0.7 + (i % 3) * 0.7,
            y = -0.85 + (i % 3) * 0.7;
          return `<path d="M${String(x)} ${String(y)}l-.04 .15" stroke="#9dc8dc" opacity="${String(outside ? rain : rain * transmission)}" stroke-width=".025"/>`;
        }).join('')
      : '';
  const annotation = work
    ? `<text x="1.23" y="-.32" fill="#f5ead2" font-size=".13">Paid ${String(Number(o.data.elapsed))} / 6</text>`
    : `<text x="1.23" y="-.32" fill="#f5ead2" font-size=".13">Cover ${condition.toFixed(1)} / 120</text><text x="1.23" y="-.12" fill="#f5ead2" font-size=".13">Rain ${(transmission * 100).toFixed(0)}%</text>`;
  return `<g transform="rotate(${String((o.spatial.angle * 180) / Math.PI)})">${body}${drops}</g>${annotation}`;
}
export const canopyPostVisual = (): string =>
  '<circle r=".08" fill="#695641" stroke="#d2b681" stroke-width=".02"/>';
