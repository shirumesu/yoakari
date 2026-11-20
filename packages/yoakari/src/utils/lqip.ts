// Placeholder colours for an image while it loads (a "LQIP", as Firefly and cosine's blog do it): the image
// shrunk to 2×2 pixels, drawn as a diagonal gradient behind it. Computed at build time; the page carries only
// a short CSS gradient. Used on covers, the hero and a post's own images.
import type { ImageMetadata } from 'astro';
import sharp from 'sharp';

const cache = new Map<string, Promise<string | null>>();

/**
 * CSS gradient for the image file at `path`, or null when the image has transparent parts (the gradient
 * would show through them once the image is there) or is an SVG (drawn at once, nothing to wait for).
 */
export function placeholder(path: string): Promise<string | null> {
  let colours = cache.get(path);
  if (!colours) {
    colours = gradientOf(path);
    cache.set(path, colours);
  }
  return colours;
}

/**
 * The file an image imported by Astro came from. Astro sets it on every imported image (in dev and in builds)
 * but leaves it out of the public type.
 */
export function sourceOf(image: ImageMetadata): string {
  const path = (image as ImageMetadata & { fsPath?: unknown }).fsPath;
  if (typeof path !== 'string') throw new Error(`yoakari: Astro did not say which file the image ${image.src} comes from (fsPath), which the placeholder colours need`);
  return path;
}

async function gradientOf(path: string) {
  if (/\.svg$/i.test(path)) return null;
  const image = sharp(path);
  if (!(await image.stats()).isOpaque) return null;
  const { data, info } = await image.resize(2, 2, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (i: number) => [0, 1, 2].map((c) => data[i * info.channels + c]);
  const hex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  // top left → (top right + bottom left) → bottom right
  const [tl, tr, bl, br] = [0, 1, 2, 3].map(pixel);
  const middle = tr.map((v, c) => (v + bl[c]) / 2);
  return `linear-gradient(135deg,${hex(tl)},${hex(middle)},${hex(br)})`;
}
