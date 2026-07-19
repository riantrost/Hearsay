// Client for the Pages Functions API (Fragments' contrib/db.ts pattern).
// Thin fetch wrappers: the rules live in the shared mutation layer and are
// enforced server-side; this file only moves requests and surfaces the
// server's refusals as thrown errors, message intact.

import type { Campaign, CampaignData, Member, Pin, SiteEvent, Testimony } from './model';
import type { Seat } from './seat';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) throw new ApiError(res.status, (await res.text()) || `request failed (${res.status})`);
  return res;
}

function post(seat: Seat, path: string, body: unknown): Promise<Response> {
  return fetch(`/api/campaigns/${encodeURIComponent(seat.campaignId)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${seat.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(expectOk);
}

export async function createCampaign(fields: {
  name: string;
  ownerName: string;
  map: File;
  mapW: number;
  mapH: number;
}): Promise<{ campaign: Campaign; member: Member; token: string }> {
  const form = new FormData();
  form.set('name', fields.name);
  form.set('ownerName', fields.ownerName);
  form.set('map', fields.map);
  form.set('mapW', String(fields.mapW));
  form.set('mapH', String(fields.mapH));
  const res = await fetch('/api/campaigns', { method: 'POST', body: form }).then(expectOk);
  return (await res.json()) as { campaign: Campaign; member: Member; token: string };
}

export async function joinCampaign(code: string, name: string): Promise<{ campaignId: string; member: Member; token: string }> {
  const res = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  }).then(expectOk);
  return (await res.json()) as { campaignId: string; member: Member; token: string };
}

/** The campaign as your seat is allowed to see it — the server strips the rest. */
export async function fetchCampaign(seat: Seat): Promise<CampaignData> {
  // network-first is the whole point: no HTTP cache between the table and now
  const res = await fetch(`/api/campaigns/${encodeURIComponent(seat.campaignId)}`, {
    headers: { Authorization: `Bearer ${seat.token}` },
    cache: 'no-store',
  }).then(expectOk);
  return (await res.json()) as CampaignData;
}

export async function postPin(seat: Seat, x: number, y: number, name: string): Promise<Pin> {
  return (await (await post(seat, '/pins', { x, y, name })).json()) as Pin;
}

export async function postPinHidden(seat: Seat, pinId: string, hidden: boolean): Promise<Pin> {
  return (await (await post(seat, `/pins/${encodeURIComponent(pinId)}`, { action: hidden ? 'hide' : 'unhide' })).json()) as Pin;
}

export async function postPinReveal(seat: Seat, pinId: string, canonLine: string, atmosphere?: string): Promise<{ pin: Pin; event: SiteEvent }> {
  return (await (await post(seat, `/pins/${encodeURIComponent(pinId)}`, { action: 'reveal', canonLine, atmosphere })).json()) as {
    pin: Pin;
    event: SiteEvent;
  };
}

export async function postEvent(seat: Seat, pinId: string, canonLine: string, atmosphere?: string): Promise<SiteEvent> {
  return (await (await post(seat, '/events', { pinId, canonLine, atmosphere })).json()) as SiteEvent;
}

export async function postSession(seat: Seat): Promise<number> {
  const body = (await (await post(seat, '/session', {})).json()) as { currentSession: number };
  return body.currentSession;
}

export async function postTestimony(seat: Seat, eventId: string, text: string): Promise<Testimony> {
  return (await (await post(seat, '/testimony', { eventId, text })).json()) as Testimony;
}

export async function postMark(seat: Seat, testimonyId: string, text: string): Promise<Testimony> {
  return (await (await post(seat, '/marks', { testimonyId, text })).json()) as Testimony;
}

export async function postMemberAction(seat: Seat, memberId: string, action: 'approve' | 'decline'): Promise<void> {
  await post(seat, `/members/${encodeURIComponent(memberId)}`, { action });
}

// --- the Google recovery thread (docs/decisions.md: a thread, never a wall) ---

/** Whether this deployment has the recovery thread configured at all. */
export async function fetchAuthConfig(): Promise<{ google: boolean }> {
  const res = await fetch('/api/auth/config').then(expectOk);
  return (await res.json()) as { google: boolean };
}

/** Tie the seat you're sitting in to the Google account you just signed in as. */
export async function postGoogleLink(seat: Seat, gsession: string): Promise<{ email: string }> {
  const res = await fetch('/api/auth/link', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seat.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gsession }),
  }).then(expectOk);
  return (await res.json()) as { email: string };
}

/** Fresh tokens for every seat linked to the signed-in Google account. */
export async function postGoogleRecover(gsession: string): Promise<{ email: string; seats: Seat[] }> {
  const res = await fetch('/api/auth/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gsession }),
  }).then(expectOk);
  return (await res.json()) as { email: string; seats: Seat[] };
}

/** Mint a fresh token for an existing member — the reclaim link's server half. */
export async function postReclaim(seat: Seat, memberId: string): Promise<Seat> {
  const body = (await (await post(seat, `/members/${encodeURIComponent(memberId)}`, { action: 'reclaim' })).json()) as {
    campaignId: string;
    memberId: string;
    token: string;
  };
  return body;
}

export async function postRotateCode(seat: Seat): Promise<string> {
  const body = (await (await post(seat, '/code', {})).json()) as { joinCode: string };
  return body.joinCode;
}
