// Sweep production of stale campaigns — every campaign NOT on the keep-list
// is deleted whole: its c:{cid}:* records, the code: keys that open it, the
// tok: records that seat it, and its map/{cid} object in R2. Kept campaigns
// also get stale code doors swept (a code: key that points at a kept campaign
// but no longer matches its record's joinCode is an orphaned door — deleted).
//
// Usage:  node scripts/cleanup-stale-campaigns.mjs <keep-cid> [<keep-cid>…] [--yes]
// Dry-runs by default; --yes executes. Requires wrangler auth (run it yourself,
// not from an unattended shell). Test churn accumulates — expect to reuse this.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KV_ID = '0a135109757a4ef9888227d997977809';
const R2_BUCKET = 'hearsay-maps';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const keep = new Set(args.filter((a) => !a.startsWith('--')));
if (keep.size === 0) {
  console.error('refusing to run with an empty keep-list — name at least one campaign id to keep');
  process.exit(1);
}

const wrangler = (...a) =>
  execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', shell: process.platform === 'win32' });

console.log('listing remote keys…');
const keys = JSON.parse(wrangler('kv', 'key', 'list', `--namespace-id=${KV_ID}`, '--remote')).map((k) => k.name);

const campaignIds = new Set(keys.filter((k) => /^c:[^:]+:campaign$/.test(k)).map((k) => k.split(':')[1]));
const doomedCids = [...campaignIds].filter((cid) => !keep.has(cid));
for (const cid of keep) {
  if (!campaignIds.has(cid)) console.warn(`warning: keep-listed ${cid} has no campaign record (typo?)`);
}

const doomed = new Set();
// every record under a doomed campaign's prefix
for (const k of keys) {
  const m = k.match(/^c:([^:]+):/);
  if (m && doomedCids.includes(m[1])) doomed.add(k);
}
// code doors and seat tokens are top-level: resolve each to its campaign
const kept = { codes: new Map(), toks: 0 };
for (const k of keys) {
  if (k.startsWith('code:') || k.startsWith('tok:')) {
    const rec = JSON.parse(wrangler('kv', 'key', 'get', k, `--namespace-id=${KV_ID}`, '--remote'));
    if (doomedCids.includes(rec.campaignId)) doomed.add(k);
    else if (k.startsWith('code:')) kept.codes.set(k, rec.campaignId);
    else kept.toks++;
  }
}
// a kept campaign's stale code doors: index keys that no longer match its record
for (const [codeKey, cid] of kept.codes) {
  const campaign = JSON.parse(wrangler('kv', 'key', 'get', `c:${cid}:campaign`, `--namespace-id=${KV_ID}`, '--remote'));
  if (codeKey !== `code:${campaign.joinCode.toUpperCase()}`) {
    console.log(`stale door on kept campaign ${cid}: ${codeKey} (record says ${campaign.joinCode})`);
    doomed.add(codeKey);
  }
}

console.log(`\ncampaigns: ${campaignIds.size} found, keeping ${keep.size}, deleting ${doomedCids.length}`);
console.log(`keys to delete: ${doomed.size} of ${keys.length}  ·  R2 maps to delete: ${doomedCids.length}`);
console.log(`surviving tokens: ${kept.toks}`);
if (!yes) {
  console.log('\ndry run — re-run with --yes to execute');
  process.exit(0);
}

const file = join(mkdtempSync(join(tmpdir(), 'hearsay-sweep-')), 'doomed.json');
writeFileSync(file, JSON.stringify([...doomed]));
wrangler('kv', 'bulk', 'delete', file, `--namespace-id=${KV_ID}`, '--remote', '--force');
console.log('KV swept');
for (const cid of doomedCids) {
  try {
    wrangler('r2', 'object', 'delete', `${R2_BUCKET}/map/${cid}`, '--remote');
  } catch {
    console.warn(`no R2 map for ${cid} (already gone?)`);
  }
}
console.log('R2 swept — done');
