import type { V7Object } from '@self-evolving-world/world-core';

/** Declarative, read-only projection of actual work, fuel, cover, combustion, wetness and residue. */
export function fireVisual(o: V7Object): string {
  const f = o.data,
    working = o.kind === 'hearth-work',
    lit = f.lit === true,
    embers = Number(f.embers) > 0,
    wet = Number(f.moisture) > 0.35;
  const fuel = Array.isArray(f.lots) ? f.lots.length : 0;
  return `<ellipse cy=".15" rx=".5" ry=".24" fill="#26372e66"/><circle r=".43" fill="${Number(f.ash) > 0 ? '#a4a49a' : '#6f6a58'}" stroke="#4a504b" stroke-width=".04"/>${Array.from({ length: 8 }, (_, i) => `<ellipse cx="${String(Math.cos((i * Math.PI) / 4) * 0.37)}" cy="${String(Math.sin((i * Math.PI) / 4) * 0.37)}" rx=".11" ry=".08" fill="#a7aaa0" stroke="#646a64" stroke-width=".02"/>`).join('')}${fuel ? `<path d="M-.25 .12L.24-.12M-.22-.12L.23.14" stroke="${wet ? '#504b3b' : '#a88150'}" stroke-width=".1"/>` : ''}${lit ? '<path d="M-.16.05Q-.3-.16-.09-.42Q-.12-.18.02-.24Q.1-.53.12-.61Q.35-.17.16.08Z" fill="#e39c3c"/><path d="M-.08.06Q-.13-.1.06-.28Q.19-.06.08.08Z" fill="#ffe49a"/><path d="M.08-.63Q-.14-.9.12-1.05M.17-.72Q.36-.93.2-1.13" fill="none" stroke="#b9bcb277" stroke-width=".06"/>' : embers ? '<ellipse cy=".04" rx=".22" ry=".1" fill="#b75b38"/>' : ''}${!working && Number(f.condition) > 0 ? '<path d="M-.43-.1L-.4-.58L.42-.58L.45-.1" fill="none" stroke="#6e6549" stroke-width=".035"/><path d="M-.49-.57L0-.72L.49-.57L.46-.43L-.46-.43Z" fill="#a78d64" stroke="#695d46" stroke-width=".025"/>' : ''}${wet ? '<path d="M-.55-.35L-.58-.24M.57-.45L.54-.34" stroke="#8fc2dc" stroke-width=".03"/>' : ''}<text y=".8" text-anchor="middle" fill="#f5ead2" font-size=".15">${working ? `Work ${String(Number(f.progress))} / 4` : lit ? 'Finite fuel burning' : embers ? 'Residual embers' : Number(f.ash) > 0 ? 'Cold ash retained' : 'Unlit hearth'}</text>`;
}
