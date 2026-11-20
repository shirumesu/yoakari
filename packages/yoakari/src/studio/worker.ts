// Cloudflare Worker for a site deployed with Workers static assets: answers the studio's GitHub sign-in
// (/studio/auth/*) and leaves every other request to the static files.
//
// wrangler.jsonc of the site:
//   "main": "./worker.ts",                 // a file with: export { default } from 'astro-yoakari/studio/worker';
//   "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/studio/auth/*"] },
//   "vars": { "GITHUB_CLIENT_ID": "<the GitHub App's client id>" }
// and the secret GITHUB_CLIENT_SECRET (Cloudflare dashboard → the Worker → Settings → Variables and Secrets).
import { AUTH_PREFIX, type AuthEnv, handleAuth } from './auth.ts';

interface Env extends AuthEnv {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname.startsWith(AUTH_PREFIX)) return handleAuth(req, env);
    return env.ASSETS.fetch(req);
  },
};
