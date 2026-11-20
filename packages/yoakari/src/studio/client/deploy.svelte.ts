// After a commit: follow the checks GitHub reports on it (the site's build, e.g. Cloudflare Workers Builds)
// until they finish, so the studio can say when the change is live.
import { type Check, checks } from './github.ts';

export const deploy = $state({
  sha: null as string | null,
  commitUrl: null as string | null,
  /** page to open once it is live */
  pageUrl: null as string | null,
  checks: [] as Check[],
  state: 'idle' as 'idle' | 'waiting' | 'running' | 'success' | 'failure' | 'none' | 'error',
  error: '',
});

const POLL_MS = 6000;
/** No check showing up by then means the repository has no build reporting back. */
const NO_CHECKS_MS = 90_000;
const GIVE_UP_MS = 20 * 60_000;
let timer = 0;

export function watch(sha: string, commitUrl: string, pageUrl: string | null) {
  clearTimeout(timer);
  Object.assign(deploy, { sha, commitUrl, pageUrl, checks: [], state: 'waiting', error: '' });
  const started = Date.now();
  const tick = async () => {
    if (deploy.sha !== sha) return;
    try {
      const list = await checks(sha);
      if (deploy.sha !== sha) return;
      deploy.checks = list;
      if (!list.length) {
        if (Date.now() - started > NO_CHECKS_MS) return void (deploy.state = 'none');
      } else if (list.some((c) => c.state === 'failure')) {
        return void (deploy.state = 'failure');
      } else if (list.every((c) => c.state === 'success')) {
        return void (deploy.state = 'success');
      } else deploy.state = 'running';
      if (Date.now() - started > GIVE_UP_MS) {
        deploy.state = 'error';
        deploy.error = '等了 20 分钟构建还没结束，去提交页面看看';
        return;
      }
      timer = window.setTimeout(tick, POLL_MS);
    } catch (err) {
      deploy.state = 'error';
      deploy.error = `读不到构建状态：${(err as Error).message}`;
      console.error('yoakari studio: reading checks failed', err);
    }
  };
  timer = window.setTimeout(tick, 3000);
}

export function closeDeploy() {
  clearTimeout(timer);
  deploy.sha = null;
  deploy.state = 'idle';
}
