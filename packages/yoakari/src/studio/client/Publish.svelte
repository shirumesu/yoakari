<script lang="ts">
  // Commit dialog: what will change, the commit message, and what to do when the repository moved on.
  import { watch } from './deploy.svelte.ts';
  import type { Doc } from './docs.svelte.ts';
  import { split, tryRead } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  import { changeList, Conflict, postUrl, problems, publishDoc, titleOf } from './publish.ts';
  import { fail, toast, ui } from './ui.svelte.ts';

  interface Props { doc: Doc }
  let { doc }: Props = $props();

  const draft = $derived(tryRead(split(doc.text).fm).fields?.draft === true);
  const verb = $derived(doc.path ? '更新' : draft ? '新建草稿' : '发布');
  let message = $state('');
  $effect.pre(() => {
    if (!message) message = `写作室：${verb}《${titleOf(doc)}》`;
  });
  const changes = $derived(changeList(doc));
  const issues = $derived(problems(doc));
  let busy = $state(false);
  let conflict = $state('');

  const short = (p: string) => p.split('/').slice(-2).join('/');

  async function go(overwrite: boolean) {
    busy = true;
    conflict = '';
    try {
      const url = postUrl(doc);
      const res = await publishDoc(doc, message, overwrite);
      ui.publish = false;
      watch(res.oid, res.url, draft ? null : url);
      toast(draft ? '已提交到仓库（草稿不会出现在博客上）' : '已提交，等构建完成就上线了');
    } catch (err) {
      if (err instanceof Conflict) conflict = err.message;
      else fail(err, '提交失败');
    } finally {
      busy = false;
    }
  }
</script>

<div class="st-modal" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && (ui.publish = false)}>
  <form class="st-dialog" onsubmit={(e) => { e.preventDefault(); go(false); }} aria-label="提交">
    <h2>提交到仓库</h2>
    {#if issues.length}
      <ul class="st-issues">{#each issues as i (i)}<li><Ico name="alert" small />{i}</li>{/each}</ul>
    {/if}
    <ul class="st-changes">
      {#each changes.write as p (p)}<li><span class="add">{p === changes.path && doc.path ? '改' : '加'}</span>{short(p)}</li>{/each}
      {#each changes.remove as p (p)}<li><span class="del">删</span>{short(p)}</li>{/each}
    </ul>
    <label class="fld"><span>提交说明</span><textarea rows="2" bind:value={message}></textarea></label>
    {#if draft}<p class="st-muted">这是草稿：会存进仓库，但不会出现在博客上。</p>{/if}
    {#if conflict}
      <div class="st-conflict">
        <p><Ico name="alert" small />{conflict}</p>
        {#if doc.path && !conflict.includes('换一个')}
          <p class="st-muted">「仍然覆盖」会用你现在的版本盖掉仓库里的那次修改。不确定的话先下载一份你的版本，再在「属性」里放弃修改、看看仓库里改了什么。</p>
          <button type="button" class="st-btn danger" onclick={() => go(true)} disabled={busy}>仍然覆盖</button>
        {/if}
      </div>
    {/if}
    <div class="st-dialog-actions">
      <button type="button" class="st-btn" onclick={() => (ui.publish = false)} disabled={busy}>取消</button>
      <button type="submit" class="st-btn primary" disabled={busy || issues.length > 0 || !message.trim()}><Ico name="send" small />{busy ? '提交中…' : verb}</button>
    </div>
  </form>
</div>
