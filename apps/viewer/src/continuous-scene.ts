import { v7Observe } from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Actor,
  V7Object,
  V7Event,
  WorldState,
} from '@self-evolving-world/world-core';
import { continuousObjectVisual, svgText } from './continuous-visuals.js';
export interface SceneFrame {
  tick: number;
  width: number;
  height: number;
  terrain: string[];
  actors: V7Actor[];
  objects: V7Object[];
  stacks: { id: string; x: number; y: number; label: string; color: string }[];
  events: V7Event[];
  visible: string[] | null;
  continuous: V7World | null;
  legacy: boolean;
}
export function continuousScene(
  world: V7World,
  actor: string | null,
): SceneFrame {
  const observation = actor ? v7Observe(world, actor) : null;
  return {
    tick: world.tick,
    width: world.config.width,
    height: world.config.height,
    terrain: world.terrain.flatMap((row) => Array.from(row)),
    actors: observation
      ? world.actors.filter(
          (a) =>
            a.id === actor || observation.actors.some((b) => b.id === a.id),
        )
      : world.actors,
    objects: observation?.objects ?? world.objects,
    stacks: (observation?.stacks ?? world.stacks)
      .filter((s) => s.owner === null)
      .map((s) => ({
        id: s.id,
        x: s.position.x,
        y: s.position.y,
        label: `${String(s.quantity)} ${s.resource}`,
        color:
          world.resources.find((r) => r.id === s.resource)?.color ?? '#e4dbbe',
      })),
    events: observation?.events ?? world.events,
    visible:
      observation?.terrain.map((t) => `${String(t.x)},${String(t.y)}`) ?? null,
    continuous: world,
    legacy: false,
  };
}
/** Presentation adapter only. Recorded grid positions, inventories and event ticks stay unchanged. */
export function historicalScene(
  world: WorldState,
  actor: string | null,
): SceneFrame {
  const data = world.coevolution ?? world.evolution,
    obs = actor ? world.observations.find((o) => o.self.id === actor) : null;
  const actors: V7Actor[] = world.agents
    .filter(
      (a) => !obs || a.id === actor || obs.agents.some((b) => b.id === a.id),
    )
    .map((a) => {
      const v = (data ?? world.learning ?? world.survival)?.vitals[a.id];
      return {
        id: a.id,
        name: a.name,
        position: { ...a.position },
        angle: 0,
        radius: 0.24,
        vitals: {
          health: v?.health ?? 100,
          satiety: v?.satiety ?? 100,
          energy: world.coevolution?.energy[a.id] ?? 40,
          temperature: 22,
        },
        wellbeing: { physical: 0, mental: 0, total: 0, sources: [] },
        mastered: [],
        learning: null,
        memory: {
          cells: [],
          objects: [],
          stacks: [],
          experiences: [],
          notes: [],
          preferences: [],
        },
        relationships: {},
        extensionState: {},
        bornAt: 0,
        parents: [],
      };
    });
  const objects: V7Object[] = (world.coevolution?.objects ?? []).flatMap((o) =>
    o.position &&
    (!obs ||
      Math.hypot(
        o.position.x - obs.self.position.x,
        o.position.y - obs.self.position.y,
      ) <= world.settings.visionRadius)
      ? [
          {
            id: o.id,
            name: o.blueprint,
            kind: o.blueprint,
            spatial: {
              ...o.position,
              angle: 0,
              shape: { kind: 'rectangle' as const, width: 0.7, height: 0.55 },
              solid: false,
              interaction: 0,
              entrances: [],
            },
            visual: {
              component: o.blueprint,
              color: '#b99a62',
              accent: '#f1d69a',
              label: o.blueprint,
              state: 'recorded',
            },
            data: {},
            createdBy: o.creator,
            createdAt: o.created,
            revision: 'historical',
          },
        ]
      : [],
  );
  for (const site of data?.sites ?? []) {
    if (
      obs &&
      Math.hypot(
        site.position.x - obs.self.position.x,
        site.position.y - obs.self.position.y,
      ) > world.settings.visionRadius
    )
      continue;
    objects.push({
      id: site.id,
      name: site.appearance,
      kind: site.kind,
      spatial: {
        ...site.position,
        angle: 0,
        shape: { kind: 'circle', radius: 0.4 },
        solid: false,
        interaction: 0,
        entrances: [],
      },
      visual: {
        component: site.kind,
        color:
          site.kind === 'tree'
            ? '#365f45'
            : site.kind === 'rock'
              ? '#899591'
              : '#64844e',
        accent: '#d4b978',
        label: site.id,
        state: 'recorded',
      },
      data: { presentationOnly: true },
      createdBy: null,
      createdAt: 0,
      revision: 'historical',
    });
  }
  return {
    tick: world.tick,
    width: world.settings.width,
    height: world.settings.height,
    terrain: data
      ? data.terrain.flatMap((row) => Array.from(row))
      : Array.from(
          { length: world.settings.width * world.settings.height },
          () => 'grass',
        ),
    actors,
    objects,
    stacks: (obs?.items ?? world.items).map((i) => ({
      id: i.id,
      x: i.position.x,
      y: i.position.y,
      label: i.name,
      color: i.name.toLowerCase().includes('wood') ? '#b88d61' : '#cf9170',
    })),
    events: (data?.events ?? []).map((e, i) => ({
      id: `historical-${String(world.tick)}-${String(i)}`,
      tick: world.tick,
      actor: e.action.agentId,
      type: e.outcome,
      interface: e.action.type,
      success: !e.outcome.includes('fail'),
      description: e.detail,
      position:
        world.agents.find((a) => a.id === e.action.agentId)?.position ?? null,
      target: null,
      data: {},
    })),
    visible: obs
      ? Array.from(
          { length: world.settings.width * world.settings.height },
          (_, i) => ({
            x: i % world.settings.width,
            y: Math.floor(i / world.settings.width),
          }),
        )
          .filter(
            (p) =>
              Math.hypot(
                p.x - obs.self.position.x,
                p.y - obs.self.position.y,
              ) <= world.settings.visionRadius,
          )
          .map((p) => `${String(p.x)},${String(p.y)}`)
      : null,
    continuous: null,
    legacy: true,
  };
}
const colors: Record<string, string> = {
  F: '#607f59',
  G: '#8da36a',
  W: '#6aa8ac',
  B: '#c0b38a',
  R: '#a2a78b',
  M: '#819a7b',
  S: '#a8bca4',
  '.': '#8da36a',
  f: '#607f59',
  ',': '#c0b38a',
  ':': '#a2a78b',
  '~': '#6aa8ac',
  '=': '#c4bd98',
  grass: '#8da36a',
  meadow: '#8da36a',
  forest: '#607f59',
  bank: '#c0b38a',
  rocky: '#a2a78b',
  damp: '#819a7b',
  water: '#6aa8ac',
};
export function sceneSvg(
  frame: SceneFrame,
  selected: string,
  hitboxes = false,
): string {
  const visible = frame.visible ? new Set(frame.visible) : null;
  const terrain = frame.terrain
    .map((kind, i) => {
      const x = i % frame.width,
        y = Math.floor(i / frame.width),
        shown = !visible || visible.has(`${String(x)},${String(y)}`);
      return `<g><rect x="${String(x)}" y="${String(y)}" width="1.01" height="1.01" fill="${String(shown ? (colors[kind] ?? colors.grass) : '#203d37')}"/>${shown ? (kind === 'water' || kind === '~' || kind === 'W' ? `<path d="M${String(x + 0.12)} ${String(y + 0.35)}q.2-.09.4 0t.32 0M${String(x + 0.3)} ${String(y + 0.75)}h.45" stroke="#b9dfcd" opacity=".4" stroke-width=".035" fill="none"/>` : `<path d="M${String(x + 0.22)} ${String(y + 0.58)}l-.04-.12m.04.12l.08-.1M${String(x + 0.72)} ${String(y + 0.22)}l.04-.1" stroke="#d3d8a3" opacity=".32" stroke-width=".025"/>`) : ''}</g>`;
    })
    .join('');
  const items = frame.stacks
    .map(
      (s) =>
        `<g data-scene-stack="${svgText(s.id)}" transform="translate(${String(s.x)} ${String(s.y)})"><ellipse cy=".09" rx=".19" ry=".08" fill="#284538" opacity=".3"/><path d="M-.15 .04L.07-.14L.17-.04L-.04.14Z" fill="${svgText(s.color)}" stroke="#f4deb5" stroke-width=".02"/><title>${svgText(s.label)}</title></g>`,
    )
    .join('');
  const objects = [...frame.objects]
    .sort((a, b) => a.spatial.y - b.spatial.y)
    .map(
      (o) =>
        `<g data-scene-object="${svgText(o.id)}" tabindex="0" role="button" aria-label="Inspect ${svgText(o.name)}" class="scene-object ${frame.events.some((e) => e.target === o.id && e.success) ? 'event-active' : ''}" transform="translate(${String(o.spatial.x)} ${String(o.spatial.y)}) rotate(${String((o.spatial.angle * 180) / Math.PI)})">${continuousObjectVisual(o, frame.events)}${hitboxes ? (o.spatial.shape.kind === 'circle' ? `<circle r="${String(o.spatial.shape.radius)}" class="hitbox"/>` : `<rect x="${String(-o.spatial.shape.width / 2)}" y="${String(-o.spatial.shape.height / 2)}" width="${String(o.spatial.shape.width)}" height="${String(o.spatial.shape.height)}" class="hitbox"/>`) : ''}${o.spatial.entrances.map((p) => `<path d="M${String(p.x - 0.1)} ${String(p.y)}h.2" stroke="#fae4a7" stroke-width=".06"/>`).join('')}<title>${svgText(o.name)} · ${svgText(o.visual.state)}</title></g>`,
    )
    .join('');
  const actors = [...frame.actors]
    .sort((a, b) => a.position.y - b.position.y)
    .map((a, i) => {
      const active = frame.events.find((e) => e.actor === a.id && e.interface),
        tint = ['#e8ae69', '#9fbe96', '#9bbdd1'][i % 3];
      return `<g data-scene-actor="${svgText(a.id)}" data-x="${String(a.position.x)}" data-y="${String(a.position.y)}" role="button" tabindex="0" aria-label="Observe ${svgText(a.name)}" transform="translate(${String(a.position.x)} ${String(a.position.y)})" class="scene-actor ${active ? `event-${svgText(active.interface ?? 'wait')}` : ''}"><ellipse cy=".16" rx=".28" ry=".12" fill="#1a3c32" opacity=".3"/>${a.id === selected ? '<ellipse cy=".1" rx=".39" ry=".21" fill="none" stroke="#f5e6b7" stroke-width=".04"/>' : ''}<path d="M-.13 .03L-.14 .19M.12 .03L.14 .19" stroke="#3d4f43" stroke-width=".075"/><path d="M-.2-.15Q0-.27.2-.15L.15.08H-.15Z" fill="${String(tint)}" stroke="#52604b" stroke-width=".025"/><circle cy="-.31" r=".15" fill="#e6c6a1"/><path d="M-.15-.34Q-.1-.57.13-.42L.16-.28Q.02-.4-.15-.29" fill="#525442"/><path d="M0-.1l${String(Math.cos(a.angle) * 0.24)} ${String(Math.sin(a.angle) * 0.14)}" stroke="#f1d8ae" stroke-width=".06"/><text y="-.66" text-anchor="middle" class="actor-label">${svgText(a.name)}</text>${active ? `<text y=".58" text-anchor="middle" class="action-label ${active.success ? '' : 'action-failed'}">${svgText(active.success ? (active.interface ?? '') : 'blocked')}</text>` : ''}<title>${svgText(a.name)} · ${a.position.x.toFixed(3)}, ${a.position.y.toFixed(3)}</title></g>`;
    })
    .join('');
  return `<defs><filter id="ground-grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".075"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><g id="terrain">${terrain}</g><rect width="${String(frame.width)}" height="${String(frame.height)}" fill="#809568" opacity=".14" filter="url(#ground-grain)" pointer-events="none"/>${items}${objects}${actors}`;
}
