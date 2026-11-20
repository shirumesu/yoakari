// Markdown → HTML for the studio's preview, with the same plugins as the site's build (see index.ts):
// GFM, smartypants, math, directives and the theme's own callouts / spoilers / ruby, KaTeX, heading ids.
// Code blocks get Shiki with the site's themes instead of Expressive Code, which only runs at build time.
import DOMPurify from 'dompurify';
import GithubSlugger from 'github-slugger';
import type { Element, Root as Hast } from 'hast';
import type { Root as Mdast, RootContent } from 'mdast';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkSmartypants from 'remark-smartypants';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { rehypeYoakari } from '../../markdown/rehype-yoakari.ts';
import { remarkYoakari } from '../../markdown/remark-yoakari.ts';
import { site } from './env.ts';
import { rehypeHighlight } from './highlight.ts';

/** Marks top-level blocks (and list items) with their source line, for keeping the preview level with the editor. */
function remarkLines() {
  return (tree: Mdast) => {
    const mark = (node: RootContent) => {
      if (!node.position) return;
      node.data = { ...node.data, hProperties: { ...(node.data as { hProperties?: object } | undefined)?.hProperties, dataLine: node.position.start.line } };
      if (node.type === 'code' && node.meta) (node.data.hProperties as Record<string, unknown>).dataMeta = node.meta;
    };
    for (const node of tree.children) mark(node);
    visit(tree, 'listItem', (node) => mark(node));
  };
}

const textOf = (el: Element): string => el.children.map((c) => (c.type === 'text' ? c.value : c.type === 'element' ? textOf(c) : '')).join('');

/** Heading ids as Astro makes them (github-slugger over the heading text). */
function rehypeHeadingIds() {
  return (tree: Hast) => {
    const slugger = new GithubSlugger();
    visit(tree, 'element', (el) => {
      if (/^h[1-6]$/.test(el.tagName) && !el.properties.id) el.properties.id = slugger.slug(textOf(el));
    });
  };
}

export type ResolveAsset = (name: string) => string | undefined;

/** Images next to the post (`./cover.webp`, `shot.png`) → URLs the studio can show. */
function rehypeAssets(resolve: ResolveAsset) {
  return (tree: Hast) => {
    visit(tree, 'element', (el) => {
      if (el.tagName !== 'img' || typeof el.properties.src !== 'string') return;
      const src = el.properties.src;
      if (/^([a-z][\w+.-]*:|\/|#)/i.test(src)) return; // URLs and site paths load as they are
      const name = decodeURI(src.replace(/^\.\//, ''));
      const url = resolve(name);
      if (url) el.properties.src = url;
      else {
        el.properties.src = '';
        el.properties.dataMissing = name;
      }
    });
  };
}

const base = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkMath)
  .use(remarkDirective)
  .use(remarkYoakari)
  .use(site.breaks ? [remarkBreaks] : [])
  .use(remarkLines)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeYoakari)
  .use(rehypeHeadingIds)
  .use(rehypeHighlight)
  .freeze();

/**
 * The preview renders inside the studio page, which holds the GitHub token in localStorage, so a post's raw
 * HTML (an imported file, or one someone else committed) must not run code as this origin. DOMPurify is
 * the standard tool for that: it drops scripts, event handlers and javascript: URLs, including the forms
 * browsers read through whitespace and control characters (`java&#x09;script:`), which a hand-written
 * filter misses. On top of its defaults:
 * - kept: embeds from other sites (<iframe src=…>, never srcdoc), the callout icons (<svg><use href=#…>),
 *   the MathML that KaTeX writes for screen readers, and blob: images (the post's own pictures) on <img>
 *   only. A blob: URL in an iframe would run an SVG's scripts as this origin.
 * - dropped: <style> and <form>, which could restyle or fake parts of the studio around the preview.
 * Inline styles stay; studio.css keeps fixed-position content inside the preview pane.
 */
const purify = DOMPurify();
purify.addHook('uponSanitizeAttribute', (node, data) => {
  if (node.nodeName === 'IMG' && data.attrName === 'src' && data.attrValue.startsWith('blob:')) data.forceKeepAttr = true;
});
const PURIFY = {
  ADD_TAGS: ['iframe', 'use', 'semantics', 'annotation'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'loading', 'referrerpolicy'],
  FORBID_TAGS: ['style', 'form'],
  FORBID_ATTR: ['form', 'formaction', 'srcdoc'],
};

export async function render(markdown: string, resolve: ResolveAsset): Promise<string> {
  const file = await base().use(rehypeAssets, resolve).use(rehypeStringify).process(markdown);
  return purify.sanitize(String(file), PURIFY);
}
