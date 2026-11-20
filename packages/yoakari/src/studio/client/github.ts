// The studio's calls to GitHub, made from the browser with the signed-in user's token.
// Reads go through GraphQL (a whole posts folder with file texts in one request); a save is one commit
// made with createCommitOnBranch (several files added and deleted at once, signed by GitHub).
import { owner, postsDir, repoName, studio } from './env.ts';
import { saveAuth, SignInNeeded, token } from './token.ts';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message: string, readonly status: number, readonly type?: string) {
    super(message);
  }
}

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${await token()}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  if (res.status === 401) {
    saveAuth(null);
    throw new SignInNeeded('GitHub 不认这个登录了（可能撤销了授权），请重新登录');
  }
  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('json');
    const message = isJson ? ((await res.json()) as { message?: string }).message : await res.text();
    throw new GitHubError(`GitHub ${res.status}：${message || res.statusText}`, res.status);
  }
  return res;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await call(`${API}/graphql`, { method: 'POST', body: JSON.stringify({ query, variables: { owner, name: repoName, ...variables } }) });
  const body = (await res.json()) as { data: T; errors?: Array<{ message: string; type?: string }> };
  if (body.errors?.length) throw new GitHubError(body.errors.map((e) => e.message).join('；'), 200, body.errors[0].type);
  return body.data;
}

const rest = (path: string, init?: RequestInit) => call(`${API}/repos/${owner}/${repoName}${path}`, init);
const expr = (path: string) => JSON.stringify(`${studio.branch}:${path}`);

export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export async function viewer(): Promise<Viewer> {
  const data = await gql<{ viewer: Viewer }>('query { viewer { login name avatarUrl } }');
  return data.viewer;
}

/** ADMIN / MAINTAIN / WRITE can commit. Throws a readable message when the token cannot see the repository. */
export async function permission(): Promise<string> {
  try {
    const data = await gql<{ repository: { viewerPermission: string } }>(
      'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { viewerPermission } }',
    );
    return data.repository.viewerPermission;
  } catch (err) {
    if (err instanceof GitHubError && err.type === 'NOT_FOUND') {
      throw new GitHubError(`这个账号看不到仓库 ${studio.repo}：用 GitHub App 登录时，要先把 App 安装到这个仓库`, 404, 'NOT_FOUND');
    }
    throw err;
  }
}

export interface RepoFile {
  name: string;
  path: string;
  oid: string;
  size: number;
}
export interface RepoPost {
  /** Repository path of the Markdown file. */
  path: string;
  /** Folder the post's images live in (the post's own folder for `slug/index.md`, the posts folder for `slug.md`). */
  dir: string;
  slug: string;
  oid: string;
  text: string;
  /** Other files in the post's folder (images). Empty for `slug.md` posts. */
  assets: RepoFile[];
}

type TreeEntry = {
  name: string;
  type: 'blob' | 'tree';
  oid: string;
  object: { text?: string | null; isTruncated?: boolean; byteSize?: number; entries?: TreeEntry[] } | null;
};

const POSTS_QUERY = `query($owner: String!, $name: String!, $expr: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expr) {
      ... on Tree { entries { name type oid object {
        ... on Blob { text isTruncated byteSize }
        ... on Tree { entries { name type oid object { ... on Blob { text isTruncated byteSize } } } }
      } } }
    }
  }
}`;

/**
 * GraphQL cuts `Blob.text` off at about 512 KB (a post with images pasted in as data: URLs can get there);
 * those files are read whole by their blob id instead.
 */
async function fullText(path: string, oid: string, object: TreeEntry['object']): Promise<string> {
  if (!object || typeof object.text !== 'string') throw new GitHubError(`${path} 读不出文本`, 200);
  if (!object.isTruncated) return object.text;
  return new TextDecoder('utf-8', { fatal: true }).decode(await blobBytes(oid));
}

/** Every post in the posts folder: `slug/index.md(x)` and `slug.md(x)`. */
export async function listPosts(): Promise<RepoPost[]> {
  const data = await gql<{ repository: { object: { entries: TreeEntry[] } | null } }>(POSTS_QUERY, { expr: `${studio.branch}:${postsDir}` });
  // no folder yet = no posts yet
  const entries = data.repository.object ? data.repository.object.entries : [];
  const posts: Array<Promise<RepoPost>> = [];
  for (const e of entries) {
    if (e.type === 'blob' && /\.mdx?$/.test(e.name)) {
      const path = `${postsDir}/${e.name}`;
      posts.push(fullText(path, e.oid, e.object).then((text) => ({ path, dir: postsDir, slug: e.name.replace(/\.mdx?$/, ''), oid: e.oid, text, assets: [] })));
    }
    if (e.type === 'tree') {
      const files = e.object!.entries!;
      const index = files.find((f) => f.type === 'blob' && /^index\.mdx?$/.test(f.name));
      if (!index) continue;
      const dir = `${postsDir}/${e.name}`;
      const path = `${dir}/${index.name}`;
      const assets = files
        .filter((f) => f !== index && f.type === 'blob')
        .map((f) => ({ name: f.name, path: `${dir}/${f.name}`, oid: f.oid, size: f.object!.byteSize! }));
      posts.push(fullText(path, index.oid, index.object).then((text) => ({ path, dir, slug: e.name, oid: index.oid, text, assets })));
    }
  }
  return Promise.all(posts);
}

