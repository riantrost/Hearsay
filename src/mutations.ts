// The settled forks as pure functions over CampaignData — shared by the
// client Store and the Pages Functions API so both sides enforce the same
// rules: the testimony grace window, the marks brevity cap, participant-only
// slots, the pending-visibility rule. Mutations validate, mutate in place,
// and return the record they touched — the server persists exactly that
// record, which is what keeps concurrent writers from clobbering each other.

import type { Bounty, CampaignData, Member, Pin, SiteEvent, Testimony } from './model';
import {
  MARK_MAX_CHARS,
  MAX_ATMOSPHERE_CHARS,
  MAX_BOUNTY_REASON_CHARS,
  MAX_BOUNTY_TARGET_CHARS,
  MAX_TESTIMONY_CHARS,
} from './model';

export function newId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/** No-lookalike alphabet; six characters is plenty for a table-sized secret. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
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
 * stripping the entry withholds the mark too. Staged pins go further: for
 * anyone but the owner, the pin, its prepped events, and any testimony on
 * them simply don't exist — not even in the payload (fog is narrative
 * disclosure; a secret that ships in JSON isn't one). This is what the API
 * returns.
 */
export function visibleData(data: CampaignData, viewerId: string): CampaignData {
  const viewer = data.members.find((m) => m.id === viewerId);
  let { pins, events, bounties } = data;
  let testimony = data.testimony.filter((t) => testimonyVisibleTo(data, t, viewerId));
  if (viewer?.role !== 'owner') {
    const staged = new Set(pins.filter((p) => p.hidden).map((p) => p.id));
    const stagedEvents = new Set(events.filter((e) => staged.has(e.pinId)).map((e) => e.id));
    events = events.filter((e) => !stagedEvents.has(e.id));
    testimony = testimony.filter((t) => !stagedEvents.has(t.eventId));
    // "a site with no history has no page" holds on the wire, not just the
    // render: a staged pin (its events stripped above) and a ghost (named but
    // event-less — the owner's private scaffolding) both fall out here, so a
    // player's payload never carries a place they can't see, not even by name
    const hasEvent = new Set(events.map((e) => e.pinId));
    pins = pins.filter((p) => hasEvent.has(p.id));
    // a proposed bounty is the poster's and the owner's secret until the nail
    bounties = bounties.filter((b) => b.status !== 'proposed' || b.postedBy === viewerId);
  }
  return { ...data, pins, events, testimony, bounties };
}

/**
 * Testimony closes on the table's clock (docs/decisions.md): an entry is
 * editable until the next session's first event lands on the campaign —
 * i.e. while no event exists with a session later than the entry's stamp.
 */
export function canEditTestimony(data: CampaignData, t: Testimony): boolean {
  return !data.events.some((e) => e.session > t.session);
}

// --- membership layer (owner acts; the proposal pattern resolves) ---

/** Approval makes a pending member's posts visible to the table. Idempotent. */
export function approveMember(data: CampaignData, memberId: string): Member {
  const member = data.members.find((m) => m.id === memberId);
  if (!member) throw new Error('no such member');
  member.status = 'active';
  return member;
}

/**
 * Decline a pending membership: the proposal is refused, and the words that
 * were never table-visible leave with it. Active members can't be declined —
 * removing a seated player is a different act, and not a V1 one.
 */
export function declineMember(data: CampaignData, memberId: string): { member: Member; removedTestimonyIds: string[] } {
  const member = data.members.find((m) => m.id === memberId);
  if (!member) throw new Error('no such member');
  if (member.status !== 'pending') throw new Error('only a pending membership can be declined');
  data.members = data.members.filter((m) => m.id !== memberId);
  const removedTestimonyIds = data.testimony.filter((t) => t.memberId === memberId).map((t) => t.id);
  data.testimony = data.testimony.filter((t) => t.memberId !== memberId);
  return { member, removedTestimonyIds };
}

