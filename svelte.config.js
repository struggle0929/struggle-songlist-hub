import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'auto',
      directives: {
        'base-uri': ['self'],
        'object-src': ['none'],
        'frame-ancestors': ['none'],
        ...(process.env.NODE_ENV === 'production' ? { 'script-src': ['self'] } : {})
      }
    }
  }
};

export default config;
