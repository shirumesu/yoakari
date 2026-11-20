// The site settings page: edits yoakari.config.json as data, validated with the theme's own schema.
import { configSchema } from '../../config.ts';
import { buildInfo, configPath } from './env.ts';
import { base64, commit, gitOid, readText, snapshot } from './github.ts';
import { idbDel, idbGet, idbSet } from './idb.ts';
import { fail } from './ui.svelte.ts';

type Json = Record<string, unknown>;

export const settings = $state({
  data: null as Json | null,
  /** The file text the edit started from (the repository's when signed in, else the build's copy). */
  baseText: null as string | null,
  /** The edit was started on an older version of the file than the repository has now. */
  stale: false,
  loading: false,
});

const STORE_KEY = 'settings';
type Saved = { data: Json; baseText: string };

const canonical = (v: unknown) => JSON.stringify(v);
export const settingsDirty = () => settings.data !== null && settings.baseText !== null && canonical(settings.data) !== canonical(JSON.parse(settings.baseText));

/** The file as it will be written: the original key order is kept, two-space indent, final newline. */
export const settingsText = () => `${JSON.stringify(settings.data, null, 2)}\n`;

function parse(text: string): Json {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${configPath} 不是一个 JSON 对象`);
  return data as Json;
}

let loads = 0;
let edits = 0;

/** Unsubmitted edits if there are any, else the repository's file (signed in) or the build's copy. */
export async function loadSettings(fromRepo: boolean) {
  if (!configPath || buildInfo.configText === null) return;
  const n = ++loads;
  const editsBefore = edits;
  settings.loading = true;
  try {
    const saved = await idbGet<Saved>(STORE_KEY);
    const base = fromRepo ? await readText(configPath) : null;
    if (fromRepo && !base) throw new Error(`仓库里没有 ${configPath}`);
    if (n !== loads) return; // a newer load is under way
    const baseText = base ? base.text : buildInfo.configText;
    if (edits !== editsBefore) {
      // edited while this was loading: keep the edits, only tell whether they are behind the repository
      settings.stale = settings.baseText !== baseText;
      return;
    }
    if (saved) Object.assign(settings, { data: saved.data, baseText: saved.baseText, stale: saved.baseText !== baseText });
    else Object.assign(settings, { data: parse(baseText), baseText, stale: false });
  } finally {
    if (n === loads) settings.loading = false;
  }
}

/** Keeps unsubmitted edits in the browser; edits that match the file again are dropped from it. */
function persist() {
  const done = settingsDirty() ? idbSet(STORE_KEY, $state.snapshot({ data: settings.data, baseText: settings.baseText })) : idbDel(STORE_KEY);
  done.catch((err) => fail(err, '设置的修改没能存进浏览器'));
}

export function setSettings(data: Json) {
  edits++;
  settings.data = data;
  persist();
}

/** Drops the edits and loads the settings again (the repository's current file when signed in). */
export async function resetSettings(fromRepo: boolean) {
  edits++;
  await idbDel(STORE_KEY);
  await loadSettings(fromRepo);
}

/** Problems by path ("nav.0.href" → messages), from the same schema the build uses. */
export function settingsProblems(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!settings.data) return out;
  const res = configSchema.safeParse(settings.data);
  if (res.success) return out;
  for (const i of res.error.issues) {
    const key = i.path.join('.');
    out.set(key, [...(out.get(key) ?? []), i.message]);
  }
  return out;
}

export class SettingsConflict extends Error {}

export async function commitSettings(message: string, overwrite: boolean) {
  if (!configPath || settings.baseText === null) throw new Error('这个站点的设置写在 astro.config 里，不能在网页上改');
  const problems = settingsProblems();
  if (problems.size) throw new Error(`设置里还有 ${problems.size} 处问题，改好再提交`);
  const text = settingsText();
  const { head, oids } = await snapshot([configPath]);
  if (oids[0] !== (await gitOid(settings.baseText)) && !overwrite) {
    throw new SettingsConflict('仓库里的设置和你开始编辑时的版本不一样了（在别处改过）');
  }
  const result = await commit(message, { additions: [{ path: configPath, contents: await base64(text) }], deletions: [] }, head);
  Object.assign(settings, { baseText: text, stale: false });
  persist();
  return result;
}
