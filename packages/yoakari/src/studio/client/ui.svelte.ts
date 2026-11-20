// Page-wide UI state: messages, open panels, the post list from the repository.
import { isSignInLost } from './account.svelte.ts';
import { listPosts, type RepoPost } from './github.ts';

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

export const ui = $state({
  tab: (location.hash === '#settings' ? 'settings' : 'posts') as 'posts' | 'settings',
  /** what the writing area shows */
  view: 'split' as 'edit' | 'split' | 'preview',
  props: false,
  publish: false,
  newPost: false,
  /** a .md file picked with 导入, handed to the new-post dialog */
  importing: null as File | null,
  toasts: [] as Toast[],
});

let seq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++seq;
  ui.toasts.push({ id, kind, text });
  if (kind === 'info') setTimeout(() => dismiss(id), 3200);
}
export const dismiss = (id: number) => {
  ui.toasts = ui.toasts.filter((t) => t.id !== id);
};

/** Every failed action ends here: shown to the user (errors stay until closed) and logged with its stack. */
export function fail(err: unknown, what?: string) {
  console.error(`yoakari studio: ${what ?? 'error'}`, err);
  if (isSignInLost(err)) {
    toast(`${(err as Error).message}。没提交的内容都还在本地。`, 'error');
    return;
  }
  toast(`${what ? `${what}：` : ''}${err instanceof Error ? err.message : String(err)}`, 'error');
}

export const repo = $state({
  posts: [] as RepoPost[],
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: '',
});

let reading: Promise<void> | undefined;
let commits = 0;

/** Reads the post list from the repository (one read at a time; callers report the error). */
export function loadRepo(): Promise<void> {
  reading ??= readRepo().finally(() => {
    reading = undefined;
  });
  return reading;
}

async function readRepo() {
  repo.status = 'loading';
  try {
    for (;;) {
      const before = commits;
      const posts = await listPosts();
      if (before === commits) {
        repo.posts = posts;
        break;
      }
      // this tab committed while the list was on its way, so the list may predate the commit: read again
    }
    repo.status = 'ready';
    repo.error = '';
  } catch (err) {
    repo.status = 'error';
    repo.error = (err as Error).message;
    throw err;
  }
}

/** A commit from this tab changed the posts: update the list in place (and make a list read under way read again). */
export function afterCommit(update: (posts: RepoPost[]) => RepoPost[]) {
  commits++;
  repo.posts = update(repo.posts);
}

export const repoPost = (path: string | null) => (path ? repo.posts.find((p) => p.path === path) : undefined);
