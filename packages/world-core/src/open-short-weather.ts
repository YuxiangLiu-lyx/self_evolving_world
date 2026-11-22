import type { V7World, V7Process } from './continuous-types.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { shortParts, shortLoads } from './open-short-material.js';
export function shortWeather(w: V7World, p: V7Process) {
  const o = w.objects.find((o) => o.id === p.object);
  if (!o) {
    w.processes = w.processes.filter((x) => x.id !== p.id);
    return;
  }
  const climate = forestClimate(w, o.spatial),
    rain = climate.rain ?? 0,
    wind = climate.wind ?? 0;
  let input = 0,
    output = 0;
  for (const s of shortParts(o)) {
    const m = s.physical;
    if (!m) continue;
    const gain = Math.min(
        Math.max(0, m.unitSolids * 2 - m.unitWater),
        rain * 0.002,
      ),
      loss = Math.min(
        m.unitWater,
        (1 - rain) * Math.max(0, climate.temperature) * 0.00002,
      );
    m.unitWater += gain - loss;
    m.unitMass = m.unitSolids + m.unitWater;
    input += gain * s.quantity;
    output += loss * s.quantity;
    if (s.processing?.shortGrassModel)
      s.processing.shortIntegrity = Math.max(
        0,
        Number(s.processing.shortIntegrity ?? 1) -
          (0.001 +
            0.003 * Math.min(1, m.unitWater / Math.max(1e-9, m.unitMass))),
      );
  }
  const wet = Math.max(
    0,
    Math.min(1, Number(o.data.wetness ?? 0) + rain * 0.02 - (1 - rain) * 0.005),
  );
  o.data.wetness = wet;
  o.data.wind = wind;
  o.data.integrity = Math.min(
    1,
    ...shortParts(o)
      .filter((s) => s.processing?.shortGrassModel)
      .map((s) => Number(s.processing?.shortIntegrity ?? 1)),
  );
  o.data.rainWater = Number(o.data.rainWater ?? 0) + input;
  o.data.evaporatedWater = Number(o.data.evaporatedWater ?? 0) + output;
  const loads = shortLoads(w, o);
  o.data.sag = Number.isFinite(loads.sag) ? loads.sag : 0;
  o.data.slip = loads.slipping;
  o.data.lastLoad = {
    ...loads,
    stressRatio: Number.isFinite(loads.stressRatio) ? loads.stressRatio : null,
    bucklingRatio: Number.isFinite(loads.bucklingRatio)
      ? loads.bucklingRatio
      : null,
    sag: Number.isFinite(loads.sag) ? loads.sag : null,
  };
  if (o.data.proven === true) {
    const proof = o.data.proof as
      { wetness?: number; wind?: number } | undefined;
    if (
      !loads.sound ||
      wet > (proof?.wetness ?? 0) + 1e-8 ||
      wind > (proof?.wind ?? 0) + 1e-8
    ) {
      o.data.proven = false;
      o.data.collapsed = !loads.sound;
      o.visual.state = loads.sound ? 'unproven' : 'collapsed';
      forestEvent(
        w,
        'short-refuge-stopped',
        'Weather or wear exceeded the tested envelope; actual geometry and surviving components remain.',
        o.spatial,
        null,
        {
          structure: o.id,
          wetness: wet,
          wind,
          slipping: loads.slipping,
          integrity: o.data.integrity,
        },
        o.id,
      );
    }
  }
  p.next = w.tick + 1;
}
/** A single per-world controller follows all real loose/split coupons; it supplies no material. */
export function shortStockWeather(w: V7World, p: V7Process) {
  let present = false,
    input = 0,
    output = 0;
  for (const s of w.stacks) {
    if (!s.processing?.shortGrassModel || !s.physical) continue;
    present = true;
    const position =
        s.owner && !s.reservedFor
          ? (w.actors.find((a) => a.id === s.owner)?.position ?? s.position)
          : s.position,
      climate = forestClimate(w, position),
      m = s.physical,
      rain = climate.rain ?? 0,
      gain = Math.min(
        Math.max(0, m.unitSolids * 2 - m.unitWater),
        rain * 0.002,
      ),
      loss = Math.min(
        m.unitWater,
        (1 - rain) * Math.max(0, climate.temperature) * 0.00002,
      );
    m.unitWater += gain - loss;
    m.unitMass = m.unitSolids + m.unitWater;
    input += gain * s.quantity;
    output += loss * s.quantity;
    s.processing.shortIntegrity = Math.max(
      0,
      Number(s.processing.shortIntegrity ?? 1) -
        (0.001 + 0.003 * Math.min(1, m.unitWater / Math.max(1e-9, m.unitMass))),
    );
  }
  if (!present) w.processes = w.processes.filter((x) => x.id !== p.id);
  else {
    p.next = w.tick + 1;
    p.data.rainWater = Number(p.data.rainWater ?? 0) + input;
    p.data.evaporatedWater = Number(p.data.evaporatedWater ?? 0) + output;
  }
}
