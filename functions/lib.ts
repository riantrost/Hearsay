// Shared plumbing for the Pages Functions API. Storage is D1 (SQLite) —
// strongly consistent, so a record written a moment ago is simply there when
// the next request loads the campaign; the KV era's eventual-consistency
// backstops (ensureRecord, the client's write ledger) have no reason to
// exist. One row per entity; writes touch only the row they change, so two
// players testifying at once can't clobber each other. Identity is
// table-cheap: a bearer token minted at create/join maps straight to a
// member; no accounts, no passwords, recoverable by re-invite.
//
// Row mappers below keep the JSON wire shapes byte-identical to the KV era:
// snake_case columns in, the src/model.ts entities out, NULL ↔ undefined.

import type { Bounty, Campaign, CampaignData, Member, Pin, SiteEvent, Testimony } from '../src/model';

export interface Env {
  DB: D1Database;
  /** KV retires after the D1 cutover soak (Stage 6); bound through the window. */
  HEARSAY: KVNamespace;
  MAPS: R2Bucket;
  /** Google OAuth client for seat recovery (optional — unset disables the feature). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

// Lawrence's Northmarch jpg is ~8 MB; anything past this isn't a table map
export const MAX_MAP_BYTES = 20 * 1024 * 1024;

export const err = (status: number, msg: string) => new Response(msg, { status });

/** Mutation-layer errors carry their meaning in the message; map to status. */
export function mutationError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith('no such')) return err(404, msg);
  if (msg.startsWith('testimony is closed')) return err(409, msg);
  if (msg.startsWith('sealed')) return err(409, msg);
  return err(400, msg);
}

// ---------------------------------------------------------------------------
// Row ↔ entity mappers

interface CampaignRow {
  id: string;
  name: string;
  map_w: number;
  map_h: number;
  join_code: string;
}
const rowToCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  name: r.name,
  // never stored — the map endpoint is the URL
  mapImageUrl: `/api/maps/${r.id}`,
  mapW: r.map_w,
  mapH: r.map_h,
  joinCode: r.join_code,
});

interface MemberRow {
  id: string;
  campaign_id: string;
  name: string;
  role: string;
  status: string;
}
const rowToMember = (r: MemberRow): Member => ({
  id: r.id,
  campaignId: r.campaign_id,
  name: r.name,
  role: r.role as Member['role'],
  status: r.status as Member['status'],
});

interface PinRow {
  id: string;
  campaign_id: string;
  x: number;
  y: number;
  name: string;
  hidden: number;
  description: string | null;
  sealed: number;
}
const rowToPin = (r: PinRow): Pin => ({
  id: r.id,
  campaignId: r.campaign_id,
  x: r.x,
  y: r.y,
  name: r.name,
  // absent-when-false keeps the wire shape identical to the KV records
  ...(r.hidden ? { hidden: true } : {}),
  ...(r.description !== null ? { description: r.description } : {}),
  ...(r.sealed ? { sealed: true } : {}),
});

interface EventRow {
  id: string;
  pin_id: string;
  created_at: number;
  canon_line: string;
  atmosphere: string | null;
  participant_ids: string;
}
const rowToEvent = (r: EventRow): SiteEvent => ({
  id: r.id,
  pinId: r.pin_id,
  createdAt: r.created_at,
  canonLine: r.canon_line,
  ...(r.atmosphere !== null ? { atmosphere: r.atmosphere } : {}),
  participantIds: JSON.parse(r.participant_ids) as string[],
});

interface TestimonyRow {
  id: string;
  event_id: string;
  member_id: string;
  created_at: number;
  text: string;
  mark_text: string | null;
}
const rowToTestimony = (r: TestimonyRow): Testimony => ({
  id: r.id,
  eventId: r.event_id,
  memberId: r.member_id,
  createdAt: r.created_at,
  text: r.text,
  ...(r.mark_text !== null ? { markText: r.mark_text } : {}),
});

interface BountyRow {
  id: string;
  campaign_id: string;
  posted_by: string;
  target: string;
  reason: string;
  posted_at: number;
  status: string;
  struck_at: number | null;
}
const rowToBounty = (r: BountyRow): Bounty => ({
  id: r.id,
  campaignId: r.campaign_id,
  postedBy: r.posted_by,
  target: r.target,
  reason: r.reason,
  postedAt: r.posted_at,
  status: r.status as Bounty['status'],
  ...(r.struck_at !== null ? { struckAt: r.struck_at } : {}),
});

// ---------------------------------------------------------------------------
// Campaign load: one batch of six indexed SELECTs, strongly consistent.

