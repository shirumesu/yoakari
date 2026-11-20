<script lang="ts" module>
  // One field of the settings form, drawn from the JSON Schema of the theme's options (config.ts, with
  // the Chinese titles from .meta()). Objects and lists recurse, so new options show up without UI work.
  export type Schema = {
    type?: string;
    title?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    const?: unknown;
    anyOf?: Schema[];
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    minimum?: number;
    maximum?: number;
    format?: string;
    'x-widget'?: 'hue' | 'icon' | 'textarea';
  };

  /** A fresh value for a field that is being switched on or added to a list. */
  export function initial(s: Schema): unknown {
    if (s.default !== undefined) return structuredClone(s.default);
    if (s.type === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of s.required ?? []) o[k] = initial(s.properties![k]);
      return o;
    }
    if (s.type === 'array') return [];
    if (s.type === 'boolean') return false;
    if (s.type === 'number' || s.type === 'integer') return s.minimum ?? 0;
    if (s.enum) return s.enum[0];
    return '';
  }
</script>

<script lang="ts">
  import { iconNames } from '../../config.ts';
  import Field from './Field.svelte';
  import Ico from './Ico.svelte';

  interface Props {
    schema: Schema;
    value: unknown;
    set: (v: unknown) => void;
    path: string;
    name: string;
    required: boolean;
    problems: Map<string, string[]>;
  }
  let { schema, value, set, path, name, required, problems }: Props = $props();

  const label = $derived(schema.title ?? name);
  const errs = $derived(problems.get(path) ?? []);
  const kind = $derived(
    schema.anyOf ? 'union' : schema.type === 'object' ? 'object' : schema.type === 'array' ? 'array' : schema.type === 'boolean' ? 'boolean' : schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.enum ? 'enum' : 'string',
  );
  const shown = $derived(value === undefined ? schema.default : value);
  const optionalAbsent = $derived(value === undefined && !required && schema.default === undefined);

  // lists
  const list = $derived((Array.isArray(shown) ? shown : []) as unknown[]);
  const move = (i: number, d: number) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const setItem = (i: number, v: unknown) => set(list.map((x, j) => (j === i ? v : x)));
  const removeItem = (i: number) => set(list.filter((_, j) => j !== i));
  const summary = (item: unknown) => {
    if (!item || typeof item !== 'object') return String(item ?? '');
    const o = item as Record<string, unknown>;
    return String(o.label ?? o.name ?? o.title ?? Object.values(o).find((v) => typeof v === 'string') ?? '');
  };

  // objects
  const obj = $derived((shown && typeof shown === 'object' ? shown : {}) as Record<string, unknown>);
  const setProp = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    set(next);
  };

  // strings: an empty optional field is left out of the file
  const setString = (v: string) => set(v === '' && !required ? undefined : v);

  let iconOpen = $state(false);
  const icons = $derived((schema.enum ?? iconNames) as string[]);
  const falseBranch = $derived(schema.anyOf?.some((b) => b.const === false) ?? false);
</script>

