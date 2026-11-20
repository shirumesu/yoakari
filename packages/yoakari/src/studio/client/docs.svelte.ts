// The posts being written. A document is a whole Markdown file (frontmatter + body) plus the images in
// its folder. Anything not yet committed is kept in IndexedDB, so a closed tab or a lost sign-in loses nothing.
import { blobBytes, type RepoPost } from './github.ts';
import { idbDel, idbEntries, idbSet } from './idb.ts';
import { isoInZone, join, split, write } from './frontmatter.ts';
import { postsDir, site } from './env.ts';
import { fail } from './ui.svelte.ts';

export interface Asset {
  name: string;
  /** `repo`: committed (fetched by `oid` when shown); `added`: pasted in the studio; `deleted`: removed in the studio. */
  state: 'repo' | 'added' | 'deleted';
  oid?: string;
  size: number;
  blob?: Blob;
}

export interface Doc {
  /** `repo:<path>` for posts in the repository, `local:<id>` for posts that were never committed. */
  key: string;
  /** Repository path of the Markdown file; null until the post is first committed. */
  path: string | null;
  /** Folder name under the posts folder (`slug/index.md`), or the file name without extension (`slug.md`). */
  slug: string;
  /** `slug/index.md` posts keep images next to them; `slug.md` posts cannot take new images. */
  folder: boolean;
  /** Blob id and text of the file when editing started (null for posts not in the repository). */
  baseOid: string | null;
  baseText: string | null;
  text: string;
  assets: Asset[];
  updatedAt: number;
}

export const docs = $state({
  all: {} as Record<string, Doc>,
  current: null as string | null,
});

export const currentDoc = () => (docs.current ? docs.all[docs.current] ?? null : null);

export const isDirty = (d: Doc) => d.text !== d.baseText || d.assets.some((a) => a.state !== 'repo');

const LAST_KEY = 'yoakari-studio-current';

export async function loadDocs() {
  for (const [, doc] of await idbEntries<Doc>('doc:')) docs.all[doc.key] = doc;
  const last = localStorage.getItem(LAST_KEY);
  if (last && docs.all[last]) docs.current = last;
}

export function select(key: string | null) {
  docs.current = key;
  if (key) localStorage.setItem(LAST_KEY, key);
  else localStorage.removeItem(LAST_KEY);
}

/* ---------- saving work to IndexedDB (debounced) ---------- */
const timers = new Map<string, number>();
function save(key: string) {
  timers.delete(key);
  const live = docs.all[key];
  if (!live) return;
  // committed work with nothing new is not kept: reopening reads it from the repository
  const done = isDirty(live) || !live.path ? idbSet(`doc:${key}`, $state.snapshot(live)) : idbDel(`doc:${key}`);
  done.catch((err) => fail(err, `没能把「${live.slug}」存进浏览器`));
}
function persist(doc: Doc) {
  clearTimeout(timers.get(doc.key));
  timers.set(doc.key, window.setTimeout(() => save(doc.key), 300));
}
/** Writes pending saves now (the tab is being hidden or closed). */
export function flushDocs() {
  for (const [key, t] of timers) {
    clearTimeout(t);
    save(key);
  }
}

/** Saves a change made directly on the document (e.g. its folder name). */
export function touch(doc: Doc) {
  doc.updatedAt = Date.now();
  persist(doc);
}

export function setText(doc: Doc, text: string) {
  if (doc.text === text) return;
  doc.text = text;
  doc.updatedAt = Date.now();
  persist(doc);
}

export function setBody(doc: Doc, body: string) {
  setText(doc, join(split(doc.text).fm, body));
}

/** Throws when the YAML cannot be parsed (the form shows it). */
export function setField(doc: Doc, key: string, value: unknown) {
  setText(doc, join(write(split(doc.text).fm ?? '', key, value), split(doc.text).body));
}

/* ---------- opening and creating ---------- */
export function fromRepo(post: RepoPost): Doc {
  return {
    key: `repo:${post.path}`,
    path: post.path,
    slug: post.slug,
    folder: post.dir !== postsDir,
    baseOid: post.oid,
    baseText: post.text,
    text: post.text,
    assets: post.assets.map((a) => ({ name: a.name, state: 'repo', oid: a.oid, size: a.size })),
    updatedAt: Date.now(),
  };
}

/** Opens a post from the repository, or the local copy of it with unsubmitted changes. */
export function openRepo(post: RepoPost) {
  const key = `repo:${post.path}`;
  const open = docs.all[key];
  // a post without changes follows the repository (the list may be newer than when it was first opened)
  if (!open || (!isDirty(open) && !sameAsRepo(open, post))) docs.all[key] = fromRepo(post);
  select(key);
}

const sameAsRepo = (doc: Doc, post: RepoPost) =>
  doc.baseOid === post.oid && doc.assets.length === post.assets.length && post.assets.every((a) => doc.assets.some((x) => x.name === a.name && x.oid === a.oid));

/** Throws away the studio's changes to a post and loads it as `post` (read fresh from the repository). */
export function reload(doc: Doc, post: RepoPost) {
  clearTimeout(timers.get(doc.key));
  timers.delete(doc.key);
  docs.all[doc.key] = fromRepo(post);
  idbDel(`doc:${doc.key}`).catch((err) => fail(err, `没能从浏览器里删掉「${doc.slug}」的旧草稿`));
}

