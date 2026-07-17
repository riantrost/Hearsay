// The client Store: a thin stateful wrapper over the pure mutation layer
// (src/mutations.ts) — the rules live there, shared with the server, so the
// two sides can never drift. localStorage stands in for the eventual
// backend; the mutation surface is what the API mirrors.

import type { CampaignData, Pin, SiteEvent, Testimony } from './model';
import * as mut from './mutations';

export { testimonyVisibleTo } from './mutations';

const KEY = 'hearsay-data-v2';

function persist(data: CampaignData): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

function restore(): CampaignData | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as CampaignData) : null;
}

export class Store {
  data: CampaignData;
  private listeners = new Set<() => void>();

  constructor(seed: CampaignData) {
    this.data = restore() ?? structuredClone(seed);
  }

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  private commit(): void {
    persist(this.data);
    for (const fn of this.listeners) fn();
  }

  /** Reset to seed — dev convenience, exposed as window.hearsayReset(). */
  reset(seed: CampaignData): void {
    this.data = structuredClone(seed);
    this.commit();
  }

  canEdit(t: Testimony): boolean {
    return mut.canEditTestimony(this.data, t);
  }

  /** The pending-visibility rule, on the store's data. */
  canSee(t: Testimony, viewerId: string): boolean {
    return mut.testimonyVisibleTo(this.data, t, viewerId);
  }

  addPin(x: number, y: number, name: string): Pin {
    const pin = mut.addPin(this.data, x, y, name);
    this.commit();
    return pin;
  }

  addEvent(pinId: string, canonLine: string, participantIds?: string[]): SiteEvent {
    const event = mut.addEvent(this.data, pinId, canonLine, participantIds);
    this.commit();
    return event;
  }

  advanceSession(): number {
    const session = mut.advanceSession(this.data);
    this.commit();
    return session;
  }

  writeTestimony(eventId: string, memberId: string, text: string): Testimony {
    const entry = mut.writeTestimony(this.data, eventId, memberId, text);
    this.commit();
    return entry;
  }

  promoteMark(testimonyId: string, memberId: string, text: string): Testimony {
    const t = mut.promoteMark(this.data, testimonyId, memberId, text);
    this.commit();
    return t;
  }
}
