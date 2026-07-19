// Shared plumbing for the Pages Functions API. Storage is one KV record per
// entity under a campaign prefix (`c:{cid}:…`) — writes touch only the record
// they change, so two players testifying at once can't clobber each other.
// Identity is table-cheap: a bearer token minted at create/join maps straight
// to a member; no accounts, no passwords, recoverable by re-invite.

import type { Campaign, CampaignData, Member, Pin, SiteEvent, Testimony } from '../src/model';

export interface Env {
  HEARSAY: KVNamespace;
  MAPS: R2Bucket;
}

// Lawrence's Northmarch jpg is ~8 MB; anything past this isn't a table map
export const MAX_MAP_BYTES = 20 * 1024 * 1024;

export const err = (status: number, msg: string) => new Response(msg, { status });

/** Mutation-layer errors carry their meaning in the message; map to status. */
export function mutationError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith('no such')) return err(404, msg);
  if (msg.startsWith('testimony is closed')) return err(409, msg);
  return err(400, msg);
}

export const campaignKey = (cid: string) => `c:${cid}:campaign`;
export const memberKey = (cid: string, id: string) => `c:${cid}:m:${id}`;
export const pinKey = (cid: string, id: string) => `c:${cid}:p:${id}`;
export const eventKey = (cid: string, id: string) => `c:${cid}:e:${id}`;
export const testimonyKey = (cid: string, id: string) => `c:${cid}:t:${id}`;
export const tokenKey = (token: string) => `tok:${token}`;
export const codeKey = (code: string) => `code:${code.toUpperCase()}`;

export interface TokenRecord {
  campaignId: string;
  memberId: string;
}

export async function putRecord(env: Env, key: string, record: unknown): Promise<void> {
  await env.HEARSAY.put(key, JSON.stringify(record));
}

/** One list over the campaign prefix, values bulk-read in chunks of 100. */
export async function loadCampaignData(env: Env, cid: string): Promise<CampaignData | null> {
  const prefix = `c:${cid}:`;
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.HEARSAY.list({ prefix, cursor });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const values = new Map<string, unknown>();
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const got = (await env.HEARSAY.get(chunk, 'json')) as Map<string, unknown>;
    for (const [k, v] of got) values.set(k, v);
  }

  let campaign: Campaign | null = null;
  const members: Member[] = [];
  const pins: Pin[] = [];
  const events: SiteEvent[] = [];
  const testimony: Testimony[] = [];
  for (const [name, value] of values) {
    if (value == null) continue;
    const kind = name.slice(prefix.length).split(':')[0];
    if (kind === 'campaign') campaign = value as Campaign;
    else if (kind === 'm') members.push(value as Member);
    else if (kind === 'p') pins.push(value as Pin);
    else if (kind === 'e') events.push(value as SiteEvent);
    else if (kind === 't') testimony.push(value as Testimony);
  }
  if (!campaign) return null;
  return { campaign, members, pins, events, testimony };
}

/**
 * KV `list` lags writes (eventual consistency, up to ~a minute): a record
 * written moments ago can be missing from the assembled campaign even for
 * the writer. Before a mutation refuses "no such X" over a specific record,
 * ask KV for it directly — `get` reads your own writes where they were
 * written, which is exactly the create-then-immediately-use case.
 */
export async function ensureRecord<T extends { id: string }>(env: Env, list: T[], id: string, key: string): Promise<void> {
  if (list.some((r) => r.id === id)) return;
  const rec = await env.HEARSAY.get<T>(key, 'json');
  if (rec) list.push(rec);
}

export interface Seat {
  data: CampaignData;
  member: Member;
}

/**
 * Resolve the bearer token to a seat at this campaign's table, with the
 * campaign loaded. Returns a Response (401/403/404) when the seat isn't real.
 */
export async function requireSeat(env: Env, request: Request, cid: string): Promise<Seat | Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return err(401, 'no token: join the campaign first');
  const rec = await env.HEARSAY.get<TokenRecord>(tokenKey(token), 'json');
  if (!rec || rec.campaignId !== cid) return err(403, 'this token has no seat at this table');
  const data = await loadCampaignData(env, cid);
  if (!data) return err(404, 'no such campaign');
  const member = data.members.find((m) => m.id === rec.memberId);
  if (!member) return err(403, 'this token has no seat at this table');
  return { data, member };
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
