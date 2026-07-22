import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// /api is served by wrangler during development: run `npm run api` alongside
// `npm run dev` and vite proxies API calls to it (functions hot-reload from
// functions/; the dist it serves is only static fallback).
export default defineConfig({
  plugins: [preact()],
  server: {
    // honor an assigned port (preview panes running beside another dev server)
    port: Number(process.env.PORT) || 5173,
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
});
