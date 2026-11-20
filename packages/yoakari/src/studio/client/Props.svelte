<script lang="ts">
  // The 属性 panel: frontmatter as a form (the YAML stays as written for everything the form does not
  // touch), the images in the post's folder, and removing / resetting the post.
  import { signedIn } from './account.svelte.ts';
  import { watch } from './deploy.svelte.ts';
  import { addAsset, assetUrl, assetVersion, discard, type Doc, isDirty, reload, removeAsset, restoreAsset, setField, setText, touch } from './docs.svelte.ts';
  import { site } from './env.ts';
  import { isoInZone, join, split, tryRead } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  import { Conflict, deletePost, postUrl, problems, titleOf, validSlug } from './publish.ts';
  import { fail, loadRepo, repo, repoPost, toast } from './ui.svelte.ts';

  interface Props { doc: Doc }
  let { doc }: Props = $props();

  const KNOWN = ['title', 'published', 'updated', 'draft', 'description', 'image', 'tags', 'category', 'pinned', 'lang'];
  const parts = $derived(split(doc.text));
  const parsed = $derived(tryRead(parts.fm));
  const f = $derived(parsed.fields ?? {});
  const issues = $derived(problems(doc));
  const others = $derived(Object.keys(f).filter((k) => !KNOWN.includes(k)));

  function set(key: string, value: unknown) {
    try {
      setField(doc, key, value);
    } catch (err) {
      fail(err, `改不了 ${key}`);
    }
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

  /* dates: shown in the site's time zone, written back with its offset (2026-04-10T16:12:00+08:00) */
  const tz = site.timezone;
  function toLocal(v: unknown) {
    if (!v) return '';
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? '' : isoInZone(d, tz).slice(0, 16);
  }
  function fromLocal(v: string) {
    const offset = isoInZone(new Date(`${v}:00Z`), tz).slice(19);
    return `${v}:00${offset}`;
  }
  const now = () => isoInZone(new Date(), tz);

  /* tags and categories already used on the site */
  const allTags = $derived([...new Set(repo.posts.flatMap((p) => { const t = tryRead(split(p.text).fm).fields?.tags; return Array.isArray(t) ? t.map(String) : []; }))].sort());
  const allCats = $derived([...new Set(repo.posts.map((p) => str(tryRead(split(p.text).fm).fields?.category)).filter(Boolean))].sort());
  const tags = $derived(Array.isArray(f.tags) ? f.tags.map(String) : []);
  let tagInput = $state('');
  function addTag() {
    const t = tagInput.trim().replace(/,$/, '');
    tagInput = '';
    if (t && !tags.includes(t)) set('tags', [...tags, t]);
  }
  function tagKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length) set('tags', tags.slice(0, -1));
  }

  /* cover and images */
  const images = $derived(doc.assets.filter((a) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(a.name)));
  const coverValue = $derived(str(f.image));
  const coverLocal = $derived(coverValue && !/^([a-z][\w+.-]*:|\/)/i.test(coverValue) ? coverValue.replace(/^\.\//, '') : '');
  const thumb = (name: string) => {
    assetVersion.n;
    return assetUrl(doc, name, (err) => fail(err, `读取图片 ${name} 失败`));
  };
  let coverPicker = $state<HTMLInputElement>();
  function uploadCover(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const ext = file.name.match(/\.\w+$/)?.[0] ?? '.png';
      const name = addAsset(doc, file, `cover${ext.toLowerCase()}`);
      set('image', `./${name}`);
    } catch (err) {
      fail(err, '没能加入封面');
    }
  }
  const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  async function copyMd(name: string) {
    await navigator.clipboard.writeText(`![](./${encodeURI(name)})`);
    toast('已复制图片的 Markdown，粘贴到正文里即可');
  }

  /* raw YAML */
  let yamlOpen = $state(false);
  let yamlDraft = $state('');
  let yamlError = $state('');
  function openYaml() {
    yamlDraft = parts.fm ?? '';
    yamlError = '';
    yamlOpen = !yamlOpen;
  }
  function editYaml(v: string) {
    yamlDraft = v;
    const r = tryRead(v);
    yamlError = r.error ?? '';
    if (r.error === null) setText(doc, join(v, parts.body));
  }
  // broken YAML in the file: open the editor on it; form edits while it is open: show them in it
  $effect(() => {
    const fm = parts.fm ?? '';
    if (parsed.error !== null && !yamlOpen) {
      yamlDraft = fm;
      yamlOpen = true;
    } else if (yamlOpen && !yamlError && fm !== yamlDraft.replace(/\n+$/, '')) yamlDraft = fm;
  });

  /* slug of a post that is not in the repository yet */
  function setSlug(v: string) {
    doc.slug = v.trim();
    touch(doc);
  }

  /* reset / remove */
  const post = $derived(repoPost(doc.path));
  let busy = $state(false);
  async function resetDoc() {
    if (!confirm('放弃这篇文章在写作室里的所有修改，回到仓库里现在的版本？')) return;
    busy = true;
    try {
      // read the list again: the version to go back to is the repository's current one, not the one opened
      await loadRepo();
      const fresh = repoPost(doc.path);
      if (!fresh) throw new Error('仓库里已经没有这篇文章了');
      reload(doc, fresh);
    } catch (err) {
      fail(err, '没能回到仓库里的版本');
    } finally {
      busy = false;
    }
  }
  function dropLocal() {
    if (!confirm(`删除「${titleOf(doc)}」？它只存在这个浏览器里，删了就找不回来了。`)) return;
    discard(doc);
  }
  async function removeFromBlog() {
    if (!post) return;
    if (!confirm(`从博客删除「${titleOf(doc)}」？这会提交一个删除它（连同 ${post.assets.length} 个图片）的 commit。`)) return;
    busy = true;
    try {
      const res = await deletePost(post, doc.baseOid, `写作室：删除《${titleOf(doc)}》`);
      discard(doc);
      watch(res.oid, res.url, null);
      toast('已删除，等构建完成后就从博客上消失了');
    } catch (err) {
      fail(err, err instanceof Conflict ? '没有删除' : '删除失败');
    } finally {
      busy = false;
    }
  }
</script>

<aside class="st-props" aria-label="文章属性">
  <div class="st-props-scroll">
    {#if issues.length}
      <ul class="st-issues">{#each issues as i (i)}<li><Ico name="alert" small />{i}</li>{/each}</ul>
    {/if}

    {#if parsed.error === null}
      <label class="fld"><span>标题</span><input value={str(f.title)} oninput={(e) => set('title', e.currentTarget.value)} placeholder="文章标题" /></label>

      {#if !doc.path}
        <label class="fld">
          <span>文件夹名</span>
          <input value={doc.slug} oninput={(e) => setSlug(e.currentTarget.value)} placeholder="my-post" class:bad={!validSlug(doc.slug)} spellcheck="false" />
          <small>文章链接是 {postUrl(doc)}，发布后尽量别改</small>
        </label>
      {:else}
        <div class="fld"><span>位置</span><code class="path">{doc.path}</code><small>链接 {postUrl(doc)}</small></div>
      {/if}

      <div class="fld">
        <span>发布时间</span>
        <div class="row">
          <input type="datetime-local" value={toLocal(f.published)} onchange={(e) => e.currentTarget.value && set('published', fromLocal(e.currentTarget.value))} />
          <button type="button" class="st-link" onclick={() => set('published', now())}>现在</button>
        </div>
        <small>{tz}</small>
      </div>
      <div class="fld">
        <span>更新时间</span>
        {#if f.updated}
          <div class="row">
            <input type="datetime-local" value={toLocal(f.updated)} onchange={(e) => e.currentTarget.value && set('updated', fromLocal(e.currentTarget.value))} />
            <button type="button" class="st-link" onclick={() => set('updated', now())}>现在</button>
            <button type="button" class="st-link" onclick={() => set('updated', undefined)}>去掉</button>
          </div>
        {:else}
          <button type="button" class="st-link" onclick={() => set('updated', now())}>加上「更新于 今天」</button>
        {/if}
      </div>

      <label class="fld"><span>摘要</span><textarea rows="3" value={str(f.description)} oninput={(e) => set('description', e.currentTarget.value)} placeholder="列表和搜索引擎用；留空就截取正文开头"></textarea></label>

      <label class="fld">
        <span>分类</span>
        <input value={str(f.category)} oninput={(e) => set('category', e.currentTarget.value)} list="st-cats" placeholder="只填一个，比如 技术" />
        <datalist id="st-cats">{#each allCats as c (c)}<option value={c}></option>{/each}</datalist>
      </label>

      <div class="fld">
        <span>标签</span>
        <div class="st-tags">
          {#each tags as t (t)}<span class="tag">{t}<button type="button" onclick={() => set('tags', tags.filter((x) => x !== t))} aria-label={`去掉 ${t}`}><Ico name="close" small /></button></span>{/each}
          <input bind:value={tagInput} onkeydown={tagKey} onblur={addTag} list="st-tags" placeholder={tags.length ? '' : '回车添加'} />
          <datalist id="st-tags">{#each allTags.filter((t) => !tags.includes(t)) as t (t)}<option value={t}></option>{/each}</datalist>
        </div>
      </div>

      <div class="fld">
        <span>封面</span>
        <div class="st-cover-pick">
          {#if coverValue}
            {@const url = coverLocal ? thumb(coverLocal) : coverValue}
            <div class="thumb" style={url ? `background-image:url(${JSON.stringify(url)})` : ''}></div>
          {:else}
            <div class="thumb empty">没有封面，用渐变</div>
          {/if}
          <div class="col">
            <select value={coverLocal} onchange={(e) => set('image', e.currentTarget.value ? `./${e.currentTarget.value}` : '')}>
              <option value="">{coverValue && !coverLocal ? '（网址）' : '不用封面'}</option>
              {#each images.filter((a) => a.state !== 'deleted') as a (a.name)}<option value={a.name}>{a.name}</option>{/each}
            </select>
            <button type="button" class="st-btn" onclick={() => coverPicker?.click()} disabled={!doc.folder}><Ico name="image" small />上传封面</button>
            <input type="file" accept="image/*" hidden bind:this={coverPicker} onchange={uploadCover} />
          </div>
        </div>
        <input value={coverLocal ? '' : coverValue} oninput={(e) => set('image', e.currentTarget.value)} placeholder="或者填图片网址 / 站内路径" />
      </div>

      <div class="fld switches">
        <label class="st-switch"><input type="checkbox" checked={f.draft === true} onchange={(e) => set('draft', e.currentTarget.checked)} /><span></span>草稿<small>不出现在博客上</small></label>
        <label class="st-switch"><input type="checkbox" checked={f.pinned === true} onchange={(e) => set('pinned', e.currentTarget.checked)} /><span></span>置顶</label>
      </div>

      <label class="fld"><span>语言</span><input value={str(f.lang)} oninput={(e) => set('lang', e.currentTarget.value || undefined)} placeholder={`默认 ${site.lang}`} /></label>

      {#if others.length}
        <div class="fld"><span>其他字段</span><small>{others.join('、')}：表单不管它们，原样保留；要改就打开下面的 YAML。</small></div>
      {/if}
    {:else}
      <p class="st-err">frontmatter 的 YAML 有错，先在下面改好：{parsed.error}</p>
    {/if}

    <div class="fld">
      <button type="button" class="st-link" onclick={openYaml}><Ico name={yamlOpen ? 'up' : 'down'} small />YAML 原文</button>
      {#if yamlOpen}
        <textarea class="mono" rows="10" spellcheck="false" value={yamlDraft} oninput={(e) => editYaml(e.currentTarget.value)}></textarea>
        {#if yamlError}<small class="st-err">{yamlError}</small>{/if}
      {/if}
    </div>

    <h3>图片 <small>{doc.folder ? '粘贴或拖进正文就会放进这篇文章的文件夹' : '单文件文章没有自己的文件夹'}</small></h3>
    {#if images.length || doc.assets.length}
      <ul class="st-assets">
        {#each doc.assets as a (a.name)}
          {@const url = /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(a.name) && a.state !== 'deleted' ? thumb(a.name) : undefined}
          <li class:deleted={a.state === 'deleted'}>
            <span class="thumb" style={url ? `background-image:url(${JSON.stringify(url)})` : ''}></span>
            <span class="name">{a.name}<small>{kb(a.size)}{a.state === 'added' ? ' · 新加' : a.state === 'deleted' ? ' · 将删除' : ''}</small></span>
            {#if a.state === 'deleted'}
              <button type="button" class="st-icon tiny" onclick={() => restoreAsset(doc, a.name)} title="不删了"><Ico name="undo" small /></button>
            {:else}
              <button type="button" class="st-icon tiny" onclick={() => copyMd(a.name)} title="复制 Markdown"><Ico name="copy" small /></button>
              <button type="button" class="st-icon tiny" onclick={() => removeAsset(doc, a.name)} title="删除"><Ico name="trash" small /></button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="st-muted">还没有图片</p>
    {/if}

    <div class="st-danger">
      {#if doc.path && post && isDirty(doc)}
        <button type="button" class="st-btn" onclick={resetDoc} disabled={busy}><Ico name="undo" small />放弃修改</button>
      {/if}
      {#if !doc.path}
        <button type="button" class="st-btn danger" onclick={dropLocal}><Ico name="trash" small />删除这篇草稿</button>
      {:else if post && signedIn()}
        <button type="button" class="st-btn danger" onclick={removeFromBlog} disabled={busy}><Ico name="trash" small />从博客删除</button>
      {/if}
    </div>
  </div>
</aside>
