// A tiny key-value store on IndexedDB: unsubmitted work (texts and pasted images as Blobs) lives here,
// so closing the tab loses nothing. localStorage would not hold the images.
import { assertTab } from './tab.svelte.ts';

const DB = 'yoakari-studio';
const STORE = 'kv';

let opening: Promise<IDBDatabase> | undefined;
function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

/**
 * Runs requests in one transaction and settles when the transaction does: a write is only done once it
 * commits (a full quota, for one, shows up as an abort after the request itself succeeded).
 */
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => () => T): Promise<T> {
  // only the tab that holds the studio writes (tab.svelte.ts)
  if (mode === 'readwrite') assertTab();
  const t = (await db()).transaction(STORE, mode);
  const result = run(t.objectStore(STORE));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(result());
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = <T>(key: string) =>
  tx('readonly', (s) => {
    const r = s.get(key);
    return () => r.result as T | undefined;
  });
export const idbSet = (key: string, value: unknown) =>
  tx('readwrite', (s) => {
    s.put(value, key);
    return () => {};
  });
export const idbDel = (key: string) =>
  tx('readwrite', (s) => {
    s.delete(key);
    return () => {};
  });
export const idbEntries = <T>(prefix: string) =>
  tx('readonly', (s) => {
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const keys = s.getAllKeys(range);
    const values = s.getAll(range);
    return () => keys.result.map((k, i): [string, T] => [String(k), values.result[i] as T]);
  });
