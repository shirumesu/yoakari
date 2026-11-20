// One studio tab at a time. Each tab keeps the posts in memory and writes them whole to IndexedDB, so two
// tabs editing at once would overwrite each other's work. The tab holding the lock edits; another tab can
// take the lock over, and the one that lost it stops saving and offers to reload.
export const tab = $state({
  state: 'starting' as 'starting' | 'held' | 'elsewhere' | 'lost',
});

const LOCK = 'yoakari-studio-tab';

function hold(options: LockOptions): Promise<boolean> {
  if (!('locks' in navigator)) throw new Error('写作室要在 https 或 localhost 下打开：浏览器只在这些地址提供它需要的功能');
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(LOCK, options, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        tab.state = 'held';
        resolve(true);
        return new Promise<never>(() => {}); // held until the page closes or another tab takes over
      })
      .catch((err: unknown) => {
        // once held, the request only ends when another tab steals the lock
        if (tab.state === 'held') tab.state = 'lost';
        else reject(err);
      });
  });
}

/** Takes the lock if no other tab has it. */
export async function claimTab() {
  const ok = await hold({ ifAvailable: true });
  if (!ok) tab.state = 'elsewhere';
  return ok;
}

/** Takes the lock from the tab that has it. */
export const takeOverTab = () => hold({ steal: true });

export function assertTab() {
  if (tab.state !== 'held') throw new Error('写作室已经在另一个标签页里打开，这个标签页不再保存');
}
