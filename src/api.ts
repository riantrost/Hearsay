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
  const res = await fetch(`/api/campaigns/${encodeURIComponent(seat.campaignId)}`, {
    headers: { Authorization: `Bearer ${seat.token}` },
  }).then(expectOk);
  return (await res.json()) as CampaignData;
}

export async function postPin(seat: Seat, x: number, y: number, name: string): Promise<Pin> {
  return (await (await post(seat, '/pins', { x, y, name })).json()) as Pin;
}

export async function postEvent(seat: Seat, pinId: string, canonLine: string): Promise<SiteEvent> {
  return (await (await post(seat, '/events', { pinId, canonLine })).json()) as SiteEvent;
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

export async function postRotateCode(seat: Seat): Promise<string> {
  const body = (await (await post(seat, '/code', {})).json()) as { joinCode: string };
  return body.joinCode;
}
