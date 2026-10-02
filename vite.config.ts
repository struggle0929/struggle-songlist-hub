import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-songlist',
  optimizeDeps: {
    include: ['@supabase/supabase-js', 'bits-ui', 'svelte-sonner', 'zod']
  },
  plugins: [tailwindcss(), sveltekit()]
});