/** A text file in the repository, or null when it does not exist. */
export async function readText(path: string): Promise<{ oid: string; text: string } | null> {
  const data = await gql<{ repository: { object: { oid: string; text: string | null; isTruncated: boolean } | null } }>(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { object(expression: ${expr(path)}) { ... on Blob { oid text isTruncated } } } }`,
  );
  const obj = data.repository.object;
  if (!obj) return null;
  if (obj.text === null) throw new GitHubError(`${path} 不是文本文件`, 200);
  return { oid: obj.oid, text: await fullText(path, obj.oid, obj) };
}

/**
 * The branch head and the id of each path in that very commit (null when the path does not exist there).
 * A path can be a folder (its tree id).
 */
export async function snapshot(paths: string[]): Promise<{ head: string; oids: Array<string | null> }> {
  const fields = paths.map((p, i) => `f${i}: file(path: ${JSON.stringify(p)}) { oid }`).join('\n');
  const data = await gql<{ repository: { ref: { target: Record<string, { oid: string } | null> & { oid: string } } | null } }>(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
      ref(qualifiedName: ${JSON.stringify(`refs/heads/${studio.branch}`)}) { target { oid ... on Commit { ${fields} } } }
    } }`,
  );
  const ref = data.repository.ref;
  if (!ref) throw new GitHubError(`仓库里没有分支 ${studio.branch}`, 404);
  return { head: ref.target.oid, oids: paths.map((_, i) => { const f = ref.target[`f${i}`]; return f ? f.oid : null; }) };
}

export interface FileChanges {
  additions: Array<{ path: string; contents: string /* base64 */ }>;
  deletions: string[];
}

/** One commit on the configured branch. `expectedHead` makes GitHub refuse it if the branch moved since `snapshot`. */
export async function commit(message: string, changes: FileChanges, expectedHead: string): Promise<{ oid: string; url: string }> {
  const [headline, ...rest] = message.trim().split('\n');
  const data = await gql<{ createCommitOnBranch: { commit: { oid: string; url: string } } }>(
    `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }`,
    {
      input: {
        branch: { repositoryNameWithOwner: studio.repo, branchName: studio.branch },
        message: { headline, ...(rest.join('\n').trim() ? { body: rest.join('\n').trim() } : {}) },
        expectedHeadOid: expectedHead,
        fileChanges: { additions: changes.additions, deletions: changes.deletions.map((path) => ({ path })) },
      },
    },
  );
  return data.createCommitOnBranch.commit;
}

/** Bytes of a file by its blob id (for images in the preview). */
export async function blobBytes(oid: string): Promise<Uint8Array> {
  const res = await rest(`/git/blobs/${oid}`);
  const { content, encoding } = (await res.json()) as { content: string; encoding: string };
  if (encoding !== 'base64') throw new GitHubError(`blob ${oid} 的编码是 ${encoding}`, 200);
  return Uint8Array.from(atob(content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
}

export interface Check {
  name: string;
  state: 'pending' | 'success' | 'failure';
  url: string | null;
}

/** Check runs and commit statuses on a commit, e.g. the build that deploys it. */
export async function checks(sha: string): Promise<Check[]> {
  const [runs, status] = await Promise.all([rest(`/commits/${sha}/check-runs`), rest(`/commits/${sha}/status`)]);
  const r = (await runs.json()) as { check_runs: Array<{ name: string; status: string; conclusion: string | null; details_url: string | null; html_url: string | null }> };
  const s = (await status.json()) as { statuses: Array<{ context: string; state: string; target_url: string | null }> };
  return [
    ...r.check_runs.map((c): Check => ({
      name: c.name,
      state: c.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(c.conclusion ?? '') ? 'success' : 'failure',
      url: c.details_url ?? c.html_url,
    })),
    ...s.statuses.map((c): Check => ({ name: c.context, state: c.state === 'pending' ? 'pending' : c.state === 'success' ? 'success' : 'failure', url: c.target_url })),
  ];
}

/** Base64 of a Blob or a string, for commit additions. */
export async function base64(data: Blob | string): Promise<string> {
  const blob = typeof data === 'string' ? new Blob([data]) : data;
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

/** The blob id git gives this content, so the studio knows a file's id after committing it without asking again. */
export async function gitOid(data: Blob | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
