// Committing a post (or deleting one): checks first, then one commit with the Markdown file and its images.
import type { SchemaContext } from 'astro:content';
import { z } from 'astro/zod';
import GithubSlugger from 'github-slugger';
import { postsSchema } from '../../schema.ts';
import { type Doc, committed } from './docs.svelte.ts';
import { postsDir } from './env.ts';
import { split, tryRead } from './frontmatter.ts';
import { base64, commit, type FileChanges, gitOid, type RepoPost, snapshot } from './github.ts';
import { afterCommit } from './ui.svelte.ts';

/** The post schema of the site, with images as plain strings (the browser cannot run Astro's image()). */
const schema = postsSchema({ image: () => z.string() } as unknown as SchemaContext);

/** Problems that keep a post from building, in words for the properties panel. Empty when fine. */
export function problems(doc: Doc): string[] {
  const { fields, error } = tryRead(split(doc.text).fm);
  if (error !== null) return [`frontmatter 的 YAML 写错了：${error}`];
  const out: string[] = [];
  if (!doc.path && !validSlug(doc.slug)) out.push('文件夹名只能用字母、数字、中文、- 和 _，不能为空');
  const parsed = schema.safeParse(fields);
  if (!parsed.success) for (const i of parsed.error.issues) out.push(`${i.path.join('.') || '属性'}：${i.message}`);
  const cover = typeof fields.image === 'string' ? fields.image : '';
  if (cover && !/^([a-z][\w+.-]*:|\/)/i.test(cover)) {
    const name = cover.replace(/^\.\//, '');
    if (!doc.assets.some((a) => a.name === name && a.state !== 'deleted')) out.push(`封面图 ${cover} 不在这篇文章的文件夹里`);
  }
  return out;
}

export const validSlug = (s: string) => /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(s);

/** Where a post ends up on the site: Astro makes the id from the folder name (or the `slug` field). */
export function postUrl(doc: Doc) {
  // with broken YAML (reported by problems()) the folder name still gives the URL
  const slugField = tryRead(split(doc.text).fm).fields?.slug;
  const id = typeof slugField === 'string' && slugField ? slugField : new GithubSlugger().slug(doc.slug);
  return `/posts/${id}/`;
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
export const targetPath = (doc: Doc) => doc.path ?? `${postsDir}/${doc.slug}/index.md`;

/** The files a commit of this document adds and deletes. */
export function changeList(doc: Doc) {
  const path = targetPath(doc);
  const dir = dirOf(path);
  return {
    path,
    write: [...(doc.text !== doc.baseText ? [path] : []), ...doc.assets.filter((a) => a.state === 'added').map((a) => `${dir}/${a.name}`)],
    remove: doc.assets.filter((a) => a.state === 'deleted' && a.oid).map((a) => `${dir}/${a.name}`),
  };
}

export class Conflict extends Error {}

/**
 * Commits the document. Refuses (Conflict) when the file changed in the repository after the studio
 * loaded it, unless `overwrite`; refuses a new post whose folder is taken.
 */
export async function publishDoc(doc: Doc, message: string, overwrite: boolean) {
  // read once: the text could still change while the commit is under way
  const text = doc.text;
  const issues = problems(doc);
  if (issues.length) throw new Error(issues.join('；'));
  const { path, write, remove } = changeList(doc);
  if (!write.length && !remove.length) throw new Error('没有要提交的修改');

  // Each file this commit touches must still be what the studio loaded (images: absent if they are new).
  // A new post also needs a name nobody uses yet, as a folder or as a single file.
  const dir = dirOf(path);
  const added = doc.assets.filter((x) => x.state === 'added');
  const expected = new Map<string, string | null>([[path, doc.baseOid]]);
  for (const a of doc.assets) if (a.state === 'added' || (a.state === 'deleted' && a.oid)) expected.set(`${dir}/${a.name}`, a.oid ?? null);
  const taken = doc.path ? [] : [`${postsDir}/${doc.slug}`, `${postsDir}/${doc.slug}.md`, `${postsDir}/${doc.slug}.mdx`];
  const checked = [...expected.keys(), ...taken];
  const { head, oids } = await snapshot(checked);
  const now = new Map(checked.map((p, i) => [p, oids[i]]));
  const clash = taken.find((p) => now.get(p) !== null);
  if (clash) throw new Conflict(`仓库里已经有 ${clash} 了，换一个文件夹名`);
  if (!overwrite) {
    if (doc.path && now.get(path) !== doc.baseOid) {
      throw new Conflict(now.get(path) ? '这篇文章在你打开之后，仓库里又被改过（可能是在别处提交的）' : '这篇文章在仓库里已经被删掉了');
    }
    const moved = [...expected].filter(([p, oid]) => p !== path && now.get(p) !== oid).map(([p]) => p.slice(dir.length + 1));
    if (moved.length) throw new Conflict(`这些图片在你打开之后，仓库里又有了变化：${moved.join('、')}`);
  }

  const changes: FileChanges = { additions: [], deletions: remove };
  if (write.includes(path)) changes.additions.push({ path, contents: await base64(text) });
  const assetOids = new Map<string, string>();
  for (const a of added) {
    if (!a.blob) throw new Error(`图片 ${a.name} 的内容丢了，删掉后重新添加`);
    changes.additions.push({ path: `${dir}/${a.name}`, contents: await base64(a.blob) });
    assetOids.set(a.name, await gitOid(a.blob));
  }

  const result = await commit(message, changes, head);
  const oid = await gitOid(text);
  for (const a of doc.assets) if (assetOids.has(a.name)) a.oid = assetOids.get(a.name);
  const { slug, folder } = doc;
  const assets = doc.assets.filter((a) => a.state !== 'deleted' && a.oid).map((a) => ({ name: a.name, path: `${dir}/${a.name}`, oid: a.oid!, size: a.size }));
  committed(doc, path, oid, text);

  // keep the list in step without reading the whole folder again
  const entry: RepoPost = { path, dir: folder ? dir : postsDir, slug, oid, text, assets };
  afterCommit((posts) => (posts.some((p) => p.path === path) ? posts.map((p) => (p.path === path ? entry : p)) : [entry, ...posts]));
  return result;
}

/** Deletes a committed post with all files in its folder. */
export async function deletePost(post: RepoPost, baseOid: string | null, message: string) {
  const { head, oids } = await snapshot([post.path]);
  if (!oids[0]) throw new Conflict('仓库里已经没有这篇文章了');
  if (baseOid && oids[0] !== baseOid) throw new Conflict('这篇文章在你打开之后，仓库里又被改过；先重新载入看看');
  const result = await commit(message, { additions: [], deletions: [post.path, ...post.assets.map((a) => a.path)] }, head);
  afterCommit((posts) => posts.filter((p) => p.path !== post.path));
  return result;
}

/** Title of a document for lists and commit messages. */
export function titleOf(doc: { text: string; slug: string }) {
  // unreadable YAML (reported by problems()) shows the folder name in lists
  const t = tryRead(split(doc.text).fm).fields?.title;
  return typeof t === 'string' && t.trim() ? t.trim() : doc.slug || '未命名';
}
