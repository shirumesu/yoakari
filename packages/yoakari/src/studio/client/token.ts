// The GitHub token of the signed-in user, kept in localStorage. The sign-in callback page leaves a new grant
// under GRANT_KEY and load() moves it to STORAGE_KEY, timing its lifetimes with this browser's clock.
// Tokens from the GitHub App expire after 8 hours; token() swaps them for new ones through /studio/auth/refresh.
import { AUTH_PREFIX, GRANT_KEY, STORAGE_KEY, type StoredAuth, storedFrom, type TokenGrant } from '../auth.ts';

/** The user has to sign in (again). */
export class SignInNeeded extends Error {}

let current = load();
const listeners = new Set<() => void>();
/** Signing in, signing out, or signing in as someone else. Not called when a token is refreshed. */
export const onAuthChange = (fn: () => void) => listeners.add(fn);

function load(): StoredAuth | null {
  const grant = localStorage.getItem(GRANT_KEY);
  if (grant) {
    const { grant: g, at } = JSON.parse(grant) as { grant: TokenGrant; at: number };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFrom(g, crypto.randomUUID(), at)));
    localStorage.removeItem(GRANT_KEY);
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredAuth) : null;
}

const sessionOf = (auth: StoredAuth | null) => (auth ? auth.session : null);

function use(auth: StoredAuth | null) {
  const before = sessionOf(current);
  current = auth;
  if (sessionOf(auth) !== before) for (const fn of listeners) fn();
}

export const storedAuth = () => current;

export function saveAuth(auth: StoredAuth | null) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
  use(auth);
}

// signing in or out (or a refresh) in another tab; `key` is null when the whole storage was cleared
addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY || e.key === GRANT_KEY || e.key === null) use(load());
});

const fresh = (auth: StoredAuth) => !auth.expiresAt || Date.now() < auth.expiresAt - 60_000;
let refreshing: Promise<string> | undefined;

export async function token(): Promise<string> {
  const auth = current;
  if (!auth) throw new SignInNeeded('还没有登录');
  if (fresh(auth)) return auth.token;
  refreshing ??= refresh().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

/**
 * A refresh token works once, so tabs take turns: whoever gets the lock second finds the new token the
 * first one stored and uses it instead of spending the old refresh token again.
 */
function refresh(): Promise<string> {
  return navigator.locks.request('yoakari-studio-refresh', async () => {
    const auth = load();
    use(auth);
    if (!auth) throw new SignInNeeded('已经在别的标签页退出登录');
    if (fresh(auth)) return auth.token;
    if (!auth.refreshToken || (auth.refreshExpiresAt && Date.now() > auth.refreshExpiresAt)) {
      saveAuth(null);
      throw new SignInNeeded('登录已过期，请重新登录');
    }
    const at = Date.now();
    const res = await fetch(`${AUTH_PREFIX}refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    const data = (await res.json()) as TokenGrant & { error?: string };
    if (res.status === 401) {
      saveAuth(null);
      throw new SignInNeeded(`登录已过期，请重新登录（${data.error}）`);
    }
    // anything else (GitHub down, a network hiccup at the Worker) leaves the sign-in as it is
    if (!res.ok) throw new Error(`续期登录没有成功：${data.error}`);
    saveAuth(storedFrom(data, auth.session, at));
    return data.token;
  });
}
