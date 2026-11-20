// Downloading a post: the Markdown file, or a zip with its folder when it has images.
import { zipSync } from 'fflate';
import type { Doc } from './docs.svelte.ts';
import { blobBytes } from './github.ts';
import { storedAuth } from './token.ts';

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function downloadDoc(doc: Doc) {
  const name = doc.slug || 'post';
  const assets = doc.assets.filter((a) => a.state !== 'deleted');
  if (!assets.length) return save(new Blob([doc.text], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
  const remote = assets.filter((a) => !a.blob);
  if (remote.length && !storedAuth()) {
    throw new Error(`有 ${remote.length} 张图片只在仓库里，登录后才能一起打包`);
  }
  const files: Record<string, Uint8Array> = { [`${name}/index.md`]: new TextEncoder().encode(doc.text) };
  for (const a of assets) {
    files[`${name}/${a.name}`] = a.blob ? new Uint8Array(await a.blob.arrayBuffer()) : await blobBytes(a.oid!);
  }
  save(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `${name}.zip`);
}
