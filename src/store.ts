// Mutations over CampaignData — the write path. This is where the settled
// forks become enforcement: testimony closes on the table's clock (editable
// until the next session's first event lands), marks are brevity-capped and
// immutable, site canon is append-only. localStorage stands in for the
// eventual backend; the mutation surface is what will become the API.

import type { CampaignData, Mark, Pin, SiteCanon, SiteEvent, Testimony } from './model';
import { MARK_MAX_CHARS } from './model';

const KEY = 'hearsay-data-v1';

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

let nextId = Date.now();
function id(prefix: string): string {
  return `${prefix}${(nextId++).toString(36)}`;
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

  // --- canon layer (owner acts) ---

  addPin(x: number, y: number, name: string): Pin {
    const pin: Pin = { id: id('p'), x, y, name: name.trim() };
    this.data.pins.push(pin);
    this.commit();
    return pin;
  }

  addEvent(pinId: string, canonLine: string, participantIds?: string[]): SiteEvent {
    const event: SiteEvent = {
      id: id('e'),
      pinId,
      session: this.data.campaign.currentSession,
      canonLine: canonLine.trim(),
      // everyone at the table by default; the owner may also play
      participantIds: participantIds ?? this.data.members.map((m) => m.id),
    };
    this.data.events.push(event);
    this.commit();
    return event;
  }

  addSiteCanon(pinId: string, line: string): SiteCanon {
    const canon: SiteCanon = { id: id('sc'), pinId, session: this.data.campaign.currentSession, line: line.trim() };
    this.data.siteCanon.push(canon);
    this.commit();
    return canon;
  }

  advanceSession(): number {
    this.data.campaign.currentSession += 1;
    this.commit();
    return this.data.campaign.currentSession;
  }

  // --- testimony layer (player acts) ---

  /**
   * Testimony closes on the table's clock (docs/decisions.md): an entry is
   * editable until the next session's first event lands on the campaign —
   * i.e. while no event exists with a session later than the entry's stamp.
   */
  canEdit(t: Testimony): boolean {
    return !this.data.events.some((e) => e.session > t.session);
  }

  /**
   * Write or amend a slot. The entry is stamped with the session it was
   * written in (not the event's session) — a slot filled late shows up
   * late in the scrub, which is honest, and the stamp is what the grace
   * window closes against.
   */
  writeTestimony(eventId: string, memberId: string, text: string): Testimony {
    const existing = this.data.testimony.find((t) => t.eventId === eventId && t.memberId === memberId);
    if (existing) {
      if (!this.canEdit(existing)) throw new Error('testimony is closed: the table has moved on');
      existing.text = text;
      this.commit();
      return existing;
    }
    const event = this.data.events.find((e) => e.id === eventId);
    if (!event) throw new Error('no such event');
    if (!event.participantIds.includes(memberId)) throw new Error('not a participant in this event');
    const entry: Testimony = {
      id: id('t'),
      eventId,
      memberId,
      session: this.data.campaign.currentSession,
      text,
    };
    this.data.testimony.push(entry);
    this.commit();
    return entry;
  }

  /** Promote one line of your own testimony to a mark on the pin. */
  promoteMark(testimonyId: string, memberId: string, text: string): Mark {
    const t = this.data.testimony.find((x) => x.id === testimonyId);
    if (!t) throw new Error('no such testimony');
    if (t.memberId !== memberId) throw new Error('only the author can leave a mark');
    if (this.data.marks.some((m) => m.testimonyId === testimonyId)) {
      throw new Error('a mark is already scrawled from this entry');
    }
    const line = text.trim();
    if (!line) throw new Error('a mark needs words');
    if (line.length > MARK_MAX_CHARS) throw new Error(`a mark is graffiti, not a plaque: ${MARK_MAX_CHARS} characters at most`);
    const event = this.data.events.find((e) => e.id === t.eventId)!;
    const mark: Mark = { id: id('k'), testimonyId, pinId: event.pinId, session: t.session, text: line };
    this.data.marks.push(mark);
    this.commit();
    return mark;
  }
}
