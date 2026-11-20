import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import type { AstroIntegration } from 'astro';
import expressiveCode from 'astro-expressive-code';
// imported up front: a dynamic import() in build:done would go through Vite's module runner, closed by then
import * as pagefind from 'pagefind';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import { parseEnv } from 'node:util';
import { z } from 'astro/zod';
import { configSchema, parseConfig, type YoakariConfig, type YoakariUserConfig } from './config.ts';
import { bodyFontCss, type FontBuild, fontCssPlugin, monoStylesheets, subsetBodyFont } from './fonts.ts';
import { rehypePostImages } from './markdown/rehype-post-images.ts';
import { rehypeYoakari } from './markdown/rehype-yoakari.ts';
import { remarkYoakari } from './markdown/remark-yoakari.ts';
import { devAuthMiddleware } from './studio/dev-auth.ts';

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

/** Read when `yoakari()` gets no options. Keeping the options in this file lets the studio's settings page edit them. */
export const CONFIG_FILE = 'yoakari.config.json';

/** What the studio page needs to know at build time (virtual:yoakari/studio). */
export interface StudioBuildInfo {
  /** Path of the options file relative to the site folder, or null when the options are written in astro.config. */
  configFile: string | null;
  /** The options file as written (without defaults filled in), so the settings page starts from what is in the repo. */
  configText: string | null;
}

/**
 * `yoakari({...})` takes the options inline; `yoakari()` reads them from `yoakari.config.json`
 * next to astro.config (that is the form the studio's settings page can edit).
 */
export default function yoakari(userConfig?: YoakariUserConfig): AstroIntegration {
  const inline = userConfig === undefined ? undefined : parseConfig(userConfig);
  /** Set by a build with `webFonts`: where the body font subsets go once the pages are written. */
  let fontBuild: Omit<FontBuild, 'outDir'> | null = null;

  return {
    name: 'yoakari',
    hooks: {
      'astro:config:setup': ({ config: astroConfig, command, injectRoute, updateConfig, addWatchFile, logger }) => {
        if (!astroConfig.site) {
          throw new Error('yoakari: set `site` in astro.config (RSS, sitemap and canonical links need the full URL).');
        }
        const studioInfo: StudioBuildInfo = { configFile: null, configText: null };
        let config: YoakariConfig;
        if (inline) config = inline;
        else {
          const file = new URL(CONFIG_FILE, astroConfig.root);
          if (!existsSync(file)) throw new Error(`yoakari: no options given and ${CONFIG_FILE} not found next to astro.config`);
          const text = readFileSync(file, 'utf8');
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch (err) {
            throw new Error(`yoakari: ${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`);
          }
          config = parseConfig(json);
          addWatchFile(file);
          studioInfo.configFile = CONFIG_FILE;
          studioInfo.configText = text;
        }
        // JSON Schema of the options file, for editor completion: "$schema": "./.astro/yoakari.schema.json"
        const dotAstro = new URL('.astro/', astroConfig.root);
        mkdirSync(dotAstro, { recursive: true });
        writeFileSync(new URL('yoakari.schema.json', dotAstro), `${JSON.stringify(z.toJSONSchema(configSchema, { io: 'input' }), null, 2)}\n`);

        for (const [pattern, file] of ROUTES) {
          const own = PAGE_EXTENSIONS.some((ext) => existsSync(new URL(`pages/${file}${ext}`, astroConfig.srcDir)));
          if (own) logger.info(`${pattern}: using the site's own page`);
          else injectRoute({ pattern, entrypoint: `astro-yoakari/routes/${file}${file === 'rss.xml' ? '.ts' : '.astro'}` });
        }
        // optional pages: only built when configured, at the path the site chose
        if (config.bookmarks) injectRoute({ pattern: config.bookmarks.path.replace(/\/$/, ''), entrypoint: 'astro-yoakari/routes/bookmarks.astro' });
        if (config.bangumi) injectRoute({ pattern: config.bangumi.path.replace(/\/$/, ''), entrypoint: 'astro-yoakari/routes/bangumi.astro' });
        if (config.studio) injectRoute({ pattern: '/studio', entrypoint: 'astro-yoakari/routes/studio.astro' });

        // images of the site given as `./path` (relative to the project) go through Astro's image pipeline
        const siteImages = {
          hero: localImage(config.hero.image, astroConfig.root, 'hero.image'),
          avatar: localImage(config.author.avatar, astroConfig.root, 'author.avatar'),
        };

        const fonts = config.webFonts ? { css: bodyFontCss(command === 'dev', astroConfig.base), stylesheets: monoStylesheets() } : { css: '', stylesheets: [] };
        if (config.webFonts && command === 'build') {
          const studioPage = /^studio(?:[\\/]index)?\.html$/;
          fontBuild = { base: astroConfig.base, assetsDir: astroConfig.build.assets, skip: (page) => config.studio !== undefined && studioPage.test(page) };
        }

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
            sitemap({ filter: (page) => !new URL(page).pathname.endsWith('/studio/') }),
            svelte(),
          ],
          // Astro 7 defaults to Sätteri; the extensions below (directives, math) only exist as remark plugins.
          markdown: {
            processor: unified({
              remarkPlugins: [remarkMath, remarkDirective, remarkYoakari, ...(config.breaks ? [remarkBreaks] : [])],
              rehypePlugins: [rehypeKatex, rehypeYoakari, rehypePostImages],
            }),
          },
          vite: {
            plugins: [
              virtualModules(config, customCss, fonts, siteImages, studioInfo),
              fontCssPlugin(),
              // `astro dev` answers /studio/auth/* itself (the deployed site has the Worker for that), reading GITHUB_* from .env
              ...(config.studio && command === 'dev' ? [devAuthMiddleware(devEnv(astroConfig.root))] : []),
            ],
          },
        });
      },

      'astro:config:done': ({ injectTypes }) => {
        injectTypes({
          filename: 'yoakari.d.ts',
          content: `declare module 'virtual:yoakari/config' {
  const config: import('astro-yoakari/config').YoakariConfig;
  export default config;
}
declare module 'virtual:yoakari/custom-css' {}
declare module 'virtual:yoakari/fonts' {
  /** @font-face rules of the body font, to inline in the page's head ('' with \`webFonts: false\`). */
  const css: string;
  export default css;
}
declare module 'virtual:yoakari/images' {
  /** The hero and avatar images when the options give them as \`./path\` (null otherwise: a public/ path or a URL, used as written). */
  const images: { hero: import('astro').ImageMetadata | null; avatar: import('astro').ImageMetadata | null };
  export default images;
}
declare module 'virtual:yoakari/studio' {
  const info: import('astro-yoakari').StudioBuildInfo;
  export default info;
}`,
        });
      },

      'astro:build:done': async ({ dir, logger }) => {
        if (fontBuild) {
          const fonts = await subsetBodyFont({ ...fontBuild, outDir: dir });
          logger.info(`body font: ${fonts.characters} characters, ${fonts.sizes.map((b) => `${Math.round(b / 1024)} KB`).join(' + ')} (${fonts.pages} pages)`);
        }
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

/** process.env plus the project's .env file (astro dev does not put .env into process.env for integrations). */
function devEnv(root: URL): Record<string, string | undefined> {
  const file = new URL('.env', root);
  return { ...process.env, ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}) };
}

