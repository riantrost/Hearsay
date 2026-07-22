// Pure derivations over CampaignData. No DOM here — the map renderer and
// the pin panel both read these, and the tests pin them directly. There is
// no global clock: recency is measured against the campaign's own newest
// event (never wall-clock now), so an idle month freezes the map in its
// last illumination instead of dimming everything.

import type { CampaignData, Pin, Testimony } from './model';
import { eventParticipants } from './mutations';

/** One evening of play: events within this window of each other are the same burst. */
export const FRESH_WINDOW_MS = 12 * 3600_000;
/** Roughly three weekly sessions of quiet — the point where a place reads as settled. */
export const SETTLED_GAP_MS = 21 * 86400_000;

export function visiblePins(data: CampaignData): Pin[] {
  return data.pins.filter((p) => !p.hidden && data.events.some((e) => e.pinId === p.id));
}

/**
 * Staged pins — the owner's secret layer. Players never receive them (the
 * server strips them from the payload); for the owner they render veiled
 * alongside the ghosts.
 */
export function stagedPins(data: CampaignData): Pin[] {
  return data.pins.filter((p) => p.hidden === true);
}

/**
 * A site's heartbeat: how recently something happened here relative to the
 * campaign's own newest event, and whose voices are still missing. This is
 * what makes a pin read as alive at a glance — recency and open testimony
 * slots derive from the event timestamps, no schema of their own.
 */
export interface PinPulse {
  /** Timestamp of the site's latest event. */
  latestAt: number;
  /** Ms between the campaign's newest event and this site's — 0 = where it's happening. */
  gap: number;
  /** Testimony slots on the site's latest burst of events (seat-filtered: a withheld entry reads as open). */
  filled: number;
  total: number;
}

export function pinPulse(data: CampaignData, pinId: string): PinPulse | null {
  const events = data.events.filter((e) => e.pinId === pinId);
  if (events.length === 0) return null;
  const latestAt = Math.max(...events.map((e) => e.createdAt));
  const newestAnywhere = Math.max(...data.events.map((e) => e.createdAt));
  let filled = 0;
  let total = 0;
  for (const e of events) {
    // the site's latest burst: events within one evening of its newest
    if (latestAt - e.createdAt > FRESH_WINDOW_MS) continue;
    const participants = eventParticipants(data, e);
    total += participants.length;
    filled += participants.filter((id) => data.testimony.some((t) => t.eventId === e.id && t.memberId === id)).length;
  }
  return { latestAt, gap: newestAnywhere - latestAt, filled, total };
}

/** Illumination bucket: fresh glows, warm reads normal, settled cools toward ink. */
export function pulseClass(gap: number): '' | ' fresh' | ' settled' {
  if (gap <= FRESH_WINDOW_MS) return ' fresh';
  return gap >= SETTLED_GAP_MS ? ' settled' : '';
}

/**
 * Marks found at a site. A mark rides its *event* (docs/decisions.md,
 * "Marks"): testimony may arrive late — late is fine, forever — but
 * graffiti belongs to the thing that happened, never to its writing date.
 */
export function siteMarks(data: CampaignData, pinId: string): Testimony[] {
  const eventIds = new Set(data.events.filter((e) => e.pinId === pinId).map((e) => e.id));
  return data.testimony.filter((t) => t.markText !== undefined && eventIds.has(t.eventId));
}

/**
 * Pins with no history yet. "A site with no history has no page" holds for
 * players — but the owner who just named a place must be able to reach it
 * again to give it its first event, so to them it renders as a ghost.
 */
export function ghostPins(data: CampaignData): Pin[] {
  return data.pins.filter((p) => !p.hidden && !data.events.some((e) => e.pinId === p.id));
}
