// GitHub sign-in for the studio, written as a fetch handler for /studio/auth/*.
// The deployed site runs it in a Cloudflare Worker (worker.ts), `astro dev` in a middleware (dev-auth.ts).
//
// Everything else in the studio talks to api.github.com straight from the browser. Only one step needs a
// server: turning the sign-in `code` into a token takes the app's client secret, and GitHub does not let
// browsers call that endpoint. The token goes back to the studio page, which keeps it in localStorage.
//
// Meant for a GitHub App (Contents: read & write on the site's repository; Checks and Commit statuses:
// read for the build status). Its user tokens expire after 8 hours and come with a refresh token.

export interface AuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

/**
 * What the sign-in endpoints hand back (the callback page and /refresh). Lifetimes are in seconds; the
 * browser turns them into times with its own clock (token.ts), so a skewed server clock does not matter.
 */
export interface TokenGrant {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
}

/** What the studio keeps under STORAGE_KEY. */
export interface StoredAuth {
  via: 'github' | 'token';
  /** Made at sign-in and kept across refreshes, so a refreshed token is not mistaken for a new sign-in. */
  session: string;
  token: string;
  refreshToken?: string;
  /** ms since epoch; absent for tokens that do not expire */
  expiresAt?: number;
  refreshExpiresAt?: number;
}

/** A grant as stored, timed from `at` (when the request for it was sent). */
export function storedFrom(grant: TokenGrant, session: string, at: number): StoredAuth {
  return {
    via: 'github',
    session,
    token: grant.token,
    ...(grant.refreshToken ? { refreshToken: grant.refreshToken } : {}),
    ...(grant.expiresIn ? { expiresAt: at + grant.expiresIn * 1000 } : {}),
    ...(grant.refreshExpiresIn ? { refreshExpiresAt: at + grant.refreshExpiresIn * 1000 } : {}),
  };
}

export const AUTH_PREFIX = '/studio/auth/';
export const STORAGE_KEY = 'yoakari-studio-auth';
/** Where the callback page leaves a new grant ({ grant, at }); the studio page moves it to STORAGE_KEY. */
export const GRANT_KEY = 'yoakari-studio-grant';
const COOKIE = 'yk_studio_oauth';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function handleAuth(req: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.slice(AUTH_PREFIX.length).replace(/\/$/, '');
  const { GITHUB_CLIENT_ID: id, GITHUB_CLIENT_SECRET: secret } = env;

  if (route === 'status') {
    return json(id && secret ? { github: true } : { github: false, error: '服务器没有配置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET' });
  }
  if (!id || !secret) return page('还不能用 GitHub 登录', '服务器没有配置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET。', 500);

  if (route === 'login' && req.method === 'GET') {
    const state = randomString(24);
    const verifier = randomString(48);
    const back = safeReturn(url.searchParams.get('return'), url.origin);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.searchParams.set('client_id', id);
    authorize.searchParams.set('redirect_uri', `${url.origin}${AUTH_PREFIX}callback`);
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', await challengeOf(verifier));
    authorize.searchParams.set('code_challenge_method', 'S256');
    return new Response(null, {
      status: 302,
      headers: { location: authorize.href, 'set-cookie': cookie(url, `${state}.${verifier}.${encodeURIComponent(back)}`, 600) },
    });
  }

  if (route === 'callback' && req.method === 'GET') {
    const clear = cookie(url, '', 0);
    const ghError = url.searchParams.get('error');
    if (ghError) return page('没有登录', url.searchParams.get('error_description') ?? ghError, 400, clear);
    // state and verifier are base64url (no dots); the rest is the return path
    const [state, verifier, ...rest] = (readCookie(req) ?? '').split('.');
    if (!state || state !== url.searchParams.get('state')) {
      return page('登录没有完成', '这次登录请求已经过期，或者不是从这个浏览器发起的。回到写作室重新登录即可。', 400, clear);
    }
    const res = await exchange({ client_id: id, client_secret: secret, code: url.searchParams.get('code') ?? '', redirect_uri: `${url.origin}${AUTH_PREFIX}callback`, code_verifier: verifier });
    if (!res.ok) return page('登录没有完成', res.message, 502, clear);
    const target = safeReturn(decodeURIComponent(rest.join('.')), url.origin);
    // Hand the token to the studio page through localStorage, then go back there. Both values are JSON
    // inside a script element, with `<` escaped so neither can close it.
    const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
    const html = `<!doctype html><meta charset="utf-8"><title>登录中…</title>
<script>localStorage.setItem(${js(GRANT_KEY)},JSON.stringify({grant:${js(res.grant)},at:Date.now()}));location.replace(${js(target)});</script>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': clear } });
  }

  if (route === 'refresh' && req.method === 'POST') {
    // the refresh token is the secret here; the origin check keeps other sites from using this endpoint
    if (req.headers.get('origin') !== url.origin) return json({ error: '只接受本站发起的请求' }, 403);
    const body = (await req.json()) as { refreshToken?: unknown };
    if (typeof body.refreshToken !== 'string' || !body.refreshToken) return json({ error: '缺少 refreshToken' }, 400);
    const res = await exchange({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: body.refreshToken });
    // 401: GitHub turned the refresh token down, the user has to sign in again; 502: GitHub did not answer
    // properly, the sign-in may still be good
    return res.ok ? json(res.grant) : json({ error: res.message }, res.rejected ? 401 : 502);
  }

  return json({ error: `没有这个接口：${url.pathname}` }, 404);
}

type Exchanged = { ok: true; grant: TokenGrant } | { ok: false; message: string; /** GitHub refused the code or token */ rejected: boolean };

async function exchange(params: Record<string, string>): Promise<Exchanged> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'yoakari-studio' },
    body: JSON.stringify(params),
  });
  if (!res.ok) return { ok: false, rejected: false, message: `GitHub 返回 ${res.status} ${res.statusText}` };
  // GitHub answers refusals (bad code, used refresh token…) with 200 and an `error` field
  const t = (await res.json()) as TokenResponse;
  if (t.error) return { ok: false, rejected: true, message: t.error_description ?? t.error };
  if (!t.access_token) return { ok: false, rejected: false, message: 'GitHub 没有返回 token' };
  return {
    ok: true,
    grant: {
      token: t.access_token,
      ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
      ...(t.expires_in ? { expiresIn: t.expires_in } : {}),
      ...(t.refresh_token_expires_in ? { refreshExpiresIn: t.refresh_token_expires_in } : {}),
    },
  };
}

/**
 * Where to go after signing in: a page of the studio on this site, else the studio itself. Resolved with
 * the URL parser, as the browser will, so tricks like `/\t/evil.com` or `/%2F/evil.com` cannot leave the site.
 */
function safeReturn(path: string | null, origin: string) {
  const u = path ? URL.parse(path, origin) : null;
  return u && u.origin === origin && u.pathname.startsWith('/studio/') ? u.pathname + u.search + u.hash : '/studio/';
}

function cookie(url: URL, value: string, maxAge: number) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=${AUTH_PREFIX}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function readCookie(req: Request) {
  for (const part of (req.headers.get('cookie') ?? '').split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (part.slice(0, eq) === COOKIE) return part.slice(eq + 1);
  }
  return undefined;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const challengeOf = async (verifier: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function page(title: string, message: string, status: number, setCookie?: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font:15px/1.8 system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:0 20px;color:#4a3a40}h1{font-size:20px}a{color:#b0506c}</style>
<h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/studio/">回到写作室</a></p></html>`;
  const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(html, { status, headers });
}
