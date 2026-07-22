// The rule layer's contracts, tested where they live (src/mutations.ts) —
// the same functions run client-side in the ApiStore and server-side in the
// Pages Functions, so these tests pin both at once: testimony closes on the
// table's clock, marks are brevity-capped and author-only, membership
// follows the proposal pattern.

import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../src/data/seed';
import { MARK_MAX_CHARS, MAX_ATMOSPHERE_CHARS, type CampaignData } from '../src/model';
import {
  addEvent,
  addPin,
  advanceSession,
  approveMember,
  canEditTestimony,
  declineMember,
  eventParticipants,
  promoteMark,
  revealPin,
  rotateJoinCode,
  setPinHidden,
  testimonyVisibleTo,
  visibleData,
  writeTestimony,
} from '../src/mutations';

/** A late join, as the server mints it: a fresh pending member appended to the roster. */
function seatLatecomer(data: CampaignData, name: string): string {
  const id = `m${name.toLowerCase()}`;
  data.members.push({ id, campaignId: data.campaign.id, name, role: 'player', status: 'pending' });
  return id;
}

let data: CampaignData;

beforeEach(() => {
  data = structuredClone(seed);
});

describe('the grace window (testimony closes on the table\'s clock)', () => {
  it('keeps a fresh entry editable while no later-session event exists', () => {
    const event = addEvent(data, 'p4', 'a skirmish at the fen edge');
    const entry = writeTestimony(data, event.id, 'm2', 'first draft');
    expect(canEditTestimony(data, entry)).toBe(true);
    writeTestimony(data, event.id, 'm2', 'second thoughts');
    expect(data.testimony.find((t) => t.id === entry.id)?.text).toBe('second thoughts');
  });

  it('closes the entry when the next session\'s first event lands', () => {
    const event = addEvent(data, 'p4', 'a skirmish at the fen edge');
    const entry = writeTestimony(data, event.id, 'm2', 'what I saw');
    advanceSession(data);
    expect(canEditTestimony(data, entry)).toBe(true); // advancing alone closes nothing
    addEvent(data, 'p1', 'the next session begins at the keep');
    expect(canEditTestimony(data, entry)).toBe(false);
    expect(() => writeTestimony(data, event.id, 'm2', 'revisionism')).toThrow(/closed/);
  });

  it('stamps a late-filled slot with the session it was written in', () => {
    // e1 happened in session 1; Ossian never wrote for e2 (session 3)
    const entry = writeTestimony(data, 'e2', 'm3', 'better late');
    expect(entry.session).toBe(data.campaign.currentSession);
  });
});

describe('marks', () => {
  it('enforces the brevity cap — graffiti, not a plaque', () => {
    const event = addEvent(data, 'p4', 'skirmish');
    const entry = writeTestimony(data, event.id, 'm2', 'a long account of the day');
    expect(() => promoteMark(data, entry.id, 'm2', 'x'.repeat(MARK_MAX_CHARS + 1))).toThrow(/plaque/);
    const marked = promoteMark(data, entry.id, 'm2', 'beware the fen');
    expect(marked.markText).toBe('beware the fen');
  });

  it('only the author can scrawl, and only once per entry', () => {
    const event = addEvent(data, 'p4', 'skirmish');
    const entry = writeTestimony(data, event.id, 'm2', 'my account');
    expect(() => promoteMark(data, entry.id, 'm3', 'forged words')).toThrow(/author/);
    promoteMark(data, entry.id, 'm2', 'real words');
    expect(() => promoteMark(data, entry.id, 'm2', 'more words')).toThrow(/already/);
  });
});

describe('the pending-visibility rule (membership follows the proposal pattern)', () => {
  // seed: Thistle (m4) is pending and wrote t5; Rian (m1) owns the table

  it('shows a pending member\'s testimony only to its author and the owner', () => {
    const t5 = data.testimony.find((t) => t.id === 't5')!;
    expect(testimonyVisibleTo(data, t5, 'm4')).toBe(true); // author
    expect(testimonyVisibleTo(data, t5, 'm1')).toBe(true); // owner
    expect(testimonyVisibleTo(data, t5, 'm2')).toBe(false); // the table waits
    expect(testimonyVisibleTo(data, t5, 'm3')).toBe(false);
  });

  it('shows an active member\'s testimony to the whole table', () => {
    const t1 = data.testimony.find((t) => t.id === 't1')!;
    for (const m of data.members) {
      expect(testimonyVisibleTo(data, t1, m.id)).toBe(true);
    }
  });

  it('strips invisible testimony from the API view — absent, not redacted, marks included', () => {
    // visibleData is what GET /api/campaigns/:id returns for a seat
    const forVex = visibleData(data, 'm2');
    expect(forVex.testimony.some((t) => t.id === 't5')).toBe(false);
    const forOwner = visibleData(data, 'm1');
    expect(forOwner.testimony.some((t) => t.id === 't5')).toBe(true);
  });

  it('lets a pending member write immediately, and approval reveals their words', () => {
    const entry = writeTestimony(data, 'e4', 'm4', 'amended from the reeds');
    expect(testimonyVisibleTo(data, entry, 'm2')).toBe(false);
    approveMember(data, 'm4');
    expect(testimonyVisibleTo(data, entry, 'm2')).toBe(true);
  });
});