/** Absolute path of a site image given as `./path` or `../path` (relative to the project), null for a public/ path or URL. */
function localImage(value: string | undefined, root: URL, option: string): string | null {
  if (!value || !/^\.\.?\//.test(value)) return null;
  const path = fileURLToPath(new URL(value, root));
  if (!existsSync(path)) throw new Error(`yoakari: ${option} is ${value}, but there is no file at ${path}`);
  return path;
}

function virtualModules(
  config: YoakariConfig,
  customCss: string[],
  fonts: { css: string; stylesheets: string[] },
  images: Record<'hero' | 'avatar', string | null>,
  studio: StudioBuildInfo,
) {
  const imports = (paths: string[]) => paths.map((p) => `import ${JSON.stringify(p)};`).join('\n');
  const imageEntries = Object.entries(images);
  const modules: Record<string, string> = {
    'virtual:yoakari/images': [
      ...imageEntries.map(([name, path]) => (path ? `import ${name} from ${JSON.stringify(path)};` : '')),
      `export default { ${imageEntries.map(([name, path]) => `${name}: ${path ? name : 'null'}`).join(', ')} };`,
    ].join('\n'),
    'virtual:yoakari/config': `export default ${JSON.stringify(config)};`,
    'virtual:yoakari/custom-css': imports(customCss),
    'virtual:yoakari/fonts': `${imports(fonts.stylesheets)}\nexport default ${JSON.stringify(fonts.css)};`,
    'virtual:yoakari/studio': `export default ${JSON.stringify(studio)};`,
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
