export interface Sprite {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  foot: number;
}
export interface Art {
  trees: Sprite;
  rock: Sprite;
  herb: Sprite;
  pebbles: Sprite;
  leaves: Sprite;
  water: Sprite;
  ground: Sprite;
  people: Record<string, Sprite[]>;
}
const base = './presentation/ex9/assets/';
async function sheet(file: string, keyed = false): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = new URL(base + file, location.href).href;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas is unavailable.');
  c.drawImage(image, 0, 0);
  if (keyed) {
    const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i] ?? 0,
        g = pixels.data[i + 1] ?? 0,
        b = pixels.data[i + 2] ?? 0;
      if (r > 65 && b > 65 && g < Math.min(r, b) * 0.84) pixels.data[i + 3] = 0;
    }
    c.putImageData(pixels, 0, 0);
  }
  return canvas;
}
function crop(
  image: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  trim = true,
): Sprite {
  const context = image.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  if (!trim) return { image, x, y, width, height, foot: width / 2 };
  const pixels = context.getImageData(x, y, width, height).data;
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++)
      if ((pixels[(row * width + col) * 4 + 3] ?? 0) > 120) {
        left = Math.min(left, col);
        right = Math.max(right, col);
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
  if (right <= left || bottom <= top)
    throw new Error('Missing source sprite pixels.');
  let sum = 0,
    count = 0;
  for (
    let row = Math.max(top, bottom - Math.round((bottom - top) * 0.06));
    row <= bottom;
    row++
  )
    for (let col = left; col <= right; col++)
      if ((pixels[(row * width + col) * 4 + 3] ?? 0) > 120) {
        sum += col;
        count++;
      }
  return {
    image,
    x: x + left,
    y: y + top,
    width: right - left + 1,
    height: bottom - top + 1,
    foot: (count ? sum / count : (left + right) / 2) - left,
  };
}
export async function loadArt(): Promise<Art> {
  const [trees, details, ground, field, elder] = await Promise.all([
    sheet('trees.png', true),
    sheet('details.png', true),
    sheet('materials.png'),
    sheet('field-people.png'),
    sheet('elder.png'),
  ]);
  const cell = (image: HTMLCanvasElement, n: number) => {
    const x = Math.round((n % 4) * 313.5),
      y = Math.round(Math.floor(n / 4) * 313.5);
    return crop(
      image,
      x,
      y,
      Math.round(((n % 4) + 1) * 313.5) - x,
      Math.round((Math.floor(n / 4) + 1) * 313.5) - y,
    );
  };
  const actors = (image: HTMLCanvasElement, first: number, rows: number[]) =>
    Array.from({ length: 8 }, (_, i) => {
      const row = first + Math.floor(i / 4),
        y = rows[row] ?? 0,
        end = rows[row + 1] ?? image.height;
      return crop(image, (i % 4) * 256, y, 256, end - y);
    });
  return {
    trees: cell(trees, 4),
    rock: cell(details, 3),
    herb: cell(details, 6),
    pebbles: cell(details, 13),
    leaves: cell(details, 14),
    water: crop(details, 0, 940, 313, 313, false),
    ground: crop(ground, 627, 0, 627, 627, false),
    people: {
      lin: actors(field, 2, [0, 256, 512, 768, 1024, 1280, 1536]),
      moss: actors(field, 4, [0, 256, 512, 768, 1024, 1280, 1536]),
      sol: actors(elder, 4, [0, 249, 494, 751, 1006, 1251, 1536]),
    },
  };
}
export function sprite(
  c: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  height: number,
  flip = false,
): void {
  const scale = height / s.height;
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  c.drawImage(
    s.image,
    s.x,
    s.y,
    s.width,
    s.height,
    -s.foot * scale,
    -height,
    s.width * scale,
    height,
  );
  c.restore();
}
