// The served-hash verification (Litany's fingerprint habit): after a deploy,
// don't trust the success message — fetch what the edge actually serves and
// compare it byte-for-byte (sha256) against the dist that was deployed.
// Also proves the freshness discipline and noindex made it to the wire.
//
//   node scripts/verify-deploy.mjs https://hearsay-preview.pages.dev
//
// Exits nonzero on any mismatch, so `npm run deploy` fails loudly.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const origin = process.argv[2]?.replace(/\/$/, '');
if (!origin) {
  console.error('usage: node scripts/verify-deploy.mjs <deployed-origin>');
  process.exit(1);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk('dist');

let failed = false;
for (const path of files) {
  const rel = relative('dist', path).replaceAll('\\', '/');
  // Pages consumes _headers as config; it is never served as a file
  if (rel === '_headers') continue;
  const local = readFileSync(path);
  const res = await fetch(`${origin}/${rel}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`✗ ${rel} — HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const served = Buffer.from(await res.arrayBuffer());
  if (sha(served) === sha(local)) {
    console.log(`✓ ${rel} — served hash matches (${sha(local).slice(0, 12)}…)`);
  } else {
    console.error(`✗ ${rel} — served ${sha(served).slice(0, 12)}… ≠ built ${sha(local).slice(0, 12)}…`);
    failed = true;
  }
}

// the two wire contracts that must hold beyond file bytes
const index = await fetch(`${origin}/`, { cache: 'no-store' });
const robots = index.headers.get('x-robots-tag') ?? '';
if (robots.includes('noindex')) console.log('✓ X-Robots-Tag: noindex on the wire');
else {
  console.error(`✗ X-Robots-Tag missing/wrong: "${robots}"`);
  failed = true;
}
const indexBody = await index.text();
if (indexBody === readFileSync('dist/index.html', 'utf8')) {
  console.log('✓ / serves the freshly built index.html');
} else {
  console.error('✗ / does not serve the built index.html');
  failed = true;
}

// _headers covers only static assets; the api middleware must carry noindex
// on Functions responses too (any status will do — the header is the contract)
const api = await fetch(`${origin}/api/maps/_verify`, { cache: 'no-store' });
if ((api.headers.get('x-robots-tag') ?? '').includes('noindex')) {
  console.log('✓ X-Robots-Tag: noindex on /api responses');
} else {
  console.error('✗ /api responses missing X-Robots-Tag');
  failed = true;
}

if (failed) {
  console.error('deploy verification FAILED — the edge is not serving this build');
  process.exit(1);
}
console.log(`deploy verified: ${origin} serves exactly this build`);