export async function loadCampaignData(env: Env, cid: string): Promise<CampaignData | null> {
  const [c, m, p, e, t, b] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(cid),
    env.DB.prepare('SELECT * FROM members WHERE campaign_id = ?').bind(cid),
    env.DB.prepare('SELECT * FROM pins WHERE campaign_id = ?').bind(cid),
    env.DB.prepare('SELECT * FROM events WHERE campaign_id = ?').bind(cid),
    env.DB.prepare('SELECT * FROM testimony WHERE campaign_id = ?').bind(cid),
    env.DB.prepare('SELECT * FROM bounties WHERE campaign_id = ?').bind(cid),
  ]);
  const campaignRow = (c.results as unknown as CampaignRow[])[0];
  if (!campaignRow) return null;
  return {
    campaign: rowToCampaign(campaignRow),
    members: (m.results as unknown as MemberRow[]).map(rowToMember),
    pins: (p.results as unknown as PinRow[]).map(rowToPin),
    events: (e.results as unknown as EventRow[]).map(rowToEvent),
    testimony: (t.results as unknown as TestimonyRow[]).map(rowToTestimony),
    bounties: (b.results as unknown as BountyRow[]).map(rowToBounty),
  };
}

// ---------------------------------------------------------------------------
// Typed savers: upsert exactly the record the mutation returned.

export async function saveCampaign(env: Env, c: Campaign): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO campaigns (id, name, map_w, map_h, join_code) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, map_w = excluded.map_w, map_h = excluded.map_h,
       join_code = excluded.join_code`,
  )
    .bind(c.id, c.name, c.mapW, c.mapH, c.joinCode)
    .run();
}

export async function saveMember(env: Env, m: Member): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO members (id, campaign_id, name, role, status) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, status = excluded.status`,
  )
    .bind(m.id, m.campaignId, m.name, m.role, m.status)
    .run();
}

export async function savePin(env: Env, p: Pin): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pins (id, campaign_id, x, y, name, hidden, description, sealed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET x = excluded.x, y = excluded.y, name = excluded.name,
       hidden = excluded.hidden, description = excluded.description, sealed = excluded.sealed`,
  )
    .bind(p.id, p.campaignId, p.x, p.y, p.name, p.hidden ? 1 : 0, p.description ?? null, p.sealed ? 1 : 0)
    .run();
}

export async function saveEvent(env: Env, cid: string, e: SiteEvent): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO events (id, campaign_id, pin_id, created_at, canon_line, atmosphere, participant_ids) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET canon_line = excluded.canon_line, atmosphere = excluded.atmosphere,
       participant_ids = excluded.participant_ids`,
  )
    .bind(e.id, cid, e.pinId, e.createdAt, e.canonLine, e.atmosphere ?? null, JSON.stringify(e.participantIds))
    .run();
}

export async function saveTestimony(env: Env, cid: string, t: Testimony): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO testimony (id, campaign_id, event_id, member_id, created_at, text, mark_text) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET text = excluded.text, mark_text = excluded.mark_text`,
  )
    .bind(t.id, cid, t.eventId, t.memberId, t.createdAt, t.text, t.markText ?? null)
    .run();
}

export async function saveBounty(env: Env, b: Bounty): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO bounties (id, campaign_id, posted_by, target, reason, posted_at, status, struck_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, struck_at = excluded.struck_at`,
  )
    .bind(b.id, b.campaignId, b.postedBy, b.target, b.reason, b.postedAt, b.status, b.struckAt ?? null)
    .run();
}

export async function deleteBounty(env: Env, bid: string): Promise<void> {
  await env.DB.prepare('DELETE FROM bounties WHERE id = ?').bind(bid).run();
}

/**
 * A declined membership leaves whole: the seat, the words that were never
 * table-visible, and the tokens behind the chair — one transactional batch
 * (an honest improvement over KV, where the orphaned token merely dangled).
 */
export async function deleteMemberCascade(env: Env, cid: string, mid: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(mid),
    env.DB.prepare('DELETE FROM testimony WHERE campaign_id = ? AND member_id = ?').bind(cid, mid),
    env.DB.prepare('DELETE FROM tokens WHERE campaign_id = ? AND member_id = ?').bind(cid, mid),
  ]);
}

// ---------------------------------------------------------------------------
// Seats and doors

export interface TokenRecord {
  campaignId: string;
  memberId: string;
}

export async function insertToken(env: Env, token: string, cid: string, mid: string): Promise<void> {
  await env.DB.prepare('INSERT INTO tokens (token, campaign_id, member_id) VALUES (?, ?, ?)').bind(token, cid, mid).run();
}

export async function getTokenRecord(env: Env, token: string): Promise<TokenRecord | null> {
  const row = await env.DB.prepare('SELECT campaign_id, member_id FROM tokens WHERE token = ?')
    .bind(token)
    .first<{ campaign_id: string; member_id: string }>();
  return row ? { campaignId: row.campaign_id, memberId: row.member_id } : null;
}

