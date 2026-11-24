import type { V7World, V7Point, V7Data, V7Object } from './continuous-types.js';
import { v7Id, v7RoundNumber } from './continuous-data.js';
import { v7Interior } from './continuous-geometry.js';
import { openConditions } from './open-physical.js';
import { longPressure } from './long-pressure.js';

export function forestEvent(
  world: V7World,
  type: string,
  description: string,
  position: V7Point,
  actor: string | null = null,
  data: V7Data = {},
  target: string | null = null,
): void {
  world.events.push({
    id: v7Id(world, 'event'),
    tick: world.tick,
    type,
    description,
    position: { ...position },
    actor,
    target,
    data,
    interface: null,
    success: true,
  });
}
/** One round is one simulation time unit. Time is deliberately accelerated relative to ecology.
 * `airHumidity` is part of the climate wherever ex10's food moisture model is installed. The
 * opt-in food water representation requests it explicitly (`airHumidity = true`) for its own
 * exchange, so the climate that ordinary agents observe is unchanged in that scope. */
export function forestClimate(
  world: V7World,
  position: V7Point,
  airHumidity = false,
) {
  const settings = world.config.forest;
  if (!settings)
    throw new Error(
      'Forest climate requires a versioned forest configuration.',
    );
  const phase =
    (((world.time % settings.year) + settings.year) % settings.year) /
    settings.year;
  const daylight = Math.max(
    0,
    Math.sin(2 * Math.PI * (world.time / settings.day + 0.05)),
  );
  const ground =
    world.terrain[Math.floor(position.y)]?.[Math.floor(position.x)] ?? '.';
  const seasonal = 11 * Math.sin(2 * Math.PI * phase);
  const weather =
    2 * Math.sin((world.time * Math.PI) / 113 + (world.config.seed % 19));
  const region =
    ground === ':' ? -3 : ground === ',' ? -1.5 : ground === 'f' ? 0.5 : 1.5;
  const pressure = longPressure(world);
  let temperature =
    14 +
    seasonal +
    weather +
    region +
    4 * (daylight - 0.4) +
    (world.config.development?.climateOffset ?? 0) -
    (pressure?.cold ?? 0);
  let light = daylight * (0.65 + Math.max(-0.35, seasonal / 30));
  let moisture =
    ground === ',' || ground === '=' ? 0.9 : ground === ':' ? 0.25 : 0.65;
  if (world.config.development)
    moisture = openConditions(world, position).moisture;
  let indoor = false;
  for (const object of world.objects) {
    if (!v7Interior(position, object.spatial)) continue;
    indoor = true;
    // This reviewed windbreak changes bodily cold exposure, not ambient heat or growth conditions.
    if (object.kind === 'insulating-shelter') continue;
    const buffering =
      object.kind === 'cave' ? 0.72 : Number(object.data.buffering ?? 0.35);
    temperature += (12 - temperature) * buffering;
    temperature += Number(object.data.heating ?? 0);
    light = Math.max(light * 0.15, Number(object.data.light ?? 0));
    moisture = Number(object.data.moisture ?? moisture);
  }
  const rain = Math.max(
    pressure?.rain ?? 0,
    0,
    Math.sin(world.time / 37 + (world.config.seed % 11)),
  );
  const wind = 0.5 + 0.5 * Math.sin(world.time / 53 + (world.config.seed % 7));
  if (world.config.experience && !indoor)
    temperature -= world.config.experience.exposure * (rain + wind);
  return {
    ...(pressure ? { pressure } : {}),
    ...(world.state.foodPreservation === 1 || airHumidity
      ? {
          airHumidity: v7RoundNumber(
            Math.max(0, Math.min(1, 0.65 + 0.2 * rain - 0.1 * wind)),
          ),
        }
      : {}),
    ...(world.config.development
      ? { local: openConditions(world, position) }
      : {}),
    ...(world.config.experience
      ? {
          rain: v7RoundNumber(rain),
          wind: v7RoundNumber(wind),
          exposure: indoor ? 'buffered' : 'outdoors',
        }
      : {}),
    temperature: v7RoundNumber(temperature),
    light: v7RoundNumber(light),
    moisture,
    indoor,
    phase,
    season:
      ['spring', 'summer', 'autumn', 'winter'][Math.floor(phase * 4)] ??
      'spring',
    daylight: v7RoundNumber(daylight),
    trend:
      Math.cos(2 * Math.PI * phase) >= 0
        ? 'gradually warming'
        : 'gradually cooling',
  };
}

/** Temperature/light/water constraints remain locally alterable by reviewed physical mechanisms. */
export function forestGrowth(world: V7World, object: V7Object): number {
  const resource = world.resources.find((r) => r.id === object.data.resource),
    p = resource?.properties;
  if (!p) return 0;
  const climate = forestClimate(world, object.spatial);
  const temperature = climate.temperature + Number(object.data.warming ?? 0);
  const light = Math.max(climate.light, Number(object.data.light ?? 0));
  const moisture = Number(object.data.moisture ?? climate.moisture);
  return (
    (longPressure(world)?.growth ?? 1) *
    (world.config.experience
      ? world.config.experience.growthScale /
        (1 + Number(object.data.depletion ?? 0) / 20)
      : 1) *
    Math.max(
      0,
      Math.min(
        1,
        (temperature - p.minGrowth) /
          Math.max(1, p.optimalGrowth - p.minGrowth),
      ),
    ) *
    light *
    Math.min(1, moisture / Math.max(0.1, p.moisture))
  );
}
