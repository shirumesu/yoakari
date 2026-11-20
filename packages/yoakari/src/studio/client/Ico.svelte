<script lang="ts" module>
  // Icons of the studio, drawn like the theme's sprite (24×24, round strokes). Names that are not here
  // come from the theme's sprite (<use href="#i-name">).
  const PATHS: Record<string, string> = {
    bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
    italic: 'M19 4h-9M14 20H5M15 4 9 20',
    strike: 'M16 5.5A4 4 0 0 0 12.5 4H11a3.5 3.5 0 0 0-2 6.4M4 12h16M15 13.8A3.5 3.5 0 0 1 13 20h-2a4 4 0 0 1-3.5-2',
    code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    quote: 'M9 7H5v5h4v1a3 3 0 0 1-3 3M19 7h-4v5h4v1a3 3 0 0 1-3 3',
    ul: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    ol: 'M10 6h10M10 12h10M10 18h10M4 4.5l1.5-.5v5M3.5 9h3M3.5 14.5a1.5 1.5 0 0 1 3 .5c0 1-3 2.5-3 4h3',
    task: 'M4 4h6v6H4zM14 7h6M4 15l2 2 4-4M14 16h6',
    codeblock: 'M4 4h16v16H4zM10 10l-2 2 2 2M14 10l2 2-2 2',
    math: 'M3 13h3l3 7 5-16h7',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
    hr: 'M4 12h16M8 7h8M8 17h8',
    spoiler: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5.5 0 9 6 9 6a16 16 0 0 1-2.4 3M6.6 6.6C4.3 8.2 3 12 3 12s3.5 6 9 6a8.6 8.6 0 0 0 3.4-.7',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6',
    split: 'M3 4h18v16H3zM12 4v16',
    sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
    download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
    send: 'M12 19V7M7 12l5-5 5 5M5 4h14',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    close: 'M6 6l12 12M18 6 6 18',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    file: 'M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3 3 3-3',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    key: 'M14.5 4a5.5 5.5 0 1 1-4.9 8L3 18.5V21h3v-2h2v-2h2l1.6-1.6A5.5 5.5 0 0 1 14.5 4zM16 8h.01',
    gear: 'M12 2.8l1.7 2.4 2.8-.7.6 2.8 2.5 1.5-1.2 2.6 1.2 2.6-2.5 1.5-.6 2.8-2.8-.7L12 21.2l-1.7-2.4-2.8.7-.6-2.8-2.5-1.5 1.2-2.6-1.2-2.6 2.5-1.5.6-2.8 2.8.7zM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z',
    dot: 'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z',
  };
</script>

<script lang="ts">
  interface Props { name: string; small?: boolean; class?: string }
  let { name, small = false, class: cls = '' }: Props = $props();
</script>

<svg class={['i', small && 's', cls]} viewBox="0 0 24 24" aria-hidden="true">
  {#if PATHS[name]}<path d={PATHS[name]} />{:else}<use href={`#i-${name}`} />{/if}
</svg>
