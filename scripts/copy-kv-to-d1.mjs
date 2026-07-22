// Copy one campaign from production KV into D1 — built for the Example
// Table (c13d58dac4aa5, join code EXAMPLE), whose four sessions of
// hand-authored teaching content exist only in prod KV. Emits a .sql file;
// applying it is a separate, deliberate act:
//
//   node scripts/copy-kv-to-d1.mjs                # dry-run: prints counts, writes example-table.sql
//   npx wrangler d1 execute hearsay --local  --file=example-table.sql   # rehearse
//   npx wrangler d1 execute hearsay --remote --file=example-table.sql   # the real cutover (Rian-side)
//
// Reads KV with --remote ALWAYS (the wrangler v4 footgun: kv commands
// default to --local simulator state; engraved in docs/HANDOFF.md). Also
// copies the campaign's join-code doors and every bearer token pointing at
// it, so the Keeper's seat and every visitor seat keep working unminted.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CAMPAIGN_ID = process.argv[2] ?? 'c13d58dac4aa5';
const OUT = process.argv[3] ?? 'example-table.sql';

const kv = (args) =>
  execFileSync('npx', ['wrangler', 'kv', ...args, '--binding', 'HEARSAY', '--remote'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

const listKeys = (prefix) => {
  const out = kv(['key', 'list', '--prefix', prefix]);
  return JSON.parse(out.slice(out.indexOf('['))).map((k) => k.name);
};
const getJson = (key) => {
  const out = kv(['key', 'get', key]);
  return JSON.parse(out.slice(out.indexOf('{')));
};

const q = (v) => (v === undefined || v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);

console.log(`reading c:${CAMPAIGN_ID}:* from REMOTE KV …`);
const names = listKeys(`c:${CAMPAIGN_ID}:`);
const stmts = [];
const counts = { campaign: 0, members: 0, pins: 0, events: 0, testimony: 0, bounties: 0, tokens: 0, codes: 0 };

for (const name of names) {
  const kind = name.slice(`c:${CAMPAIGN_ID}:`.length).split(':')[0];
  const r = getJson(name);
  if (kind === 'campaign') {
    counts.campaign++;
    stmts.push(
      `INSERT OR REPLACE INTO campaigns (id, name, map_w, map_h, current_session, join_code) VALUES (${q(r.id)}, ${q(r.name)}, ${q(r.mapW)}, ${q(r.mapH)}, ${q(r.currentSession)}, ${q(r.joinCode)});`,
    );
    counts.codes++;
    stmts.push(`INSERT OR REPLACE INTO join_codes (code, campaign_id) VALUES (${q(r.joinCode.toUpperCase())}, ${q(r.id)});`);
  } else if (kind === 'm') {
    counts.members++;
    stmts.push(
      `INSERT OR REPLACE INTO members (id, campaign_id, name, role, status) VALUES (${q(r.id)}, ${q(r.campaignId)}, ${q(r.name)}, ${q(r.role)}, ${q(r.status)});`,
    );
  } else if (kind === 'p') {
    counts.pins++;
    stmts.push(
      `INSERT OR REPLACE INTO pins (id, campaign_id, x, y, name, hidden, hidden_until_session) VALUES (${q(r.id)}, ${q(r.campaignId)}, ${q(r.x)}, ${q(r.y)}, ${q(r.name)}, ${r.hidden ? 1 : 0}, ${q(r.hiddenUntilSession)});`,
    );
  } else if (kind === 'e') {
    counts.events++;
    stmts.push(
      `INSERT OR REPLACE INTO events (id, campaign_id, pin_id, session, canon_line, atmosphere, participant_ids) VALUES (${q(r.id)}, ${q(CAMPAIGN_ID)}, ${q(r.pinId)}, ${q(r.session)}, ${q(r.canonLine)}, ${q(r.atmosphere)}, ${q(JSON.stringify(r.participantIds ?? []))});`,
    );
  } else if (kind === 't') {
    counts.testimony++;
    stmts.push(
      `INSERT OR REPLACE INTO testimony (id, campaign_id, event_id, member_id, session, text, mark_text) VALUES (${q(r.id)}, ${q(CAMPAIGN_ID)}, ${q(r.eventId)}, ${q(r.memberId)}, ${q(r.session)}, ${q(r.text)}, ${q(r.markText)});`,
    );
  } else if (kind === 'b') {
    counts.bounties++;
    stmts.push(
      `INSERT OR REPLACE INTO bounties (id, campaign_id, posted_by, target, reason, session, status, struck_session) VALUES (${q(r.id)}, ${q(r.campaignId)}, ${q(r.postedBy)}, ${q(r.target)}, ${q(r.reason)}, ${q(r.session)}, ${q(r.status)}, ${q(r.struckSession)});`,
    );
  }
}

console.log('reading tok:* from REMOTE KV (keeping only this campaign\'s seats) …');
for (const name of listKeys('tok:')) {
  const rec = getJson(name);
  if (rec.campaignId !== CAMPAIGN_ID) continue;
  counts.tokens++;
  stmts.push(
    `INSERT OR REPLACE INTO tokens (token, campaign_id, member_id) VALUES (${q(name.slice('tok:'.length))}, ${q(rec.campaignId)}, ${q(rec.memberId)});`,
  );
}

// the hand-set EXAMPLE door may differ from the campaign record's minted code
console.log('reading code:* doors pointing at this campaign …');
for (const name of listKeys('code:')) {
  const rec = getJson(name);
  if (rec.campaignId !== CAMPAIGN_ID) continue;
  counts.codes++;
  stmts.push(`INSERT OR REPLACE INTO join_codes (code, campaign_id) VALUES (${q(name.slice('code:'.length).toUpperCase())}, ${q(CAMPAIGN_ID)});`);
}

writeFileSync(OUT, stmts.join('\n') + '\n');
console.log(`\nwrote ${stmts.length} statements to ${OUT}`);
console.log('entity counts (diff these against a post-apply SELECT COUNT):');
console.table(counts);
console.log(`\nnote: the map image stays in R2 (map/${CAMPAIGN_ID}) — nothing to move.`);
