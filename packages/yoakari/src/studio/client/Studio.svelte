<script lang="ts">
  // The writing studio: post list | editor | preview (| properties), and the site settings.
  // Works without signing in (posts stay in this browser and can be downloaded); signed in with GitHub,
  // it lists the posts in the repository and commits changes, which the site's build then deploys.
  import { onMount } from 'svelte';
  import Account from './Account.svelte';
  import { account, checkSignIn, probeGitHub, signedIn } from './account.svelte.ts';
  import { closeDeploy, deploy } from './deploy.svelte.ts';
  import { currentDoc, flushDocs, isDirty, loadDocs } from './docs.svelte.ts';
  import Editor from './Editor.svelte';
  import { configPath, site } from './env.ts';
  import Ico from './Ico.svelte';
  import NewPost from './NewPost.svelte';
  import PostList from './PostList.svelte';
  import Preview from './Preview.svelte';
  import Props from './Props.svelte';
  import Publish from './Publish.svelte';
  import { titleOf } from './publish.ts';
  import { loadSettings } from './settings.svelte.ts';
  import { dismiss, fail, loadRepo, toast, ui } from './ui.svelte.ts';
  import { downloadDoc } from './download.ts';
  import { claimTab, tab, takeOverTab } from './tab.svelte.ts';

  let ready = $state(false);
  let scrollLine = $state(1);
  const doc = $derived(currentDoc());

  onMount(() => {
    const flush = () => flushDocs();
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    const onHash = () => (ui.tab = location.hash === '#settings' ? 'settings' : 'posts');
    addEventListener('hashchange', onHash);
    // another tab with the studio open: wait until the user moves the editing here (takeOver)
    (async () => {
      if (await claimTab()) await start();
    })().catch((err) => fail(err, '写作室没有正常启动'));
    return () => {
      removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      removeEventListener('hashchange', onHash);
    };
  });

  async function start() {
    await loadDocs();
    ready = true;
    await Promise.all([probeGitHub().catch((err) => fail(err, '检查登录方式失败')), checkSignIn()]);
  }

  async function takeOver() {
    const lost = tab.state === 'lost';
    try {
      await takeOverTab();
      // what this tab has in memory is older than what the other tab saved since: start over from the browser's copy
      if (lost) location.reload();
      else await start();
    } catch (err) {
      fail(err, '没能在这里继续');
    }
  }

  // signed in (or out): read the posts and settings from the matching place
  $effect(() => {
    const on = signedIn();
    if (!ready) return;
    if (on) loadRepo().catch((err) => fail(err, '读取文章列表失败'));
    if (configPath) loadSettings(on).catch((err) => fail(err, '读取设置失败'));
  });

  function setTab(tab: 'posts' | 'settings') {
    history.replaceState(null, '', tab === 'settings' ? '#settings' : location.pathname);
    ui.tab = tab;
  }

  function save() {
    if (!doc) return;
    if (signedIn()) ui.publish = true;
    else toast('已经自动保存在这个浏览器里；登录 GitHub 后可以提交到博客');
  }

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.dark === '1' ? 'light' : 'dark';
    root.dataset.theme = next;
    root.dataset.dark = next === 'dark' ? '1' : '0';
    localStorage.setItem('yoakari-theme', next);
    document.dispatchEvent(new CustomEvent('yoakari:theme'));
  }

  const deployText = $derived(
    {
      idle: '',
      waiting: '等待构建…',
      running: '正在构建…',
      success: '已上线',
      failure: '构建失败',
      none: '已提交',
      error: '构建状态未知',
    }[deploy.state],
  );
</script>

