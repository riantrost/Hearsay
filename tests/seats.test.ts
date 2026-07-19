// The seat book (docs/decisions.md, "The seat stays account-free, but it is
// portable and reclaimable"): one browser holds many chairs, the old single
// key migrates, and a reclaim link is a whole seat that survives a round trip
// through a URL fragment.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodeSeatLink,
  loadActiveSeat,
  loadSeats,
  parseGauth,
  parseSeatLink,
  rememberSeatGoogle,
  rememberSeatLabel,
  removeSeat,
  saveSeat,
  setActiveCampaign,
  takeGoogleMode,
  type Seat,
} from '../src/seat';

// node has no localStorage; a Map-backed stand-in is all the seat book needs
function stubLocalStorage(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const seatA: Seat = { campaignId: 'cA', memberId: 'mA', token: 'tokA', label: 'Northmarch' };
const seatB: Seat = { campaignId: 'cB', memberId: 'mB', token: 'tokB', label: 'Frostgrave' };

beforeEach(() => stubLocalStorage());
afterEach(() => localStorage.clear());

describe('the seat book holds many chairs', () => {
  it('starts empty', () => {
    expect(loadSeats()).toEqual([]);
    expect(loadActiveSeat()).toBeNull();
  });

  it('saving a second seat keeps the first and makes the newest active', () => {
    saveSeat(seatA);
    saveSeat(seatB);
    expect(loadSeats().map((s) => s.campaignId).sort()).toEqual(['cA', 'cB']);
    expect(loadActiveSeat()?.campaignId).toBe('cB');
  });

  it('re-saving a campaign replaces its seat rather than duplicating it', () => {
    saveSeat(seatA);
    saveSeat({ ...seatA, token: 'rotated' });
    expect(loadSeats()).toHaveLength(1);
    expect(loadActiveSeat()?.token).toBe('rotated');
  });

  it('a token-only re-save preserves the cached label', () => {
    saveSeat(seatA);
    saveSeat({ campaignId: 'cA', memberId: 'mA', token: 'fresh' }); // no label (a reclaim seat)
    expect(loadActiveSeat()?.label).toBe('Northmarch');
  });

  it('switches the active table without minting', () => {
    saveSeat(seatA);
    saveSeat(seatB);
    setActiveCampaign('cA');
    expect(loadActiveSeat()?.campaignId).toBe('cA');
  });

  it('rememberSeatLabel fills a joined table\'s name in after boot', () => {
    saveSeat({ campaignId: 'cB', memberId: 'mB', token: 'tokB' }); // joined: no name yet
    rememberSeatLabel('cB', 'Frostgrave');
    expect(loadSeats().find((s) => s.campaignId === 'cB')?.label).toBe('Frostgrave');
  });
});

describe('removing a seat', () => {
  it('drops the chair and clears active when it was the active one', () => {
    saveSeat(seatA);
    saveSeat(seatB); // active is cB
    removeSeat('cB');
    expect(loadSeats().map((s) => s.campaignId)).toEqual(['cA']);
    expect(loadActiveSeat()).toBeNull(); // the front door decides what's next
  });

  it('leaves the active pointer alone when a different table is removed', () => {
    saveSeat(seatA);
    saveSeat(seatB); // active is cB
    removeSeat('cA');
    expect(loadActiveSeat()?.campaignId).toBe('cB');
  });
});

describe('migration from the pre-multi-table single key', () => {
  it('adopts a legacy hearsay-seat into the book and removes it', () => {
    localStorage.setItem('hearsay-seat', JSON.stringify(seatA));
    expect(loadActiveSeat()?.campaignId).toBe('cA');
    expect(loadSeats()).toHaveLength(1);
    expect(localStorage.getItem('hearsay-seat')).toBeNull();
  });
});

describe('the Google recovery thread\'s client half', () => {
  it('parses the callback\'s #gauth fragment and nothing else', () => {
    expect(parseGauth('#gauth=abc-123')).toBe('abc-123');
    expect(parseGauth('#seat=xyz')).toBeNull();
    expect(parseGauth('')).toBeNull();
  });

  it('takeGoogleMode reads once and clears', () => {
    const store = new Map<string, string>();
    globalThis.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    sessionStorage.setItem('hearsay-google-mode', 'link');
    expect(takeGoogleMode()).toBe('link');
    expect(takeGoogleMode()).toBeNull(); // spent
    sessionStorage.setItem('hearsay-google-mode', 'garbage');
    expect(takeGoogleMode()).toBeNull(); // unknown modes read as nothing
  });

  it('rememberSeatGoogle caches the backed-up address on the right seat', () => {
    saveSeat(seatA);
    saveSeat(seatB);
    rememberSeatGoogle('cA', 'rian@example.com');
    expect(loadSeats().find((s) => s.campaignId === 'cA')?.google).toBe('rian@example.com');
    expect(loadSeats().find((s) => s.campaignId === 'cB')?.google).toBeUndefined();
  });
});

describe('reclaim links round-trip a whole seat', () => {
  it('encodes to a #seat= URL and parses back', () => {
    const url = encodeSeatLink(seatB, 'https://hearsay-preview.pages.dev');
    expect(url).toContain('#seat=');
    const parsed = parseSeatLink(new URL(url).hash);
    expect(parsed).toEqual(seatB);
  });

  it('ignores a hash that isn\'t a seat link', () => {
    expect(parseSeatLink('#scrubber=3')).toBeNull();
    expect(parseSeatLink('')).toBeNull();
    expect(parseSeatLink('#seat=not-valid-base64!!')).toBeNull();
  });
});
