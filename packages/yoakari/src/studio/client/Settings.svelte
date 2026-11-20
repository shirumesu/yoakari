<script lang="ts">
  // 设置: the theme's options (yoakari.config.json) as a form. Committing rebuilds the site with them.
  import { z } from 'astro/zod';
  import { configSchema } from '../../config.ts';
  import { signedIn } from './account.svelte.ts';
  import { watch } from './deploy.svelte.ts';
  import { configPath, site } from './env.ts';
  import Field, { type Schema } from './Field.svelte';
  import Ico from './Ico.svelte';
  import { commitSettings, resetSettings, setSettings, settings, settingsDirty, settingsProblems, settingsText, SettingsConflict } from './settings.svelte.ts';
  import { fail, toast } from './ui.svelte.ts';

  const root = z.toJSONSchema(configSchema, { io: 'input' }) as Schema;
  // `$schema` only points editors at the schema; not a setting
  const props = Object.fromEntries(Object.entries(root.properties ?? {}).filter(([k]) => k !== '$schema'));

  /** Sections of the page; options the list does not name land in 其他, so new ones still show up. */
  const GROUPS: Array<[string, string[]]> = [
    ['站点', ['title', 'subtitle', 'description', 'favicon', 'lang', 'timezone', 'since', 'license']],
    ['外观', ['hue', 'hero', 'petals', 'webFonts', 'customCss']],
    ['作者', ['author', 'socials']],
    ['导航与侧栏', ['nav', 'notice']],
    ['文章', ['postsPerPage', 'breaks']],
    ['书签页', ['bookmarks']],
    ['番组页', ['bangumi']],
    ['写作室', ['studio']],
  ];
  const named = new Set(GROUPS.flatMap(([, keys]) => keys));
  const rest = Object.keys(props).filter((k) => !named.has(k));
  const groups = [...GROUPS.map(([t, keys]) => [t, keys.filter((k) => k in props)] as [string, string[]]), ...(rest.length ? [['其他', rest] as [string, string[]]] : [])].filter(([, k]) => k.length);

  const problems = $derived.by(() => {
    settings.data;
    return settingsProblems();
  });
  const dirty = $derived(settingsDirty());
  // the studio itself shows the hue being picked (and goes back when the edit is undone)
  $effect(() => {
    const hue = settings.data?.hue;
    document.documentElement.style.setProperty('--h', String(typeof hue === 'number' ? hue : site.hue));
  });
  let active = $state(groups[0][0]);
  let message = $state('');
  let committing = $state(false);
  let conflict = $state('');
  let dialog = $state(false);

  const setKey = (k: string, v: unknown) => {
    const next = { ...settings.data };
    if (v === undefined) delete next[k];
    else next[k] = v;
    setSettings(next);
  };

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([settingsText()], { type: 'application/json' }));
    a.download = 'yoakari.config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function submit(overwrite: boolean) {
    committing = true;
    conflict = '';
    try {
      const res = await commitSettings(message.trim() || '写作室：更新站点设置', overwrite);
      message = '';
      dialog = false;
      watch(res.oid, res.url, '/');
      toast('设置已提交，构建完成后整个站点都会用上新设置');
    } catch (err) {
      if (err instanceof SettingsConflict) conflict = err.message;
      else fail(err, '提交设置失败');
    } finally {
      committing = false;
    }
  }

  function scrollTo(title: string) {
    active = title;
    document.getElementById(`st-set-${title}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="st-settings">
  {#if !configPath}
    <section class="st-empty">
      <h1>这个站点的设置写在 astro.config 里</h1>
      <p>网页上只能改 <code>yoakari.config.json</code>：把 <code>yoakari({'{…}'})</code> 里的对象搬进项目根目录的 <code>yoakari.config.json</code>，再把 astro.config 里改成 <code>yoakari()</code>。</p>
    </section>
  {:else if !settings.data}
    <section class="st-empty"><p class="st-muted">{settings.loading ? '读取设置中…' : '还没有读到设置'}</p></section>
  {:else}
    <nav class="st-set-nav" aria-label="设置分组">
      {#each groups as [title, keys] (title)}
        {@const n = [...problems.keys()].filter((p) => keys.includes(p.split('.')[0])).length}
        <button type="button" class:on={active === title} onclick={() => scrollTo(title)}>{title}{#if n}<span class="st-count">{n}</span>{/if}</button>
      {/each}
    </nav>

    <div class="st-set-main">
      <header class="st-set-head">
        <div>
          <h1>站点设置</h1>
          <p class="st-muted"><code>{configPath}</code> · {settings.loading ? '读取中…' : signedIn() ? '仓库里的版本' : '构建时的版本（登录后读仓库里最新的）'}</p>
        </div>
        <div class="st-actions">
          {#if dirty}<span class="st-badge warn">有修改</span>{/if}
          <button type="button" class="st-btn" onclick={() => confirm('放弃对设置的所有修改？') && resetSettings(signedIn()).catch((err) => fail(err, '还原设置失败'))} disabled={!dirty}><Ico name="undo" small />还原</button>
          <button type="button" class="st-btn" onclick={download}><Ico name="download" small />下载 JSON</button>
          <button type="button" class="st-btn primary" onclick={() => { conflict = ''; dialog = true; }} disabled={!signedIn() || !dirty || problems.size > 0}
            title={signedIn() ? (problems.size ? '先改好标红的设置' : dirty ? '提交到仓库' : '没有修改') : '登录 GitHub 后才能提交；现在可以下载 JSON 替换项目里的文件'}><Ico name="send" small />提交</button>
        </div>
      </header>

      {#if settings.stale}
        <p class="st-conflict"><Ico name="alert" small />这些修改是在旧版本的设置上做的，仓库里的设置后来又被改过。提交时会提醒你是否覆盖。</p>
      {/if}
      {#if problems.size}
        <ul class="st-issues">
          {#each [...problems] as [p, msgs] (p)}<li><Ico name="alert" small /><code>{p || '（整体）'}</code> {msgs.join('；')}</li>{/each}
        </ul>
      {/if}

      {#each groups as [title, keys] (title)}
        <section class="st-set-group" id={`st-set-${title}`}>
          <h2>{title}</h2>
          {#each keys as k (k)}
            <Field schema={props[k]} value={settings.data[k]} set={(v) => setKey(k, v)} path={k} name={k} required={root.required?.includes(k) ?? false} {problems} />
          {/each}
        </section>
      {/each}


    </div>
  {/if}
</div>

{#if dialog}
  <div class="st-modal" role="presentation" onclick={(e) => e.target === e.currentTarget && !committing && (dialog = false)}>
    <form class="st-dialog" onsubmit={(e) => { e.preventDefault(); submit(false); }} aria-label="提交设置">
      <h2>提交站点设置</h2>
      <ul class="st-changes"><li><span class="add">改</span>{configPath}</li></ul>
      <label class="fld"><span>提交说明</span><input bind:value={message} placeholder="写作室：更新站点设置" /></label>
      <p class="st-muted">提交后整个站点会重新构建，几分钟后所有页面都用上新设置。</p>
      {#if conflict}
        <div class="st-conflict">
          <p><Ico name="alert" small />{conflict}</p>
          <p class="st-muted">「仍然覆盖」会用你现在的设置盖掉仓库里的那次修改。</p>
          <button type="button" class="st-btn danger" onclick={() => submit(true)} disabled={committing}>仍然覆盖</button>
        </div>
      {/if}
      <div class="st-dialog-actions">
        <button type="button" class="st-btn" onclick={() => (dialog = false)} disabled={committing}>取消</button>
        <button type="submit" class="st-btn primary" disabled={committing}><Ico name="send" small />{committing ? '提交中…' : '提交'}</button>
      </div>
    </form>
  </div>
{/if}
