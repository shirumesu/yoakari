import { dirname, resolve } from 'node:path';
import type { Element, Root } from 'hast';
import sharp from 'sharp';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { placeholder } from '../utils/lqip.ts';

/** Widths made of a post's own images, up to twice the post column (Astro skips those above the original). */
const WIDTHS = [480, 720, 960, 1280, 1760];
/** The post column: full width below the two-column layout, at most about 880px beside the sidebar. */
const SIZES = '(max-width: 960px) 100vw, 880px';

/**
 * A post's own images (the relative paths Astro optimises, as `./photo.jpg` next to the Markdown file) get a
 * srcset sized for the post column, so phones download a small file, and the placeholder colours shown while
 * they load. Runs before Astro's own image step, which passes these properties to getImage().
 */
export const rehypePostImages: Plugin<[], Root> = () => {
  return async (tree, file) => {
    const local = new Set((file.data.astro as { localImagePaths?: string[] } | undefined)?.localImagePaths);
    if (!local.size) return;
    const images: Element[] = [];
    visit(tree, 'element', (node) => {
      if (node.tagName === 'img' && typeof node.properties.src === 'string' && local.has(decodeURI(node.properties.src))) images.push(node);
    });
    await Promise.all(
      images.map(async (img) => {
        // getImage() options for Astro's next step, not HTML attributes (hast types `widths` as the SVG one)
        const options: Record<string, unknown> = img.properties;
        options.widths = WIDTHS;
        options.sizes = SIZES;
        const src = decodeURI(img.properties.src as string);
        // aliases such as `@/assets/x.png` would need Vite's resolver; those only get the srcset
        if (!src.startsWith('./') && !src.startsWith('../')) return;
        const path = resolve(dirname(file.path), src);
        const [bg, { width }] = await Promise.all([placeholder(path), sharp(path).metadata()]).catch((err: Error) => {
          throw new Error(`${file.path}: cannot read the image ${src}: ${err.message}`);
        });
        if (bg) img.properties.style = `background:${bg}`;
        // the plain `src` is the largest srcset file rather than one more at the full size of a big photo
        options.width = Math.min(width, Math.max(...WIDTHS));
      }),
    );
  };
};
