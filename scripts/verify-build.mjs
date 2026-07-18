// The no-service-worker contract, enforced at build time (V1 is
// server-authoritative, docs/decisions.md): a service worker that caches the
// app shell is exactly how an app pins itself stale, so none may ship. Runs
// after vite build; fails the build if anything service-worker-shaped lands
// in dist. Litany's fingerprint habit: trust the proof, not the intention.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (/^(sw|workbox|service-?worker)/i.test(name) && name.endsWith('.js')) {
      offenders.push(`${path} — service-worker-shaped filename`);
    }
    if (/\.(js|html)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      if (text.includes('serviceWorker') && text.includes('.register(')) {
        offenders.push(`${path} — serviceWorker registration in output`);
      }
    }
  }
}

walk('dist');

if (offenders.length > 0) {
  console.error('service worker found in build output — V1 must not ship one:');
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log('build output is service-worker-free: the app cannot pin itself stale');
