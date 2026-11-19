import { type CollectionEntry, getCollection } from 'astro:content';
import config from 'virtual:yoakari/config';

export type Post = CollectionEntry<'posts'>;

/** Published posts, newest first. Drafts only show up in `astro dev`. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return posts.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

export const url = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
export const postUrl = (post: Post) => url(`/posts/${post.id}/`);
export const tagUrl = (tag: string) => url(`/tags/${encodeURIComponent(tag)}/`);
export const categoryUrl = (category: string) => url(`/categories/${encodeURIComponent(category)}/`);

const dateFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD in the configured time zone. */
export const formatDate = (d: Date) => dateFmt.format(d);

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/g;
const LATIN = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g;

/** Words (each CJK character counts as one) and reading minutes of a post's Markdown body. */
export function readingStats(body: string | undefined) {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, ']');
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return { words: cjk + latin, minutes: Math.max(1, Math.round(cjk / 400 + latin / 200)) };
}

/** `description`, or the start of the body with Markdown stripped. */
export function excerptOf(post: Post, max = 120) {
  if (post.data.description) return post.data.description;
  const plain = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^:::.*$/gm, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/** Hue offsets of the gradient covers; a post always gets the same one. */
const TONES = [0, 40, 210, 150, 320, 260, 20, 180, 290];
export function toneOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function countBy(posts: Post[], pick: (p: Post) => string[]) {
  const map = new Map<string, number>();
  for (const p of posts) for (const k of pick(p)) map.set(k, (map.get(k) ?? 0) + 1);
  return map;
}
export const categoriesOf = (p: Post) => (p.data.category ? [p.data.category] : []);
export const tagsOf = (p: Post) => p.data.tags;

/** Pinned posts first on page 1, the rest paged by `postsPerPage`. */
export function homePages(posts: Post[]) {
  const pinned = posts.filter((p) => p.data.pinned);
  const rest = posts.filter((p) => !p.data.pinned);
  const size = config.postsPerPage;
  const total = Math.max(1, Math.ceil(rest.length / size));
  return {
    pinned,
    total,
    page: (n: number) => rest.slice((n - 1) * size, n * size),
  };
}
export const pageUrl = (n: number) => (n === 1 ? url('/') : url(`/page/${n}/`));