{#snippet head()}
  <div class="f-head">
    <span class="f-label">{label}{#if required}<b class="req" title="必填">*</b>{/if}</span>
    {#if value !== undefined && schema.default !== undefined && kind !== 'object'}
      <button type="button" class="st-link tiny" onclick={() => set(undefined)} title={`默认：${JSON.stringify(schema.default)}`}>恢复默认</button>
    {/if}
  </div>
  {#if schema.description}<small class="f-desc">{schema.description}</small>{/if}
{/snippet}

{#snippet errors()}
  {#each errs as e (e)}<small class="st-err">{e}</small>{/each}
{/snippet}

{#if kind === 'object'}
  {#if optionalAbsent}
    <div class="f f-off">
      <div class="f-off-row">
        <div>{@render head()}</div>
        <button type="button" class="st-btn" onclick={() => set(initial({ ...schema, default: undefined }))}><Ico name="plus" small />启用</button>
      </div>
    </div>
  {:else}
    <fieldset class={['f', 'f-obj', path.includes('.') && 'nested']}>
      <legend>
        {label}
        {#if !required && schema.default === undefined}
          <button type="button" class="st-link tiny" onclick={() => set(undefined)}>不用了</button>
        {/if}
      </legend>
      {#if schema.description}<small class="f-desc">{schema.description}</small>{/if}
      {@render errors()}
      {#each Object.entries(schema.properties ?? {}) as [k, s] (k)}
        <Field schema={s} value={obj[k]} set={(v) => setProp(k, v)} path={path ? `${path}.${k}` : k} name={k} required={schema.required?.includes(k) ?? false} {problems} />
      {/each}
    </fieldset>
  {/if}
{:else if kind === 'array'}
  <div class="f f-arr">
    {@render head()}
    {@render errors()}
    {#if schema.items?.enum}
      <div class="f-chips">
        {#each schema.items.enum as opt (opt)}
          {@const on = list.includes(opt)}
          <button type="button" class:on onclick={() => set(on ? list.filter((x) => x !== opt) : [...list, opt])}>{String(opt)}</button>
        {/each}
      </div>
    {:else if schema.items?.type === 'object'}
      <ol class="f-cards">
        {#each list as item, i (i)}
          <li>
            <details open={!summary(item)}>
              <summary>
                <span class="n">{i + 1}</span><span class="s">{summary(item) || '（新的一项）'}</span>
                <span class="tools">
                  <button type="button" class="st-icon tiny" disabled={i === 0} onclick={(e) => { e.preventDefault(); move(i, -1); }} aria-label="上移"><Ico name="up" small /></button>
                  <button type="button" class="st-icon tiny" disabled={i === list.length - 1} onclick={(e) => { e.preventDefault(); move(i, 1); }} aria-label="下移"><Ico name="down" small /></button>
                  <button type="button" class="st-icon tiny" onclick={(e) => { e.preventDefault(); removeItem(i); }} aria-label="删除"><Ico name="trash" small /></button>
                </span>
              </summary>
              <Field schema={{ ...schema.items, title: undefined }} value={item} set={(v) => setItem(i, v)} path={`${path}.${i}`} name="" required={true} {problems} />
            </details>
          </li>
        {/each}
      </ol>
      <button type="button" class="st-btn" onclick={() => set([...list, initial(schema.items!)])}><Ico name="plus" small />加一项</button>
    {:else}
      <ol class="f-lines">
        {#each list as item, i (i)}
          <li>
            <input value={String(item ?? '')} oninput={(e) => setItem(i, e.currentTarget.value)} />
            <button type="button" class="st-icon tiny" disabled={i === 0} onclick={() => move(i, -1)} aria-label="上移"><Ico name="up" small /></button>
            <button type="button" class="st-icon tiny" onclick={() => removeItem(i)} aria-label="删除"><Ico name="trash" small /></button>
            {#each problems.get(`${path}.${i}`) ?? [] as e (e)}<small class="st-err">{e}</small>{/each}
          </li>
        {/each}
      </ol>
      <button type="button" class="st-btn" onclick={() => set([...list, ''])}><Ico name="plus" small />加一行</button>
    {/if}
  </div>
{:else if kind === 'boolean'}
  <div class="f">
    <label class="st-switch"><input type="checkbox" checked={shown === true} onchange={(e) => set(e.currentTarget.checked)} /><span></span>{label}</label>
    {#if schema.description}<small class="f-desc">{schema.description}</small>{/if}
    {@render errors()}
  </div>
{:else if kind === 'number'}
  <div class="f">
    {@render head()}
    {#if schema['x-widget'] === 'hue'}
      <div class="f-hue">
        <input type="range" min={schema.minimum ?? 0} max={schema.maximum ?? 360} value={Number(shown ?? 0)}
          oninput={(e) => set(Number(e.currentTarget.value))} />
        <span class="swatch" style={`--sw:${Number(shown ?? 0)}`}></span>
        <input type="number" min={schema.minimum} max={schema.maximum} value={Number(shown ?? 0)} oninput={(e) => e.currentTarget.value !== '' && set(Number(e.currentTarget.value))} />
      </div>
    {:else}
      <input type="number" min={schema.minimum} max={schema.maximum} step={schema.type === 'integer' ? 1 : 'any'} value={value === undefined ? '' : Number(value)}
        placeholder={schema.default !== undefined ? String(schema.default) : ''} oninput={(e) => set(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} />
    {/if}
    {@render errors()}
  </div>
{:else if kind === 'enum'}
  <div class="f">
    {@render head()}
    {#if schema['x-widget'] === 'icon'}
      <div class="f-icon">
        <button type="button" class="st-btn" onclick={() => (iconOpen = !iconOpen)} aria-expanded={iconOpen}>
          {#if shown}<Ico name={String(shown)} small />{String(shown)}{:else}不用图标{/if}
        </button>
        {#if iconOpen}
          <div class="f-icon-grid">
            {#if !required}<button type="button" class:on={!shown} onclick={() => { set(undefined); iconOpen = false; }} title="不用图标"><Ico name="close" small /></button>{/if}
            {#each icons as ic (ic)}
              <button type="button" class:on={shown === ic} onclick={() => { set(ic); iconOpen = false; }} title={ic}><Ico name={ic} /></button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <select value={shown ?? ''} onchange={(e) => set(e.currentTarget.value === '' ? undefined : e.currentTarget.value)}>
        {#if !required}<option value="">（不设置）</option>{/if}
        {#each schema.enum ?? [] as opt (opt)}<option value={opt}>{String(opt)}</option>{/each}
      </select>
    {/if}
    {@render errors()}
  </div>
{:else if kind === 'union' && falseBranch}
  <div class="f">
    {@render head()}
    <div class="row">
      <label class="st-switch"><input type="checkbox" checked={shown !== false} onchange={(e) => set(e.currentTarget.checked ? undefined : false)} /><span></span>开启</label>
      {#if shown !== false}
        <input value={typeof value === 'string' ? value : ''} placeholder={typeof schema.default === 'string' ? schema.default : ''} oninput={(e) => setString(e.currentTarget.value)} />
      {/if}
    </div>
    {@render errors()}
  </div>
{:else}
  <div class="f">
    {@render head()}
    {#if schema['x-widget'] === 'textarea'}
      <textarea rows="3" value={typeof value === 'string' ? value : ''} oninput={(e) => setString(e.currentTarget.value)}></textarea>
    {:else}
      <input type={schema.format === 'uri' ? 'url' : 'text'} value={typeof value === 'string' ? value : ''}
        placeholder={typeof schema.default === 'string' ? schema.default : ''} oninput={(e) => setString(e.currentTarget.value)} spellcheck="false" />
    {/if}
    {@render errors()}
  </div>
{/if}
