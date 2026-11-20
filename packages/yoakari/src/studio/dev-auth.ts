// `astro dev` has no Worker, so a Vite middleware answers /studio/auth/* with the same handler.
// The GitHub App needs http://localhost:4321/studio/auth/callback among its callback URLs for this.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AUTH_PREFIX, type AuthEnv, handleAuth } from './auth.ts';

type Next = (err?: unknown) => void;
interface DevServer {
  middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => void };
}

export function devAuthMiddleware(env: AuthEnv) {
  return {
    name: 'yoakari:studio-auth',
    configureServer(server: DevServer) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(AUTH_PREFIX)) return next();
        respond(req, res, env).catch(next);
      });
    },
  };
}

async function respond(req: IncomingMessage, res: ServerResponse, env: AuthEnv) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await handleAuth(request, env);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    if (k !== 'set-cookie') res.setHeader(k, v);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
