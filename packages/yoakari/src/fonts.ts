// The theme's fonts (option `webFonts`), served from the site itself: nothing is fetched from Google (out of
// reach for many readers in China) or from any other host, at build time or in the browser.
//
// Body text: 资源圆体 (Resource Han Rounded CN, SIL OFL 1.1, full fonts in ../fonts). A build cuts it down to the
// characters the site's pages use, one small file per weight for the whole site (the way Firefly does it): for a
// blog that is a few hundred KB, against megabytes per page for the same font split by character range. Pages
// carry placeholders for the files' URLs until the build knows them; `astro dev` serves the full fonts.
// Code: JetBrains Mono from @fontsource (Latin, a few small slices), bundled into the site's CSS.
/// <reference path="./subset-font.d.ts" />
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

export const BODY_FAMILY = 'Resource Han Rounded CN';
/** The weights the theme uses (its few 500s render as 400). */
const WEIGHTS = { 400: 'Regular', 700: 'Bold' } as const;
type Weight = keyof typeof WEIGHTS;
const weights = Object.keys(WEIGHTS).map(Number) as Weight[];

const fontFile = (w: Weight) => fileURLToPath(new URL(`../fonts/ResourceHanRoundedCN-${WEIGHTS[w]}.woff2`, import.meta.url));
const placeholder = (w: Weight) => `__YOAKARI_BODY_FONT_${w}__`;

/** @font-face rules of the body font, inlined in every page: the full fonts in dev, placeholders in a build. */
export function bodyFontCss(dev: boolean, base: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return weights
    .map((w) => {
      const url = dev ? `${root}@fs/${fontFile(w).replace(/\\/g, '/').replace(/^\//, '')}` : placeholder(w);
      return `@font-face{font-family:"${BODY_FAMILY}";font-style:normal;font-weight:${w};font-display:swap;src:url("${url}") format("woff2")}`;
    })
    .join('');
}

/** Characters shown by the theme's widgets that only appear once their script runs (not in the built pages). */
const CLIENT_SOURCES = ['components/Search.svelte', 'components/Bangumi.svelte'];
/** Always kept: printable ASCII and common Chinese punctuation, for text typed into the search or loaded later. */
const ALWAYS = `${Array.from({ length: 0x5f }, (_, i) => String.fromCharCode(0x20 + i)).join('')}，。、！？：；“”‘’（）《》〈〉「」『』【】〔〕—…～·`;

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(quot|amp|lt|gt|nbsp|apos);/g, (_, name: string) => ({ quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" })[name] as string);

export interface FontBuild {
  /** The build's output folder. */
  outDir: URL;
  /** Site base path and Astro's assets folder (`build.assets`), for the URLs of the files. */
  base: string;
  assetsDir: string;
  /** Pages whose text is left out of the subset (the studio: its own interface, not something readers see). */
  skip: (htmlPath: string) => boolean;
}

/**
 * After a build: collects the characters of every page, writes one subset of the body font per weight into the
 * assets folder (named by content hash, so it can be cached for good) and puts the files' URLs into the pages.
 * Characters the font lacks (emoji and the like) are drawn by the next font in `--font-body`.
 */
export async function subsetBodyFont({ outDir, base, assetsDir, skip }: FontBuild) {
  const root = fileURLToPath(outDir);
  const pages = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.html'));
  const html = new Map(await Promise.all(pages.map(async (p) => [p, await readFile(join(root, p), 'utf8')] as const)));

  const chars = new Set(ALWAYS);
  for (const [page, text] of html) if (!skip(page)) for (const c of decodeEntities(text)) chars.add(c);
  for (const file of CLIENT_SOURCES) for (const c of await readFile(new URL(file, import.meta.url), 'utf8')) if (c > '\u007f') chars.add(c);
  const text = [...chars].filter((c) => c >= ' ').join('');

  const prefix = `${base.endsWith('/') ? base : `${base}/`}${assetsDir}/fonts/`;
  await mkdir(join(root, assetsDir, 'fonts'), { recursive: true });
  const urls = new Map<Weight, string>();
  const sizes: number[] = [];
  for (const w of weights) {
    const subset = await subsetFont(await readFile(fontFile(w)), text, { targetFormat: 'woff2' });
    const name = `resource-han-rounded-${w}.${createHash('sha256').update(subset).digest('hex').slice(0, 10)}.woff2`;
    await writeFile(join(root, assetsDir, 'fonts', name), subset);
    urls.set(w, prefix + name);
    sizes.push(subset.length);
  }

  let pagesWithFonts = 0;
  await Promise.all(
    [...html].map(async ([page, text]) => {
      if (!text.includes(placeholder(400))) return;
      let out = text;
      for (const [w, url] of urls) out = out.replaceAll(placeholder(w), url);
      await writeFile(join(root, page), out);
      pagesWithFonts++;
    }),
  );
  if (!pagesWithFonts) throw new Error('yoakari: no built page has the body font placeholders, so the subset fonts would go unused');
  return { characters: text.length, sizes, pages: pagesWithFonts };
}

/** JetBrains Mono's stylesheets (absolute paths: the site cannot resolve the theme's dependencies). */
export function monoStylesheets(): string[] {
  const require = createRequire(import.meta.url);
  return [400, 600].map((w) => require.resolve(`@fontsource/jetbrains-mono/${w}.css`));
}

/**
 * Trims the @fontsource stylesheets: drops the old `woff` copy listed after each `woff2` (every browser the
 * theme supports takes woff2, so the woff files would only sit in the build), and keeps the small slices as
 * files instead of base64 in the CSS.
 */
export function fontCssPlugin() {
  return {
    name: 'yoakari:fonts',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!/[\\/]@fontsource[\\/][^?]+\.css$/.test(id)) return;
      const out = code.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, '').replace(/\.woff2\)/g, '.woff2?no-inline)');
      if (/\.woff\)/.test(out)) throw new Error(`yoakari: ${id} lists its fonts in a way the theme does not know; the woff copies were not removed`);
      return out;
    },
  };
}
