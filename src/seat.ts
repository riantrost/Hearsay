// Your seat at a table: campaign + member + bearer token, minted at create
// or join and held in localStorage. Identity is table-cheap by design — no
// accounts, no passwords; a lost seat is recoverable by re-invite.

export interface Seat {
  campaignId: string;
  memberId: string;
  token: string;
}

const KEY = 'hearsay-seat';

export function loadSeat(): Seat | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const seat = JSON.parse(raw) as Seat;
    return seat.campaignId && seat.memberId && seat.token ? seat : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: Seat): void {
  localStorage.setItem(KEY, JSON.stringify(seat));
}

export function clearSeat(): void {
  localStorage.removeItem(KEY);
}
