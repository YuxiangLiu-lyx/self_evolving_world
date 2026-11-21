import type { V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestClimate, forestEvent } from './forest-environment.js';
import { canopyCover, canopyTransmission } from './forest-canopy-geometry.js';
/** Cover wear and actual item moisture settle once, before the existing insulation solver. */
export function canopyEnvironment(w: V7World): void {
  if (w.state.rainCanopy !== 1) return;
  for (const o of w.objects.filter((o) => o.kind === 'rain-canopy')) {
    if (o.data.lastTick === w.tick) continue;
    const rain = forestClimate(w, o.spatial).rain ?? 0,
      before = Number(o.data.condition);
    o.data.condition = v7RoundNumber(Math.max(0, before - 0.5 * rain));
    o.data.lastTick = w.tick;
    o.data.rain = rain;
    o.data.transmission = canopyTransmission(o);
    if (before > 0 && o.data.condition === 0)
      forestEvent(
        w,
        'rain-canopy-cover-expired',
        'The covering no longer intercepts rain; posts and all structural mass remain.',
        o.spatial,
        null,
        { condition: 0, mass: o.data.mass ?? 0 },
        o.id,
      );
  }
  for (const s of w.stacks) {
    if (!s.mantle || s.canopyDrying?.tick === w.tick) continue;
    const a = w.actors.find((a) => a.id === s.owner),
      p = a?.position ?? s.position;
    const roof = canopyCover(w, p, a?.radius ?? 0);
    if (!roof) continue;
    const ambient = forestClimate(w, p).rain ?? 0,
      rain = ambient * canopyTransmission(roof),
      before = s.mantle.moisture;
    s.mantle.moisture = v7RoundNumber(
      Math.max(
        0,
        Math.min(1, rain <= 0.15 ? before - 0.02 : before + 0.1 * rain),
      ),
    );
    s.canopyDrying = {
      tick: w.tick,
      canopy: roof.id,
      before,
      after: s.mantle.moisture,
      rain,
      ambientRain: ambient,
    };
    if (!s.mantle.equipped) {
      s.mantle.lastTick = w.tick;
      forestEvent(
        w,
        'rain-canopy-exposure-measured',
        'An actual unequipped mantle changed moisture under geometric roof coverage; no warmth or experience is implied.',
        p,
        a?.id ?? null,
        { ...s.canopyDrying, item: s.id, equipped: false, avoidedCooling: 0 },
        roof.id,
      );
      const e = w.events.at(-1);
      if (e) e.interface = 'rain-canopy-work';
    }
  }
}
