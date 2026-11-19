import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import config from 'virtual:yoakari/config';
import { excerptOf, getPosts, postUrl } from '../utils/posts.ts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: config.title,
    description: config.description,
    site: context.site!,
    items: posts.filter((p) => !p.data.draft).map((p) => ({
      title: p.data.title,
      pubDate: p.data.published,
      description: excerptOf(p, 200),
      link: postUrl(p),
      categories: [...(p.data.category ? [p.data.category] : []), ...p.data.tags],
    })),
    customData: `<language>${config.lang}</language>`,
  });
}
