// Who is signed in, as reactive state for the page. The token itself lives in token.ts.
import { AUTH_PREFIX, type StoredAuth } from '../auth.ts';
import { permission, type Viewer, viewer } from './github.ts';
import { onAuthChange, saveAuth, SignInNeeded, storedAuth } from './token.ts';

export const account = $state({
  user: null as Viewer | null,
  /** The account can commit to the repository. */
  canWrite: false,
  checking: false,
  /** Why the user is not (or no longer) signed in. */
  error: '',
  /** Whether this deployment answers /studio/auth/* (null until asked). */
  github: null as null | { available: boolean; error?: string },
});

export const signedIn = () => account.user !== null && account.canWrite;

let checks = 0;

/** Runs at start and whenever the sign-in changes (not on token refreshes); a newer check wins. */
export async function checkSignIn() {
  const n = ++checks;
  account.user = null;
  account.canWrite = false;
  if (!storedAuth()) {
    account.checking = false;
    return;
  }
  account.checking = true;
  try {
    const user = await viewer();
    if (n !== checks) return;
    account.user = user;
    const perm = await permission();
    if (n !== checks) return;
    account.canWrite = ['ADMIN', 'MAINTAIN', 'WRITE'].includes(perm);
    account.error = account.canWrite ? '' : `${user.login} 对这个仓库只有 ${perm} 权限，不能提交`;
  } catch (err) {
    console.error('yoakari studio: sign-in check failed', err);
    // shown in the account menu, unless a newer sign-in has replaced the one this was about
    if (n === checks) account.error = (err as Error).message;
  } finally {
    if (n === checks) account.checking = false;
  }
}

/** Errors from GitHub calls: a lost sign-in turns into the signed-out state instead of an error box. */
export function isSignInLost(err: unknown) {
  if (!(err instanceof SignInNeeded)) return false;
  account.user = null;
  account.canWrite = false;
  account.error = err.message;
  return true;
}

onAuthChange(() => {
  checkSignIn();
});

/** Does this deployment have the sign-in endpoints? A static host without the Worker answers 404. */
export async function probeGitHub() {
  const res = await fetch(`${AUTH_PREFIX}status`, { headers: { accept: 'application/json' } });
  const isJson = res.headers.get('content-type')?.includes('json');
  if (res.status === 404 || !isJson) {
    account.github = { available: false };
    return;
  }
  const data = (await res.json()) as { github: boolean; error?: string };
  account.github = { available: data.github, error: data.error };
}

export function signInWithGitHub() {
  location.href = `${AUTH_PREFIX}login?return=${encodeURIComponent(location.pathname + location.hash)}`;
}

/** A personal access token (fine-grained: this repository, Contents read & write). */
export function signInWithToken(token: string) {
  const auth: StoredAuth = { via: 'token', session: crypto.randomUUID(), token: token.trim() };
  saveAuth(auth);
}

export function signOut() {
  saveAuth(null);
  account.error = '';
}
