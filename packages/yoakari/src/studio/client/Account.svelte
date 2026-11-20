<script lang="ts">
  // The sign-in corner: a quiet button until it is needed. GitHub sign-in goes through /studio/auth/
  // (the site's Worker); a personal access token works anywhere, also on hosts without that Worker.
  import { account, signInWithGitHub, signInWithToken, signOut } from './account.svelte.ts';
  import { studio } from './env.ts';
  import Ico from './Ico.svelte';
  import { storedAuth } from './token.ts';

  let open = $state(false);
  let tokenInput = $state('');
  let showToken = $state(false);
  let box = $state<HTMLElement>();

  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box && !box.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  });

  function useToken(e: SubmitEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    signInWithToken(tokenInput);
    tokenInput = '';
    showToken = false;
  }

  const tokenUrl = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('yoakari 写作室')}&description=${encodeURIComponent(`${location.host} 的写作室`)}&contents=write`;
</script>

<div class="st-account" bind:this={box}>
  {#if account.user}
    <button type="button" class="st-avatar" class:warn={!account.canWrite} onclick={() => (open = !open)} aria-expanded={open} title={account.user.login}>
      <img src={account.user.avatarUrl} alt="" width="28" height="28" />
    </button>
  {:else}
    <button type="button" class="st-btn" class:warn={account.error} onclick={() => (open = !open)} aria-expanded={open} disabled={account.checking}>
      <Ico name="github" small />{account.checking ? '检查中…' : '登录'}
    </button>
  {/if}

  {#if open}
    <div class="st-pop" role="dialog" aria-label="账号">
      {#if account.user}
        <div class="who">
          <img src={account.user.avatarUrl} alt="" width="40" height="40" />
          <div><b>{account.user.name ?? account.user.login}</b><small>@{account.user.login} · {storedAuth()?.via === 'token' ? '令牌' : 'GitHub'} 登录</small></div>
        </div>
        <p class="repo"><Ico name="folder" small />{studio.repo} · {studio.branch}</p>
        {#if account.error}<p class="err">{account.error}</p>{/if}
        <button type="button" class="st-btn wide" onclick={() => { signOut(); open = false; }}><Ico name="logout" small />退出登录</button>
      {:else}
        <p class="lead">登录后可以读写 <b>{studio.repo}</b> 里的文章，提交后由博客的构建自动发布。不登录也能写，只是只能存在这个浏览器里、下载成文件。</p>
        {#if account.error}<p class="err">{account.error}</p>{/if}
        {#if account.github?.available}
          <button type="button" class="st-btn primary wide" onclick={signInWithGitHub}><Ico name="github" small />用 GitHub 登录</button>
        {:else if account.github?.error}
          <p class="err">GitHub 登录暂时不能用：{account.github.error}</p>
        {:else if account.github}
          <p class="note">这个部署没有 GitHub 登录接口，可以用令牌登录。</p>
        {/if}
        {#if showToken}
          <form class="token" onsubmit={useToken}>
            <input type="password" bind:value={tokenInput} placeholder="github_pat_…" autocomplete="off" spellcheck="false" />
            <button type="submit" class="st-btn">登录</button>
          </form>
          <p class="note">用 <a href={tokenUrl} target="_blank" rel="noopener">fine-grained token</a>：只选 {studio.repo}，权限给 Contents 读写（想看构建状态，再加 Checks 和 Commit statuses 只读）。令牌存在这个浏览器的 localStorage 里。</p>
        {:else}
          <button type="button" class="st-link" onclick={() => (showToken = true)}><Ico name="key" small />用令牌登录</button>
        {/if}
      {/if}
    </div>
  {/if}
</div>
