import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog posts live as markdown in src/content/blog/<slug>.md.
// Drop a new .md here and it becomes /blog/<slug>/ on the next build.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),                 // visible H1
    headline: z.string().optional(),   // schema headline (defaults to title)
    metaTitle: z.string().optional(),  // browser <title>
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    kicker: z.string().optional(),        // eyebrow on the article page
    metaLine: z.string().optional(),      // byline line under H1
    cardKicker: z.string().optional(),    // kicker on the /blog/ hub card
    cardDescription: z.string().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { blog };
