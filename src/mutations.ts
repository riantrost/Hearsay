// The settled forks as pure functions over CampaignData — shared by the
// client Store and the Pages Functions API so both sides enforce the same
// rules: the testimony grace window, the marks brevity cap, participant-only
// slots, the pending-visibility rule. Mutations validate, mutate in place,
// and return the record they touched — the server persists exactly that
// record, which is what keeps concurrent writers from clobbering each other.

import type { CampaignData, Pin, SiteEvent, Testimony } from './model';
import { MARK_MAX_CHARS, MAX_TESTIMONY_CHARS } from './model';

export function newId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/**
 * The pending-visibility rule (proposal pattern, docs/decisions.md): a
 * pending member writes immediately, but their testimony is visible only to
 * its author and the owner until approval. An active author's testimony is
 * visible to the whole table.
 */
export function testimonyVisibleTo(data: CampaignData, t: Testimony, viewerId: string): boolean {
  const author = data.members.find((m) => m.id === t.memberId);
  if (author?.status !== 'pending') return true;
  if (viewerId === t.memberId) return true;
  const viewer = data.members.find((m) => m.id === viewerId);
  return viewer?.role === 'owner';
}

/**
 * The campaign as one viewer is allowed to see it — invisible testimony is
 * absent, not redacted, and because a mark lives on its testimony (markText),
 * stripping the entry withholds the mark too. This is what the API returns.
 */
export function visibleData(data: CampaignData, viewerId: string): CampaignData {
  return { ...data, testimony: data.testimony.filter((t) => testimonyVisibleTo(data, t, viewerId)) };
}

/**
 * Testimony closes on the table's clock (docs/decisions.md): an entry is
 * editable until the next session's first event lands on the campaign —
 * i.e. while no event exists with a session later than the entry's stamp.
 */
export function canEditTestimony(data: CampaignData, t: Testimony): boolean {
  return !data.events.some((e) => e.session > t.session);
}

// --- canon layer (owner acts) ---

export function addPin(data: CampaignData, x: number, y: number, name: string): Pin {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('a place needs a name');
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new Error('a pin lives on the map: coordinates are normalized [0,1]');
  const pin: Pin = { id: newId('p'), campaignId: data.campaign.id, x, y, name: trimmed };
  data.pins.push(pin);
  return pin;
}

export function addEvent(data: CampaignData, pinId: string, canonLine: string, participantIds?: string[]): SiteEvent {
  if (!data.pins.some((p) => p.id === pinId)) throw new Error('no such pin');
  const line = canonLine.trim();
  if (!line) throw new Error('an event needs its line of canon');
  const memberIds = new Set(data.members.map((m) => m.id));
  if (participantIds?.some((id) => !memberIds.has(id))) throw new Error('unknown participant');
  const event: SiteEvent = {
    id: newId('e'),
    pinId,
    session: data.campaign.currentSession,
    canonLine: line,
    // everyone at the table by default; the owner may also play
    participantIds: participantIds ?? data.members.map((m) => m.id),
  };
  data.events.push(event);
  return event;
}

export function advanceSession(data: CampaignData): number {
  data.campaign.currentSession += 1;
  return data.campaign.currentSession;
}

// --- testimony layer (player acts) ---

/**
 * Write or amend a slot. The entry is stamped with the session it was
 * written in (not the event's session) — a slot filled late shows up
 * late in the scrub, which is honest, and the stamp is what the grace
 * window closes against.
 */
export function writeTestimony(data: CampaignData, eventId: string, memberId: string, text: string): Testimony {
  const body = text.trim();
  if (!body) throw new Error('testimony needs words');
  if (body.length > MAX_TESTIMONY_CHARS) throw new Error(`testimony is an account, not a chronicle: ${MAX_TESTIMONY_CHARS} characters at most`);
  const existing = data.testimony.find((t) => t.eventId === eventId && t.memberId === memberId);
  if (existing) {
    if (!canEditTestimony(data, existing)) throw new Error('testimony is closed: the table has moved on');
    existing.text = body;
    return existing;
  }
  const event = data.events.find((e) => e.id === eventId);
  if (!event) throw new Error('no such event');
  if (!event.participantIds.includes(memberId)) throw new Error('not a participant in this event');
  const entry: Testimony = {
    id: newId('t'),
    eventId,
    memberId,
    session: data.campaign.currentSession,
    text: body,
  };
  data.testimony.push(entry);
  return entry;
}

/** Promote one line of your own testimony to a mark on the pin. */
export function promoteMark(data: CampaignData, testimonyId: string, memberId: string, text: string): Testimony {
  const t = data.testimony.find((x) => x.id === testimonyId);
  if (!t) throw new Error('no such testimony');
  if (t.memberId !== memberId) throw new Error('only the author can leave a mark');
  if (t.markText) throw new Error('a mark is already scrawled from this entry');
  const line = text.trim();
  if (!line) throw new Error('a mark needs words');
  if (line.length > MARK_MAX_CHARS) throw new Error(`a mark is graffiti, not a plaque: ${MARK_MAX_CHARS} characters at most`);
  t.markText = line;
  return t;
}
