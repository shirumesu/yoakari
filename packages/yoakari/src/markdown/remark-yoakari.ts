import type { ElementContent } from 'hast';
import type { Blockquote, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive';
// brings in the `data.hName / hProperties / hChildren` fields that remark-rehype understands
import type {} from 'mdast-util-to-hast';
import { visit } from 'unist-util-visit';

/**
 * Markdown extensions of the theme (runs after remark-directive):
 * - callouts: `:::note` / `:::tip` / `:::warning` (optional `:::tip[Title]`) and GitHub alerts `> [!NOTE]`
 * - inline: `:spoiler[text]`, `:ruby[漢字]{rt="かんじ"}`, `:mark[text]`
 * - ```mermaid code blocks become `<pre class="mermaid">`, rendered in the browser
 * Directives the theme does not know are turned back into the text they were written as,
 * so prose such as "note:abc" is not swallowed.
 */

type CalloutKind = 'info' | 'tip' | 'warn';
const CALLOUTS: Record<string, { kind: CalloutKind; label: string; icon: string }> = {
  note: { kind: 'info', label: '说明', icon: 'info' },
  info: { kind: 'info', label: '说明', icon: 'info' },
  important: { kind: 'info', label: '重要', icon: 'info' },
  tip: { kind: 'tip', label: '小技巧', icon: 'bulb' },
  warning: { kind: 'warn', label: '注意', icon: 'alert' },
  warn: { kind: 'warn', label: '注意', icon: 'alert' },
  caution: { kind: 'warn', label: '小心', icon: 'alert' },
  danger: { kind: 'warn', label: '危险', icon: 'alert' },
};

const svgUse = (icon: string, className: string): ElementContent => ({
  type: 'element',
  tagName: 'svg',
  properties: { className: [className], ariaHidden: 'true' },
  children: [{ type: 'element', tagName: 'use', properties: { href: `#i-${icon}` }, children: [] }],
});

function makeCallout(name: string, title: string | undefined, children: RootContent[]) {
  const def = CALLOUTS[name];
  const label: Paragraph = {
    type: 'paragraph',
    children: [],
    data: {
      hName: 'span',
      hProperties: { className: ['callout-label'] },
      hChildren: [svgUse(def.icon, 'i'), { type: 'text', value: title ?? def.label }],
    },
  };
  const mark: Paragraph = { type: 'paragraph', children: [], data: { hName: 'span', hChildren: [svgUse(def.icon, 'callout-mark')] } };
  return {
    data: { hName: 'aside', hProperties: { className: ['callout', def.kind] } },
    children: [label, mark, ...children],
  };
}

const textOf = (nodes: PhrasingContent[]): string =>
  nodes.map((n) => ('value' in n ? n.value : 'children' in n ? textOf(n.children as PhrasingContent[]) : '')).join('');

function directiveSource(node: TextDirective | LeafDirective): PhrasingContent[] {
  const colons = node.type === 'textDirective' ? ':' : '::';
  const attrs = Object.entries(node.attributes ?? {});
  const tail = attrs.length ? `{${attrs.map(([k, v]) => (v ? `${k}="${v}"` : k)).join(' ')}}` : '';
  const out: PhrasingContent[] = [{ type: 'text', value: `${colons}${node.name}` }];
  if (node.children.length) out.push({ type: 'text', value: '[' }, ...(node.children as PhrasingContent[]), { type: 'text', value: ']' });
  if (tail) out.push({ type: 'text', value: tail });
  return out;
}

export function remarkYoakari() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'containerDirective') {
        const d = node as ContainerDirective;
        if (!(d.name in CALLOUTS)) return;
        const first = d.children[0];
        const hasLabel = first?.type === 'paragraph' && first.data?.directiveLabel;
        const title = hasLabel ? textOf((first as Paragraph).children) : undefined;
        const body = (hasLabel ? d.children.slice(1) : d.children) as RootContent[];
        Object.assign(d, makeCallout(d.name, title, body));
        return;
      }

      if (node.type === 'blockquote') {
        const first = (node as Blockquote).children[0];
        if (first?.type !== 'paragraph') return;
        const lead = first.children[0];
        const m = lead?.type === 'text' ? /^\[!(\w+)\]([^\n]*)\n?/.exec(lead.value) : null;
        if (!m || !(m[1].toLowerCase() in CALLOUTS)) return;
        (lead as Text).value = lead.type === 'text' ? lead.value.slice(m[0].length) : '';
        const rest = first.children.filter((c) => !(c.type === 'text' && c.value === ''));
        const body = [...(rest.length ? [{ ...first, children: rest }] : []), ...(node as Blockquote).children.slice(1)] as RootContent[];
        const title = m[2].trim() || undefined;
        if (parent && index !== undefined) {
          parent.children[index] = { type: 'blockquote', ...makeCallout(m[1].toLowerCase(), title, body) } as Blockquote;
        }
        return;
      }

      if (node.type === 'textDirective' || node.type === 'leafDirective') {
        const d = node as TextDirective | LeafDirective;
        const attrs = d.attributes ?? {};
        if (d.type === 'textDirective' && d.name === 'spoiler') {
          d.data = { hName: 'span', hProperties: { className: ['spoiler'], tabIndex: 0 } };
          return;
        }
        if (d.type === 'textDirective' && d.name === 'mark') {
          d.data = { hName: 'span', hProperties: { className: ['mark'] } };
          return;
        }
        if (d.type === 'textDirective' && d.name === 'ruby' && attrs.rt) {
          d.data = {
            hName: 'ruby',
            hChildren: [{ type: 'text', value: textOf(d.children) }, { type: 'element', tagName: 'rt', properties: {}, children: [{ type: 'text', value: attrs.rt }] }],
          };
          return;
        }
        if (parent && index !== undefined) {
          const restored = directiveSource(d);
          if (d.type === 'leafDirective') parent.children[index] = { type: 'paragraph', children: restored } as Paragraph;
          else parent.children.splice(index, 1, ...(restored as RootContent[]));
          return index + restored.length;
        }
        return;
      }

      if (node.type === 'code' && node.lang === 'mermaid') {
        const code = node.value;
        if (parent && index !== undefined) {
          parent.children[index] = {
            type: 'paragraph',
            children: [],
            data: { hName: 'pre', hProperties: { className: ['mermaid'] }, hChildren: [{ type: 'text', value: code }] },
          } as Paragraph;
        }
      }
    });
  };
}
