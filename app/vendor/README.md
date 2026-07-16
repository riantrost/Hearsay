# app/vendor

Pre-bundled third-party code, committed so the app stays buildless and offline-capable.

## supabase-js.js
A single-file browser ESM bundle of `@supabase/supabase-js` (v2.110.6), produced with esbuild:

    esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify

where `entry.js` is `export { createClient } from '@supabase/supabase-js';`.

To refresh: `npm i @supabase/supabase-js@2 esbuild`, re-run the bundle, replace this file,
and bump the cache version in `app/sw.js`.
