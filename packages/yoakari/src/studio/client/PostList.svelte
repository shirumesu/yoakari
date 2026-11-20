<script lang="ts">
  // Left column: posts in the repository (signed in) and posts that only exist in this browser.
  import { signedIn } from './account.svelte.ts';
  import { docs, isDirty, openRepo, select } from './docs.svelte.ts';
  import { split, tryRead } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  import { titleOf } from './publish.ts';
  import { fail, loadRepo, repo, ui } from './ui.svelte.ts';

  let q = $state('');

  type Row = { key: string; title: string; date: string; draft: boolean; dirty: boolean; open: () => void };

  const meta = (text: string) => {
    const f = tryRead(split(text).fm).fields ?? {};
    const d = f.published ? new Date(String(f.published)) : null;
    return { date: d && !Number.isNaN(d.getTime()) ? d : null, draft: f.draft === true };
  };
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('sv-SE') : '');
  const match = (r: { title: string }) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase());

  const local = $derived(
    Object.values(docs.all)
      .filter((d) => !d.path)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d): Row => ({ key: d.key, title: titleOf(d), date: '', draft: true, dirty: true, open: () => select(d.key) }))
      .filter(match),
  );

  const remote = $derived(
    repo.posts
      .map((p) => {
        const key = `repo:${p.path}`;
        const mine = docs.all[key];
        const m = meta(mine?.text ?? p.text);
        return { row: { key, title: titleOf(mine ?? p), date: fmt(m.date), draft: m.draft, dirty: mine ? isDirty(mine) : false, open: () => openRepo(p) } as Row, at: m.date?.getTime() ?? 0 };
      })
      .sort((a, b) => b.at - a.at)
      .map((x) => x.row)
      .filter(match),
  );

  // repository posts edited earlier but not in the list (signed out, or deleted in the repository meanwhile)
  const orphans = $derived(
    Object.values(docs.all)
      .filter((d) => d.path && !repo.posts.some((p) => p.path === d.path) && isDirty(d))
      .map((d): Row => ({ key: d.key, title: titleOf(d), date: '', draft: false, dirty: true, open: () => select(d.key) }))
      .filter(match),
  );

  function importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // the new-post dialog picks the file up and asks for the folder name
    ui.importing = file;
    ui.newPost = true;
  }
</script>

{#snippet list(rows: Row[])}
  <ul>
    {#each rows as r (r.key)}
      <li>
        <button type="button" class:on={docs.current === r.key} onclick={r.open}>
          <span class="t">{r.title}</span>
          <span class="m">
            {#if r.dirty}<span class="st-dot" title="有没提交的修改"></span>{/if}
            {#if r.draft}<span class="st-badge">草稿</span>{/if}
            {r.date}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<aside class="st-side" aria-label="文章">
  <div class="st-side-head">
    <input type="search" bind:value={q} placeholder="找文章…" aria-label="按标题筛选" />
    <button type="button" class="st-icon" onclick={() => (ui.newPost = true)} title="新建文章"><Ico name="plus" /></button>
    <label class="st-icon" title="导入 Markdown 文件"><Ico name="file" /><input type="file" accept=".md,.mdx,.markdown,text/markdown" hidden onchange={importFile} /></label>
  </div>

  <div class="st-side-scroll">
    {#if local.length}
      <h2>只在这个浏览器里</h2>
      {@render list(local)}
    {/if}
    {#if orphans.length}
      <h2>还没提交的修改</h2>
      {@render list(orphans)}
    {/if}
    {#if signedIn()}
      <h2>
        博客里的文章
        <button type="button" class="st-icon tiny" onclick={() => loadRepo().catch((err) => fail(err, '读取文章列表失败'))} title="重新读取" disabled={repo.status === 'loading'}><Ico name="refresh" small /></button>
      </h2>
      {#if repo.status === 'loading' && !repo.posts.length}<p class="st-muted">读取中…</p>
      {:else if repo.status === 'error'}<p class="st-err">{repo.error}</p>
      {:else if !remote.length}<p class="st-muted">{q ? '没有标题匹配的文章' : '还没有文章'}</p>
      {:else}{@render list(remote)}{/if}
    {:else if !local.length && !orphans.length}
      <p class="st-muted">这里还空着。新建一篇，或者登录后编辑博客里已有的文章。</p>
    {/if}
  </div>
</aside>
