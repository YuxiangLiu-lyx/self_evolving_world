/** Observatory camera framing. The camera is a square of `size` world units along the
 * stage's shorter side, centred like an SVG `viewBox` with the default `meet` scaling.
 * Maps up to twice as wide as tall (every archive before the culture v2 villages, 24 x 24
 * and 48 x 36) keep the historical square framing at the origin, so they render exactly as
 * before; wider maps are fitted to the stage and centred. */
export interface ObservatoryCamera {
  x: number;
  y: number;
  size: number;
}
export interface Extent {
  width: number;
  height: number;
}
/** The widest zoom of the historical observatory. */
export const HISTORICAL_ZOOM_LIMIT = 48;
export function wideMap(map: Extent): boolean {
  return map.width > 2 * map.height;
}
/** The whole-map view of the Fit button. */
export function fitCamera(map: Extent, stage: Extent): ObservatoryCamera {
  const short = Math.min(stage.width, stage.height);
  if (!wideMap(map) || short <= 0)
    return { x: 0, y: 0, size: Math.max(map.width, map.height) };
  const size =
    short * Math.max(map.width / stage.width, map.height / stage.height);
  return {
    x: map.width / 2 - size / 2,
    y: map.height / 2 - size / 2,
    size,
  };
}
/** The widest zoom-out: the historical limit, or the whole map when it is larger. */
export function zoomLimit(map: Extent): number {
  return Math.max(HISTORICAL_ZOOM_LIMIT, map.width, map.height);
}
/** The minimap's camera rectangle: the historical square, or on a wide map the area the
 * stage actually shows. */
export function cameraRect(
  camera: ObservatoryCamera,
  map: Extent,
  stage: Extent,
): ObservatoryCamera & { height: number } {
  const short = Math.min(stage.width, stage.height);
  if (!wideMap(map) || short <= 0) return { ...camera, height: camera.size };
  const width = (camera.size * stage.width) / short,
    height = (camera.size * stage.height) / short;
  return {
    x: camera.x + camera.size / 2 - width / 2,
    y: camera.y + camera.size / 2 - height / 2,
    size: width,
    height,
  };
}
/** The world point under a click on a minimap drawn with `viewBox="0 0 width height"` and
 * the default `meet` scaling, which letterboxes the map inside its box. */
export function minimapPoint(
  click: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  map: Extent,
): { x: number; y: number } {
  const scale = Math.min(box.width / map.width, box.height / map.height),
    left = box.left + (box.width - map.width * scale) / 2,
    top = box.top + (box.height - map.height * scale) / 2,
    clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  return {
    x: clamp((click.x - left) / scale, map.width),
    y: clamp((click.y - top) / scale, map.height),
  };
}
