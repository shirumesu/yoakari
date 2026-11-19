import { glob } from 'astro/loaders';

/** Markdown / MDX posts under `src/content/posts`. `posts/foo/index.md` and `posts/foo.md` both become `/posts/foo/`. */
export const postsLoader = (base = './src/content/posts') => glob({ pattern: '**/*.{md,mdx}', base });
