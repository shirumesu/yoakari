<script lang="ts">
  // The preview pane: the post rendered with the site's Markdown plugins and its prose styles,
  // headed like the post page (title, date, category, tags), kept level with the editor.
  import { assetUrl, assetVersion, type Doc } from './docs.svelte.ts';
  import { site } from './env.ts';
  import { split, tryRead } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  // the Markdown pipeline (unified, KaTeX, Shiki…) is the heaviest part of the studio: loaded with the first preview
  let pipeline: Promise<typeof import('./preview.ts')> | undefined;
  import { fail } from './ui.svelte.ts';

  interface Props { doc: Doc; scrollLine: number }
  let { doc, scrollLine }: Props = $props();

  let html = $state('');
  let error = $state('');
  let scroller = $state<HTMLElement>();
  let paper = $state<HTMLElement>();

  const parts = $derived(split(doc.text));
  const fields = $derived(tryRead(parts.fm).fields ?? {});
  const title = $derived(typeof fields.title === 'string' ? fields.title : '');
  const date = $derived.by(() => {
    const d = fields.published ? new Date(String(fields.published)) : null;
    return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: site.timezone }).format(d) : '';
  });
  const tags = $derived(Array.isArray(fields.tags) ? fields.tags.map(String) : []);
  const cover = $derived.by(() => {
    assetVersion.n;
    const img = typeof fields.image === 'string' ? fields.image : '';
    if (!img) return '';
    return /^([a-z][\w+.-]*:|\/)/i.test(img) ? img : assetUrl(doc, img.replace(/^\.\//, ''), (err) => fail(err, '读取封面失败')) ?? '';
  });

  // re-render shortly after typing stops (and when a committed image has finished downloading)
  $effect(() => {
    const body = parts.body;
    assetVersion.n;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const { render } = await (pipeline ??= import('./preview.ts'));
        const out = await render(body, (name) => assetUrl(doc, name, (err) => fail(err, `读取图片 ${name} 失败`)));
        if (stale) return;
        html = out;
        error = '';
      } catch (err) {
        if (stale) return;
        error = (err as Error).message;
        console.error('yoakari studio: preview failed', err);
      }
    }, html ? 160 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  });

  // Mermaid diagrams after each render; the library is only downloaded when a post has one
  $effect(() => {
    html;
    const dark = document.documentElement.dataset.dark === '1';
    const blocks = [...(paper?.querySelectorAll<HTMLElement>('pre.mermaid') ?? [])];
    if (!blocks.length) return;
    import('mermaid').then(async ({ default: m }) => {
      m.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', fontFamily: 'inherit' });
      const live = blocks.filter((b) => b.isConnected);
      await m.run({ nodes: live });
      for (const b of live) b.dataset.done = '';
    }).catch((err) => {
      for (const b of blocks) b.dataset.error = (err as Error).message;
      console.error('yoakari studio: mermaid failed', err);
    });
  });

  // keep the block the editor shows at the top in view
  $effect(() => {
    const line = scrollLine;
    if (!scroller || !paper) return;
    html;
    let best: HTMLElement | undefined;
    for (const el of paper.querySelectorAll<HTMLElement>('[data-line]')) {
      if (Number(el.dataset.line) <= line) best = el;
      else break;
    }
    if (line <= 1 || !best) return void scroller.scrollTo({ top: 0 });
    scroller.scrollTo({ top: best.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16 });
  });
</script>

<div class="st-preview" bind:this={scroller}>
  <article class="st-paper">
    {#if cover}<div class="st-cover" style={`background-image:url(${JSON.stringify(cover)})`}></div>{/if}
    <header class="st-post-head">
      {#if typeof fields.category === 'string' && fields.category}<span class="chip">{fields.category}</span>{/if}
      <h1>{title || '（还没有标题）'}</h1>
      <div class="meta">
        {#if date}<span><Ico name="calendar" small />{date}</span>{/if}
        {#if fields.draft === true}<span class="st-badge">草稿</span>{/if}
        {#each tags as t (t)}<span><Ico name="tag" small />{t}</span>{/each}
      </div>
    </header>
    {#if error}<p class="st-err">预览出错：{error}</p>{/if}
    <div class="prose" lang={typeof fields.lang === 'string' ? fields.lang : undefined} bind:this={paper}>{@html html}</div>
  </article>
</div>
