<script lang="ts">
  // The writing pane: toolbar, CodeMirror on the post body (the frontmatter is edited in 属性), status line.
  import { onMount } from 'svelte';
  import { addAsset, type Doc, setBody } from './docs.svelte.ts';
  import { block, createEditor, insertText, link, linePrefix, wrap } from './editor.ts';
  import { split } from './frontmatter.ts';
  import Ico from './Ico.svelte';
  import { fail } from './ui.svelte.ts';

  interface Props { doc: Doc; onScrollLine: (line: number) => void; onSave: () => void }
  let { doc, onScrollLine, onSave }: Props = $props();

  let host = $state<HTMLElement>();
  let ed: ReturnType<typeof createEditor> | undefined;
  let pos = $state({ line: 1, col: 1 });
  let calloutMenu = $state(false);
  let picker = $state<HTMLInputElement>();

  const body = $derived(split(doc.text).body);
  const words = $derived.by(() => {
    const t = body.replace(/```[\s\S]*?```/g, ' ');
    return (t.match(/[぀-ヿ㐀-鿿豈-﫿가-힯]/g)?.length ?? 0) + (t.match(/[A-Za-z0-9]+/g)?.length ?? 0);
  });

  /** Images go into the post's folder; returns the Markdown that shows them. */
  async function onFiles(files: File[]) {
    const out: string[] = [];
    for (const f of files) {
      const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png';
      const wanted = f.name && f.name !== 'image.png' ? f.name : `image-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${ext}`;
      const name = addAsset(doc, f, wanted);
      out.push(`![](./${encodeURI(name)})`);
    }
    return out.join('\n');
  }

  onMount(() => {
    ed = createEditor(host!, body, {
      onChange: (text) => setBody(doc, text),
      onScrollLine,
      onFiles,
      onSave,
      onError: (err) => fail(err, '没能加入图片'),
    });
    const track = () => {
      const view = ed!.view;
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      pos = { line: line.number, col: head - line.from + 1 };
    };
    ed.view.dom.addEventListener('keyup', track);
    ed.view.dom.addEventListener('pointerup', track);
    ed.view.focus();
    return () => ed?.destroy();
  });

  // the body changed elsewhere (YAML panel rewrote the file, a reload): bring the editor along
  $effect(() => {
    ed?.sync(body);
  });

  const run = (fn: (v: NonNullable<typeof ed>['view']) => unknown) => () => {
    if (ed) fn(ed.view);
  };

  async function pickImages(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length || !ed) return;
    try {
      insertText(ed.view, await onFiles(files));
    } catch (err) {
      fail(err, '没能加入图片');
    }
  }

  const callouts = [
    ['note', '说明'],
    ['tip', '小技巧'],
    ['warning', '注意'],
    ['danger', '危险'],
  ] as const;
</script>

<div class="st-editor">
  <div class="st-toolbar" role="toolbar" aria-label="格式">
    <button type="button" onclick={run((v) => linePrefix(v, '## '))} title="二级标题">H2</button>
    <button type="button" onclick={run((v) => linePrefix(v, '### '))} title="三级标题">H3</button>
    <span class="sep"></span>
    <button type="button" onclick={run((v) => wrap(v, '**'))} title="粗体（⌘B）"><Ico name="bold" /></button>
    <button type="button" onclick={run((v) => wrap(v, '*'))} title="斜体（⌘I）"><Ico name="italic" /></button>
    <button type="button" onclick={run((v) => wrap(v, '~~'))} title="删除线"><Ico name="strike" /></button>
    <button type="button" onclick={run((v) => wrap(v, '`'))} title="行内代码（⌘E）"><Ico name="code" /></button>
    <button type="button" onclick={run((v) => wrap(v, ':spoiler[', ']'))} title="剧透（鼠标移上去才显示）"><Ico name="spoiler" /></button>
    <span class="sep"></span>
    <button type="button" onclick={run(link)} title="链接（⌘K）"><Ico name="link" /></button>
    <button type="button" onclick={() => picker?.click()} title="图片（也可以直接粘贴或拖进来）" disabled={!doc.folder}><Ico name="image" /></button>
    <input type="file" accept="image/*" multiple hidden bind:this={picker} onchange={pickImages} />
    <span class="sep"></span>
    <button type="button" onclick={run((v) => linePrefix(v, '> '))} title="引用"><Ico name="quote" /></button>
    <button type="button" onclick={run((v) => linePrefix(v, '- '))} title="列表"><Ico name="ul" /></button>
    <button type="button" onclick={run((v) => linePrefix(v, '1. '))} title="编号列表"><Ico name="ol" /></button>
    <button type="button" onclick={run((v) => linePrefix(v, '- [ ] '))} title="待办"><Ico name="task" /></button>
    <span class="sep"></span>
    <button type="button" onclick={run((v) => block(v, '```\n|\n```'))} title="代码块"><Ico name="codeblock" /></button>
    <div class="st-menu-wrap">
      <button type="button" onclick={() => (calloutMenu = !calloutMenu)} title="提示块" aria-expanded={calloutMenu}><Ico name="bulb" /></button>
      {#if calloutMenu}
        <div class="st-menu">
          {#each callouts as [name, label] (name)}
            <button type="button" onclick={() => { calloutMenu = false; run((v) => block(v, `:::${name}\n|\n:::`))(); }}>{label}<small>:::{name}</small></button>
          {/each}
        </div>
      {/if}
    </div>
    <button type="button" onclick={run((v) => block(v, '$$\n|\n$$'))} title="公式"><Ico name="math" /></button>
    <button type="button" onclick={run((v) => block(v, '| 列 | 列 |\n| --- | --- |\n| | |'))} title="表格"><Ico name="table" /></button>
    <button type="button" onclick={run((v) => block(v, '---'))} title="分割线"><Ico name="hr" /></button>
  </div>
  <div class="st-cm" bind:this={host}></div>
  <div class="st-status">
    <span>第 {pos.line} 行 · 第 {pos.col} 列</span>
    <span>{words} 字</span>
    {#if !doc.folder}<span class="warn">单文件文章，不能放图片</span>{/if}
  </div>
</div>
