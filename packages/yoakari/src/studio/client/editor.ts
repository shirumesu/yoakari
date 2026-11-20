// The Markdown editor (CodeMirror 6) and its formatting commands.
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, keymap, placeholder, rectangularSelection } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const style = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.3em', color: 'var(--primary-text)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.15em', color: 'var(--primary-text)' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--primary-text)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'oklch(.55 .09 var(--h2))' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', color: 'oklch(.55 .1 var(--h3))' },
  // the marks (** ` # > -) in a monospace face: in the round body font backticks are hard to see
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.92em' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--primary)' },
]);

/** The editor's look. Written as a CodeMirror theme: its own base styles are not in a CSS layer and would beat studio.css. */
const look = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-body)', fontSize: '15.5px', lineHeight: '1.95', padding: '28px 0 40vh' },
  '.cm-content': { maxWidth: '74ch', margin: '0 auto', padding: '0 32px', caretColor: 'var(--primary-text)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--primary-text)' },
  '.cm-activeLine': { backgroundColor: 'oklch(.80 .085 var(--h) / .06)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'oklch(.80 .085 var(--h) / .28)',
  },
  '.cm-selectionMatch': { backgroundColor: 'oklch(.80 .07 var(--h2) / .22)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--bg)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panel.cm-search': { padding: '8px 12px', fontFamily: 'var(--font-body)' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '13px', borderRadius: '8px' },
  '.cm-textfield': { border: '1px solid var(--line)', backgroundColor: 'var(--card)', padding: '3px 8px' },
  '.cm-button': { border: '1px solid var(--line)', backgroundImage: 'none', backgroundColor: 'var(--card)', padding: '3px 10px' },
  '.cm-searchMatch': { backgroundColor: 'oklch(.85 .1 85 / .45)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'oklch(.80 .12 75 / .7)' },
});

export interface EditorHooks {
  onChange: (text: string) => void;
  /** Topmost visible source line (1-based), for keeping the preview level. */
  onScrollLine: (line: number) => void;
  /** Images pasted or dropped; returns the Markdown to insert. */
  onFiles: (files: File[]) => Promise<string>;
  onSave: () => void;
  onError: (err: unknown) => void;
}

export function createEditor(parent: HTMLElement, text: string, hooks: EditorHooks) {
  const insertFiles = (view: EditorView, files: File[], pos: number) => {
    hooks.onFiles(files).then(
      (md) => view.dispatch({ changes: { from: pos, insert: md }, selection: { anchor: pos + md.length } }),
      hooks.onError,
    );
  };
  const images = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

  const extensions: Extension[] = [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    placeholder('从这里开始写…'),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(style),
    look,
    keymap.of([
      { key: 'Mod-s', run: () => (hooks.onSave(), true), preventDefault: true },
      { key: 'Mod-b', run: (v) => wrap(v, '**') },
      { key: 'Mod-i', run: (v) => wrap(v, '*') },
      { key: 'Mod-k', run: (v) => link(v) },
      { key: 'Mod-e', run: (v) => wrap(v, '`') },
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) hooks.onChange(u.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      scroll: (_e, view) => {
        const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
        hooks.onScrollLine(view.state.doc.lineAt(block.from).number);
      },
      paste: (e, view) => {
        const files = images(e.clipboardData?.files);
        if (!files.length) return false;
        e.preventDefault();
        insertFiles(view, files, view.state.selection.main.from);
        return true;
      },
      drop: (e, view) => {
        const files = images(e.dataTransfer?.files);
        if (!files.length) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.from;
        insertFiles(view, files, pos);
        return true;
      },
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions }) });
  return {
    view,
    /** Another document: new text and a fresh undo history. */
    load(next: string) {
      view.setState(EditorState.create({ doc: next, extensions }));
    },
    /** Replaces the text when it changed outside the editor, keeping the cursor where it can. */
    sync(next: string) {
      if (next === view.state.doc.toString()) return;
      const head = Math.min(view.state.selection.main.head, next.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: head } });
    },
    destroy: () => view.destroy(),
  };
}

/* ---------- formatting commands (toolbar and shortcuts) ---------- */

/** Wraps each selection in `mark` (or removes it when already wrapped). */
export function wrap(view: EditorView, mark: string, after = mark) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((r) => {
      const before = state.sliceDoc(r.from - mark.length, r.from);
      const behind = state.sliceDoc(r.to, r.to + after.length);
      if (before === mark && behind === after) {
        return {
          changes: [{ from: r.from - mark.length, to: r.from }, { from: r.to, to: r.to + after.length }],
          range: EditorSelection.range(r.from - mark.length, r.to - mark.length),
        };
      }
      return {
        changes: [{ from: r.from, insert: mark }, { from: r.to, insert: after }],
        range: EditorSelection.range(r.from + mark.length, r.to + mark.length),
      };
    }),
  );
  view.focus();
  return true;
}

export function link(view: EditorView) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to);
      const isUrl = /^https?:\/\//.test(text);
      const insert = isUrl ? `[](${text})` : `[${text}](https://)`;
      const cursor = isUrl ? r.from + 1 : r.from + text.length + 3;
      return { changes: { from: r.from, to: r.to, insert }, range: isUrl ? EditorSelection.cursor(cursor) : EditorSelection.range(cursor, cursor + 8) };
    }),
  );
  view.focus();
  return true;
}

/** Toggles a prefix (`## `, `> `, `- `) on every selected line. */
export function linePrefix(view: EditorView, prefix: string) {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const all = [...lines].map((n) => state.doc.line(n));
  const remove = all.every((l) => l.text.startsWith(prefix));
  const heading = /^#{1,6} /;
  view.dispatch({
    changes: all.map((l) => {
      if (remove) return { from: l.from, to: l.from + prefix.length };
      const old = prefix.startsWith('#') ? heading.exec(l.text)?.[0].length ?? 0 : 0;
      return { from: l.from, to: l.from + old, insert: prefix };
    }),
  });
  view.focus();
  return true;
}

/** Inserts a block (code fence, callout…) on its own lines; `|` marks where the cursor goes. */
export function block(view: EditorView, template: string) {
  const { state } = view;
  const r = state.selection.main;
  const line = state.doc.lineAt(r.from);
  const selected = state.sliceDoc(r.from, r.to);
  const filled = template.replace('|', selected || '|');
  const lead = line.text.trim() ? '\n\n' : '';
  const text = `${lead}${filled}\n`;
  const at = selected ? r.from : line.text.trim() ? line.to : line.from;
  const caret = text.indexOf('|');
  const insert = text.replace('|', '');
  view.dispatch({
    changes: { from: at, to: selected ? r.to : at, insert },
    selection: { anchor: at + (caret >= 0 ? caret : insert.length) },
  });
  view.focus();
  return true;
}

export function insertText(view: EditorView, text: string) {
  const r = view.state.selection.main;
  view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length } });
  view.focus();
}
