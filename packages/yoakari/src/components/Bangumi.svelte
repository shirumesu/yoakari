<script lang="ts">
  import { onMount } from 'svelte';
  // The author's Bangumi collections, read from the public bgm.tv API (v0) in the browser.
  type Kind = 'anime' | 'book' | 'game' | 'music' | 'real';
  interface Props { api: string; user: string; types: Kind[]; subjectUrl: string; profile: string }
  let { api, user, types, subjectUrl, profile }: Props = $props();

  type Item = {
    subject_id: number;
    type: 1 | 2 | 3 | 4 | 5;
    rate: number;
    ep_status: number;
    vol_status: number;
    comment: string | null;
    updated_at: string;
    subject: { name: string; name_cn: string; date: string | null; eps: number; volumes: number; images: { common: string } | null };
  };

  const KIND: Record<Kind, { id: number; label: string; verb: string; unit: string }> = {
    anime: { id: 2, label: '动画', verb: '看', unit: '话' },
    book: { id: 1, label: '书籍', verb: '读', unit: '卷' },
    game: { id: 4, label: '游戏', verb: '玩', unit: '' },
    music: { id: 3, label: '音乐', verb: '听', unit: '首' },
    real: { id: 6, label: '三次元', verb: '看', unit: '集' },
  };
  // bgm collection types: 1 wish, 2 done, 3 doing, 4 on hold, 5 dropped
  const ORDER = [3, 2, 1, 4, 5] as const;
  const statusLabel = (kind: Kind, s: number) =>
    ({ 1: `想${KIND[kind].verb}`, 2: `${KIND[kind].verb}过`, 3: `在${KIND[kind].verb}`, 4: '搁置', 5: '抛弃' })[s]!;

  const PAGE = 100;
  const STEP = 30;

  let counts = $state<Partial<Record<Kind, number>>>({});
  let lists = $state<Partial<Record<Kind, Item[]>>>({});
  let active = $state<Kind>(types[0]);
  let status = $state<number>(0);
  let shown = $state(STEP);
  let error = $state<string>();
  let loading = $state(false);

  const endpoint = (kind: Kind, limit: number, offset: number) =>
    `${api.replace(/\/$/, '')}/v0/users/${encodeURIComponent(user)}/collections?subject_type=${KIND[kind].id}&limit=${limit}&offset=${offset}`;

  async function page(kind: Kind, limit: number, offset: number): Promise<{ total: number; data: Item[] }> {
    const res = await fetch(endpoint(kind, limit, offset));
    if (!res.ok) throw new Error(`Bangumi 返回 ${res.status}${res.status === 404 ? '（用户不存在？）' : ''}`);
    return res.json();
  }

  // first page of every tab, fetched together on load: gives the tab counts and fills the small tabs at once
  const firsts: Partial<Record<Kind, { total: number; data: Item[] }>> = {};

  async function loadAll(kind: Kind) {
    if (lists[kind]) return;
    loading = true;
    error = undefined;
    try {
      const first = firsts[kind] ?? (await page(kind, PAGE, 0));
      const rest = await Promise.all(
        Array.from({ length: Math.ceil(first.total / PAGE) - 1 }, (_, i) => page(kind, PAGE, (i + 1) * PAGE)),
      );
      lists[kind] = [first, ...rest].flatMap((p) => p.data);
      counts[kind] = first.total;
    } catch (err) {
      console.error('yoakari: Bangumi request failed', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function pick(kind: Kind) {
    active = kind;
    status = 0;
    shown = STEP;
    loadAll(kind).then(() => {
      const list = lists[kind];
      // open on what is being watched now, if anything
      if (list && kind === active) status = list.some((i) => i.type === 3) ? 3 : 0;
    });
  }

  async function start() {
    error = undefined;
    try {
      const pages = await Promise.all(types.map((k) => page(k, PAGE, 0)));
      types.forEach((k, i) => {
        firsts[k] = pages[i];
        counts[k] = pages[i].total;
      });
      pick(types.find((k) => counts[k]) ?? types[0]);
    } catch (err) {
      console.error('yoakari: Bangumi request failed', err);
      error = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(start);

  const list = $derived(lists[active] ?? []);
  const byStatus = $derived(Object.fromEntries(ORDER.map((s) => [s, list.filter((i) => i.type === s).length])) as Record<number, number>);
  const filtered = $derived(status ? list.filter((i) => i.type === status) : list);
  const visibleTypes = $derived(types.filter((k) => counts[k] !== 0 || k === active));

  const yearOf = (d: string | null) => (d ? d.slice(0, 4) : '');
  const sizeOf = (kind: Kind, i: Item) => {
    const n = kind === 'book' ? i.subject.volumes : i.subject.eps;
    return n && KIND[kind].unit ? `${n} ${KIND[kind].unit}` : '';
  };
  const progressOf = (kind: Kind, i: Item) => {
    const total = kind === 'book' ? i.subject.volumes : i.subject.eps;
    const done = kind === 'book' ? i.vol_status : i.ep_status;
    return total ? Math.min(1, done / total) : 0;
  };
</script>

<div class="bgm">
  <div class="bgm-tabs" role="tablist" aria-label="条目类型">
    {#each visibleTypes as kind (kind)}
      <button type="button" role="tab" aria-selected={active === kind} class:on={active === kind} onclick={() => pick(kind)}>
        {KIND[kind].label}{#if counts[kind] !== undefined}<small>{counts[kind]}</small>{/if}
      </button>
    {/each}
    <a class="bgm-profile" href={profile} target="_blank" rel="noopener">Bangumi 主页 ↗</a>
  </div>

  {#if error}
    <div class="card bgm-note" role="alert">
      <p>没能从 Bangumi 读到收藏：{error}</p>
      <button type="button" class="bgm-retry" onclick={() => (Object.keys(counts).length ? loadAll(active) : start())}>重试</button>
    </div>
  {:else if loading || !lists[active]}
    <div class="bgm-grid" aria-busy="true" aria-label="正在读取">
      {#each Array(8) as _, i (i)}<div class="card bgm-card skeleton"><span class="bgm-cover"></span><span class="bgm-body"><span class="bar"></span><span class="bar short"></span></span></div>{/each}
    </div>
  {:else}
    <div class="bgm-filter" role="group" aria-label="收藏状态">
      <button type="button" class:on={status === 0} aria-pressed={status === 0} onclick={() => { status = 0; shown = STEP; }}>全部<small>{list.length}</small></button>
      {#each ORDER.filter((s) => byStatus[s]) as s (s)}
        <button type="button" class:on={status === s} aria-pressed={status === s} onclick={() => { status = s; shown = STEP; }}>
          {statusLabel(active, s)}<small>{byStatus[s]}</small>
        </button>
      {/each}
    </div>

    {#if filtered.length === 0}
      <div class="card bgm-note"><p>这里还空着。</p></div>
    {:else}
      <ul class="bgm-grid">
        {#each filtered.slice(0, shown) as item (item.subject_id)}
          {@const title = item.subject.name_cn || item.subject.name}
          {@const sub = [yearOf(item.subject.date), sizeOf(active, item)].filter(Boolean).join(' · ')}
          <li>
            <a class="card bgm-card" href={`${subjectUrl}${item.subject_id}`} target="_blank" rel="noopener" title={item.subject.name}>
              <span class="bgm-cover">
                {#if item.subject.images}
                  <img src={item.subject.images.common} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                {/if}
                {#if !status}<span class="bgm-state">{statusLabel(active, item.type)}</span>{/if}
                {#if item.rate}<span class="bgm-rate" aria-label={`我的评分 ${item.rate}`}><svg class="i s" aria-hidden="true"><use href="#i-star" /></svg>{item.rate}</span>{/if}
              </span>
              <span class="bgm-body">
                <span class="bgm-name">{title}</span>
                {#if sub}<span class="bgm-sub">{sub}</span>{/if}
                {#if item.type === 3 && progressOf(active, item)}
                  <span class="bgm-progress" style={`--p:${progressOf(active, item)}`} aria-label="进度"></span>
                {/if}
                {#if item.comment}<span class="bgm-comment">{item.comment}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
      {#if filtered.length > shown}
        <button type="button" class="bgm-more" onclick={() => (shown += STEP)}>再看 {Math.min(STEP, filtered.length - shown)} 部 · 还剩 {filtered.length - shown}</button>
      {/if}
    {/if}
  {/if}
</div>
