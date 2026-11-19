import { defineCollection } from 'astro:content';
import { postsLoader } from 'astro-yoakari/loaders';
import { postsSchema } from 'astro-yoakari/schema';

export const collections = {
  posts: defineCollection({ loader: postsLoader(), schema: postsSchema }),
};
