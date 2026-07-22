// The remote store: cached CampaignData from the API plus async mutations
// that apply the server's returned record locally, so the UI answers at
// hand-speed while the server stays authoritative. This replaced the
// localStorage Store when the app got real seats (roadmap step 3); the
// freshness discipline (focus refetch, polling) layers on in step 4.

import * as api from './api';
import type { Bounty, CampaignData, Member, Pin, SiteEvent, Testimony } from './model';
import { canEditTestimony } from './mutations';
import type { Seat } from './seat';

/**
 * How long the server's storage may take to show a fresh write in an
 * assembled campaign (Cloudflare KV's list is eventually consistent, up to
 * ~a minute). A refetched snapshot younger than this can honestly be missing
 * records this seat just wrote — so we hold on to them until the lag passes.
 */
const STORE_LAG_MS = 90_000;

export class ApiStore {
  data: CampaignData;
  readonly seat: Seat;
  private listeners = new Set<() => void>();
  /** Bumped when a mutation's response applies — stale refreshes check it. */
  private writeStamp = 0;
  /**
   * This seat's own recent writes, keyed kind:id — patched back into any
   * refetched snapshot that is missing them (see STORE_LAG_MS). One entry
   * per record, newest wins; entries expire once the lag window passes.
   */
  private recentWrites = new Map<string, { at: number; patch: (data: CampaignData) => void }>();

  private constructor(seat: Seat, data: CampaignData) {
    this.seat = seat;
    this.data = data;
  }

  static async boot(seat: Seat): Promise<ApiStore> {
    return new ApiStore(seat, await api.fetchCampaign(seat));
  }

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  private notify(): void {
    this.writeStamp++;
    for (const fn of this.listeners) fn();
  }

  /** The seat's own member record, as the server last told it. */
  get me(): Member | undefined {
    return this.data.members.find((m) => m.id === this.seat.memberId);
  }

  /**
   * Refetch from the server (freshness discipline, roadmap step 4). Quiet
   * when nothing changed — no notify, no re-render, no disturbing whatever
   * the player is typing. A refresh that raced a local write is discarded:
   * the fetched snapshot predates the write, and the next poll catches up.
   */
  async refresh(): Promise<void> {
    const stamp = this.writeStamp;
    const fresh = await api.fetchCampaign(this.seat);
    if (this.writeStamp !== stamp) return;
    // a snapshot may lag this seat's own writes (server storage is
    // eventually consistent) — patch them back in before comparing, so a
    // laggy refetch can never make a just-placed pin vanish
    const now = Date.now();
    for (const [key, w] of this.recentWrites) {
      if (now - w.at > STORE_LAG_MS) this.recentWrites.delete(key);
      else w.patch(fresh);
    }
    if (JSON.stringify(fresh) === JSON.stringify(this.data)) return;
    this.data = fresh;
    this.notify();
  }

  /** Remember an own-write so laggy refetches can't un-happen it. */
  private noteWrite(key: string, patch: (data: CampaignData) => void): void {
    this.recentWrites.set(key, { at: Date.now(), patch });
  }

