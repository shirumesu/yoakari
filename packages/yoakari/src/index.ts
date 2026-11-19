import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import type { AstroIntegration } from 'astro';
import expressiveCode from 'astro-expressive-code';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import { parseConfig, type YoakariUserConfig } from './config.ts';
import { rehypeYoakari } from './markdown/rehype-yoakari.ts';
import { remarkYoakari } from './markdown/remark-yoakari.ts';

export type { YoakariUserConfig } from './config.ts';

/** Routes the theme provides. A site that has its own file for the same route keeps its own. */
const ROUTES: Array<[pattern: string, file: string]> = [
  ['/', 'index'],
  ['/page/[page]', 'page/[page]'],
  ['/posts/[...slug]', 'posts/[...slug]'],
  ['/archive', 'archive'],
  ['/tags/[tag]', 'tags/[tag]'],
  ['/categories/[category]', 'categories/[category]'],
  ['/rss.xml', 'rss.xml'],
  ['/404', '404'],
];
const PAGE_EXTENSIONS = ['.astro', '.md', '.mdx', '.ts', '.js', '.html'];

export default function yoakari(userConfig: YoakariUserConfig): AstroIntegration {
  const config = parseConfig(userConfig);

  return {
    name: 'yoakari',
    hooks: {
      'astro:config:setup': ({ config: astroConfig, injectRoute, updateConfig, logger }) => {
        if (!astroConfig.site) {
          throw new Error('yoakari: set `site` in astro.config (RSS, sitemap and canonical links need the full URL).');
        }

        for (const [pattern, file] of ROUTES) {
          const own = PAGE_EXTENSIONS.some((ext) => existsSync(new URL(`pages/${file}${ext}`, astroConfig.srcDir)));
          if (own) logger.info(`${pattern}: using the site's own page`);
          else injectRoute({ pattern, entrypoint: `astro-yoakari/routes/${file}${file === 'rss.xml' ? '.ts' : '.astro'}` });
        }
        // optional pages: only built when configured, at the path the site chose
        if (config.bookmarks) injectRoute({ pattern: config.bookmarks.path.replace(/\/$/, ''), entrypoint: 'astro-yoakari/routes/bookmarks.astro' });
        if (config.bangumi) injectRoute({ pattern: config.bangumi.path.replace(/\/$/, ''), entrypoint: 'astro-yoakari/routes/bangumi.astro' });

        const customCss = config.customCss.map((path) =>
          path.startsWith('.') || path.startsWith('/') ? fileURLToPath(new URL(path, astroConfig.root)) : path,
        );

        updateConfig({
          // Expressive Code has to come before MDX so that code blocks in .mdx are handled too.
          integrations: [
            expressiveCode({
              themes: ['rose-pine-dawn', 'rose-pine-moon'],
              useDarkModeMediaQuery: false,
              themeCssSelector: (theme) => (theme.type === 'dark' ? '[data-dark="1"]' : '[data-dark="0"]'),
              styleOverrides: {
                borderRadius: '12px',
                borderColor: 'var(--line)',
                codeFontFamily: 'var(--font-mono)',
                codeFontSize: '13.5px',
                codeLineHeight: '1.75',
                uiFontFamily: 'var(--font-body)',
                codeBackground: 'var(--code-bg)',
                frames: {
                  editorTabBarBackground: 'var(--card)',
                  editorActiveTabBackground: 'var(--code-bg)',
                  editorActiveTabIndicatorTopColor: 'var(--primary)',
                  terminalTitlebarBackground: 'var(--card)',
                  terminalBackground: 'var(--code-bg)',
                  frameBoxShadowCssValue: 'none',
                },
              },
            }),
            mdx(),
            sitemap(),
            svelte(),
          ],
          // Astro 7 defaults to Sätteri; the extensions below (directives, math) only exist as remark plugins.
          markdown: {
            processor: unified({
              remarkPlugins: [remarkMath, remarkDirective, remarkYoakari, ...(config.breaks ? [remarkBreaks] : [])],
              rehypePlugins: [rehypeKatex, rehypeYoakari],
            }),
          },
          vite: { plugins: [virtualModules(config, customCss)] },
        });
      },

      'astro:config:done': ({ injectTypes }) => {
        injectTypes({
          filename: 'yoakari.d.ts',
          content: `declare module 'virtual:yoakari/config' {
  const config: import('astro-yoakari/config').YoakariConfig;
  export default config;
}
declare module 'virtual:yoakari/custom-css' {}`,
        });
      },

      'astro:build:done': async ({ dir, logger }) => {
        const pagefind = await import('pagefind');
        const { index, errors } = await pagefind.createIndex({});
        if (!index) throw new Error(`yoakari: could not start Pagefind: ${errors.join('; ')}`);
        const added = await index.addDirectory({ path: fileURLToPath(dir) });
        if (added.errors.length) throw new Error(`yoakari: Pagefind indexing failed: ${added.errors.join('; ')}`);
        const written = await index.writeFiles({ outputPath: fileURLToPath(new URL('pagefind/', dir)) });
        if (written.errors.length) throw new Error(`yoakari: Pagefind could not write the index: ${written.errors.join('; ')}`);
        await pagefind.close();
        logger.info(`search index: ${added.page_count} pages`);
      },
    },
  };
}

function virtualModules(config: ReturnType<typeof parseConfig>, customCss: string[]) {
  const modules: Record<string, string> = {
    'virtual:yoakari/config': `export default ${JSON.stringify(config)};`,
    'virtual:yoakari/custom-css': customCss.map((p) => `import ${JSON.stringify(p)};`).join('\n'),
  };
  return {
    name: 'yoakari:virtual',
    resolveId(id: string) {
      if (id in modules) return `\0${id}`;
    },
    load(id: string) {
      if (id.startsWith('\0') && id.slice(1) in modules) return modules[id.slice(1)];
    },
  };
}
