// The remote store: cached CampaignData from the API plus async mutations
// that apply the server's returned record locally, so the UI answers at
// hand-speed while the server stays authoritative. Since the KV→D1
// migration the server reads its own writes — the eventual-consistency
// write ledger this store used to carry is gone. What remains is the plain
// HTTP race guard: a refresh whose fetch *started* before a local write
// landed is a snapshot of the past, and it loses (writeStamp).
//
// `data` is a signal: Preact components that read `store.data` re-render
// exactly when a mutation or a loud refresh lands, and an untouched
// <textarea> mid-type is never rebuilt under the writer's hands.

import { signal, type Signal } from '@preact/signals';
import * as api from './api';
import type { Bounty, CampaignData, Member, Pin, SiteEvent, Testimony } from './model';
import { canEditTestimony } from './mutations';
import type { Seat } from './seat';

export class ApiStore {
  readonly $data: Signal<CampaignData>;
  readonly seat: Seat;
  /** Old-UI subscription shim — retires with the imperative renderer (Stage 4). */
  private listeners = new Set<() => void>();
  /** Bumped when a mutation's response applies — stale refreshes check it. */
  private writeStamp = 0;

  private constructor(seat: Seat, data: CampaignData) {
    this.seat = seat;
    this.$data = signal(data);
  }

  static async boot(seat: Seat): Promise<ApiStore> {
    return new ApiStore(seat, await api.fetchCampaign(seat));
  }

  /** Reading inside a component subscribes it; mutations go through methods. */
  get data(): CampaignData {
    return this.$data.value;
  }

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  private notify(): void {
    this.writeStamp++;
    // in-place entity edits ride out on a fresh top-level identity
    this.$data.value = { ...this.$data.peek() };
    for (const fn of this.listeners) fn();
  }

  /** The seat's own member record, as the server last told it. */
  get me(): Member | undefined {
    return this.data.members.find((m) => m.id === this.seat.memberId);
  }

  /**
   * Refetch from the server (freshness discipline). Quiet when nothing
   * changed — no signal write, no re-render, no disturbing whatever the
   * player is typing. A refresh that raced a local write is discarded: the
   * fetched snapshot predates the write, and the next poll catches up.
   */
  async refresh(): Promise<void> {
    const stamp = this.writeStamp;
    const fresh = await api.fetchCampaign(this.seat);
    if (this.writeStamp !== stamp) return;
    if (JSON.stringify(fresh) === JSON.stringify(this.$data.peek())) return;
    this.writeStamp++;
    this.$data.value = fresh;
    for (const fn of this.listeners) fn();
  }

  /** Replace-or-insert the server's returned record — it is the newest copy. */
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
    this.$data.peek().pins.push(pin);
    this.notify();
    return pin;
  }

  /** Stage or unstage an event-less pin (owner) — the secret layer's toggle. */
  async setPinHidden(pinId: string, hidden: boolean): Promise<Pin> {
    const pin = await api.postPinHidden(this.seat, pinId, hidden);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.notify();
    return pin;
  }

  /** Reveal a staged pin to the table — the reveal is itself a timeline event. */
  async revealPin(pinId: string, canonLine: string, atmosphere?: string): Promise<Pin> {
    const { pin, event } = await api.postPinReveal(this.seat, pinId, canonLine, atmosphere);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.$data.peek().events.push(event);
    this.notify();
    return pin;
  }

  async addEvent(pinId: string, canonLine: string, atmosphere?: string, participantIds?: string[]): Promise<SiteEvent> {
    const event = await api.postEvent(this.seat, pinId, canonLine, atmosphere, participantIds);
    this.$data.peek().events.push(event);
    this.notify();
    return event;
  }

  /** Reposition a misplaced pin (owner). */
  async movePin(pinId: string, x: number, y: number): Promise<Pin> {
    const pin = await api.postPinMove(this.seat, pinId, x, y);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.notify();
    return pin;
  }

  /** Set or clear the standing description of a place (owner). */
  async describePin(pinId: string, description: string): Promise<Pin> {
    const pin = await api.postPinDescribe(this.seat, pinId, description);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.notify();
    return pin;
  }

  async renamePin(pinId: string, name: string): Promise<Pin> {
    const pin = await api.postPinRename(this.seat, pinId, name);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.notify();
    return pin;
  }

  /** Seal or unseal a place against player input (owner). */
  async setPinSealed(pinId: string, sealed: boolean): Promise<Pin> {
    const pin = await api.postPinSealed(this.seat, pinId, sealed);
    ApiStore.upsert(this.$data.peek().pins, pin);
    this.notify();
    return pin;
  }

  private upsertTestimony(entry: Testimony): void {
    ApiStore.upsert(this.$data.peek().testimony, entry);
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
    ApiStore.upsert(this.$data.peek().bounties, bounty);
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

  /** Refused paper leaves no record. */
  async declineBounty(bountyId: string): Promise<void> {
    await api.postBountyAction(this.seat, bountyId, 'decline');
    const d = this.$data.peek();
    d.bounties = d.bounties.filter((b) => b.id !== bountyId);
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
    this.$data.peek().campaign.joinCode = joinCode;
    this.notify();
  }
}
