<script lang="ts">
  // Search dialog backed by the Pagefind index written at build time (dist/pagefind/).
  interface Props { base: string }
  let { base }: Props = $props();

  type Hit = { url: string; title: string; excerpt: string };
  type Pagefind = { search: (q: string) => Promise<{ results: Array<{ data: () => Promise<{ url: string; meta: { title?: string }; excerpt: string }> }> }> };

  let open = $state(false);
  let query = $state('');
  let hits = $state<Hit[]>([]);
  let status = $state<'idle' | 'loading' | 'ready' | 'missing'>('idle');
  let input = $state<HTMLInputElement>();
  let pagefind: Pagefind | undefined;
  let seq = 0;

  async function load() {
    if (pagefind || status === 'missing') return;
    status = 'loading';
    try {
      pagefind = (await import(/* @vite-ignore */ `${base}pagefind/pagefind.js`)) as Pagefind;
      status = 'ready';
    } catch (err) {
      // The index only exists after `astro build`; the dialog says so instead of showing an empty list.
      console.error('yoakari: could not load the search index', err);
      status = 'missing';
    }
  }

  async function run(q: string) {
    const mine = ++seq;
    if (!pagefind || !q.trim()) { hits = []; return; }
    const res = await pagefind.search(q);
    const data = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
    if (mine === seq) hits = data.map((d) => ({ url: d.url, title: d.meta.title ?? d.url, excerpt: d.excerpt }));
  }

  export function show() {
    open = true;
    query = '';
    hits = [];
    load();
    setTimeout(() => input?.focus(), 30);
  }
  function close() { open = false; }

  $effect(() => {
    const onOpen = () => show();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close();
      const t = document.activeElement?.tagName ?? '';
      if (e.key === '/' && !open && !/INPUT|TEXTAREA|SELECT/.test(t) && !(document.activeElement as HTMLElement | null)?.isContentEditable) {
        e.preventDefault();
        show();
      }
    };
    document.addEventListener('yoakari:search', onOpen);
    document.addEventListener('keydown', onKey);
    document.addEventListener('astro:before-swap', close);
    return () => {
      document.removeEventListener('yoakari:search', onOpen);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('astro:before-swap', close);
    };
  });
  $effect(() => { run(query); });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="search-box" role="dialog" aria-modal="true" aria-label="搜索文章">
      <div class="search-input">
        <svg class="i" aria-hidden="true"><use href="#i-search" /></svg>
        <label class="sr" for="yk-q">搜索</label>
        <input id="yk-q" type="search" placeholder="搜索文章…" autocomplete="off" bind:this={input} bind:value={query}
          onkeydown={(e) => { if (e.key === 'Enter' && hits[0]) location.assign(hits[0].url); }} />
        <kbd>Esc</kbd>
      </div>
      <ul class="results">
        {#if status === 'missing'}
          <li class="empty">{import.meta.env.DEV ? '开发模式下没有搜索索引，运行 astro build 后才能搜索' : '搜索索引加载失败，请稍后刷新再试'}</li>
        {:else if status === 'loading'}
          <li class="empty">正在载入索引…</li>
        {:else if query.trim() && hits.length === 0}
          <li class="empty">没有找到「{query}」，换个词试试</li>
        {:else}
          {#each hits as hit (hit.url)}
            <li><a href={hit.url} onclick={close}><b>{hit.title}</b><small>{@html hit.excerpt}</small></a></li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
{/if}
