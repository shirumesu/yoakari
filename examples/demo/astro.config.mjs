import { defineConfig } from 'astro/config';
import yoakari from 'astro-yoakari';

export default defineConfig({
  site: 'https://yoakari-demo.konataizumi.com',
  integrations: [
    yoakari({
      title: '雪見の小屋',
      subtitle: 'Yukimi',
      description: '一个用 yoakari 主题搭的示例博客',
      timezone: 'Asia/Shanghai',
      author: { name: 'Yukimi', avatarText: '雪', bio: ['前端 / ACG / 摄影', '喜欢把东西做得刚刚好'] },
      nav: [
        { label: '首页', href: '/', icon: 'home' },
        { label: '归档', href: '/archive/', icon: 'archive' },
        { label: '书签', href: '/links/', icon: 'link' },
        { label: '番组', href: '/bangumi/', icon: 'tv' },
        { label: '关于', href: '/about/', icon: 'user' },
      ],
      socials: [
        { label: 'GitHub', href: 'https://github.com/', icon: 'code' },
        { label: '邮箱', href: 'mailto:hello@example.com', icon: 'mail' },
        { label: 'RSS', href: '/rss.xml', icon: 'rss' },
      ],
      hero: { mottos: ['风过樱林，字落成章', '把喜欢的东西认真记下来', '今天也写一点点'], credit: '横幅插画位 · 之后换成你的图' },
      notice: '这是 yoakari 的示例站点，文章都是占位内容。',
      since: '2024-03-01',
      license: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans' },
      postsPerPage: 5,
      bookmarks: {
        description: '常去的地方，和做这个主题时参考过的东西',
        groups: [
          {
            name: '写博客',
            icon: 'pen',
            description: '框架与工具',
            items: [
              { title: 'Astro', url: 'https://astro.build/', description: '内容驱动型网站的 Web 框架' },
              { title: 'Pagefind', url: 'https://pagefind.app/', description: '构建时生成索引的静态站点搜索' },
              { title: 'Expressive Code', url: 'https://expressive-code.com/', description: '代码块的高亮、标题栏与标注' },
            ],
          },
          {
            name: '配色与字体',
            icon: 'image',
            items: [
              { title: 'OKLCH Color Picker', url: 'https://oklch.com/', description: '在感知均匀的色彩空间里挑颜色' },
              { title: 'Google Fonts', url: 'https://fonts.google.com/', description: '本主题默认的圆体 Zen Maru Gothic 来自这里' },
            ],
          },
          {
            name: '主题灵感',
            icon: 'heart',
            description: '视觉和分发方式的参考',
            items: [
              { title: 'astro-koharu', url: 'https://github.com/cosZone/astro-koharu', description: '视觉方向的参考' },
              { title: 'Starlight', url: 'https://starlight.astro.build/', description: '以集成形式分发主题的范例' },
              { title: 'Firefly', url: 'https://github.com/CuteLeaf/Firefly', description: '文章字段沿用它的约定' },
            ],
          },
        ],
      },
      // 示例用的是主题作者自己的 Bangumi 账号
      bangumi: { user: 'shiying', description: '看过的、在看的、想看的', types: ['anime', 'book', 'game', 'real'] },
    }),
  ],
});
