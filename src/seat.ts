// Your seat at a table: campaign + member + bearer token, minted at create
// or join and held in localStorage. Identity is table-cheap by design — no
// accounts, no passwords; a lost seat is recoverable by owner re-invite or a
// reclaim link.
//
// The server was always multi-campaign (a token maps to one seat; nothing
// ties a human to one table), but the client used to store exactly one seat,
// so joining a second table overwrote the first. Seats now live in a keyed
// book with an active pointer, so one browser can hold a chair at many tables.

export interface Seat {
  campaignId: string;
  memberId: string;
  token: string;
  /** Campaign name, cached for the "your tables" picker. Cosmetic — never sent. */
  label?: string;
  /** Google address this seat is backed up to, cached for display. Never sent. */
  google?: string;
}

interface SeatBook {
  activeId: string | null;
  seats: Seat[];
}

const KEY = 'hearsay-seats-v1';
/** The pre-multi-table single-seat key, migrated on first read. */
const LEGACY_KEY = 'hearsay-seat';

function isSeat(v: unknown): v is Seat {
  const s = v as Seat;
  return !!s && typeof s.campaignId === 'string' && typeof s.memberId === 'string' && typeof s.token === 'string';
}

function readBook(): SeatBook {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const book = JSON.parse(raw) as SeatBook;
      const seats = Array.isArray(book.seats) ? book.seats.filter(isSeat) : [];
      // a dangling active pointer (its seat removed) falls back to no active —
      // the front door then offers the remaining tables, rather than silently
      // dropping the reader into some other campaign
      const activeId = seats.some((s) => s.campaignId === book.activeId) ? book.activeId : null;
      return { activeId, seats };
    } catch {
      // fall through to a fresh book
    }
  }
  // migrate the legacy single seat, if any
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const seat = JSON.parse(legacy) as Seat;
      if (isSeat(seat)) {
        const book: SeatBook = { activeId: seat.campaignId, seats: [seat] };
        writeBook(book);
        localStorage.removeItem(LEGACY_KEY);
        return book;
      }
    } catch {
      // ignore a corrupt legacy value
    }
    localStorage.removeItem(LEGACY_KEY);
  }
  return { activeId: null, seats: [] };
}

function writeBook(book: SeatBook): void {
  localStorage.setItem(KEY, JSON.stringify(book));
}

/** Every seat this browser holds, for the "your tables" picker. */
export function loadSeats(): Seat[] {
  return readBook().seats;
}

/** The table this browser is currently sitting at, if any. */
export function loadActiveSeat(): Seat | null {
  const book = readBook();
  return book.seats.find((s) => s.campaignId === book.activeId) ?? null;
}

/** Add or replace a seat (by campaign) and make it the active table. */
export function saveSeat(seat: Seat): void {
  const book = readBook();
  const others = book.seats.filter((s) => s.campaignId !== seat.campaignId);
  // preserve a previously cached label if this write didn't carry one
  const prior = book.seats.find((s) => s.campaignId === seat.campaignId);
  const merged: Seat = { ...seat, label: seat.label ?? prior?.label };
  writeBook({ activeId: seat.campaignId, seats: [merged, ...others] });
}

/** Switch which table is active without minting anything. */
export function setActiveCampaign(campaignId: string): void {
  const book = readBook();
  if (book.seats.some((s) => s.campaignId === campaignId)) writeBook({ ...book, activeId: campaignId });
}

/** Cache the campaign's display name on its seat once the app has loaded it. */
export function rememberSeatLabel(campaignId: string, label: string): void {
  const book = readBook();
  const seat = book.seats.find((s) => s.campaignId === campaignId);
  if (seat && seat.label !== label) {
    seat.label = label;
    writeBook(book);
  }
}

/** Note which Google address a seat is backed up to (display only). */
export function rememberSeatGoogle(campaignId: string, email: string): void {
  const book = readBook();
  const seat = book.seats.find((s) => s.campaignId === campaignId);
  if (seat && seat.google !== email) {
    seat.google = email;
    writeBook(book);
  }
}

/** Give up a chair. If it was the active one, the front door decides what's next. */
export function removeSeat(campaignId: string): void {
  const book = readBook();
  const seats = book.seats.filter((s) => s.campaignId !== campaignId);
  const activeId = book.activeId === campaignId ? null : book.activeId;
  writeBook({ activeId, seats });
}

// --- reclaim links: a self-contained seat, carried in a URL fragment ---
// A reclaim URL hands someone a fresh chair for an existing member (a lost
// device, a second device, the owner switching phones). Everything the app
// needs to sit down — campaign, member, token — travels in the fragment, so
// no server round trip resolves it, and the fragment keeps the token out of
// server access logs (unlike a query string).

const SEAT_HASH = '#seat=';

export function encodeSeatLink(seat: Seat, origin: string): string {
  const payload = btoa(JSON.stringify(seat));
  return `${origin}/${SEAT_HASH}${encodeURIComponent(payload)}`;
}

/** Pull a seat out of `location.hash`, or null if there isn't one. */
export function parseSeatLink(hash: string): Seat | null {
  if (!hash.startsWith(SEAT_HASH)) return null;
  try {
    const seat = JSON.parse(atob(decodeURIComponent(hash.slice(SEAT_HASH.length)))) as Seat;
    return isSeat(seat) ? seat : null;
  } catch {
    return null;
  }
}

// --- the Google recovery thread's client half ---
// The OAuth callback lands the SPA on /#gauth=<handle> — a short-lived,
// single-purpose session id (no campaign authority of its own). What the
// sign-in was *for* (backing up the active seat vs recovering tables) is
// remembered in sessionStorage across the redirect round trip.

const GAUTH_HASH = '#gauth=';
const GOOGLE_MODE_KEY = 'hearsay-google-mode';

export type GoogleMode = 'link' | 'recover';

/** Pull the auth-session handle out of `location.hash`, if the callback sent one. */
export function parseGauth(hash: string): string | null {
  return hash.startsWith(GAUTH_HASH) ? decodeURIComponent(hash.slice(GAUTH_HASH.length)) : null;
}

/** Remember why we're leaving for Google, then go. */
export function startGoogleFlow(mode: GoogleMode): void {
  sessionStorage.setItem(GOOGLE_MODE_KEY, mode);
  location.href = '/api/auth/google';
}

/** Read-and-clear the remembered mode once the callback brings us home. */
export function takeGoogleMode(): GoogleMode | null {
  const mode = sessionStorage.getItem(GOOGLE_MODE_KEY);
  sessionStorage.removeItem(GOOGLE_MODE_KEY);
  return mode === 'link' || mode === 'recover' ? mode : null;
}
