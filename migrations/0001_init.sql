-- Hearsay schema, whole and at once: pre-launch KV data is throwaway (the one
-- exception, the Example Table, arrives via scripts/copy-kv-to-d1.mjs), so no
-- incremental choreography. Column names are snake_case; the row↔entity
-- mappers in functions/lib.ts keep the JSON wire shapes byte-identical to the
-- KV era. Campaign entities carry a denormalized campaign_id + index so
-- loadCampaignData is one batch of six indexed SELECTs, no joins.

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  map_w INTEGER NOT NULL,
  map_h INTEGER NOT NULL,
  current_session INTEGER NOT NULL,
  join_code TEXT NOT NULL
);
-- mapImageUrl is derived at load time (/api/maps/{id}) — never stored.

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','player')),
  status TEXT NOT NULL CHECK (status IN ('active','pending'))
);
CREATE INDEX idx_members_campaign ON members(campaign_id);

CREATE TABLE pins (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  name TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  hidden_until_session INTEGER
);
CREATE INDEX idx_pins_campaign ON pins(campaign_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  pin_id TEXT NOT NULL REFERENCES pins(id),
  session INTEGER NOT NULL,
  canon_line TEXT NOT NULL,
  atmosphere TEXT,
  -- JSON array of member ids; '[]' = the whole table, resolved live
  participant_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_events_campaign ON events(campaign_id);

CREATE TABLE testimony (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  member_id TEXT NOT NULL,
  session INTEGER NOT NULL,
  text TEXT NOT NULL,
  mark_text TEXT,
  UNIQUE (event_id, member_id)
);
CREATE INDEX idx_testimony_campaign ON testimony(campaign_id);

CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  posted_by TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  session INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','posted','struck')),
  struck_session INTEGER
);
CREATE INDEX idx_bounties_campaign ON bounties(campaign_id);

-- Bearer-token seats: reclaim is additive, so a member may hold many rows.
CREATE TABLE tokens (
  token TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  member_id TEXT NOT NULL
);
CREATE INDEX idx_tokens_campaign ON tokens(campaign_id);

-- Join codes are validated purely by lookup, so memorable codes (EXAMPLE)
-- stay possible. Stored uppercase.
CREATE TABLE join_codes (
  code TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL
);

-- The Google recovery thread (a thread, never a wall).
CREATE TABLE google_accounts (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL
);
CREATE TABLE google_seats (
  sub TEXT NOT NULL REFERENCES google_accounts(sub),
  campaign_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  PRIMARY KEY (sub, campaign_id, member_id)
);

-- Short-lived post-callback auth sessions. D1 has no TTL: expires_at is
-- epoch ms, checked (and expired rows deleted) lazily on read.
CREATE TABLE google_sessions (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
