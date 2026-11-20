# yoakari

柔和的樱色 Astro 博客主题，以 **Astro 集成** 的形式安装：主题是一个 npm 包，文章留在你自己的站点仓库里，升级主题只需要升级依赖。

- 配色全部用 OKLCH，一个色相（`hue`）推出整站颜色，浅色 / 深色两套
- 斜切封面卡片、胶囊导航、波浪横幅、樱花飘落（可关）、会开花的目录
- 提示块（`:::tip` / `> [!NOTE]`）、黑幕、注音、公式（KaTeX）、Mermaid、Expressive Code 代码块
- Pagefind 站内搜索、RSS、Sitemap、Astro ClientRouter 页面切换
- 图片按屏幕宽度生成多个尺寸，加载完之前先显示图片自己的颜色；字体随站点部署，不连 Google
- 可选页面：书签导航、Bangumi 番组计划（浏览器里实时读取收藏）
- 可选的写作室 `/studio/`：在浏览器里写文章、改主题设置，登录 GitHub 后直接提交到仓库

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
  integrations: [yoakari()],
});
```

主题的选项写在 `astro.config.mjs` 旁边的 `yoakari.config.json` 里（写作室的设置页改的就是这个文件）：

```json
{
  "$schema": "./.astro/yoakari.schema.json",
  "title": "我的博客",
  "author": { "name": "我" }
}
```

`$schema` 指向构建时生成的 JSON Schema，编辑器里会有补全和说明。拼错或不存在的选项会让构建直接报错，而不是悄悄不生效。也可以把选项直接写成 `yoakari({ title: '我的博客', … })`，这时设置页只能看、不能改。

`src/content.config.ts`：

```ts
import { defineCollection } from 'astro:content';
import { postsLoader } from 'astro-yoakari/loaders';
import { postsSchema } from 'astro-yoakari/schema';

