// @ts-check
import { defineConfig } from 'astro/config';

// Lindsey personal site. Static output, deployed to GitHub Pages at the apex domain.
export default defineConfig({
  site: 'https://lindseyaitech.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