  /**
   * Replace-or-insert. Safe as a ledger patch because every ledgered record
   * has one writer — pins/events are owner-authored, testimony is
   * author-only — so this seat's copy is by definition the newest.
   */
  private static upsert<T extends { id: string }>(list: T[], record: T): void {
    const i = list.findIndex((r) => r.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
  }

  canEdit(t: Testimony): boolean {
    return canEditTestimony(this.data, t);
  }

  async addPin(x: number, y: number, name: string): Promise<Pin> {
    const pin = await api.postPin(this.seat, x, y, name);
    this.data.pins.push(pin);
    this.noteWrite(`p:${pin.id}`, (d) => ApiStore.upsert(d.pins, pin));
    this.notify();
    return pin;
  }

  private replacePin(pin: Pin): void {
    ApiStore.upsert(this.data.pins, pin);
    this.noteWrite(`p:${pin.id}`, (d) => ApiStore.upsert(d.pins, pin));
  }

  /** Stage or unstage an event-less pin (owner) — the secret layer's toggle. */
  async setPinHidden(pinId: string, hidden: boolean): Promise<Pin> {
    const pin = await api.postPinHidden(this.seat, pinId, hidden);
    this.replacePin(pin);
    this.notify();
    return pin;
  }

  /** Reveal a staged pin to the table — the reveal is itself a timeline event. */
  async revealPin(pinId: string, canonLine: string, atmosphere?: string): Promise<Pin> {
    const { pin, event } = await api.postPinReveal(this.seat, pinId, canonLine, atmosphere);
    this.replacePin(pin);
    this.data.events.push(event);
    this.noteWrite(`e:${event.id}`, (d) => ApiStore.upsert(d.events, event));
    this.notify();
    return pin;
  }

  async addEvent(pinId: string, canonLine: string, atmosphere?: string, participantIds?: string[]): Promise<SiteEvent> {
    const event = await api.postEvent(this.seat, pinId, canonLine, atmosphere, participantIds);
    this.data.events.push(event);
    this.noteWrite(`e:${event.id}`, (d) => ApiStore.upsert(d.events, event));
    this.notify();
    return event;
  }

  async advanceSession(): Promise<number> {
    const currentSession = await api.postSession(this.seat);
    this.data.campaign.currentSession = currentSession;
    // the clock only runs forward: a laggy snapshot can't wind it back
    this.noteWrite('session', (d) => {
      d.campaign.currentSession = Math.max(d.campaign.currentSession, currentSession);
    });
    this.notify();
    return currentSession;
  }

  private upsertTestimony(entry: Testimony): void {
    ApiStore.upsert(this.data.testimony, entry);
    this.noteWrite(`t:${entry.id}`, (d) => ApiStore.upsert(d.testimony, entry));
    this.notify();
  }

  /** Write or amend your slot — who is writing comes from the seat's token. */
  async writeTestimony(eventId: string, text: string): Promise<Testimony> {
    const entry = await api.postTestimony(this.seat, eventId, text);
    this.upsertTestimony(entry);
    return entry;
  }

  async promoteMark(testimonyId: string, text: string): Promise<Testimony> {
    const entry = await api.postMark(this.seat, testimonyId, text);
    this.upsertTestimony(entry);
    return entry;
  }

  // --- the bounty board (member posts; owner nails, refuses, strikes) ---

  private upsertBounty(bounty: Bounty): void {
    ApiStore.upsert(this.data.bounties, bounty);
    this.noteWrite(`b:${bounty.id}`, (d) => ApiStore.upsert(d.bounties, bounty));
    this.notify();
  }

  async addBounty(target: string, reason: string): Promise<Bounty> {
    const bounty = await api.postBounty(this.seat, target, reason);
    this.upsertBounty(bounty);
    return bounty;
  }

  async approveBounty(bountyId: string): Promise<Bounty> {
    const bounty = await api.postBountyAction(this.seat, bountyId, 'approve');
    this.upsertBounty(bounty);
    return bounty;
  }

  /** Refused paper leaves no record — the deletion cascades, so refetch. */
  async declineBounty(bountyId: string): Promise<void> {
    await api.postBountyAction(this.seat, bountyId, 'decline');
    this.data.bounties = this.data.bounties.filter((b) => b.id !== bountyId);
    // a laggy snapshot must not resurrect refused paper
    this.noteWrite(`b:${bountyId}`, (d) => {
      d.bounties = d.bounties.filter((b) => b.id !== bountyId);
    });
    this.notify();
  }

  async strikeBounty(bountyId: string): Promise<Bounty> {
    const bounty = await api.postBountyAction(this.seat, bountyId, 'strike');
    this.upsertBounty(bounty);
    return bounty;
  }

  // --- membership acts (owner) — decline cascades, so refetch wholesale ---

  async approveMember(memberId: string): Promise<void> {
    await api.postMemberAction(this.seat, memberId, 'approve');
    await this.refresh();
  }

  async declineMember(memberId: string): Promise<void> {
    await api.postMemberAction(this.seat, memberId, 'decline');
    await this.refresh();
  }

  /**
   * Mint a reclaim seat for an existing member (owner act) — a fresh token
   * for the same identity, carried to a new device. Additive: the old token
   * keeps working, matching "recoverable by re-invite".
   */
  async mintReclaim(memberId: string): Promise<Seat> {
    const seat = await api.postReclaim(this.seat, memberId);
    return { ...seat, label: this.data.campaign.name };
  }

  async rotateCode(): Promise<void> {
    const joinCode = await api.postRotateCode(this.seat);
    this.data.campaign.joinCode = joinCode;
    this.notify();
  }
}
