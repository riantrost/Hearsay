// Pure derivations over CampaignData, filtered to a viewed session (the
// scrubber's clock). No DOM here — the map renderer and the pin panel both
// read these, and the tests pin them directly.

import type { CampaignData, Pin, Testimony } from './model';
import { eventParticipants } from './mutations';

export function visiblePins(data: CampaignData, session: number): Pin[] {
  return data.pins.filter((p) => {
    const revealed = !p.hidden && (p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session);
    const hasEvents = data.events.some((e) => e.pinId === p.id && e.session <= session);
    return revealed && hasEvents;
  });
}

/**
 * Staged pins — the owner's secret layer. Players never receive them (the
 * server strips them from the payload); for the owner they render veiled,
 * at the present only, alongside the ghosts.
 */
export function stagedPins(data: CampaignData): Pin[] {
  return data.pins.filter((p) => p.hidden === true);
}

/**
 * A site's heartbeat at the viewed session: how recently something happened
 * here, and whose voices are still missing from it. This is what makes a pin
 * read as alive at a glance — recency and open testimony slots derive from
 * the session stamps, no schema of their own (V1 requirement 1). Computed
 * against the *viewed* session, so scrubbing back replays the illumination:
 * the map as of session 2 glows where session 2 was happening.
 */
export interface PinPulse {
  /** Session of the site's latest event at the viewed session. */
  latestSession: number;
  /** Sessions since something happened here: 0 = happening now. */
  age: number;
  /** Testimony slots on the latest session's events (seat-filtered: a withheld entry reads as open). */
  filled: number;
  total: number;
}

export function pinPulse(data: CampaignData, pinId: string, session: number): PinPulse | null {
  const events = data.events.filter((e) => e.pinId === pinId && e.session <= session);
  if (events.length === 0) return null;
  const latestSession = Math.max(...events.map((e) => e.session));
  let filled = 0;
  let total = 0;
  for (const e of events) {
    if (e.session !== latestSession) continue;
    const participants = eventParticipants(data, e);
    total += participants.length;
    filled += participants.filter((id) => data.testimony.some((t) => t.eventId === e.id && t.memberId === id)).length;
  }
  return { latestSession, age: session - latestSession, filled, total };
}

/** Illumination bucket: fresh glows, warm reads normal, settled cools toward ink. */
export function pulseClass(age: number): '' | ' fresh' | ' settled' {
  if (age === 0) return ' fresh';
  return age >= 3 ? ' settled' : '';
}

/**
 * Marks found at a site at the viewed session. A mark rides its *event's*
 * session stamp (docs/decisions.md, "Marks"): testimony may arrive late —
 * late is fine, forever — but graffiti belongs to when the thing happened,
 * so the scrubber surfaces it with its event, never with its writing date.
 */
export function siteMarks(data: CampaignData, pinId: string, session: number): Testimony[] {
  const eventIds = new Set(data.events.filter((e) => e.pinId === pinId && e.session <= session).map((e) => e.id));
  return data.testimony.filter((t) => t.markText !== undefined && eventIds.has(t.eventId));
}

/**
 * Pins with no history yet. "A site with no history has no page" holds for
 * players — but the owner who just named a place must be able to reach it
 * again to give it its first event, so to them it renders as a ghost.
 */
export function ghostPins(data: CampaignData, session: number): Pin[] {
  return data.pins.filter((p) => {
    const revealed = !p.hidden && (p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session);
    const hasEvents = data.events.some((e) => e.pinId === p.id && e.session <= session);
    return revealed && !hasEvents;
  });
}
