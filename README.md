# yoakari

柔和的樱色 Astro 博客主题，以 **Astro 集成** 的形式安装：主题是一个 npm 包，文章留在你自己的站点仓库里，升级主题只需要升级依赖。

- 配色全部用 OKLCH，一个色相（`hue`）推出整站颜色，浅色 / 深色两套
- 斜切封面卡片、胶囊导航、波浪横幅、樱花飘落、会开花的目录
- 提示块（`:::tip` / `> [!NOTE]`）、黑幕、注音、公式（KaTeX）、Mermaid、Expressive Code 代码块
- Pagefind 站内搜索、RSS、Sitemap、Astro ClientRouter 页面切换
- 可选页面：书签导航、Bangumi 番组计划（浏览器里实时读取收藏）

示例站点：<https://yoakari-demo.konataizumi.com>

## 使用

```bash
pnpm add astro-yoakari astro svelte @astrojs/svelte sharp
```

`astro.config.mjs`：

```js
import { defineConfig } from 'astro/config';
import yoakari from 'astro-yoakari';

export default defineConfig({
  site: 'https://example.com',
  integrations: [yoakari({ title: '我的博客', author: { name: '我' } })],
});
```

`src/content.config.ts`：

```ts
import { defineCollection } from 'astro:content';
import { postsLoader } from 'astro-yoakari/loaders';
import { postsSchema } from 'astro-yoakari/schema';

export const collections = { posts: defineCollection({ loader: postsLoader(), schema: postsSchema }) };
```

文章放在 `src/content/posts/`，frontmatter 字段与 Firefly / Fuwari 一致（`title`、`published`、`image`、`tags`、`category`、`pinned`、`draft`…）。全部配置项见 [`packages/yoakari/src/config.ts`](https://github.com/shirumesu/yoakari/blob/main/packages/yoakari/src/config.ts)。

站点自己在 `src/pages/` 里写了同一路由的页面时（比如自己的首页），会用站点的，主题不再注入。

### 自己的页面

「关于」这类页面用主题的 `Page` 布局，正文可以直接引入一个 Markdown 文件：

```astro
---
// src/pages/about.astro
import Page from 'astro-yoakari/components/Page.astro';
import { Content } from '../content/about.md';
---
<Page title="关于" chip="ABOUT" text="一句副标题"><Content /></Page>
```

### 书签与番组计划

在配置里写上就会生成对应的页面，不写就没有：

```js
yoakari({
  // …
  bookmarks: {
    path: '/links/',
    groups: [{ name: '常用', icon: 'code', items: [{ title: 'Astro', url: 'https://astro.build/', description: 'Web 框架' }] }],
  },
  bangumi: { path: '/bangumi/', user: '你的 Bangumi 用户名', types: ['anime', 'book', 'game'] },
});
```

书签没写 `icon` 时会通过 `favicon` 指定的服务取网站图标（默认 `a.favicon.im`），设成 `false` 就只显示首字。番组计划在访客的浏览器里请求 `api.bgm.tv`，所以总是最新的，不需要重新构建。

## 仓库结构

- `packages/yoakari` — 主题包
- `examples/demo` — 示例站点（`pnpm dev` / `pnpm build`）

## 致谢

- 视觉方向参考了 [astro-koharu](https://github.com/cosZone/astro-koharu)（AGPL-3.0，仅参考设计，未使用其代码）
- 主题包的分发方式参考了 [Shirone](https://github.com/LyraVoid/Shirone) 与 [Starlight](https://github.com/withastro/starlight)
- 文章字段沿用 [Fuwari](https://github.com/saicaca/fuwari) / [Firefly](https://github.com/CuteLeaf/Firefly) 的约定，方便迁移

## License

MIT
