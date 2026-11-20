// subset-font ships no types; the part of its API the theme uses (fonts.ts).
declare module 'subset-font' {
  /** A copy of `font` with only the glyphs `text` needs, in `targetFormat` (default: the input's format). */
  export default function subsetFont(
    font: Uint8Array,
    text: string,
    options?: { targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2'; preserveNameIds?: number[]; noLayoutClosure?: boolean },
  ): Promise<Buffer>;
}
