-- Sessions removed: each place is its own clock (docs/decisions.md,
-- 2026-07-22). Session integers become real created-at timestamps. The
-- backfill is synthetic — base epoch + a day per session + a second per
-- rowid — which preserves both session order and within-session insertion
-- order, and predates every real timestamp that will follow.

ALTER TABLE events ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE events SET created_at = 1750000000000 + session * 86400000 + rowid * 1000;
ALTER TABLE events DROP COLUMN session;

ALTER TABLE testimony ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE testimony SET created_at = 1750000000000 + session * 86400000 + rowid * 1000;
ALTER TABLE testimony DROP COLUMN session;

ALTER TABLE bounties ADD COLUMN posted_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bounties ADD COLUMN struck_at INTEGER;
UPDATE bounties SET posted_at = 1750000000000 + session * 86400000 + rowid * 1000;
UPDATE bounties SET struck_at = 1750000000000 + struck_session * 86400000 + rowid * 1000 + 1
  WHERE struck_session IS NOT NULL;
ALTER TABLE bounties DROP COLUMN session;
ALTER TABLE bounties DROP COLUMN struck_session;

-- The Campaign Manager's new pin controls: a standing description of the
-- place, and a seal that closes it to player input.
ALTER TABLE pins ADD COLUMN description TEXT;
ALTER TABLE pins ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pins DROP COLUMN hidden_until_session;

ALTER TABLE campaigns DROP COLUMN current_session;