export function template(title: string) {
  const fm = [
    `title: ${JSON.stringify(title)}`,
    `published: ${isoInZone(new Date(), site.timezone)}`,
    'description: ""',
    'image: ""',
    'tags: []',
    'category: ""',
    'draft: true',
  ].join('\n');
  return join(fm, '\n');
}

export function create(slug: string, text: string): Doc {
  const doc: Doc = { key: `local:${crypto.randomUUID()}`, path: null, slug, folder: true, baseOid: null, baseText: null, text, assets: [], updatedAt: Date.now() };
  docs.all[doc.key] = doc;
  persist(doc);
  select(doc.key);
  return doc;
}

/** Drops a document: a never-committed post is gone, a repository post goes back to its committed state. */
export function discard(doc: Doc) {
  clearTimeout(timers.get(doc.key));
  timers.delete(doc.key);
  delete docs.all[doc.key];
  idbDel(`doc:${doc.key}`).catch((err) => fail(err, `没能从浏览器里删掉「${doc.slug}」`));
  if (docs.current === doc.key) select(null);
}

/* ---------- images ---------- */
export function uniqueName(doc: Doc, wanted: string) {
  const clean = wanted.normalize('NFC').replace(/[\\/:*?"<>|#%\s]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const dot = clean.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  const taken = new Set(doc.assets.filter((a) => a.state !== 'deleted').map((a) => a.name));
  let name = clean;
  for (let i = 2; taken.has(name); i++) name = `${stem}-${i}${ext}`;
  return name;
}

export function addAsset(doc: Doc, blob: Blob, wanted: string): string {
  if (!doc.folder) throw new Error('这篇文章是单个 .md 文件，没有自己的文件夹放图片；改成 文章名/index.md 的形式后再加图片');
  const name = uniqueName(doc, wanted);
  const old = doc.assets.find((a) => a.name === name && a.state === 'deleted');
  if (old) Object.assign(old, { state: 'added', blob, size: blob.size });
  else doc.assets.push({ name, state: 'added', size: blob.size, blob });
  doc.updatedAt = Date.now();
  persist(doc);
  return name;
}

export function removeAsset(doc: Doc, name: string) {
  const a = doc.assets.find((x) => x.name === name);
  if (!a) return;
  if (a.state === 'added' && !a.oid) doc.assets.splice(doc.assets.indexOf(a), 1);
  else a.state = 'deleted';
  persist(doc);
}

export function restoreAsset(doc: Doc, name: string) {
  const a = doc.assets.find((x) => x.name === name);
  // a blob is content the repository does not have yet (a new image, or a replacement of a committed one)
  if (a?.state === 'deleted') a.state = a.blob ? 'added' : 'repo';
  persist(doc);
}

/* ---------- after a commit ---------- */
export function committed(doc: Doc, path: string, oid: string, text: string) {
  const assets: Asset[] = [];
  for (const a of doc.assets) {
    if (a.state === 'deleted') continue;
    if (a.blob) {
      // in the repository now: drop the blob (so it is no longer a change), keep showing it without a download
      if (!a.oid) throw new Error(`图片 ${a.name} 提交后没有 blob id`);
      urls.set(a.oid, objectUrl(a.blob));
    }
    assets.push({ name: a.name, state: 'repo', oid: a.oid, size: a.size });
  }
  const key = `repo:${path}`;
  const next: Doc = { ...$state.snapshot(doc), key, path, baseOid: oid, baseText: text, assets, updatedAt: Date.now() };
  clearTimeout(timers.get(doc.key));
  timers.delete(doc.key);
  idbDel(`doc:${doc.key}`).catch((err) => fail(err, `「${doc.slug}」已经提交，但浏览器里的草稿没能删掉`));
  if (key !== doc.key) delete docs.all[doc.key];
  docs.all[key] = next;
  select(key);
  persist(next);
}

/* ---------- image URLs for the preview ---------- */
const urls = new Map<string, string>(); // oid or blob identity → object URL
const blobUrls = new WeakMap<Blob, string>();
export const assetVersion = $state({ n: 0 });

function objectUrl(blob: Blob) {
  let u = blobUrls.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    blobUrls.set(blob, u);
  }
  return u;
}

/** URL of an image of the document for the preview, or undefined while a committed image is still downloading. */
export function assetUrl(doc: Doc, name: string, onError: (err: unknown) => void): string | undefined {
  const a = doc.assets.find((x) => x.name === name && x.state !== 'deleted');
  if (!a) return undefined;
  if (a.blob) return objectUrl(a.blob);
  if (!a.oid) return undefined;
  if (urls.has(a.oid)) return urls.get(a.oid) || undefined; // '' while downloading
  urls.set(a.oid, '');
  blobBytes(a.oid).then(
    (bytes) => {
      urls.set(a.oid!, URL.createObjectURL(new Blob([bytes as BlobPart])));
      assetVersion.n++;
    },
    (err) => {
      urls.delete(a.oid!);
      onError(err);
    },
  );
  return undefined;
}
