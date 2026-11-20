<script lang="ts">
  // New post (or an imported .md file): title and the folder name, which becomes the post's URL.
  import { onMount } from 'svelte';
  import { create, template } from './docs.svelte.ts';
  import { join, split, tryRead } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  import { validSlug } from './publish.ts';
  import { fail, repo, ui } from './ui.svelte.ts';

  let title = $state('');
  let slug = $state('');
  let slugTouched = $state(false);
  let imported = $state<{ name: string; text: string } | null>(null);
  let input = $state<HTMLInputElement>();

  /** ASCII words of the title become the suggested folder name; Chinese titles need one typed in. */
  const suggest = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  $effect(() => {
    if (!slugTouched) slug = suggest(title);
  });
  const taken = $derived(repo.posts.some((p) => p.slug === slug));
  const ok = $derived(validSlug(slug) && !taken && (imported || title.trim()));

  onMount(() => {
    input?.focus();
    const file = ui.importing;
    ui.importing = null;
    if (!file) return;
    file.text().then((text) => {
      const base = file.name.replace(/\.(md|mdx|markdown)$/i, '');
      imported = { name: file.name, text };
      const t = tryRead(split(text).fm).fields?.title;
      title = typeof t === 'string' ? t : base;
      slug = base === 'index' ? suggest(title) : base;
      slugTouched = true;
    }, (err) => fail(err, `读不了 ${file.name}`));
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!ok) return;
    try {
      let text: string;
      if (imported) {
        const { fm, body } = split(imported.text);
        // a file without frontmatter gets the template's fields
        text = fm === null ? join(split(template(title.trim())).fm, `\n${body}`) : imported.text;
      } else text = template(title.trim());
      create(slug, text);
      ui.newPost = false;
      ui.props = true;
    } catch (err) {
      fail(err, '没能新建');
    }
  }
</script>

<div class="st-modal" role="presentation" onclick={(e) => e.target === e.currentTarget && (ui.newPost = false)}>
  <form class="st-dialog" onsubmit={submit} aria-label="新建文章">
    <h2>{imported ? `导入 ${imported.name}` : '新建文章'}</h2>
    <label class="fld"><span>标题</span><input bind:this={input} bind:value={title} placeholder="起个标题" /></label>
    <label class="fld">
      <span>文件夹名</span>
      <input value={slug} oninput={(e) => { slug = e.currentTarget.value.trim(); slugTouched = true; }} placeholder="my-new-post" spellcheck="false" class:bad={slug && !validSlug(slug)} />
      <small>
        {#if taken}博客里已经有叫 {slug} 的文章了{:else if slug && !validSlug(slug)}只能用字母、数字、中文、- 和 _{:else}文章会放在 posts/{slug || '…'}/index.md，链接是 /posts/{slug || '…'}/{/if}
      </small>
    </label>
    <p class="st-muted">新文章先存在这个浏览器里，默认是草稿；写好以后在「属性」里关掉草稿，再提交。</p>
    <div class="st-dialog-actions">
      <button type="button" class="st-btn" onclick={() => (ui.newPost = false)}>取消</button>
      <button type="submit" class="st-btn primary" disabled={!ok}><Ico name="plus" small />开始写</button>
    </div>
  </form>
</div>