/** Mint a fresh join code; codes shared before the rotation stop working. */
export function rotateJoinCode(data: CampaignData): string {
  data.campaign.joinCode = newJoinCode();
  return data.campaign.joinCode;
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

export function addEvent(
  data: CampaignData,
  pinId: string,
  canonLine: string,
  participantIds?: string[],
  atmosphere?: string,
): SiteEvent {
  if (!data.pins.some((p) => p.id === pinId)) throw new Error('no such pin');
  const line = canonLine.trim();
  if (!line) throw new Error('an event needs its line of canon');
  const air = atmosphere?.trim();
  if (air && air.length > MAX_ATMOSPHERE_CHARS) {
    throw new Error(`atmosphere sets a scene, not a chapter: ${MAX_ATMOSPHERE_CHARS} characters at most`);
  }
  const memberIds = new Set(data.members.map((m) => m.id));
  if (participantIds?.some((id) => !memberIds.has(id))) throw new Error('unknown participant');
  const event: SiteEvent = {
    id: newId('e'),
    pinId,
    session: data.campaign.currentSession,
    canonLine: line,
    ...(air ? { atmosphere: air } : {}),
    // open to the whole table by default: an empty list is resolved live, so a
    // player who joins after this event drops still gets a slot (the common
    // first-night order — the owner seeds the world, then players arrive). A
    // non-empty list is an owner-scoped subset (deferred; nothing writes one).
    participantIds: participantIds ?? [],
  };
  data.events.push(event);
  return event;
}

/**
 * Who holds a testimony slot on an event. An empty `participantIds` means the
 * event is open to the whole table — resolved live against the current roster,
 * never frozen to the snapshot at drop time, so latecomers are never locked
 * out. A non-empty list is honored as an owner-scoped subset (the scoping
 * feature is deferred, so today this always resolves to the whole table).
 */
export function eventParticipants(data: CampaignData, event: SiteEvent): string[] {
  return event.participantIds.length > 0 ? event.participantIds : data.members.map((m) => m.id);
}

/**
 * Stage or unstage a pin. Toggling is free only while the place has no
 * events: once history exists, the table (or the owner's prep) has memory
 * here, and the only door out of staging is a reveal — which leaves a
 * timeline record instead of quietly rewriting who could see what when.
 */
export function setPinHidden(data: CampaignData, pinId: string, hidden: boolean): Pin {
  const pin = data.pins.find((p) => p.id === pinId);
  if (!pin) throw new Error('no such pin');
  if (data.events.some((e) => e.pinId === pinId)) {
    throw new Error(hidden ? 'this place already has history — the table remembers it' : 'a staged place with history returns only by reveal');
  }
  if (hidden) pin.hidden = true;
  else delete pin.hidden;
  return pin;
}

/**
 * Reveal a staged pin: the reveal is itself a timeline event
 * (docs/decisions.md, fog) — the pin joins the table's map at the current
 * session, stamped so the scrubber replays its arrival, and the canon line
 * says what the table now knows.
 */
export function revealPin(data: CampaignData, pinId: string, canonLine: string, atmosphere?: string): { pin: Pin; event: SiteEvent } {
  const pin = data.pins.find((p) => p.id === pinId);
  if (!pin) throw new Error('no such pin');
  if (!pin.hidden) throw new Error('this place is not staged');
  const event = addEvent(data, pinId, canonLine, undefined, atmosphere);
  delete pin.hidden;
  pin.hiddenUntilSession = data.campaign.currentSession;
  return { pin, event };
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
  if (!eventParticipants(data, event).includes(memberId)) throw new Error('not a participant in this event');
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

// --- the bounty board (players propose revenge; the owner nails it up) ---

/**
 * Post a bounty proposal. Any member may post — pending members included,
 * since the owner's ratification is the only gate that matters — and it
 * stays visible only to poster and owner until approved. The target is free
 * text (a rival, an NPC, the thing under the fen); any reward lives in the
 * words. The app never models currency or resolution — that's the table's.
 */
export function postBounty(data: CampaignData, memberId: string, target: string, reason: string): Bounty {
  if (!data.members.some((m) => m.id === memberId)) throw new Error('no such member');
  const quarry = target.trim();
  const words = reason.trim();
  if (!quarry) throw new Error('a bounty needs its quarry');
  if (quarry.length > MAX_BOUNTY_TARGET_CHARS) throw new Error(`name the quarry, not their history: ${MAX_BOUNTY_TARGET_CHARS} characters at most`);
  if (!words) throw new Error('a bounty needs a grievance');
  if (words.length > MAX_BOUNTY_REASON_CHARS) throw new Error(`a bounty is a poster, not a saga: ${MAX_BOUNTY_REASON_CHARS} characters at most`);
  const bounty: Bounty = {
    id: newId('b'),
    campaignId: data.campaign.id,
    postedBy: memberId,
    target: quarry,
    reason: words,
    session: data.campaign.currentSession,
    status: 'proposed',
  };
  data.bounties.push(bounty);
  return bounty;
}

/** The owner nails a proposed bounty to the board — the table can read it now. */
export function approveBounty(data: CampaignData, bountyId: string): Bounty {
  const bounty = data.bounties.find((b) => b.id === bountyId);
  if (!bounty) throw new Error('no such bounty');
  if (bounty.status !== 'proposed') throw new Error('this bounty is already on the board');
  bounty.status = 'posted';
  return bounty;
}

/** The owner refuses a proposal; paper that never reached the board just goes. */
export function declineBounty(data: CampaignData, bountyId: string): Bounty {
  const bounty = data.bounties.find((b) => b.id === bountyId);
  if (!bounty) throw new Error('no such bounty');
  if (bounty.status !== 'proposed') throw new Error('only a proposed bounty can be declined');
  data.bounties = data.bounties.filter((b) => b.id !== bountyId);
  return bounty;
}

/**
 * The owner strikes a posted bounty settled — crossed out at the current
 * session, never erased. How it was settled is testimony's business; the
 * board only remembers that it was.
 */
export function strikeBounty(data: CampaignData, bountyId: string): Bounty {
  const bounty = data.bounties.find((b) => b.id === bountyId);
  if (!bounty) throw new Error('no such bounty');
  if (bounty.status !== 'posted') throw new Error('only a posted bounty can be struck');
  bounty.status = 'struck';
  bounty.struckSession = data.campaign.currentSession;
  return bounty;
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
