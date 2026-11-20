// Reading and editing a post's YAML frontmatter without disturbing what the form does not touch:
// comments, key order, quoting style and fields the theme does not know (series, author…) all stay.
import { isScalar, isSeq, parseDocument, YAMLSeq } from 'yaml';

// The closing fence is a line of its own: a YAML comment like `# ---- private ----` must not end the block.
// The group is absent for an empty block (`---` right after `---`).
const FM = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** `fm` is the YAML between the fences (null when the file has none); `body` is everything after them, as written. */
export function split(text: string): { fm: string | null; body: string } {
  const m = FM.exec(text);
  if (!m) return { fm: null, body: text };
  return { fm: m[1] === undefined ? '' : m[1], body: text.slice(m[0].length) };
}

export function join(fm: string | null, body: string) {
  if (fm === null) return body;
  const yaml = fm.replace(/\n+$/, '');
  return yaml ? `---\n${yaml}\n---\n${body}` : `---\n---\n${body}`;
}

export type Fields = Record<string, unknown>;

/** The frontmatter as plain values. Throws on broken YAML, with the parser's message. */
export function read(fm: string | null): Fields {
  if (fm === null || !fm.trim()) return {};
  const doc = parseDocument(fm);
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const data = doc.toJS();
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('frontmatter 应该是「键: 值」的形式');
  return data as Fields;
}

type ReadResult = { fields: Fields; error: null } | { fields: null; error: string };
// lists parse every post's frontmatter on each render; the texts rarely change, so remember the results
const cache = new Map<string, ReadResult>();

/** read() that returns the YAML error instead of throwing, for places that show it next to the form. Do not mutate the result. */
export function tryRead(fm: string | null): ReadResult {
  const key = fm ?? '';
  const hit = cache.get(key);
  if (hit) return hit;
  let res: ReadResult;
  try {
    res = { fields: read(fm), error: null };
  } catch (err) {
    res = { fields: null, error: (err as Error).message };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, res);
  return res;
}

/** Sets (or, with `undefined`, removes) one field and returns the new YAML. */
export function write(fm: string | null, key: string, value: unknown): string {
  const doc = parseDocument(fm ?? '');
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const out = () => doc.toString({ flowCollectionPadding: false }).replace(/\n+$/, '');
  if (value === undefined) {
    doc.delete(key);
    return out();
  }
  const node = doc.get(key, true);
  if (isScalar(node) && !Array.isArray(value) && (typeof value !== 'object' || value === null)) {
    node.value = value; // keeps the quote style the field was written with
  } else if (Array.isArray(value)) {
    const seq = doc.createNode(value) as YAMLSeq;
    // tags: ["a", "b"] stays on one line if it was written that way (or is new)
    seq.flow = isSeq(node) ? node.flow ?? false : true;
    if (seq.flow) for (const item of seq.items) if (isScalar(item) && typeof item.value === 'string') item.type = 'QUOTE_DOUBLE';
    doc.set(key, seq);
  } else {
    const created = doc.createNode(value);
    if (isScalar(created) && typeof value === 'string' && /^\s|\s$|^$|[:#]/.test(value)) created.type = 'QUOTE_DOUBLE';
    doc.set(key, created);
  }
  return out();
}

/** "2026-04-10T16:12:00+08:00" for `date` in the given IANA time zone. */
export function isoInZone(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetMin = Math.round((Date.parse(`${local}Z`) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