describe('membership acts (owner resolves the proposal)', () => {
  it('decline removes the seat and the words that were never table-visible', () => {
    const { member, removedTestimonyIds } = declineMember(data, 'm4');
    expect(member.name).toBe('Thistle');
    expect(removedTestimonyIds).toEqual(['t5']);
    expect(data.members.some((m) => m.id === 'm4')).toBe(false);
    expect(data.testimony.some((t) => t.memberId === 'm4')).toBe(false);
  });

  it('refuses to decline an active member — that is a different act', () => {
    expect(() => declineMember(data, 'm2')).toThrow(/pending/);
    expect(() => declineMember(data, 'm999')).toThrow(/no such member/);
  });

  it('rotates the join code to a fresh six-character secret', () => {
    const before = data.campaign.joinCode;
    const code = rotateJoinCode(data);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code).not.toBe(before);
    expect(data.campaign.joinCode).toBe(code);
  });
});

describe('canon acts', () => {
  it('drops pins with normalized coordinates and stamps events with the current session', () => {
    const pin = addPin(data, 0.5, 0.5, 'The Crossroads');
    const event = addEvent(data, pin.id, 'first blood at the crossroads');
    expect(event.session).toBe(data.campaign.currentSession);
    // an open-table event stores no roster snapshot; the whole table resolves live
    expect(event.participantIds).toEqual([]);
    expect(eventParticipants(data, event)).toEqual(data.members.map((m) => m.id));
  });

  it('opens an event to a member who joins after it dropped (the late-joiner fix)', () => {
    // the common first-night order: the owner seeds the world, then a player arrives
    const pin = addPin(data, 0.4, 0.4, 'The Tollgate');
    const event = addEvent(data, pin.id, 'the crews forced the gate');
    const late = seatLatecomer(data, 'Latecomer');
    expect(eventParticipants(data, event)).toContain(late);
    const entry = writeTestimony(data, event.id, late, 'I reached the gate late, but I was there');
    expect(entry.memberId).toBe(late);
  });

  it('honors an explicit participant subset as owner-scoped — latecomers stay out', () => {
    const event = addEvent(data, 'p4', 'a private duel', ['m2']);
    expect(() => writeTestimony(data, event.id, 'm3', 'I was not there')).toThrow(/participant/);
    const late = seatLatecomer(data, 'Bystander');
    expect(eventParticipants(data, event)).toEqual(['m2']);
    expect(() => writeTestimony(data, event.id, late, 'let me in')).toThrow(/participant/);
  });

  it('refuses canon aimed at nothing — no event without a pin, no unknown participants', () => {
    // the server runs the same mutation layer, so these are its 4xx responses
    expect(() => addEvent(data, 'p999', 'a rumor with no place')).toThrow(/no such pin/);
    expect(() => addEvent(data, 'p4', 'a duel of strangers', ['m999'])).toThrow(/unknown participant/);
  });
});

describe('atmosphere (headline canon plus optional prose)', () => {
  it('stores trimmed atmosphere on the event when given', () => {
    const event = addEvent(data, 'p4', 'a skirmish at the fen edge', undefined, '  mist over the reeds, and something breathing in it  ');
    expect(event.atmosphere).toBe('mist over the reeds, and something breathing in it');
  });

  it('leaves the field absent when omitted or blank', () => {
    expect(addEvent(data, 'p4', 'plain record').atmosphere).toBeUndefined();
    expect(addEvent(data, 'p4', 'blank air', undefined, '   ').atmosphere).toBeUndefined();
  });

  it('caps atmosphere — a scene, not a chapter', () => {
    expect(() => addEvent(data, 'p4', 'line', undefined, 'x'.repeat(MAX_ATMOSPHERE_CHARS + 1))).toThrow(/chapter/);
  });

  it('a reveal carries atmosphere onto its timeline event', () => {
    const pin = addPin(data, 0.5, 0.5, 'the drowned chapel');
    setPinHidden(data, pin.id, true);
    const { event } = revealPin(data, pin.id, 'the chapel surfaces from the fen', 'candles that never went out');
    expect(event.atmosphere).toBe('candles that never went out');
  });
});