<div class="st" data-view={ui.view}>
  <header class="st-top">
    <a class="st-brand" href="/" title="回到博客"><svg class="i flower" aria-hidden="true"><use href="#i-flower" /></svg>写作室</a>
    <nav class="st-tabs" aria-label="写作室">
      <button type="button" class:on={ui.tab === 'posts'} onclick={() => setTab('posts')}><Ico name="pen" small />文章</button>
      <button type="button" class:on={ui.tab === 'settings'} onclick={() => setTab('settings')}><Ico name="gear" small />设置</button>
    </nav>

    {#if ui.tab === 'posts' && doc}
      <div class="st-doctitle">
        <span class="t">{titleOf(doc)}</span>
        {#if isDirty(doc)}<span class="st-badge warn" title="修改都保存在这个浏览器里，还没有提交到仓库">{doc.path ? '未提交' : '本地草稿'}</span>{:else}<span class="st-badge ok">已提交</span>{/if}
      </div>
    {:else}
      <div class="st-doctitle"></div>
    {/if}

    <div class="st-actions">
      {#if ui.tab === 'posts' && doc}
        <div class="st-seg" role="group" aria-label="显示方式">
          <button type="button" class:on={ui.view === 'edit'} onclick={() => (ui.view = 'edit')} title="只看编辑"><Ico name="pen" small /></button>
          <button type="button" class:on={ui.view === 'split'} onclick={() => (ui.view = 'split')} title="左写右看"><Ico name="split" small /></button>
          <button type="button" class:on={ui.view === 'preview'} onclick={() => (ui.view = 'preview')} title="只看预览"><Ico name="eye" small /></button>
        </div>
        <button type="button" class="st-btn" class:on={ui.props} onclick={() => (ui.props = !ui.props)}><Ico name="sliders" small />属性</button>
        <button type="button" class="st-btn" onclick={() => downloadDoc(doc).catch((err) => fail(err, '下载失败'))} title="下载 Markdown（有图片时打包成 zip）"><Ico name="download" small />下载</button>
        <button type="button" class="st-btn primary" onclick={save} disabled={!signedIn() || !isDirty(doc)}
          title={signedIn() ? (isDirty(doc) ? '提交到仓库（⌘S）' : '没有要提交的修改') : '登录 GitHub 后才能提交'}><Ico name="send" small />提交</button>
      {/if}
      {#if deploy.state !== 'idle'}
        <div class={['st-deploy', deploy.state]}>
          <span class="dot"></span>
          {#if deploy.state === 'success' && deploy.pageUrl}<a href={deploy.pageUrl} target="_blank" rel="noopener">{deployText} · 查看</a>
          {:else if deploy.commitUrl}<a href={deploy.commitUrl} target="_blank" rel="noopener" title={deploy.error || deploy.checks.map((c) => `${c.name}：${c.state}`).join('\n')}>{deployText}</a>
          {:else}{deployText}{/if}
          {#if ['success', 'failure', 'none', 'error'].includes(deploy.state)}<button type="button" class="x" onclick={closeDeploy} aria-label="关闭"><Ico name="close" small /></button>{/if}
        </div>
      {/if}
      <button type="button" class="st-icon" onclick={toggleTheme} aria-label="切换明暗"><Ico name="sun" class="sun" /><Ico name="moon" class="moon" /></button>
      <Account />
    </div>
  </header>

  {#if ui.tab === 'posts'}
    <div class="st-main" class:props={ui.props && doc}>
      <PostList />
      {#if doc}
        {#key doc.key}
          <section class="st-work">
            {#if ui.view !== 'preview'}<Editor {doc} onScrollLine={(n) => (scrollLine = n)} onSave={save} />{/if}
            {#if ui.view !== 'edit'}<Preview {doc} {scrollLine} />{/if}
          </section>
          {#if ui.props}<Props {doc} />{/if}
        {/key}
      {:else}
        <section class="st-empty">
          <svg class="i flower" aria-hidden="true"><use href="#i-flower" /></svg>
          <h1>今天写点什么？</h1>
          <p>从左边选一篇接着写，或者新建一篇。写的内容会自动存在这个浏览器里{signedIn() ? '，写完点「提交」就会发到博客' : '；登录 GitHub 后可以直接提交到博客'}。</p>
          <button type="button" class="st-btn primary" onclick={() => (ui.newPost = true)}><Ico name="plus" small />新建文章</button>
          {#if !signedIn() && account.github?.available === false}
            <p class="note">这个部署没有 GitHub 登录接口（/studio/auth/），可以用右上角的「令牌登录」。</p>
          {/if}
        </section>
      {/if}
    </div>
  {:else}
    {#await import('./Settings.svelte') then { default: Settings }}<Settings />{/await}
  {/if}

  {#if tab.state === 'elsewhere' || tab.state === 'lost'}
    <div class="st-modal" role="presentation">
      <div class="st-dialog" role="alertdialog" aria-labelledby="st-tab-title" aria-describedby="st-tab-text">
        <h2 id="st-tab-title">写作室在另一个标签页里开着</h2>
        <p id="st-tab-text">
          {tab.state === 'lost'
            ? '你在另一个标签页里继续了，这里已经停止保存。'
            : '两个标签页同时写，后保存的会盖掉先保存的，所以一次只在一个标签页里编辑。'}
        </p>
        <div class="st-dialog-actions"><button type="button" class="st-btn primary" onclick={takeOver}>在这里继续</button></div>
      </div>
    </div>
  {/if}
  {#if ui.newPost}<NewPost />{/if}
  {#if ui.publish && doc}<Publish {doc} />{/if}

  <div class="st-toasts" aria-live="polite">
    {#each ui.toasts as t (t.id)}
      <div class={['st-toast', t.kind]}>
        <span>{t.text}</span>
        <button type="button" onclick={() => dismiss(t.id)} aria-label="关闭"><Ico name="close" small /></button>
      </div>
    {/each}
  </div>
</div>

<svelte:head><title>写作室 - {site.title}</title></svelte:head>
