import { defineConfig } from 'vite';

// /api is served by wrangler during development: run `npm run api` alongside
// `npm run dev` and vite proxies API calls to it (functions hot-reload from
// functions/; the dist it serves is only static fallback).
export default defineConfig({
  server: {
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
});
