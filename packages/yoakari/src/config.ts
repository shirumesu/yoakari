import { z } from 'astro/zod';

/** Icon names available in the built-in sprite (src/components/Sprite.astro). */
export const iconNames = [
  'home', 'archive', 'tv', 'link', 'user', 'search', 'sun', 'moon', 'menu', 'up', 'calendar', 'pen',
  'clock', 'tag', 'folder', 'code', 'rss', 'mail', 'copy', 'check', 'info', 'bulb', 'alert', 'list',
  'megaphone', 'flower', 'image', 'book', 'music', 'heart', 'star', 'camera', 'globe', 'github', 'bilibili',
] as const;
const icon = z.enum(iconNames);

/** Bangumi subject types the page can show. */
export const bangumiTypes = ['anime', 'book', 'game', 'music', 'real'] as const;
/** A route like `/links/`: leading and trailing slash. */
const routePath = z.string().regex(/^\/[\w\-/]*\/$/, 'must start and end with "/", e.g. "/links/"');

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  icon: icon.optional(),
});

export const configSchema = z.object({
  /** Site name, shown in the navbar, the hero and the page titles. */
  title: z.string(),
  /** Icon of the site (path under `public/`, or a URL): `.ico`, `.png` or `.svg`. */
  favicon: z.string().optional(),
  /** Small line above the title in the home hero (e.g. a romanised name). */
  subtitle: z.string().optional(),
  /** Default meta description. */
  description: z.string().default(''),
  /** `<html lang>`. Only Chinese UI strings exist for now. */
  lang: z.string().default('zh-CN'),
  /** IANA time zone used when printing post dates. */
  timezone: z.string().default('UTC'),
  /** Primary hue on the OKLCH wheel (sakura pink is 355). Every derived colour follows it. */
  hue: z.number().min(0).max(360).default(355),
  author: z.object({
    name: z.string(),
    /** URL or path under `public/`. Without one, the first character of `avatarText` (or the name) is drawn on a gradient. */
    avatar: z.string().optional(),
    avatarText: z.string().optional(),
    /** Lines of the profile card's bio. */
    bio: z.array(z.string()).default([]),
  }),
  /** Links in the navbar, the sidebar and the mobile drawer. */
  nav: z.array(linkSchema).default([
    { label: '首页', href: '/', icon: 'home' },
    { label: '归档', href: '/archive/', icon: 'archive' },
  ]),
  /** Round icon links on the profile card. */
  socials: z.array(linkSchema.required({ icon: true })).default([]),
  hero: z.object({
    /** Background image (URL or path under `public/`). Without one, a soft OKLCH gradient is drawn. */
    image: z.string().optional(),
    /** Small credit in the corner of the home hero. */
    credit: z.string().optional(),
    /** Lines the typewriter cycles through under the home title. */
    mottos: z.array(z.string()).default([]),
  }).default({ mottos: [] }),
  /** Text of the notice card in the sidebar. */
  notice: z.string().optional(),
  /** The day the site started (YYYY-MM-DD): used for the © range and the "running for N days" line. */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Licence line at the end of every post. */
  license: z.object({ name: z.string(), url: z.url().optional() }).optional(),
  /** Posts per page on the home list. */
  postsPerPage: z.number().int().positive().default(8),
  /** Falling petals canvas. */
  petals: z.boolean().default(true),
  /** Load Zen Maru Gothic and JetBrains Mono from Google Fonts. Set false to use system fonts or your own. */
  googleFonts: z.boolean().default(true),
  /** Turn every single line break in Markdown into `<br>` (as GitHub comments do) instead of joining the lines. */
  breaks: z.boolean().default(false),
  /** Extra CSS files (paths relative to the project root, or package specifiers) loaded after the theme's own. */
  customCss: z.array(z.string()).default([]),
  /** A page of bookmarks grouped by topic. Left out, the page is not built. */
  bookmarks: z.object({
    /** Route of the page. */
    path: routePath.default('/links/'),
    title: z.string().default('书签'),
    description: z.string().optional(),
    /**
     * Icon service for links without their own `icon`; `{domain}` is replaced by the link's host.
     * Set false to draw the first letter of the title instead (no request leaves the visitor's browser).
     */
    favicon: z.union([z.string().includes('{domain}'), z.literal(false)]).default('https://a.favicon.im/{domain}'),
    groups: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      icon: icon.optional(),
      items: z.array(z.object({
        title: z.string(),
        url: z.url(),
        description: z.string().optional(),
        /** Image URL or path under `public/`. */
        icon: z.string().optional(),
      })),
    })),
  }).optional(),
  /** A page listing the author's Bangumi (bgm.tv) collections, loaded in the visitor's browser. Left out, the page is not built. */
  bangumi: z.object({
    path: routePath.default('/bangumi/'),
    title: z.string().default('番组计划'),
    description: z.string().optional(),
    /** Bangumi user name or numeric id. */
    user: z.string(),
    /** Subject types shown as tabs, in this order. */
    types: z.array(z.enum(bangumiTypes)).min(1).default(['anime', 'book', 'game', 'music']),
    api: z.url().default('https://api.bgm.tv'),
    /** Where a card links to; the subject id is appended. */
    subjectUrl: z.url().default('https://bgm.tv/subject/'),
  }).optional(),
});

export type YoakariUserConfig = z.input<typeof configSchema>;
export type YoakariConfig = z.output<typeof configSchema>;

export function parseConfig(input: unknown): YoakariConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`yoakari: invalid options\n${lines.join('\n')}`);
  }
  return parsed.data;
}
