// The write path's contracts: testimony closes on the table's clock, marks
// are brevity-capped and author-only, canon accretes by owner act.

import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store';
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
    const mark = store.promoteMark(entry.id, 'm2', 'beware the fen');
    expect(mark.pinId).toBe('p4');
  });

  it('only the author can scrawl, and only once per entry', () => {
    const event = store.addEvent('p4', 'skirmish');
    const entry = store.writeTestimony(event.id, 'm2', 'my account');
    expect(() => store.promoteMark(entry.id, 'm3', 'forged words')).toThrow(/author/);
    store.promoteMark(entry.id, 'm2', 'real words');
    expect(() => store.promoteMark(entry.id, 'm2', 'more words')).toThrow(/already/);
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
});
