import type { Element, ElementContent, Root, Text } from 'hast';
import { visit } from 'unist-util-visit';

const CITE_PREFIX = /^\s*(——|--|—)\s*/;

/**
 * - wraps tables in `.table-wrap` so wide tables scroll instead of overflowing
 * - a blockquote whose last paragraph starts with "—— " gets that paragraph as `<cite>` (the source line)
 */
export function rehypeYoakari() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'table' && parent && index !== undefined) {
        const wrap: Element = { type: 'element', tagName: 'div', properties: { className: ['table-wrap'] }, children: [node] };
        parent.children[index] = wrap;
        return 'skip';
      }

      if (node.tagName === 'blockquote') {
        const paragraphs = node.children.filter((c): c is Element => c.type === 'element' && c.tagName === 'p');
        const last = paragraphs.at(-1);
        if (!last || paragraphs.length < 2) return;
        const lead = last.children[0];
        if (lead?.type !== 'text' || !CITE_PREFIX.test(lead.value)) return;
        (lead as Text).value = lead.value.replace(CITE_PREFIX, '');
        last.tagName = 'cite';
        node.children = node.children.filter((c) => c !== last) as ElementContent[];
        node.children.push(last);
      }
    });
  };
}