export const collections = { posts: defineCollection({ loader: postsLoader(), schema: postsSchema }) };
```

文章放在 `src/content/posts/`，frontmatter 字段与 Firefly / Fuwari 一致（`title`、`published`、`image`、`tags`、`category`、`pinned`、`draft`…）。全部配置项见 [`packages/yoakari/src/config.ts`](https://github.com/shirumesu/yoakari/blob/main/packages/yoakari/src/config.ts)。

### 图片与字体

- 横幅 `hero.image` 和头像 `author.avatar` 写成 `./src/assets/hero.webp` 这样以 `./` 开头、相对项目根目录的路径时，构建时会压成合适的尺寸（横幅按屏幕宽度生成多档，头像按显示的 104px 生成 1–3 倍）。写成 `/hero.webp`（`public/` 下的文件）或网址就原样使用。
- 文章封面（frontmatter 里的 `image: ./cover.webp`）和正文里 `![](./photo.jpg)` 这样的相对路径图片，也按版面宽度生成多档尺寸，并在加载完之前用图片自己的颜色铺底：构建时把图片缩到 2×2 像素，取色做成一条渐变。带透明部分的图片不铺底。
- `webFonts`（默认开）：正文用[资源圆体](https://github.com/CyanoHao/Resource-Han-Rounded)（中文字形的圆体，SIL OFL 1.1，完整字体随主题包附带）。构建结束时会扫一遍所有页面，把字体裁成只含站点用到的字，每个字重一个文件、全站共用，一个博客通常只有一两百 KB。代码用 JetBrains Mono。字体都随站点一起部署，构建和访问时都不连 Google 或任何 CDN。`astro dev` 时直接用完整字体。页面加载后才出现的字（比如番组计划从接口取回的标题）不在裁好的字体里，会用系统字体显示。设成 `false` 就全部用系统字体。

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

```json
{
  "bookmarks": {
    "path": "/links/",
    "groups": [{ "name": "常用", "icon": "code", "items": [{ "title": "Astro", "url": "https://astro.build/", "description": "Web 框架" }] }]
  },
  "bangumi": { "path": "/bangumi/", "user": "你的 Bangumi 用户名", "types": ["anime", "book", "game"] }
}
```

书签没写 `icon` 时会通过 `favicon` 指定的服务取网站图标（默认 `a.favicon.im`），设成 `false` 就只显示首字。番组计划在访客的浏览器里请求 `api.bgm.tv`，所以总是最新的，不需要重新构建。

## 写作室

在选项里加上 `studio` 就会生成 `/studio/`。它不进 sitemap 和站内搜索，也不让搜索引擎收录：

```json
{
  "studio": { "repo": "you/blog", "root": "", "branch": "main" }
}
```

`root` 是站点在仓库里的子目录（站点就是整个仓库时留空），`posts` 是文章目录（默认 `src/content/posts`，和 `postsLoader` 的 `base` 一致）。

- 不登录也能写：草稿存在这个浏览器里（IndexedDB），关掉标签页也不丢，可以下载成 Markdown（带图片时是 zip）。
- 登录 GitHub 后会列出仓库里的文章。提交时，文章和它的图片合成一个 commit；提交后跟踪这次提交的构建状态（GitHub 的 Checks 和 commit statuses）。如果你打开文章之后，别处又改过这篇文章或同名图片，提交会被拦下，由你选择是否覆盖。
- 「设置」是 `yoakari.config.json` 的表单，提交后站点按新设置重新构建。
- 同一时间只能在一个标签页里编辑，另一个标签页可以接手。

### 登录是怎么做到的

写作室在浏览器里直接调用 GitHub API。只有「用登录码换 token」这一步要用到 GitHub App 的 client secret，不能放进网页，所以交给站点上的一个很小的函数：它只处理 `/studio/auth/*`，其余请求照旧是静态文件。token 8 小时过期、到期自动续期，存在浏览器的 localStorage 里。

不想配 App 的话，也可以在写作室里贴一个 fine-grained token：只选这个仓库，权限给 Contents 读写；要看构建状态，再加 Checks 和 Commit statuses 只读。

### 配置 GitHub App

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App：
   - Callback URL：`https://你的域名/studio/auth/callback`。站点有多个域名（比如带不带 `www`）就每个都加；本地开发再加 `http://localhost:4321/studio/auth/callback`。
   - 保持勾选 Expire user authorization tokens。
   - Webhook：取消 Active。
   - Repository permissions：Contents 读写；Checks、Commit statuses 只读。
   - Where can this GitHub App be installed：Only on this account。
2. 建好后到 App 的 Credentials 页：在 Key pairs 里生成一把私钥（GitHub 要求有私钥才能安装 App；写作室用不到它，下载下来的 `.pem` 可以删），在 Client secrets 里生成 client secret。
3. Install App，只选站点所在的仓库。

### 部署（Cloudflare Workers 静态资源）

站点目录里的 `worker.ts`：

```ts
export { default } from 'astro-yoakari/studio/worker';
```

`wrangler.jsonc`：

```jsonc
{
  "main": "./worker.ts",
  "vars": { "GITHUB_CLIENT_ID": "<App 的 Client ID>" },
  "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/studio/auth/*"] }
}
```

client secret 存成 Worker 的 secret：`npx wrangler secret put GITHUB_CLIENT_SECRET`（或者在 Cloudflare 后台 Worker → Settings → Variables and Secrets 里加）。`GITHUB_CLIENT_ID` 要写在 `wrangler.jsonc` 里，因为 `wrangler deploy` 会覆盖在后台设置的普通变量。

本地 `astro dev` 时没有 Worker，开发服务器自己处理 `/studio/auth/*`，读取站点目录 `.env` 里的 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`（别忘了把 `.env` 加进 `.gitignore`）。

部署在别的平台上时，用 `astro-yoakari/studio/auth.ts` 里的 `handleAuth(request, env)` 接一个处理 `/studio/auth/*` 的函数即可。

## 仓库结构

- `packages/yoakari` — 主题包
- `examples/demo` — 示例站点（`pnpm dev` / `pnpm build`）

## 致谢

- 视觉方向参考了 [astro-koharu](https://github.com/cosZone/astro-koharu)（AGPL-3.0，仅参考设计，未使用其代码）
- 主题包的分发方式参考了 [Shirone](https://github.com/LyraVoid/Shirone) 与 [Starlight](https://github.com/withastro/starlight)
- 文章字段沿用 [Fuwari](https://github.com/saicaca/fuwari) / [Firefly](https://github.com/CuteLeaf/Firefly) 的约定，方便迁移
- 图片加载前的取色占位和构建时裁剪字体参考了 Firefly 和 [cosine 的博客](https://blog.cosine.ren/post/astro-lqip-implementation)
- 正文字体是 Cyano Hao 的[资源圆体](https://github.com/CyanoHao/Resource-Han-Rounded)（SIL OFL 1.1，许可见 `packages/yoakari/fonts/OFL.txt`）

## License

MIT