export async function putJoinCode(env: Env, code: string, cid: string): Promise<void> {
  await env.DB.prepare('INSERT INTO join_codes (code, campaign_id) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET campaign_id = excluded.campaign_id')
    .bind(code.toUpperCase(), cid)
    .run();
}

export async function deleteJoinCode(env: Env, code: string): Promise<void> {
  await env.DB.prepare('DELETE FROM join_codes WHERE code = ?').bind(code.toUpperCase()).run();
}

/** Join codes are validated purely by lookup — memorable codes stay possible. */
export async function findCampaignByCode(env: Env, code: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT campaign_id FROM join_codes WHERE code = ?')
    .bind(code.toUpperCase())
    .first<{ campaign_id: string }>();
  return row?.campaign_id ?? null;
}

// ---------------------------------------------------------------------------
// The Google recovery thread

export interface GoogleSession {
  sub: string;
  email: string;
}

/** D1 has no TTL: sessions carry expires_at (epoch ms), swept lazily on read. */
export async function putGoogleSession(env: Env, id: string, session: GoogleSession, ttlMs: number): Promise<void> {
  await env.DB.prepare('INSERT INTO google_sessions (id, sub, email, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, session.sub, session.email, Date.now() + ttlMs)
    .run();
}

/**
 * Resolve a `gsession` handle minted by the OAuth callback. Sessions are
 * single-purpose and short-lived; a missing or expired one means the sign-in
 * expired or was already spent.
 */
export async function requireGoogleSession(env: Env, gsession: unknown): Promise<GoogleSession | Response> {
  if (typeof gsession !== 'string' || !gsession) return err(400, 'a google sign-in is required');
  const row = await env.DB.prepare('SELECT sub, email, expires_at FROM google_sessions WHERE id = ?')
    .bind(gsession)
    .first<{ sub: string; email: string; expires_at: number }>();
  if (row && row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM google_sessions WHERE id = ?').bind(gsession).run();
    return err(401, 'this google sign-in has expired — try again');
  }
  if (!row) return err(401, 'this google sign-in has expired — try again');
  return { sub: row.sub, email: row.email };
}

/** One row per Google account; linking a seat is idempotent (PK collision ignored). */
export async function linkGoogleSeat(env: Env, session: GoogleSession, cid: string, mid: string): Promise<string> {
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO google_accounts (sub, email) VALUES (?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email',
    ).bind(session.sub, session.email),
    env.DB.prepare('INSERT OR IGNORE INTO google_seats (sub, campaign_id, member_id) VALUES (?, ?, ?)').bind(
      session.sub,
      cid,
      mid,
    ),
  ]);
  return session.email;
}

/**
 * The account's linked seats whose member still exists, with the campaign
 * name for the tables picker — one query, the join doing the "declined
 * members can't be recovered into" filtering.
 */
export async function recoverableSeats(
  env: Env,
  sub: string,
): Promise<{ campaignId: string; memberId: string; label: string }[]> {
  const rows = await env.DB.prepare(
    `SELECT gs.campaign_id, gs.member_id, c.name AS label
     FROM google_seats gs
     JOIN members m ON m.id = gs.member_id
     JOIN campaigns c ON c.id = gs.campaign_id
     WHERE gs.sub = ?`,
  )
    .bind(sub)
    .all<{ campaign_id: string; member_id: string; label: string }>();
  return rows.results.map((r) => ({ campaignId: r.campaign_id, memberId: r.member_id, label: r.label }));
}

// ---------------------------------------------------------------------------
// Request plumbing

export interface Seat {
  data: CampaignData;
  member: Member;
}

/**
 * Resolve the bearer token to a seat at this campaign's table, with the
 * campaign loaded. Returns a Response (401/403/404) when the seat isn't real.
 */
export async function requireSeat(env: Env, request: Request, cid: string): Promise<Seat | Response> {
  const token = bearerToken(request);
  if (!token) return err(401, 'no token: join the campaign first');
  const rec = await getTokenRecord(env, token);
  if (!rec || rec.campaignId !== cid) return err(403, 'this token has no seat at this table');
  const data = await loadCampaignData(env, cid);
  if (!data) return err(404, 'no such campaign');
  const member = data.members.find((m) => m.id === rec.memberId);
  if (!member) return err(403, 'this token has no seat at this table');
  return { data, member };
}

export function bearerToken(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

export function requireOwner(seat: Seat): Response | null {
  return seat.member.role === 'owner' ? null : err(403, 'the world has one owner');
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Single-string route param (Pages gives string | string[]). */
export function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}
