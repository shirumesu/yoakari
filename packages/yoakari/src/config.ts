import { z } from 'astro/zod';

/** Icon names available in the built-in sprite (src/components/Sprite.astro). */
export const iconNames = [
  'home', 'archive', 'tv', 'link', 'user', 'search', 'sun', 'moon', 'menu', 'up', 'calendar', 'pen',
  'clock', 'tag', 'folder', 'code', 'rss', 'mail', 'copy', 'check', 'info', 'bulb', 'alert', 'list',
  'megaphone', 'flower', 'image', 'book', 'music', 'heart', 'star', 'camera', 'globe', 'github', 'bilibili',
] as const;
/** Title and help text of a field in the studio's settings form (they end up in the JSON Schema). */
const m = (title: string, description?: string, widget?: 'hue' | 'icon' | 'textarea') => ({
  title,
  ...(description ? { description } : {}),
  ...(widget ? { 'x-widget': widget } : {}),
});
const icon = z.enum(iconNames).meta(m('图标', undefined, 'icon'));

/** Bangumi subject types the page can show. */
export const bangumiTypes = ['anime', 'book', 'game', 'music', 'real'] as const;
/** A route like `/links/`: leading and trailing slash. */
const routePath = z.string().regex(/^\/[\w\-/]*\/$/, 'must start and end with "/", e.g. "/links/"');

const linkSchema = z.strictObject({
  label: z.string().meta(m('文字')),
  href: z.string().meta(m('链接', '站内路径（/archive/）或完整网址')),
  icon: icon.optional(),
});

