// Code highlighting for the preview with Shiki and the themes the site's code blocks use (Expressive Code:
// rose-pine-dawn / rose-pine-moon). Each language is its own chunk, loaded the first time a block needs it.
import type { Element, Root } from 'hast';
import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

type Loader = () => Promise<{ default: LanguageInput }>;
const L = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  astro: () => import('shiki/langs/astro.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  nginx: () => import('shiki/langs/nginx.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
} satisfies Record<string, Loader>;
type Lang = keyof typeof L;

const ALIASES: Record<string, Lang> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', mts: 'typescript', cts: 'typescript',
  yml: 'yaml', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', shell: 'shellscript', console: 'shellscript',
  ps1: 'powershell', ps: 'powershell', py: 'python', rs: 'rust', golang: 'go', 'c++': 'cpp', cs: 'csharp', kt: 'kotlin',
  rb: 'ruby', md: 'markdown', dockerfile: 'docker', conf: 'ini', gql: 'graphql',
};

const resolveLang = (lang: string): Lang | undefined => (lang in L ? (lang as Lang) : ALIASES[lang]);

let highlighter: Promise<HighlighterCore> | undefined;
const loaded = new Set<Lang>();

async function load(lang: Lang) {
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/rose-pine-dawn.mjs'), import('shiki/themes/rose-pine-moon.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  const h = await highlighter;
  if (!loaded.has(lang)) {
    await h.loadLanguage((await L[lang]()).default);
    loaded.add(lang);
  }
  return h;
}

const textOf = (el: Element): string => el.children.map((c) => (c.type === 'text' ? c.value : c.type === 'element' ? textOf(c) : '')).join('');

/** Rehype plugin: `<pre><code class="language-x">` → highlighted `<figure class="st-code">`, like the site's frames. */
export function rehypeHighlight() {
  return async (tree: Root) => {
    const jobs: Array<Promise<void>> = [];
    const visitNode = (node: Root | Element) => {
      node.children.forEach((child, i) => {
        if (child.type !== 'element') return;
        const code = child.tagName === 'pre' ? child.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code') : undefined;
        if (!code) return visitNode(child);
        const cls = (code.properties.className as string[] | undefined) ?? [];
        const raw = cls.find((c) => c.startsWith('language-'))?.slice(9).toLowerCase();
        if (raw === 'math') return; // rehype-katex renders these
        const meta = String(code.properties.dataMeta ?? '');
        const title = /title=(["'])(.*?)\1/.exec(meta)?.[2];
        const line = code.properties.dataLine;
        const lang = raw ? resolveLang(raw) : undefined;
        const source = textOf(code).replace(/\n$/, '');
        jobs.push(
          (async () => {
            let pre: Element;
            if (lang) {
              const h = await load(lang);
              const hast = h.codeToHast(source, { lang, themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' }, defaultColor: false });
              pre = hast.children[0] as Element;
            } else {
              pre = { type: 'element', tagName: 'pre', properties: { className: ['shiki', 'plain'] }, children: [{ type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: source }] }] };
            }
            node.children[i] = {
              type: 'element',
              tagName: 'figure',
              properties: { className: ['st-code'], dataLine: line },
              children: [
                ...(title || raw ? [{ type: 'element' as const, tagName: 'figcaption', properties: {}, children: [
                  { type: 'element' as const, tagName: 'span', properties: { className: ['st-code-title'] }, children: [{ type: 'text' as const, value: title ?? '' }] },
                  { type: 'element' as const, tagName: 'span', properties: { className: ['st-code-lang'] }, children: [{ type: 'text' as const, value: raw ?? '' }] },
                ] }] : []),
                pre,
              ],
            };
          })(),
        );
      });
    };
    visitNode(tree);
    await Promise.all(jobs);
  };
}
