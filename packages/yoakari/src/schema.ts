import { z } from 'astro/zod';
import type { SchemaContext } from 'astro:content';

/** Empty strings in frontmatter (`image: ""`, `category: ""`) mean "not set". */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/**
 * Frontmatter of a post. Field names follow Firefly / Fuwari so existing posts move over unchanged.
 * Use it in `src/content.config.ts`: `defineCollection({ loader: postsLoader(), schema: postsSchema })`.
 */
export const postsSchema = ({ image }: SchemaContext) =>
  z.object({
    title: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    description: z.string().default(''),
    /** A file next to the post (`./cover.webp`) or an absolute URL. */
    image: z.preprocess(blankToUndefined, z.union([image(), z.url()]).optional()),
    tags: z.array(z.string()).default([]),
    category: z.preprocess(blankToUndefined, z.string().optional()),
    pinned: z.boolean().default(false),
    lang: z.preprocess(blankToUndefined, z.string().optional()),
  });

export type PostData = z.output<ReturnType<typeof postsSchema>>;