// Strict objects throughout: a misspelt or renamed option is an error, not a setting that quietly does nothing.
export const configSchema = z.strictObject({
  /** Path of the JSON Schema, for editor completion in yoakari.config.json. */
  $schema: z.string().optional(),
  /** Site name, shown in the navbar, the hero and the page titles. */
  title: z.string().meta(m('站点名称', '显示在顶栏、首页横幅和网页标题里')),
  /** Icon of the site (path under `public/`, or a URL): `.ico`, `.png` or `.svg`. */
  favicon: z.string().optional().meta(m('网站图标', 'public/ 下的路径或网址：.ico、.png 或 .svg')),
  /** Small line above the title in the home hero (e.g. a romanised name). */
  subtitle: z.string().optional().meta(m('副标题', '首页横幅里标题上方的一小行，比如罗马音')),
  /** Default meta description. */
  description: z.string().default('').meta(m('站点简介', '搜索引擎和分享卡片用的默认描述')),
  /** `<html lang>`. Only Chinese UI strings exist for now. */
  lang: z.string().default('zh-CN').meta(m('语言', '<html lang>，界面文字目前只有中文')),
  /** IANA time zone used when printing post dates. */
  timezone: z.string().default('UTC').meta(m('时区', '显示文章日期用的 IANA 时区，如 Asia/Shanghai')),
  /** Primary hue on the OKLCH wheel (sakura pink is 355). Every derived colour follows it. */
  hue: z.number().min(0).max(360).default(355).meta(m('主色相', 'OKLCH 色相角，樱粉是 355；所有配色都跟着它变', 'hue')),
  author: z.strictObject({
    name: z.string().meta(m('名字')),
    /**
     * `./path` to an image in the project (made into small files at build time, recommended), a path under
     * `public/` or a URL (used as is). Without one, the first character of `avatarText` (or the name) is drawn on a gradient.
     */
    avatar: z.string().optional().meta(m('头像', '项目里的图片写 ./ 开头的路径（构建时压成合适的尺寸，推荐）；也可以是 public/ 下的路径或网址（原样使用）；不填就在渐变上画一个字')),
    avatarText: z.string().optional().meta(m('头像文字', '没有头像图片时画的字，默认取名字的第一个字')),
    /** Lines of the profile card's bio. */
    bio: z.array(z.string()).default([]).meta(m('简介', '资料卡上的几行字')),
  }).meta(m('作者')),
  /** Links in the navbar, the sidebar and the mobile drawer. */
  nav: z.array(linkSchema).default([
    { label: '首页', href: '/', icon: 'home' },
    { label: '归档', href: '/archive/', icon: 'archive' },
  ]).meta(m('导航', '顶栏、侧栏和手机菜单里的链接')),
  /** Round icon links on the profile card. */
  socials: z.array(linkSchema.required({ icon: true })).default([]).meta(m('社交链接', '资料卡下面的圆形图标')),
  hero: z.strictObject({
    /**
     * Background image: `./path` to an image in the project (made into several widths for different screens, with
     * its colours shown while it loads; recommended), a path under `public/` or a URL (used as is). Without one,
     * a soft OKLCH gradient is drawn.
     */
    image: z.string().optional().meta(m('背景图', '项目里的图片写 ./ 开头的路径（构建时按屏幕宽度生成多个尺寸，加载前先显示它的主色，推荐）；也可以是 public/ 下的路径或网址（原样使用）；不填就画柔和的渐变')),
    /** Small credit in the corner of the home hero. */
    credit: z.string().optional().meta(m('图片署名', '首页横幅角落的一小行字')),
    /** Lines the typewriter cycles through under the home title. */
    mottos: z.array(z.string()).default([]).meta(m('标语', '首页标题下打字机轮流打出的几句话')),
  }).default({ mottos: [] }).meta(m('横幅')),
  /** Text of the notice card in the sidebar. */
  notice: z.string().optional().meta(m('公告', '侧栏公告卡片里的文字', 'textarea')),
  /** The day the site started (YYYY-MM-DD): used for the © range and the "running for N days" line. */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().meta(m('建站日期', 'YYYY-MM-DD，用于版权年份和「已运行 N 天」')),
  /** Licence line at the end of every post. */
  license: z.strictObject({
    name: z.string().meta(m('名称')),
    url: z.url().optional().meta(m('链接')),
  }).optional().meta(m('许可协议', '每篇文章末尾的版权声明')),
  /** Posts per page on the home list. */
  postsPerPage: z.number().int().positive().default(8).meta(m('每页文章数')),
  /** Falling petals canvas. */
  petals: z.boolean().default(true).meta(m('樱花飘落')),
  /**
   * Serve the theme's fonts with the site: 资源圆体 (Resource Han Rounded CN) for text, cut down at build time to
   * the characters the pages use, and JetBrains Mono for code. Set false to use system fonts or your own.
   */
  webFonts: z.boolean().default(true).meta(m('主题字体', '正文用资源圆体，构建时只保留站点用到的字，代码用 JetBrains Mono，都随站点一起部署；关掉就用系统字体')),
  /** Turn every single line break in Markdown into `<br>` (as GitHub comments do) instead of joining the lines. */
  breaks: z.boolean().default(false).meta(m('保留单个换行', 'Markdown 里每个换行都变成 <br>（像 GitHub 评论那样），而不是把两行接起来')),
  /** Extra CSS files (paths relative to the project root, or package specifiers) loaded after the theme's own. */
  customCss: z.array(z.string()).default([]).meta(m('自定义 CSS', '在主题样式之后加载的 CSS 文件，路径相对项目根目录')),
  /** A page of bookmarks grouped by topic. Left out, the page is not built. */
  bookmarks: z.strictObject({
    /** Route of the page. */
    path: routePath.default('/links/').meta(m('页面路径')),
    title: z.string().default('书签').meta(m('标题')),
    description: z.string().optional().meta(m('说明')),
    /**
     * Icon service for links without their own `icon`; `{domain}` is replaced by the link's host.
     * Set false to draw the first letter of the title instead (no request leaves the visitor's browser).
     */
    favicon: z.union([z.string().includes('{domain}'), z.literal(false)]).default('https://a.favicon.im/{domain}')
      .meta(m('网站图标服务', '没写图标的链接用它取图标，{domain} 换成链接的域名；关掉就画标题的第一个字')),
    groups: z.array(z.strictObject({
      name: z.string().meta(m('分组名')),
      description: z.string().optional().meta(m('说明')),
      icon: icon.optional(),
      items: z.array(z.strictObject({
        title: z.string().meta(m('标题')),
        url: z.url().meta(m('网址')),
        description: z.string().optional().meta(m('说明')),
        /** Image URL or path under `public/`. */
        icon: z.string().optional().meta(m('图标', '图片网址或 public/ 下的路径')),
      })).meta(m('链接')),
    })).meta(m('分组')),
  }).optional().meta(m('书签页', '按主题分组的书签页面；不填就不生成')),
  /** A page listing the author's Bangumi (bgm.tv) collections, loaded in the visitor's browser. Left out, the page is not built. */
  bangumi: z.strictObject({
    path: routePath.default('/bangumi/').meta(m('页面路径')),
    title: z.string().default('番组计划').meta(m('标题')),
    description: z.string().optional().meta(m('说明')),
    /** Bangumi user name or numeric id. */
    user: z.string().meta(m('Bangumi 用户', '用户名或数字 id')),
    /** Subject types shown as tabs, in this order. */
    types: z.array(z.enum(bangumiTypes)).min(1).default(['anime', 'book', 'game', 'music']).meta(m('显示的类型', '按这个顺序显示成标签页')),
    api: z.url().default('https://api.bgm.tv').meta(m('API 地址')),
    /** Where a card links to; the subject id is appended. */
    subjectUrl: z.url().default('https://bgm.tv/subject/').meta(m('条目链接', '卡片链接到这里，后面接条目 id')),
  }).optional().meta(m('番组页', '列出 Bangumi 收藏的页面，在访客浏览器里加载；不填就不生成')),
  /** The writing studio at `/studio/`: write posts and change these settings in the browser, and commit them to GitHub. */
  studio: z.strictObject({
    /** GitHub repository of the site, `owner/name`. */
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must be "owner/name"').meta(m('仓库', 'GitHub 仓库，写成 owner/name')),
    branch: z.string().default('main').meta(m('分支', '提交到这个分支，构建平台从这里部署')),
    /** Folder of the site inside the repository ("" when the site is the whole repository). */
    root: z.string().regex(/^(?:[\w.-]+(?:\/[\w.-]+)*)?$/, 'a folder like "blog" or "sites/blog", without slashes at the ends').default('')
      .meta(m('站点目录', '站点在仓库里的子目录；站点就是整个仓库时留空')),
    /** Posts folder, relative to the site folder (the base of `postsLoader`). */
    posts: z.string().default('src/content/posts').meta(m('文章目录', '相对站点目录，和 postsLoader 的 base 一致')),
  }).optional().meta(m('写作室', '生成 /studio/ 写作室：在网页里写文章、改这些设置，登录 GitHub 后直接提交到仓库。不填就不生成')),
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
