// Core data shapes — the five V1 entities (docs/HANDOFF.md, simplified
// 2026-07-17): a Pin is a place; SiteEvents accumulate at it. A mark is a
// highlight on testimony (`markText`), not a content type; site canon is
// settled but deferred out of V1 build scope. Everything below Campaign
// carries a session stamp — that column is the scrubber.

export interface Campaign {
  id: string;
  name: string;
  mapImageUrl: string;
  /** Natural size of the map image; pins live in [0,1] normalized coords. */
  mapW: number;
  mapH: number;
  currentSession: number;
  /** Shareable code that admits a joiner as a pending member. */
  joinCode: string;
}

export interface Member {
  id: string;
  campaignId: string;
  name: string;
  role: 'owner' | 'player';
  /**
   * Membership follows the proposal pattern (docs/decisions.md): a joiner is
   * pending — they can write immediately, but their posts are visible only to
   * themselves and the owner until approval makes them active.
   */
  status: 'active' | 'pending';
}

export interface Pin {
  id: string;
  campaignId: string;
  /** Normalized [0,1] position on the map image. */
  x: number;
  y: number;
  name: string;
  /**
   * Staged: the pin (and any events prepped on it) exists only for the owner
   * — it doesn't exist on players' maps, nor in their payloads. The way out
   * is a reveal, which is itself a timeline event (docs/decisions.md, fog).
   */
  hidden?: boolean;
  /** Session the pin was revealed — the scrubber's record; undefined = visible from the start. */
  hiddenUntilSession?: number;
}

/** Named SiteEvent to stay clear of the DOM's Event. */
export interface SiteEvent {
  id: string;
  pinId: string;
  session: number;
  canonLine: string;
  participantIds: string[];
}

export interface Testimony {
  id: string;
  eventId: string;
  memberId: string;
  session: number;
  text: string;
  /** One line promoted to graffiti on the pin — a highlight, not a content type. */
  markText?: string;
}

export const MARK_MAX_CHARS = 100;
export const MAX_TESTIMONY_CHARS = 5000;

export interface CampaignData {
  campaign: Campaign;
  members: Member[];
  pins: Pin[];
  events: SiteEvent[];
  testimony: Testimony[];
}
