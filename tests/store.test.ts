// The write path's contracts: testimony closes on the table's clock, marks
// are brevity-capped and author-only, and a pending member's words are
// visible only to themselves and the owner.

import { beforeEach, describe, expect, it } from 'vitest';
import { Store, testimonyVisibleTo } from '../src/store';
import { visibleData } from '../src/mutations';
import { seed } from '../src/data/seed';
import { MARK_MAX_CHARS } from '../src/model';

let store: Store;

beforeEach(() => {
  store = new Store(seed);
  store.reset(seed);
});

describe('the grace window (testimony closes on the table\'s clock)', () => {
  it('keeps a fresh entry editable while no later-session event exists', () => {
    const event = store.addEvent('p4', 'a skirmish at the fen edge');
    const entry = store.writeTestimony(event.id, 'm2', 'first draft');
    expect(store.canEdit(entry)).toBe(true);
    store.writeTestimony(event.id, 'm2', 'second thoughts');
    expect(store.data.testimony.find((t) => t.id === entry.id)?.text).toBe('second thoughts');
  });

  it('closes the entry when the next session\'s first event lands', () => {
    const event = store.addEvent('p4', 'a skirmish at the fen edge');
    const entry = store.writeTestimony(event.id, 'm2', 'what I saw');
    store.advanceSession();
    expect(store.canEdit(entry)).toBe(true); // advancing alone closes nothing
    store.addEvent('p1', 'the next session begins at the keep');
    expect(store.canEdit(entry)).toBe(false);
    expect(() => store.writeTestimony(event.id, 'm2', 'revisionism')).toThrow(/closed/);
  });

  it('stamps a late-filled slot with the session it was written in', () => {
    // e1 happened in session 1; Ossian never wrote for e2 (session 3)
    const entry = store.writeTestimony('e2', 'm3', 'better late');
    expect(entry.session).toBe(store.data.campaign.currentSession);
  });
});

describe('marks', () => {
  it('enforces the brevity cap — graffiti, not a plaque', () => {
    const event = store.addEvent('p4', 'skirmish');
    const entry = store.writeTestimony(event.id, 'm2', 'a long account of the day');
    expect(() => store.promoteMark(entry.id, 'm2', 'x'.repeat(MARK_MAX_CHARS + 1))).toThrow(/plaque/);
    const marked = store.promoteMark(entry.id, 'm2', 'beware the fen');
    expect(marked.markText).toBe('beware the fen');
  });

  it('only the author can scrawl, and only once per entry', () => {
    const event = store.addEvent('p4', 'skirmish');
    const entry = store.writeTestimony(event.id, 'm2', 'my account');
    expect(() => store.promoteMark(entry.id, 'm3', 'forged words')).toThrow(/author/);
    store.promoteMark(entry.id, 'm2', 'real words');
    expect(() => store.promoteMark(entry.id, 'm2', 'more words')).toThrow(/already/);
  });
});

describe('the pending-visibility rule (membership follows the proposal pattern)', () => {
  // seed: Thistle (m4) is pending and wrote t5; Rian (m1) owns the table

  it('shows a pending member\'s testimony only to its author and the owner', () => {
    const t5 = store.data.testimony.find((t) => t.id === 't5')!;
    expect(testimonyVisibleTo(store.data, t5, 'm4')).toBe(true); // author
    expect(testimonyVisibleTo(store.data, t5, 'm1')).toBe(true); // owner
    expect(testimonyVisibleTo(store.data, t5, 'm2')).toBe(false); // the table waits
    expect(store.canSee(t5, 'm3')).toBe(false);
  });

  it('shows an active member\'s testimony to the whole table', () => {
    const t1 = store.data.testimony.find((t) => t.id === 't1')!;
    for (const m of store.data.members) {
      expect(testimonyVisibleTo(store.data, t1, m.id)).toBe(true);
    }
  });

  it('strips invisible testimony from the API view — absent, not redacted, marks included', () => {
    // visibleData is what GET /api/campaigns/:id returns for a seat
    const forVex = visibleData(store.data, 'm2');
    expect(forVex.testimony.some((t) => t.id === 't5')).toBe(false);
    const forOwner = visibleData(store.data, 'm1');
    expect(forOwner.testimony.some((t) => t.id === 't5')).toBe(true);
  });

  it('lets a pending member write immediately, and approval reveals their words', () => {
    const entry = store.writeTestimony('e4', 'm4', 'amended from the reeds');
    expect(testimonyVisibleTo(store.data, entry, 'm2')).toBe(false);
    store.data.members.find((m) => m.id === 'm4')!.status = 'active';
    expect(testimonyVisibleTo(store.data, entry, 'm2')).toBe(true);
  });
});

describe('canon acts', () => {
  it('drops pins with normalized coordinates and stamps events with the current session', () => {
    const pin = store.addPin(0.5, 0.5, 'The Crossroads');
    const event = store.addEvent(pin.id, 'first blood at the crossroads');
    expect(event.session).toBe(store.data.campaign.currentSession);
    expect(event.participantIds).toEqual(store.data.members.map((m) => m.id));
  });

  it('only participants can testify', () => {
    const event = store.addEvent('p4', 'a private duel', ['m2']);
    expect(() => store.writeTestimony(event.id, 'm3', 'I was not there')).toThrow(/participant/);
  });

  it('refuses canon aimed at nothing — no event without a pin, no unknown participants', () => {
    // the server runs the same mutation layer, so these are its 4xx responses
    expect(() => store.addEvent('p999', 'a rumor with no place')).toThrow(/no such pin/);
    expect(() => store.addEvent('p4', 'a duel of strangers', ['m999'])).toThrow(/unknown participant/);
  });
});
