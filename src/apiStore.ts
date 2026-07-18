// The remote store: cached CampaignData from the API plus async mutations
// that apply the server's returned record locally, so the UI answers at
// hand-speed while the server stays authoritative. This replaced the
// localStorage Store when the app got real seats (roadmap step 3); the
// freshness discipline (focus refetch, polling) layers on in step 4.

import * as api from './api';
import type { CampaignData, Member, Pin, SiteEvent, Testimony } from './model';
import { canEditTestimony } from './mutations';
import type { Seat } from './seat';

export class ApiStore {
  data: CampaignData;
  readonly seat: Seat;
  private listeners = new Set<() => void>();
  /** Bumped when a mutation's response applies — stale refreshes check it. */
  private writeStamp = 0;

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
    if (JSON.stringify(fresh) === JSON.stringify(this.data)) return;
    this.data = fresh;
    this.notify();
  }

  canEdit(t: Testimony): boolean {
    return canEditTestimony(this.data, t);
  }

  async addPin(x: number, y: number, name: string): Promise<Pin> {
    const pin = await api.postPin(this.seat, x, y, name);
    this.data.pins.push(pin);
    this.notify();
    return pin;
  }

  async addEvent(pinId: string, canonLine: string): Promise<SiteEvent> {
    const event = await api.postEvent(this.seat, pinId, canonLine);
    this.data.events.push(event);
    this.notify();
    return event;
  }

  async advanceSession(): Promise<number> {
    const currentSession = await api.postSession(this.seat);
    this.data.campaign.currentSession = currentSession;
    this.notify();
    return currentSession;
  }

  private upsertTestimony(entry: Testimony): void {
    const i = this.data.testimony.findIndex((t) => t.id === entry.id);
    if (i >= 0) this.data.testimony[i] = entry;
    else this.data.testimony.push(entry);
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

  // --- membership acts (owner) — decline cascades, so refetch wholesale ---

  async approveMember(memberId: string): Promise<void> {
    await api.postMemberAction(this.seat, memberId, 'approve');
    await this.refresh();
  }

  async declineMember(memberId: string): Promise<void> {
    await api.postMemberAction(this.seat, memberId, 'decline');
    await this.refresh();
  }

  async rotateCode(): Promise<void> {
    const joinCode = await api.postRotateCode(this.seat);
    this.data.campaign.joinCode = joinCode;
    this.notify();
  }
}
