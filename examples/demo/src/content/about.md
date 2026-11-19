这里是 **yoakari** 的示例站点，文章都是占位内容。主题以 Astro 集成的形式安装，文章放在站点自己的 `src/content/posts` 里，升级主题只需要升级依赖。

## 这一页是怎么写的

`src/pages/about.astro` 用主题的 `Page` 布局，正文从这个 Markdown 文件引入：

```astro title="src/pages/about.astro"
---
import Page from 'astro-yoakari/components/Page.astro';
import { Content } from '../content/about.md';
---
<Page title="关于" chip="ABOUT" text="这个站点和写它的人"><Content /></Page>
```

> [!TIP]
> Markdown 里的提示块、黑幕、注音、公式在这里一样能用，比如 :spoiler[其实雪见并不存在]。
